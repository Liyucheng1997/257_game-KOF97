// input.js —— 键盘/手柄采样、输入缓冲区、必杀技指令识别
// 采用格斗游戏通用的「小键盘记法」：
//   7 8 9        向右站立时： 6=前  4=后  2=下  8=上
//   4 5 6
//   1 2 3

export const BTN = { A: 1, B: 2, C: 4, D: 8 };   // A轻拳 B轻脚 C重拳 D重脚

const KEYMAP = [
  { // 1P
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    A: 'KeyJ', B: 'KeyK', C: 'KeyU', D: 'KeyI',
  },
  { // 2P
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    A: 'Numpad1', B: 'Numpad2', C: 'Numpad4', D: 'Numpad5',
  },
];

const held = new Set();
const edgeKeys = new Set();     // 本帧刚按下的键（供菜单使用）

window.addEventListener('keydown', e => {
  if (!held.has(e.code)) edgeKeys.add(e.code);
  held.add(e.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','F1','F2','F5'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup',   e => held.delete(e.code));
window.addEventListener('blur',    () => held.clear());

export function keyPressed(code) { return edgeKeys.has(code); }
export function keyHeld(code)    { return held.has(code); }
export function endFrameGlobal() { edgeKeys.clear(); }

const HIST_LEN = 90;
const EDGE_DELAY = 2;    // 组合键确认延迟（帧）
const EDGE_BUF   = 8;    // 输入缓冲长度（帧）

export class Pad {
  constructor(index) {
    this.index = index;
    this.map = KEYMAP[index];
    this.hist = [];            // [{d, b, press, release}] 逐帧记录
    this.dir = 5;
    this.btn = 0;
    this.press = 0;
    this.release = 0;
    this.consumed = 0;         // 本帧已被消费的指令标记，防止一次输入触发两招
    this.frozen = false;       // 角色处于顿帧/定格中
    this.tick = 0;             // 可行动帧计数（顿帧不推进）
    this.gamepadIdx = index;
    this.aiControlled = false;
    this.aiDir = 5;
    this.aiBtn = 0;
  }

  // facing: 角色朝向 (+1 右 / -1 左)，用于把物理左右换算成前后
  sample(facing) {
    let rawX = 0, rawY = 0, b = 0;

    if (this.aiControlled) {
      // AI 直接给出「面向坐标系」的方向，无需换算
      const d = this.aiDir;
      const col = (d - 1) % 3 - 1;      // -1,0,1
      const row = Math.floor((d - 1) / 3) - 1;
      rawX = col * facing;              // 反向换算回物理方向
      rawY = row;
      b = this.aiBtn;
    } else {
      const m = this.map;
      if (held.has(m.left))  rawX -= 1;
      if (held.has(m.right)) rawX += 1;
      if (held.has(m.up))    rawY += 1;
      if (held.has(m.down))  rawY -= 1;
      if (held.has(m.A)) b |= BTN.A;
      if (held.has(m.B)) b |= BTN.B;
      if (held.has(m.C)) b |= BTN.C;
      if (held.has(m.D)) b |= BTN.D;
      // 手柄叠加
      const gp = navigator.getGamepads ? navigator.getGamepads()[this.gamepadIdx] : null;
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (ax < -.45 || gp.buttons[14]?.pressed) rawX -= 1;
        if (ax >  .45 || gp.buttons[15]?.pressed) rawX += 1;
        if (ay < -.45 || gp.buttons[12]?.pressed) rawY += 1;
        if (ay >  .45 || gp.buttons[13]?.pressed) rawY -= 1;
        if (gp.buttons[2]?.pressed) b |= BTN.A;   // X
        if (gp.buttons[0]?.pressed) b |= BTN.B;   // A
        if (gp.buttons[3]?.pressed) b |= BTN.C;   // Y
        if (gp.buttons[1]?.pressed) b |= BTN.D;   // B
        if (gp.buttons[4]?.pressed) b |= (BTN.A | BTN.B);
        if (gp.buttons[5]?.pressed) b |= (BTN.C | BTN.D);
      }
    }

    // 物理方向 -> 面向方向
    const fx = Math.sign(rawX) * facing;
    const fy = Math.sign(rawY);
    const d = 5 + fx + fy * 3;   // 5 中立, 6 前, 4 后, 8 上, 2 下 ...

    this.press   = b & ~this.btn;
    this.release = this.btn & ~b;
    this.btn = b;
    this.dir = d;

    // 输入缓冲以「可行动帧」计时：顿帧 / 超必定格不消耗缓冲，
    // 所以「打中的瞬间按取消」不会因为顿帧过长而失效。
    if (!this.frozen) this.tick++;
    this.hist.push({ d, b, press: this.press, release: this.release, t: this.tick });
    if (this.hist.length > HIST_LEN) this.hist.shift();
    this.consumed = 0;
  }

  // ——— 基础查询 ———
  down(mask)     { return (this.btn & mask) === mask; }
  pressed(mask)  { return (this.press & mask) !== 0 && (this.btn & mask) === mask; }

  // 单键按下沿查询，用于所有出招判定：
  //   delay —— 确认延迟帧。按下后先等几帧，若期间凑齐了 group 组合键，就把这次输入让给组合技
  //            （否则「A+B 翻滚」永远会先蹦出一记轻脚）
  //   buf   —— 输入缓冲帧数。顿帧 / 硬直期间按下的键不会被丢掉，硬直一结束立刻生效
  edge(mask, group = 0, delay = EDGE_DELAY, buf = EDGE_BUF) {
    const h = this.hist, n = h.length;
    for (let i = n - 1; i >= 0; i--) {
      const age = this.tick - h[i].t;
      if (age > buf) break;
      if (age < delay) continue;
      if (!(h[i].press & mask)) continue;
      if (group) {   // 按下后的 delay 帧内若凑齐组合键，就把输入让给组合技
        let acc = 0;
        for (let j = i; j < n && h[j].t <= h[i].t + delay; j++) acc |= h[j].b;
        if ((acc & group) === group) return false;
      }
      return true;
    }
    return false;
  }

  // 招式已经吃掉这次输入，清掉缓冲，避免同一次按键连续触发两招
  consumeEdges() { for (const e of this.hist) e.press = 0; }
  // 同时按下（容错 3 帧）：用于 AB 翻滚 / CD 吹飞 / ABC 爆气
  multiPressed(mask, lenience = 3) {
    if ((this.btn & mask) !== mask) return false;
    for (let i = 0; i < lenience && i < this.hist.length; i++) {
      const h = this.hist[this.hist.length - 1 - i];
      if (h.press & mask) {
        // 检查这几帧内所有需要的键都到齐了
        let acc = 0;
        for (let j = 0; j <= i; j++) acc |= this.hist[this.hist.length - 1 - j].b;
        if ((acc & mask) === mask) return true;
      }
    }
    return false;
  }

  // 方向连打两次（跑 / 后跃）
  // 只在「第二次按下的那一帧」成立，按住多久都不影响，符合街机手感
  doubleTap(dir, window = 17) {
    const h = this.hist, n = h.length;
    if (n < 2) return false;
    const opp = dir === 4 ? 6 : 4;
    // 只认正横向（→→ / ←←）。斜向不算，否则 214/236 这类必杀指令会误触发前冲和后跃
    if (h[n - 1].d !== dir || h[n - 2].d === dir) return false;
    let released = false;
    for (let k = 0, i = n - 2; k < window && i >= 0; k++, i--) {
      const d = h[i].d;
      if (d === dir) return released;          // 中途没回中（比如 214214 的路径）就不算连打
      if (d === 5 || d === opp) released = true;
    }
    return false;
  }

  // 指令识别 —— seq 为「每一步可接受方向的集合」，由旧到新
  matchSeq(seq, window = 22, gapBudget = 3) {
    const h = this.hist;
    let idx = seq.length - 1;
    let gaps = 0;
    let scanned = 0;
    for (let i = h.length - 1; i >= 0 && scanned <= window; i--, scanned++) {
      const d = h[i].d;
      if (seq[idx].includes(d)) {
        idx--;
        if (idx < 0) return true;
        continue;
      }
      // 仍按着刚匹配过的那一步 => 不算间隔
      if (idx + 1 < seq.length && seq[idx + 1].includes(d)) continue;
      if (++gaps > gapBudget) return false;
    }
    return false;
  }

  // 蓄力技：dir 方向按住 charge 帧以上，然后在 release 帧内到达 to 方向
  charged(fromDirs, toDirs, chargeFrames = 40, releaseWindow = 12) {
    const h = this.hist;
    let i = h.length - 1, scanned = 0;
    // 找到 to 方向
    let found = -1;
    while (i >= 0 && scanned < releaseWindow) {
      if (toDirs.includes(h[i].d)) { found = i; break; }
      i--; scanned++;
    }
    if (found < 0) return false;
    let hold = 0;
    for (let j = found - 1; j >= 0; j--) {
      if (fromDirs.includes(h[j].d)) hold++;
      else break;
    }
    return hold >= chargeFrames;
  }

  clearHist() { this.hist.length = 0; }
}

// ——— 常用指令模板（含容错分支）———
const D = {
  QCF:  [[2], [3, 2, 6], [6, 9, 3]],                 // 236
  QCB:  [[2], [1, 2, 4], [4, 7, 1]],                 // 214
  // 623 必须写严：中间那一步只认正下方 2。写宽了的话 236 的轨迹（2→3→6）也会被判成升龙
  DP:   [[6, 9], [2], [3, 6]],                       // 623
  RDP:  [[4, 7], [2], [1, 4]],                       // 421
  HCF:  [[4], [1, 2], [2], [3, 2], [6, 3]],          // 41236
  HCB:  [[6], [3, 2], [2], [1, 2], [4, 1]],          // 63214
  QCFx2:[[2], [3, 6], [2, 5, 1], [2, 3], [6, 3]],    // 236236
  QCBx2:[[2], [1, 4], [2, 5, 3], [2, 1], [4, 1]],    // 214214
  DPx2: [[6, 3], [2], [3, 6], [6, 3], [2], [3, 6]],  // 623623
  DD:   [[2], [5, 1, 3], [2]],                       // 下下
  UP:   [[8, 7, 9]],
};

export const MOTION = D;

// 根据 motion 名做匹配（带各自合适的窗口）
export function testMotion(pad, motion) {
  switch (motion) {
    case 'QCF':   return pad.matchSeq(D.QCF, 18);
    case 'QCB':   return pad.matchSeq(D.QCB, 18);
    case 'DP':    return pad.matchSeq(D.DP, 20);
    case 'RDP':   return pad.matchSeq(D.RDP, 20);
    case 'HCF':   return pad.matchSeq(D.HCF, 30, 6);
    case 'HCB':   return pad.matchSeq(D.HCB, 30, 6);
    case 'QCFx2': return pad.matchSeq(D.QCFx2, 40, 8);
    case 'QCBx2': return pad.matchSeq(D.QCBx2, 40, 8);
    case 'DPx2':  return pad.matchSeq(D.DPx2, 42, 8);
    case 'DD':    return pad.matchSeq(D.DD, 20);
    case 'NONE':  return true;
    default:      return false;
  }
}
