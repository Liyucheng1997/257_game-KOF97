// stage.js —— 程序化视差舞台
import { W, H, GROUND_Y, STAGE_W, rnd, rndi, clamp, lerp } from './core.js';

// 用固定种子生成，保证每局画面一致
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Stage {
  constructor(kind = 0) {
    this.kind = kind;
    this.t = 0;
    this.build();
  }

  build() {
    const r = mulberry(1337 + this.kind * 977);
    this.crowd = [];
    for (let i = 0; i < 90; i++) {
      this.crowd.push({
        x: r() * (STAGE_W + 400) - 200,
        row: (r() * 3) | 0,
        h: 12 + r() * 7,
        w: 5 + r() * 3,
        c: r(),
        ph: r() * 6.28,
        sp: .04 + r() * .05,
      });
    }
    this.far = [];
    for (let i = 0; i < 26; i++) {
      this.far.push({ x: r() * (STAGE_W + 600) - 300, w: 30 + r() * 60, h: 40 + r() * 80, c: r() });
    }
    this.lamps = [];
    for (let i = 0; i < 14; i++) this.lamps.push({ x: 40 + i * 90 + r() * 20, y: 40 + r() * 24, c: r() });
    this.debris = [];
    for (let i = 0; i < 40; i++) this.debris.push({ x: r() * STAGE_W, y: GROUND_Y + 4 + r() * 22, w: 2 + r() * 8, c: r() });
  }

  update() { this.t++; }

  // camX: 摄像机左边界世界坐标
  draw(ctx, camX) {
    const K = this.kind;
    if (K === 0) this.drawStreet(ctx, camX);
    else if (K === 1) this.drawTemple(ctx, camX);
    else this.drawHarbor(ctx, camX);
    this.drawGround(ctx, camX);
    this.drawAtmosphere(ctx, camX);
  }

  // ——— 夜市街道 ———
  drawStreet(ctx, camX) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, '#171029'); g.addColorStop(.45, '#3a1f38'); g.addColorStop(.8, '#7a3a3c'); g.addColorStop(1, '#b06044');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y + 30);

    // 月亮
    const mx = 250 - camX * .04;
    ctx.globalAlpha = .9;
    const mg = ctx.createRadialGradient(mx, 34, 2, mx, 34, 26);
    mg.addColorStop(0, 'rgba(255,246,214,.95)'); mg.addColorStop(.35, 'rgba(255,230,170,.4)'); mg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, 34, 26, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(mx, 34, 9, 0, 6.284); ctx.fill();
    ctx.globalAlpha = 1;

    // 远景楼房
    for (const b of this.far) {
      const x = b.x - camX * .18;
      if (x < -120 || x > W + 120) continue;
      ctx.fillStyle = b.c < .5 ? '#241a30' : '#2c1f38';
      ctx.fillRect(x, GROUND_Y - 30 - b.h, b.w, b.h + 30);
      // 窗户
      ctx.fillStyle = 'rgba(255,200,110,.5)';
      for (let wy = 0; wy < b.h - 10; wy += 9) {
        for (let wx = 4; wx < b.w - 5; wx += 8) {
          if (((wx * 7 + wy * 3 + b.c * 100) | 0) % 3 === 0) ctx.fillRect(x + wx, GROUND_Y - 26 - b.h + wy, 3, 4);
        }
      }
    }

    // 灯笼串
    ctx.strokeStyle = 'rgba(30,18,26,.9)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= W + 20; i += 4) {
      const wx = i, wy = 44 + Math.sin((i + camX * .35) * .02) * 5;
      i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    for (const l of this.lamps) {
      const x = l.x - camX * .35;
      if (x < -20 || x > W + 20) continue;
      const y = 44 + Math.sin((x + camX * .35) * .02) * 5 + 6 + Math.sin(this.t * .03 + l.c * 6) * 1.2;
      const col = l.c < .5 ? '#ff5a3c' : '#ffb43c';
      ctx.globalAlpha = .35;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.284); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, 4, 5.2, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,.85)'; ctx.fillRect(x - 1, y - 1.5, 2, 3);
    }

    this.drawArchitecture(ctx, camX);
    this.drawCrowd(ctx, camX, ['#2a1c2e', '#341f2a', '#3d2430']);
  }

  // ——— 神社 ———
  drawTemple(ctx, camX) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, '#0d1430'); g.addColorStop(.5, '#1b2a52'); g.addColorStop(1, '#4a5a86');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y + 30);

    // 星
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137) % 400) - camX * .02;
      const sy = (i * 53) % 90;
      if (sx < 0 || sx > W) continue;
      ctx.globalAlpha = .3 + .5 * Math.abs(Math.sin(this.t * .02 + i));
      ctx.fillStyle = '#dfe9ff'; ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;

    // 远山
    ctx.fillStyle = '#16203f';
    ctx.beginPath(); ctx.moveTo(-50 - camX * .1, GROUND_Y);
    for (let i = 0; i <= 12; i++) {
      const x = -50 + i * 60 - camX * .1;
      ctx.lineTo(x, GROUND_Y - 40 - Math.abs(Math.sin(i * 1.7)) * 46);
    }
    ctx.lineTo(W + 100, GROUND_Y); ctx.closePath(); ctx.fill();

    // 鸟居
    const tx = 385 - camX * .5;
    if (tx > -160 && tx < W + 160) {
      ctx.fillStyle = '#7d1f24';
      ctx.fillRect(tx - 60, GROUND_Y - 96, 9, 96);
      ctx.fillRect(tx + 52, GROUND_Y - 96, 9, 96);
      ctx.fillRect(tx - 78, GROUND_Y - 100, 156, 8);
      ctx.fillRect(tx - 86, GROUND_Y - 112, 172, 9);
      ctx.fillStyle = '#5d1418'; ctx.fillRect(tx - 86, GROUND_Y - 112, 172, 3);
    }
    this.drawArchitecture(ctx, camX);
    this.drawCrowd(ctx, camX, ['#101a34', '#16223f', '#1c2a4c']);
  }

  // ——— 码头 ———
  drawHarbor(ctx, camX) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, '#2a1607'); g.addColorStop(.4, '#7a3410'); g.addColorStop(.72, '#d17a2a'); g.addColorStop(1, '#f2b45c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y + 30);

    const sx = 180 - camX * .03;
    ctx.fillStyle = 'rgba(255,240,180,.95)';
    ctx.beginPath(); ctx.arc(sx, 92, 20, 0, 6.284); ctx.fill();
    ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(sx, 92, 40, 0, 6.284); ctx.fill(); ctx.globalAlpha = 1;

    // 海面
    ctx.fillStyle = '#8a4a1c'; ctx.fillRect(0, GROUND_Y - 48, W, 48);
    for (let i = 0; i < 40; i++) {
      const wy = GROUND_Y - 46 + (i % 12) * 4;
      const ph = Math.sin(this.t * .04 + i * 1.3) * 12;
      ctx.globalAlpha = .28;
      ctx.fillStyle = i % 3 === 0 ? '#ffd89a' : '#c97b2c';
      ctx.fillRect(((i * 47 + ph) % (W + 40)) - 20, wy, 14 + (i % 5) * 4, 1.4);
    }
    ctx.globalAlpha = 1;

    // 吊车 / 集装箱
    for (const b of this.far) {
      const x = b.x - camX * .22;
      if (x < -120 || x > W + 120) continue;
      ctx.fillStyle = ['#4a2a18', '#5c3520', '#3a2012'][(b.c * 3) | 0];
      ctx.fillRect(x, GROUND_Y - 44 - b.h * .4, b.w * .8, b.h * .4 + 44);
    }
    this.drawArchitecture(ctx, camX);
    this.drawCrowd(ctx, camX, ['#3d2312', '#4a2c18', '#57351e']);
  }

  drawArchitecture(ctx, camX) {
    ctx.save();
    if (this.kind === 0) {
      for (let i=0;i<8;i++) {
        const x=i*125-80-camX*.6;
        ctx.fillStyle=i%2?'#263642':'#49313b';ctx.fillRect(x,96,108,91);
        ctx.fillStyle='#101b24';ctx.fillRect(x+7,125,94,57);
        ctx.fillStyle=i%2?'#b9ddd0':'#efb567';ctx.fillRect(x+7,101,94,20);
        ctx.fillStyle='#302332';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText(['NEO ARCADE','らーめん','GAME CENTER','夜市酒場'][i%4],x+54,115);
        ctx.fillStyle='#ed8b65';ctx.fillRect(x+3,123,102,5);
        for(let j=0;j<6;j++){ctx.fillStyle=j%2?'#d8c6aa':'#9b3947';ctx.fillRect(x+3+j*17,128,17,5);}
        ctx.strokeStyle='#556168';ctx.lineWidth=1;for(let j=0;j<7;j++){ctx.beginPath();ctx.moveTo(x+10+j*13,138);ctx.lineTo(x+10+j*13,180);ctx.stroke();}
        ctx.fillStyle='#cd7450';ctx.fillRect(x+38,153,30,19);ctx.fillStyle='#201c2b';ctx.fillRect(x+40,155,26,15);
      }
    } else if(this.kind === 1) {
      for(let i=0;i<8;i++){
        const x=i*112-camX*.65;
        ctx.fillStyle='#283047';ctx.fillRect(x-12,161,24,24);ctx.fillRect(x-17,156,34,5);
        ctx.fillStyle='#9da2b0';ctx.fillRect(x-5,173,10,20);ctx.fillRect(x-11,190,22,5);
        ctx.fillStyle='#ebc98c';ctx.fillRect(x-8,163,16,9);ctx.fillStyle='#48445a';ctx.fillRect(x-1,163,2,9);
        ctx.fillStyle='#363d52';ctx.beginPath();ctx.moveTo(x-23,156);ctx.lineTo(x,144);ctx.lineTo(x+23,156);ctx.fill();
      }
      ctx.strokeStyle='#25273c';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(24,180);ctx.bezierCurveTo(50,130,21,55,60,20);ctx.stroke();
      for(let i=0;i<16;i++){const x=(i*37)%130-30,y=45+(i*19)%65;ctx.fillStyle=i%2?'#633b61':'#804b72';ctx.beginPath();ctx.ellipse(x,y,25,13,0,0,6.283);ctx.fill();}
    } else {
      const x=340-camX*.38;
      ctx.fillStyle='#302b2c';ctx.beginPath();ctx.moveTo(x-80,160);ctx.lineTo(x+95,160);ctx.lineTo(x+65,182);ctx.lineTo(x-60,182);ctx.closePath();ctx.fill();
      ctx.fillStyle='#b79467';ctx.fillRect(x-17,133,54,27);ctx.fillStyle='#423c37';for(let i=0;i<4;i++)ctx.fillRect(x-12+i*12,138,8,6);
      ctx.strokeStyle='#312e2b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+8,135);ctx.lineTo(x+8,64);ctx.lineTo(x-69,89);ctx.moveTo(x+8,70);ctx.lineTo(x+79,84);ctx.stroke();
      ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-65,89);ctx.lineTo(x-65,154);ctx.moveTo(x+74,84);ctx.lineTo(x+74,153);ctx.stroke();
      ctx.fillStyle='#deba78';ctx.font='bold 7px monospace';ctx.fillText('SOUTH TOWN',x-22,173);
    }
    ctx.restore();
  }

  drawAtmosphere(ctx, camX) {
    ctx.save();
    if(this.kind === 1){
      for(let i=0;i<18;i++){const x=((i*79+this.t*.45-camX*.2)%370+370)%370-25,y=(i*41+this.t*.27)%190;ctx.fillStyle=i%2?'#d79ac1':'#a774a0';ctx.fillRect(x,y,3,1);}
    } else if(this.kind === 0){
      ctx.globalAlpha=.17;for(let i=0;i<12;i++){ctx.fillStyle=i%2?'#f6a474':'#8fc6e6';ctx.fillRect((i*53-camX*.8+700)%370,201+i%4*4,19+i%3*9,1);}
    } else {
      ctx.strokeStyle='#392820';ctx.lineWidth=1;
      for(let i=0;i<5;i++){const x=(i*67+this.t*.18)%360-20,y=43+i*9;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x,y+Math.sin(this.t*.1+i)*2);ctx.lineTo(x+4,y);ctx.stroke();}
    }
    ctx.restore();
  }

  drawCrowd(ctx, camX, cols) {
    for (const c of this.crowd) {
      const par = .55 + c.row * .08;
      const x = c.x - camX * par;
      if (x < -20 || x > W + 20) continue;
      const base = GROUND_Y - 4 + c.row * 3;
      const bob = Math.sin(this.t * c.sp + c.ph) * 1.6;
      ctx.fillStyle = cols[c.row];
      ctx.fillRect(x, base - c.h + bob, c.w, c.h);
      ctx.beginPath(); ctx.arc(x + c.w / 2, base - c.h + bob - 1, c.w * .48, 0, 6.284); ctx.fill();
    }
    // 地面前的护栏 / 阴影带
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, GROUND_Y - 6, W, 6);
  }

  drawGround(ctx, camX) {
    const gg = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    if (this.kind === 0) { gg.addColorStop(0, '#5b4030'); gg.addColorStop(1, '#2b1c16'); }
    else if (this.kind === 1) { gg.addColorStop(0, '#4a4a52'); gg.addColorStop(1, '#1e1e26'); }
    else { gg.addColorStop(0, '#6a5236'); gg.addColorStop(1, '#33261a'); }
    ctx.fillStyle = gg; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // 地砖纹理
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
    for (let i = -1; i < 14; i++) {
      const x = ((i * 40 - camX * 1) % (W + 80) + W + 80) % (W + 80) - 40;
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x - 12, H); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    for (let y = GROUND_Y + 6; y < H; y += 8) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // 碎石
    for (const d of this.debris) {
      const x = d.x - camX;
      if (x < -10 || x > W + 10) continue;
      ctx.fillStyle = d.c < .5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.07)';
      ctx.fillRect(x, d.y, d.w, 1.4);
    }
    // 地面高光
    ctx.fillStyle = 'rgba(255,220,160,.10)';
    ctx.fillRect(0, GROUND_Y, W, 2);
  }
}
