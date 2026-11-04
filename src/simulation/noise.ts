import { walkable, type World, type Point, type Citizen } from './world.ts';
import { CONFIG } from '../data/config.ts';
import { THREAT } from '../data/threat.ts';
export interface Noise extends Point {id:number;source:string;kind:'walk'|'handling'|'consume';time:number;range:number;distances:Record<string,number>}
export const tileKey=(p:Point)=>`${Math.floor(p.x)},${Math.floor(p.y)}`;
// Four-neighbour shortest walking distance. Cached per event, never a ray through walls.
export function distanceField(world:World,origin:Point,limit:number){
  const first={x:Math.floor(origin.x),y:Math.floor(origin.y)},distances:Record<string,number>={};
  if(!walkable(first,world.buildings))return distances;
  const queue=[first];distances[tileKey(first)]=0;
  for(let i=0;i<queue.length;i++){
    const p=queue[i],d=distances[tileKey(p)];if(d>=limit)continue;
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
      const q={x:p.x+dx,y:p.y+dy},key=tileKey(q);
      if(distances[key]===undefined&&walkable(q,world.buildings)){distances[key]=d+1;queue.push(q);}
    }
  }
  return distances;
}
export function emitNoise(world:World,c:Citizen,kind:Noise['kind'],position:Point=c,time=world.seconds){
  if(!world.stageSix)return;
  const multiplier=kind==='walk'?(c.character?.traits.includes('quiet')?.75:c.character?.traits.includes('loud')?1.2:1):1;
  const event:Noise={id:world.nextNoise++,source:`human:${c.id}:${kind}`,kind,x:position.x,y:position.y,time,
    range:({walk:4,handling:8,consume:2}[kind])*multiplier,distances:distanceField(world,position,THREAT.hearing)};
  world.noises.push(event);
}
export function heardDistance(noise:Noise,p:Point,sensitivity=1){
  const d=noise.distances[tileKey(p)]??Infinity;
  return d<=Math.min(THREAT.hearing,noise.range*sensitivity)?d:null;
}
export function walkingNoise(world:World,c:Citizen,from:Point,duration:number,endTime:number){
  if(!world.stageSix||duration<=0)return;
  let elapsed=0;
  while(c.walkNoiseTime+duration-elapsed>=THREAT.footstepSeconds-1e-9){
    const slice=THREAT.footstepSeconds-c.walkNoiseTime;elapsed+=slice;c.walkNoiseTime=0;
    const ratio=Math.min(1,elapsed/duration);
    emitNoise(world,c,'walk',{x:from.x+(c.x-from.x)*ratio,y:from.y+(c.y-from.y)*ratio},endTime-duration+elapsed);
  }
  c.walkNoiseTime+=duration-elapsed;
}
