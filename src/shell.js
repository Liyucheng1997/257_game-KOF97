import { CHARACTERS, ROSTER } from './framedata.js';
import { Stage } from './stage.js';
import { drawFighter } from './render.js';
import { POSE } from './pose.js';
import { clearInput } from './input.js';

const $ = id => document.getElementById(id);
const profiles = {
  kyo: { style: '近身压制 / 赤焰连拳', text: '以荒咬与追加攻击压迫对手，鬼烧截击跳跃。', pose: { eF:[15,62], hF:[22,73], eB:[-12,55], hB:[-3,61], ftF:[19,0], ftB:[-17,0] } },
  iori: { style: '中距离牵制 / 紫炎连击', text: '暗拂牵制，葵花追击，抓住破绽发动八稚女。', pose: { hip:[-2,42], chest:[7,62], head:[13,78], eF:[20,50], hF:[27,37], eB:[-12,50], hB:[-18,39], ftF:[21,0], ftB:[-19,0] } },
  terry: { style: '突进强攻 / 能量爆发', text: '能量波封锁地面，火焰冲拳拉近距离。', pose: { eF:[15,61], hF:[19,75], eB:[-10,57], hB:[-2,69], ftF:[18,0], ftB:[-18,0] } },
};
const stages = [['NIGHT STREET','夜市街道'],['MOONLIT TEMPLE','月下神社'],['SUNSET HARBOR','落日港口']];
export const moveNames = {
  arakami:'百十四式 · 荒咬', dokugami:'追加拳（自制连段）', nanase:'追加踢（自制连段）', shiki75:'七拾五式 · 改', oniyaki:'百式 · 鬼烧', redKick:'R.E.D. KICK', orochinagi:'里百八式 · 大蛇薙', mushiki:'最终决战奥义 · 无式',
  yamibarai:'百八式 · 暗拂', rekka1:'百贰拾七式 · 葵花', rekka2:'葵花 · 二段', rekka3:'葵花 · 三段', kuzukaze:'屑风', yaotome:'禁千贰百拾壹式 · 八稚女', kinYami:'紫炎爆发（自制扩展技）', powerWave:'POWER WAVE · 能量波', burnKnuckle:'BURN KNUCKLE · 火焰冲拳', crackShoot:'CRACK SHOOT · 碎石踢', risingTackle:'RISING TACKLE · 倒跃踢', powerDunk:'POWER DUNK · 能量灌篮', powerGeyser:'POWER GEYSER · 能量喷泉', busterWolf:'BUSTER WOLF（后期扩展技）',
};
const motions = { QCF:'↓ ↘ →', QCB:'↓ ↙ ←', DP:'→ ↓ ↘', RDP:'← ↓ ↙', HCB:'→ ↘ ↓ ↙ ←', HCF:'← ↙ ↓ ↘ →', QCFx2:'↓ ↘ → ↓ ↘ →', QCBx2:'↓ ↙ ← ↓ ↙ ←', QCBHCF:'↓ ↙ ← ↙ ↓ ↘ →', QCFHCB:'↓ ↘ → ↘ ↓ ↙ ←', GEYSER:'↓ ↙ ← ↙ →' };

export function setupShell(game, resize) {
  let current = '', tick = 0, guidePaused = false;
  const portraits = [];
  const beginAudio = () => { game.audio.init(); game.audio.resume(); };
  ROSTER.forEach((id, i) => {
    const c = CHARACTERS[id], button = document.createElement('button');
    button.className = 'fighter-card'; button.setAttribute('aria-label', `选择${c.cn}`);
    button.innerHTML = `<canvas width="176" height="172"></canvas><span class="number">0${i+1} / JAPAN</span><span class="picked" hidden>1P SELECT</span><div class="card-info"><h3>${c.name}</h3><p>${c.cn}</p><small>${profiles[id].style}</small></div>`;
    if (id === 'terry') button.querySelector('.number').textContent = '03 / USA';
    button.onclick = () => { beginAudio(); game.sel.cursor[game.sel.locked[0] ? 1 : 0] = i; game.audio.play('cursor'); };
    $('roster').append(button); portraits.push({ id, button, ctx:button.querySelector('canvas').getContext('2d') });
  });
  stages.forEach(([name, cn], i) => {
    const button = document.createElement('button'); button.className = 'stage-card'; button.innerHTML = `<canvas width="320" height="224"></canvas><span>${cn} / 0${i+1}</span>`; button.setAttribute('aria-label', `选择${cn}`);
    const ctx = button.querySelector('canvas').getContext('2d'); new Stage(i).draw(ctx,430);
    button.onclick = () => { game.stageChoice = i; beginAudio(); game.audio.play('cursor'); };
    $('stages').append(button);
  });
  $('mode').onchange = e => { game.sel.mode = Number(e.target.value); };
  $('startBtn').onclick = () => {
    beginAudio();
    const s = game.sel;
    if (!s.locked[0]) { s.locked[0] = true; game.audio.play('select'); }
    else { s.locked[1] = true; game.mode = ['cpu','cpu','vs','training'][s.mode]; game.aiLevel = s.mode === 0 ? 2 : 4; game.startMatch(...s.cursor.map(i=>ROSTER[i])); }
  };
  $('backBtn').onclick = () => { game.sel.locked = [false,false]; };
  const pause = () => { if (game.phase === 'select' || $('guide').open) return; game.paused = !game.paused; clearInput(); };
  $('pauseBtn').onclick = pause;
  $('returnBtn').onclick = () => { game.phase = 'select'; game.paused = false; game.sel.locked = [false,false]; game.audio.stopBGM(); clearInput(); };
  function openGuide() {
    if ($('guide').open) return;
    guidePaused = game.paused; game.paused = true; clearInput();
    const ids = game.phase === 'select' ? ROSTER : [...new Set(game.fighters.map(f=>f.charId))];
    $('moveList').innerHTML = ids.map(id => `<section class="move-section"><h3>${CHARACTERS[id].name} / ${CHARACTERS[id].cn}</h3>${Object.entries(CHARACTERS[id].specials).filter(([,m])=>m.motion).map(([key,m])=>`<div class="move-row"><span>${m.type==='dm'?'★ ':''}${moveNames[key] || key}</span><code>${motions[m.motion] || m.motion} + ${m.btn}</code></div>`).join('')}</section>`).join('');
    $('guide').showModal();
  }
  $('guide').addEventListener('close',()=>{ game.paused = guidePaused; clearInput(); });
  $('closeGuide').onclick = () => $('guide').close();
  $('movesBtn').onclick = $('helpBtn').onclick = openGuide;
  $('dummy').onchange = e => game.trainingGuard = e.target.value;
  $('boxes').onchange = e => game.showBoxes = e.target.checked;
  const reset = () => { if(game.mode==='training' && game.phase!=='select') {game.startRound();game.phase='fight';game.banner=null;game.trainingIdle=0;clearInput();} };
  $('resetBtn').onclick = reset;
  window.addEventListener('keydown', e => {
    if ($('guide').open) { if(e.code==='Tab') return; return; }
    if(e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    if(e.code==='Escape' && !e.repeat) { e.preventDefault();pause(); }
    if(e.code==='Tab' && !e.repeat) { e.preventDefault();openGuide(); }
    if(e.code==='KeyR' && !e.repeat) reset();
  });
  window.addEventListener('blur',()=>{ if(game.phase!=='select') game.paused=true; });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && game.phase!=='select') game.paused=true; });
  return () => {
    const selecting = game.phase==='select';
    if(current !== (selecting?'lobby':'arena')) {
      current = selecting?'lobby':'arena'; $('lobby').hidden=!selecting; $('arena').hidden=selecting; resize();
      if(!selecting) $('screen').focus();
    }
    $('pauseOverlay').hidden = !game.paused;
    $('pauseBtn').innerHTML = `${game.paused?'继续':'暂停'} <kbd>Esc</kbd>`;
    $('trainingBar').hidden = game.mode!=='training'; $('boxes').checked=game.showBoxes;
    if(!selecting) {
      $('matchTitle').textContent=game.fighters.map(f=>f.char.name).join('  VS  ')+' / '+stages[game.stageChoice][1];
      if(game.mode==='training') {
        const dirs=['','↙','↓','↘','←','·','→','↖','↑','↗'];
        const entries=game.pads[0].hist.filter((h,i,a)=>i===0 || h.d!==a[i-1].d || h.press).slice(-9);
        $('inputHistory').textContent=entries.map(h=>dirs[h.d]+['A','B','C','D'].filter((_,i)=>h.press & (1<<i)).join('')).join('  ');
      }
      return;
    }
    const s=game.sel, active=s.locked[0]?1:0, id=ROSTER[s.cursor[active]];
    $('selectLabel').textContent=s.locked[0]?'01 / 选择对手格斗家':'01 / 选择你的格斗家';
    $('selectionHint').textContent=active?(s.mode===2?'PLAYER 2':'CPU RIVAL'):'PLAYER 1';
    $('p1Name').textContent=CHARACTERS[ROSTER[s.cursor[0]]].cn; $('p2Name').textContent=CHARACTERS[ROSTER[s.cursor[1]]].cn;
    $('fighterDetail').innerHTML=`<b>${profiles[id].style}</b><br>${profiles[id].text}`;
    $('mode').value=s.mode; $('backBtn').disabled=!s.locked[0];
    $('startBtn').innerHTML=s.locked[0]?'开始对战 <span>→</span>':'确认格斗家 <span>→</span>';
    [...$('stages').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===game.stageChoice)));
    tick++;
    for(const {id,button,ctx} of portraits) {
      const c=CHARACTERS[id], selected=ROSTER[s.cursor[active]]===id;
      button.setAttribute('aria-pressed',String(selected)); const badge=button.querySelector('.picked');badge.hidden=!selected;badge.textContent=active?'RIVAL SELECT':'1P SELECT';
      const grad=ctx.createLinearGradient(0,0,176,172);grad.addColorStop(0,'#242932');grad.addColorStop(1,id==='iori'?'#352542':id==='kyo'?'#49352c':'#423a28');ctx.fillStyle=grad;ctx.fillRect(0,0,176,172);
      ctx.fillStyle=c.color+'14';for(let j=-2;j<10;j++){ctx.beginPath();ctx.moveTo(j*36,0);ctx.lineTo(j*36+13,0);ctx.lineTo(j*36-75,172);ctx.lineTo(j*36-88,172);ctx.fill();}
      ctx.strokeStyle=c.color+'50';ctx.lineWidth=1;ctx.beginPath();ctx.arc(88,92,60,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#ffffff05';ctx.font='italic bold 67px Arial';ctx.textAlign='center';ctx.fillText(c.name,88,94);
      ctx.save();ctx.translate(88,160);ctx.scale(1.55,1.55);
      const f={charId:id,x:0,y:0,z:0,facing:1,state:'idle',aframe:tick,paletteName:c.palette,hairStyle:c.hairStyle,outfit:c.outfit,cap:!!c.cap};
      if(!game.assets.drawFighter(ctx,f,0)) drawFighter(ctx,f,{...POSE.idle,...profiles[id].pose,head:[profiles[id].pose.head?.[0] ?? 4,(profiles[id].pose.head?.[1] ?? 82)+Math.sin(tick*.035)*.65]});
      ctx.restore();
    }
  };
}
