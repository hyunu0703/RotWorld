import { ITEMS, SURVIVAL, stockCount, type ItemId } from '../data/survival.ts';
import { issueCommand, needRates, handlingMultiplier, type SurvivalCommand } from '../simulation/survival.ts';
import type { World, Citizen } from '../simulation/world.ts';
import { escapeHTML as esc } from './html.ts';
export class SurvivalPanel {
  private place=0;private actor:number|null=null;private message='';
  constructor(private world:World,private selected:()=>number|null){
    const inspector=document.querySelector<HTMLElement>('#inspector')!;
    inspector.addEventListener('change',e=>{if((e.target as HTMLElement).id==='supply-place'){this.place=Number((e.target as HTMLSelectElement).value);this.message='';this.update();}});
    inspector.addEventListener('click',e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-survival]');if(!button)return;
      const id=this.selected();if(id===null)return;
      const kind=button.dataset.survival!;const item=button.dataset.item as ItemId;
      const command:SurvivalCommand=kind==='consume'?{kind,item}:kind==='take'||kind==='deposit'?{kind,buildingId:this.place,item}:kind==='sleep'||kind==='move'?{kind,buildingId:this.place}:{kind:kind as 'rest'|'stop'|'tour'};
      const error=issueCommand(world,id,command);this.message=error||'행동을 지정했습니다. 시간 진행 중에 실행됩니다.';this.update();
    });
  }
  choosePlace(id:number){this.place=id;this.message='';this.actor=this.selected();this.update(true);}
  update(force=false){
    const id=this.selected(),c=id===null?undefined:this.world.citizens.find(c=>c.id===id),host=document.querySelector<HTMLElement>('#survival-panel');if(!c||!host)return;
    if(id!==this.actor){this.actor=id;this.place=c.destination;this.message='';force=true;}
    if(force||host.dataset.actor!==String(id)){
      host.dataset.actor=String(id);host.innerHTML=`<h3>생존 행동 <span class="subtle">선택한 인간에게 지시</span></h3><div class="survival-readout"></div>
      <div class="survival-buttons"><button data-survival="rest">앉아서 휴식</button><button data-survival="stop">행동 중단·기상</button><button data-survival="tour">입구 순회 재개</button></div>
      <h3 class="supply-heading">소지 물자 <span id="capacity"></span></h3><div class="supply-list">${ITEMS.map(i=>`<div><span>${i.name} <b data-inventory="${i.id}"></b></span><button data-survival="consume" data-item="${i.id}">${i.id==='water'?'물 마시기':i.name==='식사'?'식사하기':'간식 먹기'}</button></div>`).join('')}</div>
      <h3 class="supply-heading">물자·수면 장소</h3><label for="supply-place" class="subtle">장소 선택 (또는 지도 건물 클릭)</label><select id="supply-place">${this.world.buildings.map(b=>`<option value="${b.id}" ${b.id===this.place?'selected':''}>${esc(b.name)}${b.sleepSpot?' · 수면 거점':''}</option>`).join('')}</select>
      <p id="sleep-place-info" class="subtle"></p><div class="supply-list">${ITEMS.map(i=>`<div><span>${i.name} <b data-stock="${i.id}"></b></span><div><button data-survival="take" data-item="${i.id}">1개 획득</button><button data-survival="deposit" data-item="${i.id}">1개 보관</button></div></div>`).join('')}</div>
      <div class="survival-buttons"><button data-survival="move">이 장소로 이동</button><button data-survival="sleep">거점에서 수면</button></div><p id="survival-feedback" role="status"></p><p class="subtle">획득·보관·수면은 입구에 도착한 뒤 실행합니다. 물자는 자동 보충되지 않습니다. 정지 중에는 행동 시간이 흐르지 않습니다.</p>`;
    }
    const b=this.world.buildings.find(b=>b.id===this.place)!;
    for(const item of ITEMS){host.querySelector(`[data-inventory="${item.id}"]`)!.textContent=`${c.supplies[item.id]}회분`;host.querySelector(`[data-stock="${item.id}"]`)!.textContent=`잔여 ${b.stock[item.id]}회분`;}
    host.querySelector('#capacity')!.textContent=`${stockCount(c.supplies)} / ${SURVIVAL.capacity}회분`;
    host.querySelector('#sleep-place-info')!.textContent=b.sleepSpot?'시제품 지정 수면 거점 · 위험 감지 AI 미연결':'수면 거점이 지정되지 않은 장소입니다.';
    host.querySelector('#survival-feedback')!.textContent=this.message;
    host.querySelector('.survival-readout')!.textContent=survivalDescription(c);
  }
}
export function survivalDescription(c:Citizen){
  const r=needRates(c),a=c.activity;
  const progress=a.kind==='consume'||a.kind==='handling'?` · 완료까지 게임 ${Math.ceil(a.remaining)}초`:'';
  return `시간당 허기 +${r.hunger.toFixed(1)} · 갈증 +${r.thirst} · 피로 ${r.fatigue>0?'+':''}${r.fatigue}${progress}`;
}
export function survivalWarning(c:Citizen){
  const notes:string[]=[];
  if(c.hunger>=100)notes.push('굶주림 경고 — 음식이 필요합니다. 지속 피해는 후속 단계입니다.');
  else if(c.hunger>=60)notes.push('식량 확보가 필요합니다.');
  if(c.thirst>=100)notes.push('탈수 경고 — 물이 필요합니다. 지속 피해는 후속 단계입니다.');
  else if(c.thirst>=60)notes.push('수분 섭취가 필요합니다.');
  if(c.fatigue>=60)notes.push('피로가 높습니다. 수면 거점을 확보하세요.');
  const handling=handlingMultiplier(c);if(handling!==1)notes.push(`물품 취급 시간 ×${handling.toFixed(2)} (상태·특성 반영)`);
  return notes.join(' ')||'현재 생존 상태를 유지하며 물자를 확보할 수 있습니다.';
}
