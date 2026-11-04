import { contactFraction } from './contact.ts';
import { createThreat,advanceHumanThreat,type HumanThreat } from '../ai/threat.ts';
import { advanceZombies,spawnZombies,type Zombie } from './zombies.ts';
import type { Noise } from './noise.ts';
import { CONFIG } from '../data/config.ts';
import type { CharacterDraft } from '../data/character.ts';
import { defaultDraft, personalitySummary } from '../data/character.ts';
import { createBrain, type Brain, type DangerMemory } from '../ai/types.ts';
import { updateAI } from '../ai/decision.ts';
import { observe } from '../ai/perception.ts';
import { initialStock, stock, type Stock, type Activity } from '../data/survival.ts';
import { advanceSurvival, totalSupplies } from './survival.ts';
import { createVitals, type Vitals } from './condition.ts';
export interface Point { x: number; y: number }
export interface Building { id: number; name: string; kind: string; x: number; y: number; w: number; h: number; color: string; door: Point;stock:Stock;sleepSpot:boolean }
export interface Citizen extends Point {
  id: number; name: string; age: number; job: string; home: string; money: number; personality: string;
  inventory: string[]; hunger: number; thirst: number; fatigue: number; fear: number;
  path: Point[]; destination: number; wait: number; visits: number; reason: string; action: string;
  character?:CharacterDraft;
  supplies:Stock;activity:Activity;
  vitals:Vitals;
  threat:HumanThreat;walkNoiseTime:number;brain:Brain;actionSource:'ai'|'player'|'system';
}
export interface World { stageSix:boolean;zombies:Zombie[];noises:Noise[];nextNoise:number;randomState:number;threatAccumulator:number;seconds: number; tick: number; citizens: Citizen[]; buildings: Building[]; events: { time: number; text: string }[]; mainCharacterId:number|null;runId:string;active:boolean;consumed:Stock;initialSupplies:Stock;dangers:Omit<DangerMemory,'seenAt'>[] }
const definitions: [string,string,number,number,number,number,string][] = [
  ['해솔 101동','주거',7,6,14,12,'#777e72'],['해솔 102동','주거',7,30,14,11,'#858075'],
  ['한빛 주택','주거',7,54,14,10,'#92776a'],['모퉁이 편의점','상점',36,7,15,10,'#698d88'],
  ['다온 약국','의료',53,8,7,9,'#899879'],['중앙 마트','상점',36,31,22,10,'#82937a'],
  ['새봄 식당','식당',36,55,12,9,'#ad8065'],['기록 사무소','회사',51,54,8,10,'#768993'],
  ['동부 공장','공장',70,7,18,10,'#8c8276'],['정비 창고','공장',72,55,15,9,'#7e8b89'],
  ['작은 의원','의료',71,32,8,9,'#a29b84'],['푸른 주택','주거',83,32,7,9,'#82917e']
];
export function createBuildings(): Building[] { return definitions.map(([name,kind,x,y,w,h,color],id)=>({id,name,kind,x,y,w,h,color,door:{x:x+Math.floor(w/2),y:y+h},stock:initialStock(kind),sleepSpot:[0,1,11].includes(id)})); }
export function walkable(p: Point, buildings: Building[]) {
  return Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=2&&p.y>=2&&p.x<CONFIG.width-2&&p.y<CONFIG.height-2
    && !buildings.some(b=>p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h);
}
export function findPath(start: Point, goal: Point, buildings: Building[],allowed:(p:Point)=>boolean=()=>true): Point[] | null {
  const from={x:Math.floor(start.x),y:Math.floor(start.y)}, to={x:Math.floor(goal.x),y:Math.floor(goal.y)};
  if(!walkable(from,buildings)||!walkable(to,buildings)) return null;
  const key=(p:Point)=>p.y*CONFIG.width+p.x, first=key(from), last=key(to);
  const queue=[from], prev=new Map<number,number>([[first,-1]]);
  for(let i=0;i<queue.length;i++) {
    const p=queue[i], k=key(p); if(k===last) break;
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const next={x:p.x+dx,y:p.y+dy}, n=key(next);
      if(walkable(next,buildings)&&allowed({x:next.x+.5,y:next.y+.5})&&!prev.has(n)){prev.set(n,k);queue.push(next);}
    }
  }
  if(!prev.has(last))return null;
  const result:Point[]=[];
  for(let k=last;k!==first;k=prev.get(k)!)result.push({x:k%CONFIG.width+.5,y:Math.floor(k/CONFIG.width)+.5});
  return result.reverse();
}
export function record(world:World,text:string) {world.events.unshift({time:world.seconds,text});world.events.length=Math.min(world.events.length,40);}
export function chooseDestination(world:World,c:Citizen) {
  c.destination=(c.destination+3+c.id%5)%world.buildings.length;
  const b=world.buildings[c.destination], path=findPath(c,b.door,world.buildings);
  c.path=path??[]; c.reason=path?'이동 시제품: 정해진 순서로 다음 건물의 입구를 선택했습니다. 생존 판단은 아직 적용되지 않습니다.':'목적지까지 통행 가능한 경로가 없어 대기합니다.';
  c.action=path?`${b.name} 입구로 이동`:'경로 없음 · 대기';
  if(!path){c.wait=10;record(world,`${c.name}: 경로를 찾지 못했습니다.`);}
}
export function createWorld(profile?:CharacterDraft,options:{stageSix?:boolean;seed?:number}={}):World {
  const buildings=createBuildings();
  const names=['이서윤','김도현','박지우','최민준','정하린','강시우','윤서진','장유진','임수호','한채원','오지안','신태오'];
  const jobs=['간호사','정비사','학생','회사원','요리사','배달원'];
  const world:World={stageSix:options.stageSix??true,zombies:[],noises:[],nextNoise:0,randomState:options.seed??60703,threatAccumulator:0,seconds:0,tick:0,citizens:[],buildings,events:[],mainCharacterId:profile?0:null,runId:'',active:true,consumed:stock(),initialSupplies:stock(),dangers:[]};
  for(let id=0;id<CONFIG.population;id++) {
    const b=buildings[id%buildings.length];
    const c:Citizen={id,name:names[id],age:22+id*3,job:jobs[id%6],home:buildings[[0,1,2,11][id%4]].name,
      money:15000+id*2300,personality:['신중한 편','활동적인 편','차분한 편'][id%3],inventory:['개인 가방'],
      hunger:20,thirst:15,fatigue:10,fear:10,x:b.door.x+.5,y:b.door.y+.5,path:[],destination:id,wait:0,visits:0,reason:'',action:'',supplies:stock(1,0,1),activity:{kind:'idle'},vitals:createVitals(),threat:createThreat(),walkNoiseTime:0,brain:createBrain(id,!(id===0&&profile)),actionSource:'system'};
    const npc=defaultDraft();npc.name=c.name;npc.personality.risk=(['low','normal','high'] as const)[id%3];npc.personality.stockpiling=(['low','normal','high'] as const)[Math.floor(id/3)%3];c.character=npc;c.personality=personalitySummary(npc);
    if(id===0&&profile){c.name=profile.name;c.character=structuredClone(profile);c.personality=personalitySummary(profile);}
    c.vitals=createVitals(c.character.stats.endurance);
    world.citizens.push(c);c.action='주변 관찰';c.reason='직접 관찰한 장소와 개인별 욕구를 바탕으로 다음 행동을 판단합니다.';observe(world,c);
  }
  if(profile){const main=world.citizens[0];main.activity={kind:'idle'};main.path=[];main.destination=0;main.action='행동 지시 대기';main.reason='생존 행동을 직접 지시하거나 자율 생존을 켤 수 있습니다.';}
  if(world.stageSix)spawnZombies(world);
  world.initialSupplies=totalSupplies(world);
  record(world,'관찰 시작 · NPC의 개인별 인지·자율 생존을 준비했습니다.');return world;
}
export function stepWorld(world:World,seconds:number) {
  if(!world.active||!Number.isFinite(seconds)||seconds<=0)return;
  if(world.stageSix){
    world.threatAccumulator+=seconds;
    while(world.threatAccumulator>=.1-1e-8){world.threatAccumulator-=.1;if(Math.abs(world.threatAccumulator)<1e-8)world.threatAccumulator=0;stepSlice(world,.1);}
  }else stepSlice(world,seconds);
}
function stepSlice(world:World,seconds:number){
  world.seconds=Number((world.seconds+seconds).toFixed(8));world.tick++;
  if(world.stageSix){world.noises=world.noises.filter(n=>world.seconds-n.time<10);advanceZombies(world,seconds);}
  for(const c of world.citizens) {
    if(world.stageSix)advanceHumanThreat(world,c,seconds);
    updateAI(world,c);
    const before=[c.hunger,c.thirst,c.fatigue];advanceSurvival(world,c,seconds);
    for(const alert of c.vitals.pendingAlerts.splice(0))record(world,`${c.name}: ${alert}`);
    for(const [i,value] of [c.hunger,c.thirst,c.fatigue].entries())if(before[i]<100&&value>=100)record(world,`${c.name}: ${['허기','갈증','피로'][i]} 한계 경고${i<2?' · 지속 피해는 아직 미구현':''}`);
  }
}
export function stepTour(world:World,c:Citizen,seconds:number){
    if(c.wait>0){c.wait=Math.max(0,c.wait-seconds);if(c.wait===0)chooseDestination(world,c);return;}
    let budget=CONFIG.walkTilesPerGameSecond*seconds;
    while(c.path.length&&budget>0) {
      const p=c.path[0],dx=p.x-c.x,dy=p.y-c.y,dist=Math.hypot(dx,dy);
      if(dist<=budget){const fraction=world.stageSix?contactFraction(c,p,world.zombies):1;c.x+=dx*fraction;c.y+=dy*fraction;if(fraction<1)break;c.path.shift();budget-=dist;}
      else{const to={x:c.x+dx/dist*budget,y:c.y+dy/dist*budget},fraction=world.stageSix?contactFraction(c,to,world.zombies):1;c.x+=(to.x-c.x)*fraction;c.y+=(to.y-c.y)*fraction;budget=0;}
    }
    if(!c.path.length){c.wait=12+c.id%4*3;c.visits++;c.action=`${world.buildings[c.destination].name} 입구에서 대기`;
      c.reason='목적지에 도착했습니다. 잠시 대기한 뒤 다음 입구로 이동합니다. 실내 진입·탐색은 아직 없습니다.';
      record(world,`${c.name} → ${world.buildings[c.destination].name} 도착`);}
}
