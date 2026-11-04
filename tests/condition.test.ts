import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepWorld} from '../src/simulation/world.ts';
import {defaultDraft} from '../src/data/character.ts';
import {advanceCondition,conditionText,createVitals,staminaMaximum,staminaRate,updateCondition} from '../src/simulation/condition.ts';
import {changeNeeds,handlingEffects,issueCommand} from '../src/simulation/survival.ts';
import {conditionDetails,renderCondition} from '../src/ui/condition.ts';
import {SimulationClock} from '../src/simulation/clock.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function setup(){const w=createWorld(defaultDraft());for(const c of w.citizens)c.brain.enabled=false;return {w,c:w.citizens[0]};}

test('신체 경계·회복 여유·큰 변화·사망 확정은 숫자 표시와 독립',()=>{
  const {c}=setup();
  for(const [health,label] of [[100,'양호'],[80,'경미한 손상'],[60,'상당한 손상'],[30,'위중'],[.01,'위중']] as const){c.vitals.health=health;updateCondition(c,true);assert.match(conditionText(c).health,new RegExp(label));}
  c.vitals.health=31;updateCondition(c);assert.equal(c.vitals.healthStage,3);
  c.vitals.health=33;updateCondition(c);assert.equal(c.vitals.healthStage,2);
  c.vitals.health=62.9;updateCondition(c);assert.equal(c.vitals.healthStage,2);
  c.vitals.health=63;updateCondition(c);assert.equal(c.vitals.healthStage,1);
  c.vitals.health=82.9;updateCondition(c);assert.equal(c.vitals.healthStage,1);
  c.vitals.health=83;updateCondition(c);assert.equal(c.vitals.healthStage,0);
  c.vitals.health=10;assert.match(updateCondition(c).join(),/위중/);assert.deepEqual(updateCondition(c),[]);
  c.vitals.health=100;updateCondition(c);assert.equal(c.vitals.healthStage,0);
  c.vitals.health=0;assert.throws(()=>updateCondition(c),/사망 확정/);
  c.vitals.dead=true;updateCondition(c);assert.equal(conditionText(c).health,'사망');
  c.vitals.health=100;updateCondition(c);assert.equal(conditionText(c).health,'사망');
});
test('활동 여력 경계·소수·큰 회복·바닥 이탈·직렬화 후 문구 유지',()=>{
  const {c}=setup();
  for(const [value,index] of [[100,0],[75,1],[50,2],[20,3],[0,4]] as const){c.vitals.stamina=value;updateCondition(c,true);assert.equal(c.vitals.staminaStage,index);}
  c.vitals.stamina=.01;updateCondition(c);assert.equal(c.vitals.staminaStage,3);
  c.vitals.stamina=22.99;updateCondition(c);assert.equal(c.vitals.staminaStage,3);
  c.vitals.stamina=23;updateCondition(c);assert.equal(c.vitals.staminaStage,2);
  c.vitals.stamina=52.99;updateCondition(c);assert.equal(c.vitals.staminaStage,2);
  const copy=JSON.parse(JSON.stringify(c));updateCondition(copy);assert.equal(copy.vitals.staminaStage,2);
  c.vitals.stamina=53;updateCondition(c);assert.equal(c.vitals.staminaStage,1);
  c.vitals.stamina=77.99;updateCondition(c);assert.equal(c.vitals.staminaStage,1);
  c.vitals.stamina=78;updateCondition(c);assert.equal(c.vitals.staminaStage,0);
  c.vitals.stamina=0;assert.match(updateCondition(c).join(),/힘이 바닥/);assert.deepEqual(updateCondition(c),[]);
  c.vitals.stamina=99;updateCondition(c);assert.equal(c.vitals.staminaStage,0);
  c.vitals.maxStamina=0;assert.throws(()=>updateCondition(c),/내부 수치 오류/);
});
test('지구력·피로의 최대치와 최대치 복구가 현재량을 충전하지 않음',()=>{
  const {c}=setup();c.character!.stats.endurance=8;c.vitals=createVitals(8);close(c.vitals.stamina,118);
  c.fatigue=60;advanceCondition(c,0,'idle');close(c.vitals.maxStamina,100.3);
  c.fatigue=80;advanceCondition(c,0,'idle');close(c.vitals.stamina,82.6);
  c.fatigue=10;advanceCondition(c,0,'idle');close(c.vitals.maxStamina,118);close(c.vitals.stamina,82.6);
  assert.equal(staminaMaximum(c),118);
});
test('합의한 활동별 스태미나 변화와 허기·갈증의 강한 회복 저하만 적용',()=>{
  const {c}=setup();c.vitals.stamina=50;
  for(const [mode,value] of [['walk',-1],['handling',-2],['idle',6],['rest',12],['sleep',18]] as const)assert.equal(staminaRate(c,mode),value);
  c.hunger=80;c.thirst=80;close(staminaRate(c,'rest'),8.4);close(staminaRate(c,'walk'),-1);
  advanceCondition(c,60,'rest');close(c.vitals.stamina,58.4);
  c.hunger=100;c.thirst=100;advanceCondition(c,3600,'walk');close(c.vitals.stamina,0);
  advanceCondition(c,10000,'rest');close(c.vitals.stamina,c.vitals.maxStamina);
});
test('욕구·피로 경계를 통과한 긴 계산과 시간 분할의 일치',()=>{
  for(const mode of ['rest','sleep','awake'] as const){
    const a=setup().c,b=setup().c;a.hunger=b.hunger=59;a.thirst=b.thirst=79;a.fatigue=b.fatigue=80;a.vitals.stamina=b.vitals.stamina=5;
    changeNeeds(a,9000,mode);for(let i=0;i<9000;i++)changeNeeds(b,1,mode);
    close(a.vitals.stamina,b.vitals.stamina);close(a.vitals.maxStamina,b.vitals.maxStamina);close(a.fatigue,b.fatigue);assert.equal(a.vitals.staminaStage,b.vitals.staminaStage);
  }
});
test('취급 완료·중단 후 남은 시간은 실제 다음 행동에만 적용',()=>{
  const {w,c}=setup();c.vitals.stamina=50;
  issueCommand(w,0,{kind:'take',buildingId:0,item:'snack'});stepWorld(w,60);close(c.vitals.stamina,50-2*10/60+6*50/60);
  issueCommand(w,0,{kind:'take',buildingId:0,item:'snack'});stepWorld(w,5);const before=c.vitals.stamina;
  issueCommand(w,0,{kind:'stop'});stepWorld(w,60);close(c.vitals.stamina,before+6);
});
test('힘이 바닥나도 기본 생존 명령은 가능하고 경고는 재진입 때만 발생',()=>{
  const {w,c}=setup();c.vitals.stamina=.1;
  issueCommand(w,0,{kind:'take',buildingId:0,item:'snack'});stepWorld(w,4);
  assert.equal(c.vitals.stamina,0);assert.match(w.events[0].text,/힘이 바닥/);const count=w.events.length;stepWorld(w,1);assert.equal(w.events.length,count);
  assert.equal(issueCommand(w,0,{kind:'move',buildingId:1}),'');assert.equal(issueCommand(w,0,{kind:'consume',item:'snack'}),'');
  issueCommand(w,0,{kind:'rest'});stepWorld(w,1);assert.ok(c.vitals.stamina>0);
});
test('텍스트 UI는 체력·스태미나 수량·비율·게이지를 노출하지 않고 원인을 설명',()=>{
  const {c}=setup();c.vitals.health=47.123;c.vitals.stamina=17.456;updateCondition(c,true);c.fatigue=80;c.thirst=85;c.hunger=90;c.fear=90;c.character!.traits=['organized'];
  const markup=renderCondition(c,true),details=conditionDetails(c).join(' ');
  assert.match(markup,/상당한 손상/);assert.match(markup,/기진맥진/);assert.match(markup,/진행 중단/);
  assert.doesNotMatch(markup,/47\.123|17\.456|<meter|<progress|width:|data-(health|stamina)/);
  assert.match(details,/갈증 \+15%/);assert.match(details,/피로 \+25%/);assert.match(details,/공포 \+25%/);assert.match(details,/상한 적용 \+50%/);assert.match(details,/정리 습관/);assert.match(details,/강한 회복 저하만/);
  assert.match(details,/최대 활동 여력이 줄었/);
});
test('물품 취급의 실제 시작 보정 스냅샷과 설명이 일치',()=>{
  const {w,c}=setup();c.thirst=85;c.fatigue=85;c.fear=90;c.character!.stats.composure=8;c.character!.traits=['clumsy'];
  const effects=handlingEffects(c);issueCommand(w,0,{kind:'take',buildingId:0,item:'water'});
  assert.equal(c.activity.kind,'handling');if(c.activity.kind!=='handling')return;
  assert.deepEqual(c.activity.effects,effects);close(c.activity.remaining,10*effects.multiplier);
  c.thirst=0;c.fatigue=0;c.fear=0;c.character!.traits=[];
  assert.match(conditionDetails(c).join(' '),/갈증 \+15%/);assert.match(conditionDetails(c).join(' '),/서투른 손놀림/);
});
test('스태미나도 정지·배속·회차 초기화 경계를 유지',()=>{
  const a=setup(),b=setup();a.c.vitals.stamina=b.c.vitals.stamina=30;issueCommand(a.w,0,{kind:'rest'});issueCommand(b.w,0,{kind:'rest'});
  const ca=new SimulationClock(),cb=new SimulationClock();cb.speed=4;ca.advance(4,a.w);cb.advance(1,b.w);assert.deepEqual(a.w,b.w);
  ca.paused=true;const before=structuredClone(a.w);ca.advance(60,a.w);assert.deepEqual(a.w,before);
  assert.equal(setup().c.vitals.stamina,100);
});
