import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld as createThreatWorld, stepWorld, findPath } from '../src/simulation/world.ts';
import { defaultDraft } from '../src/data/character.ts';
import { stock, ITEMS, SURVIVAL, stockCount } from '../src/data/survival.ts';
import { issueCommand, totalSupplies } from '../src/simulation/survival.ts';
import { createBrain } from '../src/ai/types.ts';
import { observe, canSee, riskAt } from '../src/ai/perception.ts';
import { think, setAutonomy } from '../src/ai/decision.ts';
import { SimulationClock } from '../src/simulation/clock.ts';

function setup(){
  const w=createWorld(defaultDraft()),c=w.citizens[0];
  for(const p of w.citizens)p.brain.enabled=false;
  c.brain.enabled=true;c.hunger=0;c.thirst=0;c.fatigue=0;
  return {w,c};
}
function advance(w:ReturnType<typeof createWorld>,seconds:number){for(let i=0;i<seconds;i++)stepWorld(w,1);}

test('개인 관찰은 벽에 가리고 입구 조사 전에는 재고·수면 조건 미확인',()=>{
  const {w,c}=setup(),b=w.buildings[0];c.brain=createBrain(0,true);c.y+=4;observe(w,c);
  assert.equal(c.brain.places[0].stock,null);assert.equal(c.brain.places[0].sleepSpot,null);
  assert.equal(canSee(w,{x:b.x-1,y:b.y+3},{x:b.x+b.w+1,y:b.y+3}),false);
  c.y-=4;observe(w,c);assert.deepEqual(c.brain.places[0].stock,b.stock);
  assert.notEqual(c.brain.places[0],w.citizens[1].brain.places[0]);
});

test('멀어진 장소의 재고 변화는 개인 기억을 자동 갱신하지 않음',()=>{
  const {w,c}=setup(),remembered=c.brain.places[0].stock!.water;
  c.x=40.5;c.y=20.5;w.buildings[0].stock.water=0;observe(w,c);
  assert.equal(c.brain.places[0].stock!.water,remembered);
  assert.equal(issueCommand(w,0,{kind:'take',buildingId:0,item:'water'},{source:'ai'}),'');
  assert.equal(c.activity.kind,'travel');assert.equal(c.supplies.water,1);
  c.brain.enabled=false;advance(w,300);observe(w,c);
  assert.equal(c.brain.places[0].stock!.water,0);assert.equal(c.supplies.water,1);
});

test('허기 60부터 가진 음식을 먹고 35 이하까지 해결 목표를 유지',()=>{
  const {w,c}=setup();c.hunger=60;c.supplies=stock(3);w.initialSupplies=totalSupplies(w);
  think(w,c);assert.equal(c.activity.kind,'consume');assert.equal(c.brain.needs.food,true);
  advance(w,7);assert.equal(w.consumed.snack,1);assert.equal(c.brain.needs.food,true);
  advance(w,8);assert.equal(w.consumed.snack,2);assert.ok(c.hunger<35);
  think(w,c);assert.equal(c.brain.needs.food,false);assert.equal(c.supplies.snack,1);
});

test('갈증은 수분 섭취로 해소하며 모르는 먼 재고를 후보로 사용하지 않음',()=>{
  const {w,c}=setup();c.thirst=70;think(w,c);
  assert.equal(c.activity.kind,'consume');advance(w,4);assert.equal(w.consumed.water,1);assert.ok(c.thirst<31);
  c.thirst=70;c.brain.places={};c.activity={kind:'idle'};c.path=[];think(w,c);
  assert.equal(c.brain.goal,null);assert.equal(c.activity.kind,'explore');
  assert.ok(!c.brain.decision!.alternatives.some(a=>a.action.includes('확보')));
});

test('40~59 준비 구간의 비축 성향은 실제 확보 선택에 반영',()=>{
  for(const [level,shouldTake] of [['low',false],['high',true]] as const){
    const {w,c}=setup();c.thirst=45;c.character!.personality.stockpiling=level;think(w,c);
    assert.equal(c.activity.kind==='handling',shouldTake);
    if(shouldTake){assert.equal(c.brain.goal,'water');assert.match(c.reason,/비축 목표 3/);}
  }
});

test('피로 40~59는 확인한 거점으로 복귀·휴식하고 60 전 수면하지 않음',()=>{
  const {w,c}=setup();c.fatigue=50;c.x+=3;think(w,c);
  assert.equal(c.activity.kind,'travel');if(c.activity.kind==='travel')assert.equal(c.activity.interaction.kind,'restAt');
  assert.match(c.reason,/장거리 탐색 대신/);advance(w,20);assert.equal(c.activity.kind,'rest');
  const fatigue=c.fatigue;advance(w,60);assert.equal(c.fatigue,fatigue);assert.equal(c.brain.needs.sleep,false);
  c.fatigue=60;think(w,c);assert.equal(c.activity.kind,'sleep');
});
test('사전 거처 복귀는 긴급 욕구·위험에 양보하며 모르는 거점을 사용하지 않음',()=>{
  const {w,c}=setup();c.fatigue=50;c.x+=3;think(w,c);c.hunger=70;think(w,c);assert.equal(c.activity.kind,'consume');
  const other=setup();other.c.fatigue=50;other.c.brain.places={};think(other.w,other.c);assert.equal(other.c.activity.kind,'explore');
  w.dangers=[{id:'fixture',label:'검증용 위험',x:c.x+1,y:c.y,radius:2,severity:90}];observe(w,c);think(w,c);assert.equal(c.brain.decision!.action,'인지한 위험에서 이탈');
});

test('알고 있는 물자 장소는 거리·위험을 비교하며 고갈 관찰 시 재판단',()=>{
  const {w,c}=setup();c.supplies=stock();c.thirst=70;
  const b=w.buildings[1],entry={x:b.door.x+.5,y:b.door.y+.5};
  c.brain.places[1]={id:1,name:b.name,kind:b.kind,...entry,stock:{...b.stock},sleepSpot:true,seenAt:0,inspectedAt:0};
  think(w,c);assert.equal(c.activity.kind,'handling');assert.equal(c.destination,0);
  w.buildings[0].stock.water=0;observe(w,c);c.activity={kind:'idle'};think(w,c);
  assert.equal(c.activity.kind,'travel');assert.equal(c.destination,1);
  assert.match(c.reason,/직접 확인/);
});

test('자율 수면은 피로 20에서 끝나고 직접 수면은 0 목표 유지',()=>{
  const {w,c}=setup();c.fatigue=60;think(w,c);assert.equal(c.activity.kind,'sleep');
  stepWorld(w,14400);assert.equal(c.fatigue,20);assert.equal(c.activity.kind,'idle');
  think(w,c);assert.equal(c.brain.needs.sleep,false);
  issueCommand(w,0,{kind:'sleep',buildingId:0});assert.equal(c.brain.enabled,false);
  stepWorld(w,7200);assert.equal(c.fatigue,0);
});

test('소지 공간이 없으면 다른 물자를 보관한 뒤 필요한 물 확보',()=>{
  const {w,c}=setup();c.thirst=70;c.supplies=stock(SURVIVAL.capacity);w.initialSupplies=totalSupplies(w);
  think(w,c);assert.equal(c.activity.kind,'handling');if(c.activity.kind==='handling')assert.equal(c.activity.mode,'deposit');
  advance(w,30);assert.ok(w.consumed.water>=1);assert.ok(stockCount(c.supplies)<=SURVIVAL.capacity);
  for(const i of ITEMS)assert.equal(totalSupplies(w)[i.id]+w.consumed[i.id],w.initialSupplies[i.id]);
});

test('인지한 즉각 위험은 섭취보다 먼저 회피하며 위험 기억은 재확인으로 제거',()=>{
  const {w,c}=setup();c.hunger=80;
  w.dangers=[{id:'fixture',label:'검증용 위험',x:c.x+1,y:c.y,radius:2,severity:90}];observe(w,c);think(w,c);
  assert.equal(c.activity.kind,'explore');assert.equal(c.brain.decision!.action,'인지한 위험에서 이탈');assert.equal(w.consumed.snack,0);
  if(c.activity.kind==='explore')assert.ok(riskAt(c.brain,c.activity.point)<c.brain.risk);
  w.dangers=[];observe(w,c);assert.deepEqual(c.brain.dangers,{});
});

test('벽 뒤 위험은 인지하지 않으며 위험 구역 경로를 제한할 수 있음',()=>{
  const {w,c}=setup(),b=w.buildings[0];c.x=b.x-1.5;c.y=b.y+3.5;
  w.dangers=[{id:'hidden',label:'가려진 위험',x:b.x+1.5,y:c.y,radius:20,severity:100}];observe(w,c);
  assert.equal(c.brain.risk,0);assert.deepEqual(c.brain.dangers,{});
  assert.equal(findPath({x:2.5,y:2.5},{x:5.5,y:2.5},w.buildings,p=>p.x<4),null);
});

test('성공한 직접 지시는 자율 행동을 끄고 잘못된 지시는 기존 행동 유지',()=>{
  const {w,c}=setup();think(w,c);const before=structuredClone(c.activity),memory=structuredClone(c.brain.places);
  assert.ok(issueCommand(w,0,{kind:'move',buildingId:999}));assert.equal(c.brain.enabled,true);assert.deepEqual(c.activity,before);
  assert.equal(issueCommand(w,0,{kind:'rest'}),'');assert.equal(c.brain.enabled,false);advance(w,10);assert.equal(c.activity.kind,'rest');
  assert.equal(c.brain.decision!.source,'player');const beforeToggle=structuredClone(c.brain.places);setAutonomy(w,0,true);assert.deepEqual(c.brain.places,beforeToggle);assert.deepEqual(c.brain.places[0].stock,memory[0].stock);think(w,c);assert.equal(c.brain.decision!.source,'ai');
});

test('위험 감수 성향이 같지 않으면 위험한 가까운 재고와 먼 재고 선택이 달라짐',()=>{
  for(const [level,expected] of [['low',1],['high',0]] as const){
    const {w,c}=setup(),b=w.buildings[1];c.thirst=70;c.supplies=stock();c.character!.personality.risk=level;
    c.brain.places[1]={id:1,name:b.name,kind:b.kind,x:b.door.x+.5,y:b.door.y+.5,stock:{...b.stock},sleepSpot:true,seenAt:0,inspectedAt:0};
    w.dangers=[{id:'fixture',label:'검증용 위험',x:c.x,y:c.y,radius:1,severity:10}];observe(w,c);think(w,c);
    assert.equal(c.destination,expected);
  }
});

test('지각 스탯은 관찰 거리의 실제 차이를 만듦',()=>{
  for(const [perception,expected] of [[3,false],[8,true]] as const){
    const {w,c}=setup();c.character!.stats.perception=perception;
    w.dangers=[{id:'edge',label:'시야 경계',x:c.x+8.5,y:c.y,radius:1,severity:10}];observe(w,c);
    assert.equal(Boolean(c.brain.dangers.edge),expected);
  }
});

test('이탈할 수 없는 인지 위험에서는 식사·수면을 시작하지 않음',()=>{
  const {w,c}=setup();c.hunger=80;c.fatigue=80;
  w.dangers=[{id:'fixture',label:'검증용 포위',x:c.x,y:c.y,radius:10000,severity:100}];observe(w,c);think(w,c);
  assert.equal(c.activity.kind,'idle');assert.equal(c.brain.decision!.action,'위험 경로 대기');
  const history=c.brain.history.length;think(w,c);assert.equal(c.brain.history.length,history);assert.equal(w.consumed.snack,0);
});

test('회차·개인 기억과 과거 판단 스냅샷은 독립',()=>{
  const {w,c}=setup();c.hunger=70;think(w,c);const history=structuredClone(c.brain.history[0]);
  c.brain.decision!.reason='현재 판단 수정';assert.deepEqual(c.brain.history[0],history);
  w.buildings[0].stock.water=0;observe(w,c);const fresh=createWorld(defaultDraft());
  assert.ok(fresh.citizens[0].brain.places[0].stock!.water>0);assert.equal(fresh.citizens[0].brain.enabled,false);
  assert.ok(fresh.citizens.slice(1).every(p=>p.brain.enabled));assert.notEqual(c.brain.places,fresh.citizens[0].brain.places);
});

test('자율 생존 하루 동안 모든 물자 보존·상태 범위·실제 행동 완료',()=>{
  const w=createWorld();for(let t=0;t<86400;t+=5)stepWorld(w,5);
  for(const i of ITEMS){assert.equal(totalSupplies(w)[i.id]+w.consumed[i.id],w.initialSupplies[i.id]);assert.ok(w.consumed[i.id]>0);}
  for(const c of w.citizens){for(const key of ['hunger','thirst','fatigue'] as const)assert.ok(c[key]>=0&&c[key]<=100);assert.ok(c.visits>0);assert.ok(c.brain.history.length<=8);assert.ok(stockCount(c.supplies)<=SURVIVAL.capacity);}
  assert.ok(w.citizens.some(c=>c.brain.places[0]));
});

test('자율 AI도 같은 게임 시간의 1배속·4배속에서 동일하며 정지 중 불변',()=>{
  const a=createWorld(),b=createWorld(),ca=new SimulationClock(),cb=new SimulationClock();cb.speed=4;
  for(let i=0;i<600;i++)ca.advance(1/60,a);for(let i=0;i<150;i++)cb.advance(1/60,b);
  assert.deepEqual(a,b);const before=structuredClone(a);ca.paused=true;ca.advance(1,a);assert.deepEqual(a,before);
});

function createWorld(profile?:Parameters<typeof createThreatWorld>[0]){return createThreatWorld(profile,{stageSix:false});}
