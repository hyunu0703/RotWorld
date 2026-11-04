import type { Point } from './world.ts';
import { THREAT } from '../data/threat.ts';
// Fraction of a walking segment before it enters a zombie's contact circle.
// A person already inside may move out, but cannot move farther into the overlap.
export function contactFraction(from:Point,to:Point,obstacles:Point[]){
  const dx=to.x-from.x,dy=to.y-from.y,A=dx*dx+dy*dy;let fraction=1;
  if(!A)return fraction;
  for(const p of obstacles){
    const ox=from.x-p.x,oy=from.y-p.y,C=ox*ox+oy*oy-THREAT.contact**2,B=2*(ox*dx+oy*dy);
    if(C<=1e-8){if(B<0)fraction=0;continue;}
    const D=B*B-4*A*C;if(D<0)continue;
    const t=(-B-Math.sqrt(D))/(2*A);if(t>=0&&t<fraction)fraction=t;
  }
  return fraction;
}
