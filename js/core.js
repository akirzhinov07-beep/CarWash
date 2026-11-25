// Тяжёлые библиотеки (графики, Excel) подгружаются только когда нужны, с нашего же сайта
const VER = new URL(import.meta.url).searchParams.get('v') || '';
const LIBS = { chart:['vendor/chart.umd.js','Chart'], xlsx:['vendor/xlsx.full.min.js','XLSX'] }, _lib = {};
export const lib = name => _lib[name] || (_lib[name] = new Promise((ok,no)=>{
  const [src,g] = LIBS[name]; if(window[g]) return ok(window[g]);
  const s = document.createElement('script'); s.src = `${src}?v=${VER}`; s.onload = () => ok(window[g]);
  s.onerror = () => { delete _lib[name]; no(new Error('Не удалось загрузить библиотеку. Проверьте интернет')); }; document.head.appendChild(s);
}));
export const S = { user:null, tab:'', data:null, render:()=>{} };
export const $ = (s, r=document) => r.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.round(n||0)) + ' ₽';
export const dt = iso => new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export const CFG_DEFAULTS = { allow_past:false, open_time:'08:00', close_time:'21:30', slot_step:30, biz_phone:'' };
export const cfg = k => { const r=(S.data?.settings||[]).find(x=>x.key===k); return r ? r.value : CFG_DEFAULTS[k]; };
export function freeWindows(date){
  const tm = t => +t.slice(0,2)*60 + +t.slice(3,5), f = m => String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const st = +cfg('slot_step') || 30, open = tm(cfg('open_time')), close = tm(cfg('close_time'));
  const now = new Date(), isToday = date === dkey(now), nowM = now.getHours()*60 + now.getMinutes();
  const day = (S.data.bookings||[]).filter(b => b.status!=='cancelled' && dkey(b.starts_at)===date);
  const wins = []; let cur = null;
  for(let m=open; m<=close; m+=st){
    const past = isToday && m+st<=nowM;
    const busy = day.some(b => { const d=new Date(b.starts_at), bm=d.getHours()*60+d.getMinutes(); return bm>=m && bm<m+st; });
    if(!past && !busy){ if(cur) cur.to = m+st; else cur = {from:m, to:m+st}; } else if(cur){ wins.push(cur); cur = null; }
  }
  if(cur) wins.push(cur);
  return wins.map(w => ({ from:f(w.from), to:f(Math.min(w.to, close+st)), mins:w.to-w.from }));
}
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
  box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'
};
export const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||''}</svg>`;
