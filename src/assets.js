// assets.js —— 可选贴图管线
// 默认走程序化渲染；如果 assets/manifest.json 存在，就用真实精灵图替换对应状态的绘制。
//
// manifest.json 结构示例：
// {
//   "kyo": {
//     "sheet": "kyo.png",
//     "scale": 1,          // 贴图像素 -> 游戏像素 的缩放
//     "anchor": "feet",    // 锚点：脚底中心
//     "clips": {
//       "idle":   { "loop": true,  "fps": 12, "frames": [[0,0,80,110],[80,0,80,110]] },
//       "walkf":  { "loop": true,  "fps": 14, "frames": [[0,110,80,110]] },
//       "stA":    { "loop": false, "fps": 20, "frames": [[0,220,96,110],[96,220,96,110]] }
//     }
//   }
// }
//
// clips 的键名 = fighter 的 state / moveId（moveId 优先）。
// 没有匹配的键就自动回退到程序化骨骼渲染，可以只替换一部分动作。

export class Assets {
  constructor() {
    this.chars = {};       // charId -> {img, scale, clips}
    this.loaded = false;
  }

  async load(base = './assets/') {
    let manifest = null;
    try {
      const res = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw 0;
      manifest = await res.json();
    } catch (e) {
      this.loaded = true;
      return false;                 // 没有素材 —— 用程序化渲染
    }
    const jobs = [];
    for (const id in manifest) {
      const m = manifest[id];
      const img = new Image();
      const p = new Promise(ok => { img.onload = ok; img.onerror = ok; });
      img.src = base + m.sheet;
      jobs.push(p);
      this.chars[id] = { img, scale: m.scale || 1, clips: m.clips || {}, anchor: m.anchor || 'feet' };
    }
    await Promise.all(jobs);
    this.loaded = true;
    console.log('[assets] 已加载精灵图:', Object.keys(this.chars).join(', '));
    return true;
  }

  // 若该角色的该动作有贴图则绘制并返回 true
  drawFighter(ctx, f, camX) {
    const c = this.chars[f.charId];
    if (!c || !c.img.width) return false;
    const key = f.moveId && c.clips[f.moveId] ? f.moveId : (c.clips[f.state] ? f.state : null);
    if (!key) return false;
    const clip = c.clips[key];
    const frames = clip.frames;
    if (!frames || !frames.length) return false;

    const t = f.moveId ? f.mframe : f.aframe;
    const step = Math.floor(t * (clip.fps || 12) / 60);
    const idx = clip.loop ? step % frames.length : Math.min(step, frames.length - 1);
    const [sx, sy, sw, sh] = frames[idx];
    const s = c.scale;

    ctx.save();
    ctx.translate(Math.round(f.x - camX), Math.round(f.y - f.z));
    ctx.scale(f.facing, 1);
    ctx.drawImage(c.img, sx, sy, sw, sh, -sw * s / 2, -sh * s, sw * s, sh * s);
    ctx.restore();
    return true;
  }
}
