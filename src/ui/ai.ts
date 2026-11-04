import { threatMarkup } from './threat.ts';
import { setAutonomy } from '../ai/decision.ts';
import { ITEMS } from '../data/survival.ts';
import { timeLabel } from '../simulation/clock.ts';
import type { World } from '../simulation/world.ts';
import { escapeHTML as esc } from './html.ts';

export class AIPanel {
  constructor(private world:World,private selected:()=>number|null){
    document.querySelector('#inspector')!.addEventListener('click',e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-autonomy]');
      const id=this.selected();if(!button||id===null)return;
      setAutonomy(world,id,!world.citizens[id].brain.enabled);this.update();
    });
  }
  update(){
    const id=this.selected(),c=id===null?undefined:this.world.citizens[id],host=document.querySelector<HTMLElement>('#ai-panel');
    if(!c||!host)return;
    if(host.dataset.actor!==String(id)){
      host.dataset.actor=String(id);
      host.innerHTML='<h3>개인 판단과 기억</h3><button data-autonomy aria-pressed="false"></button><p class="subtle">직접 행동을 지시하면 자율 생존이 꺼집니다. 기억은 유지됩니다.</p><div data-ai-readout></div><details><summary>이 인간이 아는 정보·판단 기록</summary><div data-ai-memory></div></details>';
    }
    const brain=c.brain,button=host.querySelector<HTMLButtonElement>('[data-autonomy]')!;
    button.textContent=brain.enabled?'자율 생존 끄기':'자율 생존 켜기';button.setAttribute('aria-pressed',String(brain.enabled));
    const readout=`<p><b>${brain.enabled?'자율 생존':'직접 지시'}</b> · 인지한 위험 ${brain.risk.toFixed(0)} / 100</p><p class="subtle">${brain.decision?`${brain.decision.source==='ai'?'AI 판단':'플레이어 지정'} · ${esc(brain.decision.action)}`:'아직 행동 판단 전입니다.'}</p>`;
    const target=host.querySelector<HTMLElement>('[data-ai-readout]')!;if(target.innerHTML!==readout)target.innerHTML=readout;
    const memory=Object.values(brain.places).map(p=>`<li><b>${esc(p.name)}</b> · ${p.stock?ITEMS.map(i=>`${i.name} ${p.stock![i.id]}`).join(' / '):'재고 미확인'} · ${p.sleepSpot===null?'수면 조건 미확인':p.sleepSpot?'수면 거점 확인':'수면 거점 없음'}<br><small>${p.inspectedAt===null?'입구 관찰만 함':`마지막 재고 확인 ${timeLabel(p.inspectedAt)}`}</small></li>`).join('');
    const dangers=Object.values(brain.dangers).map(d=>`<li>${esc(d.label)} · 마지막 위치 ${d.x.toFixed(1)}, ${d.y.toFixed(1)} · 관찰 ${timeLabel(d.seenAt)}</li>`).join('');
    const alternatives=brain.decision?.alternatives.map(a=>`<li>${esc(a.action)} · 점수 ${a.score} · 거리 ${a.distance} · 위험 ${a.risk}</li>`).join('')??'';
    const history=brain.history.map(d=>`<li><b>${timeLabel(d.time)} · ${d.source==='ai'?'AI':'플레이어'} · ${esc(d.action)}</b><p>${esc(d.reason)}</p></li>`).join('');
    const content=`${threatMarkup(this.world,c)}<p class="subtle">개인의 마지막 확인값입니다. 화면의 실제 재고와 다를 수 있습니다. 시각으로 입구를 발견하고 입구에서 재고를 조사합니다. 좀비 관찰은 0.5초마다 수행하며 잠든 동안은 중단합니다.</p><ul>${memory||'<li>관찰한 장소 없음</li>'}</ul><h4>위험 기억</h4><ul>${dangers||'<li>인지한 위험 없음 · 안전 보장을 뜻하지 않습니다.</li>'}</ul><h4>최근 선택 후보</h4><ul>${alternatives||'<li>비교 후보 없음</li>'}</ul><h4>최근 판단 8건</h4><ol>${history||'<li>기록 없음</li>'}</ol>`;
    const memoryHost=host.querySelector<HTMLElement>('[data-ai-memory]')!;if(memoryHost.innerHTML!==content)memoryHost.innerHTML=content;
  }
}
