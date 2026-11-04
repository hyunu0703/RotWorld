import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld,stepWorld,findPath,walkable } from '../src/simulation/world.ts';
import { defaultDraft } from '../src/data/character.ts';
import { makeZombie,senseZombie,advanceZombies,spawnZombies } from '../src/simulation/zombies.ts';
import { emitNoise,heardDistance,distanceField,tileKey } from '../src/simulation/noise.ts';
import { observe,canSee } from '../src/ai/perception.ts';
import { observeThreats,advanceHumanThreat,respondToThreat,fearRiskMultiplier } from '../src/ai/threat.ts';
import { issueCommand,totalSupplies } from '../src/simulation/survival.ts';
import { SimulationClock } from '../src/simulation/clock.ts';
import { ITEMS } from '../src/data/survival.ts';
import { threatMarkup,zombieMarkup } from '../src/ui/threat.ts';
import { setAutonomy } from '../src/ai/decision.ts';
function setup(){const w=createWorld(defaultDraft(),{stageSix:false});w.stageSix=true;w.buildings=[];w.citizens=w.citizens.slice(0,1);const c=w.citizens[0];c.x=30.5;c.y=25.5;c.brain.enabled=false;c.brain.places={};c.brain.dangers={};return {w,c};}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('초기 좀비 6마리 · 인간까지 경로 12 · 좀비 간 6 · 통행 위치 · 시드 재현',()=>{
 const a=createWorld(),b=createWorld();assert.deepEqual(a.zombies,b.zombies);assert.equal(a.zombies.length,6);
 for(const z of a.zombies){assert.ok(walkable({x:Math.floor(z.x),y:Math.floor(z.y)},a.buildings));for(const c of a.citizens)assert.ok(findPath(c,z,a.buildings)!.length>=12);for(const other of a.zombies)if(z!==other)assert.ok(Math.hypot(z.x-other.x,z.y-other.y)>=6);}
 const tiny=setup();tiny.w.buildings=[{...createWorld(undefined,{stageSix:false}).buildings[0],x:2,y:2,w:92,h:68}];spawnZombies(tiny.w);assert.equal(tiny.w.zombies.length,0);assert.match(tiny.w.events[0].text,/공간 부족/);
});
test('건물 가림 · 인간 개인별 위협 차이 · 수면 시각 중단',()=>{
 const w=createWorld(undefined,{stageSix:false});w.stageSix=true;const [a,b]=w.citizens;a.x=5.5;a.y=10.5;b.x=4.5;b.y=10.5;w.zombies=[makeZombie(0,{x:8.5,y:10.5})];observe(w,a);assert.equal(a.threat.visible.length,0);
 w.zombies[0].x=3.5;observe(w,a);assert.equal(a.threat.visible.length,1);assert.equal(b.threat.visible.length,0);
 a.activity={kind:'sleep',buildingId:0};w.zombies.push(makeZombie(1,{x:4.5,y:10.5}));observe(w,a);assert.equal(a.threat.memories[1],undefined);
});
test('소음 범위·우회 거리·민감도·발걸음 특성과 최대 청각 20',()=>{
 const {w,c}=setup();emitNoise(w,c,'walk');let n=w.noises.at(-1)!;assert.equal(heardDistance(n,{x:c.x+5,y:c.y}),null);assert.equal(heardDistance(n,{x:c.x+4,y:c.y}),4);assert.equal(heardDistance(n,{x:c.x+5,y:c.y},2),5);
 c.character!.traits=['quiet'];emitNoise(w,c,'walk');assert.equal(w.noises.at(-1)!.range,3);c.character!.traits=['loud'];emitNoise(w,c,'walk');assert.equal(w.noises.at(-1)!.range,4.8);
 w.buildings=[{...createWorld(undefined,{stageSix:false}).buildings[0],x:32,y:24,w:1,h:3}];emitNoise(w,c,'handling');n=w.noises.at(-1)!;assert.ok(n.distances[tileKey({x:34.5,y:25.5})]>4);assert.equal(heardDistance(n,{x:51.5,y:25.5},100),null);
});
test('물품 시작·완료 소음과 중단 시 완료 소음 없음 · 실제 수량 보존',()=>{
 const w=createWorld(defaultDraft(),{stageSix:false});w.stageSix=true;for(const c of w.citizens)c.brain.enabled=false;
 issueCommand(w,0,{kind:'take',buildingId:0,item:'water'});assert.equal(w.noises.filter(n=>n.kind==='handling').length,1);
 issueCommand(w,0,{kind:'stop'});stepWorld(w,2);assert.equal(w.noises.filter(n=>n.kind==='handling').length,1);
 issueCommand(w,0,{kind:'take',buildingId:0,item:'water'});stepWorld(w,10);assert.ok(w.noises.some(n=>n.kind==='handling'&&n.time>=12));
 for(const i of ITEMS)assert.equal(totalSupplies(w)[i.id]+w.consumed[i.id],w.initialSupplies[i.id]);
});
test('발소리는 실제 걷기 2초마다 · 정지·시간 분할·배속 일치',()=>{
 const a=setup(),b=setup();issueCommand(a.w,0,{kind:'explore',point:{x:38.5,y:25.5}});issueCommand(b.w,0,{kind:'explore',point:{x:38.5,y:25.5}});
 stepWorld(a.w,5);for(let i=0;i<50;i++)stepWorld(b.w,.1);assert.deepEqual(a.w,b.w);assert.equal(a.w.noises.length,2);assert.ok(a.w.noises[0].x>30.5);
 issueCommand(a.w,0,{kind:'stop'});const id=a.w.nextNoise;stepWorld(a.w,3);assert.equal(a.w.nextNoise,id);
 const clock=new SimulationClock(),snap=structuredClone(a.w);clock.paused=true;clock.advance(1,a.w);assert.deepEqual(a.w,snap);
 const x=setup(),y=setup(),cx=new SimulationClock(),cy=new SimulationClock();cy.speed=4;for(let i=0;i<60;i++)cx.advance(1/60,x.w);for(let i=0;i<15;i++)cy.advance(1/60,y.w);assert.deepEqual(x.w,y.w);
});
test('배회→소리 수색→시각 추적 · 15초 미목격 수색→20초 후 배회',()=>{
 const {w,c}=setup();const z=makeZombie(0,{x:35.5,y:25.5});w.zombies=[z];c.x=70.5;
 emitNoise(w,c,'handling',{x:36.5,y:25.5});senseZombie(w,z);assert.equal(z.state,'search');assert.deepEqual(z.goal,{x:36.5,y:25.5});
 c.x=39.5;w.seconds=1;senseZombie(w,z);assert.equal(z.state,'chase');const seen={...z.lastPosition!};c.x=70.5;
 w.seconds=2;senseZombie(w,z);assert.deepEqual(z.lastPosition,seen);assert.deepEqual(z.goal,seen);
 w.seconds=16;senseZombie(w,z);assert.equal(z.state,'search');z.x=seen.x;z.y=seen.y;z.path=[];z.waitUntil=null;advanceZombies(w,.1);w.seconds=37;advanceZombies(w,.1);assert.equal(z.state,'wander');
});
test('소리 만료 후에도 들은 위치는 유지 · 소음원 실제 위치 원격 갱신 없음',()=>{
 const {w,c}=setup();c.x=70.5;const z=makeZombie(0,{x:30.5,y:25.5});w.zombies=[z];emitNoise(w,c,'handling',{x:32.5,y:25.5});senseZombie(w,z);const memory=structuredClone(z.sound);c.x=80.5;w.seconds=10;w.noises=[];senseZombie(w,z);assert.deepEqual(z.sound,memory);assert.deepEqual(z.goal,memory!.position);
});
test('현재 시각 대상은 2타일 이상 가까워야 전환 · 범위 밖 소음 무시',()=>{
 const {w,c}=setup();const other=structuredClone(c);other.id=1;other.x=34.5;w.citizens.push(other);const z=makeZombie(0,{x:27.5,y:25.5});z.target=1;w.zombies=[z];senseZombie(w,z);assert.equal(z.target,0);
 z.target=1;other.x=31.5;senseZombie(w,z);assert.equal(z.target,1);
 c.x=80;other.x=80;z.state='wander';z.target=null;z.lastPosition=null;emitNoise(w,c,'walk',{x:40.5,y:25.5});senseZombie(w,z);assert.equal(z.state,'wander');
});
test('자율 인간 위험 시 섭취 중단 · 개인 기억 경로 도주 · 직접 명령 유지',()=>{
 const {w,c}=setup();w.zombies=[makeZombie(0,{x:34.5,y:25.5})];c.hunger=80;issueCommand(w,0,{kind:'consume',item:'snack'});c.brain.enabled=true;observe(w,c);assert.equal(respondToThreat(w,c),true);assert.equal(c.activity.kind,'explore');assert.ok(c.path.length);assert.equal(c.supplies.snack,1);assert.equal(w.consumed.snack,0);const from={x:c.x,y:c.y};stepWorld(w,1);assert.ok(Math.hypot(c.x-from.x,c.y-from.y)>0);
 issueCommand(w,0,{kind:'rest'});stepWorld(w,1);assert.equal(c.activity.kind,'rest');assert.equal(c.brain.enabled,false);assert.match(c.threat.warning,/직접 지시/);setAutonomy(w,0,true);stepWorld(w,.5);assert.equal(c.threat.fleeing,true);
});
test('관찰 후보에 이탈 경로가 없으면 실패 표시·재시도',()=>{
 const {w,c}=setup();w.zombies=[makeZombie(0,{x:34.5,y:25.5})];observeThreats(w,c);c.brain.enabled=true;c.threat.observed={};respondToThreat(w,c);assert.equal(c.action,'이탈 경로 없음');assert.equal(c.threat.fleeing,true);assert.equal(c.activity.kind,'idle');
});
test('마지막 목격은 30초 강한 기억·10분 주의 장소 후 제거 · 위치 고정',()=>{
 const {w,c}=setup();const z=makeZombie(0,{x:34.5,y:25.5});w.zombies=[z];observeThreats(w,c);const x=c.threat.memories[0].x;z.x=70;w.seconds=31;observeThreats(w,c);assert.equal(c.threat.memories[0].x,x);assert.equal(c.brain.dangers['zombie:0'].severity,12);w.seconds=631;observeThreats(w,c);assert.equal(c.threat.memories[0],undefined);
});
test('시야 차단 은신 · 재발견 즉시 도주 · 낮은 위험 10초 후 종료',()=>{
 const {w,c}=setup();w.buildings=[{...createWorld(undefined,{stageSix:false}).buildings[0],x:32,y:22,w:2,h:6}];c.threat.memories[0]={id:0,x:40.5,y:25.5,seenAt:0,distance:10,approaching:false};c.threat.fleeing=true;c.brain.enabled=true;
 assert.equal(canSee(w,c,c.threat.memories[0]),false);respondToThreat(w,c);assert.equal(c.activity.kind,'hide');
 w.zombies=[makeZombie(0,{x:29.5,y:25.5})];observe(w,c);respondToThreat(w,c);assert.notEqual(c.activity.kind,'hide');
 w.zombies=[];w.seconds=40;observe(w,c);respondToThreat(w,c);w.seconds=51;observe(w,c);respondToThreat(w,c);assert.equal(c.threat.fleeing,false);
});
test('수면 중 소음 각성은 신원 없이 재관찰 · 자율 수면은 8타일 기억 제한',()=>{
 const w=createWorld(defaultDraft(),{stageSix:false});w.stageSix=true;const c=w.citizens[0];c.fatigue=70;for(const p of w.citizens)p.brain.enabled=false;issueCommand(w,0,{kind:'sleep',buildingId:0});const snapshot=structuredClone(c.brain.places);observe(w,c);assert.deepEqual(c.brain.places,snapshot);
 emitNoise(w,w.citizens[1],'handling',{x:c.x+2,y:c.y});advanceHumanThreat(w,c,.1);assert.equal(c.activity.kind,'idle');assert.match(c.reason,/신원/);assert.equal(c.threat.memories[0],undefined);
 c.threat.memories[0]={id:0,x:c.x+7,y:c.y,seenAt:0,distance:7,approaching:false};assert.match(issueCommand(w,0,{kind:'sleep',buildingId:0},{source:'ai'}),/8타일/);
});
test('접촉에서 접근 정지·수면 각성·피해 없음·반복 기록 억제',()=>{
 const {w,c}=setup();const z=makeZombie(0,{x:c.x+.7,y:c.y});w.zombies=[z];c.activity={kind:'sleep',buildingId:0};const health=c.vitals.health;advanceZombies(w,.1);assert.equal(c.activity.kind,'idle');assert.equal(z.contact[0],0);const count=w.events.length;advanceZombies(w,.1);assert.equal(w.events.length,count);assert.equal(c.vitals.health,health);assert.match(z.reason,/접촉 위험/);
});
test('공포 발견 중복 방지·5분 뒤 재발견 · 접근/포위 대체 · 안전 회복',()=>{
 const {w,c}=setup();const z=makeZombie(0,{x:c.x+4,y:c.y});w.zombies=[z];observeThreats(w,c);assert.equal(c.fear,20);w.seconds=1;observeThreats(w,c);assert.equal(c.fear,20);
 z.x-=.1;w.seconds=2;observeThreats(w,c);advanceHumanThreat(w,c,60);near(c.fear,24);
 w.zombies.push(makeZombie(1,{x:c.x-4,y:c.y}));w.seconds=3;observeThreats(w,c);advanceHumanThreat(w,c,60);near(c.fear,40);
 w.zombies=[];w.seconds=302;observeThreats(w,c);advanceHumanThreat(w,c,1);near(c.fear,40);w.seconds=304;advanceHumanThreat(w,c,60);near(c.fear,37);
 w.seconds=305;w.zombies=[z];observeThreats(w,c);near(c.fear,47);assert.deepEqual([0,40,60,80].map(fearRiskMultiplier),[1,1.25,1.5,2]);
});
test('화면 설명은 실제 좀비 감지·개인 기억·공포 기록과 일치 · 신체 수량 비공개',()=>{
 const {w,c}=setup();const z=makeZombie(0,{x:34.5,y:25.5});w.zombies=[z];observeThreats(w,c);let html=threatMarkup(w,c);assert.match(html,/직접 본 위협/);w.seconds=31;z.x=70;observeThreats(w,c);html=threatMarkup(w,c);assert.match(html,/마지막 목격 기억/);assert.match(html,/34.5/);assert.doesNotMatch(html,/70.0/);z.reason='검증 감지 근거';assert.match(zombieMarkup(z),/검증 감지 근거/);assert.doesNotMatch(html,/maxHealth|stamina|게이지/);
});
test('좀비와 자율 생존 통합 10분 · 물자 보존·상태 범위·유효 위치·회차 독립',()=>{
 const w=createWorld();stepWorld(w,600);
 for(const i of ITEMS)assert.equal(totalSupplies(w)[i.id]+w.consumed[i.id],w.initialSupplies[i.id]);
 for(const c of w.citizens){assert.ok(c.fear>=0&&c.fear<=100);assert.ok(walkable({x:Math.floor(c.x),y:Math.floor(c.y)},w.buildings));}
 const fresh=createWorld();assert.equal(fresh.seconds,0);assert.equal(fresh.noises.length,0);assert.notEqual(fresh.zombies,w.zombies);
});
