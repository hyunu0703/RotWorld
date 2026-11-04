import type { Stock } from '../data/survival.ts';
export type NeedGoal='food'|'water'|'sleep';
export interface PlaceMemory {
  id:number;name:string;kind:string;x:number;y:number;stock:Stock|null;sleepSpot:boolean|null;
  seenAt:number;inspectedAt:number|null;
}
export interface DangerMemory {id:string;label:string;x:number;y:number;radius:number;severity:number;seenAt:number}
export interface Decision {
  time:number;source:'ai'|'player';action:string;reason:string;goal:NeedGoal|null;
  alternatives:{action:string;score:number;distance:number;risk:number}[];
}
export interface Brain {
  enabled:boolean;places:Record<number,PlaceMemory>;dangers:Record<string,DangerMemory>;explored:Record<string,boolean>;
  needs:Record<NeedGoal,boolean>;goal:NeedGoal|null;nextSense:number;nextThink:number;revision:number;plannedRevision:number;
  risk:number;retryAfter:Record<string,number>;decision:Decision|null;history:Decision[];
}
export function createBrain(id:number,enabled:boolean):Brain {
  return {enabled,places:{},dangers:{},explored:{},needs:{food:false,water:false,sleep:false},goal:null,
    nextSense:id*.1,nextThink:id*.15,revision:0,plannedRevision:-1,risk:0,retryAfter:{},decision:null,history:[]};
}
