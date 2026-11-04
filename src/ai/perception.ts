import { observeThreats } from './threat.ts';
import type { Citizen, World, Point } from '../simulation/world.ts';
import { atBuilding } from '../simulation/survival.ts';
import type { Brain, DangerMemory } from './types.ts';
export const AI_CONFIG={senseSeconds:2,thinkSeconds:5,sightTiles:8,retrySeconds:120,idleSeconds:60,explorationStep:12} as const;
export function canSee(world:World,from:Point,to:Point):boolean {
  const distance=Math.hypot(to.x-from.x,to.y-from.y),steps=Math.max(1,Math.ceil(distance*5));
  for(let i=1;i<steps;i++){
    const x=Math.floor(from.x+(to.x-from.x)*i/steps),y=Math.floor(from.y+(to.y-from.y)*i/steps);
    if(world.buildings.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h))return false;
  }
  return true;
}
export function riskAt(brain:Brain,p:Point){
  return Math.min(100,Object.values(brain.dangers).reduce((sum,d)=>sum+d.severity*Math.max(0,1-Math.hypot(d.x-p.x,d.y-p.y)/(d.radius+4)),0));
}
export function observe(world:World,c:Citizen){
  if(c.activity.kind==='sleep')return;
  const brain=c.brain,sight=AI_CONFIG.sightTiles*(1+((c.character?.stats.perception??5)-5)*.04);
  const visible=(p:Point)=>Math.hypot(p.x-c.x,p.y-c.y)<=sight&&canSee(world,c,p);
  for(const b of world.buildings){
    const entry={x:b.door.x+.5,y:b.door.y+.5};if(!visible(entry))continue;
    let memory=brain.places[b.id];
    if(!memory){memory={id:b.id,name:b.name,kind:b.kind,...entry,stock:null,sleepSpot:null,seenAt:world.seconds,inspectedAt:null};brain.places[b.id]=memory;brain.revision++;}
    memory.seenAt=world.seconds;
    // 건물 종류나 멀리 보이는 외관으로 재고와 안전을 알아내지 않는다.
    if(atBuilding(c,b)){
      if(!memory.stock||memory.stock.snack!==b.stock.snack||memory.stock.meal!==b.stock.meal||memory.stock.water!==b.stock.water||memory.sleepSpot!==b.sleepSpot)brain.revision++;
      memory.stock={...b.stock};memory.sleepSpot=b.sleepSpot;memory.inspectedAt=world.seconds;
    }
  }
  const seen=new Map<string,DangerMemory>();
  for(const d of world.dangers)if(visible(d))seen.set(d.id,{...d,seenAt:world.seconds});
  for(const [id,m] of Object.entries(brain.dangers))if(!id.startsWith('zombie:')&&visible(m)&&!seen.has(id)){delete brain.dangers[id];brain.revision++;}
  for(const [id,d] of seen){const old=brain.dangers[id];if(!old||old.x!==d.x||old.y!==d.y||old.radius!==d.radius||old.severity!==d.severity)brain.revision++;brain.dangers[id]=d;}
  if(world.stageSix)observeThreats(world,c);
  brain.risk=riskAt(brain,c);
  brain.nextSense=world.seconds+(world.stageSix?.5:AI_CONFIG.senseSeconds);
}
