import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { CONFIG } from '../data/config.ts';
import { cityTexture, personTexture,zombieTexture } from '../assets/pixels.ts';
import type { World, Point } from '../simulation/world.ts';
export class Scene {
  app=new Application(); root=new Container(); people=new Container(); route=new Graphics(); selection=new Graphics();
  camera={x:0,y:0,zoom:1}; selected:number|null=null; follow=false;
  private sprites:Sprite[]=[];private textures:ReturnType<typeof personTexture>[][]=[];
  private zombieSprites:Sprite[]=[];private zombieFrames:ReturnType<typeof zombieTexture>[]=[];
  private width=1;private height=1;private resizeObserver:ResizeObserver|null=null;
  constructor(private host:HTMLElement,private world:World){}
  async init(){
    await this.app.init({resizeTo:this.host,background:'#243b33',antialias:false,autoDensity:true,resolution:Math.min(devicePixelRatio,2),preference:'webgl',roundPixels:true});
    this.host.prepend(this.app.canvas);this.app.canvas.setAttribute('aria-label','해솔동 지도. 드래그로 이동하고 휠로 확대합니다. 인간은 오른쪽 목록에서도 선택할 수 있습니다.');
    this.root.addChild(new Sprite(cityTexture(this.world)),this.route,this.selection,this.people);this.app.stage.addChild(this.root);
    for(const c of this.world.citizens){const frames=[personTexture(c.id,0),personTexture(c.id,1)];this.textures.push(frames);const s=new Sprite(frames[0]);s.anchor.set(.5,1);this.people.addChild(s);this.sprites.push(s);}
    this.zombieFrames=[zombieTexture(0),zombieTexture(1)];
    for(const z of this.world.zombies){const s=new Sprite(this.zombieFrames[0]);s.anchor.set(.5,1);this.people.addChild(s);this.zombieSprites.push(s);}
    this.width=this.host.clientWidth;this.height=this.host.clientHeight;this.fit();
    this.resizeObserver=new ResizeObserver(()=>{this.width=this.host.clientWidth;this.height=this.host.clientHeight;this.clamp();});this.resizeObserver.observe(this.host);
  }
  get minZoom(){return Math.min(this.width/(CONFIG.width*CONFIG.tile),this.height/(CONFIG.height*CONFIG.tile))*.85;}
  fit(){this.camera.zoom=Math.min(this.width/(CONFIG.width*CONFIG.tile),this.height/(CONFIG.height*CONFIG.tile))*.94;this.camera.x=CONFIG.width*CONFIG.tile/2;this.camera.y=CONFIG.height*CONFIG.tile/2;this.follow=false;}
  clamp(){this.camera.zoom=Math.max(this.minZoom,Math.min(4,this.camera.zoom));const pad=80;this.camera.x=Math.max(-pad,Math.min(CONFIG.width*CONFIG.tile+pad,this.camera.x));this.camera.y=Math.max(-pad,Math.min(CONFIG.height*CONFIG.tile+pad,this.camera.y));}
  toWorld(p:Point){return{x:this.camera.x+(p.x-this.width/2)/this.camera.zoom,y:this.camera.y+(p.y-this.height/2)/this.camera.zoom};}
  zoom(factor:number,p:Point={x:this.width/2,y:this.height/2}){const before=this.toWorld(p);this.camera.zoom*=factor;this.clamp();const after=this.toWorld(p);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.clamp();}
  pan(dx:number,dy:number){this.follow=false;this.camera.x-=dx/this.camera.zoom;this.camera.y-=dy/this.camera.zoom;this.clamp();}
  focus(id:number){const c=id<0?this.world.zombies[-id-1]:this.world.citizens[id];this.camera.x=c.x*CONFIG.tile;this.camera.y=c.y*CONFIG.tile;this.camera.zoom=Math.max(this.camera.zoom,1.5);this.clamp();}
  pick(p:Point){const w=this.toWorld(p);let best:number|null=null,d=Math.max(10,13/this.camera.zoom);for(const c of this.world.citizens){const dist=Math.hypot(c.x*CONFIG.tile-w.x,c.y*CONFIG.tile-6-w.y);if(dist<d){best=c.id;d=dist;}}for(const z of this.world.zombies){const dist=Math.hypot(z.x*CONFIG.tile-w.x,z.y*CONFIG.tile-6-w.y);if(dist<d){best=-z.id-1;d=dist;}}return best;}
  pickBuilding(p:Point){const w=this.toWorld(p),T=CONFIG.tile;return this.world.buildings.find(b=>w.x>=b.x*T&&w.x<(b.x+b.w)*T&&w.y>=b.y*T&&w.y<(b.y+b.h)*T)?.id??null;}
  draw(){
    const T=CONFIG.tile,chosen=this.selected===null?null:(this.selected<0?this.world.zombies[-this.selected-1]:this.world.citizens[this.selected]);
    if(this.follow&&chosen){this.camera.x=chosen.x*T;this.camera.y=chosen.y*T;}
    this.root.scale.set(this.camera.zoom);this.root.position.set(Math.round(this.width/2-this.camera.x*this.camera.zoom),Math.round(this.height/2-this.camera.y*this.camera.zoom));
    this.route.clear();this.selection.clear();
    const main=this.world.mainCharacterId===null?null:this.world.citizens[this.world.mainCharacterId];
    if(main)this.selection.poly([main.x*T,main.y*T-22,main.x*T-3,main.y*T-26,main.x*T+3,main.y*T-26]).fill(0xe4c779);
    if(chosen){
      this.route.moveTo(chosen.x*T,chosen.y*T);for(const p of chosen.path)this.route.lineTo(p.x*T,p.y*T);
      this.route.stroke({width:1.5/this.camera.zoom,color:0xe4c779,alpha:.8});
      if(chosen.path.length){const p=chosen.path[chosen.path.length-1];this.route.rect((Math.floor(p.x))*T,(Math.floor(p.y))*T,T,T).stroke({width:1.5/this.camera.zoom,color:0xe4c779});}
      this.selection.ellipse(chosen.x*T,chosen.y*T-1,9,4).stroke({width:2/this.camera.zoom,color:0xe4c779});
    }
    for(const c of this.world.citizens){const s=this.sprites[c.id];s.position.set(Math.round(c.x*T),Math.round(c.y*T));s.zIndex=c.y;s.texture=this.textures[c.id][c.path.length?Math.floor(this.world.seconds*2+c.id)%2:0];}
    for(const z of this.world.zombies){const s=this.zombieSprites[z.id];s.position.set(Math.round(z.x*T),Math.round(z.y*T));s.zIndex=z.y;s.texture=this.zombieFrames[z.path.length&&!z.contact.length?Math.floor(this.world.seconds*2+z.id)%2:0];}
    this.people.sortableChildren=true;
  }
  destroy(){this.resizeObserver?.disconnect();this.app.destroy(true,{children:true,texture:true,textureSource:true});}
}
