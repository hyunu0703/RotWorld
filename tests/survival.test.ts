import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, type World } from '../src/simulation/world.ts';
import { defaultDraft } from '../src/data/character.ts';
import { ITEMS, SURVIVAL, stock, type ItemId } from '../src/data/survival.ts';
import { changeNeeds, handlingMultiplier, issueCommand, totalSupplies } from '../src/simulation/survival.ts';
import { SimulationClock } from '../src/simulation/clock.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const setup=()=>{const w=createWorld(defaultDraft()),c=w.citizens[0];return {w,c};};
function conserved(w:World){const total=totalSupplies(w);for(const item of ITEMS){assert.equal(total[item.id]+w.consumed[item.id],w.initialSupplies[item.id]);for(const c of w.citizens)assert.ok(c.supplies[item.id]>=0);for(const b of w.buildings)assert.ok(b.stock[item.id]>=0);}}
test('깨어 있음·휴식·수면의 시간당 욕구 변화와 범위 제한',()=>{
  const {c}=setup();changeNeeds(c,3600,'awake');close(c.hunger,24);close(c.thirst,21);close(c.fatigue,14);
  changeNeeds(c,3600,'rest');close(c.hunger,28);close(c.thirst,27);close(c.fatigue,14);
  changeNeeds(c,3600,'sleep');close(c.hunger,30);close(c.thirst,30);close(c.fatigue,4);
  changeNeeds(c,360000,'awake');assert.equal(c.hunger,100);assert.equal(c.thirst,100);assert.equal(c.fatigue,100);
  changeNeeds(c,360000,'sleep');assert.equal(c.fatigue,0);
});
test('소식가·대식가 및 수면 특성의 실제 상태 변화',()=>{
  for(const [trait,expected] of [['smallEater',3.4],['bigEater',4.8]] as const){const {c}=setup();c.character!.traits=[trait];changeNeeds(c,3600,'awake');close(c.hunger,20+expected);}
  for(const [trait,recovery] of [['lightSleeper',12.5],['heavySleeper',8]] as const){const {c}=setup();c.fatigue=80;c.character!.traits=[trait];changeNeeds(c,3600,'sleep');close(c.fatigue,80-recovery);}
});
test('같은 물자에 두 인간이 접근하면 마지막 1개를 중복 획득하지 않음',()=>{
  const {w,c}=setup(),other=w.citizens[1],b=w.buildings[0];
  b.stock.snack=1;other.x=c.x;other.y=c.y;other.activity={kind:'idle'};w.initialSupplies=totalSupplies(w);
  assert.equal(issueCommand(w,c.id,{kind:'take',buildingId:0,item:'snack'}),'');assert.equal(issueCommand(w,other.id,{kind:'take',buildingId:0,item:'snack'}),'');
  assert.equal(b.stock.snack,1);stepWorld(w,10);assert.equal(b.stock.snack,0);assert.equal(c.supplies.snack+other.supplies.snack,3);assert.match(other.reason,/고갈/);conserved(w);
});
test('획득·소비·보관은 완료 시 이전하고 정지·중단 때 수량 보존',()=>{
  const {w,c}=setup(),before=structuredClone(c.supplies),placeBefore=w.buildings[0].stock.snack;
  issueCommand(w,c.id,{kind:'take',buildingId:0,item:'snack'});stepWorld(w,5);assert.deepEqual(c.supplies,before);
  const clock=new SimulationClock();clock.paused=true;const paused=structuredClone(w);clock.advance(100,w);assert.deepEqual(w,paused);
  issueCommand(w,c.id,{kind:'stop'});stepWorld(w,20);assert.equal(w.buildings[0].stock.snack,placeBefore);assert.deepEqual(c.supplies,before);
  issueCommand(w,c.id,{kind:'take',buildingId:0,item:'snack'});stepWorld(w,10);assert.equal(c.supplies.snack,2);conserved(w);
  issueCommand(w,c.id,{kind:'deposit',buildingId:0,item:'snack'});stepWorld(w,10);assert.equal(c.supplies.snack,1);assert.equal(w.buildings[0].stock.snack,placeBefore);conserved(w);
  c.hunger=70;issueCommand(w,c.id,{kind:'consume',item:'snack'});stepWorld(w,5);assert.equal(c.supplies.snack,1);issueCommand(w,c.id,{kind:'stop'});assert.equal(w.consumed.snack,0);
  issueCommand(w,c.id,{kind:'consume',item:'snack'});const hunger=c.hunger;stepWorld(w,6);close(c.hunger,hunger+4*6/3600-15);assert.equal(c.supplies.snack,0);assert.equal(w.consumed.snack,1);conserved(w);
});
test('식사·물의 실제 소비와 욕구 감소, 초과 효과를 저장하지 않음',()=>{
  const {w,c}=setup();c.supplies.meal=1;w.initialSupplies=totalSupplies(w);c.hunger=10;c.thirst=90;
  issueCommand(w,c.id,{kind:'consume',item:'meal'});stepWorld(w,12);assert.equal(c.hunger,0);assert.equal(c.supplies.meal,0);assert.equal(w.consumed.meal,1);
  const thirst=c.thirst;issueCommand(w,c.id,{kind:'consume',item:'water'});stepWorld(w,3);close(c.thirst,thirst+6*3/3600-40);assert.equal(c.supplies.water,0);conserved(w);
  const old=structuredClone(c.activity);assert.match(issueCommand(w,c.id,{kind:'consume',item:'water'}),/가지고/);assert.deepEqual(c.activity,old);
});
test('소지 한도·고갈·잘못된 대상은 원래 행동과 수량 유지',()=>{
  const {w,c}=setup();c.supplies=stock(SURVIVAL.capacity);w.initialSupplies=totalSupplies(w);issueCommand(w,c.id,{kind:'rest'});
  const previous=structuredClone(c.activity);assert.match(issueCommand(w,c.id,{kind:'take',buildingId:0,item:'water'}),/한도/);assert.deepEqual(c.activity,previous);
  w.buildings[0].stock.water=0;assert.match(issueCommand(w,c.id,{kind:'take',buildingId:0,item:'water'}),/고갈/);
  assert.match(issueCommand(w,c.id,{kind:'move',buildingId:999}),/찾을 수/);
  assert.match(issueCommand(w,c.id,{kind:'take',buildingId:0,item:'unknown' as ItemId}),/알 수 없는/);
});
test('물품 취급 시간 상태 중첩 상한·침착성·정리 특성 적용',()=>{
  const {w,c}=setup();c.thirst=90;c.fatigue=90;c.fear=90;close(handlingMultiplier(c),1.5);
  c.character!.traits=['organized'];close(handlingMultiplier(c),1.2);
  c.thirst=0;c.fatigue=0;c.character!.stats.composure=8;close(handlingMultiplier(c),1.19*.8);
  c.character!.traits=['clumsy'];close(handlingMultiplier(c),1.19*1.25);
  c.fear=10;c.character!.traits=['organized'];issueCommand(w,c.id,{kind:'take',buildingId:0,item:'meal'});
  assert.equal(c.activity.kind,'handling');if(c.activity.kind==='handling')close(c.activity.remaining,8);
});
test('대상 건물로 실제 이동한 후 획득, 멀리서 재고를 가져오지 않음',()=>{
  const {w,c}=setup(),b=w.buildings[3],before=b.stock.meal;
  issueCommand(w,c.id,{kind:'take',buildingId:b.id,item:'meal'});assert.equal(c.activity.kind,'travel');stepWorld(w,1);assert.equal(b.stock.meal,before);
  for(let i=0;i<2000&&c.activity.kind!=='idle';i++)stepWorld(w,.3);
  assert.equal(c.supplies.meal,1);assert.equal(b.stock.meal,before-1);assert.equal(c.activity.kind,'idle');assert.ok(c.visits>0);conserved(w);
});
test('수면 장소 제한·피로 회복·조건 변경 각성·명령 기상',()=>{
  const {w,c}=setup();c.fatigue=80;
  assert.match(issueCommand(w,c.id,{kind:'sleep',buildingId:3}),/거점/);assert.equal(c.activity.kind,'idle');
  issueCommand(w,c.id,{kind:'sleep',buildingId:0});stepWorld(w,3600);close(c.fatigue,70);close(c.hunger,22);close(c.thirst,18);
  w.buildings[0].sleepSpot=false;stepWorld(w,1);assert.equal(c.activity.kind,'idle');assert.match(c.reason,/조건/);
  w.buildings[0].sleepSpot=true;issueCommand(w,c.id,{kind:'sleep',buildingId:0});issueCommand(w,c.id,{kind:'stop'});assert.equal(c.activity.kind,'idle');
});
test('수면 완료 후 남은 시간은 깨어 있는 상태에만 적용',()=>{
  const {w,c}=setup();c.fatigue=5;issueCommand(w,c.id,{kind:'sleep',buildingId:0});stepWorld(w,3600);
  close(c.fatigue,2);close(c.hunger,23);close(c.thirst,19.5);assert.equal(c.activity.kind,'idle');
});
test('행동·수량·상태가 1배속과 4배속에서 같은 게임 시간에 일치',()=>{
  const a=setup(),b=setup();issueCommand(a.w,0,{kind:'consume',item:'snack'});issueCommand(b.w,0,{kind:'consume',item:'snack'});
  const ca=new SimulationClock(),cb=new SimulationClock();cb.speed=4;
  for(let i=0;i<600;i++)ca.advance(1/60,a.w);for(let i=0;i<150;i++)cb.advance(1/60,b.w);
  assert.deepEqual(a.w,b.w);conserved(a.w);
});
test('하루 경과에도 재고가 자동 보충되지 않고 경고 반복 억제',()=>{
  const {w,c}=setup();for(const b of w.buildings)b.stock=stock();w.initialSupplies=totalSupplies(w);
  stepWorld(w,86400);assert.ok(w.buildings.every(b=>b.stock.water===0&&b.stock.meal===0&&b.stock.snack===0));
  assert.equal(c.hunger,100);assert.equal(c.thirst,100);assert.equal(c.fatigue,100);conserved(w);
  const events=structuredClone(w.events);stepWorld(w,10);assert.deepEqual(w.events,events);
});
