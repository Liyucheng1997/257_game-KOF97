// game.js —— 对局流程 / 碰撞仲裁 / 镜头 / 渲染管线
import {
  W, H, GROUND_Y, STAGE_W, MAX_HP, LV,
  clamp, lerp, overlap, rnd, rndi, pick, toWorld,
} from './core.js';
import { Pad, BTN, keyPressed, keyHeld, endFrameGlobal } from './input.js';
import { Fighter } from './fighter.js';
import { CHARACTERS, ROSTER } from './framedata.js';
import { Stage } from './stage.js';
import { HUD } from './hud.js';
import { AI } from './ai.js';
import { Audio } from './audio.js';
import { Assets } from './assets.js';
import { FX, drawFighter, drawShadow, drawAfterimage, PALETTES, shade } from './render.js';
import { POSE } from './pose.js';

const ROUND_TIME = 99 * 60;

export class Game {
  constructor(ctx) {
    this.ctx = ctx;
    this.frame = 0;
    this.pads = [new Pad(0), new Pad(1)];
    this.fx = new FX();
    this.hud = new HUD();
    this.audio = new Audio();
    this.assets = new Assets();
    this.stage = new Stage(0);
    this.projectiles = [];
    this.camX = (STAGE_W - W) / 2;
    this.shakeT = 0; this.shakeAmp = 0;
    this.freeze = 0;
    this.superFlash = 0;
    this.hitFlash = 0;
    this.phase = 'select';
    this.phaseT = 0;
    this.banner = null;
    this.wins = [0, 0];
    this.round = 1;
    this.timer = ROUND_TIME;
    this.showBoxes = false;
    this.paused = false;
    this.stageChoice = 0;
    this.trainingGuard = 'stand';
    this.trainingIdle = 0;
    this.mode = 'cpu';           // cpu | vs | training
    this.aiLevel = 3;
    this.fighters = [];
    this.ai = null;
    this.sel = { cursor: [0, 1], locked: [false, false], t: 0, mode: 0 };
    this.slowmo = 0;
    this.ready = this.assets.load();
  }

  // ═════════ 对局初始化 ═════════
  startMatch(idA, idB) {
    this.fighters = [];
    this.fighters.push(new Fighter(idA, 0, this));
    this.fighters.push(new Fighter(idB, 1, this));   // 第二个构造时可读到 1P 角色，用于判断镜像战配色
    this.pads[0].aiControlled = false;
    this.pads[1].aiControlled = this.mode !== 'vs';
    this.ai = this.mode === 'vs' ? null : new AI(this.fighters[1], this.pads[1], this.mode === 'training' ? 1 : this.aiLevel);
    this.paused = false;
    this.trainingIdle = 0;
    this.wins = [0, 0];
    this.round = 1;
    this.stage = new Stage(this.stageChoice);
    this.startRound();
    this.audio.startBGM();
  }

  startRound() {
    const [a, b] = this.fighters;
    a.resetRound(STAGE_W / 2 - 52, 1);
    b.resetRound(STAGE_W / 2 + 52, -1);
    if (this.round === 1) { a.power = b.power = 0; a.stock = b.stock = 0; }
    this.freeze = this.slowmo = this.superFlash = this.hitFlash = 0;
    for (const pad of this.pads) { pad.clearHist(); pad.btn = pad.press = pad.release = 0; }
    if (this.ai) { this.ai.queue = []; this.ai.cur = null; }
    if (this.mode === 'training') { a.stock = b.stock = 3; }
    this.projectiles.length = 0;
    this.fx.clear();
    this.hud.reset();
    this.timer = ROUND_TIME;
    this.camX = (STAGE_W - W) / 2;
    this.phase = 'roundstart';
    this.phaseT = 0;
    this.setBanner(this.round >= 3 ? 'FINAL ROUND' : `ROUND ${this.round}`, null, 90);
    this.audio.play('round');
  }

  setBanner(text, sub, life) { this.banner = { text, sub, t: 0, life }; }

  // ═════════ 主循环 ═════════
  update() {
    if (keyPressed('F1')) this.showBoxes = !this.showBoxes;
    if (keyPressed('F5')) { this.phase = 'select'; this.sel.locked = [false, false]; this.audio.stopBGM(); }

    if (this.phase === 'select') { this.updateSelect(); endFrameGlobal(); return; }

    if (this.paused) { endFrameGlobal(); return; }
    this.frame++;
    if (this.banner) { if (++this.banner.t >= this.banner.life) this.banner = null; }
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.superFlash > 0) this.superFlash--;
    if (this.shakeT > 0) this.shakeT--;
    this.stage.update();
    this.hud.update(this);

    if (this.freeze > 0) { this.freeze--; this.fx.update(); endFrameGlobal(); return; }
    if (this.slowmo > 0) { this.slowmo--; if (this.frame % 3) { this.fx.update(); endFrameGlobal(); return; } }

    // —— 阶段流程 ——
    if (this.phase === 'roundstart') {
      this.phaseT++;
      if (this.phaseT === 66) this.setBanner('FIGHT!', null, 50);
      if (this.phaseT >= 78) this.phase = 'fight';
      this.samplePads(true);
      this.updateFighters(true);
      this.postPhysics();
      this.updateCamera();
      this.fx.update();
      endFrameGlobal();
      return;
    }

    if (this.phase === 'fight') {
      if (this.mode === 'training') this.timer = ROUND_TIME;
      else if (this.timer > 0) this.timer--;
      else this.onTimeOver();
    }

    if (this.phase === 'ko' || this.phase === 'timeover') {
      this.phaseT++;
      if (this.phaseT === 100) this.afterRound();
    }
    if (this.phase === 'matchover') {
      this.phaseT++;
      if (this.phaseT > 260) { this.phase = 'select'; this.sel.locked = [false, false]; this.audio.stopBGM(); }
    }

    this.samplePads(false);
    this.updateFighters(false);
    this.updateProjectiles();
    this.postPhysics();
    this.resolveHits();
    this.updateRush();
    if (this.mode === 'training' && this.phase === 'fight') {
      for (const f of this.fighters) f.stock = 3;
      const busy = this.fighters.some(f => f.move || ['hit','down','thrown','blockstun'].includes(f.state) || !f.grounded);
      this.trainingIdle = busy ? 0 : this.trainingIdle + 1;
      if (this.trainingIdle >= 90) for (const f of this.fighters) { f.hp = MAX_HP; f.stunPoints = 0; f.dizzy = 0; }
    }
    this.updateCamera();
    this.fx.update();
    endFrameGlobal();
  }

  samplePads(frozen) {
    if (this.mode === 'training' && this.ai) {
      this.pads[1].aiBtn = 0;
      this.pads[1].aiDir = this.trainingGuard === 'guard' ? (this.fighters[0].move?.hits.some(h => h.lvl === LV.LOW) ? 1 : 4) : this.trainingGuard === 'crouch' ? 2 : 5;
    } else if (this.ai && !frozen && this.phase === 'fight') this.ai.update(this);
    else if (this.ai) { this.pads[1].aiDir = 5; this.pads[1].aiBtn = 0; }
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      this.pads[i].frozen = f.hitstop > 0 || f.freeze > 0 || this.freeze > 0;
      this.pads[i].sample(f.facing);
    }
  }

  updateFighters(frozen) {
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      if (frozen || this.phase === 'ko' || this.phase === 'timeover' || this.phase === 'matchover') {
        // 回合结束后仍然让物理跑完（倒地、落地）
        if (f.state === 'ko' || f.state === 'hit' || f.state === 'down' || f.state === 'thrown' || !f.grounded) {
          if (f.hitstop > 0) { f.hitstop--; continue; }
          f.stateTimer++;
          if (f.state !== 'ko') f.updateStunState();
          f.physics();
          f.advanceAnim();
        } else if (this.phase === 'ko' || this.phase === 'matchover') {
          f.stateTimer++;
          f.advanceAnim();
        } else {
          f.stateTimer++;
          f.advanceAnim();
        }
        continue;
      }
      f.update(this.pads[i]);
    }
  }

  // ═════════ 推挤 / 边界 ═════════
  postPhysics() {
    const [a, b] = this.fighters;
    // 互推
    const pa = a.pushbox(), pb = b.pushbox();
    if (overlap(pa, pb) && a.grounded === b.grounded) {
      const ca = pa.x + pa.w / 2, cb = pb.x + pb.w / 2;
      const ov = (pa.w + pb.w) / 2 - Math.abs(cb - ca);
      if (ov > 0) {
        const dir = ca < cb ? 1 : -1;
        const half = ov / 2 + .05;
        a.x -= dir * half; b.x += dir * half;
      }
    }
    // 保持双方同屏
    const maxHalf = W / 2 - 26;
    const mid = (a.x + b.x) / 2;
    if (a.x < mid - maxHalf) a.x = mid - maxHalf;
    if (a.x > mid + maxHalf) a.x = mid + maxHalf;
    if (b.x < mid - maxHalf) b.x = mid - maxHalf;
    if (b.x > mid + maxHalf) b.x = mid + maxHalf;
    for (const f of this.fighters) f.x = clamp(f.x, 20, STAGE_W - 20);
  }

  // ═════════ 命中仲裁 ═════════
  resolveHits() {
    if (this.phase !== 'fight' && this.phase !== 'roundstart') return;
    for (let i = 0; i < 2; i++) {
      const atk = this.fighters[i], def = this.fighters[1 - i];
      if (atk.hitstop > 0 || !atk.move) continue;
      const hits = atk.activeHits();
      if (!hits.length) continue;
      const hurts = def.hurtboxes();
      for (const { idx, h, box } of hits) {
        let landed = false;
        for (const hb of hurts) {
          if (!overlap(box, hb)) continue;
          landed = true; break;
        }
        if (!landed) continue;
        atk.hitList.add(idx);
        if (atk.move.type === 'throw') {
          const ok = def.receiveThrow(atk, h);
          if (!ok) { atk.mframe = Math.max(atk.mframe, atk.move.startup + atk.move.active); }
        } else {
          def.receiveHit(atk, h, idx);
        }
      }
    }
  }

  updateRush() {
    for (const f of this.fighters) {
      if (!f.rushSeq) continue;
      const rs = f.rushSeq;
      if (f.hitstop > 0) continue;
      if (++rs.timer % 3 === 0) {
        const t = rs.target;
        t.hp = Math.max(0, t.hp - rs.dmg);
        t.comboHits++; t.comboDmg += rs.dmg;
        t.flash = 1;
        t.stunLeft = Math.max(t.stunLeft, 12);
        this.fx.hitSpark(t.x + rnd(-10, 10), t.feetY - rnd(24, 76), 1, f.facing, false);
        this.audio.play('hitL');
        this.shake(2, 3);
        if (--rs.left <= 0) {
          f.rushSeq = null;
          t.vx = -t.facing * 6; t.z = 2; t.vz = 5.5; t.airborne = true;
          t.knockedDown = true; t.stunLeft = 24;
          this.fx.hitSpark(t.x, t.feetY - 50, 2, f.facing, false);
          this.audio.play('hitH');
          this.shake(6, 12);
          if (t.hp <= 0) this.onKO(t, f, { power: 2 });
        }
      }
    }
  }

  // ═════════ 飞行道具 ═════════
  spawnProjectile(owner, spec) {
    this.projectiles.push({
      owner, x: owner.x + owner.facing * 26, y: owner.feetY - (spec.ground ? 0 : 40),
      vx: owner.facing * spec.vx, life: spec.life, spec,
      facing: owner.facing, t: 0, dead: false,
    });
  }

  updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t++; p.x += p.vx;
      if (--p.life <= 0 || p.x < this.camX - 60 || p.x > this.camX + W + 60) { this.projectiles.splice(i, 1); continue; }
      const s = p.spec;
      const box = toWorld(s.box, p.x, p.y, p.facing);
      // 与对手判定
      const def = p.owner.opp;
      if (def && !p.dead) {
        for (const hb of def.hurtboxes()) {
          if (!overlap(box, hb)) continue;
          const h = { ...s, lvl: s.lowHit ? LV.MID : LV.MID, pushEnemy: 3, power: 1, fx: 'flame', knockdown: false, launch: 0 };
          def.receiveHit(p.owner, h, -1);
          p.dead = true;
          this.fx.hitSpark(p.x, p.y - 12, 1, p.facing, false);
          this.projectiles.splice(i, 1);
          break;
        }
      }
      // 弹幕对消
      if (!p.dead) {
        for (let j = this.projectiles.length - 1; j >= 0; j--) {
          if (j === i) continue;
          const q = this.projectiles[j];
          if (q.owner === p.owner) continue;
          if (Math.abs(q.x - p.x) < 20 && Math.abs(q.y - p.y) < 26) {
            this.fx.hitSpark((p.x + q.x) / 2, (p.y + q.y) / 2 - 10, 1, 1, false);
            this.fx.ring((p.x + q.x) / 2, (p.y + q.y) / 2 - 10, '#ffffff', 4, 26, 14);
            this.projectiles.splice(Math.max(i, j), 1);
            this.projectiles.splice(Math.min(i, j), 1);
            break;
          }
        }
      }
    }
  }

  // ═════════ 事件回调 ═════════
  onHit(def, atk, h, dmg) {
    const px = (def.x * 0.62 + atk.x * 0.38);
    const py = def.feetY - clamp(h.box.y + h.box.h * .5, 20, 90);
    this.fx.hitSpark(px, py, h.power || 0, atk.facing, false);
    if (h.fx === 'flame' || h.fx === 'flameBig') this.fx.flame(px, py, '#ff5a10', '#ffd24a', h.fx === 'flameBig' ? 16 : 8, 10, 3);
    if (h.fx === 'flameP') this.fx.flame(px, py, '#8b2ce0', '#f0b0ff', 10, 10, 3);
    if (h.fx === 'geyser') { for (let i = 0; i < 3; i++) this.fx.flame(px + rnd(-16, 16), py + rnd(-20, 30), '#2f9bff', '#dff0ff', 10, 8, 5); }
    this.audio.hitByPower(h.power || 0);
    this.shake(1.6 + (h.power || 0) * 2.2, 5 + (h.power || 0) * 4);
    this.hitFlash = h.power >= 2 ? 3 : 0;
    if (def.comboHits >= 3 && def.comboHits % 3 === 0) this.fx.text(def.x, def.feetY - 108, `${def.comboHits} HIT`, '#ffe14a', 34);
  }

  onGuard(def, atk, h) {
    const px = def.x + def.facing * -14;
    const py = def.feetY - (def.isCrouching() ? 34 : 56);
    this.fx.hitSpark(px, py, 0, atk.facing, true);
    this.audio.play('guard');
    this.shake(1, 3);
  }

  onThrow(def, atk, h) {
    this.fx.hitSpark(def.x, def.feetY - 50, 2, atk.facing, false);
    this.audio.play('grab');
    this.shake(4, 10);
  }

  onThrowTech(def, atk) {
    this.fx.text((def.x + atk.x) / 2, def.feetY - 90, 'TECH', '#9fd0ff', 32);
    this.fx.ring((def.x + atk.x) / 2, def.feetY - 50, '#9fd0ff', 4, 40, 16);
    this.audio.play('guard');
    def.vx = -def.facing * 3.2; atk.vx = -atk.facing * 3.2;
    def.canTech = 30;
    atk.mframe = atk.move ? atk.move.total - 6 : 0;
  }

  onSuperFreeze(f, m) {
    this.freeze = m.superFreeze || 28;
    this.superFlash = 14;
    this.audio.play('super');
    this.fx.ring(f.x, f.feetY - 46, f.char.color, 4, 90, 22);
    this.fx.flame(f.x, f.feetY - 40, f.char.color, '#ffffff', 18, 14, 4);
    this.shake(3, 16);
  }

  onMaxBurst(f) {
    this.fx.ring(f.x, f.feetY - 44, '#ffffff', 6, 70, 20);
    this.fx.ring(f.x, f.feetY - 44, f.char.color, 4, 54, 26);
    this.fx.flame(f.x, f.feetY - 30, f.char.color, '#ffffff', 22, 16, 4.5);
    this.audio.play('burst');
    this.shake(4, 16);
    this.superFlash = 8;
  }

  onStockGain(f) { this.audio.play('stock'); }

  onKO(loser, winner, h) {
    if (this.mode === 'training') { loser.hp = MAX_HP; loser.stunPoints = 0; return; }
    if (this.phase !== 'fight') return;
    loser.hp = 0;
    loser.setState('ko');
    loser.move = null;
    loser.stunLeft = 9999;
    loser.vx = -loser.facing * 4.5;
    loser.z = Math.max(loser.z, 2); loser.vz = 6.2; loser.airborne = true;
    loser.rushSeq = null; winner.rushSeq = null;
    this.phase = 'ko'; this.phaseT = 0;
    this.freeze = 26;
    this.slowmo = 130;
    this.superFlash = 16;
    this.setBanner('K.O.', null, 110);
    this.audio.play('ko');
    this.shake(7, 26);
    this.wins[winner.side]++;
    winner.wonRound = true;
  }

  onTimeOver() {
    if (this.phase !== 'fight') return;
    this.phase = 'timeover'; this.phaseT = 0;
    const [a, b] = this.fighters;
    if (a.hp === b.hp) { this.setBanner('DRAW', null, 110); }
    else {
      const wi = a.hp > b.hp ? 0 : 1;
      this.wins[wi]++;
      this.setBanner('TIME UP', `${this.fighters[wi].char.name} WINS`, 110);
    }
    this.audio.play('ko');
  }

  afterRound() {
    const [a, b] = this.fighters;
    if (this.wins[0] >= 2 || this.wins[1] >= 2) {
      const wi = this.wins[0] >= 2 ? 0 : 1;
      this.phase = 'matchover'; this.phaseT = 0;
      this.setBanner(this.mode === 'vs' ? `${wi === 0 ? '1P' : '2P'} WINS` : (wi === 0 ? 'YOU WIN' : 'YOU LOSE'),
                     this.fighters[wi].char.quote, 240);
      this.fighters[wi].setState('idle');
      this.fighters[wi].anim = { loop: false, keys: [[0, 'idle'], [10, 'taunt'], [24, 'win'], [200, 'win']] };
      this.fighters[wi].aframe = 0;
      this.audio.stopBGM();
    } else {
      this.round++;
      this.startRound();
    }
  }

  shake(amp, t) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = Math.max(this.shakeT, t); }

  updateCamera() {
    const [a, b] = this.fighters;
    const mid = (a.x + b.x) / 2;
    const target = clamp(mid - W / 2, 0, STAGE_W - W);
    this.camX = lerp(this.camX, target, .16);
  }

  // ═════════ 角色选择 ═════════
  updateSelect() {
    const s = this.sel;
    s.t++;
    if (keyPressed('KeyQ')) this.stageChoice = (this.stageChoice + 2) % 3;
    if (keyPressed('KeyE')) this.stageChoice = (this.stageChoice + 1) % 3;
    const p1 = this.pads[0];
    // 直接读键（选人界面不走 Pad 的朝向换算）
    const L = keyPressed('KeyA') || keyPressed('ArrowLeft');
    const R = keyPressed('KeyD') || keyPressed('ArrowRight');
    const U = keyPressed('KeyW') || keyPressed('ArrowUp');
    const Dn = keyPressed('KeyS') || keyPressed('ArrowDown');
    const OK = keyPressed('KeyJ') || keyPressed('Enter') || keyPressed('Space') || keyPressed('Numpad1');
    const CANCEL = keyPressed('KeyU') || keyPressed('Escape');

    if (U || Dn) { s.mode = (s.mode + (U ? -1 : 1) + 4) % 4; this.audio.play('cursor'); }
    if (!s.locked[0]) {
      if (L) { s.cursor[0] = (s.cursor[0] + ROSTER.length - 1) % ROSTER.length; this.audio.play('cursor'); }
      if (R) { s.cursor[0] = (s.cursor[0] + 1) % ROSTER.length; this.audio.play('cursor'); }
      if (OK) { s.locked[0] = true; this.audio.play('select'); }
    } else if (!s.locked[1]) {
      if (L) { s.cursor[1] = (s.cursor[1] + ROSTER.length - 1) % ROSTER.length; this.audio.play('cursor'); }
      if (R) { s.cursor[1] = (s.cursor[1] + 1) % ROSTER.length; this.audio.play('cursor'); }
      if (CANCEL) { s.locked[0] = false; this.audio.play('cursor'); }
      if (OK) {
        s.locked[1] = true;
        this.audio.play('select');
        this.mode = ['cpu', 'cpu', 'vs', 'training'][s.mode];
        this.aiLevel = s.mode === 0 ? 2 : (s.mode === 1 ? 4 : 3);
        this.startMatch(ROSTER[s.cursor[0]], ROSTER[s.cursor[1]]);
      }
    }
  }

  // ═════════════════════ 渲染 ═════════════════════
  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    if (this.phase === 'select') { this.drawSelect(ctx); ctx.restore(); return; }

    // 抖动
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      const k = this.shakeT / 26;
      sx = rnd(-1, 1) * this.shakeAmp * k;
      sy = rnd(-1, 1) * this.shakeAmp * k * .6;
      if (this.shakeT === 1) this.shakeAmp = 0;
    }
    ctx.translate(Math.round(sx), Math.round(sy));

    const cam = Math.round(this.camX);
    if (!this.assets.drawStage(ctx, this.stageChoice, cam)) this.stage.draw(ctx, cam);

    // 影子
    for (const f of this.fighters) drawShadow(ctx, f, cam, GROUND_Y);

    // 飞行道具（角色之后画光效，之前画本体）
    this.drawProjectiles(ctx, cam);

    // 角色（血少的画在前面）
    const order = this.fighters[0].z > this.fighters[1].z ? [1, 0] : [0, 1];
    for (const i of order) {
      const f = this.fighters[i];
      if (f.ghosts.length) drawAfterimage(ctx, f, f.ghosts, cam);
      // MAX 气焰
      if (f.maxMode > 0) this.drawAura(ctx, f, cam);
      if (!this.assets.drawFighter(ctx, f, cam)) {
        drawFighter(ctx, f, f.pose || POSE.idle, {
          camX: cam,
          flash: f.flash,
          rot: f.state === 'down' ? 0 : 0,
        });
      }
    }

    this.fx.draw(ctx, cam);

    if (this.showBoxes) this.drawBoxes(ctx, cam);

    ctx.restore();

    // 白闪
    if (this.superFlash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this.superFlash / 16, 0, 1) * .75;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (this.hitFlash > 0) {
      ctx.save(); ctx.globalAlpha = .22; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (this.freeze > 0) {
      // 超必定格：径向暗角 + 冲击线
      ctx.save();
      const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 190);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = .3;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * 6.284 + this.freeze * .05;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(a) * 60, H / 2 + Math.sin(a) * 60);
        ctx.lineTo(W / 2 + Math.cos(a) * 220, H / 2 + Math.sin(a) * 220);
        ctx.stroke();
      }
      ctx.restore();
    }

    this.hud.draw(ctx, this);
    if (this.banner) this.hud.drawBanner(ctx, this.banner.text, this.banner.sub, this.banner.t, this.banner.life);

    if (this.mode === 'training') this.drawTrainingInfo(ctx);
  }

  drawAura(ctx, f, cam) {
    const x = f.x - cam, y = f.feetY;
    const P = PALETTES[f.paletteName];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const t = this.frame * .12 + i * 1.6;
      const oy = -14 - i * 15 - (Math.sin(t) * 4);
      const r = 15 - i * 1.6 + Math.sin(t * 1.7) * 2.5;
      ctx.globalAlpha = .16 + .1 * Math.sin(t * .8);
      const g = ctx.createRadialGradient(x, y + oy, 0, x, y + oy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.4, P.aura2); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x + Math.sin(t * .9) * 3, y + oy, r, 0, 6.284); ctx.fill();
    }
    ctx.restore();
    if (this.frame % 4 === 0) this.fx.flame(f.x + rnd(-10, 10), f.feetY - rnd(0, 10), P.aura, P.aura2, 1, 6, 2.2);
  }

  drawProjectiles(ctx, cam) {
    for (const p of this.projectiles) {
      const s = p.spec;
      const x = p.x - cam, y = p.y - (s.ground ? 8 : 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wob = Math.sin(p.t * .4) * 2;
      for (let i = 0; i < 3; i++) {
        const r = (s.ground ? 13 : 11) - i * 2 + wob * .4;
        const g = ctx.createRadialGradient(x - p.facing * i * 4, y, 0, x - p.facing * i * 4, y, r * 1.7);
        g.addColorStop(0, '#ffffff'); g.addColorStop(.35, s.col2); g.addColorStop(.8, s.col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = .95 - i * .26;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x - p.facing * i * 5, y - (s.ground ? 0 : 0), r * 1.5, r * (s.ground ? 1.15 : 1.4), 0, 0, 6.284); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawBoxes(ctx, cam) {
    const rect = (b, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(b.x - cam) + .5, Math.round(b.y) + .5, b.w - 1, b.h - 1);
    };
    for (const f of this.fighters) {
      for (const hb of f.hurtboxes()) rect(hb, 'rgba(60,200,255,.85)');
      const pb = f.pushbox(); rect(pb, 'rgba(255,255,255,.35)');
      for (const { box } of f.activeHits()) {
        ctx.fillStyle = 'rgba(255,40,40,.22)';
        ctx.fillRect(box.x - cam, box.y, box.w, box.h);
        rect(box, 'rgba(255,60,60,.95)');
      }
      if (f.invuln > 0) { ctx.fillStyle = 'rgba(255,255,0,.16)'; const b = f.pushbox(); ctx.fillRect(b.x - cam, b.y, b.w, b.h); }
    }
    for (const p of this.projectiles) {
      rect(toWorld(p.spec.box, p.x, p.y, p.facing), 'rgba(255,120,40,.9)');
    }
  }

  drawTrainingInfo(ctx) {
    const f = this.fighters[0];
    ctx.save();
    ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const top = H - 86;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(4, top, 112, 36);
    ctx.fillStyle = '#9fe8ff';
    const m = f.move;
    ctx.fillText(`STATE ${f.state}`, 8, top + 3);
    ctx.fillText(`MOVE  ${f.moveId || '-'} ${m ? f.mframe + '/' + m.total : ''}`, 8, top + 11);
    const o = this.fighters[1];
    ctx.fillText(`COMBO ${o.comboHits}  DMG ${o.comboDmg | 0}`, 8, top + 19);
    ctx.fillText(`DIR ${this.pads[0].dir}  BTN ${this.pads[0].btn}`, 8, top + 27);
    ctx.restore();
  }

  // ——— 选人画面 ———
  drawSelect(ctx) {
    const s = this.sel;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1024'); g.addColorStop(.5, '#231436'); g.addColorStop(1, '#48132a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 斜纹背景
    ctx.save(); ctx.globalAlpha = .07;
    for (let i = -20; i < 40; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#ff8a2a';
      ctx.beginPath();
      ctx.moveTo(i * 14 + (s.t * .3) % 28, 0); ctx.lineTo(i * 14 + 8 + (s.t * .3) % 28, 0);
      ctx.lineTo(i * 14 - 30 + 8 + (s.t * .3) % 28, H); ctx.lineTo(i * 14 - 30 + (s.t * .3) % 28, H);
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold 15px "Arial Black", Arial';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    ctx.strokeText('SELECT YOUR FIGHTER', W / 2, 10);
    const tg = ctx.createLinearGradient(0, 10, 0, 26);
    tg.addColorStop(0, '#fff'); tg.addColorStop(.5, '#ffd24a'); tg.addColorStop(1, '#e04a08');
    ctx.fillStyle = tg; ctx.fillText('SELECT YOUR FIGHTER', W / 2, 10);

    // 角色格子
    const n = ROSTER.length, cw = 72, gap = 10;
    const total = n * cw + (n - 1) * gap;
    const x0 = (W - total) / 2;
    for (let i = 0; i < n; i++) {
      const id = ROSTER[i];
      const c = CHARACTERS[id];
      const x = x0 + i * (cw + gap), y = 38;
      const sel1 = s.cursor[0] === i, sel2 = s.cursor[1] === i;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, cw, 92);
      const pg = ctx.createLinearGradient(0, y, 0, y + 92);
      pg.addColorStop(0, shade(c.color, -.55)); pg.addColorStop(1, 'rgba(0,0,0,.2)');
      ctx.fillStyle = pg; ctx.fillRect(x + 2, y + 2, cw - 4, 88);

      // 头像（用骨架画一个站姿）
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 2, y + 2, cw - 4, 88); ctx.clip();
      const fake = { x: x + cw / 2, y: y + 92, z: 0, facing: 1,
                     paletteName: c.palette, hairStyle: c.hairStyle, outfit: c.outfit, cap: !!c.cap };
      drawFighter(ctx, fake, POSE.idle, { camX: 0, flash: 0 });
      ctx.restore();

      ctx.strokeStyle = sel1 && !s.locked[0] ? '#ffd24a' : (sel1 ? '#ff5a2a' : 'rgba(255,255,255,.18)');
      ctx.lineWidth = sel1 ? 2 : 1;
      ctx.strokeRect(x + .5, y + .5, cw - 1, 92 - 1);
      if (s.locked[0] && sel2) { ctx.strokeStyle = '#4aa8ff'; ctx.lineWidth = 2; ctx.strokeRect(x + 2.5, y + 2.5, cw - 5, 92 - 5); }

      ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      ctx.strokeText(c.name, x + cw / 2, y + 95); ctx.fillStyle = c.color; ctx.fillText(c.name, x + cw / 2, y + 95);
      ctx.font = '8px "Microsoft YaHei", Arial';
      ctx.lineWidth = 3; ctx.strokeText(c.cn, x + cw / 2, y + 106); ctx.fillStyle = '#d8dcea'; ctx.fillText(c.cn, x + cw / 2, y + 106);

      if (sel1) { ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 8px Arial'; ctx.fillText('1P', x + 8, y - 10); }
      if (s.locked[0] && sel2) { ctx.fillStyle = '#4aa8ff'; ctx.font = 'bold 8px Arial'; ctx.fillText(this.mode === 'vs' ? '2P' : 'CPU', x + cw - 10, y - 10); }
    }

    ctx.font = '7px monospace'; ctx.fillStyle = '#a8bfcb';
    ctx.fillText('Q / E  STAGE: ' + ['NIGHT STREET', 'TEMPLE', 'HARBOR'][this.stageChoice], W / 2, 149);
    // 模式
    const modes = ['VS CPU  (普通)', 'VS CPU  (高手)', 'VS 2P   (双人对战)', 'TRAINING (训练模式)'];
    ctx.font = '9px "Microsoft YaHei", Arial'; ctx.textAlign = 'center';
    for (let i = 0; i < modes.length; i++) {
      const sel = s.mode === i;
      ctx.fillStyle = sel ? '#ffd24a' : 'rgba(200,206,224,.45)';
      ctx.fillText((sel ? '▶ ' : '  ') + modes[i], W / 2, 160 + i * 12);
    }
    ctx.font = '8px "Microsoft YaHei", Arial'; ctx.fillStyle = '#6d768c';
    ctx.fillText(s.locked[0] ? '为对手选择角色 · J 确定 · U 返回' : 'W/S 选模式 · A/D 选人 · J 确定', W / 2, H - 10);
  }
}
