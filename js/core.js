export const S = { user:null, tab:'', data:null, render:()=>{} };
export const $ = (s, r=document) => r.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.round(n||0)) + ' ₽';
export const dt = iso => new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function maskPhone(v){
  let d = String(v||'').replace(/\D/g,''); if(d[0]==='7'||d[0]==='8') d = d.slice(1); d = d.slice(0,10);
  if(!d.length) return '';
  let o = '+7 (' + d.slice(0,3);
  if(d.length>3) o += ') ' + d.slice(3,6);
  if(d.length>6) o += '-' + d.slice(6,8);
  if(d.length>8) o += '-' + d.slice(8,10);
  return o;
}
export const dkey = d => { d=new Date(d); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
export const localInput = (d=new Date()) => { d=new Date(d); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); };
export function toast(msg, bad){
  const t = document.createElement('div'); t.className='toast'+(bad?' bad':''); t.textContent=msg;
  document.getElementById('toasts').append(t); setTimeout(()=>{ t.style.transition='opacity .3s'; t.style.opacity=0; setTimeout(()=>t.remove(),300); }, bad?9000:3200);
}
export function modal(html){
  const o = document.createElement('div'); o.className='overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('mousedown', e => { if(e.target===o) o.remove(); });
  const esc_ = e => { if(e.key==='Escape'){ o.remove(); document.removeEventListener('keydown',esc_);} };
  document.addEventListener('keydown', esc_);
  document.body.append(o); o.querySelector('input,select,button')?.focus(); return o;
}
// анимация счётчика
export function countUp(el, to, fmt=money){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ el.textContent=fmt(to); return; }
  const t0=performance.now(), dur=700; (function f(t){ const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3); el.textContent=fmt(to*e); if(k<1) requestAnimationFrame(f); })(t0);
}
const P = {
  drop:'<path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1"/>', badge:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin:'<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'
};
export const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||''}</svg>`;
