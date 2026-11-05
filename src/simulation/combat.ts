import type { Citizen,World,Point } from './world.ts';
import { findPath,walkable,record } from './world.ts';
import { canSee,riskAt } from '../ai/perception.ts';
import { makeZombie,random,type Zombie } from './zombies.ts';
import { emitNoise } from './noise.ts';
import { updateCondition } from './condition.ts';
export interface Strike {target:number;move:'attack'|'push';due:number;damage:number;range:number;noise:'punch'|'push'|'pipe'}
export interface Fighter {pending:Strike|null;ready:number;stunned:number;equipped:boolean;wounds:Wound[];nextWound:number;infectedAt:number|null;diedAt:number|null;converted:boolean;deathReason:string;healthRate:number;suspicions:Record<number,{duration:number;last:number;suspected:boolean}>;nextDecision:number;retreat:boolean}
export interface Wound {id:number;kind:'normal'|'bite';bleeding:boolean;healing:number}
export function createFighter():Fighter{return {pending:null,ready:0,stunned:0,equipped:false,wounds:[],nextWound:0,infectedAt:null,diedAt:null,converted:false,deathReason:'',healthRate:0,suspicions:{},nextDecision:0,retreat:false};}
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function alive(c:Citizen){return !c.vitals.dead&&!c.fighter.converted;}
export function livingZombies(w:World){return w.zombies.filter(z=>!z.dead);}
export function symptoms(c:Citizen,time:number){return c.fighter.infectedAt!==null&&time>=c.fighter.infectedAt+1800;}
export function combatChances(c:Citizen){const stats=c.character?.stats,calm=1-((stats?.composure??5)-5)*.08;let surrounded=false;
 const near=c.threat.visible.map(id=>c.threat.memories[id]).filter(m=>m&&dist(c,m)<=6);
 for(const a of near)for(const b of near){const ax=a.x-c.x,ay=a.y-c.y,bx=b.x-c.x,by=b.y-c.y,den=Math.hypot(ax,ay)*Math.hypot(bx,by);if(a.id!==b.id&&den&&(ax*bx+ay*by)/den<=-.5)surrounded=true;}
 return {hit:clamp(.8-(c.fear>=80?.2:c.fear>=60?.1:0)*calm,.1,.95),dodge:clamp(.2+((stats?.agility??5)-5)*.01-(c.fatigue>=80?.05:0)-(surrounded?.1:0),.05,.6)};
}
export function cancelStrike(c:Citizen){c.fighter.pending=null;}
function control(w:World,c:Citizen,action:string,reason:string,source:'ai'|'player'){
 c.action=action;c.reason=reason;c.actionSource=source;
 if(source==='player'){c.brain.enabled=false;c.threat.fleeing=false;c.fighter.retreat=false;}
 const d={time:w.seconds,source,action,reason,goal:null,alternatives:[]};c.brain.decision=d;c.brain.history.unshift(d);c.brain.history.length=Math.min(8,c.brain.history.length);record(w,c.name+': '+action);
}
export type CombatCommand={kind:'attack'|'push';target:number}|{kind:'equip';equipped:boolean}|{kind:'bandage';wound:number};
export function commandCombat(w:World,id:number,cmd:CombatCommand,source:'ai'|'player'='player'):string{
 const c=w.citizens.find(c=>c.id===id);if(!w.active||!c||!alive(c))return '살아 있는 인간을 선택하세요.';
 if(cmd.kind==='equip'){
  if(cmd.equipped&&c.supplies.pipe<1)return '쇠파이프가 없습니다.';
  if(c.activity.kind==='combat'||c.fighter.pending)return '공격을 중단한 뒤 장착을 바꾸세요.';
  c.fighter.equipped=cmd.equipped;control(w,c,cmd.equipped?'쇠파이프 장착':'쇠파이프 해제','장착은 소지 한도와 물품 수량을 바꾸지 않습니다.',source);return '';
 }
 if(cmd.kind==='bandage'){
  const wound=c.fighter.wounds.find(x=>x.id===cmd.wound);if(!wound?.bleeding)return '출혈 중인 상처를 선택하세요.';
  if(c.supplies.bandage<1)return '붕대가 없습니다.';
  cancelStrike(c);c.path=[];c.activity={kind:'bandage',wound:cmd.wound,remaining:30};control(w,c,'붕대로 지혈 중','완료 시 붕대 하나를 소비합니다. 물린 상처를 지혈해도 감염은 남습니다.',source);return '';
 }
 const z=w.zombies.find(z=>z.id===cmd.target&&!z.dead);if(!z)return '살아 있는 좀비를 선택하세요.';
 const cost=cmd.kind==='push'?6:c.fighter.equipped?8:6;
 if(c.vitals.stamina<cost)return '힘이 부족해 공격할 수 없습니다. 휴식이 필요합니다.';
 if(c.activity.kind==='combat'&&c.activity.target===cmd.target&&c.activity.move===cmd.kind)return '';
 const path=findPath(c,z,w.buildings);if(path===null)return '대상까지 통행할 수 없습니다.';
 cancelStrike(c);c.path=path;c.activity={kind:'combat',target:cmd.target,move:cmd.kind};control(w,c,cmd.kind==='push'?'좀비 밀치기':'좀비 공격','준비 후 사거리·가림·명중을 확인합니다. 취소해도 사용한 힘과 대기시간은 돌아오지 않습니다.',source);if(w.stageSeven)beginHumanStrike(w,c);return '';
}
export function beginHumanStrike(w:World,c:Citizen){
 if(!alive(c)||c.activity.kind!=='combat'||c.fighter.pending||w.seconds+1e-8<c.fighter.ready||w.seconds<c.fighter.stunned)return;
 const a=c.activity,z=w.zombies.find(z=>z.id===a.target&&!z.dead);if(!z){c.activity={kind:'idle'};c.path=[];c.action='대상이 없어 공격 종료';return;}
 const push=a.move==='push',pipe=!push&&c.fighter.equipped&&c.supplies.pipe>0,range=push?1:pipe?1.3:1,cost=pipe?8:6;
 if(dist(c,z)>range+1e-8||!canSee(w,c,z))return;
 c.path=[];if(c.vitals.stamina<cost){c.action='공격 불가 · 힘 부족';return;}
 c.vitals.stamina-=cost;c.vitals.pendingAlerts.push(...updateCondition(c));
 const strength=1+((c.character?.stats.strength??5)-5)*.05;
 c.fighter.pending={target:z.id,move:a.move,due:w.seconds+(push?2:3),damage:(pipe?20:10)*strength*(c.hunger>=80?.9:1),range,noise:push?'push':pipe?'pipe':'punch'};
 c.fighter.ready=w.seconds+(push?10:3+9*(1-((c.character?.stats.agility??5)-5)*.03));
}
export function die(w:World,c:Citizen,reason:string){
 if(c.vitals.dead)return;c.vitals.health=0;c.vitals.dead=true;c.fighter.diedAt=w.seconds;c.fighter.deathReason=reason;c.fighter.pending=null;c.path=[];c.activity={kind:'idle'};c.brain.enabled=false;c.action='사망';c.reason=reason;c.vitals.pendingAlerts.push(...updateCondition(c));record(w,c.name+': 사망 · '+reason);
 if(c.id===w.mainCharacterId){w.active=false;w.endReason='메인 캐릭터 사망 · '+reason;}
}
export function woundHuman(w:World,c:Citizen,damage:number,bite:boolean,bleeding:boolean){
 if(!alive(c))return;c.vitals.health=Math.max(0,c.vitals.health-damage);c.fighter.wounds.push({id:c.fighter.nextWound++,kind:bite?'bite':'normal',bleeding,healing:0});
 if(bite&&c.fighter.infectedAt===null){c.fighter.infectedAt=w.seconds;record(w,c.name+': 물림으로 감염');}
 c.fear=Math.min(100,c.fear+15);c.threat.fearReason='실제 피격 · 공포 +15';c.brain.nextThink=0;
 if(c.activity.kind==='sleep'){c.activity={kind:'idle'};c.action='피격으로 각성';}
 record(w,c.name+': '+(bite?'물린 상처':'일반 상처')+(bleeding?' · 출혈 시작':''));
 if(c.vitals.health<=0)die(w,c,bite?'좀비 물림':'좀비 타격');else c.vitals.pendingAlerts.push(...updateCondition(c));
}
function pushZombie(w:World,c:Citizen,z:Zombie){
 const d=dist(c,z);if(!d)return false;const force=1+((c.character?.stats.strength??5)-5)*.05;
 const end={x:z.x+(z.x-c.x)/d*force,y:z.y+(z.y-c.y)/d*force};
 for(let i=1;i<=Math.ceil(force*10);i++){const t=i/Math.ceil(force*10),p={x:z.x+(end.x-z.x)*t,y:z.y+(end.y-z.y)*t};if(!walkable({x:Math.floor(p.x),y:Math.floor(p.y)},w.buildings)||w.citizens.some(h=>alive(h)&&dist(h,p)<.75)||livingZombies(w).some(o=>o!==z&&dist(o,p)<.75))return false;}
 z.x=end.x;z.y=end.y;z.path=[];z.strike=null;z.stunned=w.seconds+3;z.ready=Math.max(z.ready,z.stunned);return true;
}
// Collect all due strikes before applying any damage or push.
export function resolveStrikes(w:World){
 const hits:{c:Citizen;damage:number;bite:boolean;bleed:boolean}[]=[],zHits:{z:Zombie;damage:number}[]=[],pushes:{c:Citizen;z:Zombie}[]=[];
 for(const c of w.citizens){const s=c.fighter.pending;if(!s||s.due>w.seconds+1e-8)continue;c.fighter.pending=null;
  const z=w.zombies.find(z=>z.id===s.target&&!z.dead);if(!alive(c)||!z||dist(c,z)>s.range+1e-8||!canSee(w,c,z))continue;
  emitNoise(w,c,s.noise);const success=random(w)<(s.move==='push'?.8:combatChances(c).hit);
  if(success){if(s.move==='push')pushes.push({c,z});else zHits.push({z,damage:s.damage});}else record(w,c.name+': 공격 빗나감');
 }
 for(const z of w.zombies){const s=z.strike;if(!s||s.due>w.seconds+1e-8)continue;z.strike=null;
  const c=w.citizens.find(c=>c.id===s.target&&alive(c));if(z.dead||!c||dist(c,z)>.8+1e-8||!canSee(w,z,c))continue;
  if(random(w)>=.6){record(w,'좀비 공격 빗나감');continue;}if(random(w)<combatChances(c).dodge){record(w,c.name+': 좀비 공격 회피');continue;}
  const bite=random(w)<.1;hits.push({c,damage:bite?18:8,bite,bleed:bite||random(w)<.2});
 }
 for(const h of zHits){h.z.health=Math.max(0,h.z.health-h.damage);if(h.z.health<=0){h.z.dead=true;h.z.path=[];h.z.strike=null;h.z.contact=[];h.z.reason='제압됨 · 이동·공격 중단';record(w,'좀비 '+(h.z.id+1)+' 제압');}}
 for(const h of hits)woundHuman(w,h.c,h.damage,h.bite,h.bleed);
 for(const p of pushes)if(!p.z.dead){const moved=pushZombie(w,p.c,p.z);record(w,p.c.name+': '+(moved?'밀치기 성공':'밀 공간 없음'));}
}
export function beginZombieStrikes(w:World){for(const z of w.zombies){
 if(z.dead||z.strike||w.seconds+1e-8<z.ready||w.seconds<z.stunned)continue;
 const c=w.citizens.find(c=>alive(c)&&dist(c,z)<=.8+1e-8&&canSee(w,z,c));if(!c)continue;
 z.strike={target:c.id,due:w.seconds+4};z.ready=w.seconds+15;z.path=[];z.reason='공격 준비 · 가까운 인간';
}}
export function medicalRates(c:Citizen,mode:string,fatigue=c.fatigue){const bleeding=c.fighter.wounds.filter(x=>x.bleeding).length;
 const tracked=c.threat.visible.some(id=>!!c.threat.memories[id]);
 const eligible=!bleeding&&c.hunger<60&&c.thirst<60&&fatigue<80&&!tracked&&c.activity.kind!=='combat';
 const factor=c.character?.traits.includes('fastHealing')?1.25:c.character?.traits.includes('slowHealing')?.8:1;
 return {eligible,factor,bleed:Math.min(2,bleeding*.5)/60,hunger:c.hunger>=100?2/3600:0,thirst:c.thirst>=100?6/3600:0,heal:eligible&&(mode==='rest'||mode==='sleep')?5*factor/3600:0};
}
export function advanceMedical(w:World,c:Citizen,seconds:number,mode:string,fatigue=c.fatigue){
 if(!w.stageSeven||!alive(c))return;const r=medicalRates(c,mode,fatigue);c.fighter.healthRate=r.heal-r.bleed-r.hunger-r.thirst;
 if(r.eligible)for(const wound of c.fighter.wounds)wound.healing+=seconds*r.factor;
 c.fighter.wounds=c.fighter.wounds.filter(x=>x.healing<21600);
 c.vitals.health=clamp(c.vitals.health+c.fighter.healthRate*seconds,0,c.vitals.maxHealth);
 if(c.vitals.health<=1e-10)die(w,c,r.bleed?'출혈':r.thirst?'탈수':'굶주림');
}
export function advanceInfection(w:World){for(const c of w.citizens){
 const f=c.fighter;if(f.infectedAt===null||f.converted)continue;
 const due=f.diedAt===null?f.infectedAt+3600:Math.min(f.diedAt+1800,f.infectedAt+3600);
 if(w.seconds+1e-8<due)continue;
 f.converted=true;if(c.id===w.mainCharacterId){w.active=false;w.endReason='메인 캐릭터가 좀비로 변이하여 회차가 종료되었습니다.';return;}
 c.vitals.dead=true;c.vitals.health=0;c.path=[];c.brain.enabled=false;c.activity={kind:'idle'};f.pending=null;f.equipped=false;c.action='변이';c.reason='감염으로 좀비가 되었습니다. 소지품은 원래 인물에 보존됩니다.';updateCondition(c);
 const id=w.zombies.length,z=makeZombie(id,c);z.origin=c.id;w.zombies.push(z);record(w,c.name+': 좀비로 변이');
}}
export function observeSymptoms(w:World,c:Citizen){if(!alive(c)||c.activity.kind==='sleep')return;
 const sight=8*(1+((c.character?.stats.perception??5)-5)*.04);
 for(const other of w.citizens){if(other===c)continue;const old=c.fighter.suspicions[other.id];
  if(alive(other)&&symptoms(other,w.seconds)&&dist(c,other)<=sight&&canSee(w,c,other)){
   const m=old??{duration:0,last:w.seconds,suspected:false};m.duration+=w.seconds-m.last<=.51?w.seconds-m.last:0;m.last=w.seconds;
   if(m.duration>=5-1e-8&&!m.suspected){m.suspected=true;record(w,c.name+': '+other.name+'의 이상 증상 의심');}c.fighter.suspicions[other.id]=m;
  }else if(old&&!old.suspected){old.duration=0;old.last=w.seconds;}
 }
}
export function safeRetreat(w:World,c:Citizen):Point[]|null{
 const memories=Object.values(c.threat.memories);
 for(const p of Object.values(c.threat.observed)){
  if(riskAt(c.brain,p)>=20)continue;const exits=[[1,0],[-1,0],[0,1],[0,-1]].filter(([x,y])=>walkable({x:Math.floor(p.x)+x,y:Math.floor(p.y)+y},w.buildings)).length;if(exits<2)continue;
  const path=findPath(c,p,w.buildings,q=>!!c.threat.observed[Math.floor(q.x)+','+Math.floor(q.y)]&&riskAt(c.brain,q)<=c.brain.risk&&memories.every(m=>dist(q,m)>=1.5));
  if(path&&path.length>=4&&path.length<=12)return path;
 }return null;
}
export function combatAI(w:World,c:Citizen):boolean{
 if(!w.stageSeven||!c.brain.enabled||!alive(c))return false;
 const visible=c.threat.visible.map(id=>c.threat.memories[id]).filter(Boolean),close=visible.filter(m=>dist(c,m)<=6),f=c.fighter;
 if(c.activity.kind==='combat'){
  if(w.seconds<f.nextDecision)return true;f.nextDecision=w.seconds+1;
  const unsafe=c.vitals.health<=40||c.vitals.stamina<20||c.fear>=80||visible.length>1||f.wounds.some(x=>x.bleeding)||(c.character?.personality.aggression==='normal'&&!safeRetreat(w,c));
  if(unsafe){cancelStrike(c);c.activity={kind:'idle'};c.path=[];f.retreat=true;c.threat.fleeing=true;c.threat.nextPlan=0;control(w,c,'전투 중단 · 도주','신체·힘·공포·추가 위협·출혈·퇴로를 확인해 전투를 중단합니다.','ai');return false;}
  return true;
 }
 if(!close.length){f.retreat=false;if(c.activity.kind==='bandage')return true;
  if(f.wounds.some(x=>x.bleeding)&&c.supplies.bandage>0){commandCombat(w,c.id,{kind:'bandage',wound:f.wounds.find(x=>x.bleeding)!.id},'ai');return true;}
  if(c.supplies.pipe&& !f.equipped)f.equipped=true;
  return false;
 }
 if(f.retreat)return false;
 const aggression=c.character?.personality.aggression??'normal',common=visible.length===1&&!f.wounds.some(x=>x.bleeding)&&c.vitals.health>60&&c.vitals.stamina>=40&&c.fear<60;
 if(common&&(aggression==='high'||aggression==='normal'&&f.equipped&&safeRetreat(w,c))){commandCombat(w,c.id,{kind:'attack',target:close[0].id},'ai');return true;}
 if(aggression==='low'&&close.some(m=>dist(c,m)<=1)&&!safeRetreat(w,c)&&c.vitals.stamina>=6){commandCombat(w,c.id,{kind:'push',target:close[0].id},'ai');return true;}
 return false;
}
