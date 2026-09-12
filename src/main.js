import { W,H,DT } from './core.js';
import { Game } from './game.js';
import { setupShell } from './shell.js';
import { endFrameGlobal } from './input.js';
const canvas=document.getElementById('screen');
const ctx=canvas.getContext('2d',{alpha:false}); ctx.imageSmoothingEnabled=false;
const game=new Game(ctx);
window.addEventListener('keydown',()=>{game.audio.init();game.audio.resume();},{once:true});
function resize(){
  const availableWidth=document.getElementById('wrap').clientWidth || window.innerWidth-32;
  const availableHeight=Math.max(224,window.innerHeight-270);
  let scale=Math.min(availableWidth/W,availableHeight/H);
  if(scale>=1)scale=Math.max(1,Math.floor(scale));
  canvas.style.width=Math.floor(W*scale)+'px';canvas.style.height=Math.floor(H*scale)+'px';
}
window.addEventListener('resize',resize);
const updateShell=setupShell(game,resize);
window.addEventListener('keydown',e=>{
  if(e.code==='F2'){e.preventDefault();if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.();}
  if(e.code==='F3'){e.preventDefault();game.audio.bgmOn=!game.audio.bgmOn;}
});
document.addEventListener('fullscreenchange',resize);
await game.ready;
let acc=0,last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(100,now-last);last=now;
  if(game.paused || document.getElementById('guide').open){acc=0;endFrameGlobal();}
  else {acc+=dt;let steps=0;while(acc>=DT && steps++<5){game.update();acc-=DT;}if(steps>=5)acc=0;}
  if(game.phase!=='select')game.draw();
  updateShell();
}
updateShell();requestAnimationFrame(frame);
window.game=game;
