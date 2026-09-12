// ai.js —— CPU 对手
// 通过往 Pad 写入「面向坐标系」的方向与按键来驱动，与人类玩家走同一套指令识别。
import { BTN } from './input.js';
import { rnd, rndi, pick, clamp } from './core.js';

// 指令脚本片段：{d:方向, b:按键, f:持续帧}
const S = {
  QCBHCF: b => motionScript([2, 1, 4, 1, 2, 3, 6], b),
  QCFHCB: b => motionScript([2, 3, 6, 3, 2, 1, 4], b),
  GEYSER: b => motionScript([2, 1, 4, 1, 6], b),
  QCF: b => [{ d: 2, f: 3 }, { d: 3, f: 3 }, { d: 6, f: 2 }, { d: 6, b, f: 3 }, { d: 5, f: 2 }],
  QCB: b => [{ d: 2, f: 3 }, { d: 1, f: 3 }, { d: 4, f: 2 }, { d: 4, b, f: 3 }, { d: 5, f: 2 }],
  DP:  b => [{ d: 6, f: 3 }, { d: 2, f: 3 }, { d: 3, f: 2 }, { d: 3, b, f: 3 }, { d: 5, f: 2 }],
  RDP: b => [{ d: 4, f: 3 }, { d: 2, f: 3 }, { d: 1, f: 2 }, { d: 1, b, f: 3 }, { d: 5, f: 2 }],
  HCB: b => [{ d: 6, f: 2 }, { d: 3, f: 2 }, { d: 2, f: 2 }, { d: 1, f: 2 }, { d: 4, f: 2 }, { d: 4, b, f: 3 }, { d: 5, f: 2 }],
  QCFx2: b => [{ d: 2, f: 2 }, { d: 3, f: 2 }, { d: 6, f: 2 }, { d: 2, f: 2 }, { d: 3, f: 2 }, { d: 6, f: 2 }, { d: 6, b, f: 3 }, { d: 5, f: 2 }],
  QCBx2: b => [{ d: 2, f: 2 }, { d: 1, f: 2 }, { d: 4, f: 2 }, { d: 2, f: 2 }, { d: 1, f: 2 }, { d: 4, f: 2 }, { d: 4, b, f: 3 }, { d: 5, f: 2 }],
  press: (b, f = 3) => [{ d: 5, b, f }, { d: 5, f: 2 }],
  pressD: (d, b, f = 3) => [{ d, b, f }, { d, f: 2 }],
  hop: () => [{ d: 9, f: 2 }, { d: 5, f: 2 }],
  jump: () => [{ d: 9, f: 8 }, { d: 5, f: 2 }],
  backhop: () => [{ d: 7, f: 2 }, { d: 5, f: 2 }],
  dash: () => [{ d: 6, f: 3 }, { d: 5, f: 3 }, { d: 6, f: 14 }],
  backdash: () => [{ d: 4, f: 3 }, { d: 5, f: 3 }, { d: 4, f: 8 }],
  roll: () => [{ d: 5, b: BTN.A | BTN.B, f: 3 }, { d: 5, f: 2 }],
  burst: () => [{ d: 5, b: BTN.A | BTN.B | BTN.C, f: 4 }, { d: 5, f: 2 }],
};

function motionScript(dirs, b) {
  return [...dirs.map(d => ({ d, f: 2 })), { d: dirs.at(-1), b, f: 3 }, { d: 5, f: 2 }];
}

const LEVELS = {
  1: { react: 16, aggr: .28, spDist: 70, spRate: .010, dmRate: .006, guard: .45, aa: .30, punish: .25, tech: .15 },
  2: { react: 11, aggr: .42, spDist: 84, spRate: .020, dmRate: .014, guard: .66, aa: .50, punish: .45, tech: .3 },
  3: { react: 7,  aggr: .58, spDist: 96, spRate: .032, dmRate: .026, guard: .82, aa: .70, punish: .68, tech: .5 },
  4: { react: 4,  aggr: .74, spDist: 112, spRate: .046, dmRate: .042, guard: .92, aa: .86, punish: .85, tech: .72 },
};

export class AI {
  constructor(fighter, pad, level = 2) {
    this.f = fighter;
    this.pad = pad;
    this.pad.aiControlled = true;
    this.level = level;
    this.cfg = LEVELS[clamp(level, 1, 4)];
    this.queue = [];
    this.cur = null;
    this.wait = 0;
    this.mood = 0;          // 0 中立 1 进攻 2 防守
    this.moodTimer = 0;
    this.reactBuf = [];
  }

  setLevel(l) { this.level = l; this.cfg = LEVELS[clamp(l, 1, 4)]; }

  push(seq) { for (const s of seq) this.queue.push(s); }
  busy() { return this.queue.length > 0 || this.cur; }

  update(game) {
    const f = this.f, o = f.opp, cfg = this.cfg;
    if (!o) return;

    // —— 播放脚本 ——
    if (this.cur) {
      this.pad.aiDir = this.cur.d;
      this.pad.aiBtn = this.cur.b || 0;
      if (--this.curF <= 0) this.cur = null;
      return;
    }
    if (this.queue.length) {
      this.cur = this.queue.shift();
      this.curF = this.cur.f;
      this.pad.aiDir = this.cur.d; this.pad.aiBtn = this.cur.b || 0;
      return;
    }

    this.pad.aiBtn = 0;
    this.pad.aiDir = 5;

    if (game.phase !== 'fight') return;
    if (f.state === 'hit' || f.state === 'down' || f.state === 'thrown' || f.dizzy > 0) {
      // 倒地/受身
      if (f.state === 'hit' && f.knockedDown && f.z > 0 && f.vz < 0 && Math.random() < cfg.tech) {
        this.push(S.roll());
      }
      return;
    }
    if (f.move && f.move.type !== 'system') {
      // 出招中：尝试取消
      if (f.moveHit && f.move.cancel && f.move.cancel.length) {
        if (f.stock >= 1 && Math.random() < cfg.dmRate * 6) { this.doDM(); return; }
        if (f.move.cancel.includes('special') && Math.random() < cfg.spRate * 12) { this.doSpecial(Math.abs(o.x - f.x)); return; }
      }
      return;
    }

    if (this.moodTimer-- <= 0) {
      this.moodTimer = rndi(40, 130);
      const r = Math.random();
      this.mood = r < cfg.aggr ? 1 : (r < cfg.aggr + .28 ? 0 : 2);
    }

    const dist = Math.abs(o.x - f.x);
    const oppAttacking = o.move && o.move.hits.length > 0 &&
      o.mframe >= (o.move.startup - cfg.react) && o.mframe <= o.move.startup + o.move.active;
    const oppAir = !o.grounded && o.z > 20;

    // —— 1. 防御反应 ——
    if (oppAttacking && dist < 92 && Math.random() < cfg.guard) {
      const low = o.move.hits.some(h => h.lvl === 'low');
      this.pad.aiDir = low ? 1 : 4;
      // 高级 AI 会在防住后 GC 翻滚
      if (this.level >= 3 && f.stock >= 1 && f.state === 'blockstun' && Math.random() < .2) this.push(S.roll());
      return;
    }
    if (f.state === 'blockstun') {
      this.pad.aiDir = f.blockLow ? 1 : 4;
      return;
    }

    // —— 2. 对空 ——
    if (oppAir && dist < 76 && Math.random() < cfg.aa) {
      const sp = this.findSpecial(m => m.inv && m.inv[2] === 'full' && m.type === 'special');
      if (sp && Math.random() < .6) { this.doMotion(sp); return; }
      this.push(S.pressD(2, BTN.C, 4));   // 蹲重拳对空
      return;
    }

    // —— 3. 惩罚（对手大硬直）——
    if (o.move && o.mframe > o.move.startup + o.move.active && dist < 74 && Math.random() < cfg.punish) {
      if (f.stock >= 1 && Math.random() < cfg.dmRate * 14) { this.doDM(); return; }
      this.push(S.pressD(5, BTN.C, 3));
      return;
    }

    // —— 4. 距离决策 ——
    if (dist < 40) {
      const r = Math.random();
      if (r < .10 && this.mood === 1) { this.push(S.pressD(6, BTN.C, 3)); return; }   // 投
      if (r < .30) { this.push(S.pressD(2, BTN.B, 3)); this.push(S.pressD(2, pick([BTN.A, BTN.B]), 3)); return; }
      if (r < .48) { this.push(S.press(BTN.A, 3)); if (Math.random() < .5) this.push(S.press(BTN.B, 3)); return; }
      if (r < .58 && f.stock >= 1 && Math.random() < cfg.dmRate * 10) { this.doDM(); return; }
      if (r < .70) { this.doSpecial(dist); return; }
      if (r < .80) { this.push(S.backdash()); return; }
      this.pad.aiDir = 4;
      return;
    }

    if (dist < 88) {
      const r = Math.random();
      if (r < .22) { this.doSpecial(dist); return; }
      if (r < .40) { this.push(S.pressD(5, pick([BTN.C, BTN.D]), 3)); return; }
      if (r < .52 && this.mood === 1) { this.push(S.hop()); this.push(S.press(pick([BTN.C, BTN.D]), 4)); return; }
      if (r < .62) { this.push(S.pressD(2, BTN.D, 3)); return; }
      if (r < .74) { this.pad.aiDir = this.mood === 2 ? 4 : 6; return; }
      if (r < .80 && f.stock >= 2 && f.maxMode === 0) { this.push(S.burst()); return; }
      this.pad.aiDir = 6;
      return;
    }

    // 远距离
    const r = Math.random();
    if (r < .16) { this.doSpecial(dist); return; }
    if (r < .34 && this.mood === 1) { this.push(S.dash()); return; }
    if (r < .46 && this.mood === 1) { this.push(S.jump()); this.push(S.press(pick([BTN.C, BTN.D]), 5)); return; }
    if (r < .54 && this.mood === 2) { this.push(S.backhop()); return; }
    if (r < .90) { this.pad.aiDir = this.mood === 2 ? 5 : 6; return; }
    this.pad.aiDir = 5;
  }

  findSpecial(pred) {
    const sp = this.f.char.specials;
    const keys = Object.keys(sp).filter(k => sp[k].motion && pred(sp[k]));
    return keys.length ? sp[pick(keys)] : null;
  }

  doMotion(m) {
    const btn = m.btn === 'P' ? pick([BTN.A, BTN.C]) : pick([BTN.B, BTN.D]);
    const gen = S[m.motion];
    if (gen) this.push(gen(btn));
  }

  doSpecial(dist) {
    const sp = this.f.char.specials;
    const keys = Object.keys(sp).filter(k => {
      const m = sp[k];
      if (!m.motion || m.type === 'dm') return false;
      if (m.spawn) return dist > 60;                 // 飞行道具留给远距离
      if (m.type === 'throw') return dist < 44;
      return dist < this.cfg.spDist;
    });
    if (!keys.length) { this.pad.aiDir = 6; return; }
    this.doMotion(sp[pick(keys)]);
  }

  doDM() {
    const sp = this.f.char.specials;
    const keys = Object.keys(sp).filter(k => sp[k].type === 'dm' && sp[k].motion);
    if (!keys.length) return;
    this.doMotion(sp[pick(keys)]);
  }
}
