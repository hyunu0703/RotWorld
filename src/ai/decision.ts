import { ITEMS, SURVIVAL, stockCount, type ItemId } from '../data/survival.ts';
import { CONFIG } from '../data/config.ts';
import { walkable, record, type Citizen, type World, type Point } from '../simulation/world.ts';
import { issueCommand, handlingMultiplier, type SurvivalCommand } from '../simulation/survival.ts';
import { AI_CONFIG, observe, riskAt } from './perception.ts';
import type { NeedGoal, Decision } from './types.ts';
type Candidate={command:SurvivalCommand;action:string;reason:string;goal:NeedGoal|null;score:number;distance:number;risk:number;key:string};
const values=(c:Citizen)=>({food:c.hunger,water:c.thirst,sleep:c.fatigue});
const targets={food:35,water:30,sleep:20};
const goalNames={food:'식량',water:'물',sleep:'수면'};
function preference(c:Citizen,axis:'risk'|'stockpiling'){return c.character?.personality[axis]??'normal';}
function reserve(c:Citizen){return preference(c,'stockpiling')==='high'?3:preference(c,'stockpiling')==='low'?1:2;}
function urgency(c:Citizen,goal:NeedGoal){return (c.brain.needs[goal]?100:20)+(goal==='water'?20:0)+values(c)[goal]*2;}
function riskPenalty(c:Citizen){return preference(c,'risk')==='high'?.7:preference(c,'risk')==='low'?2:1.3;}
function allowed(c:Citizen){
  const base=preference(c,'risk')==='high'?75:preference(c,'risk')==='low'?30:50;
  const limit=Math.max(base,riskAt(c.brain,c));
  return (p:Point)=>riskAt(c.brain,p)<=limit;
}
function decision(world:World,c:Citizen,action:string,reason:string,goal:NeedGoal|null,candidates:Candidate[]){
  const d:Decision={time:world.seconds,source:'ai',action,reason,goal,alternatives:candidates.slice(0,5).map(p=>({action:p.action,score:Number(p.score.toFixed(2)),distance:Number(p.distance.toFixed(2)),risk:Number(p.risk.toFixed(2))}))};
  c.brain.decision=d;c.brain.history.unshift(structuredClone(d));c.brain.history.length=Math.min(8,c.brain.history.length);
}
function dispatch(world:World,c:Citizen,options:Candidate[]){
  const ranked=options.filter(p=>(c.brain.retryAfter[p.key]??0)<=world.seconds).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  for(const candidate of ranked){
    const oldGoal=c.brain.goal;c.brain.goal=candidate.goal;
    const error=issueCommand(world,c.id,candidate.command,{source:'ai',allowed:allowed(c)});
    if(error){c.brain.goal=oldGoal;c.brain.retryAfter[candidate.key]=world.seconds+AI_CONFIG.retrySeconds;continue;}
    c.reason=candidate.reason;decision(world,c,candidate.action,candidate.reason,candidate.goal,ranked);return true;
  }
  return false;
}
function exploration(world:World,c:Citizen):Candidate[]{
  const brain=c.brain,candidates:Candidate[]=[];
  for(const p of Object.values(brain.places))if(p.stock===null){
    const distance=Math.hypot(p.x-c.x,p.y-c.y),risk=riskAt(brain,p);
    candidates.push({command:{kind:'move',buildingId:p.id},goal:null,key:`inspect:${p.id}`,action:`${p.name} 입구 확인`,reason:`${p.name}의 입구를 보았지만 재고·수면 조건은 아직 모릅니다. 직접 입구에서 확인합니다.`,score:35-distance*.5-risk*riskPenalty(c),distance,risk});
  }
  for(let y=4;y<CONFIG.height-2;y+=AI_CONFIG.explorationStep)for(let x=4;x<CONFIG.width-2;x+=AI_CONFIG.explorationStep){
    const key=`${x},${y}`,point={x:x+.5,y:y+.5};
    if(Math.hypot(c.x-point.x,c.y-point.y)<2){brain.explored[key]=true;continue;}
    if(brain.explored[key]||!walkable({x,y},world.buildings))continue;
    const distance=Math.hypot(point.x-c.x,point.y-c.y),risk=riskAt(brain,point);
    candidates.push({command:{kind:'explore',point},goal:null,key:`explore:${key}`,action:'미관찰 구역 탐색',reason:'확인하지 않은 구역으로 이동해 물자 장소와 거점을 직접 관찰합니다. 지도상의 실제 재고를 미리 알지 못합니다.',score:20-distance*.5-risk*riskPenalty(c)+(c.id%3)*.001,distance,risk});
  }
  return candidates;
}
function escape(world:World,c:Citizen){
  const choices:Candidate[]=[];
  for(const dx of [-8,-4,0,4,8])for(const dy of [-8,-4,0,4,8]){
    if(!dx&&!dy)continue;const point={x:Math.floor(c.x)+dx+.5,y:Math.floor(c.y)+dy+.5};
    if(!walkable({x:Math.floor(point.x),y:Math.floor(point.y)},world.buildings))continue;
    const risk=riskAt(c.brain,point),distance=Math.hypot(dx,dy);if(risk>=c.brain.risk-1)continue;
    choices.push({command:{kind:'explore',point},action:'인지한 위험에서 이탈',reason:`직접 관찰하거나 기억한 위험 때문에 현재 위험도 ${c.brain.risk.toFixed(0)}인 위치를 벗어납니다. 위험이 낮은 이동 후보를 비교했습니다.`,goal:null,key:`escape:${point.x},${point.y}`,score:500-risk*5-distance,distance,risk});
  }
  return dispatch(world,c,choices);
}
function needsCandidates(world:World,c:Citizen):Candidate[]{
  const options:Candidate[]=[],brain=c.brain,v=values(c),foodCount=c.supplies.snack+c.supplies.meal,buffer=reserve(c);
  for(const goal of ['water','food','sleep'] as const){
    const active=brain.needs[goal],preparing=v[goal]>=40;
    if(!active&&!preparing)continue;
    if(goal!=='sleep'){
      const items=goal==='water'?ITEMS.filter(i=>i.id==='water'):ITEMS.filter(i=>i.id!=='water');
      for(const item of items)if(active&&c.supplies[item.id]>0){
        const usefulness=Math.min(v[goal]-targets[goal],item.hunger||item.thirst);
        options.push({command:{kind:'consume',item:item.id},action:`소지한 ${item.name} 섭취`,reason:`${goalNames[goal]} 해결을 시작한 상태이며 현재 ${v[goal].toFixed(1)}, 목표 ${targets[goal]}입니다. 가진 ${item.name} ${c.supplies[item.id]}회분을 먼저 사용하면 이동 없이 욕구를 낮출 수 있습니다.`,goal,key:`use:${item.id}`,score:urgency(c,goal)+30+usefulness*.2-item.useSeconds*.2,distance:0,risk:brain.risk});
      }
      const carried=goal==='water'?c.supplies.water:foodCount;
      if(!active&&carried>=buffer)continue;
      for(const p of Object.values(brain.places))for(const item of items)if(p.stock&&p.stock[item.id]>0){
        const distance=Math.hypot(p.x-c.x,p.y-c.y),risk=riskAt(brain,p),base=urgency(c,goal);
        if(stockCount(c.supplies)>=SURVIVAL.capacity){
          const extra=ITEMS.find(i=>c.supplies[i.id]>(i.id==='water'?1:0)&&!items.some(w=>w.id===i.id));
          if(extra)options.push({command:{kind:'deposit',buildingId:p.id,item:extra.id},action:`${extra.name} 보관 후 소지 공간 확보`,reason:`${goalNames[goal]}이 필요하지만 소지 한도에 도달했습니다. 보유한 다른 물자를 1회분 보관해 공간을 확보합니다.`,goal,key:`deposit:${p.id}:${extra.id}`,score:base-distance*.4-risk*riskPenalty(c),distance,risk});
          continue;
        }
        options.push({command:{kind:'take',buildingId:p.id,item:item.id},action:`${p.name}에서 ${item.name} 확보`,reason:`${active?`${goalNames[goal]} 해결 중`:`${goalNames[goal]} 부족에 대비 중`}: 현재 ${v[goal].toFixed(1)}, 보유 ${carried}회분입니다. ${p.inspectedAt?.toFixed(1)}초에 직접 확인한 ${p.name}에 ${item.name} ${p.stock[item.id]}회분이 남아 있다고 기억합니다. 거리 ${distance.toFixed(1)}타일, 알려진 위험 ${risk.toFixed(0)}, 비축 목표 ${buffer}회분을 비교했습니다.`,goal,key:`take:${p.id}:${item.id}`,score:base-distance/CONFIG.walkTilesPerGameSecond*.18-SURVIVAL.handlingSeconds*handlingMultiplier(c)*.2-risk*riskPenalty(c),distance,risk});
      }
    }else if(active){
      for(const p of Object.values(brain.places))if(p.sleepSpot){
        const distance=Math.hypot(p.x-c.x,p.y-c.y),risk=riskAt(brain,p);
        options.push({command:{kind:'sleep',buildingId:p.id},action:`${p.name}에서 수면`,reason:`피로 ${c.fatigue.toFixed(1)}로 수면이 필요합니다. 직접 확인한 거점 ${p.name}의 거리 ${distance.toFixed(1)}타일과 알려진 위험 ${risk.toFixed(0)}을 비교했습니다. 피로 20까지 회복합니다.`,goal,key:`sleep:${p.id}`,score:urgency(c,goal)-distance/CONFIG.walkTilesPerGameSecond*.18-risk*riskPenalty(c),distance,risk});
      }
    }
  }
  return options;
}
export function think(world:World,c:Citizen){
  const brain=c.brain;if(!brain.enabled)return;
  const v=values(c);for(const goal of ['food','water','sleep'] as const){if(v[goal]>=60)brain.needs[goal]=true;else if(v[goal]<=targets[goal])brain.needs[goal]=false;}
  const changed=brain.plannedRevision!==brain.revision;brain.plannedRevision=brain.revision;brain.nextThink=world.seconds+AI_CONFIG.thinkSeconds;
  // 위험은 세계 전체 정보가 아니라 이 인간의 관찰·기억에서 계산한다.
  if(brain.risk>=45){
    if(c.activity.kind==='explore'&&brain.decision?.action==='인지한 위험에서 이탈'&&!changed)return;
    if(escape(world,c))return;
    brain.goal=null;
    if(brain.decision?.action!=='위험 경로 대기'){
      const reason='인지한 위험이 있지만 현재 통행 가능한 이탈 경로를 찾지 못했습니다. 섭취·수면을 시작하지 않고 경로를 다시 확인합니다.';
      issueCommand(world,c.id,{kind:'stop'},{source:'ai'});c.reason=reason;decision(world,c,'위험 경로 대기',reason,null,[]);
    }
    return;
  }
  const a=c.activity;
  if(a.kind==='sleep'&&c.fatigue>20&&c.hunger<80&&c.thirst<80)return;
  if(a.kind==='consume'||a.kind==='handling')return;
  if(a.kind==='travel'){
    const memory=brain.places[a.interaction.buildingId];
    const empty=a.interaction.kind==='take'&&memory?.stock&&memory.stock[a.interaction.item]===0;
    const noBed=a.interaction.kind==='sleep'&&memory?.sleepSpot===false;
    const current=brain.goal?v[brain.goal]:0,emergency=Math.max(c.hunger,c.thirst)>=90&&current<80;
    if(!empty&&!noBed&&!emergency)return;
  }
  const options=needsCandidates(world,c);
  if(options.length&&dispatch(world,c,options))return;
  if(a.kind==='explore'&&!changed)return;
  if(a.kind==='travel'&&a.interaction.kind==='move'&&!changed)return;
  if(dispatch(world,c,exploration(world,c)))return;
  const action=brain.needs.sleep?'쉴 곳을 찾을 때까지 휴식':'관찰하며 대기',reason=brain.needs.sleep?'기억하는 수면 거점까지 갈 수 없습니다. 피로 증가를 멈추며 다음 관찰을 기다립니다. 휴식으로 피로가 회복되지는 않습니다.':'기억한 물자·미관찰 구역으로 갈 수 없거나 지금 해결할 욕구가 없습니다. 확인하지 않은 재고를 아는 것처럼 행동하지 않고 기다립니다.';
  const kind=brain.needs.sleep?'rest':'stop';
  brain.goal=null;
  if(brain.decision?.action!==action){issueCommand(world,c.id,{kind},{source:'ai'});c.reason=reason;decision(world,c,action,reason,null,options);}
  brain.nextThink=world.seconds+AI_CONFIG.idleSeconds;
}
export function updateAI(world:World,c:Citizen){
  if(world.seconds>=c.brain.nextSense)observe(world,c);
  const urgent=c.hunger>=60&&!c.brain.needs.food||c.thirst>=60&&!c.brain.needs.water||c.fatigue>=60&&!c.brain.needs.sleep;
  if(c.brain.enabled&&(world.seconds>=c.brain.nextThink||urgent||c.brain.revision!==c.brain.plannedRevision||c.activity.kind==='idle'&&c.brain.decision?.goal))think(world,c);
}
export function setAutonomy(world:World,id:number,enabled:boolean):string{
  const c=world.citizens.find(c=>c.id===id);if(!world.active||!c)return '인간을 선택해 주세요.';
  c.brain.enabled=enabled;c.brain.goal=null;c.brain.needs={food:false,water:false,sleep:false};c.brain.nextThink=world.seconds;
  c.path=[];c.wait=0;c.activity={kind:'idle'};c.action=enabled?'자율 생존 시작':'직접 지시 대기';c.actionSource=enabled?'ai':'player';
  c.reason=enabled?'이 인간이 직접 관찰한 사실로 다음 행동을 판단합니다.':'플레이어가 자율 행동을 중단했습니다. 다음 지시를 기다립니다.';
  const d:Decision={time:world.seconds,source:'player',action:c.action,reason:c.reason,goal:null,alternatives:[]};
  c.brain.decision=d;c.brain.history.unshift(structuredClone(d));c.brain.history.length=Math.min(8,c.brain.history.length);
  record(world,`${c.name}: ${c.action}`);return '';
}
