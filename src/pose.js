// pose.js —— 骨架姿势库与动画采样
// 局部坐标系：x 向前为正，y 向上为正，(0,0) = 脚底中心。
// 一个 pose 由 11 个关节点构成，肩/胯根部由躯干自动推导。
//   hip 胯 / chest 胸 / head 头心
//   eB,hB 后手肘、后手掌      eF,hF 前手肘、前手掌
//   kB,ftB 后膝、后脚         kF,ftF 前膝、前脚

const BASE = {
  hip: [0, 45], chest: [2, 66], head: [4, 82],
  eB: [-9, 56], hB: [-11, 45],
  eF: [10, 56], hF: [16, 45],
  kB: [-7, 23], ftB: [-10, 0],
  kF: [8, 22],  ftF: [11, 0],
  headR: 7.6,          // 头半径
  lean: 0,             // 躯干附加倾角（仅用于绘制细节）
};

const P = o => Object.assign({}, BASE, o);

export const POSE = {
  // ————————————————— 站立 / 移动 —————————————————
  idle: P({}),
  idle2: P({ hip:[0,44], chest:[2,64.5], head:[4,80.5], eF:[10,54.5], hF:[16,43.5], eB:[-9,54.5], hB:[-11,43.5] }),
  idle3: P({ hip:[0,46], chest:[2,67], head:[4,83], eF:[11,57], hF:[17,46.5], eB:[-9,57], hB:[-11,46.5] }),

  walkf1: P({ hip:[1,45], kF:[13,24], ftF:[19,2], kB:[-9,22], ftB:[-14,0], eF:[9,58], hF:[15,49] }),
  walkf2: P({ hip:[2,47], chest:[3,68], head:[5,84], kF:[9,26], ftF:[11,7], kB:[-5,23], ftB:[-9,0], eF:[8,59], hF:[13,51] }),
  walkf3: P({ hip:[1,45], kF:[6,23], ftF:[3,1], kB:[-4,24], ftB:[2,3], eF:[7,58], hF:[11,48] }),
  walkf4: P({ hip:[0,46], chest:[1,67], head:[3,83], kF:[8,25], ftF:[13,3], kB:[-8,22], ftB:[-12,0] }),

  walkb1: P({ hip:[-1,45], kF:[6,24], ftF:[6,4], kB:[-10,23], ftB:[-16,1], eF:[7,58], hF:[11,49] }),
  walkb2: P({ hip:[-2,47], chest:[0,68], head:[2,84], kF:[8,25], ftF:[12,1], kB:[-6,24], ftB:[-9,5] }),
  walkb3: P({ hip:[-1,45], kF:[10,23], ftF:[15,0], kB:[-5,22], ftB:[-4,2] }),
  walkb4: P({ hip:[0,46], chest:[1,67], head:[3,83], kF:[8,24], ftF:[11,2], kB:[-8,23], ftB:[-12,0] }),

  run1: P({ hip:[4,44], chest:[8,64], head:[12,79], eF:[14,56], hF:[20,60], eB:[-6,55], hB:[-12,44],
            kF:[14,26], ftF:[22,10], kB:[-6,20], ftB:[-16,2] }),
  run2: P({ hip:[5,46], chest:[9,66], head:[13,81], eF:[13,58], hF:[18,64], eB:[-5,56], hB:[-10,46],
            kF:[8,28], ftF:[8,14], kB:[-2,22], ftB:[-8,0] }),
  run3: P({ hip:[4,43], chest:[8,63], head:[12,78], eF:[10,55], hF:[13,60], eB:[-8,54], hB:[-15,50],
            kF:[6,22], ftF:[2,1], kB:[2,24], ftB:[10,6] }),
  run4: P({ hip:[5,45], chest:[9,65], head:[13,80], eF:[12,57], hF:[16,62], eB:[-6,55], hB:[-13,47],
            kF:[10,26], ftF:[14,8], kB:[-4,21], ftB:[-12,0] }),

  crouch: P({ hip:[-2,26], chest:[1,44], head:[4,59], headR:7.4,
              eB:[-9,36], hB:[-8,26], eF:[10,36], hF:[16,29],
              kB:[-11,15], ftB:[-13,0], kF:[10,14], ftF:[13,0] }),

  // ————————————————— 空中 —————————————————
  jumpup: P({ hip:[0,48], chest:[1,68], head:[3,84],
              eB:[-8,60], hB:[-10,70], eF:[9,60], hF:[13,70],
              kB:[-8,26], ftB:[-6,10], kF:[8,24], ftF:[14,12] }),
  jumpfall: P({ hip:[0,47], chest:[1,67], head:[3,83],
              eB:[-9,58], hB:[-14,66], eF:[10,58], hF:[16,64],
              kB:[-9,24], ftB:[-14,8], kF:[9,22], ftF:[15,4] }),
  hopup: P({ hip:[2,46], chest:[3,66], head:[5,82],
              eB:[-7,58], hB:[-8,66], eF:[9,57], hF:[14,64],
              kB:[-8,24], ftB:[-9,14], kF:[9,22], ftF:[15,16] }),

  // ————————————————— 防御 / 受击 —————————————————
  guard: P({ hip:[-3,45], chest:[-3,65], head:[-2,81],
             eB:[-2,58], hB:[3,66], eF:[3,56], hF:[9,64],
             kB:[-9,23], ftB:[-13,0], kF:[7,22], ftF:[10,0] }),
  guardlow: P({ hip:[-4,26], chest:[-4,44], head:[-3,59],
             eB:[-1,38], hB:[4,46], eF:[3,36], hF:[9,44],
             kB:[-12,15], ftB:[-14,0], kF:[9,14], ftF:[12,0] }),

  hit1: P({ hip:[-3,44], chest:[-6,64], head:[-11,79], lean:-.18,
            eB:[-14,56], hB:[-18,64], eF:[-2,55], hF:[2,63],
            kB:[-9,22], ftB:[-13,0], kF:[7,22], ftF:[11,0] }),
  hit2: P({ hip:[-5,43], chest:[-10,62], head:[-17,76], lean:-.3,
            eB:[-18,54], hB:[-24,60], eF:[-5,54], hF:[-2,62],
            kB:[-11,21], ftB:[-16,0], kF:[6,22], ftF:[12,1] }),
  hitlow: P({ hip:[-5,25], chest:[-8,42], head:[-13,56], lean:-.24,
            eB:[-15,36], hB:[-19,42], eF:[-4,34], hF:[-1,40],
            kB:[-13,14], ftB:[-15,0], kF:[8,13], ftF:[11,0] }),
  hitair: P({ hip:[-2,44], chest:[-6,62], head:[-12,76], lean:-.35,
            eB:[-16,54], hB:[-22,62], eF:[-4,56], hF:[-6,66],
            kB:[-10,24], ftB:[-18,14], kF:[6,22], ftF:[10,10] }),
  // 被吹飞（旋转由绘制层处理）
  blowaway: P({ hip:[-4,44], chest:[-10,60], head:[-18,72], lean:-.5,
            eB:[-18,52], hB:[-26,58], eF:[-6,54], hF:[-8,66],
            kB:[-8,26], ftB:[-20,20], kF:[8,24], ftF:[16,16] }),
  down: P({ hip:[-6,10], chest:[-16,12], head:[-27,13], headR:7.4, lean:-1.4,
            eB:[-22,6], hB:[-28,4], eF:[-18,18], hF:[-26,20],
            kB:[6,10], ftB:[16,4], kF:[8,14], ftF:[18,10] }),
  getup: P({ hip:[-4,30], chest:[-4,50], head:[-2,66], headR:7.5,
            eB:[-10,44], hB:[-14,36], eF:[4,42], hF:[8,34],
            kB:[-12,16], ftB:[-14,0], kF:[6,14], ftF:[9,0] }),

  // ————————————————— 翻滚 / 后跃 —————————————————
  roll1: P({ hip:[2,36], chest:[6,52], head:[10,64], headR:7.4, lean:.5,
            eB:[0,46], hB:[6,38], eF:[12,46], hF:[18,38],
            kB:[-2,18], ftB:[-8,6], kF:[10,16], ftF:[16,4] }),
  roll2: P({ hip:[0,22], chest:[6,28], head:[14,28], headR:7.4, lean:1.3,
            eB:[2,20], hB:[10,14], eF:[12,26], hF:[20,22],
            kB:[-8,20], ftB:[-14,30], kF:[-2,14], ftF:[-8,26] }),
  roll3: P({ hip:[-2,30], chest:[-2,46], head:[0,60], headR:7.5, lean:-.2,
            eB:[-10,40], hB:[-16,46], eF:[4,40], hF:[10,46],
            kB:[-10,15], ftB:[-12,0], kF:[8,14], ftF:[12,0] }),
  backdash: P({ hip:[-4,50], chest:[-3,70], head:[-1,86],
            eB:[-12,62], hB:[-18,68], eF:[4,60], hF:[10,66],
            kB:[-12,28], ftB:[-18,14], kF:[6,26], ftF:[12,18] }),

  // ————————————————— 普通技 —————————————————
  jabWind: P({ hip:[0,45], chest:[1,66], head:[3,82], eF:[5,60], hF:[2,56], eB:[-7,58], hB:[-6,47] }),
  jabHit:  P({ hip:[1,45], chest:[3,66], head:[5,82], eF:[16,60], hF:[31,58], eB:[-8,57], hB:[-10,46] }),
  strongWind: P({ hip:[-2,45], chest:[-2,66], head:[0,82], lean:-.12,
            eF:[-2,60], hF:[-8,54], eB:[-10,56], hB:[-4,46] }),
  strongHit:  P({ hip:[3,45], chest:[6,66], head:[8,81], lean:.14,
            eF:[20,62], hF:[39,60], eB:[-6,54], hB:[-12,44],
            kF:[10,22], ftF:[14,0], kB:[-8,23], ftB:[-12,0] }),
  uppercut: P({ hip:[0,42], chest:[3,62], head:[6,78], lean:.1,
            eF:[12,62], hF:[18,84], eB:[-8,54], hB:[-12,44],
            kF:[9,20], ftF:[12,0], kB:[-7,21], ftB:[-11,0] }),
  lowJab: P({ hip:[-2,26], chest:[1,44], head:[4,59], headR:7.4,
            eF:[10,40], hF:[26,38], eB:[-8,38], hB:[-6,28],
            kB:[-11,15], ftB:[-13,0], kF:[10,14], ftF:[13,0] }),
  lowStrong: P({ hip:[-3,26], chest:[0,43], head:[3,58], headR:7.4,
            eF:[12,38], hF:[32,32], eB:[-9,36], hB:[-8,26],
            kB:[-12,15], ftB:[-14,0], kF:[12,13], ftF:[16,0] }),

  kickWind: P({ hip:[-1,46], chest:[0,66], head:[2,82],
            kF:[10,30], ftF:[12,18], kB:[-6,23], ftB:[-9,0],
            eF:[6,57], hF:[9,48], eB:[-8,57], hB:[-8,47] }),
  kickLow:  P({ hip:[-2,44], chest:[-2,64], head:[0,80], lean:-.08,
            kF:[14,22], ftF:[30,10], kB:[-6,22], ftB:[-10,0],
            eF:[4,56], hF:[0,50], eB:[-10,56], hB:[-14,48] }),
  kickHigh: P({ hip:[-3,46], chest:[-4,65], head:[-3,81], lean:-.16,
            kF:[16,44], ftF:[34,58], kB:[-5,22], ftB:[-9,0],
            eF:[2,56], hF:[-4,50], eB:[-12,56], hB:[-18,50] }),
  roundhouse: P({ hip:[-4,45], chest:[-6,64], head:[-6,80], lean:-.22,
            kF:[14,50], ftF:[36,44], kB:[-5,22], ftB:[-10,0],
            eF:[0,54], hF:[-8,48], eB:[-14,54], hB:[-22,46] }),
  sweep: P({ hip:[-6,20], chest:[-8,36], head:[-8,50], headR:7.4, lean:-.35,
            kF:[10,10], ftF:[34,4], kB:[-14,10], ftB:[-16,0],
            eF:[-2,30], hF:[-10,20], eB:[-16,26], hB:[-24,14] }),
  airPunch: P({ hip:[0,46], chest:[2,66], head:[4,82], lean:.1,
            eF:[14,58], hF:[28,46], eB:[-8,58], hB:[-12,66],
            kB:[-8,24], ftB:[-6,10], kF:[9,22], ftF:[14,8] }),
  airKick: P({ hip:[0,46], chest:[0,66], head:[2,82], lean:-.1,
            kF:[14,32], ftF:[30,20], kB:[-8,26], ftB:[-8,12],
            eF:[6,58], hF:[6,68], eB:[-9,58], hB:[-14,66] }),
  airDown: P({ hip:[0,46], chest:[1,66], head:[3,82], lean:.15,
            kF:[12,26], ftF:[20,4], kB:[-8,26], ftB:[-8,14],
            eF:[10,58], hF:[18,66], eB:[-9,58], hB:[-14,64] }),
  blowback: P({ hip:[2,45], chest:[5,66], head:[7,81], lean:.2,
            eF:[18,66], hF:[36,72], eB:[-8,54], hB:[-14,42],
            kF:[10,22], ftF:[15,0], kB:[-8,23], ftB:[-13,0] }),

  // ————————————————— 必杀技动作 —————————————————
  fireWind: P({ hip:[-6,40], chest:[-8,60], head:[-8,76], lean:-.25,
            eF:[-6,54], hF:[-14,44], eB:[-16,52], hB:[-20,42],
            kB:[-13,20], ftB:[-16,0], kF:[6,20], ftF:[9,0] }),
  fireCast: P({ hip:[4,42], chest:[8,62], head:[10,78], lean:.2,
            eF:[18,58], hF:[36,50], eB:[0,54], hB:[6,46],
            kF:[14,20], ftF:[20,0], kB:[-8,22], ftB:[-14,0] }),
  dpRise: P({ hip:[0,52], chest:[2,72], head:[4,88], lean:.05,
            eF:[8,80], hF:[12,104], eB:[-8,64], hB:[-12,54],
            kF:[8,30], ftF:[14,14], kB:[-6,28], ftB:[-8,8] }),
  clawWind: P({ hip:[-5,44], chest:[-8,64], head:[-9,80], lean:-.3,
            eF:[-6,58], hF:[-16,66], eB:[-16,56], hB:[-24,60],
            kB:[-12,22], ftB:[-15,0], kF:[6,21], ftF:[9,0] }),
  clawSwipe: P({ hip:[3,44], chest:[7,64], head:[9,80], lean:.25,
            eF:[18,68], hF:[34,44], eB:[-2,56], hB:[4,48],
            kF:[12,21], ftF:[18,0], kB:[-8,22], ftB:[-13,0] }),
  slide: P({ hip:[-4,16], chest:[-10,26], head:[-14,38], headR:7.4, lean:-.7,
            eF:[-4,22], hF:[2,14], eB:[-18,20], hB:[-24,12],
            kF:[14,10], ftF:[30,2], kB:[-6,8], ftB:[-14,2] }),
  grabWind: P({ hip:[1,45], chest:[3,66], head:[5,82],
            eF:[12,62], hF:[24,64], eB:[6,60], hB:[18,60],
            kF:[9,22], ftF:[13,0], kB:[-8,23], ftB:[-12,0] }),
  dmCharge: P({ hip:[-2,40], chest:[-2,60], head:[-1,76], lean:-.1,
            eF:[6,50], hF:[2,36], eB:[-10,48], hB:[-6,34],
            kF:[9,18], ftF:[12,0], kB:[-10,19], ftB:[-14,0] }),
  dmBurst: P({ hip:[2,46], chest:[4,68], head:[6,84], lean:.15,
            eF:[16,72], hF:[30,86], eB:[-4,62], hB:[-2,80],
            kF:[12,22], ftF:[18,0], kB:[-9,24], ftB:[-15,0] }),
  taunt: P({ hip:[0,45], chest:[1,66], head:[3,83],
            eF:[10,66], hF:[6,80], eB:[-8,58], hB:[-4,48] }),
  win: P({ hip:[0,46], chest:[1,68], head:[3,84],
            eF:[12,72], hF:[16,94], eB:[-8,58], hB:[-10,46],
            kF:[9,23], ftF:[13,0], kB:[-8,23], ftB:[-12,0] }),
  intro: P({ hip:[-3,44], chest:[-4,64], head:[-4,80], lean:-.15,
            eF:[4,54], hF:[0,42], eB:[-12,54], hB:[-16,44] }),
};

// —— 姿势插值 ——
const KEYS = ['hip','chest','head','eB','hB','eF','hF','kB','ftB','kF','ftF'];

export function blend(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const o = {};
  for (const k of KEYS) {
    o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
  }
  o.headR = a.headR + (b.headR - a.headR) * t;
  o.lean  = a.lean + (b.lean - a.lean) * t;
  return o;
}

// 动画：{loop, keys:[[frame, poseName]]}
export function sampleAnim(anim, f) {
  const ks = anim.keys;
  const last = ks[ks.length - 1][0];
  let t = f;
  if (anim.loop && last > 0) t = f % (last + (anim.tail || 0) || 1);
  if (t <= ks[0][0]) return POSE[ks[0][1]];
  for (let i = 0; i < ks.length - 1; i++) {
    if (t >= ks[i][0] && t <= ks[i + 1][0]) {
      const span = ks[i + 1][0] - ks[i][0];
      const k = span <= 0 ? 1 : (t - ks[i][0]) / span;
      return blend(POSE[ks[i][1]], POSE[ks[i + 1][1]], anim.snap ? (k > .5 ? 1 : 0) : k);
    }
  }
  return POSE[ks[ks.length - 1][1]];
}

// 常用循环动画
export const ANIM = {
  idle:  { loop:true, keys:[[0,'idle'],[16,'idle2'],[32,'idle3'],[48,'idle']] },
  walkf: { loop:true, keys:[[0,'walkf1'],[7,'walkf2'],[14,'walkf3'],[21,'walkf4'],[28,'walkf1']] },
  walkb: { loop:true, keys:[[0,'walkb1'],[7,'walkb2'],[14,'walkb3'],[21,'walkb4'],[28,'walkb1']] },
  run:   { loop:true, keys:[[0,'run1'],[4,'run2'],[8,'run3'],[12,'run4'],[16,'run1']] },
  crouch:{ loop:false, keys:[[0,'idle'],[3,'crouch']] },
  jump:  { loop:false, keys:[[0,'jumpup'],[10,'jumpup'],[22,'jumpfall']] },
  hop:   { loop:false, keys:[[0,'hopup'],[8,'hopup'],[16,'jumpfall']] },
  guard: { loop:false, keys:[[0,'idle'],[2,'guard']] },
  guardlow:{ loop:false, keys:[[0,'crouch'],[2,'guardlow']] },
  down:  { loop:false, keys:[[0,'blowaway'],[6,'down']] },
  getup: { loop:false, keys:[[0,'down'],[8,'getup'],[16,'idle']] },
  roll:  { loop:false, keys:[[0,'roll1'],[7,'roll2'],[15,'roll3'],[22,'idle']] },
  backdash:{ loop:false, keys:[[0,'idle'],[4,'backdash'],[14,'backdash'],[20,'idle']] },
  win:   { loop:false, keys:[[0,'idle'],[10,'taunt'],[24,'win'],[70,'win'],[80,'idle']] },
  intro: { loop:false, keys:[[0,'idle'],[14,'intro'],[40,'intro'],[54,'idle']] },
};
