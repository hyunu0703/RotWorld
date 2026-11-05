import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld,stepWorld,type Citizen } from '../src/simulation/world.ts';
import { makeZombie } from '../src/simulation/zombies.ts';
import { defaultDraft } from '../src/data/character.ts';
import { commandCombat,beginHumanStrike,beginZombieStrikes,resolveStrikes,woundHuman,advanceMedical,advanceInfection,observeSymptoms,combatChances,combatAI,die,safeRetreat } from '../src/simulation/combat.ts';
import { issueCommand,totalSupplies,changeNeeds } from '../src/simulation/survival.ts';
import { observe } from '../src/ai/perception.ts';
import { ITEMS,stockCount } from '../src/data/survival.ts';
import { SimulationClock } from '../src/simulation/clock.ts';
import { combatMarkup } from '../src/ui/combat.ts';
import { renderCondition } from '../src/ui/condition.ts';
import { GameSession } from '../src/simulation/session.ts';
function setup(){const w=createWorld(defaultDraft(),{stageSix:false,stageSeven:true});w.mainCharacterId=null;w.buildings=[];w.citizens=w.citizens.slice(0,1);const c=w.citizens[0];c.x=30.5;c.y=25.5;c.brain.enabled=false;const z=makeZombie(0,{x:31.25,y:25.5});z.ready=Infinity;w.zombies=[z];return {w,c,z};}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
function conserve(w:ReturnType<typeof createWorld>){for(const item of ITEMS)assert.equal(totalSupplies(w)[item.id]+w.consumed[item.id],w.initialSupplies[item.id]);}

test('승인 아이템 배치·장착·소지 한도·미섭취·장착 보관 해제',()=>{
 const w=createWorld(defaultDraft(),{stageSix:false});const c=w.citizens[0];assert.equal(w.buildings[8].stock.pipe,2);assert.equal(w.buildings[9].stock.pipe,2);assert.equal(w.buildings[4].stock.bandage,6);assert.equal(w.buildings[0].stock.bandage,1);assert.equal(c.supplies.pipe,0);
 assert.match(commandCombat(w,0,{kind:'equip',equipped:true}),/없습니다/);assert.match(issueCommand(w,0,{kind:'consume',item:'bandage'}),/섭취/);
 issueCommand(w,0,{kind:'take',buildingId:8,item:'pipe'});stepWorld(w,500);assert.equal(c.supplies.pipe,1);const n=stockCount(c.supplies);assert.equal(commandCombat(w,0,{kind:'equip',equipped:true}),'');assert.equal(stockCount(c.supplies),n);
 issueCommand(w,0,{kind:'deposit',buildingId:8,item:'pipe'});stepWorld(w,10);assert.equal(c.fighter.equipped,false);conserve(w);
});
test('공격 준비·사거리·취소 비용·재사용 대기·반복 명령 유지',()=>{
 const {w,c,z}=setup();assert.equal(commandCombat(w,0,{kind:'attack',target:0}),'');beginHumanStrike(w,c);near(c.vitals.stamina,94);const pending=structuredClone(c.fighter.pending);commandCombat(w,0,{kind:'attack',target:0});assert.deepEqual(c.fighter.pending,pending);w.seconds=2.9;resolveStrikes(w);assert.equal(z.health,60);
 issueCommand(w,0,{kind:'stop'});assert.equal(c.fighter.pending,null);near(c.vitals.stamina,94);w.seconds=3;commandCombat(w,0,{kind:'push',target:0});beginHumanStrike(w,c);assert.equal(c.fighter.pending,null);assert.equal(c.fighter.ready,12);
 w.seconds=12;beginHumanStrike(w,c);assert.equal(c.fighter.pending?.due,14);
});
test('타격 순간 이탈·벽 가림·취소는 소음 없음, 빗나감은 소음 발생',()=>{
 const {w,c,z}=setup();w.stageSix=true;commandCombat(w,0,{kind:'attack',target:0});beginHumanStrike(w,c);z.x=40;w.seconds=3;resolveStrikes(w);assert.equal(z.health,60);assert.equal(w.noises.length,0);
 z.x=31.25;w.seconds=12;beginHumanStrike(w,c);w.seconds=15;w.randomState=2000;resolveStrikes(w);assert.equal(w.noises.length,1);assert.equal(w.noises[0].range,6);
 w.seconds=24;beginHumanStrike(w,c);w.buildings=[{...createWorld(undefined,{stageSix:false}).buildings[0],x:31,y:25,w:1,h:1}];w.seconds=27;resolveStrikes(w);assert.equal(w.noises.length,1);
});
test('동시 타격은 양측 사망에도 두 공격 결과 적용',()=>{
 const {w,c,z}=setup();c.vitals.health=8;z.health=10;w.randomState=1;commandCombat(w,0,{kind:'attack',target:0});beginHumanStrike(w,c);z.strike={target:0,due:3};w.seconds=3;resolveStrikes(w);assert.equal(z.dead,true);assert.equal(c.vitals.dead,true);assert.equal(c.fighter.wounds.length,1);
});
test('명중·회피의 상태·스탯 보정 및 최종 상하한',()=>{
 const {c}=setup();assert.deepEqual(combatChances(c),{hit:.8,dodge:.2});c.fear=80;c.character!.stats.composure=8;near(combatChances(c).hit,.648);c.character!.stats.agility=8;c.fatigue=80;near(combatChances(c).dodge,.18);
 c.character!.stats.agility=100;near(combatChances(c).dodge,.6);c.character!.stats.agility=-100;near(combatChances(c).dodge,.05);
});
test('난수 경로에서 회피·일반 타격·물림 구분, 물림만 감염',()=>{
 let dodged=false,normal=false,bite=false;
 for(let seed=0;seed<1000&&!(dodged&&normal&&bite);seed++){
  const {w,c,z}=setup();w.randomState=seed;z.strike={target:0,due:0};resolveStrikes(w);
  if(c.fighter.wounds.length){const wound=c.fighter.wounds[0];if(wound.kind==='bite'){bite=true;assert.equal(c.fighter.infectedAt,0);assert.equal(c.vitals.health,82);assert.equal(wound.bleeding,true);}else{normal=true;assert.equal(c.fighter.infectedAt,null);assert.equal(c.vitals.health,92);}assert.equal(c.fear,25);
  }else if(w.events.some(e=>e.text.includes('회피')))dodged=true;
 }assert.ok(dodged&&normal&&bite);
});
test('밀치기 준비 2초·성공 지연·공격 취소·벽 실패·비용 유지',()=>{
 const {w,c,z}=setup();w.randomState=1;commandCombat(w,0,{kind:'push',target:0});beginHumanStrike(w,c);z.strike={target:0,due:4};w.seconds=2;resolveStrikes(w);near(z.x,32.25);assert.equal(z.stunned,5);assert.equal(z.strike,null);assert.equal(c.fighter.ready,10);near(c.vitals.stamina,94);
 z.x=31.25;w.seconds=10;w.randomState=1;beginHumanStrike(w,c);w.buildings=[{...createWorld(undefined,{stageSix:false}).buildings[0],x:32,y:25,w:1,h:1}];w.seconds=12;resolveStrikes(w);near(z.x,31.25);near(c.vitals.stamina,88);assert.equal(z.stunned,5);
});
test('상처는 공격 단위·출혈 합계 상한·지속 피해는 공포 반복 없음',()=>{
 const {w,c}=setup();for(let i=0;i<5;i++)woundHuman(w,c,1,false,true);assert.equal(c.fighter.wounds.length,5);const fear=c.fear;advanceMedical(w,c,60,'idle');near(c.vitals.health,93);assert.equal(c.fear,fear);assert.equal(c.fighter.infectedAt,null);
});
test('지혈 중단·완료·상처별 소비·물림 감염 시계 유지',()=>{
 const {w,c}=setup();woundHuman(w,c,1,true,true);woundHuman(w,c,1,false,true);c.supplies.bandage=2;
 commandCombat(w,0,{kind:'bandage',wound:0});stepWorld(w,10);issueCommand(w,0,{kind:'stop'});assert.equal(c.supplies.bandage,2);assert.equal(c.fighter.wounds[0].bleeding,true);
 commandCombat(w,0,{kind:'bandage',wound:0});stepWorld(w,30);assert.equal(c.supplies.bandage,1);assert.equal(w.consumed.bandage,1);assert.equal(c.fighter.wounds[0].bleeding,false);assert.equal(c.fighter.wounds[1].bleeding,true);assert.equal(c.fighter.infectedAt,0);assert.match(commandCombat(w,0,{kind:'bandage',wound:0}),/출혈/);
});
test('회복 조건·상처 회복·빠른/느린 회복·최대 체력',()=>{
 const {w,c}=setup();w.zombies=[];woundHuman(w,c,50,false,false);advanceMedical(w,c,3600,'idle');near(c.vitals.health,50);assert.equal(c.fighter.wounds[0].healing,3600);
 c.hunger=60;advanceMedical(w,c,3600,'rest');near(c.vitals.health,50);assert.equal(c.fighter.wounds[0].healing,3600);c.hunger=20;
 c.character!.traits=['fastHealing'];advanceMedical(w,c,3600,'rest');near(c.vitals.health,56.25);c.character!.traits=['slowHealing'];advanceMedical(w,c,3600,'rest');near(c.vitals.health,60.25);
 c.character!.traits=[];advanceMedical(w,c,20000,'rest');assert.equal(c.fighter.wounds.length,0);assert.ok(c.vitals.health<=100);
});
test('굶주림·탈수 합산·100 경계 해제·사망 한 번·시신 소지품 보존',()=>{
 const {w,c}=setup();c.hunger=100;c.thirst=100;advanceMedical(w,c,3600,'idle');near(c.vitals.health,92);c.hunger=99;c.thirst=99;advanceMedical(w,c,3600,'idle');near(c.vitals.health,92);
 c.vitals.health=1;c.thirst=100;advanceMedical(w,c,600,'idle');assert.equal(c.vitals.dead,true);const inventory=structuredClone(c.supplies),events=w.events.length;die(w,c,'중복');assert.equal(w.events.length,events);assert.deepEqual(c.supplies,inventory);
});
test('감염 10분 무증상·30분 증상·1시간 변이·추가 물림 시계 고정',()=>{
 const {w,c}=setup();w.zombies=[];woundHuman(w,c,1,true,false);w.seconds=600;advanceInfection(w);assert.equal(c.fighter.converted,false);assert.match(combatMarkup(w,c),/잠복기/);w.seconds=1800;assert.match(combatMarkup(w,c),/증상기/);
 woundHuman(w,c,1,true,false);assert.equal(c.fighter.infectedAt,0);w.seconds=3599.9;advanceInfection(w);assert.equal(w.zombies.length,0);w.seconds=3600;advanceInfection(w);assert.equal(w.zombies.length,1);assert.equal(c.fighter.converted,true);advanceInfection(w);assert.equal(w.zombies.length,1);assert.equal(w.zombies[0].origin,0);
});
test('감염자 조기 사망은 두 시각 중 빠른 재기동, 비감염 시신 유지',()=>{
 const {w,c}=setup();w.zombies=[];woundHuman(w,c,1,true,false);w.seconds=100;die(w,c,'테스트');w.seconds=1899.9;advanceInfection(w);assert.equal(w.zombies.length,0);w.seconds=1900;advanceInfection(w);assert.equal(w.zombies.length,1);
 const b=setup();b.w.zombies=[];die(b.w,b.c,'비감염');b.w.seconds=10000;advanceInfection(b.w);assert.equal(b.w.zombies.length,0);
});
test('증상 5초 연속 시각 관찰·중단 초기화·개인별 의심',()=>{
 const {w,c}=setup();const other=structuredClone(c);other.id=1;other.name='증상자';other.x=33;other.fighter.infectedAt=0;w.citizens.push(other);w.seconds=1800;observeSymptoms(w,c);
 w.seconds=1804;observeSymptoms(w,c);assert.equal(c.fighter.suspicions[1].suspected,false); // long unobserved gap does not count
 for(let i=1;i<=8;i++){w.seconds=1804+i*.5;observeSymptoms(w,c);}assert.equal(c.fighter.suspicions[1].suspected,false);
 other.x=80;w.seconds+=.5;observeSymptoms(w,c);assert.equal(c.fighter.suspicions[1].duration,0);other.x=33;
 for(let i=0;i<11;i++){w.seconds+=.5;observeSymptoms(w,c);}assert.equal(c.fighter.suspicions[1].suspected,true);assert.equal(Object.keys(other.fighter.suspicions).length,0);
});
test('AI 공격 성향·위험 중 전투 중단·직접 명령 보존',()=>{
 const {w,c,z}=setup();c.character!.personality.aggression='high';c.brain.enabled=true;observe(w,c); // stageSix false: explicitly observe threat below
 c.threat.visible=[0];c.threat.memories[0]={id:0,x:z.x,y:z.y,seenAt:0,distance:.75,approaching:false};assert.equal(combatAI(w,c),true);assert.equal(c.activity.kind,'combat');
 c.fighter.wounds.push({id:0,kind:'normal',bleeding:true,healing:0});w.seconds=1;assert.equal(combatAI(w,c),false);assert.equal(c.fighter.retreat,true);
 commandCombat(w,0,{kind:'attack',target:0});assert.equal(c.brain.enabled,false);assert.equal(combatAI(w,c),false);assert.equal(c.activity.kind,'combat');
});
test('동일 시드·시간 분할·일시정지·4배속 전투 결과 일치',()=>{
 const a=setup(),b=setup();commandCombat(a.w,0,{kind:'attack',target:0});commandCombat(b.w,0,{kind:'attack',target:0});stepWorld(a.w,25);for(let i=0;i<250;i++)stepWorld(b.w,.1);assert.deepEqual(a.w,b.w);
 const clock=new SimulationClock();clock.paused=true;const before=structuredClone(a.w);clock.advance(1,a.w);assert.deepEqual(a.w,before);
 const x=setup(),y=setup(),cx=new SimulationClock(),cy=new SimulationClock();cy.speed=4;commandCombat(x.w,0,{kind:'attack',target:0});commandCombat(y.w,0,{kind:'attack',target:0});for(let i=0;i<60;i++)cx.advance(1/60,x.w);for(let i=0;i<15;i++)cy.advance(1/60,y.w);assert.deepEqual(x.w,y.w);
});
test('주인공 실제 사망·변이 후 시간 중단·회차 종료 원인과 새 데이터',()=>{
 const {w,c}=setup();w.mainCharacterId=0;woundHuman(w,c,100,false,false);assert.equal(w.active,false);const seconds=w.seconds;stepWorld(w,100);assert.equal(w.seconds,seconds);assert.match(w.endReason,/사망/);
 const b=setup();b.w.mainCharacterId=0;b.c.fighter.infectedAt=0;b.w.seconds=3600;advanceInfection(b.w);assert.equal(b.w.active,false);assert.match(b.w.endReason,/변이/);
 const session=new GameSession();const old=session.start();session.end('종료');const fresh=session.start();assert.equal(old.active,false);assert.equal(fresh.seconds,0);assert.equal(fresh.citizens[0].fighter.infectedAt,null);
});
test('소지품·감염·상처 UI에 체력과 스태미나 내부 수치 없음',()=>{
 const {w,c}=setup();c.vitals.health=71.234;c.vitals.stamina=32.123;const html=combatMarkup(w,c)+renderCondition(c);assert.doesNotMatch(html,/71.234|32.123|maxHealth|maxStamina/);assert.match(html,/공격/);assert.match(html,/감염/);
});

test('퇴로는 관찰된 길·길이·위험·좀비 거리·출구 조건으로 판정',()=>{
 const {w,c,z}=setup();c.threat.memories[0]={id:0,x:z.x,y:z.y,seenAt:0,distance:.75,approaching:false};c.brain.dangers['zombie:0']={id:'zombie:0',label:'직접 본 위협',x:z.x,y:z.y,severity:80,radius:6,seenAt:0};c.brain.risk=74;
 for(let x=21;x<=30;x++)c.threat.observed[x+',25']={x:x+.5,y:25.5};
 const path=safeRetreat(w,c);assert.ok(path);assert.ok(path.length>=4&&path.length<=12);assert.ok(path.every(p=>Math.hypot(p.x-z.x,p.y-z.y)>=1.5));
 c.threat.observed={};assert.equal(safeRetreat(w,c),null);
});
test('보통 공격 성향은 무기와 퇴로가 있어야 시작·퇴로 소실 시 중단',()=>{
 const {w,c,z}=setup();c.brain.enabled=true;c.fighter.equipped=true;c.supplies.pipe=1;c.threat.visible=[0];c.threat.memories[0]={id:0,x:z.x,y:z.y,seenAt:0,distance:.75,approaching:false};c.brain.risk=74;c.brain.dangers['zombie:0']={id:'zombie:0',label:'위협',x:z.x,y:z.y,severity:80,radius:6,seenAt:0};
 assert.equal(combatAI(w,c),false);for(let x=21;x<=30;x++)c.threat.observed[x+',25']={x:x+.5,y:25.5};assert.equal(combatAI(w,c),true);assert.equal(c.activity.kind,'combat');c.threat.observed={};w.seconds=1;assert.equal(combatAI(w,c),false);assert.equal(c.fighter.pending,null);
});
test('자율 무기 획득은 직접 조사한 재고 하나만·개인 기억 밖 재고 사용 안 함',()=>{
 const w=createWorld(undefined,{stageSix:false,stageSeven:true});w.citizens=w.citizens.slice(0,1);const c=w.citizens[0];const b=w.buildings[8];c.x=b.door.x+.5;c.y=b.door.y+.5;c.brain.places={};c.character!.personality.aggression='normal';observe(w,c);stepWorld(w,20);assert.equal(c.supplies.pipe,1);assert.equal(c.fighter.equipped,true);stepWorld(w,20);assert.equal(c.supplies.pipe,1);assert.equal(b.stock.pipe,1);
});
test('증상 피로 추가·잠복기 무추가·회복 조건 경계의 시간 분할',()=>{
 const a=setup(),b=setup();a.w.zombies=[];b.w.zombies=[];a.c.fighter.infectedAt=0;b.c.fighter.infectedAt=0;a.w.seconds=1800;b.w.seconds=1800;changeNeeds(a.c,60,'awake','idle',a.w);near(a.c.fatigue,10+6/60);
 b.w.seconds=1799;changeNeeds(b.c,60,'awake','idle',b.w);near(b.c.fatigue,10+4/60);
 const x=setup(),y=setup();x.w.zombies=[];y.w.zombies=[];x.c.hunger=y.c.hunger=59.99;x.c.vitals.health=y.c.vitals.health=50;changeNeeds(x.c,60,'rest','rest',x.w);for(let i=0;i<600;i++)changeNeeds(y.c,.1,'rest','rest',y.w);near(x.c.vitals.health,y.c.vitals.health);near(x.c.hunger,y.c.hunger);
});
test('실제 세계 루프의 감염·재기동과 주인공 종료 후 새 명령 거절',()=>{
 const {w,c}=setup();w.zombies=[];c.fighter.infectedAt=0;w.seconds=3599.9;stepWorld(w,.1);assert.equal(c.fighter.converted,true);assert.equal(w.zombies.length,1);assert.equal(w.active,true);
 const b=setup();b.w.mainCharacterId=0;b.c.fighter.infectedAt=0;b.w.seconds=3599.9;stepWorld(b.w,.1);assert.equal(b.w.active,false);assert.match(commandCombat(b.w,0,{kind:'equip',equipped:true}),/살아/);assert.match(issueCommand(b.w,0,{kind:'rest'}),/인간/);
});

test('피로 80에서 수면으로 내려오는 구간은 경계 아래 회복 조건 적용',()=>{
 const {w,c}=setup();w.zombies=[];c.fatigue=80;c.vitals.health=50;changeNeeds(c,60,'sleep','sleep',w);near(c.vitals.health,50+5/60);assert.ok(c.fatigue<80);
});
