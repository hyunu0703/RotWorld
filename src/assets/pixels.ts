import { Texture } from 'pixi.js';
import { CONFIG, SHIRTS } from '../data/config.ts';
import type { World } from '../simulation/world.ts';
function canvas(w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function personTexture(id:number,frame:number) {
  const c=canvas(10,14),g=c.getContext('2d')!;
  const r=(x:number,y:number,w:number,h:number,color:string)=>{g.fillStyle=color;g.fillRect(x,y,w,h);};
  r(2,12,7,2,'#23332b');r(3,1,4,2,['#41352e','#292e30','#6d5440'][id%3]);
  r(3,3,4,3,'#dfb68b');r(2,6,6,5,SHIRTS[id%6]);r(1,7,1,4,'#dfb68b');r(8,7,1,4,'#dfb68b');
  r(3,11,2,frame?2:3,'#344451');r(6,11,2,frame?3:2,'#344451');
  const t=Texture.from(c);t.source.scaleMode='nearest';return t;
}
export function cityTexture(world:World) {
  const T=CONFIG.tile,c=canvas(CONFIG.width*T,CONFIG.height*T),g=c.getContext('2d')!;
  const r=(x:number,y:number,w:number,h:number,color:string)=>{g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  r(0,0,c.width,c.height,'#53694d');
  for(let y=0;y<c.height;y+=6)for(let x=0;x<c.width;x+=6){const n=(x*37+y*71)%113;if(n<12)r(x,y,2,1,'#627654');}
  for(const x of [28,63]){r((x-2)*T,2*T,9*T,68*T,'#a0a18a');r(x*T,2*T,5*T,68*T,'#434c49');
    for(let y=3*T;y<70*T;y+=24)r((x+2.5)*T,y,2,10,'#acac87');}
  for(const y of [23,47]){r(2*T,(y-2)*T,92*T,9*T,'#a0a18a');r(2*T,y*T,92*T,5*T,'#434c49');
    for(let x=3*T;x<94*T;x+=24)r(x,(y+2.5)*T,10,2,'#acac87');}
  for(const x of [28,63])for(const y of [23,47]){
    r(x*T,y*T,5*T,5*T,'#434c49');
    for(let i=0;i<5;i++){r((x-.9)*T,(y+i)*T,7,5,'#d0c9a1');r((x+5.3)*T,(y+i)*T,7,5,'#d0c9a1');}
  }
  // 공원, 작은 광장, 벤치와 분수.
  r(71*T,21*T,19*T,7*T,'#77866a');r(79*T,21*T,3*T,7*T,'#b4ac8d');
  r(77*T,23*T,7*T,3*T,'#b4ac8d');r(79*T+3,23*T+1,29,24,'#596c67');r(79*T+6,23*T+4,23,18,'#88aaa3');
  for(const b of world.buildings){const x=b.x*T,y=b.y*T,w=b.w*T,h=b.h*T;
    r(x-5,y+h-4,w+15,14,'#3a4d3e');r(x-4,y-4,w+8,h+8,'#b1aa91');r(x,y,w,h,b.color);
    r(x,y+h-18,w,18,'#515e58');r(x+5,y+5,w-10,h-27,b.color);r(x+7,y+7,w-14,2,'#c0b69c');
    for(let wy=y+17;wy<y+h-23;wy+=20)for(let wx=x+10;wx<x+w-12;wx+=22){r(wx,wy,12,9,'#3f5352');r(wx+1,wy+1,7,3,'#99b1a2');}
    r(x+w-30,y+11,17,12,'#57665e');r(x+w-28,y+13,13,2,'#a4ac9b');
    r(b.door.x*T+2,y+h-15,9,15,'#d3bc8b');r(b.door.x*T+4,y+h-12,5,9,'#46534e');
    r(b.door.x*T-1,y+h,15,9,'#b8b49a');
    if(b.kind==='상점'){r(x,y+h-22,w,6,b.id===3?'#bd9971':'#a9b68b');}
    if(b.kind==='의료'){r(x+w/2-2,y+12,5,15,'#d3d2ab');r(x+w/2-7,y+17,15,5,'#d3d2ab');}
    g.textAlign='center';g.font='bold 10px "Malgun Gothic",sans-serif';
    const textWidth=g.measureText(b.name).width;r(x+w/2-textWidth/2-5,y+h-35,textWidth+10,17,'#273e37');
    g.fillStyle='#e5dfbd';g.fillText(b.name,x+w/2,y+h-23);
  }
  function tree(x:number,y:number){r(x+7,y+12,4,13,'#605b40');r(x-2,y+15,24,10,'#3d5541');r(x,y+3,19,17,'#375640');r(x+4,y,13,15,'#759063');r(x+3,y+7,13,11,'#577c51');r(x+7,y+2,6,4,'#8b9b69');}
  for(let x=3*T;x<94*T;x+=37){tree(x,2*T);tree(x,68*T);}
  for(const [x,y] of [[3,12],[3,33],[3,58],[24,10],[24,37],[24,58],[34,3],[56,3],[70,21],[87,21],[90,25],[90,57],[72,28]])tree(x*T,y*T);
  for(const [x,y] of [[73,27],[86,27],[40,68],[78,67]]){r(x*T,y*T,18,5,'#ad9366');r(x*T+1,y*T+5,2,4,'#394e42');r(x*T+15,y*T+5,2,4,'#394e42');}
  for(const [x,y,color] of [[30,10,'#9f9c83'],[65,36,'#7e9299'],[14,49,'#a58a73']] as const){r(x*T,y*T,12,24,'#293c35');r(x*T+1,y*T,10,21,color);r(x*T+2,y*T+4,8,5,'#405653');}
  g.fillStyle='#ded6b2';g.font='10px monospace';g.textAlign='left';g.fillText('HAESOL / DISTRICT 01',5*T,70*T);
  const t=Texture.from(c);t.source.scaleMode='nearest';return t;
}
