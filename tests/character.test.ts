import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft, STATS, PERSONALITIES, TRAITS, statPoints, traitPoints, validateCharacter, changeCharacter, traitSummary, personalitySummary, type CharacterAvailability } from '../src/data/character.ts';
import { GameSession } from '../src/simulation/session.ts';
import { stepWorld } from '../src/simulation/world.ts';
import { SimulationClock } from '../src/simulation/clock.ts';
import { escapeHTML } from '../src/ui/html.ts';

// 비용 규칙만 검증하는 가상 가용성. 실제 제공 가능 항목을 활성화하지 않는다.
const all:CharacterAvailability={stats:new Set(STATS.map(s=>s.id)),personality:new Set(PERSONALITIES.map(p=>p.id)),traits:new Set(TRAITS.map(t=>t.id))};
test('스탯 단계 비용·반환 상한·되돌리기와 범위',()=>{
  const d=defaultDraft();assert.equal(statPoints(d.stats),8);
  d.stats.strength=6;assert.equal(statPoints(d.stats),7);
  d.stats.strength=7;assert.equal(statPoints(d.stats),5);
  d.stats.strength=8;assert.equal(statPoints(d.stats),2);
  d.stats.agility=3;d.stats.endurance=3;assert.equal(statPoints(d.stats),4);
  d.stats.strength=5;assert.equal(statPoints(d.stats),10);
  d.stats.strength=8;d.stats.perception=8;assert.ok(validateCharacter(d,all).some(e=>e.includes('포인트')));
  d.stats.strength=8.5;assert.ok(validateCharacter(d,all).some(e=>e.includes('정수')));
});
test('특성 비용·단점 보상 상한·충돌·선택 수·중복',()=>{
  assert.equal(traitPoints(['quiet']),0);
  assert.equal(traitPoints(['bigEater','lightSleeper','organized']),0);
  assert.equal(traitPoints(['loud','heavySleeper']),8);
  const d=defaultDraft();d.traits=['quiet','loud'];assert.ok(validateCharacter(d,all).some(e=>e.includes('반대')));
  d.traits=['quiet','quiet'];assert.ok(validateCharacter(d,all).some(e=>e.includes('중복')));
  d.traits=['loud','clumsy','heavySleeper'];assert.ok(validateCharacter(d,all).some(e=>e.includes('단점은')));
  d.traits=['quiet','organized','smallEater','darkness'];assert.ok(validateCharacter(d,all).some(e=>e.includes('장점은')));
  d.traits=['darkness','claustrophobia'];assert.deepEqual(validateCharacter(d,all),[]);
});
test('모든 생성 항목의 유효한 선택과 세계 진입이 허용됨',()=>{
  for(const s of STATS){const d=defaultDraft();d.stats[s.id]=6;assert.deepEqual(validateCharacter(d),[]);}
  for(const p of PERSONALITIES){const d=defaultDraft();d.personality[p.id]='high';assert.deepEqual(validateCharacter(d),[]);}
  for(const t of TRAITS){const d=defaultDraft();d.traits=[t.id];assert.deepEqual(validateCharacter(d),[]);}
  assert.deepEqual(validateCharacter(defaultDraft()),[]);
});
test('이름 유효성·HTML 보호',()=>{
  for(const name of ['   ','가'.repeat(17),'<img src=x>','abc\n']){const d=defaultDraft();d.name=name;assert.ok(validateCharacter(d).some(e=>e.startsWith('이름')));}
  assert.equal(escapeHTML('A&B"<>'), 'A&amp;B&quot;&lt;&gt;');
});
test('유효한 캐릭터만 새 회차로 전달, 이름·설정 복사·메인 식별',()=>{
  const session=new GameSession(),d=defaultDraft();d.name='  김생존  ';
  const w=session.start(d);assert.equal(w.mainCharacterId,0);assert.equal(w.citizens[0].name,'김생존');assert.equal(w.citizens.length,12);
  assert.deepEqual(w.citizens[0].character?.stats,d.stats);d.name='변경';d.stats.strength=8;
  assert.equal(w.citizens[0].name,'김생존');assert.equal(w.citizens[0].character?.stats.strength,5);
  assert.throws(()=>session.start());
  const blocked=new GameSession();d.stats.agility=8;assert.throws(()=>blocked.start(d));assert.equal(blocked.world,null);assert.equal(blocked.status,'creation');
});
test('버튼 변경은 이름 오류와 독립, 비용·충돌 실패는 이전 상태를 보존',()=>{
  let d=defaultDraft();d.name='';const original=structuredClone(d);
  let result=changeCharacter(d,{kind:'stat',id:'strength',delta:1});assert.deepEqual(d,original);assert.deepEqual(result.errors,[]);d=result.draft;assert.equal(d.stats.strength,6);assert.equal(statPoints(d.stats),7);
  result=changeCharacter(d,{kind:'personality',id:'risk',level:'high'});d=result.draft;assert.equal(d.personality.risk,'high');
  result=changeCharacter(d,{kind:'trait',id:'quiet'});d=result.draft;assert.equal(traitPoints(d.traits),0);
  result=changeCharacter(d,{kind:'trait',id:'loud'});assert.ok(result.errors.some(e=>e.includes('반대')));assert.deepEqual(result.draft,d);
  result=changeCharacter(d,{kind:'trait',id:'organized'});assert.ok(result.errors.some(e=>e.includes('부족')));assert.deepEqual(result.draft,d);
  result=changeCharacter(d,{kind:'trait',id:'quiet'});assert.deepEqual(result.draft.traits,[]);assert.equal(traitPoints(result.draft.traits),4);
});
test('선택한 스탯·성격·특성은 세계와 표시 요약에서 그대로 유지됨',()=>{
  const d=defaultDraft();d.stats.strength=7;d.stats.agility=7;d.personality.risk='high';d.personality.aggression='low';d.traits=['smallEater','organized','slowHealing'];
  const session=new GameSession(),world=session.start(d),c=world.citizens[0];assert.deepEqual(c.character,d);
  assert.match(c.personality,/위험 감수 높음/);assert.match(personalitySummary(c.character!),/공격 성향 낮음/);assert.equal(traitSummary(c.character!),'소식가 · 정리 습관 · 느린 회복');
  stepWorld(world,50);assert.deepEqual(c.character,d);
});
test('메인 사망만 회차 종료, 이전 세계 폐기·시간 중단·다른 인물로 연속 불가',()=>{
  const session=new GameSession(),w=session.start(),oldRun=session.runId;
  stepWorld(w,60);session.confirmDeath(4);assert.equal(session.status,'active');
  session.confirmDeath(0);assert.equal(session.status,'ended');assert.equal(session.world,null);assert.equal(w.active,false);
  assert.equal(w.citizens.length,0);assert.equal(w.events.length,0);assert.equal(w.buildings.length,0);
  const time=w.seconds;stepWorld(w,100);new SimulationClock().advance(10,w);assert.equal(w.seconds,time);
  const next=session.start();assert.notEqual(session.runId,oldRun);assert.equal(next.seconds,0);assert.equal(next.tick,0);assert.equal(next.citizens[0].visits,0);
});
test('새 회차 초기화는 세계를 공유하지 않고 생성 화면은 진행하지 않음',()=>{
  const session=new GameSession();assert.equal(session.world,null);
  const old=session.start();old.citizens[1].money=0;stepWorld(old,50);session.end('새 회차');
  const next=session.start();assert.notEqual(next,old);assert.equal(next.citizens[1].money,17300);assert.equal(next.events.length,2);
});
