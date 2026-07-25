// main.js —— 启动、画面缩放、固定步长主循环
import { W, H, DT } from './core.js';
import { Game } from './game.js';
import { keyPressed, endFrameGlobal } from './input.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const game = new Game(ctx);

// ——— 整数倍缩放，保持像素锐利 ———
function resize() {
  const pad = 24;
  const availW = window.innerWidth - pad, availH = window.innerHeight - pad;
  let scale = Math.min(availW / W, availH / H);
  scale = scale >= 1 ? Math.floor(scale * 2) / 2 : scale;   // 允许 .5 档位
  canvas.style.width = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';
}
window.addEventListener('resize', resize);
resize();

// ——— 固定 60fps 逻辑步长 ———
let acc = 0, last = performance.now(), running = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  let dt = now - last;
  last = now;
  if (dt > 200) dt = 200;              // 卡顿保护
  acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 5) {
    game.update();
    acc -= DT;
    steps++;
  }
  game.draw();
}
requestAnimationFrame(frame);

// ——— 全局热键 ———
window.addEventListener('keydown', e => {
  if (e.code === 'F2') {
    e.preventDefault();
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
    setTimeout(resize, 120);
  }
  if (e.code === 'F3') { game.audio.bgmOn = !game.audio.bgmOn; }
});

// ——— 启动 ———
const boot = document.getElementById('boot');
document.getElementById('startBtn').addEventListener('click', () => {
  game.audio.init();
  game.audio.resume();
  boot.style.display = 'none';
  running = true;
  last = performance.now();
  canvas.focus();
});

window.addEventListener('pointerdown', () => game.audio.resume(), { once: true });
window.game = game;   // 便于调试
