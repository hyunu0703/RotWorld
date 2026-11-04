import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, findPath, walkable, stepWorld } from '../src/simulation/world.ts';
import { SimulationClock } from '../src/simulation/clock.ts';

test('동일 시간은 프레임 분할과 관계없이 같은 상태, 정지는 완전 보존',()=>{
  const a=createWorld(),b=createWorld(),ca=new SimulationClock(),cb=new SimulationClock();
  for(let i=0;i<600;i++)ca.advance(1/60,a);
  for(let i=0;i<200;i++)cb.advance(.05,b);
  assert.deepEqual(a,b);const snapshot=structuredClone(a);ca.paused=true;ca.advance(20,a);assert.deepEqual(a,snapshot);
  const d=createWorld(),cd=new SimulationClock();cd.speed=4;cd.advance(2.5,d);assert.deepEqual(d,b);
});
test('모든 건물 입구 간 경로는 연결되고 건물 내부를 통과하지 않음',()=>{
  const w=createWorld();
  for(const a of w.buildings)for(const b of w.buildings){
    const path=findPath(a.door,b.door,w.buildings);assert.ok(path);
    let previous={x:a.door.x+.5,y:a.door.y+.5};
    for(const p of path){assert.ok(walkable({x:Math.floor(p.x),y:Math.floor(p.y)},w.buildings));assert.equal(Math.abs(p.x-previous.x)+Math.abs(p.y-previous.y),1);previous=p;}
  }
  assert.equal(findPath({x:0,y:0},w.buildings[0].door,w.buildings),null);
  assert.equal(findPath(w.buildings[0].door,{x:8,y:8},w.buildings),null);
});
test('장시간 이동에도 유효 위치 유지, 도착과 대기 후 다음 이동',()=>{
  const w=createWorld();for(let i=0;i<2400;i++)stepWorld(w,.3);
  assert.ok(w.citizens.every(c=>c.visits>0));
  for(const c of w.citizens)assert.ok(walkable({x:Math.floor(c.x),y:Math.floor(c.y)},w.buildings));
  assert.ok(w.events.length<=40);assert.ok(w.events.some(e=>e.text.includes('도착')));
});
