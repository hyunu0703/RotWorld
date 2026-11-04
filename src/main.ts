import './style.css';
import { createWorld } from './simulation/world.ts';
import { SimulationClock } from './simulation/clock.ts';
import { Scene } from './rendering/scene.ts';
import { Interface, mountUI } from './ui/interface.ts';
const world=createWorld(),clock=new SimulationClock();mountUI(world);
const host=document.querySelector<HTMLElement>('#map')!,scene=new Scene(host,world);
async function start(){
  await scene.init();document.querySelector('#loading')!.remove();const ui=new Interface(world,clock,scene);
  const pointers=new Map<number,{x:number;y:number}>();let down={x:0,y:0},moved=false,pinchDistance=0;
  const point=(e:PointerEvent|WheelEvent)=>{const r=host.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const canvas=scene.app.canvas;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);const p=point(e);pointers.set(e.pointerId,p);down=p;moved=false;host.focus({preventScroll:true});if(pointers.size===2){moved=true;const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}});
  canvas.addEventListener('pointermove',e=>{
    const previous=pointers.get(e.pointerId);if(!previous)return;const p=point(e);pointers.set(e.pointerId,p);
    if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0)scene.zoom(d/pinchDistance,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});pinchDistance=d;moved=true;}
    else if(moved||Math.hypot(p.x-down.x,p.y-down.y)>4){moved=true;scene.pan(p.x-previous.x,p.y-previous.y);}
  });
  canvas.addEventListener('pointerup',e=>{if(!moved&&pointers.size===1)ui.select(scene.pick(point(e)));pointers.delete(e.pointerId);if(pointers.size===1)moved=true;pinchDistance=0;});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);moved=true;pinchDistance=0;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();scene.zoom(Math.exp(-e.deltaY*.0015),point(e));},{passive:false});
  const keys=new Set<string>();
  window.addEventListener('keydown',e=>{
    if((e.target as HTMLElement).matches('input,textarea,select'))return;
    if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();if(!e.repeat)ui.togglePause();}
    if(e.key.toLowerCase()==='f'){scene.fit();ui.update();}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();keys.add(e.key);}
  });window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
  let last=performance.now(),lastUI=0;
  document.addEventListener('visibilitychange',()=>{last=performance.now();keys.clear();});
  scene.app.ticker.add(()=>{
    const now=performance.now(),dt=(now-last)/1000;last=now;
    // 숨긴 탭에서는 시제품을 진행하지 않으며, 복귀 후 누적 시간을 몰아서 계산하지 않는다.
    if(!document.hidden){if(dt<2)clock.advance(dt,world);else{clock.paused=true;ui.update();}
      const dx=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*300*dt;
      const dy=(Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp')))*300*dt;if(dx||dy)scene.pan(-dx,-dy);}
    scene.draw();if(now-lastUI>150){ui.update();lastUI=now;}
  });
}
start().catch(error=>{console.error(error);document.querySelector('#loading')!.textContent='도시 화면을 열지 못했습니다. WebGL을 지원하는 브라우저에서 새로고침해 주세요.';});
