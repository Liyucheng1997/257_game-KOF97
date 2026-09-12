import assert from 'node:assert/strict';
import { test } from 'node:test';
globalThis.window = {addEventListener(){}};
Object.defineProperty(globalThis, 'navigator', {value:{getGamepads:()=>[]},configurable:true});
globalThis.fetch = async ()=>({ok:true,json:async()=>({characters:{},stages:{}})});
const {Pad,testMotion} = await import('../src/input.js');
const {Game}=await import('../src/game.js');
const {MAX_HP}=await import('../src/core.js');
const {CHARACTERS}=await import('../src/framedata.js');
function history(dirs){const p=new Pad(0);p.hist=dirs.flatMap((d,i)=>Array.from({length:3},()=>({d,b:0,press:0,t:i})));return p;}
test('97 composite motions accept correct sequences and reject single quarter circles',()=>{
 for(const [motion,dirs] of [['QCBHCF',[2,1,4,1,2,3,6]],['QCFHCB',[2,3,6,3,2,1,4]],['GEYSER',[2,1,4,1,6]]]) {
  assert.equal(testMotion(history(dirs),motion),true,motion);
  assert.equal(testMotion(history([2,3,6]),motion),false,motion+' must not activate from 236');
 }
 assert.equal(CHARACTERS.kyo.specials.orochinagi.motion,'QCBHCF');
 assert.equal(CHARACTERS.iori.specials.yaotome.motion,'QCFHCB');
 assert.equal(CHARACTERS.terry.specials.powerGeyser.motion,'GEYSER');
});
function match(mode='training') {const g=new Game({});g.mode=mode;g.stageChoice=2;g.startMatch('kyo','iori');g.phase='fight';g.banner=null;return g;}
test('training stays at 99, provides meter, does not award KO, regenerates after idle',()=>{
 const g=match();const [a,b]=g.fighters;assert.equal(g.stage.kind,2);
 a.hp=25;b.hp=30;a.stock=0;
 for(let i=0;i<100;i++)g.update();
 assert.equal(g.timer,99*60);assert.equal(a.hp,MAX_HP);assert.equal(b.hp,MAX_HP);assert.equal(a.stock,3);
 b.hp=0;g.onKO(b,a,{});assert.equal(g.phase,'fight');assert.equal(b.hp,MAX_HP);assert.deepEqual(g.wins,[0,0]);
});
test('training dummy guards low attacks and crouches on command',()=>{
 const g=match();g.trainingGuard='guard';g.fighters[0].move={hits:[{lvl:'low'}]};g.samplePads(false);assert.equal(g.pads[1].dir,1);
 g.trainingGuard='crouch';g.samplePads(false);assert.equal(g.pads[1].dir,2);
});
test('paused matches freeze; round reset clears freeze and stale input',()=>{
 const g=match('vs');g.paused=true;const frame=g.frame;g.update();assert.equal(g.frame,frame);
 g.paused=false;g.update();assert.equal(g.timer,99*60-1);
 g.freeze=23;g.slowmo=90;g.pads[0].hist=[{d:6}];g.startRound();assert.equal(g.freeze,0);assert.equal(g.slowmo,0);assert.equal(g.pads[0].hist.length,0);
});
test('all character pairs run 600 combat frames without invalid state',()=>{
 for(const a of Object.keys(CHARACTERS))for(const b of Object.keys(CHARACTERS)){
  const g=new Game({});g.startMatch(a,b);
  for(let i=0;i<600;i++)g.update();
  for(const f of g.fighters){assert.ok(Number.isFinite(f.x));assert.ok(Number.isFinite(f.hp));assert.ok(f.hp>=0&&f.hp<=MAX_HP);}
 }
});

