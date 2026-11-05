import { combatAI } from '../simulation/combat.ts';
import { canSee,riskAt } from './perception.ts';
import { findPath,walkable,record,type World,type Citizen,type Point } from '../simulation/world.ts';
import { heardDistance,tileKey } from '../simulation/noise.ts';
import { THREAT } from '../data/threat.ts';
export interface ThreatMemory extends Point {id:number;seenAt:number;distance:number;approaching:boolean}
export interface HumanThreat {
  memories:Record<number,ThreatMemory>;visible:number[];observed:Record<string,Point>;discovered:Record<number,number>;
  fleeing:boolean;clearSince:number|null;nextPlan:number;lastThreat:number;fearReason:string;
  warning:string;interrupted:string;contact:boolean;processedNoise:number;nextHide:number;
}
export function createThreat():HumanThreat{return {memories:{},visible:[],observed:{},discovered:{},fleeing:false,clearSince:null,nextPlan:0,lastThreat:0,fearReason:'위협 없는 상태 회복 대기',warning:'',interrupted:'',contact:false,processedNoise:-1,nextHide:0};}
export function observeThreats(world:World,c:Citizen){
  const t=c.threat,sight=8*(1+((c.character?.stats.perception??5)-5)*.04),oldVisible=t.visible.join(',');t.visible=[];
  for(const z of world.zombies){
    if(z.dead)continue;
    const distance=Math.hypot(z.x-c.x,z.y-c.y);
    if(distance>sight||!canSee(world,c,z))continue;
    const previous=t.memories[z.id];
    if(t.discovered[z.id]===undefined||world.seconds-t.discovered[z.id]>=THREAT.rediscovery){c.fear=Math.min(100,c.fear+10);t.fearReason='새로운 좀비 위협 발견 +10';record(world,`${c.name}: 새로운 좀비 위협 발견 · 공포 증가`);}
    t.discovered[z.id]=world.seconds;
    const approaching=!!previous&&world.seconds>previous.seenAt&&Math.hypot(previous.x-c.x,previous.y-c.y)-distance>.005;
    t.memories[z.id]={id:z.id,x:z.x,y:z.y,seenAt:world.seconds,distance,approaching};t.visible.push(z.id);
  }
  // Only personally visible walking tiles can become cover/escape candidates.
  for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
    const p={x:Math.floor(c.x)+dx+.5,y:Math.floor(c.y)+dy+.5};
    if(Math.hypot(p.x-c.x,p.y-c.y)<=sight&&walkable({x:Math.floor(p.x),y:Math.floor(p.y)},world.buildings)&&canSee(world,c,p))t.observed[tileKey(p)]=p;
  }
  for(const [id,m] of Object.entries(t.memories)){
    const age=world.seconds-m.seenAt;
    if(age>=THREAT.strongMemory+THREAT.cautionMemory){delete t.memories[Number(id)];delete c.brain.dangers[`zombie:${id}`];continue;}
    c.brain.dangers[`zombie:${id}`]={id:`zombie:${id}`,label:t.visible.includes(m.id)?'직접 본 좀비':'좀비 마지막 목격 기억',x:m.x,y:m.y,radius:6,severity:age<=THREAT.strongMemory?80:12,seenAt:m.seenAt};
  }
  c.brain.risk=riskAt(c.brain,c);
  if(oldVisible!==t.visible.join(',')){c.brain.revision++;t.nextPlan=0;}
  t.warning=t.visible.length?'직접 관찰한 좀비 위협 · 직접 지시 중에는 자동 도주하지 않습니다.':Object.keys(t.memories).length?'마지막 목격 위치를 경계 중 · 실제 좀비 위치와 다를 수 있습니다.':'인지한 좀비 없음 · 안전 보장이 아닙니다.';
}
export function sleepThreatNearby(c:Citizen,p:Point=c){return Object.values(c.threat.memories).some(m=>Math.hypot(m.x-p.x,m.y-p.y)<=8);}
function logDecision(world:World,c:Citizen,action:string,reason:string,alternatives:{action:string;score:number;distance:number;risk:number}[]=[]){
  c.action=action;c.reason=reason;c.actionSource='ai';const d={time:world.seconds,source:'ai' as const,action,reason,goal:null,alternatives};
  c.brain.decision=d;c.brain.history.unshift(structuredClone(d));c.brain.history.length=Math.min(8,c.brain.history.length);record(world,`${c.name}: ${action}`);
}
export function fearRiskMultiplier(fear:number){return fear>=80?2:fear>=60?1.5:fear>=40?1.25:1;}
export function respondToThreat(world:World,c:Citizen):boolean{
  if(combatAI(world,c))return true;
  if(!world.stageSix)return false;
  const t=c.threat,visible=t.visible.map(id=>t.memories[id]),close=visible.filter(m=>Math.hypot(m.x-c.x,m.y-c.y)<=6);
  if(!c.brain.enabled)return false;
  if(close.length&&!t.fleeing){t.fleeing=true;t.clearSince=null;t.nextPlan=0;t.interrupted=c.action;c.path=[];c.activity={kind:'idle'};}
  if(!t.fleeing)return false;
  if(!visible.length&&c.brain.risk<THREAT.lowRisk){
    t.clearSince??=world.seconds;
    if(world.seconds-t.clearSince>=THREAT.clearSeconds){t.fleeing=false;c.path=[];c.activity={kind:'idle'};c.brain.nextThink=0;logDecision(world,c,'위험 대응 종료','보이는 좀비 없음·인지 위험 20 미만이 10초 지속되어 생존 욕구를 다시 판단합니다.');return false;}
  }else t.clearSince=null;
  if(world.seconds<t.nextPlan)return true;t.nextPlan=world.seconds+THREAT.fleeThink;
  const memories=Object.values(t.memories).filter(m=>world.seconds-m.seenAt<=30);
  if(!visible.length&&!sleepThreatNearby(c)&&memories.length&&memories.every(m=>!canSee(world,m,c))){
    if(c.activity.kind!=='hide'){c.path=[];c.activity={kind:'hide'};t.nextHide=world.seconds+THREAT.hideThink;logDecision(world,c,'건물 뒤 은신',`마지막 목격 위치와 시야가 끊겼고 인지한 8타일 이내 위협이 없습니다. 조용히 대기합니다. 중단 행동: ${t.interrupted}`);}
    if(world.seconds<t.nextHide)return true;t.nextHide=world.seconds+THREAT.hideThink;
    // no invisibility: the next observation can immediately resume flight
    return true;
  }
  const candidates:{point:Point;path:Point[];score:number;distance:number;risk:number;cover:number;exits:number}[]=[];
  const currentDistance=memories.length?Math.min(...memories.map(m=>Math.hypot(m.x-c.x,m.y-c.y))):0;
  for(const point of Object.values(t.observed)){
    const distance=Math.hypot(point.x-c.x,point.y-c.y);if(distance<3||distance>12)continue;
    const risk=riskAt(c.brain,point),nearest=memories.length?Math.min(...memories.map(m=>Math.hypot(m.x-point.x,m.y-point.y))):20;
    if(risk>=c.brain.risk-1&&nearest<=currentDistance+1)continue;
    const exits=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>walkable({x:Math.floor(point.x)+dx,y:Math.floor(point.y)+dy},world.buildings)).length;if(exits<2)continue;
    const cover=memories.filter(m=>!canSee(world,m,point)).length;
    const estimate=nearest*4-risk*fearRiskMultiplier(c.fear)+cover*12+exits*2-distance;
    candidates.push({point,path:[],score:estimate,distance,risk,cover,exits});
  }
  candidates.sort((a,b)=>b.score-a.score||a.point.x-b.point.x||a.point.y-b.point.y);
  const ranked:typeof candidates=[];
  for(const option of candidates.slice(0,16)){
    const path=findPath(c,option.point,world.buildings,p=>riskAt(c.brain,p)<=Math.max(50,c.brain.risk));if(!path?.length)continue;
    const pathRisk=path.reduce((sum,p)=>sum+riskAt(c.brain,p),0)/path.length;
    option.path=path;option.score-=pathRisk*fearRiskMultiplier(c.fear);ranked.push(option);
  }
  ranked.sort((a,b)=>b.score-a.score);const best=ranked[0];
  if(best){
    c.path=best.path;c.activity={kind:'explore',point:{...best.point}};
    logDecision(world,c,'관찰한 경로로 도주',`개인 위협 기억·경로 위험·시야 차단 ${best.cover}곳·출구 ${best.exits}방향을 비교했습니다. 걷기로 이탈합니다. 중단 행동: ${t.interrupted}`,ranked.slice(0,5).map(o=>({action:`도주 (${o.point.x}, ${o.point.y})`,score:o.score,distance:o.distance,risk:o.risk})));
  }else {
    c.path=[];c.activity={kind:'idle'};
    if(c.action!=='이탈 경로 없음')logDecision(world,c,'이탈 경로 없음',`직접 관찰한 후보에서 통행 가능한 이탈 경로를 찾지 못했습니다. 1초마다 재탐색합니다. 중단 행동: ${t.interrupted}`);
  }
  return true;
}
export function advanceHumanThreat(world:World,c:Citizen,seconds:number){
  const t=c.threat;
  if(c.activity.kind==='sleep'){
    for(const n of world.noises)if(n.id>t.processedNoise&&world.seconds-n.time<10&&Math.hypot(n.x-c.x,n.y-c.y)<=4&&heardDistance(n,c)!==null){
      c.activity={kind:'idle'};c.path=[];c.action='소음으로 각성';c.reason='4타일 이내에서 들은 소음으로 깨어났습니다. 발생자의 신원·현재 위치는 모릅니다.';c.brain.nextSense=0;c.brain.nextThink=0;t.warning=c.reason;record(world,`${c.name}: 소음으로 각성`);break;
    }
  }
  t.processedNoise=world.nextNoise-1;
  const close=t.visible.map(id=>t.memories[id]).filter(m=>Math.hypot(m.x-c.x,m.y-c.y)<=6);
  let surrounded=false;
  for(const a of close)for(const b of close){
    const ax=a.x-c.x,ay=a.y-c.y,bx=b.x-c.x,by=b.y-c.y,den=Math.hypot(ax,ay)*Math.hypot(bx,by);
    if(a.id!==b.id&&den>0&&(ax*bx+ay*by)/den<=-.5)surrounded=true;
  }
  if(t.visible.length)t.lastThreat=world.seconds;
  if(surrounded){c.fear=Math.min(100,c.fear+6*seconds/60);t.fearReason='관찰한 좀비가 반대 방향에서 포위 · +6/분';}
  else if(close.some(m=>m.approaching)){c.fear=Math.min(100,c.fear+4*seconds/60);t.fearReason='관찰한 근거리 좀비가 접근 · +4/분';}
  else if(world.seconds-t.lastThreat>=300){c.fear=Math.max(0,c.fear-3*seconds/60);t.fearReason='위협 없는 상태 5분 경과 · −3/분';}
  else if(!t.visible.length)t.fearReason='위협 없는 상태 5분 회복 대기';
}
