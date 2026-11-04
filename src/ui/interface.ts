import { zombieMarkup } from './threat.ts';
import { CONFIG, SHIRTS } from '../data/config.ts';
import { timeLabel } from '../simulation/clock.ts';
import type { World } from '../simulation/world.ts';
import type { SimulationClock } from '../simulation/clock.ts';
import type { Scene } from '../rendering/scene.ts';
import { STATS, personalitySummary, traitSummary } from '../data/character.ts';
import { escapeHTML as esc } from './html.ts';
import { SurvivalPanel, survivalWarning } from './survival.ts';
import { AIPanel } from './ai.ts';
import { conditionMarkup } from './condition.ts';
export function mountUI(world:World){
  document.querySelector('#app')!.innerHTML=`
  <header class="topbar"><div class="brand"><span class="brand-mark">R<span>▪</span></span><span>ROT<span class="accent">WORLD</span><small>작은 도시, 이어지는 선택</small></span></div><div class="edition">회차 <span>${esc(world.runId)}</span> PROTOTYPE 06</div><div class="clock"><span class="live-dot"></span><span id="day">DAY 01</span><strong id="time">08:00:00</strong><span id="run-state">진행 중</span></div></header>
  <div class="run-bar"><span><b>메인 캐릭터</b> ${esc(world.citizens.find(c=>c.id===world.mainCharacterId)?.name??'없음')}</span><div><button id="main-character">주인공 찾기 ⌖</button><button id="new-run">새 회차</button></div></div>
  <main class="workspace"><section id="map" aria-label="도시 관찰 지도" tabindex="0">
    <div class="place"><span class="overline">DISTRICT 01</span><h1>해솔동</h1><p>사람들의 다음 발걸음을 따라가 보세요.</p></div>
    <div id="loading" role="status">도시를 불러오고 있습니다…</div>
    <div class="map-tag"><i></i> 인간 <b>12</b><span>·</span>건물 <b>12</b><span>·</span>좀비 <b>${world.zombies.length}</b></div>
    <div class="map-tools"><button id="zoom-in" aria-label="지도 확대" title="지도 확대">＋</button><output id="zoom">100%</output><button id="zoom-out" aria-label="지도 축소" title="지도 축소">−</button><span></span><button id="fit" title="전체 지도 (F)" aria-label="전체 지도 보기">⌖</button></div>
    <div class="map-help"><span>드래그 <b>지도 이동</b></span><span>휠 <b>확대·축소</b></span><span>클릭 <b>인간 선택</b></span></div>
    <div class="pause-banner" id="pause-banner" hidden>Ⅱ &nbsp; 일시정지 <small>지도를 둘러보거나 인간을 선택할 수 있습니다.</small></div>
  </section>
  <aside class="sidebar"><div class="aside-title"><span class="overline">OBSERVATION</span><span class="chip">관찰 모드</span></div><div class="tabs"><button id="tab-person" class="active">선택한 인간</button><button id="tab-list">인간 목록 <span>12</span></button></div>
  <section id="person-panel" aria-label="선택한 인간 정보"><div id="inspector"></div></section>
  <section id="list-panel" aria-label="인간 목록" hidden><p class="list-hint">이름을 누르면 지도에서 위치를 찾습니다.</p><div class="citizen-list">${world.citizens.map(c=>`<button data-person="${c.id}"><span class="mini-person" style="--shirt:${SHIRTS[c.id%6]}"></span><span><strong>${esc(c.name)} ${c.id===world.mainCharacterId?'<small class="main-badge">메인 캐릭터</small>':''}</strong><small>${c.age}세 · 이전 ${c.job}</small></span><span class="list-arrow">↗</span></button>`).join('')}</div><h3>좀비 목록</h3><div class="citizen-list">${world.zombies.map(z=>`<button data-person="${-z.id-1}"><strong>좀비 ${z.id+1}</strong><span>↗</span></button>`).join('')}</div></section>
  <div class="scope-note"><span>06 — 좀비·소음·위험 대응</span><p>NPC는 직접 관찰한 기억으로 물자·섭취·수면을 선택합니다. 메인 캐릭터도 자율 생존을 켤 수 있습니다. 건물을 클릭하면 직접 지시할 장소를 선택합니다. 좀비는 본 인간·들은 소리를 추적하고 자율 인간은 개인 기억으로 도주·은신합니다. 공격·피해·감염은 없으며 새로고침하면 초기화됩니다.</p></div></aside></main>
  <footer class="bottom-bar"><div class="time-controls"><button id="pause" aria-label="일시정지" title="일시정지 / 재개 (Space)">Ⅱ</button><div class="speeds" aria-label="시간 배속">${[1,2,4].map(n=>`<button data-speed="${n}" class="${n===1?'active':''}" aria-pressed="${n===1}">${n}×</button>`).join('')}</div><span class="shortcut">SPACE <span>일시정지</span></span></div><div class="event-strip"><span class="event-label">도시 기록</span><span id="latest-event">관찰 시작</span></div><span class="version">ROT WORLD <b>v0.6</b></span></footer>
  <dialog id="new-run-dialog" aria-labelledby="reset-title"><h2 id="reset-title">새 회차를 시작할까요?</h2><p>현재 세계의 시간·인물·이동 기록과 메인 캐릭터가 초기화됩니다. 캐릭터 생성으로 돌아갑니다.</p><div><button id="cancel-reset">현재 회차 계속</button><button id="confirm-reset" class="primary-button">초기화하고 새로 시작</button></div></dialog>
  <div class="mobile-note">인간 목록에서 대상을 선택할 수 있습니다.</div>`;
}
export class Interface {
  private lastInspector='';private lastEvent='';
  private survival:SurvivalPanel;private ai:AIPanel;
  constructor(private world:World,private clock:SimulationClock,private scene:Scene,onNewRun:()=>void){
    document.querySelector<HTMLButtonElement>('#main-character')!.onclick=()=>{if(world.mainCharacterId!==null){this.select(world.mainCharacterId);scene.focus(world.mainCharacterId);}};
    const dialog=document.querySelector<HTMLDialogElement>('#new-run-dialog')!;let wasPaused=false;
    document.querySelector<HTMLButtonElement>('#new-run')!.onclick=()=>{wasPaused=clock.paused;clock.paused=true;this.update();dialog.showModal();document.querySelector<HTMLButtonElement>('#cancel-reset')!.focus();};
    const cancel=()=>{dialog.close();clock.paused=wasPaused;this.update();};
    document.querySelector<HTMLButtonElement>('#cancel-reset')!.onclick=cancel;
    dialog.oncancel=e=>{e.preventDefault();cancel();};
    document.querySelector<HTMLButtonElement>('#confirm-reset')!.onclick=()=>{dialog.close();onNewRun();};
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-person]'))button.onclick=()=>{this.select(Number(button.dataset.person));this.scene.focus(Number(button.dataset.person));};
    document.querySelector<HTMLButtonElement>('#tab-person')!.onclick=()=>this.tab(false);
    document.querySelector<HTMLButtonElement>('#tab-list')!.onclick=()=>this.tab(true);
    document.querySelector<HTMLButtonElement>('#pause')!.onclick=()=>this.togglePause();
    for(const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))b.onclick=()=>{this.clock.speed=Number(b.dataset.speed);this.clock.paused=false;this.update();};
    document.querySelector<HTMLButtonElement>('#zoom-in')!.onclick=()=>{this.scene.zoom(1.25);this.update();};
    document.querySelector<HTMLButtonElement>('#zoom-out')!.onclick=()=>{this.scene.zoom(.8);this.update();};
    document.querySelector<HTMLButtonElement>('#fit')!.onclick=()=>{this.scene.fit();this.update();};
    this.survival=new SurvivalPanel(world,()=>scene.selected);
    this.ai=new AIPanel(world,()=>scene.selected);
    this.select(world.mainCharacterId??0);
  }
  tab(list:boolean){document.querySelector<HTMLElement>('#list-panel')!.hidden=!list;document.querySelector<HTMLElement>('#person-panel')!.hidden=list;document.querySelector('#tab-list')!.classList.toggle('active',list);document.querySelector('#tab-person')!.classList.toggle('active',!list);}
  select(id:number|null){this.scene.selected=id;this.scene.follow=false;this.tab(false);this.lastInspector='';this.update();}
  selectBuilding(id:number){if(this.scene.selected===null||this.scene.selected<0)this.select(this.world.mainCharacterId??0);this.tab(false);this.survival.choosePlace(id);document.querySelector('#survival-panel')?.scrollIntoView({block:'nearest'});}
  togglePause(){this.clock.paused=!this.clock.paused;this.update();}
  update(){
    document.querySelector('#time')!.textContent=timeLabel(this.world.seconds);
    document.querySelector('#day')!.textContent=`DAY ${String(1+Math.floor((this.world.seconds+CONFIG.startHour*3600)/86400)).padStart(2,'0')}`;
    document.querySelector('#run-state')!.textContent=this.clock.paused?'일시정지':`${this.clock.speed}× 진행 중`;
    document.querySelector('.live-dot')!.classList.toggle('stopped',this.clock.paused);
    const pause=document.querySelector<HTMLButtonElement>('#pause')!;pause.textContent=this.clock.paused?'▶':'Ⅱ';pause.setAttribute('aria-label',this.clock.paused?'재개':'일시정지');pause.classList.toggle('active',this.clock.paused);
    document.querySelector<HTMLElement>('#pause-banner')!.hidden=!this.clock.paused;
    document.querySelector('#zoom')!.textContent=`${Math.round(this.scene.camera.zoom*100)}%`;
    for(const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')){const active=Number(b.dataset.speed)===this.clock.speed;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
    const c=this.scene.selected===null?null:this.world.citizens[this.scene.selected];
    const z=this.scene.selected!==null&&this.scene.selected<0?this.world.zombies[-this.scene.selected-1]:null;
    const content=z?zombieMarkup(z):c?`<div class="identity"><div class="portrait" style="--shirt:${SHIRTS[c.id%6]}"><span></span></div><div><span class="overline">${c.id===this.world.mainCharacterId?'MAIN CHARACTER':'HUMAN'} · ${String(c.id+1).padStart(3,'0')}</span><h2>${esc(c.name)}</h2><p>${c.age}세 <span>·</span> 이전 ${c.job}</p></div></div>
    <div class="status-row"><span class="status-pill">● ${c.activity.kind==='sleep'?'수면 중':c.activity.kind==='rest'?'휴식 중':c.brain.enabled?'자율 생존':'직접 지시'}</span><button id="follow" class="text-button" aria-pressed="${this.scene.follow}">${this.scene.follow?'추적 해제':'위치 따라가기'} ↗</button></div>
    <div class="info-section"><h3>현재 행동</h3><strong class="action">${c.action}</strong><p class="reason">${c.reason}</p><div class="route-info"><span>목적지</span><b>${c.activity.kind==='explore'?`관찰할 구역 (${Math.floor(c.activity.point.x)}, ${Math.floor(c.activity.point.y)})`:c.activity.kind==='travel'||c.activity.kind==='sleep'||c.activity.kind==='handling'||c.activity.kind==='tour'?esc(this.world.buildings[c.destination].name):'—'}</b></div><div class="route-info"><span>위치</span><b id="citizen-position"></b></div></div>
    <div class="info-section"><h3>생존 상태 <span class="subtle">게임 시간에 따라 변화</span></h3><div class="needs">${[['허기','hunger'],['갈증','thirst'],['피로','fatigue'],['공포','fear']].map(([name,key])=>`<div><span>${name}</span><strong><span data-need="${key}"></span><small> / 100</small></strong></div>`).join('')}</div><p class="needs-help" id="needs-warning"></p><p class="subtle">공포는 직접 인지한 위협에 반응합니다. 부상·치료는 후속 단계입니다.</p><div id="condition-summary" class="condition-readout"></div><div id="condition-alerts" class="needs-help" role="status" aria-live="polite"></div><details class="condition-details"><summary>상태 변화·불이익의 원인</summary><div id="condition-details"></div></details></div>
    <div class="info-section" id="ai-panel"></div>
    <div class="survival-panel" id="survival-panel"></div>
    <div class="info-section personal"><h3>인물 정보</h3><div><span>기존 집</span><b>${c.home}</b></div><div><span>성격</span><b>${c.character?'생성 설정 참조':c.personality}</b></div><div><span>보유금</span><b>${c.money.toLocaleString()}원</b></div><div><span>소지품</span><b>${c.inventory.join(', ')}</b></div></div>
    ${c.character?`<div class="info-section character-settings"><h3>적용된 생성 설정</h3><p>${STATS.map(s=>`${s.name} <b>${c.character!.stats[s.id]}</b>`).join(' · ')}</p><p>${personalitySummary(c.character)}</p><p>특성: ${traitSummary(c.character)}</p><p class="subtle">지구력은 최대 활동 여력, 지각은 관찰 거리, 위험 감수·비축 성향은 AI 선택에 적용됩니다. 식량 소비·수면·물품 취급 특성도 적용됩니다. 다른 성격 축·전투·학습 효과는 후속 단계입니다.</p></div>`:''}`:
    '<div class="empty"><span>⌖</span><h2>누구를 관찰할까요?</h2><p>지도 위 인간을 클릭하거나<br>인간 목록에서 선택하세요.</p></div>';
    if(content!==this.lastInspector){document.querySelector('#inspector')!.innerHTML=content;this.lastInspector=content;const follow=document.querySelector<HTMLButtonElement>('#follow');if(follow)follow.onclick=()=>{this.scene.follow=!this.scene.follow;if(this.scene.follow&&c)this.scene.focus(c.id);this.update();};}
    if(c){document.querySelector('#citizen-position')!.textContent=`${c.x.toFixed(1)}, ${c.y.toFixed(1)}`;for(const key of ['hunger','thirst','fatigue','fear'] as const)document.querySelector(`[data-need="${key}"]`)!.textContent=c[key].toFixed(1);document.querySelector('#needs-warning')!.textContent=this.clock.paused?'일시정지 — 상태 변화와 행동 진행이 멈췄습니다.':survivalWarning(c);const markup=conditionMarkup(c,this.clock.paused);for(const [id,html] of [['condition-summary',markup.summary],['condition-alerts',markup.alerts],['condition-details',markup.details]]){const host=document.getElementById(id)!;if(host.innerHTML!==html)host.innerHTML=html;}this.survival.update();this.ai.update();}
    const e=this.world.events[0],event=e?`${timeLabel(e.time)}  ${e.text}`:'';
    if(event!==this.lastEvent){document.querySelector('#latest-event')!.textContent=event;this.lastEvent=event;}
  }
}
