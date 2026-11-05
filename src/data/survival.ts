// 4단계 시제품 기본안. 확정된 욕구 변화량과 조정 가능한 구현 기본값을 구분한다.
export const ITEMS = [
  {id:'snack',name:'간식',hunger:15,thirst:0,useSeconds:6},
  {id:'meal',name:'식사',hunger:35,thirst:0,useSeconds:12},
  {id:'water',name:'물',hunger:0,thirst:40,useSeconds:3},
  {id:'bandage',name:'붕대',hunger:0,thirst:0,useSeconds:30},
  {id:'pipe',name:'쇠파이프',hunger:0,thirst:0,useSeconds:0}
] as const;
export type ItemId = typeof ITEMS[number]['id'];
export type Stock = Record<ItemId,number>;
export const SURVIVAL = {capacity:12,handlingSeconds:10,interactionDistance:.55} as const;
export function stock(snack=0,meal=0,water=0):Stock{return {snack,meal,water,bandage:0,pipe:0};}
export function stockCount(s:Stock){return Object.values(s).reduce((n,v)=>n+v,0);}
export function initialStock(kind:string):Stock {
  if(kind==='상점')return stock(8,6,12);
  if(kind==='주거')return stock(2,2,4);
  if(kind==='식당')return stock(2,8,6);
  return stock(1,0,2);
}
export type Interaction = {kind:'take';buildingId:number;item:ItemId}|{kind:'deposit';buildingId:number;item:ItemId}|{kind:'sleep';buildingId:number}|{kind:'restAt';buildingId:number}|{kind:'move';buildingId:number};
export interface HandlingEffects {thirst:number;fatigue:number;fear:number;calm:number;total:number;capped:number;trait:number;multiplier:number}
export type Activity = {kind:'combat';target:number;move:'attack'|'push'}|{kind:'bandage';wound:number;remaining:number}|  {kind:'hide'}|{kind:'idle'}|{kind:'tour'}|{kind:'rest'}|{kind:'sleep';buildingId:number}|{kind:'consume';item:ItemId;remaining:number}
  |{kind:'handling';mode:'take'|'deposit';buildingId:number;item:ItemId;remaining:number;effects:HandlingEffects}|{kind:'travel';interaction:Interaction}|{kind:'explore';point:{x:number;y:number}};
