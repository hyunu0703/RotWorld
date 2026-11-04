import type { Citizen } from '../simulation/world.ts';
import { bodyMode, conditionText, recoveryPenalty } from '../simulation/condition.ts';
import { handlingEffects } from '../simulation/survival.ts';
import { escapeHTML } from './html.ts';

export function conditionDetails(c:Citizen,paused=false):string[]{
  const notes:string[]=[];
  if(paused)notes.push('일시정지 — 상태 변화와 행동 진행이 멈췄습니다.');
  notes.push('신체 상태는 현재 손상 수준입니다. 부상·감염의 유무나 안전을 보장하지 않습니다. 피해·치료·자연 회복은 아직 연결하지 않았습니다.');
  const mode=bodyMode(c);
  if(paused)notes.push('아래 행동 원인은 재개 시 적용됩니다. 현재는 소모·회복하지 않습니다.');
  notes.push({walk:'걷기로 활동 여력을 사용합니다.',handling:'물품 취급으로 활동 여력을 사용합니다.',idle:'대기·섭취 중 활동 여력을 회복합니다.',rest:'앉아서 쉬며 활동 여력을 회복합니다. 피로는 줄어들지 않습니다.',sleep:'수면으로 활동 여력과 피로를 회복합니다.'}[mode]);
  if(c.vitals.stamina===0)notes.push('힘이 바닥났습니다. 휴식이 필요합니다. 기본 이동·섭취·물품 취급은 계속할 수 있습니다.');
  else if(c.vitals.stamina>=c.vitals.maxStamina)notes.push('현재 감당할 수 있는 활동 여력이 차 있습니다.');
  const endurance=c.character?.stats.endurance??5;
  if(endurance!==5)notes.push(endurance>5?'지구력으로 감당할 수 있는 활동 여력이 늘었습니다.':'지구력으로 감당할 수 있는 활동 여력이 줄었습니다.');
  if(c.fatigue>=60)notes.push('높은 피로 때문에 감당할 수 있는 최대 활동 여력이 줄었습니다. 피로가 낮아져도 현재의 힘이 저절로 채워지지는 않습니다.');
  const penalty=recoveryPenalty(c);
  if(penalty.strongest>0)notes.push(penalty.thirst>=penalty.hunger?'갈증 때문에 활동 여력 회복이 더딥니다. 허기·갈증은 더 강한 회복 저하만 적용합니다.':'허기 때문에 활동 여력 회복이 더딥니다. 허기·갈증은 더 강한 회복 저하만 적용합니다.');
  const e=c.activity.kind==='handling'?c.activity.effects:handlingEffects(c),percent=(value:number)=>`${Number((value*100).toFixed(2))}%`;
  notes.push(c.activity.kind==='handling'?'현재 물품 취급에는 작업 시작 당시의 아래 보정을 유지합니다.':'다음 물품 획득·보관을 시작할 때의 시간 보정입니다.');
  notes.push(`물품 취급: 갈증 +${percent(e.thirst)} · 피로 +${percent(e.fatigue)} · 공포 +${percent(e.fear)}${e.fear>0?' (침착성 보정 후)':''}.`);
  notes.push(`상태 증가 합계 +${percent(e.total)} → 상한 적용 +${percent(e.capped)}. ${e.trait===.8?'정리 습관':e.trait===1.25?'서투른 손놀림':'취급 특성 없음'} ×${e.trait}. 최종 취급 시간 ×${Number(e.multiplier.toFixed(4))}.`);
  return notes;
}
export function conditionMarkup(c:Citizen,paused=false){
  const text=conditionText(c,paused);
  return {summary:`<p><b>신체:</b> ${escapeHTML(text.health)}</p><p><b>활동 여력:</b> ${escapeHTML(text.stamina)}</p>`,
    details:`<ul>${conditionDetails(c,paused).map(note=>`<li>${escapeHTML(note)}</li>`).join('')}</ul>`,
    alerts:c.vitals.recentAlerts.length?`<b>최근 중요한 상태 변화</b><ul>${c.vitals.recentAlerts.map(note=>`<li>${escapeHTML(note)}</li>`).join('')}</ul>`:''};
}
export function renderCondition(c:Citizen,paused=false){const markup=conditionMarkup(c,paused);return markup.summary+markup.alerts+markup.details;}
