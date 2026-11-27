import { S, $, esc, money, dt, dkey, countUp, freeWindows, icon, lib, toast } from './core.js';

const PAYN = { cash:'Наличными', card:'Безналичная' };
const pct = id => S.data.staff_pay.find(p=>p.staff_id===id)?.percent ?? 0;
const sname = id => S.data.staff.find(s=>s.id===id)?.name || 'Не указан';
const A = { range:'month', from:'', to:'', tab:'overview', sup:false };
const charts = [];
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const day0 = d => { d=new Date(d); d.setHours(0,0,0,0); return d; };
const salary = o => o.staff_earn!=null ? +o.staff_earn : o.total * pct(o.staff_id) / 100;
const listOf = o => o.list_total!=null ? +o.list_total : (o.services||[]).reduce((t,s)=>t+(+s.price||0),0);

function period(){
  const now = new Date(), end = new Date(day0(now).getTime()+864e5-1);
  if(A.range==='today') return [day0(now), end];
  if(A.range==='week'){ const s=day0(now); s.setDate(s.getDate()-6); return [s,end]; }
  if(A.range==='month') return [new Date(now.getFullYear(),now.getMonth(),1), end];
  if(A.range==='custom' && A.from && A.to) return [day0(A.from), new Date(day0(A.to).getTime()+864e5-1)];
  return [new Date(now.getFullYear(),now.getMonth(),1), end];
}
const inRange = ([a,b]) => S.data.orders.filter(o => { const t=new Date(o.created_at); return t>=a && t<=b; });
function sum(arr){ const rev=arr.reduce((s,o)=>s+o.total,0), sal=arr.reduce((s,o)=>s+salary(o),0), gifts=arr.filter(o=>o.gift), disc=arr.reduce((s,o)=>s+(+o.discount||0),0);
  return { rev, sal, profit:rev-sal, n:arr.length, avg:arr.length?rev/arr.length:0, giftN:gifts.length, giftVal:gifts.reduce((s,o)=>s+listOf(o),0), disc, discN:arr.filter(o=>+o.discount>0).length }; }
function groupBy(arr, keyFn){ const m=new Map(); arr.forEach(o=>{ const k=keyFn(o); (m.get(k)||m.set(k,[]).get(k)).push(o); }); return m; }
function perService(arr){ const m=new Map(); arr.forEach(o=>(o.services||[]).forEach(s=>{ const r=m.get(s.name)||{name:s.name,category:s.category||'',n:0,rev:0}; const l=listOf(o); r.n++; r.rev+=s.price*(l>0?o.total/l:1); m.set(s.name,r); })); return [...m.values()].sort((a,b)=>b.rev-a.rev); }
function perStaff(arr){ const m=groupBy(arr,o=>o.staff_id||0); return [...m].map(([id,l])=>{ const t=sum(l); return {name:sname(id),n:t.n,rev:t.rev,sal:t.sal,avg:t.avg}; }).sort((a,b)=>b.rev-a.rev); }
function perClient(arr){ const m=groupBy(arr,o=>(o.phone||'')+'|'+o.client_name); return [...m].map(([,l])=>({name:l[0].client_name,phone:l[0].phone,car:l[0].car,n:l.length,rev:l.reduce((s,o)=>s+o.total,0)})).sort((a,b)=>b.rev-a.rev); }
function perDay(arr,[a,b]){ const days=[]; for(let d=new Date(a); d<=b; d.setDate(d.getDate()+1)) days.push(dkey(d));
  const m=groupBy(arr,o=>dkey(o.created_at)); return days.map(k=>{ const t=sum(m.get(k)||[]); return {k,...t}; }); }

const suppliesIn = ([a,b]) => (S.data.supplies||[]).filter(x=>{ const d=new Date(x.bought_at+'T12:00'); return d>=a && d<=b; });
function kill(){ charts.splice(0).forEach(c=>c.destroy()); }
function palette(){ return ['--c1','--c2','--c3','--c4','--c5'].map(cssv); }
function baseOpts(){ const grid=cssv('--line'), tx=cssv('--muted'); return { responsive:true, maintainAspectRatio:false, animation:{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:800,easing:'easeOutCubic'},
  plugins:{legend:{labels:{color:tx,usePointStyle:true,boxWidth:8}}, tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+money(c.parsed.y??c.parsed)}}},
  scales:{x:{stacked:true,grid:{display:false},ticks:{color:tx,maxRotation:0,autoSkip:true}},y:{stacked:true,grid:{color:grid},ticks:{color:tx,callback:v=>money(v)}}} }; }
function revChart(el, days){
  if(typeof Chart==='undefined') return; const c=palette();
  charts.push(new Chart(el,{type:'bar',data:{labels:days.map(d=>d.k.slice(5).split('-').reverse().join('.')),
    datasets:[{label:'Зарплаты',data:days.map(d=>d.sal),backgroundColor:c[2],borderRadius:4},{label:'Остальной доход',data:days.map(d=>d.profit),backgroundColor:c[0],borderRadius:4}]},options:baseOpts()}));
}
function donut(el, rows, key='rev', label='name'){
  if(typeof Chart==='undefined') return; const c=palette(), o=baseOpts(); delete o.scales; o.cutout='62%';
  o.plugins.tooltip={callbacks:{label:x=>' '+x.label+': '+money(x.parsed)}}; o.plugins.legend.position='bottom';
  charts.push(new Chart(el,{type:'doughnut',data:{labels:rows.map(r=>r[label]),datasets:[{data:rows.map(r=>r[key]),backgroundColor:rows.map((_,i)=>c[i%c.length]),borderWidth:0}]},options:o}));
}
const kpi = (l,v) => `<div class="card kpi"><span class="lbl">${l}</span><b data-count="${v}">${money(v)}</b></div>`;
const animateKpis = () => document.querySelectorAll('[data-count]').forEach(el=>countUp(el,+el.dataset.count));
const waitChart = fn => { const tab=S.tab; lib('chart').then(()=>{ if(S.tab===tab) fn(); }).catch(e=>toast(e.message,true)); };

/* ---------- ГЛАВНАЯ ---------- */
export const dashboardView = {
  html(){
    const now=new Date(), today=inRange([day0(now),new Date(day0(now).getTime()+864e5-1)]), mon=inRange([new Date(now.getFullYear(),now.getMonth(),1),now]);
    const pend=S.data.bookings.filter(b=>b.status==='pending'&&dkey(b.starts_at)===dkey(now)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
    const t=sum(today), m=sum(mon);
    const wins = freeWindows(dkey(now));
    return `<div class="head"><h2>Главная</h2><span class="muted">${now.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}</span></div>
    <div class="grid g4 stagger">${kpi('Выручка сегодня',t.rev,1)}${kpi('Выручка за месяц',m.rev,1)}
      <div class="card kpi"><span class="lbl">Заказов сегодня</span><b data-count="${t.n}" data-n="1">${t.n}</b></div>
      <div class="card kpi"><span class="lbl">Ждут сегодня</span><b>${pend.length}</b></div></div>
    <div class="grid g-rec" style="margin-top:14px"><div class="card"><h3>Выручка за 14 дней: зарплаты и остальной доход</h3><div class="chartbox"><canvas id="c1"></canvas></div></div>
    <div class="card"><h3>Ближайшие записи</h3>${pend.length?pend.slice(0,7).map(b=>`<div class="row" style="justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)"><span><b>${new Date(b.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</b> ${esc(b.car)}</span><span class="muted small">${esc(b.client_name)}</span></div>`).join(''):'<div class="empty">На сегодня записей нет</div>'}</div></div>
    <div class="card" style="margin-top:14px"><h3>Свободные окна сегодня</h3>
      <div class="row" style="justify-content:space-between;align-items:center"><div class="chips">${wins.length?wins.map(w=>`<span class="pill p-ok">${w.from}–${w.to}</span>`).join(''):'<span class="muted">Свободных окон на сегодня нет</span>'}</div>
      <button class="btn wa" data-act="waOpen">${icon('chat')}Оповестить в WhatsApp</button></div></div>`;
  },
  after(){ kill(); animateKpis(); document.querySelectorAll('[data-n]').forEach(el=>countUp(el,+el.dataset.count,v=>String(Math.round(v))));
    const e=day0(new Date()), s=new Date(e); s.setDate(s.getDate()-13); waitChart(()=>revChart($('#c1'), perDay(inRange([s,new Date(e.getTime()+864e5-1)]),[s,e]))); }
};

/* ---------- АНАЛИТИКА ---------- */
function body(){
  const p=period(), arr=inRange(p), t=sum(arr), svc=perService(arr), stf=perStaff(arr), cli=perClient(arr);
  const newCli=S.data.clients.filter(c=>{const d=new Date(c.created_at);return d>=p[0]&&d<=p[1];}).length;
  const cash=arr.filter(o=>o.pay_type==='cash').reduce((s,o)=>s+o.total,0);
  const supSum=A.sup?suppliesIn(p).reduce((s,x)=>s+x.qty*x.unit_price,0):0;
  if(A.tab==='orders') return `<div class="tablewrap"><table><thead><tr><th>Время</th><th>Авто</th><th>Услуги</th><th>Телефон</th><th>Выполнил</th><th>Оплата</th><th>Скидка</th><th class="right">Сумма</th></tr></thead><tbody>
    ${arr.slice().reverse().map(o=>`<tr><td class="num">${dt(o.created_at)}</td><td>${esc(o.car)}</td><td>${(o.services||[]).map(s=>esc(s.name)).join(', ')}</td><td>${esc(o.phone)}</td><td>${esc(sname(o.staff_id))}</td><td>${o.gift?'🎁 Подарок':(PAYN[o.pay_type]||'')}</td><td>${+o.discount>0?'−'+money(o.discount):''}</td><td class="right num">${money(o.total)}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">Завершённых заказов за период нет</td></tr>'}</tbody></table></div>`;
  const max=Math.max(1,...svc.map(s=>s.rev));
  return `<div class="grid g4 stagger">${kpi('Выручка',t.rev)}${kpi('Зарплаты',t.sal)}${kpi('Остальной доход',t.profit)}${kpi('Средний чек',t.avg)}</div>
  <div class="grid g4 stagger" style="margin-top:14px"><div class="card kpi"><span class="lbl">Заказов</span><b>${t.n}</b></div><div class="card kpi"><span class="lbl">Новых клиентов</span><b>${newCli}</b></div>${kpi('Наличными',cash)}${kpi('Безналичная',t.rev-cash)}</div>
  <div class="grid g4 stagger" style="margin-top:14px">${kpi('Скидки (дано)',t.disc)}<div class="card kpi"><span class="lbl">Заказов со скидкой</span><b>${t.discN}</b></div><div class="card kpi"><span class="lbl">🎁 Подарочных моек</span><b>${t.giftN}</b></div>${kpi('Подарки по прайсу',t.giftVal)}</div>${A.sup?`
  <div class="grid g2 stagger" style="margin-top:14px">${kpi('Расходники за период',supSum)}${kpi('Чистая прибыль (остальной доход − расходники)',t.profit-supSum)}</div>`:''}
  <div class="grid g-rec" style="margin-top:14px"><div class="card"><h3>Выручка по дням: зарплаты и остальной доход</h3><div class="chartbox"><canvas id="a1"></canvas></div></div>
  <div class="card"><h3>Выручка по услугам</h3><div class="chartbox"><canvas id="a2"></canvas></div></div></div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Аналитика по услугам</h3>${svc.map(s=>`<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><b>${esc(s.name)}</b><span class="num">${money(s.rev)} <span class="muted small">· ${s.n} шт.</span></span></div><div class="bar"><i style="width:${s.rev/max*100}%"></i></div></div>`).join('')||'<div class="empty">Нет данных</div>'}</div>
  <div class="card"><h3>KPI сотрудников</h3><div class="tablewrap" style="border:0;box-shadow:none"><table><thead><tr><th>Сотрудник</th><th>Заказов</th><th class="right">Выручка</th><th class="right">Зарплата</th><th class="right">Ср. чек</th></tr></thead><tbody>
    ${stf.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${s.n}</td><td class="right num">${money(s.rev)}</td><td class="right num">${money(s.sal)}</td><td class="right num">${money(s.avg)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Нет данных</td></tr>'}</tbody></table></div></div></div>
  <div class="card" style="margin-top:14px"><h3>Лучшие клиенты периода</h3><div class="tablewrap" style="border:0;box-shadow:none"><table><thead><tr><th>Клиент</th><th>Телефон</th><th>Авто</th><th>Визитов</th><th class="right">Сумма</th></tr></thead><tbody>
    ${cli.slice(0,8).map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.car)}</td><td>${c.n}</td><td class="right num">${money(c.rev)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Нет данных</td></tr>'}</tbody></table></div></div>`;
}
export const analyticsView = {
  html(){ const [a,b]=period();
    return `<div class="head"><h2>Аналитика</h2><button class="btn" data-act="xlsx">⬇ Скачать Excel</button></div>
    <div class="row" style="margin-bottom:16px">
      <div class="seg">${[['today','Сегодня'],['week','7 дней'],['month','Месяц'],['custom','Период']].map(([k,l])=>`<button class="${A.range===k?'on':''}" data-act="range" data-r="${k}">${l}</button>`).join('')}</div>
      ${A.range==='custom'?`<input type="date" id="df" value="${A.from}" data-change="aDate" style="width:auto"><input type="date" id="dtt" value="${A.to}" data-change="aDate" style="width:auto">`:`<span class="muted small">${a.toLocaleDateString('ru-RU')} — ${b.toLocaleDateString('ru-RU')}</span>`}
      <label class="check"><input type="checkbox" data-change="aSup"${A.sup?' checked':''}><span>Включить расходники в аналитику</span></label>
      <div class="seg" style="margin-left:auto"><button class="${A.tab==='overview'?'on':''}" data-act="atab" data-t="overview">Обзор</button><button class="${A.tab==='orders'?'on':''}" data-act="atab" data-t="orders">Заказы</button></div></div>
    ${body()}`; },
  after(){ kill(); animateKpis(); if(A.tab!=='overview') return; const p=period(), arr=inRange(p);
    waitChart(()=>{ revChart($('#a1'),perDay(arr,p)); const s=perService(arr); if(s.length) donut($('#a2'),s); }); }
};
export function registerActions(act){
act.range = el => { A.range=el.dataset.r; if(A.range==='custom'&&!A.from){ const n=new Date(); A.to=dkey(n); n.setDate(n.getDate()-13); A.from=dkey(n);} S.render(); };
act.aSup = el => { A.sup = el.checked; S.render(); };
act.atab = el => { A.tab=el.dataset.t; S.render(); };
act.aDate = () => { A.from=$('#df').value; A.to=$('#dtt').value; S.render(); };
act.xlsx = async () => {
  await lib('xlsx');
  const p=period(), arr=inRange(p), t=sum(arr), wb=XLSX.utils.book_new(), add=(n,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{'':'Нет данных'}]),n);
  add('Сводка',[{Показатель:'Период',Значение:p[0].toLocaleDateString('ru-RU')+' — '+p[1].toLocaleDateString('ru-RU')},{Показатель:'Выручка',Значение:t.rev},{Показатель:'Зарплаты',Значение:t.sal},{Показатель:'Остальной доход',Значение:t.profit},{Показатель:'Заказов',Значение:t.n},{Показатель:'Скидки, ₽',Значение:t.disc},{Показатель:'Подарочных моек',Значение:t.giftN},{Показатель:'Подарки по прайсу, ₽',Значение:t.giftVal},{Показатель:'Средний чек',Значение:Math.round(t.avg)}].concat(A.sup?[{Показатель:'Расходники',Значение:suppliesIn(p).reduce((s,x)=>s+x.qty*x.unit_price,0)},{Показатель:'Чистая прибыль (доход − расходники)',Значение:t.profit-suppliesIn(p).reduce((s,x)=>s+x.qty*x.unit_price,0)}]:[]));
  add('По дням',perDay(arr,p).map(d=>({Дата:d.k,Заказов:d.n,Выручка:d.rev,Зарплаты:d.sal,'Остальной доход':d.profit})));
  add('Услуги',perService(arr).map(s=>({Услуга:s.name,Категория:s.category,Количество:s.n,Выручка:s.rev})));
  add('Сотрудники',perStaff(arr).map(s=>({Сотрудник:s.name,Заказов:s.n,Выручка:s.rev,Зарплата:s.sal,'Средний чек':Math.round(s.avg)})));
  add('Клиенты',perClient(arr).map(c=>({Клиент:c.name,Телефон:c.phone,Авто:c.car,Визитов:c.n,Сумма:c.rev})));
  if(A.sup) add('Расходники',suppliesIn(p).map(x=>({Дата:x.bought_at,Название:x.name,Количество:x.qty,'Цена за ед.':x.unit_price,Сумма:x.qty*x.unit_price,Примечание:x.note||''})));
  add('Заказы',arr.map(o=>({Дата:dt(o.created_at),Авто:o.car,Услуги:(o.services||[]).map(s=>s.name).join(', '),Телефон:o.phone,Сотрудник:sname(o.staff_id),Оплата:o.gift?'Подарок':PAYN[o.pay_type],'По прайсу':listOf(o),Скидка:+o.discount||0,Сумма:o.total,'ЗП сотруднику':salary(o)})));
  XLSX.writeFile(wb,`CarwasH_${dkey(p[0])}_${dkey(p[1])}.xlsx`);
};
}
