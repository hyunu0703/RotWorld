import { findPath,walkable,record,type World,type Point } from './world.ts';
import { canSee } from '../ai/perception.ts';
import { distanceField,heardDistance,tileKey,type Noise } from './noise.ts';
import { THREAT } from '../data/threat.ts';
export interface Zombie extends Point {
  id:number;state:'wander'|'search'|'chase';path:Point[];target:number|null;goal:Point|null;
  lastSeen:number|null;lastPosition:Point|null;nextSense:number;waitUntil:number|null;
  sound:{source:string;position:Point;score:number;heardAt:number;eventId:number}|null;
  processedNoise:number;sensitivity:number;reason:string;contact:number[];speed:number;
}
export function random(world:World){world.randomState=(Math.imul(world.randomState,1664525)+1013904223)>>>0;return world.randomState/4294967296;}
export function makeZombie(id:number,p:Point):Zombie{return {...p,id,state:'wander',path:[],target:null,goal:null,lastSeen:null,lastPosition:null,nextSense:0,waitUntil:null,sound:null,processedNoise:-1,sensitivity:1,reason:'감지 정보 없음 · 배회',contact:[],speed:THREAT.wanderSpeed};}
export function spawnZombies(world:World,count:number=THREAT.population){
  const fields=world.citizens.map(c=>distanceField(world,c,THREAT.spawnHumanDistance));
  const candidates:Point[]=[];
  for(let y=2;y<70;y++)for(let x=2;x<94;x++){
    const p={x:x+.5,y:y+.5};if(walkable({x,y},world.buildings)&&fields.every(f=>(f[tileKey(p)]??Infinity)>=THREAT.spawnHumanDistance))candidates.push(p);
  }
  while(candidates.length&&world.zombies.length<count){
    const index=Math.floor(random(world)*candidates.length),p=candidates.splice(index,1)[0];
    if(world.zombies.some(z=>Math.hypot(z.x-p.x,z.y-p.y)<THREAT.spawnSpacing))continue;
    // Unreachable islands are not valid placement, even if their distance is Infinity.
    if(!world.citizens.every(c=>findPath(c,p,world.buildings)!==null))continue;
    world.zombies.push(makeZombie(world.zombies.length,p));
  }
  if(world.zombies.length<count)record(world,`좀비 생성 ${world.zombies.length}/${count}: 통행·인간 12타일·좀비 간 6타일 조건을 만족하는 공간 부족. 조건은 유지했습니다.`);
}
function route(world:World,z:Zombie,goal:Point){
  if(z.goal&&Math.floor(z.goal.x)===Math.floor(goal.x)&&Math.floor(z.goal.y)===Math.floor(goal.y)&&z.path.length)return;
  z.goal={...goal};const path=findPath(z,goal,world.buildings);z.path=path??[];z.waitUntil=null;
  if(path===null){z.reason+=' · 경로 실패, 재탐색 대기';z.waitUntil=world.seconds+3;z.goal=null;}
}
function hear(world:World,z:Zombie){
  let best: {noise:Noise;score:number}|null=null;
  for(const n of world.noises){
    if(n.id<=z.processedNoise||world.seconds-n.time>=THREAT.noiseLifetime)continue;
    const distance=heardDistance(n,z,z.sensitivity);if(distance===null)continue;
    const score=Math.min(THREAT.hearing,n.range*z.sensitivity)/(distance+1);
    if(!best||score>best.score||score===best.score&&n.id>best.noise.id)best={noise:n,score};
  }
  z.processedNoise=world.nextNoise-1;
  if(best&&(!z.sound||best.noise.source===z.sound.source||best.score>z.sound.score*THREAT.soundSwitch)){
    const n=best.noise;z.sound={source:n.source,position:{x:n.x,y:n.y},score:best.score,heardAt:world.seconds,eventId:n.id};return true;
  }
  return false;
}
export function senseZombie(world:World,z:Zombie){
  z.nextSense=world.seconds+THREAT.sense;
  const visible=world.citizens.filter(c=>Math.hypot(c.x-z.x,c.y-z.y)<=THREAT.sight&&canSee(world,z,c)).sort((a,b)=>Math.hypot(a.x-z.x,a.y-z.y)-Math.hypot(b.x-z.x,b.y-z.y)||a.id-b.id);
  let chosen=visible[0];const current=visible.find(c=>c.id===z.target);
  if(current&&chosen&&Math.hypot(current.x-z.x,current.y-z.y)-Math.hypot(chosen.x-z.x,chosen.y-z.y)<2)chosen=current;
  if(chosen){
    z.state='chase';z.target=chosen.id;z.lastSeen=world.seconds;z.lastPosition={x:chosen.x,y:chosen.y};
    z.reason=`시각 · 인간 ${chosen.id+1} 직접 목격`;route(world,z,z.lastPosition);return;
  }
  const sound=hear(world,z);
  if(sound&&z.sound){z.state='search';z.target=null;z.reason='청각 · 들은 발생 위치 수색 (발생자 신원 미확인)';route(world,z,z.sound.position);return;}
  if(z.state==='chase'&&z.lastPosition){
    if(world.seconds-(z.lastSeen??0)>=THREAT.lostSeconds){z.state='search';z.target=null;z.reason='15초 미목격 · 마지막 목격 위치 수색';route(world,z,z.lastPosition);}
    else z.reason='시야 상실 · 마지막 목격 좌표만 추적';
  }
}
export function advanceZombies(world:World,seconds:number){
  for(const z of world.zombies){
    if(world.seconds+1e-8>=z.nextSense)senseZombie(world,z);
    const contacts=world.citizens.filter(c=>Math.hypot(c.x-z.x,c.y-z.y)<=THREAT.contact+1e-8);
    for(const c of contacts)if(!z.contact.includes(c.id)){
      record(world,`${c.name}: 접촉 위험 · 피해·물림·감염 없음`);c.threat.contact=true;c.threat.warning='접촉 위험 · 안전 확보가 필요합니다.';
      if(c.activity.kind==='sleep'){c.activity={kind:'idle'};c.action='근접 접촉으로 각성';c.brain.nextSense=0;c.brain.nextThink=0;}
    }
    z.contact=contacts.map(c=>c.id);z.speed=z.state==='wander'?THREAT.wanderSpeed:THREAT.chaseSpeed;
    if(contacts.length){z.reason='접촉 위험 · 추가 접근 중단, 대상 유지';continue;}
    let budget=z.speed*seconds;
    while(z.path.length&&budget>0){
      const p=z.path[0],distance=Math.hypot(p.x-z.x,p.y-z.y),amount=Math.min(distance,budget);
      // A segment must stop before entering the contact circle.
      let fraction=distance?amount/distance:1;
      for(const c of world.citizens){
        const dx=p.x-z.x,dy=p.y-z.y,ox=z.x-c.x,oy=z.y-c.y,A=dx*dx+dy*dy,B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-THREAT.contact**2,D=B*B-4*A*C;
        if(A&&D>=0){const t=(-B-Math.sqrt(D))/(2*A);if(t>=0&&t<=fraction)fraction=Math.min(fraction,t);}
      }
      z.x+=(p.x-z.x)*fraction;z.y+=(p.y-z.y)*fraction;budget-=amount;
      if(fraction+1e-8< (distance?amount/distance:1))break;
      if(distance<=amount+1e-8)z.path.shift();else break;
    }
    if(z.path.length||z.state==='chase')continue;
    if(z.waitUntil===null){z.waitUntil=world.seconds+(z.state==='search'?THREAT.searchSeconds:3+random(world)*5);continue;}
    if(world.seconds<z.waitUntil)continue;
    z.state='wander';z.target=null;z.sound=null;z.lastPosition=null;z.goal=null;z.waitUntil=null;z.reason='수색·대기 종료 · 주변 배회';
    const choices:Point[]=[];
    for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++)if(dx*dx+dy*dy<=64&&(dx||dy)){
      const p={x:Math.floor(z.x)+dx,y:Math.floor(z.y)+dy};if(walkable(p,world.buildings))choices.push({x:p.x+.5,y:p.y+.5});
    }
    for(let i=0;i<8&&choices.length;i++){const p=choices.splice(Math.floor(random(world)*choices.length),1)[0];route(world,z,p);if(z.path.length)break;}
    if(!z.path.length)z.waitUntil=world.seconds+3;
  }
}
