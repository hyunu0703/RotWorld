import type { Citizen } from './world.ts';

// 2026-11-04 승인된 초기 기준. 플레이어에게 이 내부 수치를 노출하지 않는다.
export const CONDITION = {health:100,stamina:100,walk:-1,handling:-2,idle:6,rest:12,sleep:18} as const;
export interface Vitals {
  health:number;maxHealth:number;stamina:number;maxStamina:number;
  healthStage:number;staminaStage:number;dead:boolean;pendingAlerts:string[];recentAlerts:string[];
}
export type BodyMode='walk'|'handling'|'idle'|'rest'|'sleep';
const healthLabels=['양호','경미한 손상','상당한 손상','위중','사망'];
const staminaLabels=['여유 있음','숨이 차오름','숨이 가쁨','기진맥진','힘이 바닥남'];
export function createVitals(endurance=5):Vitals {
  const maximum=CONDITION.stamina*(1+(endurance-5)*.06);
  return {health:CONDITION.health,maxHealth:CONDITION.health,stamina:maximum,maxStamina:maximum,healthStage:0,staminaStage:0,dead:false,pendingAlerts:[],recentAlerts:[]};
}
export function staminaMaximum(c:Citizen,fatigue=c.fatigue){
  return CONDITION.stamina*(1+((c.character?.stats.endurance??5)-5)*.06)*(fatigue>=80?.7:fatigue>=60?.85:1);
}
export function recoveryPenalty(c:Citizen){
  const hunger=c.hunger>=80?.25:c.hunger>=60?.1:0;
  const thirst=c.thirst>=80?.3:c.thirst>=60?.15:0;
  return {hunger,thirst,strongest:Math.max(hunger,thirst)};
}
export function bodyMode(c:Citizen):BodyMode {
  const kind=c.activity.kind;
  return kind==='sleep'?'sleep':kind==='rest'?'rest':kind==='handling'?'handling':
    (kind==='travel'||kind==='explore'||kind==='tour')&&c.path.length>0&&c.wait<=0?'walk':'idle';
}
export function staminaRate(c:Citizen,mode:BodyMode=bodyMode(c)){
  const base=CONDITION[mode];return base>0?base*(1-recoveryPenalty(c).strongest):base;
}
function ratio(value:number,maximum:number){
  if(!Number.isFinite(maximum)||maximum<=0||!Number.isFinite(value)||value<0||value>maximum)throw new Error('신체 상태 내부 수치 오류');
  return value/maximum*100;
}
function stage(value:number,previous:number,boundaries:readonly number[],zero:boolean,reset:boolean){
  if(zero&&value===0)return 4;
  const basic=boundaries.filter(boundary=>value<=boundary).length;
  if(reset||previous===4||basic>=previous)return basic;
  for(let i=0;i<previous;i++)if(value>=boundaries[i]+3)return i;
  return previous;
}
export function updateCondition(c:Citizen,reset=false):string[]{
  const v=c.vitals,oldHealth=v.healthStage,oldStamina=v.staminaStage;
  const h=ratio(v.health,v.maxHealth),s=ratio(v.stamina,v.maxStamina);
  if(h===0&&!v.dead)throw new Error('체력 0은 사망 확정 사건 없이 표시할 수 없습니다.');
  v.healthStage=v.dead||oldHealth===4?4:stage(h,oldHealth,[80,60,30],false,reset);
  v.staminaStage=stage(s,oldStamina,[75,50,20],true,reset);
  const alerts:string[]=[];
  if(v.healthStage===3&&oldHealth!==3)alerts.push('신체 상태 위중 · 안전 확보와 치료가 시급합니다.');
  if(v.healthStage===4&&oldHealth!==4)alerts.push('사망이 확정되었습니다.');
  if(v.staminaStage===4&&oldStamina!==4)alerts.push('힘이 바닥났습니다. 휴식이 필요합니다.');
  v.recentAlerts.unshift(...alerts);v.recentAlerts.length=Math.min(8,v.recentAlerts.length);
  return alerts;
}
export function advanceCondition(c:Citizen,seconds:number,mode:BodyMode,fatigue=c.fatigue):string[]{
  const v=c.vitals;v.maxStamina=staminaMaximum(c,fatigue);
  v.stamina=Math.min(v.stamina,v.maxStamina);
  if(!v.dead)v.stamina=Math.max(0,Math.min(v.maxStamina,v.stamina+staminaRate(c,mode)*seconds/60));
  return updateCondition(c);
}
export function conditionText(c:Citizen,paused=false){
  const v=c.vitals,rate=staminaRate(c);
  const movement=rate<0&&v.stamina>0?'소모 중':rate>0&&v.stamina<v.maxStamina?'회복 중':'유지 중';
  return {health:healthLabels[v.healthStage]+(v.healthStage===4?'':paused?' · 진행 중단':' · 안정됨'),
    stamina:staminaLabels[v.staminaStage]+(paused?' · 진행 중단':` · ${movement}`)};
}
