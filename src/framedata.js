// framedata.js —— 招式表 / 帧数据
// 判定框局部坐标：x 向前为正，y 向上（0=脚底），w/h 为宽高。
// 帧号从 0 开始；startup 帧内无判定，active 期间出判定，recovery 后回到可控。

import { LV } from './core.js';

// 招式默认值
const DEF = {
  type: 'normal',        // normal | special | dm | throw | system
  cond: 'stand',         // stand | crouch | air | any
  close: null,           // true=近身版 false=远版 null=不区分
  cost: 0,               // 消耗能量格
  startup: 4, active: 3, recovery: 10,
  cancel: [],            // 可取消到的类别：'normal' 'special' 'dm'
  cancelable: 'hit',     // 'hit'=命中/防住可取消  'always'=空振也能取消
  whiffCancel: false,
  hits: [],
  moves: [],             // [[f0,f1,vx,vy]] 施加的位移
  inv: null,             // [f0,f1,'full'|'low'|'high'|'throw']
  spawn: null,           // {f, proj}
  anim: null,
  meter: 2,              // 出招获得能量（命中另计）
  sfx: 'swing',
  turnAround: true,      // 出招期间是否会转身（一般否）
  followUp: null,        // 追加输入
  autoGuardBreak: false,
  landCancel: false,
  airOnly: false,
  superFreeze: 0,        // DM 定格帧
  proximity: 0,
};

const HDEF = {
  dmg: 6, stun: 14, bstun: 11, hitstop: 9,
  pushSelf: 0.6, pushEnemy: 2.4, lvl: LV.MID,
  knockdown: false, launch: 0, juggle: false,
  chip: 0,               // 防御时削血
  fx: 'hit', power: 0,   // power 0..2 决定火花大小
};

export function mv(cfg) {
  const m = Object.assign({}, DEF, cfg);
  m.hits = (cfg.hits || []).map(h => Object.assign({}, HDEF, h));
  m.total = m.startup + m.active + m.recovery;
  return m;
}

// ═════════════════════ 通用普通技 ═════════════════════
// box 写法: [x, y, w, h]
const B = (x, y, w, h) => ({ x, y, w, h });

export function makeNormals(s = 1) {
  const d = v => Math.max(1, Math.round(v * s));
  return {
    // —— 站立轻拳 (A) ——
    stA: mv({
      startup: 3, active: 2, recovery: 6, cancel: ['normal', 'special', 'dm'], whiffCancel: true,
      anim: { keys: [[0, 'jabWind'], [3, 'jabHit'], [5, 'jabHit'], [11, 'idle']] },
      hits: [{ f: [3, 4], box: B(14, 52, 24, 12), dmg: d(4), stun: 12, bstun: 10, hitstop: 8, power: 0 }],
    }),
    // —— 站立轻脚 (B) ——
    stB: mv({
      startup: 4, active: 3, recovery: 8, cancel: ['normal', 'special', 'dm'],
      anim: { keys: [[0, 'kickWind'], [4, 'kickLow'], [7, 'kickLow'], [15, 'idle']] },
      hits: [{ f: [4, 6], box: B(16, 22, 26, 12), dmg: d(4), stun: 12, bstun: 10, hitstop: 8, lvl: LV.MID }],
    }),
    // —— 站立重拳 (C) 近 ——
    stC_close: mv({
      startup: 5, active: 3, recovery: 13, close: true, cancel: ['special', 'dm'],
      anim: { keys: [[0, 'strongWind'], [5, 'uppercut'], [8, 'uppercut'], [21, 'idle']] },
      hits: [{ f: [5, 7], box: B(6, 56, 22, 34), dmg: d(9), stun: 18, bstun: 13, hitstop: 11, power: 1, pushEnemy: 2.6 }],
    }),
    // —— 站立重拳 (C) 远 ——
    stC: mv({
      startup: 7, active: 4, recovery: 15, close: false, cancel: [],
      anim: { keys: [[0, 'strongWind'], [7, 'strongHit'], [11, 'strongHit'], [26, 'idle']] },
      hits: [{ f: [7, 10], box: B(20, 50, 30, 14), dmg: d(10), stun: 19, bstun: 14, hitstop: 12, power: 1, pushEnemy: 3.6 }],
      moves: [[6, 9, 0.9, 0]],
    }),
    // —— 站立重脚 (D) 近 ——
    stD_close: mv({
      startup: 6, active: 4, recovery: 16, close: true, cancel: ['special', 'dm'],
      anim: { keys: [[0, 'kickWind'], [6, 'kickHigh'], [10, 'kickHigh'], [26, 'idle']] },
      hits: [{ f: [6, 9], box: B(12, 58, 28, 22), dmg: d(10), stun: 19, bstun: 14, hitstop: 12, power: 1 }],
    }),
    // —— 站立重脚 (D) 远 ——
    stD: mv({
      startup: 9, active: 4, recovery: 17, close: false,
      anim: { keys: [[0, 'kickWind'], [9, 'roundhouse'], [13, 'roundhouse'], [30, 'idle']] },
      hits: [{ f: [9, 12], box: B(22, 40, 32, 20), dmg: d(11), stun: 20, bstun: 15, hitstop: 12, power: 1, pushEnemy: 4.2 }],
      moves: [[8, 12, 1.1, 0]],
    }),

    // —— 蹲轻拳 ——
    crA: mv({
      cond: 'crouch', startup: 3, active: 2, recovery: 7, cancel: ['normal', 'special', 'dm'], whiffCancel: true,
      anim: { keys: [[0, 'crouch'], [3, 'lowJab'], [5, 'lowJab'], [12, 'crouch']] },
      hits: [{ f: [3, 4], box: B(12, 32, 24, 11), dmg: d(3), stun: 11, bstun: 9, hitstop: 8 }],
    }),
    // —— 蹲轻脚（下段）——
    crB: mv({
      cond: 'crouch', startup: 4, active: 3, recovery: 7, cancel: ['normal', 'special', 'dm'],
      anim: { keys: [[0, 'crouch'], [4, 'sweep'], [7, 'sweep'], [14, 'crouch']] },
      hits: [{ f: [4, 6], box: B(12, 2, 26, 12), dmg: d(3), stun: 11, bstun: 9, hitstop: 8, lvl: LV.LOW }],
    }),
    // —— 蹲重拳（对空）——
    crC: mv({
      cond: 'crouch', startup: 6, active: 4, recovery: 15, cancel: ['special', 'dm'],
      anim: { keys: [[0, 'crouch'], [6, 'uppercut'], [10, 'uppercut'], [25, 'crouch']] },
      hits: [{ f: [6, 9], box: B(4, 46, 24, 44), dmg: d(9), stun: 18, bstun: 13, hitstop: 11, power: 1, launch: 5.2, juggle: true }],
    }),
    // —— 蹲重脚（扫堂腿，下段击倒）——
    crD: mv({
      cond: 'crouch', startup: 7, active: 4, recovery: 19,
      anim: { keys: [[0, 'crouch'], [7, 'sweep'], [11, 'sweep'], [30, 'crouch']] },
      hits: [{ f: [7, 10], box: B(14, 0, 34, 14), dmg: d(9), stun: 20, bstun: 14, hitstop: 12, lvl: LV.LOW, knockdown: true, power: 1, pushEnemy: 3 }],
      moves: [[6, 10, 0.8, 0]],
    }),

    // —— 跳跃攻击 ——
    jA: mv({
      cond: 'air', startup: 3, active: 6, recovery: 8, cancel: ['special'],
      anim: { keys: [[0, 'jumpup'], [3, 'airPunch'], [9, 'airPunch'], [17, 'jumpfall']] },
      hits: [{ f: [3, 8], box: B(10, 30, 26, 18), dmg: d(4), stun: 13, bstun: 10, hitstop: 8, lvl: LV.OVERHEAD }],
    }),
    jB: mv({
      cond: 'air', startup: 4, active: 8, recovery: 8,
      anim: { keys: [[0, 'jumpup'], [4, 'airKick'], [12, 'airKick'], [20, 'jumpfall']] },
      hits: [{ f: [4, 11], box: B(12, 14, 28, 18), dmg: d(4), stun: 13, bstun: 10, hitstop: 8, lvl: LV.OVERHEAD }],
    }),
    jC: mv({
      cond: 'air', startup: 6, active: 8, recovery: 10,
      anim: { keys: [[0, 'jumpup'], [6, 'airPunch'], [14, 'airPunch'], [24, 'jumpfall']] },
      hits: [{ f: [6, 13], box: B(12, 24, 32, 24), dmg: d(10), stun: 20, bstun: 14, hitstop: 12, lvl: LV.OVERHEAD, power: 1, pushEnemy: 2 }],
    }),
    jD: mv({
      cond: 'air', startup: 7, active: 9, recovery: 10,
      anim: { keys: [[0, 'jumpup'], [7, 'airKick'], [16, 'airKick'], [26, 'jumpfall']] },
      hits: [{ f: [7, 15], box: B(14, 10, 34, 26), dmg: d(11), stun: 20, bstun: 14, hitstop: 12, lvl: LV.OVERHEAD, power: 1, pushEnemy: 2.4 }],
    }),

    // —— 吹飞攻击 CD ——
    blowCD: mv({
      startup: 12, active: 4, recovery: 22, cancel: ['special', 'dm'], cancelable: 'hit',
      anim: { keys: [[0, 'strongWind'], [12, 'blowback'], [16, 'blowback'], [38, 'idle']] },
      hits: [{ f: [12, 15], box: B(16, 44, 34, 30), dmg: d(12), stun: 24, bstun: 16, hitstop: 14, power: 2,
               knockdown: true, launch: 4.6, pushEnemy: 6.5, juggle: true, fx: 'blow' }],
      moves: [[10, 14, 1.4, 0]],
      meter: 4,
    }),
    // —— 空中吹飞 ——
    airCD: mv({
      cond: 'air', startup: 8, active: 8, recovery: 12,
      anim: { keys: [[0, 'jumpup'], [8, 'blowback'], [16, 'blowback'], [28, 'jumpfall']] },
      hits: [{ f: [8, 15], box: B(14, 22, 34, 30), dmg: d(12), stun: 24, bstun: 16, hitstop: 14, power: 2,
               knockdown: true, pushEnemy: 6, lvl: LV.OVERHEAD, fx: 'blow' }],
      meter: 4,
    }),
  };
}

// ═════════════════════ 系统技 ═════════════════════
export const SYSTEM = {
  roll: mv({
    type: 'system', startup: 0, active: 0, recovery: 26, meter: 0,
    anim: { keys: [[0, 'roll1'], [7, 'roll2'], [15, 'roll3'], [24, 'idle']] },
    moves: [[0, 16, 3.4, 0]],
    inv: [1, 15, 'full'],
    sfx: 'roll',
  }),
  rollBack: mv({
    type: 'system', startup: 0, active: 0, recovery: 26, meter: 0,
    anim: { keys: [[0, 'roll1'], [7, 'roll2'], [15, 'roll3'], [24, 'idle']] },
    moves: [[0, 16, -3.4, 0]],
    inv: [1, 15, 'full'],
    sfx: 'roll',
  }),
  backdash: mv({
    type: 'system', startup: 0, active: 0, recovery: 21, meter: 0,
    anim: { keys: [[0, 'idle'], [3, 'backdash'], [14, 'backdash'], [20, 'idle']] },
    moves: [[0, 10, -3.9, 0]],
    inv: [1, 8, 'throw'],
    sfx: 'dash',
  }),
  guardCancelRoll: mv({
    type: 'system', startup: 0, active: 0, recovery: 26, cost: 1, meter: 0,
    anim: { keys: [[0, 'roll1'], [7, 'roll2'], [15, 'roll3'], [24, 'idle']] },
    moves: [[0, 16, 3.4, 0]],
    inv: [1, 18, 'full'],
    sfx: 'roll',
  }),
  guardCancelCD: mv({
    type: 'system', startup: 10, active: 4, recovery: 20, cost: 1,
    anim: { keys: [[0, 'strongWind'], [10, 'blowback'], [14, 'blowback'], [34, 'idle']] },
    hits: [{ f: [10, 13], box: B(16, 44, 34, 30), dmg: 8, stun: 24, bstun: 16, hitstop: 14, power: 2, knockdown: true, pushEnemy: 6 }],
    inv: [0, 12, 'full'],
  }),
  maxMode: mv({
    type: 'system', startup: 2, active: 0, recovery: 24, cost: 1, meter: 0,
    anim: { keys: [[0, 'dmCharge'], [6, 'dmBurst'], [16, 'dmBurst'], [26, 'idle']] },
    hits: [{ f: [4, 10], box: B(-16, 0, 56, 80), dmg: 0, stun: 16, bstun: 12, hitstop: 6, pushEnemy: 5, power: 1 }],
    inv: [0, 12, 'full'],
    sfx: 'burst',
  }),
  throwF: mv({
    type: 'throw', startup: 2, active: 2, recovery: 30,
    anim: { keys: [[0, 'grabWind'], [4, 'grabWind'], [12, 'strongHit'], [34, 'idle']] },
    hits: [{ f: [2, 3], box: B(6, 20, 30, 60), dmg: 12, hitstop: 14, knockdown: true, fx: 'throw' }],
  }),
  getHit: mv({ type: 'system', startup: 0, active: 0, recovery: 1, meter: 0 }),
};

// ═════════════════════ 角色 ═════════════════════
// proj: {vx, life, box, dmg, hits, sprite}

export const CHARACTERS = {
  kyo: {
    id: 'kyo', name: 'KYO', cn: '草薙 京', palette: 'kyo', palette2: 'kyo2', hairStyle: 'short', outfit: 'jacket',
    color: '#ff7a18',
    quote: '燃やし尽くしてやる！',
    intro: '火焰在燃烧',
    normals: makeNormals(1.0),
    specials: {
      // 荒咬み (QCF + A/C) —— 火焰突拳，可接追加
      arakami: mv({
        type: 'special', motion: 'QCF', btn: 'P', startup: 9, active: 4, recovery: 20,
        cancel: ['dm'], cancelable: 'hit', meter: 6, sfx: 'flame',
        anim: { keys: [[0, 'fireWind'], [9, 'fireCast'], [13, 'fireCast'], [33, 'idle']] },
        hits: [{ f: [9, 12], box: B(16, 40, 34, 26), dmg: 11, stun: 20, bstun: 14, hitstop: 12, power: 1, chip: 1, fx: 'flame', pushEnemy: 2 }],
        moves: [[7, 12, 2.6, 0]],
        followUp: { input: 'P', window: [12, 30], move: 'dokugami' },
      }),
      dokugami: mv({
        type: 'special', startup: 8, active: 4, recovery: 22, meter: 4, sfx: 'flame',
        anim: { keys: [[0, 'strongWind'], [8, 'strongHit'], [12, 'strongHit'], [34, 'idle']] },
        hits: [{ f: [8, 11], box: B(18, 44, 36, 26), dmg: 13, stun: 22, bstun: 15, hitstop: 13, power: 2, chip: 1, fx: 'flame', pushEnemy: 3.5 }],
        moves: [[6, 11, 3.0, 0]],
        followUp: { input: 'K', window: [11, 32], move: 'nanase' },
      }),
      nanase: mv({
        type: 'special', startup: 10, active: 5, recovery: 26, meter: 4, sfx: 'flame',
        anim: { keys: [[0, 'kickWind'], [10, 'kickHigh'], [15, 'kickHigh'], [41, 'idle']] },
        hits: [{ f: [10, 14], box: B(14, 40, 34, 40), dmg: 15, stun: 26, bstun: 16, hitstop: 14, power: 2, chip: 2,
                 knockdown: true, launch: 4.2, fx: 'flame', pushEnemy: 4.5 }],
        moves: [[8, 14, 2.2, 0]],
      }),
      // 七拾五式改 (QCF + B/D) —— 二段踢
      shiki75: mv({
        type: 'special', motion: 'QCF', btn: 'K', startup: 11, active: 4, recovery: 24, meter: 6, sfx: 'swing',
        anim: { keys: [[0, 'kickWind'], [11, 'kickHigh'], [15, 'kickHigh'], [24, 'kickWind'], [30, 'airKick'], [39, 'idle']] },
        hits: [
          { f: [11, 14], box: B(14, 34, 32, 28), dmg: 8, stun: 16, bstun: 12, hitstop: 10, power: 1, chip: 1 },
          { f: [26, 31], box: B(12, 30, 34, 40), dmg: 10, stun: 22, bstun: 14, hitstop: 12, power: 2, chip: 1, knockdown: true, launch: 3.6 },
        ],
        moves: [[9, 14, 1.8, 0], [24, 30, 2.4, 0]],
      }),
      // 百式・鬼焼き (DP + A/C) —— 无敌升龙
      oniyaki: mv({
        type: 'special', motion: 'DP', btn: 'P', startup: 4, active: 12, recovery: 26, meter: 8, sfx: 'flameBig',
        anim: { keys: [[0, 'dmCharge'], [4, 'dpRise'], [16, 'dpRise'], [26, 'jumpfall'], [42, 'idle']] },
        hits: [
          { f: [4, 7],  box: B(2, 40, 26, 58), dmg: 10, stun: 20, bstun: 14, hitstop: 11, power: 1, chip: 1, launch: 5.5, juggle: true, fx: 'flame' },
          { f: [8, 15], box: B(0, 56, 26, 60), dmg: 8, stun: 20, bstun: 12, hitstop: 10, power: 2, chip: 1, knockdown: true, launch: 4.5, juggle: true, fx: 'flame' },
        ],
        moves: [[3, 10, 1.5, 0]],
        inv: [0, 6, 'full'],
        airborne: [4, 30],
      }),
      // R.E.D. Kick (RDP + B/D) —— 翻身踢，中段
      redKick: mv({
        type: 'special', motion: 'RDP', btn: 'K', startup: 20, active: 6, recovery: 22, meter: 6, sfx: 'swing',
        anim: { keys: [[0, 'kickWind'], [6, 'jumpup'], [20, 'airDown'], [26, 'airDown'], [36, 'crouch'], [48, 'idle']] },
        hits: [{ f: [20, 25], box: B(10, 8, 32, 40), dmg: 14, stun: 24, bstun: 16, hitstop: 13, power: 2, chip: 2,
                 lvl: LV.OVERHEAD, knockdown: true, pushEnemy: 4 }],
        moves: [[2, 20, 2.2, 0]],
        airborne: [4, 28],
      }),
      // 大蛇薙 (QCF,HCB + P) —— 地面火焰奔流 DM
      orochinagi: mv({
        type: 'dm', motion: 'QCBHCF', btn: 'P', cost: 1, superFreeze: 34,
        startup: 22, active: 26, recovery: 34, meter: 0, sfx: 'super',
        anim: { keys: [[0, 'dmCharge'], [12, 'dmCharge'], [22, 'fireCast'], [40, 'fireCast'], [48, 'strongWind'], [82, 'idle']] },
        hits: [{ f: [22, 47], box: B(6, 0, 92, 52), dmg: 34, stun: 30, bstun: 20, hitstop: 16, power: 2, chip: 5,
                 knockdown: true, launch: 5, fx: 'flameBig', pushEnemy: 5, once: true }],
        inv: [0, 24, 'full'],
        maxVersion: { dmg: 48, chip: 7, reach: 130 },
      }),
      // 無式 (QCF,QCB + P) —— 突进 DM
      mushiki: mv({
        type: 'dm', motion: 'QCFx2', btn: 'P', cost: 1, superFreeze: 30,
        startup: 10, active: 6, recovery: 40, meter: 0, sfx: 'super',
        anim: { keys: [[0, 'dmCharge'], [10, 'strongHit'], [16, 'strongHit'], [26, 'win'], [56, 'idle']] },
        hits: [{ f: [10, 15], box: B(10, 30, 46, 44), dmg: 40, stun: 40, bstun: 22, hitstop: 22, power: 2, chip: 6,
                 knockdown: true, fx: 'flameBig', pushEnemy: 7, once: true }],
        moves: [[6, 15, 6.5, 0]],
        inv: [0, 14, 'full'],
      }),
    },
  },

  iori: {
    id: 'iori', name: 'IORI', cn: '八神 庵', palette: 'iori', palette2: 'iori2', hairStyle: 'long', outfit: 'ioriJacket',
    color: '#a83cff',
    quote: '死ね……',
    intro: '紫炎焚身',
    normals: makeNormals(1.02),
    specials: {
      // 百八式・闇払い (QCF + P) —— 紫炎飞行道具
      yamibarai: mv({
        type: 'special', motion: 'QCF', btn: 'P', startup: 13, active: 2, recovery: 26, meter: 6, sfx: 'flame',
        anim: { keys: [[0, 'fireWind'], [13, 'fireCast'], [17, 'fireCast'], [41, 'idle']] },
        spawn: { f: 13, proj: { vx: 3.6, life: 110, box: B(0, 0, 26, 22), dmg: 12, chip: 2, stun: 20, bstun: 14, hitstop: 11,
                                col: '#a83cff', col2: '#f0b0ff', ground: true } },
      }),
      // 百式・鬼焼き (DP + P) —— 无敌升龙
      oniyaki: mv({
        type: 'special', motion: 'DP', btn: 'P', startup: 4, active: 14, recovery: 26, meter: 8, sfx: 'flameBig',
        anim: { keys: [[0, 'dmCharge'], [4, 'dpRise'], [18, 'dpRise'], [28, 'jumpfall'], [44, 'idle']] },
        hits: [
          { f: [4, 7],   box: B(2, 40, 26, 56), dmg: 9,  stun: 18, bstun: 13, hitstop: 10, power: 1, chip: 1, launch: 5.2, juggle: true, fx: 'flameP' },
          { f: [9, 12],  box: B(2, 52, 26, 56), dmg: 7,  stun: 18, bstun: 12, hitstop: 9,  power: 1, chip: 1, launch: 4.6, juggle: true, fx: 'flameP' },
          { f: [14, 17], box: B(0, 62, 26, 58), dmg: 8,  stun: 22, bstun: 12, hitstop: 12, power: 2, chip: 1, knockdown: true, launch: 4.2, juggle: true, fx: 'flameP' },
        ],
        moves: [[3, 12, 1.3, 0]],
        inv: [0, 5, 'full'],
        airborne: [4, 32],
      }),
      // 百弐拾七式・葵花 (QCB + P) —— 三段连打
      rekka1: mv({
        type: 'special', motion: 'QCB', btn: 'P', startup: 8, active: 4, recovery: 20, meter: 5, sfx: 'claw',
        cancel: ['dm'], cancelable: 'hit',
        anim: { keys: [[0, 'clawWind'], [8, 'clawSwipe'], [12, 'clawSwipe'], [32, 'idle']] },
        hits: [{ f: [8, 11], box: B(14, 36, 32, 30), dmg: 9, stun: 18, bstun: 13, hitstop: 11, power: 1, chip: 1, fx: 'flameP', pushEnemy: 1.6 }],
        moves: [[6, 11, 2.4, 0]],
        followUp: { input: 'P', window: [10, 28], move: 'rekka2' },
      }),
      rekka2: mv({
        type: 'special', startup: 8, active: 4, recovery: 20, meter: 4, sfx: 'claw',
        anim: { keys: [[0, 'clawWind'], [8, 'clawSwipe'], [12, 'clawSwipe'], [32, 'idle']] },
        hits: [{ f: [8, 11], box: B(14, 30, 34, 34), dmg: 10, stun: 19, bstun: 13, hitstop: 11, power: 1, chip: 1, fx: 'flameP', pushEnemy: 1.8 }],
        moves: [[6, 11, 2.6, 0]],
        followUp: { input: 'P', window: [10, 28], move: 'rekka3' },
      }),
      rekka3: mv({
        type: 'special', startup: 10, active: 5, recovery: 26, meter: 4, sfx: 'flameBig',
        anim: { keys: [[0, 'dmCharge'], [10, 'dmBurst'], [15, 'dmBurst'], [41, 'idle']] },
        hits: [{ f: [10, 14], box: B(8, 20, 36, 60), dmg: 14, stun: 26, bstun: 16, hitstop: 15, power: 2, chip: 2,
                 knockdown: true, launch: 5, fx: 'flameP', pushEnemy: 4 }],
        moves: [[8, 13, 1.6, 0]],
      }),
      // 屑風 (HCB + K) —— 投技系
      kuzukaze: mv({
        type: 'throw', motion: 'HCB', btn: 'P', startup: 6, active: 3, recovery: 34, meter: 8, sfx: 'grab',
        anim: { keys: [[0, 'grabWind'], [6, 'grabWind'], [14, 'clawSwipe'], [26, 'dmBurst'], [43, 'idle']] },
        hits: [{ f: [6, 8], box: B(4, 20, 34, 64), dmg: 16, hitstop: 16, knockdown: true, fx: 'throw', pushEnemy: 5 }],
        moves: [[2, 6, 2.0, 0]],
      }),
      // 禁千弐百拾壱式・八稚女 (QCF,HCB + P) —— 乱舞 DM
      yaotome: mv({
        type: 'dm', motion: 'QCFHCB', btn: 'P', cost: 1, superFreeze: 32,
        startup: 6, active: 4, recovery: 46, meter: 0, sfx: 'super',
        anim: { keys: [[0, 'dmCharge'], [6, 'clawSwipe'], [10, 'clawSwipe'], [18, 'dmBurst'], [40, 'dmBurst'], [56, 'idle']] },
        hits: [{ f: [6, 9], box: B(8, 24, 40, 50), dmg: 6, stun: 60, bstun: 20, hitstop: 20, power: 2, chip: 4,
                 rush: 9, rushDmg: 4, knockdown: true, fx: 'flameP', pushEnemy: 6, once: true }],
        moves: [[2, 9, 5.5, 0]],
        inv: [0, 10, 'full'],
        maxVersion: { dmg: 8, rushDmg: 6 },
      }),
      // 屑風・改 (QCB,QCB + P)
      kinYami: mv({
        type: 'dm', motion: 'QCBx2', btn: 'P', cost: 1, superFreeze: 28,
        startup: 14, active: 20, recovery: 34, meter: 0, sfx: 'super',
        anim: { keys: [[0, 'dmCharge'], [14, 'dmBurst'], [34, 'dmBurst'], [68, 'idle']] },
        hits: [{ f: [14, 33], box: B(-10, 0, 74, 90), dmg: 32, stun: 30, bstun: 20, hitstop: 16, power: 2, chip: 5,
                 knockdown: true, launch: 6, fx: 'flameP', pushEnemy: 5, once: true }],
        inv: [0, 18, 'full'],
      }),
    },
  },

  terry: {
    id: 'terry', name: 'TERRY', cn: '特瑞·博加德', palette: 'terry', palette2: 'terry2', hairStyle: 'short',
    outfit: 'vest', cap: true,
    color: '#ffcc33',
    quote: 'Are you OK?',
    intro: '传说之狼',
    normals: makeNormals(1.05),
    specials: {
      // Power Wave (QCF + P) —— 地面冲击波
      powerWave: mv({
        type: 'special', motion: 'QCF', btn: 'P', startup: 12, active: 2, recovery: 24, meter: 6, sfx: 'wave',
        anim: { keys: [[0, 'strongWind'], [12, 'sweep'], [16, 'sweep'], [38, 'idle']] },
        spawn: { f: 12, proj: { vx: 4.0, life: 100, box: B(0, 0, 24, 20), dmg: 11, chip: 2, stun: 18, bstun: 13, hitstop: 10,
                                col: '#ff8a10', col2: '#ffe090', ground: true, lowHit: true } },
      }),
      // Burn Knuckle (QCB + P)
      burnKnuckle: mv({
        type: 'special', motion: 'QCB', btn: 'P', startup: 10, active: 6, recovery: 24, meter: 7, sfx: 'flame',
        cancel: ['dm'], cancelable: 'hit',
        anim: { keys: [[0, 'strongWind'], [10, 'strongHit'], [18, 'strongHit'], [40, 'idle']] },
        hits: [{ f: [10, 17], box: B(14, 38, 34, 28), dmg: 13, stun: 22, bstun: 15, hitstop: 13, power: 2, chip: 2,
                 knockdown: true, fx: 'flame', pushEnemy: 5 }],
        moves: [[8, 18, 5.2, 0]],
      }),
      // Crack Shoot (QCB + K) —— 中段翻身踢
      crackShoot: mv({
        type: 'special', motion: 'QCB', btn: 'K', startup: 16, active: 6, recovery: 22, meter: 6, sfx: 'swing',
        anim: { keys: [[0, 'kickWind'], [6, 'jumpup'], [16, 'airDown'], [22, 'airDown'], [32, 'crouch'], [44, 'idle']] },
        hits: [{ f: [16, 21], box: B(8, 10, 32, 38), dmg: 12, stun: 22, bstun: 15, hitstop: 12, power: 1, chip: 2,
                 lvl: LV.OVERHEAD, knockdown: true, pushEnemy: 3.5 }],
        moves: [[2, 18, 2.6, 0]],
        airborne: [4, 26],
      }),
      // Rising Tackle (DP + P) —— 对空
      risingTackle: mv({
        type: 'special', motion: 'DP', btn: 'P', startup: 5, active: 14, recovery: 26, meter: 8, sfx: 'swing',
        anim: { keys: [[0, 'dmCharge'], [5, 'dpRise'], [19, 'dpRise'], [30, 'jumpfall'], [45, 'idle']] },
        hits: [
          { f: [5, 10],  box: B(-2, 44, 28, 60), dmg: 10, stun: 20, bstun: 14, hitstop: 11, power: 1, chip: 1, launch: 5.4, juggle: true },
          { f: [11, 18], box: B(-2, 58, 28, 60), dmg: 8,  stun: 20, bstun: 12, hitstop: 10, power: 2, chip: 1, knockdown: true, launch: 4.4, juggle: true },
        ],
        moves: [[4, 12, 1.1, 0]],
        inv: [0, 7, 'full'],
        airborne: [5, 34],
      }),
      // Power Dunk (DP + K)
      powerDunk: mv({
        type: 'special', motion: 'DP', btn: 'K', startup: 8, active: 12, recovery: 28, meter: 7, sfx: 'flame',
        anim: { keys: [[0, 'dmCharge'], [8, 'uppercut'], [14, 'dpRise'], [22, 'airDown'], [30, 'crouch'], [48, 'idle']] },
        hits: [
          { f: [8, 13],  box: B(6, 44, 28, 48), dmg: 10, stun: 20, bstun: 14, hitstop: 11, power: 1, chip: 1, launch: 4.8, juggle: true },
          { f: [20, 25], box: B(8, 6, 32, 46), dmg: 12, stun: 24, bstun: 15, hitstop: 14, power: 2, chip: 2, knockdown: true, fx: 'flame' },
        ],
        moves: [[6, 14, 2.4, 0], [18, 24, 2.0, 0]],
        airborne: [8, 30],
      }),
      // Power Geyser (QCB,DB,F + P) —— DM
      powerGeyser: mv({
        type: 'dm', motion: 'GEYSER', btn: 'P', cost: 1, superFreeze: 32,
        startup: 14, active: 22, recovery: 36, meter: 0, sfx: 'super',
        anim: { keys: [[0, 'dmCharge'], [14, 'sweep'], [26, 'dmBurst'], [40, 'dmBurst'], [72, 'idle']] },
        hits: [{ f: [14, 35], box: B(4, 0, 64, 106), dmg: 33, stun: 30, bstun: 20, hitstop: 16, power: 2, chip: 5,
                 knockdown: true, launch: 6.5, fx: 'geyser', pushEnemy: 5, once: true }],
        inv: [0, 18, 'full'],
        maxVersion: { dmg: 46, chip: 7 },
      }),
      // Buster Wolf (QCFx2 + K)
      busterWolf: mv({
        type: 'dm', motion: 'QCFx2', btn: 'K', cost: 1, superFreeze: 30,
        startup: 12, active: 6, recovery: 40, meter: 0, sfx: 'super',
        anim: { keys: [[0, 'dmCharge'], [12, 'strongHit'], [18, 'strongHit'], [28, 'dmBurst'], [58, 'idle']] },
        hits: [{ f: [12, 17], box: B(12, 28, 44, 44), dmg: 38, stun: 40, bstun: 22, hitstop: 20, power: 2, chip: 6,
                 knockdown: true, launch: 3, fx: 'flame', pushEnemy: 7, once: true }],
        moves: [[8, 17, 6.0, 0]],
        inv: [0, 15, 'full'],
      }),
    },
  },
};

export const ROSTER = ['kyo', 'iori', 'terry'];
