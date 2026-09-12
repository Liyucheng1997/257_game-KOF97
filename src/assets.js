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
    this.stages = {};
    this.errors = [];
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
    for (const [id, m] of Object.entries(manifest.characters || manifest)) {
      if (!m.sheet) continue;
      const img = new Image();
      const p = new Promise(ok => { img.onload = ok; img.onerror = () => { this.errors.push(m.sheet); ok(); }; });
      img.src = base + m.sheet;
      jobs.push(p);
      this.chars[id] = { img, scale: m.scale || 1, clips: m.clips || {}, anchor: m.anchor || 'feet' };
    }
    for (const [id, m] of Object.entries(manifest.stages || {})) {
      if (!m.image) continue;
      const img = new Image();
      jobs.push(new Promise(ok => { img.onload = ok; img.onerror = () => { this.errors.push(m.image); ok(); }; }));
      img.src = base + m.image;
      this.stages[id] = { img, ...m };
    }
    await Promise.all(jobs);
    this.loaded = true;
    console.log('[assets] 已加载精灵图:', Object.keys(this.chars).join(', '));
    return true;
  }

  drawStage(ctx, id, camX) {
    const s = this.stages[id];
    if (!s?.img.naturalWidth) return false;
    const scale = s.scale || 224 / s.img.height;
    const width = s.img.width * scale;
    ctx.fillStyle = '#080b14'; ctx.fillRect(0, 0, 320, 224);
    const offset = Math.max(0, width - 320) * Math.max(0, Math.min(1, camX / 860));
    ctx.drawImage(s.img, -offset, s.offsetY || 0, width, s.img.height * scale);
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

    const t = key === f.moveId ? f.mframe : f.aframe;
    const step = Math.floor(t * (clip.fps || 12) / 60);
    const idx = clip.loop ? step % frames.length : Math.min(step, frames.length - 1);
    const [sx, sy, sw, sh, anchorX = sw / 2, anchorY = sh] = frames[idx];
    const s = c.scale;

    ctx.save();
    ctx.translate(Math.round(f.x - camX), Math.round(f.y - f.z));
    ctx.scale(f.facing, 1);
    ctx.drawImage(c.img, sx, sy, sw, sh, -anchorX * s, -anchorY * s, sw * s, sh * s);
    ctx.restore();
    return true;
  }
}
