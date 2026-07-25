// core.js —— 全局常量与工具函数
// 所有数值均以 Neo Geo 原生分辨率 320x224 为单位，逻辑固定 60fps。

export const W = 320;          // 画面宽
export const H = 224;          // 画面高
export const FPS = 60;
export const DT = 1000 / FPS;

export const GROUND_Y = 196;   // 地面高度（屏幕坐标）
export const STAGE_W = 1180;   // 舞台总宽
export const WALL_PAD = 24;    // 角色离舞台边缘的最小距离

// —— 物理（单位：像素 / 帧）——
export const GRAVITY        = 0.545;
export const WALK_F         = 1.35;
export const WALK_B         = 1.10;
export const RUN_SPD        = 3.15;
export const RUN_ACCEL      = 0.42;
export const BACKDASH_SPD   = -3.9;
export const JUMP_VY        = -11.6;   // 大跳
export const HOP_VY         = -7.55;   // 小跳
export const SUPERJUMP_VY   = -13.2;   // 大跳（下上）
export const JUMP_VX        = 2.35;
export const HOP_VX         = 3.05;    // 小跳横向更快（97 特征）
export const AIR_FRICTION   = 0.0;     // KOF 空中不可控
export const PUSH_DIST      = 26;      // 角色互推最小间距
export const MAX_HP         = 103;     // 97 原作血量刻度
export const MAX_POWER      = 100;     // 一格能量
export const MAX_STOCK      = 3;
export const MAX_MODE_TIME  = 600;     // MAX 爆气持续 10 秒

// —— 判定框类型 ——
export const BOX = { HURT: 0, HIT: 1, PUSH: 2, PROJ: 3 };

// —— 受击高度 ——
export const LV = { HIGH: 'high', MID: 'mid', LOW: 'low', OVERHEAD: 'overhead', UNBLOCK: 'unblock' };

export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp  = (a, b, t) => a + (b - a) * t;
export const sign  = v => v < 0 ? -1 : 1;
export const rnd   = (a, b) => a + Math.random() * (b - a);
export const rndi  = (a, b) => Math.floor(rnd(a, b + 1));
export const pick  = arr => arr[(Math.random() * arr.length) | 0];

// 缓动
export const easeOut  = t => 1 - (1 - t) * (1 - t);
export const easeIn   = t => t * t;
export const easeIO   = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// AABB 相交
export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// 把角色局部坐标的框换算到世界坐标
// 局部坐标：x 向前为正，y 向上为正（0 = 脚底）
export function toWorld(box, px, py, facing) {
  const x = facing > 0 ? px + box.x : px - box.x - box.w;
  return { x, y: py - box.y - box.h, w: box.w, h: box.h };
}
