import { CONFIG } from '../data/config.ts';
import { stepWorld, type World } from './world.ts';
export class SimulationClock {
  speed=1; paused=false; private accumulator=0;
  advance(realSeconds:number,world:World) {
    if(this.paused||!world.active||!Number.isFinite(realSeconds)||realSeconds<=0)return;
    this.accumulator+=realSeconds*this.speed;
    while(this.accumulator+1e-10>=CONFIG.step){
      stepWorld(world,CONFIG.step*CONFIG.gameSecondsPerRealSecond);
      this.accumulator-=CONFIG.step;
    }
  }
}
export function timeLabel(seconds:number) {
  const total=Math.floor(seconds)+CONFIG.startHour*3600;
  return `${String(Math.floor(total/3600)%24).padStart(2,'0')}:${String(Math.floor(total/60)%60).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
