import type { Citizen,World } from '../simulation/world.ts';
import type { Zombie } from '../simulation/zombies.ts';
import { escapeHTML as esc } from './html.ts';
import { timeLabel } from '../simulation/clock.ts';
export function zombieMarkup(z:Zombie){
  return `<div class="info-section"><span class="overline">ZOMBIE · ${z.id+1}</span><h2>좀비 ${z.id+1}</h2><h3>${{wander:'배회',search:'수색',chase:'추적'}[z.state]}</h3><p>${esc(z.reason)}</p><p>위치 ${z.x.toFixed(1)}, ${z.y.toFixed(1)}</p><p>목표 위치 ${z.goal?`${z.goal.x.toFixed(1)}, ${z.goal.y.toFixed(1)}`:'없음'}</p><p>마지막 목격 ${z.lastSeen===null?'없음':timeLabel(z.lastSeen)}</p><p>이동 속도 ${z.speed.toFixed(2)}타일/게임 초 · 소음 민감도 ×${z.sensitivity.toFixed(1)}</p><p>기억한 소리 ${z.sound?`${z.sound.position.x.toFixed(1)}, ${z.sound.position.y.toFixed(1)} · 청취 ${timeLabel(z.sound.heardAt)}`:'없음'}</p><p class="subtle">실제 감지 정보입니다. 소리만으로 발생자의 신원·현재 위치를 알지 못합니다. 접촉 시 추가 접근을 멈추며 공격·피해·물림·감염은 구현하지 않았습니다.</p></div>`;
}
export function threatMarkup(world:World,c:Citizen){
  const t=c.threat;
  return `<h4>위협 관찰·대응</h4><p>${esc(t.warning||'인지한 좀비 없음 · 안전 보장이 아닙니다.')}</p><p>공포: ${esc(t.fearReason)}</p>${t.interrupted?`<p>중단 행동: ${esc(t.interrupted)}</p>`:''}<ul>${Object.values(t.memories).map(m=>`<li>${t.visible.includes(m.id)?'직접 본 위협':'마지막 목격 기억'} · 좀비 ${m.id+1} · ${m.x.toFixed(1)}, ${m.y.toFixed(1)} · ${timeLabel(m.seenAt)} · ${world.seconds-m.seenAt<=30?'강한 위험':'주의 장소'}</li>`).join('')||'<li>개인 위협 기억 없음</li>'}</ul><p class="subtle">지도는 관찰자에게 실제 좀비 위치를 보여줍니다. 인간은 위 개인 기억만 사용합니다.</p>`;
}
