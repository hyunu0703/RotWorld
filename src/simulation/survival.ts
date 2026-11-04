import { ITEMS, SURVIVAL, stock, stockCount, type Stock, type ItemId, type Interaction, type Activity } from '../data/survival.ts';
import { CONFIG } from '../data/config.ts';
import { record, findPath, stepTour, chooseDestination, type Citizen, type World, type Building } from './world.ts';
const cap=(value:number)=>Math.max(0,Math.min(100,value));
export function hasTrait(c:Citizen,id:string){return c.character?.traits.some(t=>t===id)??false;}
export function sleepRecovery(c:Citizen){return 10*(hasTrait(c,'lightSleeper')?1.25:hasTrait(c,'heavySleeper')?.8:1);}
export function needRates(c:Citizen,mode:'awake'|'rest'|'sleep'=c.activity.kind==='sleep'?'sleep':c.activity.kind==='rest'?'rest':'awake'){
  const hungerFactor=hasTrait(c,'smallEater')?.85:hasTrait(c,'bigEater')?1.2:1;
  return {hunger:(mode==='sleep'?2:4)*hungerFactor,thirst:mode==='sleep'?3:6,fatigue:mode==='sleep'?-sleepRecovery(c):mode==='rest'?0:4};
}
export function changeNeeds(c:Citizen,seconds:number,mode?:'awake'|'rest'|'sleep'){
  const r=needRates(c,mode);c.hunger=cap(c.hunger+r.hunger*seconds/3600);c.thirst=cap(c.thirst+r.thirst*seconds/3600);c.fatigue=cap(c.fatigue+r.fatigue*seconds/3600);
}
export function handlingMultiplier(c:Citizen){
  const thirst=c.thirst>=80?.15:0,fatigue=c.fatigue>=80?.25:c.fatigue>=60?.1:0;
  const calm=1-((c.character?.stats.composure??5)-5)*.08;
  const fear=(c.fear>=80?.25:c.fear>=60?.1:0)*calm;
  return (1+Math.min(.5,thirst+fatigue+fear))*(hasTrait(c,'organized')?.8:hasTrait(c,'clumsy')?1.25:1);
}
export function atBuilding(c:Citizen,b:Building){return Math.hypot(c.x-b.door.x-.5,c.y-b.door.y-.5)<=SURVIVAL.interactionDistance;}
function transferError(c:Citizen,b:Building,mode:'take'|'deposit',item:ItemId){
  if(mode==='take'&&b.stock[item]<1)return '해당 장소의 물자가 고갈되었습니다.';
  if(mode==='take'&&stockCount(c.supplies)>=SURVIVAL.capacity)return '소지 한도가 가득 찼습니다.';
  if(mode==='deposit'&&c.supplies[item]<1)return '보관할 물품을 가지고 있지 않습니다.';
  return '';
}
function idle(c:Citizen,reason:string){c.activity={kind:'idle'};c.path=[];c.wait=0;c.action='대기';c.reason=reason;}
function startInteraction(world:World,c:Citizen,intent:Interaction):string {
  const b=world.buildings.find(b=>b.id===intent.buildingId);if(!b||!atBuilding(c,b))return '장소의 입구에 도착하지 못했습니다.';
  if(intent.kind==='move'){idle(c,'플레이어가 지정한 목적지에 도착했습니다.');return '';}
  if(intent.kind==='sleep'){
    if(!b.sleepSpot)return '이 장소에는 지정된 수면 거점이 없습니다.';
    if(c.fatigue<=0)return '피로가 없어 더 수면할 필요가 없습니다.';
    c.activity={kind:'sleep',buildingId:b.id};c.action=`${b.name} 거점에서 수면`;c.reason='플레이어 지시: 시제품의 지정 거점에서 피로를 회복합니다. 안전 AI는 아직 연결되지 않았습니다.';
  }else {
    const error=transferError(c,b,intent.kind,intent.item);if(error)return error;
    c.activity={kind:'handling',mode:intent.kind,buildingId:b.id,item:intent.item,remaining:SURVIVAL.handlingSeconds*handlingMultiplier(c)};
    c.action=`${ITEMS.find(i=>i.id===intent.item)!.name} ${intent.kind==='take'?'획득':'보관'} 중`;
    c.reason='플레이어 지시: 물품 취급 완료 시 장소와 소지품 사이에서 1회분을 이전합니다.';
  }
  return '';
}
export type SurvivalCommand = Interaction|{kind:'consume';item:ItemId}|{kind:'rest'}|{kind:'stop'}|{kind:'tour'};
export function issueCommand(world:World,id:number,command:SurvivalCommand):string {
  const c=world.citizens.find(c=>c.id===id);if(!world.active||!c)return '진행 중인 인간을 선택해 주세요.';
  if(command.kind==='consume'){
    const item=ITEMS.find(i=>i.id===command.item);if(!item)return '알 수 없는 물품입니다.';
    if(c.supplies[item.id]<1)return `${item.name}을 가지고 있지 않습니다.`;
    if((item.hunger&&c.hunger<=0)||(item.thirst&&c.thirst<=0))return '이미 해당 욕구가 해소되어 있습니다.';
    c.path=[];c.wait=0;c.activity={kind:'consume',item:item.id,remaining:item.useSeconds};c.action=item.id==='water'?'수분 섭취 중':`${item.name} 섭취 중`;
    c.reason='플레이어 지시: 섭취가 완료되면 소지품 1회분을 소비하고 욕구가 감소합니다.';
  }else if(command.kind==='rest'){
    c.path=[];c.wait=0;c.activity={kind:'rest'};c.action='앉아서 휴식';c.reason='플레이어 지시: 피로가 더 쌓이지 않습니다. 피로를 줄이려면 지정 거점에서 수면해야 합니다.';
  }else if(command.kind==='stop'){idle(c,'플레이어가 행동을 중단했습니다. 진행 중인 물품은 완료 전이므로 소비·이전되지 않았습니다.');}
  else if(command.kind==='tour'){
    c.activity={kind:'tour'};c.wait=0;chooseDestination(world,c);
  }else {
    const b=world.buildings.find(b=>b.id===command.buildingId);if(!b)return '장소를 찾을 수 없습니다.';
    if(command.kind==='sleep'&&!b.sleepSpot)return '이 장소에는 지정된 수면 거점이 없습니다.';
    if((command.kind==='take'||command.kind==='deposit')){
      if(!ITEMS.some(i=>i.id===command.item))return '알 수 없는 물품입니다.';
      const error=transferError(c,b,command.kind,command.item);if(error)return error;
    }
    const path=findPath(c,b.door,world.buildings);if(!path)return '통행 가능한 경로가 없습니다.';
    if(atBuilding(c,b)){const error=startInteraction(world,c,command);if(error)return error;c.path=[];c.destination=b.id;}
    else{c.path=path;c.wait=0;c.destination=b.id;c.activity={kind:'travel',interaction:{...command}};c.action=`${b.name} 입구로 이동`;c.reason='플레이어 지시: 목적지에 도착한 뒤 지정한 행동을 수행합니다.';}
  }
  record(world,`${c.name}: ${c.action}`);return '';
}
function completeHandling(world:World,c:Citizen,a:Extract<Activity,{kind:'handling'}>){
  const b=world.buildings.find(b=>b.id===a.buildingId);
  const error=!b||!atBuilding(c,b)?'물품 취급 위치를 벗어났습니다.':transferError(c,b,a.mode,a.item);
  if(error){idle(c,error);record(world,`${c.name}: ${error}`);return;}
  const amount=a.mode==='take'?1:-1;b!.stock[a.item]-=amount;c.supplies[a.item]+=amount;
  const text=`${ITEMS.find(i=>i.id===a.item)!.name} 1회분 ${a.mode==='take'?'획득':'보관'} 완료`;
  idle(c,text);record(world,`${c.name}: ${text}`);
}
export function advanceSurvival(world:World,c:Citizen,seconds:number){
  let remaining=seconds;
  // 행동 완료 시 남은 시간을 다음 상태에 적용한다. 긴 간격에서도 욕구가 이중 증가하지 않는다.
  while(remaining>1e-9){
    const a=c.activity;
    if(a.kind==='tour'){changeNeeds(c,remaining,'awake');stepTour(world,c,remaining);break;}
    if(a.kind==='idle'||a.kind==='rest'){changeNeeds(c,remaining,a.kind==='rest'?'rest':'awake');break;}
    if(a.kind==='sleep'){
      const b=world.buildings.find(b=>b.id===a.buildingId);
      if(!b||!b.sleepSpot||!atBuilding(c,b)){idle(c,'수면 장소 조건이 달라져 잠에서 깼습니다.');record(world,`${c.name}: 수면 중단`);continue;}
      const duration=Math.min(remaining,c.fatigue/sleepRecovery(c)*3600);
      changeNeeds(c,duration,'sleep');remaining-=duration;
      if(c.fatigue<1e-8){c.fatigue=0;idle(c,'수면으로 피로가 해소되었습니다.');record(world,`${c.name}: 수면 완료`);}else break;
    }else if(a.kind==='travel'){
      if(!c.path.length){const error=startInteraction(world,c,a.interaction);if(error){idle(c,error);record(world,`${c.name}: ${error}`);}else{c.visits++;record(world,`${c.name}: 목적지 도착`);}continue;}
      const p=c.path[0],dx=p.x-c.x,dy=p.y-c.y,distance=Math.hypot(dx,dy),duration=Math.min(remaining,distance/CONFIG.walkTilesPerGameSecond);
      if(duration>0){c.x+=distance?dx/distance*CONFIG.walkTilesPerGameSecond*duration:0;c.y+=distance?dy/distance*CONFIG.walkTilesPerGameSecond*duration:0;changeNeeds(c,duration,'awake');remaining-=duration;}
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
