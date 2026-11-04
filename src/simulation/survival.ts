import { contactFraction } from './contact.ts';
import { emitNoise,walkingNoise } from './noise.ts';
import { sleepThreatNearby } from '../ai/threat.ts';
import { ITEMS, SURVIVAL, stock, stockCount, type Stock, type ItemId, type Interaction, type Activity } from '../data/survival.ts';
import { CONFIG } from '../data/config.ts';
import { record, findPath, stepTour, chooseDestination, type Citizen, type World, type Building, type Point } from './world.ts';
import { advanceCondition, bodyMode, type BodyMode } from './condition.ts';
const cap=(value:number)=>Math.max(0,Math.min(100,value));
export function hasTrait(c:Citizen,id:string){return c.character?.traits.some(t=>t===id)??false;}
export function sleepRecovery(c:Citizen){return 10*(hasTrait(c,'lightSleeper')?1.25:hasTrait(c,'heavySleeper')?.8:1);}
export function needRates(c:Citizen,mode:'awake'|'rest'|'sleep'=c.activity.kind==='sleep'?'sleep':c.activity.kind==='rest'?'rest':'awake'){
  const hungerFactor=hasTrait(c,'smallEater')?.85:hasTrait(c,'bigEater')?1.2:1;
  return {hunger:(mode==='sleep'?2:4)*hungerFactor,thirst:mode==='sleep'?3:6,fatigue:mode==='sleep'?-sleepRecovery(c):mode==='rest'?0:4};
}
export function changeNeeds(c:Citizen,seconds:number,mode?:'awake'|'rest'|'sleep',body:BodyMode=mode==='sleep'?'sleep':mode==='rest'?'rest':bodyMode(c)){
  const r=needRates(c,mode);let remaining=seconds;
  // 회복 보정·최대치 경계에서 나눠 시간 분할에 따른 계산 차이를 막는다.
  while(remaining>1e-9){
    let duration=remaining;
    for(const key of ['hunger','thirst','fatigue'] as const)for(const boundary of [0,40,60,80,100]){
      const time=(boundary-c[key])/r[key]*3600;if(time>1e-7&&Number.isFinite(time))duration=Math.min(duration,time);
    }
    const intervalFatigue=r.fatigue<0&&(c.fatigue===60||c.fatigue===80)?c.fatigue-1e-8:c.fatigue;
    c.vitals.pendingAlerts.push(...advanceCondition(c,duration,body,intervalFatigue));
    for(const key of ['hunger','thirst','fatigue'] as const){
      c[key]=cap(c[key]+r[key]*duration/3600);
      for(const boundary of [0,40,60,80,100])if(Math.abs(c[key]-boundary)<1e-9)c[key]=boundary;
    }
    c.vitals.pendingAlerts.push(...advanceCondition(c,0,body));remaining-=duration;
  }
}
export function handlingEffects(c:Citizen){
  const thirst=c.thirst>=80?.15:0,fatigue=c.fatigue>=80?.25:c.fatigue>=60?.1:0;
  const calm=1-((c.character?.stats.composure??5)-5)*.08;
  const fear=(c.fear>=80?.25:c.fear>=60?.1:0)*calm;
  const total=thirst+fatigue+fear,capped=Math.min(.5,total),trait=hasTrait(c,'organized')?.8:hasTrait(c,'clumsy')?1.25:1;
  return {thirst,fatigue,fear,calm,total,capped,trait,multiplier:(1+capped)*trait};
}
export function handlingMultiplier(c:Citizen){return handlingEffects(c).multiplier;}
export function atBuilding(c:Citizen,b:Building){return Math.hypot(c.x-b.door.x-.5,c.y-b.door.y-.5)<=SURVIVAL.interactionDistance;}
function transferError(c:Citizen,b:Building,mode:'take'|'deposit',item:ItemId){
  if(mode==='take'&&b.stock[item]<1)return '해당 장소의 물자가 고갈되었습니다.';
  if(mode==='take'&&stockCount(c.supplies)>=SURVIVAL.capacity)return '소지 한도가 가득 찼습니다.';
  if(mode==='deposit'&&c.supplies[item]<1)return '보관할 물품을 가지고 있지 않습니다.';
  return '';
}
function idle(c:Citizen,reason:string){c.activity={kind:'idle'};c.path=[];c.wait=0;c.action='대기';c.reason=reason;}
function startInteraction(world:World,c:Citizen,intent:Interaction,source=c.actionSource):string {
  const prefix=source==='ai'?'자율 행동':'플레이어 지시';
  const b=world.buildings.find(b=>b.id===intent.buildingId);if(!b||!atBuilding(c,b))return '장소의 입구에 도착하지 못했습니다.';
  if(intent.kind==='move'){idle(c,`${prefix}: 지정한 목적지에 도착했습니다.`);return '';}
  if(intent.kind==='restAt'){
    if(!b.sleepSpot)return '이 장소에는 확인한 수면 거점이 없습니다.';
    c.activity={kind:'rest'};c.action=`${b.name} 거점에서 휴식`;c.reason=`${prefix}: 피로가 높아지기 전에 확인한 거점으로 복귀했습니다. 휴식은 피로 증가를 멈추며 수면을 대체하지 않습니다.`;return '';
  }
  if(intent.kind==='sleep'){
    if(!b.sleepSpot)return '이 장소에는 지정된 수면 거점이 없습니다.';
    if(source==='ai'&&world.stageSix&&sleepThreatNearby(c))return '인지한 8타일 이내 좀비 때문에 수면할 수 없습니다.';
    if(c.fatigue<=0)return '피로가 없어 더 수면할 필요가 없습니다.';
    c.threat.visible=[];c.threat.processedNoise=world.nextNoise-1;c.activity={kind:'sleep',buildingId:b.id};c.action=`${b.name} 거점에서 수면`;c.reason=`${prefix}: 확인한 수면 거점에서 피로를 회복합니다. 수면 중에는 보지 못하며 가까운 소음·접촉에 깨어납니다.`;
  }else {
    const error=transferError(c,b,intent.kind,intent.item);if(error)return error;
    const effects=handlingEffects(c);
    emitNoise(world,c,'handling');
    c.activity={kind:'handling',mode:intent.kind,buildingId:b.id,item:intent.item,remaining:SURVIVAL.handlingSeconds*effects.multiplier,effects};
    c.action=`${ITEMS.find(i=>i.id===intent.item)!.name} ${intent.kind==='take'?'획득':'보관'} 중`;
    c.reason=`${prefix}: 물품 취급 완료 시 장소와 소지품 사이에서 1회분을 이전합니다.`;
  }
  return '';
}
export type SurvivalCommand = Interaction|{kind:'consume';item:ItemId}|{kind:'rest'}|{kind:'stop'}|{kind:'tour'}|{kind:'explore';point:Point};
export function issueCommand(world:World,id:number,command:SurvivalCommand,options:{source?:'ai'|'player';allowed?:(p:Point)=>boolean}={}):string {
  const c=world.citizens.find(c=>c.id===id);if(!world.active||!c)return '진행 중인 인간을 선택해 주세요.';
  const source=options.source??'player',prefix=source==='ai'?'자율 행동':'플레이어 지시';
  if(command.kind==='consume'){
    const item=ITEMS.find(i=>i.id===command.item);if(!item)return '알 수 없는 물품입니다.';
    if(c.supplies[item.id]<1)return `${item.name}을 가지고 있지 않습니다.`;
    if((item.hunger&&c.hunger<=0)||(item.thirst&&c.thirst<=0))return '이미 해당 욕구가 해소되어 있습니다.';
    emitNoise(world,c,'consume');
    c.path=[];c.wait=0;c.activity={kind:'consume',item:item.id,remaining:item.useSeconds};c.action=item.id==='water'?'수분 섭취 중':`${item.name} 섭취 중`;
    c.reason=`${prefix}: 섭취가 완료되면 소지품 1회분을 소비하고 욕구가 감소합니다.`;
  }else if(command.kind==='rest'){
    c.path=[];c.wait=0;c.activity={kind:'rest'};c.action='앉아서 휴식';c.reason=`${prefix}: 피로가 더 쌓이지 않습니다. 피로를 줄이려면 지정 거점에서 수면해야 합니다.`;
  }else if(command.kind==='stop'){idle(c,`${prefix}: 행동을 중단했습니다. 진행 중인 물품은 완료 전이므로 소비·이전되지 않았습니다.`);}
  else if(command.kind==='tour'){
    c.activity={kind:'tour'};c.wait=0;chooseDestination(world,c);
  }else if(command.kind==='explore'){
    const path=findPath(c,command.point,world.buildings,options.allowed);if(!path)return '탐색 지점까지 갈 수 없습니다.';
    c.path=path;c.wait=0;c.activity={kind:'explore',point:{...command.point}};c.action='주변 구역 탐색';c.reason=`${prefix}: 선택한 구역을 직접 관찰하기 위해 이동합니다.`;
  }else {
    const b=world.buildings.find(b=>b.id===command.buildingId);if(!b)return '장소를 찾을 수 없습니다.';
    if((command.kind==='sleep'||command.kind==='restAt')&&(source==='player'||atBuilding(c,b))&&!b.sleepSpot)return '이 장소에는 지정된 수면 거점이 없습니다.';
    if((command.kind==='take'||command.kind==='deposit')){
      if(!ITEMS.some(i=>i.id===command.item))return '알 수 없는 물품입니다.';
      const error=source==='ai'&&!atBuilding(c,b)?(command.kind==='take'&&stockCount(c.supplies)>=SURVIVAL.capacity?'소지 한도가 가득 찼습니다.':''):transferError(c,b,command.kind,command.item);if(error)return error;
    }
    const path=findPath(c,b.door,world.buildings,options.allowed);if(!path)return '통행 가능한 경로가 없습니다.';
    if(atBuilding(c,b)){const error=startInteraction(world,c,command,source);if(error)return error;c.path=[];c.destination=b.id;}
    else{c.path=path;c.wait=0;c.destination=b.id;c.activity={kind:'travel',interaction:{...command}};c.action=`${b.name} 입구로 이동`;c.reason=`${prefix}: 목적지에 도착한 뒤 지정한 행동을 수행합니다.`;}
  }
  c.actionSource=source;
  if(source==='player'){
    c.brain.enabled=false;c.brain.goal=null;c.threat.fleeing=false;
    const d={time:world.seconds,source:'player' as const,action:c.action,reason:c.reason,goal:null,alternatives:[]};
    c.brain.decision=d;c.brain.history.unshift(structuredClone(d));c.brain.history.length=Math.min(8,c.brain.history.length);
  }
  record(world,`${c.name}: ${c.action}`);return '';
}
function completeHandling(world:World,c:Citizen,a:Extract<Activity,{kind:'handling'}>){
  const b=world.buildings.find(b=>b.id===a.buildingId);
  const error=!b||!atBuilding(c,b)?'물품 취급 위치를 벗어났습니다.':transferError(c,b,a.mode,a.item);
  if(error){idle(c,error);c.brain.nextSense=0;record(world,`${c.name}: ${error}`);return;}
  const amount=a.mode==='take'?1:-1;b!.stock[a.item]-=amount;c.supplies[a.item]+=amount;
  emitNoise(world,c,'handling');
  c.brain.nextSense=0;
  const text=`${ITEMS.find(i=>i.id===a.item)!.name} 1회분 ${a.mode==='take'?'획득':'보관'} 완료`;
  idle(c,text);record(world,`${c.name}: ${text}`);
}
export function advanceSurvival(world:World,c:Citizen,seconds:number){
  let remaining=seconds;
  // 행동 완료 시 남은 시간을 다음 상태에 적용한다. 긴 간격에서도 욕구가 이중 증가하지 않는다.
  while(remaining>1e-9){
    const a=c.activity;
    if(a.kind==='tour'){
      let distance=0;let point:Point=c;for(const next of c.path){distance+=Math.hypot(next.x-point.x,next.y-point.y);point=next;}
      const duration=Math.min(remaining,c.wait>0?c.wait:distance/CONFIG.walkTilesPerGameSecond);
      if(duration<=1e-9){stepTour(world,c,0);continue;}
      const from={x:c.x,y:c.y},walking=c.wait<=0;changeNeeds(c,duration,'awake',c.wait>0?'idle':'walk');stepTour(world,c,duration);if(walking)walkingNoise(world,c,from,duration,world.seconds-remaining+duration);remaining-=duration;continue;
    }
    if(a.kind==='idle'||a.kind==='rest'||a.kind==='hide'){changeNeeds(c,remaining,a.kind==='rest'?'rest':'awake');break;}
    if(a.kind==='sleep'){
      const b=world.buildings.find(b=>b.id===a.buildingId);
      if(!b||!b.sleepSpot||!atBuilding(c,b)){idle(c,'수면 장소 조건이 달라져 잠에서 깼습니다.');record(world,`${c.name}: 수면 중단`);continue;}
      const target=c.actionSource==='ai'?20:0;
      const duration=Math.min(remaining,Math.max(0,c.fatigue-target)/sleepRecovery(c)*3600);
      changeNeeds(c,duration,'sleep');remaining-=duration;
      if(c.fatigue<=target+1e-8){c.fatigue=target;idle(c,'수면으로 목표 피로까지 회복했습니다.');record(world,`${c.name}: 수면 완료`);}else break;
    }else if(a.kind==='travel'||a.kind==='explore'){
      if(!c.path.length){
        if(a.kind==='explore'){idle(c,'탐색 지점에 도착했습니다. 주변을 다시 관찰합니다.');c.visits++;c.brain.nextSense=0;c.brain.nextThink=0;}
        else{const error=startInteraction(world,c,a.interaction);if(error){idle(c,error);record(world,`${c.name}: ${error}`);}else{c.visits++;record(world,`${c.name}: 목적지 도착`);}}
        continue;
      }
      const p=c.path[0],dx=p.x-c.x,dy=p.y-c.y,distance=Math.hypot(dx,dy),duration=Math.min(remaining,distance/CONFIG.walkTilesPerGameSecond);
      if(duration>0){
        const from={x:c.x,y:c.y},to={x:c.x+(distance?dx/distance*CONFIG.walkTilesPerGameSecond*duration:0),y:c.y+(distance?dy/distance*CONFIG.walkTilesPerGameSecond*duration:0)};
        const fraction=world.stageSix?contactFraction(from,to,world.zombies):1,walking=duration*fraction;
        c.x+=(to.x-c.x)*fraction;c.y+=(to.y-c.y)*fraction;
        if(walking>0){changeNeeds(c,walking,'awake','walk');walkingNoise(world,c,from,walking,world.seconds-remaining+walking);}
        if(fraction<1){changeNeeds(c,duration-walking,'awake','idle');c.threat.warning='접촉 위험 · 좀비와 겹치는 이동을 멈췄습니다. 직접 명령은 유지됩니다.';}
        remaining-=duration;
        if(fraction<1)break;
      }
      if(distance<=CONFIG.walkTilesPerGameSecond*duration+1e-8){c.x=p.x;c.y=p.y;c.path.shift();}else break;
    }else {
      const duration=Math.min(remaining,a.remaining);changeNeeds(c,duration,'awake');a.remaining-=duration;remaining-=duration;
      if(a.remaining<=1e-8){
        if(a.kind==='handling')completeHandling(world,c,a);
        else {
          const item=ITEMS.find(i=>i.id===a.item)!;
          if(c.supplies[a.item]<1){idle(c,'섭취할 물품이 없어 행동을 중단했습니다.');continue;}
          c.supplies[a.item]--;world.consumed[a.item]++;c.hunger=cap(c.hunger-item.hunger);c.thirst=cap(c.thirst-item.thirst);
          idle(c,`${item.name} 1회분을 소비했습니다.`);record(world,`${c.name}: ${item.name} 섭취 완료`);
        }
      }else break;
    }
  }
}
export function totalSupplies(world:World):Stock {
  const result=stock();for(const item of ITEMS)result[item.id]=world.buildings.reduce((n,b)=>n+b.stock[item.id],0)+world.citizens.reduce((n,c)=>n+c.supplies[item.id],0);return result;
}
