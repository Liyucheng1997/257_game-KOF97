// render.js —— 角色绘制（程序化骨骼渲染）+ 打击特效
// 若 assets/ 下放了贴图，assets.drawFighter 会优先接管（见 assets.js）。

import { clamp, lerp, rnd, rndi, pick } from './core.js';

// ——— 颜色工具 ———
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ——— 调色板 ———
export const PALETTES = {
  kyo: {
    skin:'#e8ab7c', skinD:'#c2825a', hair:'#221a19', coat:'#1d2952', coat2:'#131c3a', trim:'#e0342a',
    shirt:'#f2f5fb', pants:'#26304d', shoe:'#12172a', glove:'#d99d6e', aura:'#ff7a18', aura2:'#ffd24a',
  },
  kyo2: {
    skin:'#e8ab7c', skinD:'#c2825a', hair:'#3a2a1c', coat:'#57202a', coat2:'#3a1220', trim:'#f0c040',
    shirt:'#f6ead8', pants:'#43242c', shoe:'#1c1016', glove:'#d99d6e', aura:'#3fa8ff', aura2:'#bfe8ff',
  },
  iori: {
    skin:'#eec39d', skinD:'#c99a72', hair:'#b0202c', coat:'#17181f', coat2:'#0c0d12', trim:'#8f1c26',
    shirt:'#262936', pants:'#6d1424', shoe:'#0b0c11', glove:'#e0b189', aura:'#a83cff', aura2:'#f0b0ff',
  },
  iori2: {
    skin:'#eec39d', skinD:'#c99a72', hair:'#2b2b33', coat:'#232735', coat2:'#161923', shirt:'#2f3446',
    trim:'#2f8f66', pants:'#1d5040', shoe:'#0d0f16', glove:'#e0b189', aura:'#2ee08a', aura2:'#c6ffe6',
  },
  terry: {
    skin:'#eab183', skinD:'#c4885c', hair:'#e8c352', coat:'#7a1c1c', coat2:'#571212', trim:'#f2d24a',
    shirt:'#e8e2d4', pants:'#2a4a86', shoe:'#f0efe8', glove:'#e8e2d4', aura:'#ffcc33', aura2:'#fff2b0',
  },
  terry2: {
    skin:'#eab183', skinD:'#c4885c', hair:'#3c3630', coat:'#1e4a6e', coat2:'#12324c', trim:'#7fd8ff',
    shirt:'#dbe6ee', pants:'#2b2f3c', shoe:'#e2ecf2', glove:'#dbe6ee', aura:'#5ad6ff', aura2:'#d8f4ff',
  },
};

const OUT = 'rgba(10,9,16,.95)';

// ——— 绘制原语（已翻转的局部坐标系：x 前，y 上）———
function limb(ctx, a, b, w1, w2, col, hi, sd) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const pts = [
    [a[0] + nx * w1, a[1] + ny * w1], [b[0] + nx * w2, b[1] + ny * w2],
    [b[0] - nx * w2, b[1] - ny * w2], [a[0] - nx * w1, a[1] - ny * w1],
  ];
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 轮廓
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  // 关节圆头
  ctx.beginPath(); ctx.arc(a[0], a[1], w1, 0, 6.284); ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.arc(b[0], b[1], w2, 0, 6.284); ctx.fill();
  // 高光 / 暗面
  if (hi) {
    ctx.strokeStyle = hi; ctx.lineWidth = Math.max(.9, w1 * .5);
    ctx.beginPath();
    ctx.moveTo(a[0] - nx * w1 * .45, a[1] - ny * w1 * .45);
    ctx.lineTo(b[0] - nx * w2 * .45, b[1] - ny * w2 * .45);
    ctx.stroke();
  }
  if (sd) {
    ctx.strokeStyle = sd; ctx.lineWidth = Math.max(.8, w1 * .38);
    ctx.beginPath();
    ctx.moveTo(a[0] + nx * w1 * .55, a[1] + ny * w1 * .55);
    ctx.lineTo(b[0] + nx * w2 * .55, b[1] + ny * w2 * .55);
    ctx.stroke();
  }
}

function poly(ctx, pts, col, stroke = true) {
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  if (stroke) { ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke(); }
}

const add = (p, q, s = 1) => [p[0] + q[0] * s, p[1] + q[1] * s];

// ——— 角色主体 ———
export function drawFighter(ctx, f, pose, opt = {}) {
  const P = PALETTES[f.paletteName] || PALETTES.kyo;
  let flash = opt.flash || 0;
  if (flash < 0.06) flash = 0;

  ctx.save();
  ctx.translate(Math.round(f.x - (opt.camX || 0)), Math.round(f.y - f.z));
  ctx.scale(f.facing, -1);
  if (opt.rot) ctx.rotate(opt.rot);

  // 受击染白：只做提亮，不做纯白剪影，避免角色在顿帧里“消失”
  const col = c => flash > 0 ? shade(c, Math.min(.45, flash * .48)) : c;
  const skin = col(P.skin), skinD = col(P.skinD);
  const coat = col(P.coat), coat2 = col(P.coat2), pants = col(P.pants);
  const shoe = col(P.shoe), shirt = col(P.shirt), hair = col(P.hair);
  const trim = col(P.trim), glove = col(P.glove);
  const sleeveless = f.outfit === 'sleeveless';
  const armCol = sleeveless ? skin : coat;
  const armHi = sleeveless ? shade(skin, .22) : shade(coat, .3);
  const armSd = sleeveless ? shade(skin, -.25) : shade(coat, -.3);

  // —— 躯干骨架 ——
  const hip = pose.hip, chest = pose.chest;
  let ax = chest[0] - hip[0], ay = chest[1] - hip[1];
  const L = Math.hypot(ax, ay) || 1;
  const ux = ax / L, uy = ay / L;
  const nx = -uy, ny = ux;                 // n 指向背后
  const SH = 9.2, WA = 6.2;
  const shB = [chest[0] + nx * SH, chest[1] + ny * SH];
  const shF = [chest[0] - nx * SH, chest[1] - ny * SH];
  const hpB = [hip[0] + nx * WA, hip[1] + ny * WA];
  const hpF = [hip[0] - nx * WA, hip[1] - ny * WA];
  const jB  = [chest[0] + nx * (SH - 1.6) + ux * 1.2, chest[1] + ny * (SH - 1.6) + uy * 1.2];
  const jF  = [chest[0] - nx * (SH - 1.6) + ux * 1.2, chest[1] - ny * (SH - 1.6) + uy * 1.2];
  const lB  = [hip[0] + nx * (WA - 1.2), hip[1] + ny * (WA - 1.2)];
  const lF  = [hip[0] - nx * (WA - 1.2), hip[1] - ny * (WA - 1.2)];

  // ═══ 后腿 ═══
  limb(ctx, lB, pose.kB, 6.6, 5.2, shade(pants, -.3), null, shade(pants, -.45));
  limb(ctx, pose.kB, pose.ftB, 5.2, 3.6, shade(pants, -.3), null, shade(pants, -.45));
  drawShoe(ctx, pose.kB, pose.ftB, shade(shoe, -.2), shade(shoe, .05));

  // ═══ 后臂 ═══
  limb(ctx, jB, pose.eB, 5.6, 4.4, shade(armCol, -.25), null, shade(armCol, -.4));
  limb(ctx, pose.eB, pose.hB, 4.4, 3.6, sleeveless ? shade(skin, -.25) : shade(skinD, -.1), null, null);
  ctx.beginPath(); ctx.arc(pose.hB[0], pose.hB[1], 4.2, 0, 6.284);
  ctx.fillStyle = shade(glove, -.22); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();

  // ═══ 躯干 ═══
  poly(ctx, [hpB, hpF, add(shF, [ux, uy], 1.5), add(shB, [ux, uy], 1.5)], shirt);
  // 胸口高光
  poly(ctx, [
    add(hpF, [nx, ny], 1.5), add(hpF, [nx, ny], 5),
    add(add(shF, [ux, uy], 1.5), [nx, ny], 5), add(add(shF, [ux, uy], 1.5), [nx, ny], 1.5),
  ], shade(shirt, .16), false);
  // 外套（后半 + 前襟）
  poly(ctx, [
    hpB, add(hpB, [nx, ny], -4.5),
    add(add(shB, [ux, uy], 1.5), [nx, ny], -5), add(shB, [ux, uy], 1.5),
  ], coat);
  poly(ctx, [
    add(hpF, [nx, ny], .5), add(hpF, [nx, ny], 3.2),
    add(add(shF, [ux, uy], 1.2), [nx, ny], 4.2), add(add(shF, [ux, uy], 1.2), [nx, ny], -.5),
  ], coat2);
  // 领口
  poly(ctx, [
    add(shF, [ux, uy], 2.2), add(shB, [ux, uy], 2.2),
    add(add(shB, [ux, uy], 5.4), [nx, ny], -2), add(add(shF, [ux, uy], 5.4), [nx, ny], 2),
  ], shade(coat, .1));
  // 无袖装：胸前交叉皮带扣
  if (sleeveless) {
    ctx.strokeStyle = shade(trim, -.1); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(add(shF, [ux, uy], 0)[0], add(shF, [ux, uy], 0)[1]);
    ctx.lineTo(add(hpB, [ux, uy], 4)[0], add(hpB, [ux, uy], 4)[1]);
    ctx.stroke();
    ctx.strokeStyle = shade(trim, .25); ctx.lineWidth = .9;
    ctx.stroke();
  }

  // 腰带
  const bl = add(hpB, [ux, uy], -.5), br = add(hpF, [ux, uy], -.5);
  ctx.strokeStyle = OUT; ctx.lineWidth = 5.2;
  ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.stroke();
  ctx.strokeStyle = trim; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.lineTo(br[0], br[1]); ctx.stroke();
  ctx.strokeStyle = shade(trim, .3); ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(bl[0], bl[1] + 1); ctx.lineTo(br[0], br[1] + 1); ctx.stroke();

  // ═══ 前腿 ═══
  limb(ctx, lF, pose.kF, 7.0, 5.6, pants, shade(pants, .24), shade(pants, -.3));
  limb(ctx, pose.kF, pose.ftF, 5.6, 3.8, pants, shade(pants, .18), shade(pants, -.28));
  drawShoe(ctx, pose.kF, pose.ftF, shoe, shade(shoe, .35));

  // ═══ 头 ═══
  drawHead(ctx, pose, f, { skin, skinD, hair, trim, flash, coat });

  // ═══ 前臂 ═══
  limb(ctx, jF, pose.eF, 6.0, 4.8, armCol, armHi, armSd);
  limb(ctx, pose.eF, pose.hF, 4.8, 4.0, sleeveless ? skin : skin, shade(skin, .2), skinD);
  ctx.beginPath(); ctx.arc(pose.hF[0] + .6, pose.hF[1], 4.6, 0, 6.284);
  ctx.fillStyle = glove; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.arc(pose.hF[0] - .4, pose.hF[1] + 1.4, 2, 0, 6.284);
  ctx.fillStyle = shade(glove, .28); ctx.fill();

  ctx.restore();
}

function drawShoe(ctx, knee, foot, col, hi) {
  const dx = foot[0] - knee[0], dy = foot[1] - knee[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;          // 小腿方向
  const px = -uy, py = ux;
  const heel = [foot[0] - px * 2.6, foot[1] - py * 2.6];
  const toe  = [foot[0] + px * 6.4, foot[1] + py * 6.4];
  poly(ctx, [
    [heel[0] - ux * 1.2, heel[1] - uy * 1.2],
    [toe[0] - ux * .6, toe[1] - uy * .6],
    [toe[0] + ux * 3.2, toe[1] + uy * 3.2],
    [heel[0] + ux * 4.2, heel[1] + uy * 4.2],
  ], col);
  ctx.strokeStyle = hi; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(heel[0] + ux * 3.6, heel[1] + uy * 3.6);
  ctx.lineTo(toe[0] + ux * 2.4, toe[1] + uy * 2.4);
  ctx.stroke();
}

function drawHead(ctx, pose, f, C) {
  const hd = pose.head, R = pose.headR;
  ctx.save();
  ctx.translate(hd[0], hd[1]);
  ctx.rotate((pose.lean || 0) * .55);

  // 脖子
  poly(ctx, [[-2.8, -R + .5], [2.4, -R + .5], [2.8, -R - 4.5], [-3.2, -R - 4.5]], C.skinD);

  // 脸（略带下巴的多边形，比纯椭圆更有骨感）
  poly(ctx, [
    [-R * .95, R * .55], [-R * .55, R * 1.0], [R * .35, R * 1.02], [R * .92, R * .5],
    [R * 1.0, -R * .1], [R * .62, -R * .78], [-R * .1, -R * 1.02], [-R * .8, -R * .55],
  ], C.skin);
  // 侧面暗部
  poly(ctx, [[-R * .95, R * .55], [-R * .8, -R * .55], [-R * .2, -R * .95], [-R * .3, R * .8]], C.skinD, false);

  if (f.hairStyle === 'long') {
    // 长发：后披 + 遮住半张脸的刘海
    poly(ctx, [
      [-R * .2, R * 1.05], [-R * 1.35, R * .5], [-R * 1.55, -R * 1.2], [-R * 1.15, -R * 3.0],
      [-R * .55, -R * 2.2], [-R * .45, -R * .4], [-R * .1, R * .3],
    ], C.hair);
    poly(ctx, [
      [-R * 1.18, R * .35], [-R * .95, R * 1.35], [R * .05, R * 1.55], [R * .95, R * 1.05],
      [R * 1.18, R * .5], [R * .72, R * .58], [R * .3, R * .95],
      [-R * .12, R * .55], [-R * .35, -R * .25], [-R * .72, -R * .6], [-R * .98, -R * .1],
    ], C.hair);
    // 发丝高光
    ctx.strokeStyle = shade(C.hair, .35); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-R * .5, R * 1.2); ctx.lineTo(R * .55, R * .95); ctx.stroke();
  } else {
    // 短乱发（尖刺）
    poly(ctx, [
      [-R * 1.12, R * .3], [-R * 1.25, R * 1.15], [-R * .6, R * .95],
      [-R * .5, R * 1.55], [-R * .05, R * 1.05],
      [R * .35, R * 1.62], [R * .58, R * 1.0],
      [R * 1.05, R * 1.35], [R * 1.15, R * .55],
      [R * 1.35, R * .15], [R * .78, R * .2],
      [R * .1, R * .45], [-R * .55, R * .3],
    ], C.hair);
    ctx.strokeStyle = shade(C.hair, .38); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-R * .75, R * .95); ctx.lineTo(R * .5, R * .8); ctx.stroke();
    if (f.cap) {   // 帽子
      poly(ctx, [[-R * 1.2, R * .55], [-R * 1.1, R * 1.25], [R * .5, R * 1.45], [R * 1.15, R * .95], [R * 1.05, R * .45]], C.trim);
      poly(ctx, [[R * .6, R * .95], [R * 1.75, R * .8], [R * 1.7, R * .35], [R * .7, R * .45]], shade(C.trim, -.25));
    }
  }

  if (!f.eyesClosed) {
    // 眉
    ctx.strokeStyle = shade(C.hair, .05);
    ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(R * .1, R * .28); ctx.lineTo(R * .72, R * .14); ctx.stroke();
    if (f.hairStyle !== 'long') {
      ctx.beginPath(); ctx.moveTo(-R * .62, R * .3); ctx.lineTo(-R * .22, R * .24); ctx.stroke();
    }
    // 眼
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(R * .2, -R * .18, 3.1, 2.6);
    if (f.hairStyle !== 'long') ctx.fillRect(-R * .6, -R * .16, 2.6, 2.4);
    ctx.fillStyle = '#191722';
    ctx.fillRect(R * .52, -R * .18, 1.6, 2.6);
    if (f.hairStyle !== 'long') ctx.fillRect(-R * .28, -R * .16, 1.4, 2.4);
    // 嘴
    ctx.strokeStyle = 'rgba(60,30,25,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(R * .38, -R * .62); ctx.lineTo(R * .72, -R * .6); ctx.stroke();
  }
  ctx.restore();
}

// ——— 影子 ———
export function drawShadow(ctx, f, camX, groundY) {
  const h = clamp(1 - f.z / 130, .35, 1);
  ctx.save();
  ctx.globalAlpha = .36 * h;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(f.x - camX), groundY + 1, 16 * h, 4.4 * h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════ 特效系统 ═══════════════════════
export class FX {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }

  add(o) { this.list.push(Object.assign({ t: 0, life: 20, vx: 0, vy: 0, g: 0, kind: 'spark' }, o)); }

  hitSpark(x, y, power, facing, guard) {
    const n = guard ? 5 : 8 + power * 3;
    this.add({ kind: guard ? 'guard' : 'flash', x, y, life: guard ? 10 : 8 + power * 3, r: 8 + power * 6 });
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(1.2, 3.4) * (1 + power * .5);
      this.add({
        kind: 'streak', x, y, life: rndi(8, 16),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .12,
        col: guard ? '#9fd0ff' : (Math.random() < .5 ? '#fff6c8' : '#ffb020'),
        len: rnd(3, 8),
      });
    }
    if (!guard) {
      for (let i = 0; i < 3 + power * 2; i++) {
        this.add({ kind: 'dot', x, y, life: rndi(10, 22), vx: rnd(-2.2, 2.2) - facing * .6, vy: rnd(.4, 3), g: .18, col: '#ffe08a' });
      }
    }
  }

  dust(x, y, dir, n = 6, col = '#c8bda8') {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'dust', x: x + rnd(-4, 4), y, life: rndi(12, 24),
                 vx: dir * rnd(.2, 1.6), vy: rnd(.1, 1.1), g: -.02, r: rnd(1.5, 4), col });
    }
  }

  ring(x, y, col, r0 = 4, r1 = 46, life = 18) { this.add({ kind: 'ring', x, y, life, r0, r1, col }); }

  flame(x, y, col, col2, n = 10, spread = 8, up = 2.6) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'flame', x: x + rnd(-spread, spread), y: y + rnd(-4, 4), life: rndi(14, 26),
                 vx: rnd(-.5, .5), vy: rnd(up * .5, up), g: -.03, r: rnd(3, 7), col, col2 });
    }
  }

  text(x, y, str, col, life = 40) { this.add({ kind: 'text', x, y, str, col, life, vy: .5, g: -.012 }); }

  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t++;
      p.x += p.vx; p.y -= p.vy; p.vy -= p.g;
      if (p.t >= p.life) this.list.splice(i, 1);
    }
  }

  draw(ctx, camX) {
    ctx.save();
    for (const p of this.list) {
      const k = p.t / p.life, inv = 1 - k;
      const x = p.x - camX, y = p.y;
      switch (p.kind) {
        case 'flash': {
          const r = p.r * (0.35 + k * 1.15);
          ctx.globalAlpha = inv;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, '#ffffff'); g.addColorStop(.4, '#ffe89a');
          g.addColorStop(.75, 'rgba(255,150,20,.6)'); g.addColorStop(1, 'rgba(255,80,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.284); ctx.fill();
          ctx.globalAlpha = inv * .9; ctx.fillStyle = '#fff';
          ctx.fillRect(x - r * 1.5, y - .9, r * 3, 1.8);
          ctx.fillRect(x - .9, y - r * 1.2, 1.8, r * 2.4);
          break;
        }
        case 'guard': {
          ctx.globalAlpha = inv * .9;
          ctx.strokeStyle = '#bfe3ff'; ctx.lineWidth = 1.6;
          for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.arc(x, y, 6 + a * 5 + k * 8, -1.0, 1.0); ctx.stroke(); }
          break;
        }
        case 'streak': {
          ctx.globalAlpha = inv;
          ctx.strokeStyle = p.col; ctx.lineWidth = 1.4;
          const m = Math.hypot(p.vx, p.vy) || 1;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx / m * p.len, y + p.vy / m * p.len);
          ctx.stroke();
          break;
        }
        case 'dot':
          ctx.globalAlpha = inv; ctx.fillStyle = p.col; ctx.fillRect(x - 1, y - 1, 2, 2); break;
        case 'dust':
          ctx.globalAlpha = inv * .55; ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(x, y, p.r * (.5 + k), 0, 6.284); ctx.fill(); break;
        case 'ring': {
          const r = lerp(p.r0, p.r1, k);
          ctx.globalAlpha = inv * .85;
          ctx.strokeStyle = p.col; ctx.lineWidth = 2.4 * inv + .4;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.284); ctx.stroke(); break;
        }
        case 'flame': {
          // 竖直火舌：上窄下宽，叠加发光
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = inv * .75;
          const r = p.r * (1 - k * .45);
          const wob = Math.sin(p.t * .55 + p.x) * r * .22;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.1);
          g.addColorStop(0, '#ffffff'); g.addColorStop(.3, p.col2 || '#ffd24a');
          g.addColorStop(.7, p.col); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x + wob, y - r * 2.3);
          ctx.quadraticCurveTo(x + r * 1.25, y - r * .3, x + r * .55, y + r * .95);
          ctx.quadraticCurveTo(x, y + r * 1.35, x - r * .55, y + r * .95);
          ctx.quadraticCurveTo(x - r * 1.25, y - r * .3, x + wob, y - r * 2.3);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'text': {
          ctx.globalAlpha = k > .75 ? inv * 4 : 1;
          ctx.font = 'bold 11px "Arial Black", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = '#000';
          ctx.strokeText(p.str, x, y);
          ctx.fillStyle = p.col; ctx.fillText(p.str, x, y);
          break;
        }
      }
    }
    ctx.restore();
  }
}

// ——— 残影 ———
export function drawAfterimage(ctx, f, ghosts, camX) {
  ctx.save();
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    ctx.globalAlpha = (i + 1) / ghosts.length * .25;
    ctx.globalCompositeOperation = 'lighter';
    drawFighter(ctx, {
      x: g.x, y: g.y, z: g.z, facing: g.facing,
      paletteName: f.paletteName, hairStyle: f.hairStyle, outfit: f.outfit, cap: f.cap,
    }, g.pose, { camX, flash: .35 });
  }
  ctx.restore();
}
