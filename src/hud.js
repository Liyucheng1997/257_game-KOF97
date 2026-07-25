// hud.js —— 血条 / 能量槽 / 计时 / 连击数 / 回合提示
import { W, H, MAX_HP, MAX_POWER, MAX_STOCK, clamp, lerp } from './core.js';

const BAR_W = 128, BAR_H = 9;

export class HUD {
  constructor() {
    this.hpShown = [MAX_HP, MAX_HP];   // 缓降的红色残影
    this.comboTimer = [0, 0];
    this.comboShown = [0, 0];
    this.flash = 0;
  }

  update(g) {
    for (let i = 0; i < 2; i++) {
      const f = g.fighters[i];
      if (this.hpShown[i] > f.hp) this.hpShown[i] = Math.max(f.hp, this.hpShown[i] - 0.45);
      else this.hpShown[i] = f.hp;
      const c = g.fighters[1 - i].comboHits;   // 对手身上的挨打段数 = 我打出的连击
      if (c >= 2) { this.comboShown[i] = c; this.comboTimer[i] = 50; }
      else if (this.comboTimer[i] > 0) this.comboTimer[i]--;
    }
    if (this.flash > 0) this.flash--;
  }

  reset() { this.hpShown = [MAX_HP, MAX_HP]; this.comboTimer = [0, 0]; }

  draw(ctx, g) {
    ctx.save();
    ctx.textBaseline = 'top';

    for (let i = 0; i < 2; i++) {
      const f = g.fighters[i];
      const right = i === 1;
      const x0 = right ? W - 10 - BAR_W : 10;
      const y0 = 10;

      // 外框
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(x0 - 2, y0 - 2, BAR_W + 4, BAR_H + 4);
      ctx.fillStyle = '#12151f';
      ctx.fillRect(x0, y0, BAR_W, BAR_H);

      // 残影（红）
      const rw = BAR_W * clamp(this.hpShown[i] / MAX_HP, 0, 1);
      ctx.fillStyle = '#c02020';
      ctx.fillRect(right ? x0 + BAR_W - rw : x0, y0, rw, BAR_H);

      // 当前血量（黄绿渐变）
      const hw = BAR_W * clamp(f.hp / MAX_HP, 0, 1);
      const grd = ctx.createLinearGradient(0, y0, 0, y0 + BAR_H);
      const low = f.hp / MAX_HP < 0.3;
      if (low) { grd.addColorStop(0, '#ffd85a'); grd.addColorStop(.5, '#ff8a1a'); grd.addColorStop(1, '#c04a00'); }
      else { grd.addColorStop(0, '#eaff8a'); grd.addColorStop(.5, '#8ed438'); grd.addColorStop(1, '#3d7d18'); }
      ctx.fillStyle = grd;
      ctx.fillRect(right ? x0 + BAR_W - hw : x0, y0, hw, BAR_H);
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillRect(right ? x0 + BAR_W - hw : x0, y0 + 1, hw, 1.6);
      // 危险闪烁
      if (low && (g.frame >> 3) % 2 === 0) {
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1;
        ctx.strokeRect(x0 - 2.5, y0 - 2.5, BAR_W + 5, BAR_H + 5);
      }

      // 名字
      ctx.font = 'bold 9px Arial, sans-serif';
      ctx.textAlign = right ? 'right' : 'left';
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#000';
      const nx = right ? x0 + BAR_W : x0;
      ctx.strokeText(f.char.name, nx, y0 + BAR_H + 3);
      ctx.fillStyle = f.char.color;
      ctx.fillText(f.char.name, nx, y0 + BAR_H + 3);

      // 回合星
      for (let r = 0; r < 2; r++) {
        const sx = right ? x0 + BAR_W - 6 - r * 9 : x0 + 2 + r * 9;
        const won = g.wins[i] > r;
        ctx.beginPath(); ctx.arc(sx + 2, y0 + BAR_H + 14, 3.2, 0, 6.284);
        ctx.fillStyle = won ? '#ffd24a' : 'rgba(255,255,255,.16)'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 1; ctx.stroke();
      }

      // ——— 能量槽（底部）———
      const gx = right ? W - 10 - BAR_W : 10;
      const gy = H - 16;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(gx - 2, gy - 2, BAR_W + 4, 8);
      const inMax = f.maxMode > 0;
      for (let s = 0; s < MAX_STOCK; s++) {
        const sw = (BAR_W - 4) / MAX_STOCK;
        const sxx = right ? gx + BAR_W - (s + 1) * sw - s * 0 : gx + s * sw;
        ctx.fillStyle = '#151a26';
        ctx.fillRect(sxx + 1, gy, sw - 2, 5);
        let fill = 0;
        if (f.stock > s) fill = 1;
        else if (f.stock === s) fill = f.power / MAX_POWER;
        if (fill > 0) {
          const w2 = (sw - 2) * fill;
          const gg = ctx.createLinearGradient(0, gy, 0, gy + 5);
          if (inMax) { gg.addColorStop(0, '#fff'); gg.addColorStop(.5, '#ffd24a'); gg.addColorStop(1, '#ff6a00'); }
          else if (f.stock > s) { gg.addColorStop(0, '#bfe8ff'); gg.addColorStop(.5, '#2f9bff'); gg.addColorStop(1, '#0a3d8f'); }
          else { gg.addColorStop(0, '#9fd0ff'); gg.addColorStop(1, '#1f5fbf'); }
          ctx.fillStyle = gg;
          ctx.fillRect(right ? sxx + 1 + (sw - 2 - w2) : sxx + 1, gy, w2, 5);
        }
      }
      ctx.font = 'bold 7px Arial'; ctx.textAlign = right ? 'right' : 'left';
      ctx.fillStyle = inMax && (g.frame >> 2) % 2 === 0 ? '#ffd24a' : '#8b96b0';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
      const lx = right ? gx + BAR_W : gx;
      ctx.strokeText(inMax ? 'MAX MODE' : 'POWER', lx, gy - 10);
      ctx.fillText(inMax ? 'MAX MODE' : 'POWER', lx, gy - 10);

      // ——— 连击数 ———
      if (this.comboTimer[i] > 0 && this.comboShown[i] >= 2) {
        const cx = right ? W - 56 : 56;
        const cy = 52;
        const k = clamp((50 - this.comboTimer[i]) / 6, 0, 1);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(lerp(1.6, 1, k), lerp(1.6, 1, k));
        ctx.textAlign = 'center';
        ctx.font = 'bold 18px "Arial Black", Arial';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000';
        ctx.strokeText(this.comboShown[i], 0, 0);
        const cg = ctx.createLinearGradient(0, -14, 0, 4);
        cg.addColorStop(0, '#fff'); cg.addColorStop(.5, '#ffe14a'); cg.addColorStop(1, '#ff7a10');
        ctx.fillStyle = cg; ctx.fillText(this.comboShown[i], 0, 0);
        ctx.font = 'bold 8px Arial';
        ctx.lineWidth = 3; ctx.strokeText('HITS', 0, 16); ctx.fillStyle = '#ffd24a'; ctx.fillText('HITS', 0, 16);
        ctx.restore();
      }
    }

    // ——— 计时器 ———
    const t = Math.ceil(g.timer / 60);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold 20px "Arial Black", Arial';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    const ts = String(Math.max(0, t)).padStart(2, '0');
    ctx.strokeText(ts, W / 2, 6);
    ctx.fillStyle = t <= 10 ? ((g.frame >> 3) % 2 ? '#ff4030' : '#ffb0a0') : '#f2f4ff';
    ctx.fillText(ts, W / 2, 6);

    ctx.restore();
  }

  // 回合中央大字
  drawBanner(ctx, text, sub, t, life) {
    const k = t / life;
    const a = k < .12 ? k / .12 : (k > .82 ? (1 - k) / .18 : 1);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sc = k < .12 ? 1 + (1 - k / .12) * 1.4 : 1;
    ctx.translate(W / 2, 78);
    ctx.scale(sc, sc);
    ctx.font = 'bold 26px "Arial Black", Arial';
    ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 0);
    const g2 = ctx.createLinearGradient(0, -16, 0, 14);
    g2.addColorStop(0, '#ffffff'); g2.addColorStop(.42, '#ffd85a'); g2.addColorStop(1, '#e04a08');
    ctx.fillStyle = g2; ctx.fillText(text, 0, 0);
    if (sub) {
      ctx.font = 'bold 10px Arial';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(sub, 0, 20);
      ctx.fillStyle = '#cfd8f0'; ctx.fillText(sub, 0, 20);
    }
    ctx.restore();
  }
}
