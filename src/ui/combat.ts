import { commandCombat,alive,symptoms,type CombatCommand } from '../simulation/combat.ts';
import type { Citizen,World } from '../simulation/world.ts';
import { escapeHTML as esc } from './html.ts';
export function combatMarkup(w:World,c:Citizen){
 const f=c.fighter,infected=f.infectedAt!==null;
 const life=f.converted?'변이 완료':c.vitals.dead?'사망 · '+f.deathReason:'생존';
 return '<h3>전투·상처·감염</h3><p>'+esc(life)+'</p><p>장착: '+(f.equipped?'쇠파이프':'맨손')+'</p>'+
 '<p>'+(infected?'감염됨 · '+(symptoms(c,w.seconds)?'증상기':'잠복기')+' · 변이까지 게임 '+Math.max(0,Math.ceil(((f.diedAt===null?f.infectedAt!+3600:Math.min(f.diedAt+1800,f.infectedAt!+3600))-w.seconds)/60))+'분':'감염 없음')+'</p>'+
 '<p>의심한 인물: '+(Object.entries(f.suspicions).filter(([,m])=>m.suspected).map(([id])=>esc(w.citizens[Number(id)]?.name??'알 수 없는 인물')).join(', ')||'없음')+'</p>'+
 '<ul>'+f.wounds.map(x=>'<li>상처 '+(x.id+1)+' · '+(x.kind==='bite'?'물린 상처':'일반 상처')+' · '+(x.bleeding?'출혈 중':'지혈됨')+(alive(c)&&x.bleeding?'<button data-combat="bandage" data-wound="'+x.id+'">붕대로 지혈</button>':'')+'</li>').join('')+'</ul>'+
 (alive(c)?'<div class="survival-buttons"><button data-combat="equip" data-equipped="'+!f.equipped+'">'+(f.equipped?'장착 해제':'쇠파이프 장착')+'</button></div><label>공격 대상<select id="combat-target">'+w.zombies.filter(z=>!z.dead).map(z=>'<option value="'+z.id+'">좀비 '+(z.id+1)+'</option>').join('')+'</select></label><div class="survival-buttons"><button data-combat="attack">공격</button><button data-combat="push">밀치기</button></div>':'<p>소지품은 원래 인물에 보존됩니다. 시신 약탈은 제공하지 않습니다.</p>')+
 '<p class="subtle">물린 상처를 지혈해도 감염은 사라지지 않습니다. 공격 취소 후에도 사용한 힘과 대기시간은 유지됩니다.</p>';
}
export class CombatPanel {
 private message='';private actor:number|null=null;private target:number|null=null;private last='';
 private w:World;private selected:()=>number|null;
 constructor(w:World,selected:()=>number|null){
 this.w=w;this.selected=selected;
 const root=document.querySelector('#inspector')!;
 root.addEventListener('change',e=>{if((e.target as HTMLElement).id==='combat-target')this.target=Number((e.target as HTMLSelectElement).value);});
 root.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-combat]');if(!b)return;const id=this.selected();if(id===null||id<0)return;
 const kind=b.dataset.combat!;const cmd:CombatCommand=kind==='equip'?{kind,equipped:b.dataset.equipped==='true'}:kind==='bandage'?{kind,wound:Number(b.dataset.wound)}:{kind:kind as 'attack'|'push',target:this.target??Number(document.querySelector<HTMLSelectElement>('#combat-target')?.value)};
 this.message=commandCombat(this.w,id,cmd)||'지시를 적용했습니다.';this.update();});
 }
 update(){const id=this.selected(),c=this.w.citizens.find(c=>c.id===id),host=document.querySelector('#combat-panel');if(!c||!host)return;
 if(id!==this.actor){this.actor=id;this.message='';this.target=null;this.last='';}
 const html=combatMarkup(this.w,c)+'<p role="status">'+esc(this.message)+'</p>';
 if(html!==this.last||!host.innerHTML){host.innerHTML=html;this.last=html;const select=host.querySelector<HTMLSelectElement>('select');if(select&&this.target!==null&&this.w.zombies.some(z=>z.id===this.target&&!z.dead))select.value=String(this.target);}
 }
}
