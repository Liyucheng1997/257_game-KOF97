// fighter.js —— 角色状态机 / 物理 / 判定 / 取消系统
import {
  GROUND_Y, STAGE_W, WALL_PAD, GRAVITY, WALK_F, WALK_B, RUN_SPD,
  JUMP_VY, HOP_VY, SUPERJUMP_VY, JUMP_VX, HOP_VX, PUSH_DIST,
  MAX_HP, MAX_POWER, MAX_STOCK, MAX_MODE_TIME, LV,
  clamp, sign, toWorld, overlap, rnd,
} from './core.js';
import { BTN, testMotion } from './input.js';
import { CHARACTERS, SYSTEM, mv } from './framedata.js';
import { ANIM, POSE, sampleAnim, blend } from './pose.js';

const PREJUMP = 3;          // 起跳预备帧
const THROW_RANGE = 27;
const CLOSE_RANGE = 46;     // 近身普通技判定距离
const TECH_WINDOW = 12;     // 投技受身窗口

export class Fighter {
  constructor(charId, side, game) {
    this.char = CHARACTERS[charId];
    this.charId = charId;
    this.side = side;                 // 0 = 1P, 1 = 2P
    this.game = game;
    // 只有同角色对战（镜像战）才用 2P 备用配色，避免两边都变成暗色
    const mirror = game.fighters?.[0]?.charId === charId;
    this.paletteName = (side === 1 && mirror) ? this.char.palette2 : this.char.palette;
    this.hairStyle = this.char.hairStyle;
    this.outfit = this.char.outfit;
    this.cap = !!this.char.cap;
    this.reset(side === 0 ? STAGE_W / 2 - 52 : STAGE_W / 2 + 52, side === 0 ? 1 : -1);
    this.hp = MAX_HP;
    this.power = 0;
    this.stock = 0;
  }

  reset(x, facing) {
    this.x = x; this.y = GROUND_Y; this.z = 0;
    this.vx = 0; this.vz = 0;
    this.facing = facing;
    this.state = 'idle';
    this.move = null; this.moveId = null; this.mframe = 0;
    this.anim = ANIM.idle; this.aframe = 0;
    this.hitstop = 0; this.freeze = 0;
    this.stateTimer = 0;
    this.airborne = false;
    this.prejump = 0; this.jumpDir = 0; this.jumpHeld = 0;
    this.invuln = 0; this.invulnType = null;
    this.comboHits = 0;      // 「我」当前正在被连的段数（连段计数挂在受击方身上）
    this.comboDmg = 0;
    this.juggle = 0;
    this.hitBy = null;
    this.hitList = new Set();
    this.stunPoints = 0; this.stunDecay = 0;
    this.dizzy = 0;
    this.maxMode = 0;
    this.guardTimer = 0;
    this.ghosts = [];
    this.flash = 0;
    this.rushSeq = null;
    this.throwVictim = null; this.thrownBy = null;
    this.pendingFollow = null;
    this.canTech = 0;
    this.wonRound = false;
    this.inputLock = 0;
    this.projCount = 0;
    this.lastMoveType = null;
    this.hasWhiffed = false;
  }

  resetRound(x, facing) {
    const hp = this.hp, power = this.power, stock = this.stock;
    this.reset(x, facing);
    this.hp = MAX_HP;
    this.power = power; this.stock = stock;
  }

  get grounded() { return this.z <= 0 && !this.airborne; }
  get feetY() { return this.y - this.z; }
  get opp() { return this.game.fighters[1 - this.side]; }

  // ——— 判定框 ———
  hurtboxes() {
    if (this.state === 'down' || this.invuln > 0) return [];
    const m = this.move;
    if (m && m.hurt) return m.hurt.map(b => this.wb(b));
    if (this.state === 'roll' || this.moveId === 'roll') return [this.wb({ x: -12, y: 0, w: 30, h: 34 })];
    if (this.z > 0 || this.airborne) return [this.wb({ x: -11, y: 12, w: 26, h: 68 })];
    if (this.isCrouching()) return [this.wb({ x: -12, y: 0, w: 30, h: 60 })];
    return [this.wb({ x: -11, y: 0, w: 26, h: 90 })];
  }

  pushbox() {
    if (this.state === 'down') return this.wb({ x: -16, y: 0, w: 38, h: 16 });
    if (this.isCrouching()) return this.wb({ x: -14, y: 0, w: 30, h: 58 });
    return this.wb({ x: -13, y: 0, w: 29, h: 88 });
  }

  wb(box) { return toWorld(box, this.x, this.feetY, this.facing); }

  activeHits() {
    const m = this.move;
    if (!m || !m.hits.length) return [];
    const out = [];
    for (let i = 0; i < m.hits.length; i++) {
      const h = m.hits[i];
      if (!h.f) continue;
      if (this.mframe >= h.f[0] && this.mframe <= h.f[1] && !this.hitList.has(i)) {
        out.push({ idx: i, h, box: this.wb(h.box) });
      }
    }
    return out;
  }

  isCrouching() {
    return this.state === 'crouch' || this.state === 'guardlow' ||
           (this.move && this.move.cond === 'crouch' && this.grounded);
  }

  // ═══════════════════ 每帧更新 ═══════════════════
  update(pad) {
    this.pad = pad;
    if (this.freeze > 0) { this.freeze--; return; }          // 超必定格
    if (this.hitstop > 0) { this.hitstop--; this.flash *= .8; if (this.flash < .06) this.flash = 0; return; }

    this.flash *= .74;
    if (this.flash < .06) this.flash = 0;
    if (this.invuln > 0) this.invuln--;
    if (this.inputLock > 0) this.inputLock--;
    if (this.canTech > 0) this.canTech--;
    if (this.guardTimer > 0) this.guardTimer--;
    if (this.maxMode > 0 && --this.maxMode === 0) this.game.fx.ring(this.x, this.feetY - 44, '#ffffff', 30, 6, 14);
    if (this.stunDecay > 0) { if (--this.stunDecay === 0) this.stunPoints = Math.max(0, this.stunPoints - 1), this.stunDecay = 8; }
    if (this.dizzy > 0) this.dizzy--;

    this.stateTimer++;

    // 面向（不在招式/受击中时自动转身）
    if (this.canTurn()) {
      const o = this.opp;
      if (o) {
        const nf = o.x < this.x ? -1 : 1;
        if (nf !== this.facing && Math.abs(o.x - this.x) > 6) this.facing = nf;
      }
    }

    this.think();
    this.physics();
    this.advanceAnim();

    // 残影（MAX 模式 / 突进技）
    const wantGhost = this.maxMode > 0 || (this.move && this.move.type === 'dm');
    if (wantGhost && this.game.frame % 2 === 0) {
      this.ghosts.push({ x: this.x, y: this.y, z: this.z, facing: this.facing, pose: this.pose });
      if (this.ghosts.length > 4) this.ghosts.shift();
    } else if (this.ghosts.length && this.game.frame % 2 === 0) this.ghosts.shift();
  }

  canTurn() {
    return !this.move && this.grounded &&
      ['idle', 'walkf', 'walkb', 'crouch', 'guard', 'guardlow', 'run', 'runstop'].includes(this.state);
  }

  // ═══════════════════ 决策 ═══════════════════
  think() {
    const pad = this.pad;
    if (this.dizzy > 0) { this.setState('dizzy'); return; }
    if (this.state === 'hit' || this.state === 'blockstun' || this.state === 'down' ||
        this.state === 'wakeup' || this.state === 'thrown' || this.state === 'ko') {
      this.updateStunState();
      return;
    }
    if (this.inputLock > 0) return;

    // —— 招式进行中 ——
    if (this.move) {
      this.updateMove();
      return;
    }

    // —— 自由状态 ——
    if (this.prejump > 0) {
      if (pad.dir >= 7) this.jumpHeld++;
      if (--this.prejump === 0) this.launchJump();
      return;
    }
    if (this.state === 'landing') {
      if (this.stateTimer >= 3) this.setState('idle');
      return;
    }

    if (this.grounded) this.groundActions();
    else this.airActions();
  }

  // ——— 地面自由行动 ———
  groundActions() {
    const pad = this.pad, d = pad.dir;

    // 1) 超必杀 / 必杀
    if (this.tryMeterMoves()) return;
    if (this.trySpecials()) return;

    // 2) 翻滚（A+B）—— 必须排在普通技之前，否则会被 B 抢先
    if (pad.multiPressed(BTN.A | BTN.B)) {
      this.startMove(d === 4 || d === 1 || d === 7 ? SYSTEM.rollBack : SYSTEM.roll, 'roll');
      this.game.fx.dust(this.x, this.feetY, -this.facing, 5);
      this.game.audio.play('roll');
      return;
    }

    // 3) 投技 / 普通技
    if (this.tryThrow()) return;
    if (this.tryNormals()) return;

    if (d >= 7) { this.prejump = PREJUMP; this.jumpDir = d - 8; this.jumpHeld = 0; this.setState('prejump'); return; }
    if (pad.doubleTap(4)) {
      this.startMove(SYSTEM.backdash, 'backdash');
      this.game.fx.dust(this.x, this.feetY, this.facing, 5);
      this.game.audio.play('dash');
      return;
    }
    if (pad.doubleTap(6) && this.state !== 'run') {
      this.setState('run');
      this.game.fx.dust(this.x, this.feetY, -this.facing, 4);
      return;
    }

    // 3) 移动
    if (this.state === 'run') {
      if (d === 6 || d === 9 || d === 3) {
        this.vx = this.facing * RUN_SPD;
        if (this.stateTimer % 8 === 0) this.game.fx.dust(this.x - this.facing * 8, this.feetY, -this.facing, 2);
      } else { this.setState('runstop'); this.vx = this.facing * 1.2; }
      return;
    }
    if (this.state === 'runstop') {
      this.vx *= .6;
      if (this.stateTimer >= 5) this.setState('idle');
      return;
    }

    if (d === 2 || d === 1 || d === 3) { this.setState(d === 1 ? 'crouch' : 'crouch'); this.vx = 0; return; }
    if (d === 6) { this.setState('walkf'); this.vx = this.facing * WALK_F; return; }
    if (d === 4) { this.setState('walkb'); this.vx = -this.facing * WALK_B; return; }
    this.setState('idle'); this.vx = 0;
  }

  airActions() {
    if (this.trySpecialsAir()) return;
    const pad = this.pad;
    // 空中普通技
    const N = this.char.normals;
    const AB = BTN.A | BTN.B, CD = BTN.C | BTN.D;
    if (pad.multiPressed(CD)) return this.startMove(N.airCD, 'airCD');
    if (pad.edge(BTN.C, CD)) return this.startMove(N.jC, 'jC');
    if (pad.edge(BTN.D, CD)) return this.startMove(N.jD, 'jD');
    if (pad.edge(BTN.A, AB)) return this.startMove(N.jA, 'jA');
    if (pad.edge(BTN.B, AB)) return this.startMove(N.jB, 'jB');
    this.setState('air');
  }

  launchJump() {
    const dir = this.jumpDir;                     // -1 后 / 0 上 / 1 前
    const isHop = this.jumpHeld < 2;              // 轻点 = 小跳（97 手感核心）
    const superJ = this.crouchedRecently > 0 && !isHop;
    this.z = 0.1;
    this.vz = isHop ? -HOP_VY : (superJ ? -SUPERJUMP_VY : -JUMP_VY);
    this.vx = dir * this.facing * (isHop ? HOP_VX : JUMP_VX);
    this.airborne = true;
    this.isHop = isHop;
    this.setState('air');
    this.game.fx.dust(this.x, this.feetY, -this.facing, 4);
    this.game.audio.play('jump');
  }

  // ═══════════════════ 招式触发 ═══════════════════
  // 拳 = A/C，脚 = B/D；重击优先（同帧按下时出重的那一版）
  btnClass(cls) {
    const p = this.pad;
    const AB = BTN.A | BTN.B, CD = BTN.C | BTN.D;
    if (cls === 'P') return p.edge(BTN.C, CD) ? 'C' : (p.edge(BTN.A, AB) ? 'A' : null);
    if (cls === 'K') return p.edge(BTN.D, CD) ? 'D' : (p.edge(BTN.B, AB) ? 'B' : null);
    return null;
  }

  tryMeterMoves() {
    const pad = this.pad;
    // MAX 爆气 (A+B+C)
    if (this.stock >= 1 && this.maxMode === 0 && pad.multiPressed(BTN.A | BTN.B | BTN.C, 4)) {
      this.stock--;
      this.maxMode = MAX_MODE_TIME;
      this.startMove(SYSTEM.maxMode, 'maxMode');
      this.game.onMaxBurst(this);
      return true;
    }
    return this.tryDM();
  }

  // 指令复杂的招式必须先判定：623 的轨迹里天然包含 236，若先查 236 就永远出不了升龙
  static PRIO = { QCBHCF: 7, QCFHCB: 7, GEYSER: 6, DPx2: 6, QCFx2: 5, QCBx2: 5, HCF: 4, HCB: 4, DP: 3, RDP: 3, QCB: 2, QCF: 2, DD: 1 };
  specialKeys() {
    const c = this.char;
    if (!c._spOrder) {
      const P = Fighter.PRIO;
      c._spOrder = Object.keys(c.specials)
        .filter(k => c.specials[k].motion)
        .sort((a, b) => (P[c.specials[b].motion] || 0) - (P[c.specials[a].motion] || 0));
    }
    return c._spOrder;
  }

  tryDM(fromCancel = false) {
    if (this.stock < 1) return false;
    const sp = this.char.specials;
    for (const key of this.specialKeys()) {
      const m = sp[key];
      if (m.type !== 'dm') continue;
      const b = this.btnClass(m.btn);
      if (!b) continue;
      if (!testMotion(this.pad, m.motion)) continue;
      const isMax = this.maxMode > 0 && this.stock >= 1;
      this.stock -= 1;
      if (isMax) this.maxMode = Math.min(this.maxMode, 30);
      this.startMove(m, key, { button: b, max: isMax });
      this.game.onSuperFreeze(this, m);
      return true;
    }
    return false;
  }

  trySpecials(fromCancel = false) {
    const sp = this.char.specials;
    for (const key of this.specialKeys()) {
      const m = sp[key];
      if (m.type === 'dm') continue;
      if (m.cond === 'air') continue;
      const b = this.btnClass(m.btn);
      if (!b) continue;
      if (!testMotion(this.pad, m.motion)) continue;
      this.startMove(m, key, { button: b });
      return true;
    }
    return false;
  }

  trySpecialsAir() {
    const sp = this.char.specials;
    for (const key of this.specialKeys()) {
      const m = sp[key];
      if (m.cond !== 'air') continue;
      const b = this.btnClass(m.btn);
      if (!b) continue;
      if (!testMotion(this.pad, m.motion)) continue;
      this.startMove(m, key, { button: b });
      return true;
    }
    return false;
  }

  tryThrow() {
    const pad = this.pad, o = this.opp;
    if (!o) return false;
    const dist = Math.abs(o.x - this.x);
    const towards = pad.dir === 6 || pad.dir === 4 || pad.dir === 5;
    if (!towards || dist > THROW_RANGE) return false;
    const CD = BTN.C | BTN.D;
    if (!(pad.edge(BTN.C, CD) || pad.edge(BTN.D, CD))) return false;
    if (!o.grounded || o.state === 'down' || o.invuln > 0 || o.invulnType === 'throw') return false;
    if (o.state === 'hit' || o.state === 'thrown') return false;
    this.startMove(SYSTEM.throwF, 'throwF');
    return true;
  }

  tryNormals() {
    const pad = this.pad, N = this.char.normals;
    const o = this.opp;
    const close = o ? Math.abs(o.x - this.x) < CLOSE_RANGE : false;
    const crouch = pad.dir === 1 || pad.dir === 2 || pad.dir === 3;
    const AB = BTN.A | BTN.B, CD = BTN.C | BTN.D;

    if (pad.multiPressed(CD)) { this.startMove(N.blowCD, 'blowCD'); return true; }
    if (crouch) {
      if (pad.edge(BTN.D, CD)) return this.startMove(N.crD, 'crD'), true;
      if (pad.edge(BTN.C, CD)) return this.startMove(N.crC, 'crC'), true;
      if (pad.edge(BTN.B, AB)) return this.startMove(N.crB, 'crB'), true;
      if (pad.edge(BTN.A, AB)) return this.startMove(N.crA, 'crA'), true;
    } else {
      if (pad.edge(BTN.D, CD)) return this.startMove(close ? N.stD_close : N.stD, close ? 'stD_close' : 'stD'), true;
      if (pad.edge(BTN.C, CD)) return this.startMove(close ? N.stC_close : N.stC, close ? 'stC_close' : 'stC'), true;
      if (pad.edge(BTN.B, AB)) return this.startMove(N.stB, 'stB'), true;
      if (pad.edge(BTN.A, AB)) return this.startMove(N.stA, 'stA'), true;
    }
    return false;
  }

  // ═══════════════════ 招式执行 ═══════════════════
  startMove(m, id, opt = {}) {
    if (this.pad) this.pad.consumeEdges();   // 这次输入已被消费，不让它再触发下一招
    this.move = m; this.moveId = id; this.mframe = 0;
    this.hitList.clear();
    this.moveOpt = opt;
    this.moveHit = false;
    this.pendingFollow = null;
    this.state = 'attack';
    this.stateTimer = 0;
    this.anim = m.anim || ANIM.idle;
    this.aframe = 0;
    if (m.inv) { this.invuln = m.inv[1] - m.inv[0] + 1; this.invulnType = m.inv[2]; }
    if (m.meter) this.addPower(m.meter);
    if (m.type === 'special' || m.type === 'dm') this.game.audio.play(m.sfx || 'swing');
    else if (m.hits.length) this.game.audio.play('swing');
    this.crouchedRecently = 0;
    if (!this.grounded) this.airborne = true;
    return true;
  }

  updateMove() {
    const m = this.move;
    this.mframe++;

    // 位移
    for (const mo of (m.moves || [])) {
      if (this.mframe >= mo[0] && this.mframe <= mo[1]) {
        this.vx = this.facing * mo[2];
        if (mo[3]) this.vz = mo[3];
      }
    }
    if (m.moves && m.moves.length) {
      const inAny = m.moves.some(mo => this.mframe >= mo[0] && this.mframe <= mo[1]);
      if (!inAny && this.grounded) this.vx *= .72;
    } else if (this.grounded) this.vx *= .7;

    // 腾空型招式
    if (m.airborne && this.mframe === m.airborne[0]) {
      this.z = 0.5;
      this.vz = m.riseVz || (m.inv && m.inv[2] === 'full' ? 9.6 : 7.6);
      this.airborne = true;
    }

    // 飞行道具
    if (m.spawn && this.mframe === m.spawn.f) {
      this.game.spawnProjectile(this, m.spawn.proj);
      this.game.audio.play('fireball');
    }

    // 追加输入
    if (m.followUp) {
      const fu = m.followUp;
      if (this.mframe >= fu.window[0] && this.mframe <= fu.window[1] && this.btnClass(fu.input)) {
        this.pendingFollow = fu.move;
      }
      if (this.pendingFollow && this.mframe >= fu.window[0]) {
        const nm = this.char.specials[this.pendingFollow];
        if (nm && (this.moveHit || this.mframe >= m.startup + m.active)) {
          this.startMove(nm, this.pendingFollow);
          return;
        }
      }
    }

    // 取消（命中后可取消到必杀 / 超必）
    if (m.cancel && m.cancel.length && (this.moveHit || m.whiffCancel)) {
      if (m.cancel.includes('dm') && this.tryDM(true)) return;
      if (m.cancel.includes('special') && this.trySpecials(true)) return;
      if (m.cancel.includes('normal') && this.mframe >= m.startup && this.tryChainNormal()) return;
    }

    // 腾空技落地
    if (m.airborne && this.airborne && this.z <= 0 && this.vz < 0) {
      this.z = 0; this.vz = 0; this.airborne = false;
      this.mframe = Math.max(this.mframe, m.total - 10);
      this.game.fx.dust(this.x, this.feetY, this.facing, 5);
    }

    // 空中普通技落地即结束
    if (m.cond === 'air' && this.z <= 0 && !this.airborne) { this.endMove(); this.setState('landing'); return; }

    if (this.mframe >= m.total) this.endMove();
  }

  // 目押连携（KOF 的「轻击互连」）：轻拳/轻脚之间可以互相取消，轻击也能取消进重击；
  // 重击之后不能再连普通技，必须用必杀技取消。
  tryChainNormal() {
    const pad = this.pad, N = this.char.normals;
    const cur = this.moveId;
    const weight = id => id.endsWith('A') ? 0 : id.endsWith('B') ? 0 : 1;   // 0=轻 1=重
    const known = ['stA', 'crA', 'stB', 'crB', 'stC_close', 'stC', 'crC', 'stD_close', 'stD', 'crD'];
    if (known.indexOf(cur) < 0) return false;
    if (weight(cur) === 1) return false;                 // 重击不能再连普通技
    const crouch = pad.dir === 1 || pad.dir === 2 || pad.dir === 3;
    const AB = BTN.A | BTN.B, CD = BTN.C | BTN.D;
    let nid = null;
    if (pad.edge(BTN.D, CD)) nid = crouch ? 'crD' : 'stD_close';
    else if (pad.edge(BTN.C, CD)) nid = crouch ? 'crC' : 'stC_close';
    else if (pad.edge(BTN.B, AB)) nid = crouch ? 'crB' : 'stB';
    else if (pad.edge(BTN.A, AB)) nid = crouch ? 'crA' : 'stA';
    if (!nid || nid === cur) return false;
    this.startMove(N[nid], nid);
    return true;
  }

  endMove() {
    this.move = null; this.moveId = null; this.mframe = 0;
    this.invulnType = null;
    if (!this.grounded || this.z > 0) this.setState('air');
    else this.setState('idle');
  }

  // ═══════════════════ 受击状态 ═══════════════════
  updateStunState() {
    const s = this.state;
    if (s === 'blockstun' || s === 'hit') {
      // 防御取消（GC 翻滚 / GC 吹飞）
      if (s === 'blockstun' && this.stock >= 1) {
        if (this.pad.multiPressed(BTN.A | BTN.B)) {
          this.stock--; this.startMove(SYSTEM.guardCancelRoll, 'roll');
          this.game.fx.ring(this.x, this.feetY - 44, '#9fd0ff', 6, 40, 16);
          this.game.audio.play('roll'); return;
        }
        if (this.pad.multiPressed(BTN.C | BTN.D)) {
          this.stock--; this.startMove(SYSTEM.guardCancelCD, 'gcCD');
          this.game.fx.ring(this.x, this.feetY - 44, '#ffd24a', 6, 44, 16);
          return;
        }
      }
      if (--this.stunLeft <= 0) {
        if (this.z > 0) this.setState('air');
        else { this.setState('idle'); this.endCombo(); }
      }
      this.vx *= this.grounded ? .82 : 1;
      return;
    }
    if (s === 'thrown') {
      if (--this.stunLeft <= 0) this.knockDown(true);
      return;
    }
    if (s === 'down') {
      // 倒地
      if (this.z > 0) return;
      if (--this.stunLeft <= 0) {
        this.setState('wakeup');
        this.stunLeft = 16;
        this.invuln = 14; this.invulnType = 'full';
        this.anim = ANIM.getup; this.aframe = 0;
      }
      return;
    }
    if (s === 'wakeup') {
      if (--this.stunLeft <= 0) { this.setState('idle'); this.endCombo(); }
      return;
    }
    if (s === 'ko') {
      this.vx *= .96;
      return;
    }
  }

  // ═══════════════════ 被打中 ═══════════════════
  // 返回 'hit' | 'guard' | 'miss'
  receiveHit(atk, h, hitIdx) {
    // 无敌
    if (this.invuln > 0 && this.invulnType === 'full') return 'miss';
    if (this.state === 'down' || this.state === 'ko') return 'miss';

    const guard = this.checkGuard(atk, h);
    const dmgScale = this.comboScale();
    const maxBonus = atk.maxMode > 0 ? 1.12 : 1;

    if (guard) {
      const chip = (h.chip || 0);
      this.hp = Math.max(1, this.hp - chip);
      this.stunLeft = h.bstun;
      this.setState(this.isCrouching() ? 'blockstun' : 'blockstun');
      this.blockLow = this.isCrouching();
      this.vx = -this.facing * (h.pushEnemy * .55);
      this.guardTimer = h.bstun + 6;
      this.addPower(2);
      atk.addPower(1);
      this.game.onGuard(this, atk, h);
      return 'guard';
    }

    // 命中
    let dmg = Math.round(h.dmg * dmgScale * maxBonus);
    if (dmg < 1 && h.dmg > 0) dmg = 1;
    this.hp = Math.max(0, this.hp - dmg);
    this.comboHits++;
    this.comboDmg += dmg;

    this.stunPoints += h.dmg * .8;
    this.stunDecay = 60;

    this.hitstop = h.hitstop;
    atk.hitstop = h.hitstop;
    this.flash = 1;
    atk.moveHit = true;

    this.addPower(3);
    atk.addPower(4);

    const airHit = !this.grounded || this.z > 0;
    const kd = h.knockdown || (airHit && h.launch >= 0);

    if (h.rush) {
      // 乱舞：锁定对手连打
      atk.rushSeq = { target: this, left: h.rush, dmg: h.rushDmg, timer: 0, fx: h.fx };
      atk.moveHit = true;
      this.stunLeft = h.stun; this.setState('hit');
      this.vx = 0;
      this.game.onHit(this, atk, h, dmg);
      return 'hit';
    }

    if (h.launch > 0 || airHit) {
      this.z = Math.max(this.z, 1);
      this.vz = h.launch > 0 ? h.launch : Math.max(2.2, this.vz * .3 + 2.4);
      this.airborne = true;
      this.vx = -this.facing * (h.pushEnemy * .8 + 1.2);
      this.setState('hit');
      this.stunLeft = h.stun + 10;
      this.knockedDown = true;
      this.juggle++;
    } else if (kd) {
      this.vx = -this.facing * (h.pushEnemy + 1.5);
      this.z = 1; this.vz = 3.6; this.airborne = true;
      this.setState('hit'); this.stunLeft = h.stun;
      this.knockedDown = true;
    } else {
      this.vx = -this.facing * h.pushEnemy * .5;
      this.setState('hit');
      this.stunLeft = h.stun;
      this.knockedDown = false;
      this.hitPose = h.lvl === LV.LOW || this.isCrouching() ? 'hitlow' : (h.power >= 2 ? 'hit2' : 'hit1');
    }

    // 眩晕
    if (this.stunPoints >= 62 && this.grounded && !this.knockedDown) {
      this.stunPoints = 0; this.dizzy = 150;
      this.game.fx.text(this.x, this.feetY - 100, 'STUN!', '#ffe14a', 60);
    }

    this.game.onHit(this, atk, h, dmg);
    if (this.hp <= 0) this.game.onKO(this, atk, h);
    return 'hit';
  }

  checkGuard(atk, h) {
    if (h.lvl === LV.UNBLOCK) return false;
    if (!this.grounded) return false;                     // KOF97 无空中防御
    if (this.state === 'attack' && this.move && this.move.type !== 'system') return false;
    if (this.state === 'hit' || this.state === 'down' || this.state === 'wakeup' || this.dizzy > 0) return false;
    const d = this.pad ? this.pad.dir : 5;
    const holdingBack = d === 4 || d === 1 || d === 7;
    if (!holdingBack && this.state !== 'blockstun') return false;
    if (this.state === 'blockstun' && !holdingBack) return false;
    const crouchGuard = d === 1 || (this.state === 'blockstun' && this.blockLow && d === 1);
    if (h.lvl === LV.LOW && !crouchGuard) return false;
    if (h.lvl === LV.OVERHEAD && crouchGuard) return false;
    return true;
  }

  // 连段伤害递减（KOF 的补正思路：连得越长，后续伤害越低）
  comboScale() {
    const c = this.comboHits;
    if (c <= 0) return 1;
    return Math.max(.32, 1 - c * .085);
  }

  endCombo() { this.comboHits = 0; this.comboDmg = 0; this.juggle = 0; }

  // 被投
  receiveThrow(atk, h) {
    if (this.invuln > 0 || this.state === 'down' || !this.grounded) return false;
    // 投技受身
    if (this.pad && (this.pad.pressed(BTN.C) || this.pad.pressed(BTN.D)) && this.canTech <= 0) {
      this.game.onThrowTech(this, atk);
      return false;
    }
    this.hp = Math.max(0, this.hp - h.dmg);
    this.setState('thrown');
    this.stunLeft = 16;
    this.hitstop = h.hitstop;
    atk.hitstop = h.hitstop;
    atk.moveHit = true;
    this.facing = -atk.facing;
    this.x = atk.x + atk.facing * 22;
    this.addPower(3); atk.addPower(6);
    this.game.onThrow(this, atk, h);
    if (this.hp <= 0) this.game.onKO(this, atk, h);
    return true;
  }

  knockDown(hard) {
    this.setState('down');
    this.stunLeft = hard ? 26 : 20;
    this.anim = ANIM.down; this.aframe = 0;
    this.vx = 0; this.vz = 0; this.z = 0; this.airborne = false;
    this.endCombo();
    this.game.fx.dust(this.x, this.feetY, -this.facing, 8);
    this.game.shake(4, 8);
    this.game.audio.play('down');
  }

  // ═══════════════════ 物理 ═══════════════════
  physics() {
    this.x += this.vx;

    if (this.z > 0 || this.airborne) {
      this.z += this.vz;
      this.vz -= GRAVITY;
      if (this.z <= 0) {
        this.z = 0; this.airborne = false;
        this.onLand();
      }
    }

    // 舞台边界
    const min = WALL_PAD, max = STAGE_W - WALL_PAD;
    if (this.x < min) { this.x = min; if (this.vx < 0) this.vx = 0; }
    if (this.x > max) { this.x = max; if (this.vx > 0) this.vx = 0; }
  }

  onLand() {
    this.vz = 0;
    if (this.state === 'hit' || this.state === 'thrown') {
      // 空中受身
      if (this.pad && this.pad.multiPressed(BTN.A | BTN.B, 6) && this.knockedDown && this.stunLeft > 0) {
        this.setState('wakeup'); this.stunLeft = 12; this.invuln = 12; this.invulnType = 'full';
        this.anim = ANIM.getup; this.aframe = 6;
        this.game.fx.dust(this.x, this.feetY, this.facing, 6);
        this.vx = 0; this.endCombo();
        return;
      }
      this.knockDown(true);
      return;
    }
    if (this.state === 'ko') { this.knockDownKO(); return; }
    if (this.move && this.move.cond === 'air') { this.endMove(); this.setState('landing'); return; }
    if (this.move && this.move.airborne) return;
    this.setState('landing');
    this.vx = 0;
    this.game.fx.dust(this.x, this.feetY, this.facing, 4);
    this.game.audio.play('land');
  }

  knockDownKO() {
    this.setState('down'); this.stunLeft = 99999;
    this.anim = ANIM.down; this.aframe = 0;
    this.z = 0; this.vz = 0; this.airborne = false;
    this.game.shake(6, 14);
  }

  // ═══════════════════ 动画 ═══════════════════
  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
    switch (s) {
      case 'idle': this.anim = ANIM.idle; this.aframe = 0; this.move = null; break;
      case 'walkf': this.anim = ANIM.walkf; break;
      case 'walkb': this.anim = ANIM.walkb; break;
      case 'run': this.anim = ANIM.run; this.aframe = 0; break;
      case 'runstop': this.anim = ANIM.idle; break;
      case 'crouch': this.anim = ANIM.crouch; this.aframe = 0; this.crouchedRecently = 10; break;
      case 'prejump': this.anim = ANIM.crouch; this.aframe = 0; break;
      case 'air': this.anim = this.isHop ? ANIM.hop : ANIM.jump; this.aframe = 0; break;
      case 'landing': this.anim = ANIM.crouch; this.aframe = 2; break;
      case 'blockstun': this.anim = this.isCrouching() || this.blockLow ? ANIM.guardlow : ANIM.guard; this.aframe = 0; break;
      case 'wakeup': this.anim = ANIM.getup; this.aframe = 0; break;
      case 'dizzy': this.anim = ANIM.idle; break;
    }
  }

  advanceAnim() {
    if (this.crouchedRecently > 0) this.crouchedRecently--;

    // 姿势选择
    if (this.move) {
      this.pose = sampleAnim(this.move.anim || ANIM.idle, this.mframe);
      return;
    }
    switch (this.state) {
      case 'hit': {
        const t = clamp(this.stunLeft / 12, 0, 1);
        if (!this.grounded || this.z > 0) this.pose = POSE.hitair;
        else this.pose = blend(POSE[this.hitPose || 'hit1'], POSE.idle, 1 - t);
        return;
      }
      case 'thrown': this.pose = POSE.hitair; return;
      case 'down': this.aframe++; this.pose = sampleAnim(ANIM.down, this.aframe); return;
      case 'ko': this.pose = POSE.blowaway; return;
      case 'wakeup': this.aframe++; this.pose = sampleAnim(ANIM.getup, this.aframe); return;
      case 'dizzy': {
        this.aframe++;
        const w = Math.sin(this.aframe * .12);
        this.pose = blend(POSE.hit1, POSE.idle, .5 + w * .5);
        return;
      }
      case 'blockstun': this.aframe++; this.pose = sampleAnim(this.blockLow ? ANIM.guardlow : ANIM.guard, this.aframe); return;
      case 'air': {
        this.aframe++;
        this.pose = sampleAnim(this.isHop ? ANIM.hop : ANIM.jump, this.aframe);
        return;
      }
      case 'prejump': this.aframe++; this.pose = sampleAnim(ANIM.crouch, this.aframe); return;
    }
    // 近身防御姿势（对手正在出招时自动摆防御架势）
    const o = this.opp;
    const proximityGuard = o && o.move && o.move.hits.length && this.grounded &&
      Math.abs(o.x - this.x) < 84 && (this.pad && (this.pad.dir === 4 || this.pad.dir === 1));
    if (proximityGuard) {
      this.aframe++;
      this.pose = sampleAnim(this.pad.dir === 1 ? ANIM.guardlow : ANIM.guard, this.aframe);
      return;
    }
    this.aframe++;
    this.pose = sampleAnim(this.anim, this.aframe);
  }

  // ═══════════════════ 能量 ═══════════════════
  addPower(v) {
    if (this.maxMode > 0) return;
    this.power += v;
    while (this.power >= MAX_POWER && this.stock < MAX_STOCK) { this.power -= MAX_POWER; this.stock++; this.game.onStockGain(this); }
    if (this.stock >= MAX_STOCK) this.power = 0;
  }
}
