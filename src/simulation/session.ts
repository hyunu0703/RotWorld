import { defaultDraft, validateCharacter, type CharacterDraft } from '../data/character.ts';
import { createWorld, record, type World } from './world.ts';
export class GameSession {
  private counter=0;
  world:World|null=null;
  status:'creation'|'active'|'ended'='creation';
  runId=''; endReason='';
  start(draft:CharacterDraft=defaultDraft()) {
    if(this.status==='active')throw new Error('진행 중인 회차를 먼저 종료해 주세요.');
    const errors=validateCharacter(draft);if(errors.length)throw new Error(errors.join('\n'));
    const profile=structuredClone(draft);profile.name=profile.name.trim();
    const world=createWorld(profile);
    this.runId=`${String(++this.counter).padStart(2,'0')}-${crypto.randomUUID().slice(0,8)}`;
    world.runId=this.runId;this.world=world;this.status='active';this.endReason='';
    record(world,`${profile.name} · 메인 캐릭터로 세계에 진입했습니다.`);
    return world;
  }
  end(reason:string){
    if(this.status!=='active'||!this.world)return;
    this.world.active=false;this.world.citizens.length=0;this.world.zombies.length=0;this.world.noises.length=0;this.world.events.length=0;this.world.buildings.length=0;
    this.world=null;this.status='ended';this.endReason=reason;
  }
  // 추후 전투·부상의 실제 사망 확정 사건이 호출한다. 선택 대상과 종료 기준 인물은 독립적이다.
  confirmDeath(citizenId:number) {
    if(!this.world||this.status!=='active')return;
    if(citizenId===this.world.mainCharacterId)this.end('메인 캐릭터가 사망하여 회차가 종료되었습니다.');
  }
}
