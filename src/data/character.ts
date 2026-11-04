export const STATS = [
  {id:'strength',name:'근력',effect:'근접 피해·밀치기 위력',requires:'전투·물품 취급'},
  {id:'agility',name:'민첩',effect:'방향 전환·공격 회복·회피',requires:'전투·회피'},
  {id:'endurance',name:'지구력',effect:'최대 행동 스태미나',requires:'스태미나 소모·회복'},
  {id:'perception',name:'지각',effect:'조건을 충족한 위협·단서의 감지 거리',requires:'개인별 인지'},
  {id:'composure',name:'침착성',effect:'공포의 수행 불이익 완화',requires:'공포·수행 불이익'},
  {id:'learning',name:'학습력',effect:'관찰 학습·숙련 경험 획득',requires:'학습·숙련'}
] as const;
export const PERSONALITIES = [
  {id:'risk',name:'위험 감수',effect:'안전한 경로 선호 ↔ 필요한 물자를 위해 위험 감수',requires:'위험 평가·생존 AI'},
  {id:'aggression',name:'공격 성향',effect:'우회·도주 선호 ↔ 상대할 만한 좀비 제거',requires:'전투·생존 AI'},
  {id:'altruism',name:'이타성',effect:'자신의 생존 우선 ↔ 타인 돕기 선호',requires:'도움·공유'},
  {id:'rules',name:'규칙 준수',effect:'소유물 획득에 관대 ↔ 타인 소유물 존중',requires:'소유권 판단'},
  {id:'stockpiling',name:'비축 성향',effect:'필요한 만큼 확보 ↔ 미래 부족에 대비',requires:'물자 획득·생존 AI'}
] as const;
export const TRAITS = [
  {id:'quiet',name:'조용한 발걸음',cost:4,opposite:'loud',effect:'걷기 소음 ×0.75',requires:'이동 소음'},
  {id:'loud',name:'요란한 발걸음',cost:-3,opposite:'quiet',effect:'걷기·달리기 소음 ×1.20',requires:'이동 소음'},
  {id:'organized',name:'정리 습관',cost:2,opposite:'clumsy',effect:'물품 획득·보관 이전 시간 ×0.80',requires:'물품 취급'},
  {id:'clumsy',name:'서투른 손놀림',cost:-2,opposite:'organized',effect:'물품 취급 시간 ×1.25',requires:'물품 취급'},
  {id:'smallEater',name:'소식가',cost:3,opposite:'bigEater',effect:'허기 증가 ×0.85',requires:'허기 변화'},
  {id:'bigEater',name:'대식가',cost:-2,opposite:'smallEater',effect:'허기 증가 ×1.20',requires:'허기 변화'},
  {id:'lightSleeper',name:'적은 수면',cost:4,opposite:'heavySleeper',effect:'수면 피로 회복 ×1.25',requires:'수면·피로 회복'},
  {id:'heavySleeper',name:'많은 수면',cost:-3,opposite:'lightSleeper',effect:'수면 피로 회복 ×0.80',requires:'수면·피로 회복'},
  {id:'fastHealing',name:'빠른 회복',cost:3,opposite:'slowHealing',effect:'일반 부상 회복 ×1.25',requires:'일반 부상 회복'},
  {id:'slowHealing',name:'느린 회복',cost:-2,opposite:'fastHealing',effect:'일반 부상 회복 ×0.80',requires:'일반 부상 회복'},
  {id:'darkness',name:'어둠에 익숙함',cost:2,opposite:'',effect:'어둠 공포 증가 ×0.60',requires:'어둠·공포'},
  {id:'claustrophobia',name:'폐쇄 공간 공포',cost:-2,opposite:'',effect:'좁은 실내에서 10분당 공포 +5, 이 원인만으로 40까지',requires:'좁은 실내·공포'}
] as const;
export type StatId = typeof STATS[number]['id'];
export type PersonalityId = typeof PERSONALITIES[number]['id'];
export type TraitId = typeof TRAITS[number]['id'];
export type Level = 'low'|'normal'|'high';
export interface CharacterDraft { name:string; stats:Record<StatId,number>; personality:Record<PersonalityId,Level>; traits:TraitId[] }
export interface CharacterAvailability { stats:ReadonlySet<StatId>; personality:ReadonlySet<PersonalityId>; traits:ReadonlySet<TraitId> }
// 생성 설정의 선택 가능 여부다. 세계의 생존 효과 구현 여부와 구분한다.
export const CREATION_AVAILABILITY:CharacterAvailability = {
  stats:new Set(STATS.map(s=>s.id)),personality:new Set(PERSONALITIES.map(p=>p.id)),traits:new Set(TRAITS.map(t=>t.id))
};
export const LEVEL_LABELS:Record<Level,string>={low:'낮음',normal:'보통',high:'높음'};
export function personalitySummary(d:CharacterDraft){return PERSONALITIES.map(p=>`${p.name} ${LEVEL_LABELS[d.personality[p.id]]}`).join(' · ');}
export function traitSummary(d:CharacterDraft){return d.traits.map(id=>TRAITS.find(t=>t.id===id)!.name).join(' · ')||'없음';}
export function traitEffectStatus(id:TraitId){
  return ['organized','clumsy','smallEater','bigEater','lightSleeper','heavySleeper'].includes(id)?'생존 행동에 적용됨':`효과는 ${TRAITS.find(t=>t.id===id)!.requires} 연결 후 적용`;
}
export function defaultDraft():CharacterDraft {return {name:'이서윤',stats:Object.fromEntries(STATS.map(s=>[s.id,5])) as CharacterDraft['stats'],personality:Object.fromEntries(PERSONALITIES.map(p=>[p.id,'normal'])) as CharacterDraft['personality'],traits:[]};}
export function statPoints(stats:CharacterDraft['stats']) {
  const values=STATS.map(s=>stats[s.id]);
  return 8+Math.min(2,values.reduce((n,v)=>n+Math.max(0,5-v),0))-values.reduce((n,v)=>n+([0,0,0,0,0,0,1,3,6][v]??Infinity),0);
}
export function traitPoints(ids:readonly string[]) {
  const selected=TRAITS.filter(t=>ids.includes(t.id));
  return 4+Math.min(4,selected.reduce((n,t)=>n+Math.max(0,-t.cost),0))-selected.reduce((n,t)=>n+Math.max(0,t.cost),0);
}
export function validateCharacter(d:CharacterDraft,a:CharacterAvailability=CREATION_AVAILABILITY):string[] {
  const errors:string[]=[];
  if(typeof d.name!=='string'||!d.name.trim()||[...d.name.trim()].length>16||/[<>\u0000-\u001f\u007f]/.test(d.name))errors.push('이름은 기호 < > 없이 1~16자로 입력해 주세요.');
  return [...errors,...validateBuild(d,a)];
}
export function validateBuild(d:CharacterDraft,a:CharacterAvailability=CREATION_AVAILABILITY):string[] {
  const errors:string[]=[];
  if(!d.stats||Object.keys(d.stats).length!==STATS.length||STATS.some(s=>!Number.isInteger(d.stats[s.id])||d.stats[s.id]<3||d.stats[s.id]>8))errors.push('스탯은 여섯 항목 모두 3~8의 정수여야 합니다.');
  else {if(statPoints(d.stats)<0)errors.push('스탯 포인트가 부족합니다.');for(const s of STATS)if(!a.stats.has(s.id)&&d.stats[s.id]!==5)errors.push(`${s.name}: 효과가 연결되기 전에는 기본값 5로 유지합니다.`);}
  if(!d.personality||Object.keys(d.personality).length!==PERSONALITIES.length||PERSONALITIES.some(p=>!['low','normal','high'].includes(d.personality[p.id])))errors.push('성격을 낮음·보통·높음 중에서 설정해 주세요.');
  else for(const p of PERSONALITIES)if(!a.personality.has(p.id)&&d.personality[p.id]!=='normal')errors.push(`${p.name}: 관련 행동이 아직 연결되지 않았습니다.`);
  if(!Array.isArray(d.traits)){errors.push('특성 선택 형식이 잘못되었습니다.');return errors;}
  if(new Set(d.traits).size!==d.traits.length)errors.push('같은 특성을 중복 선택할 수 없습니다.');
  for(const id of d.traits){const t=TRAITS.find(t=>t.id===id);if(!t){errors.push('알 수 없는 특성이 있습니다.');continue;}
    if(!a.traits.has(id))errors.push(`${t.name}: ${t.requires} 구현 후 선택할 수 있습니다.`);
    if(t.opposite&&d.traits.some(id=>id===t.opposite))errors.push(`${t.name}: 반대 특성과 함께 선택할 수 없습니다.`);}
  const selected=TRAITS.filter(t=>d.traits.includes(t.id));
  if(selected.filter(t=>t.cost>0).length>3)errors.push('장점은 최대 3개입니다.');
  if(selected.filter(t=>t.cost<0).length>2)errors.push('단점은 최대 2개입니다.');
  if(traitPoints(d.traits)<0)errors.push('특성 포인트가 부족합니다.');
  return errors;
}
export type CharacterChange = {kind:'stat';id:StatId;delta:1|-1}|{kind:'personality';id:PersonalityId;level:Level}|{kind:'trait';id:TraitId};
// 클릭 전 상태는 보존하고, 유효한 변경만 한 번에 반영한다. 이름 입력 오류와 배분 편집은 독립적이다.
export function changeCharacter(d:CharacterDraft,change:CharacterChange):{draft:CharacterDraft;errors:string[]} {
  const next=structuredClone(d);
  if(change.kind==='stat')next.stats[change.id]+=change.delta;
  else if(change.kind==='personality')next.personality[change.id]=change.level;
  else next.traits=next.traits.includes(change.id)?next.traits.filter(id=>id!==change.id):[...next.traits,change.id];
  const errors=validateBuild(next);
  return {draft:errors.length?d:next,errors};
}
