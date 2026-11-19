import { db } from './db.js';
import { S, $, esc, money, dt, dkey, localInput, toast, modal, countUp, icon, maskPhone } from './core.js';
const CATS = ['Мойка','Детейлинг','Химчистка','Полировка','Защита','Прочее'];
const catRank = c => { const i = CATS.indexOf(c); return i<0 ? 99 : i; };
import { analyticsView, dashboardView, registerActions } from './analytics.js';

export const NAV = [
  { id:'dashboard', title:'Главная', icon:'home', roles:['admin'] },
  { id:'record', title:'Запись', icon:'plus', roles:['admin','staff'] },
  { id:'bookings', title:'Записи', icon:'list', roles:['admin','staff'] },
  { id:'clients', title:'Клиенты', icon:'users', roles:['admin','staff'] },
  { id:'services', title:'Услуги', icon:'tag', roles:['admin'] },
  { id:'staff', title:'Сотрудники', icon:'badge', roles:['admin'] },
  { id:'supplies', title:'Расходники', icon:'box', roles:['admin'] },
  { id:'analytics', title:'Аналитика', icon:'chart', roles:['admin'] },
];
const digits = p => String(p||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7');
const isAdmin = () => S.user.role==='admin';
const STATUS = { pending:['Ожидает','p-warn'], done:['Выполнено','p-ok'], cancelled:['Отказался','p-bad'] };
const PAY = { cash:'Наличными', card:'Безналичная оплата' };
export const payName = p => PAY[p] || '—';
const bySvc = id => S.data.services.find(s=>s.id===id);
const staffName = id => S.data.staff.find(s=>s.id===id)?.name || '—';

/* ================= ЗАПИСЬ ================= */
const rec = { client:null, svcs:new Set(), q:'', date:null, time:null };
const pad2 = n => String(n).padStart(2,'0');
const SLOTS = []; for(let m=8*60; m<=21*60+30; m+=30) SLOTS.push(pad2(Math.floor(m/60))+':'+pad2(m%60));
const toMin = t => +t.slice(0,2)*60 + +t.slice(3,5);
function recDefaults(){
  const now=new Date(), today=dkey(now);
  if(rec.date && rec.date>=today && rec.time) return;
  let m = Math.ceil((now.getHours()*60+now.getMinutes())/30)*30;
  if(m<8*60) m=8*60;
  if(m>21*60+30){ const t=new Date(now.getTime()+864e5); rec.date=dkey(t); rec.time='09:00'; }
  else { rec.date=today; rec.time=pad2(Math.floor(m/60))+':'+pad2(m%60); }
}
function slotsHtml(){
  const now=new Date(), isToday=rec.date===dkey(now), nowM=now.getHours()*60+now.getMinutes();
  const day=S.data.bookings.filter(b=>b.status!=='cancelled' && dkey(b.starts_at)===rec.date);
  return SLOTS.map(t=>{
    const m=toMin(t), n=day.filter(b=>{ const d=new Date(b.starts_at), bm=d.getHours()*60+d.getMinutes(); return bm>=m && bm<m+30; }).length;
    const past = isToday && m+30<=nowM;
    return `<button type="button" class="slot${rec.time===t?' on':''}${n?' busy':''}" data-act="recSlot" data-t="${t}"${past?' disabled':''}>${t}${n?`<small>занято: ${n}</small>`:''}</button>`;
  }).join('');
}
function whenBlock(){
  recDefaults(); const today=dkey(new Date()), tm=dkey(new Date(Date.now()+864e5));
  return `<div class="field"><span>Дата</span><div class="row"><div class="seg" id="recdays">${dayBtns(today,tm)}</div>
    <input type="date" id="recdate" value="${rec.date}" min="${today}" data-change="recDate" style="width:auto"></div></div>
  <div class="field"><span>Время <b id="rectime" class="num" style="color:var(--text)">${rec.time||''}</b></span><div class="slots" id="slots">${slotsHtml()}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="recNow">Сейчас</button><label class="muted small" style="display:flex;align-items:center;gap:8px">или своё время <input type="time" step="300" id="rectcustom" data-change="recTime" style="width:auto;min-height:36px"></label></div></div>`;
}
const dayBtns = (today,tm) => `<button type="button" class="${rec.date===today?'on':''}" data-act="recDay" data-d="0">Сегодня</button><button type="button" class="${rec.date===tm?'on':''}" data-act="recDay" data-d="1">Завтра</button>`;
function refreshWhen(){
  const today=dkey(new Date()), tm=dkey(new Date(Date.now()+864e5));
  const a=$('#recdays'); if(a) a.innerHTML=dayBtns(today,tm);
  const d=$('#recdate'); if(d) d.value=rec.date; const s=$('#slots'); if(s) s.innerHTML=slotsHtml(); const t=$('#rectime'); if(t) t.textContent=rec.time||'';
}
const recView = {
  html(){
    const cats = [...new Set(S.data.services.filter(s=>s.active).map(s=>s.category))].sort((a,b)=>catRank(a)-catRank(b));
    return `<div class="head"><h2>Запись клиента</h2></div>
    <form data-form="saveBooking" class="grid g-rec" autocomplete="off">
      <div class="card stagger"><h3>1. Клиент</h3>
        <div id="picked"></div>
        <label class="field" style="margin-top:0"><span>Поиск по имени, телефону или авто</span><input data-input="recSearch" id="rq" placeholder="Начните вводить…"></label>
        <div id="sugg"></div>
        <div class="f2"><label class="field"><span>Имя клиента</span><input name="name" required></label>
        <label class="field"><span>Телефон *</span><input name="phone" type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone data-input="recPhone" required></label></div>
        <label class="field"><span>Марка и модель авто *</span><input name="car" placeholder="Toyota Camry" required></label>
        ${whenBlock()}
        <div><label class="field"><span>Сотрудник (необязательно)</span><select name="staff"><option value="">Любой</option>${S.data.staff.filter(s=>s.active).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label></div>
        <label class="field"><span>Комментарий</span><textarea name="comment"></textarea></label>
      </div>
      <div class="card stagger"><h3>2. Услуги</h3>
        ${cats.map(c=>`<div class="cat">${esc(c)}</div><div class="chips">${S.data.services.filter(s=>s.active&&s.category===c).map(s=>
          `<button type="button" class="chip${rec.svcs.has(s.id)?' on':''}" data-act="togSvc" data-id="${s.id}">${esc(s.name)}<small>${money(s.price)} · ${s.minutes} мин</small></button>`).join('')}</div>`).join('') || '<div class="empty">Услуг пока нет</div>'}
        <div class="total"><span class="muted">Итого</span><b id="tot" class="num">0 ₽</b></div>
        <button class="btn primary block" style="margin-top:0" type="submit">Записать клиента</button>
      </div>
    </form>`;
  },
  after(){ recView.sync(); }, 
  sync(){
    const t = [...rec.svcs].reduce((s,id)=>s+(bySvc(id)?.price||0),0); const el=$('#tot'); if(el) el.textContent=money(t);
    const p=$('#picked'); if(!p) return;
    p.innerHTML = rec.client ? `<div class="picked" style="margin-bottom:12px"><span>✓ ${esc(rec.client.name)} · ${esc(rec.client.car||'')}</span><button type="button" class="btn sm" data-act="unpick">Сменить</button></div>` : '';
  }
};

/* ================= ЗАПИСИ ================= */
const bk = { day: dkey(new Date()) };
const statusCtl = b => b.status==='pending'
  ? `<select data-change="setStatus" data-id="${b.id}" style="min-width:150px;width:auto"><option value="pending">Ожидает</option><option value="done">Выполнено</option><option value="cancelled">Отказался</option></select>`
  : `<span class="pill ${STATUS[b.status][1]}">${STATUS[b.status][0]}</span>${b.pay_type?`<br><span class="muted small">${PAY[b.pay_type]}</span>`:''}`;
const bookingsView = {
  html(){
    const list = S.data.bookings.filter(b=>dkey(b.starts_at)===bk.day).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
    return `<div class="head"><h2>Записи</h2><div class="row"><button class="btn sm" data-act="dayShift" data-d="-1">←</button>
      <input type="date" value="${bk.day}" data-change="setDay" style="width:auto"><button class="btn sm" data-act="dayShift" data-d="1">→</button>
      <button class="btn sm" data-act="dayToday">Сегодня</button></div></div>
    ${list.length? `<div class="mcards">${list.map(b=>`<div class="mcard"><div class="mrow"><b class="num">${new Date(b.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</b>${statusCtl(b)}</div>
      <div><b>${esc(b.client_name)}</b> · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div><div>${esc(b.car)}</div>
      <div class="muted small">${(b.services||[]).map(s=>esc(s.name)).join(', ')}${b.comment?` · 💬 ${esc(b.comment)}`:''}</div>
      <div class="mrow"><span class="muted small">${staffName(b.staff_id)}</span><b class="num">${money(b.total)}</b></div></div>`).join('')}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Время</th><th>Клиент</th><th>Авто</th><th>Услуги</th><th>Сотрудник</th><th class="right">Сумма</th><th>Статус</th></tr></thead><tbody>
    ${list.map(b=>`<tr><td class="num">${new Date(b.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</td>
      <td><b>${esc(b.client_name)}</b><br><span class="muted small">${esc(b.phone)}</span>${b.comment?`<br><span class="muted small">💬 ${esc(b.comment)}</span>`:''}</td>
      <td>${esc(b.car)}</td><td>${(b.services||[]).map(s=>esc(s.name)).join(', ')}</td><td>${staffName(b.staff_id)}</td>
      <td class="right num">${money(b.total)}</td>
      <td>${statusCtl(b)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card empty">На этот день записей нет</div>`}`;
  }
};

/* ================= КЛИЕНТЫ ================= */
const cl = { q:'' };
function clientRows(){
  const q = cl.q.trim().toLowerCase(), qd = digits(cl.q);
  const list = S.data.clients.filter(c => !q || c.name.toLowerCase().includes(q) || (qd && digits(c.phone).includes(qd)) || (c.car||'').toLowerCase().includes(q)).slice().reverse();
  const stat = c => { const o=S.data.orders.filter(o=>digits(o.phone)===digits(c.phone)); return [o.length,o.reduce((s,x)=>s+x.total,0)]; };
  return list.length? list.map(c=>{ const [n,sum]=isAdmin()?stat(c):[0,0]; return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.car||'—')}</td><td class="muted">${esc(c.note||'')}</td>
    ${isAdmin()?`<td class="num">${n}</td><td class="num">${money(sum)}</td><td class="right"><button class="btn sm" data-act="editClient" data-id="${c.id}">Изменить</button></td>`:''}</tr>`; }).join('')
    : `<tr><td colspan="7" class="empty">Никого не найдено</td></tr>`;
}
function clientCards(){
  const q = cl.q.trim().toLowerCase(), qd = digits(cl.q);
  const list = S.data.clients.filter(c => !q || c.name.toLowerCase().includes(q) || (qd && digits(c.phone).includes(qd)) || (c.car||'').toLowerCase().includes(q)).slice().reverse();
  return list.length ? list.map(c=>`<div class="mcard"><div class="mrow"><b>${esc(c.name)}</b>${isAdmin()?`<button class="btn sm" data-act="editClient" data-id="${c.id}">Изменить</button>`:''}</div>
    <div><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div><div>${esc(c.car||'—')}</div>${c.note?`<div class="muted small">${esc(c.note)}</div>`:''}</div>`).join('') : '<div class="card empty">Никого не найдено</div>';
}
const clientsView = {
  html(){ return `<div class="head"><h2>Клиенты</h2><button class="btn primary" data-act="newClient">+ Новый клиент</button></div>
    <input data-input="clSearch" placeholder="Поиск по ФИО, телефону или авто" value="${esc(cl.q)}" style="margin-bottom:14px;max-width:460px">
    <div class="mcards" id="clcards">${clientCards()}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Клиент</th><th>Телефон</th><th>Авто</th><th>Заметка</th>${isAdmin()?'<th>Визитов</th><th>Потрачено</th><th></th>':''}</tr></thead><tbody id="clrows">${clientRows()}</tbody></table></div>`; }
};

/* ================= УСЛУГИ / СОТРУДНИКИ ================= */
const servicesView = {
  html(){ return `<div class="head"><h2>Услуги</h2><button class="btn primary" data-act="editService" data-id="">+ Услуга</button></div>
    <div class="tablewrap"><table><thead><tr><th>Название</th><th>Категория</th><th class="right">Цена</th><th>Время</th><th>Статус</th><th></th></tr></thead><tbody>
    ${S.data.services.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.category)}</td><td class="right num">${money(s.price)}</td><td>${s.minutes} мин</td>
    <td><span class="pill ${s.active?'p-ok':'p-warn'}">${s.active?'Активна':'Скрыта'}</span></td><td class="right"><button class="btn sm" data-act="editService" data-id="${s.id}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`; }
};
const staffView = {
  html(){ return `<div class="head"><h2>Сотрудники</h2><button class="btn primary" data-act="editStaff" data-id="">+ Сотрудник</button></div>
    <div class="tablewrap"><table><thead><tr><th>Имя</th><th>Должность</th><th>Телефон</th><th class="right">% от заказа</th><th>Доступ в систему</th><th>Статус</th><th></th></tr></thead><tbody>
    ${S.data.staff.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.position||'')}</td><td>${esc(s.phone||'')}</td><td class="right num">${pay(s.id)}%</td>
    <td>${loginOf(s.id)?`<span class="pill p-ok">🔑 ${esc(loginOf(s.id).full_name)}</span>`:'<span class="pill p-warn">Нет входа</span>'}</td>
    <td><span class="pill ${s.active?'p-ok':'p-warn'}">${s.active?'Работает':'Не работает'}</span></td><td class="right"><button class="btn sm" data-act="editStaff" data-id="${s.id}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`; }
};
export const loginOf = id => (S.data.profiles||[]).find(p=>p.staff_id===id);
export const pay = id => S.data.staff_pay.find(p=>p.staff_id===id)?.percent ?? 0;

/* ================= РАСХОДНИКИ ================= */
const money2 = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
const suppliesView = {
  html(){
    const list = (S.data.supplies||[]).slice().sort((a,b)=>(b.bought_at||'').localeCompare(a.bought_at||'') || b.id-a.id);
    const tot = x => x.qty*x.unit_price, now=new Date(), mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    const month = list.filter(x=>(x.bought_at||'').startsWith(mk)).reduce((s,x)=>s+tot(x),0), all = list.reduce((s,x)=>s+tot(x),0);
    return `<div class="head"><h2>Расходники</h2><button class="btn primary" data-act="editSupply" data-id="">+ Закупка</button></div>
    ${S.data._suppliesMissing?`<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>Раздел ещё не подключён к базе.</b><p class="muted small" style="margin-top:6px">Откройте в репозитории файл <code>supabase/supplies.sql</code>, вставьте его в Supabase → SQL Editor и нажмите Run. Затем обновите страницу.</p></div>`:''}
    <div class="grid g3 stagger" style="margin-bottom:14px"><div class="card kpi"><span class="lbl">Закуплено за этот месяц</span><b data-count="${month}">${money(month)}</b></div>
      <div class="card kpi"><span class="lbl">Закуплено всего</span><b data-count="${all}">${money(all)}</b></div><div class="card kpi"><span class="lbl">Позиций в журнале</span><b>${list.length}</b></div></div>
    ${list.length?`<div class="tablewrap"><table><thead><tr><th>Дата</th><th>Что заказали</th><th class="right">Кол-во</th><th class="right">Цена за ед.</th><th class="right">Сумма</th><th>Примечание</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr><td class="num">${new Date(x.bought_at+'T12:00').toLocaleDateString('ru-RU')}</td><td><b>${esc(x.name)}</b></td><td class="right num">${money2(x.qty)}</td><td class="right num">${money(x.unit_price)}</td><td class="right num"><b>${money(tot(x))}</b></td><td class="muted">${esc(x.note||'')}</td><td class="right"><button class="btn sm" data-act="editSupply" data-id="${x.id}">Изменить</button></td></tr>`).join('')}
    </tbody></table></div>`:`<div class="card empty">Закупок пока нет. Нажмите «+ Закупка» и запишите, что заказали.</div>`}`;
  },
  after(){ document.querySelectorAll('[data-count]').forEach(el=>countUp(el,+el.dataset.count)); }
};

export const views = { dashboard:dashboardView, supplies:suppliesView, record:recView, bookings:bookingsView, clients:clientsView, services:servicesView, staff:staffView, analytics:analyticsView, actions:{} };
const A = views.actions;
registerActions(A);

/* ---------- действия ---------- */
A.recDay = el => { const d=new Date(); d.setDate(d.getDate()+ +el.dataset.d); rec.date=dkey(d); if(rec.date===dkey(new Date()) && rec.time && toMin(rec.time)+30<=new Date().getHours()*60+new Date().getMinutes()) { rec.time=null; } refreshWhen(); };
A.recDate = el => { if(!el.value) return; rec.date=el.value; refreshWhen(); };
A.recSlot = el => { rec.time=el.dataset.t; const c=$('#rectcustom'); if(c) c.value=''; refreshWhen(); };
A.recNow = () => { const n=new Date(); rec.date=dkey(n); rec.time=pad2(n.getHours())+':'+pad2(n.getMinutes()); refreshWhen(); };
A.recTime = el => { if(el.value){ rec.time=el.value; refreshWhen(); } };
A.togSvc = el => { const id=+el.dataset.id; rec.svcs.has(id)?rec.svcs.delete(id):rec.svcs.add(id); el.classList.toggle('on'); recView.sync(); };
A.unpick = () => { rec.client=null; recView.sync(); };
A.recSearch = el => {
  const q=el.value.trim().toLowerCase(), qd=digits(el.value), box=$('#sugg');
  if(q.length<2){ box.innerHTML=''; return; }
  const r = S.data.clients.filter(c=>c.name.toLowerCase().includes(q)||(qd.length>=3&&digits(c.phone).includes(qd))||(c.car||'').toLowerCase().includes(q)).slice(0,6);
  box.innerHTML = r.length? `<div class="suggest">${r.map(c=>`<button type="button" data-act="pickClient" data-id="${c.id}"><span><b>${esc(c.name)}</b> · ${esc(c.car||'')}</span><span class="muted">${esc(c.phone)}</span></button>`).join('')}</div>` : '<p class="muted small" style="margin-top:6px">Не найден — заполните данные ниже, клиент сохранится автоматически</p>';
};
A.recPhone = el => {
  const d = digits(el.value), f = el.form;
  if(rec.client && digits(rec.client.phone)!==d){ rec.client=null; recView.sync(); }
  if(d.length!==11 || rec.client) return;
  const c = S.data.clients.find(x=>digits(x.phone)===d); if(!c) return;
  rec.client=c; f.name.value=c.name; f.car.value=c.car||''; recView.sync(); toast('Клиент найден: данные подставлены');
};
A.pickClient = el => {
  const c = S.data.clients.find(x=>x.id===+el.dataset.id); rec.client=c; const f=$('form[data-form=saveBooking]');
  f.name.value=c.name; f.phone.value=maskPhone(c.phone); f.car.value=c.car||''; $('#sugg').innerHTML=''; $('#rq').value=''; recView.sync();
};
A.saveBooking = async f => {
  const name=f.name.value.trim(), phone=f.phone.value.trim(), car=f.car.value.trim();
  if(digits(phone).length!==11) throw new Error('Введите номер полностью: +7 (900) 000-00-00');
  if(!rec.svcs.size) throw new Error('Выберите хотя бы одну услугу');
  if(!rec.date || !rec.time) throw new Error('Выберите дату и время');
  let client = rec.client || S.data.clients.find(c=>digits(c.phone)===digits(phone));
  if(!client){ client = await db.insert('clients',{name,phone,car}); S.data.clients.push(client); }
  else if(client.car!==car && car){ await db.update('clients',client.id,{car}); client.car=car; }
  const svcs=[...rec.svcs].map(id=>{const s=bySvc(id);return {id:s.id,name:s.name,category:s.category,price:s.price};});
  const b = await db.insert('bookings',{ client_id:client.id, client_name:name||client.name, phone, car, comment:f.comment.value.trim()||null,
    services:svcs, total:svcs.reduce((s,x)=>s+x.price,0), staff_id:f.staff.value?+f.staff.value:null, starts_at:new Date(`${rec.date}T${rec.time}`).toISOString() });
  S.data.bookings.push(b); rec.client=null; rec.svcs=new Set(); rec.date=null; rec.time=null; bk.day=dkey(b.starts_at);
  toast('Клиент записан ✓'); S.tab='bookings'; S.render();
};
A.setDay = el => { bk.day=el.value||dkey(new Date()); S.render(); };
A.dayToday = () => { bk.day=dkey(new Date()); S.render(); };
A.dayShift = el => { const d=new Date(bk.day+'T12:00'); d.setDate(d.getDate()+ +el.dataset.d); bk.day=dkey(d); S.render(); };
A.setStatus = async el => {
  const b = S.data.bookings.find(x=>x.id===+el.dataset.id), v = el.value;
  if(v==='pending') return;
  if(v==='cancelled'){ b.status='cancelled'; await db.update('bookings',b.id,{status:'cancelled'}); toast('Запись отменена'); return S.render(); }
  const m = modal(`<h3>Оплата</h3><p class="muted">${esc(b.client_name)} · ${esc(b.car)} · <b>${money(b.total)}</b></p>
    <form data-form="payDone" data-id="${b.id}"><div class="field"><span>Тип оплаты</span><div class="paychoice"><label class="opt"><input type="radio" name="pay" value="cash" checked><b>💵 Наличными</b></label><label class="opt"><input type="radio" name="pay" value="card"><b>💳 Безналичная оплата</b></label></div></div>
    <label class="field"><span>Кто выполнил</span><select name="staff" required><option value="">— выберите —</option>${S.data.staff.filter(s=>s.active).map(s=>`<option value="${s.id}"${s.id===b.staff_id?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
    <div class="actions"><button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Подтвердить</button></div></form>`);
  m.addEventListener('mousedown', e=>{ if(e.target===m) S.render(); });
};
A.closeModal = el => { el.closest('.overlay').remove(); S.render(); };
A.payDone = async f => {
  const b = S.data.bookings.find(x=>x.id===+f.dataset.id), pay_type=f.querySelector('[name=pay]:checked').value, staff_id=+f.staff.value;
  await db.update('bookings',b.id,{status:'done',pay_type,staff_id});
  Object.assign(b,{status:'done',pay_type,staff_id});
  const o = { booking_id:b.id, client_name:b.client_name, phone:b.phone, car:b.car, services:b.services, total:b.total, staff_id, pay_type };
  if(isAdmin()) S.data.orders.push(await db.insert('orders',o)); else await db.insert('orders',o,false);
  f.closest('.overlay').remove(); toast('Заказ выполнен ✓'); S.render();
};
A.clSearch = el => { cl.q=el.value; $('#clrows').innerHTML=clientRows(); const m=$('#clcards'); if(m) m.innerHTML=clientCards(); };
const clientForm = c => modal(`<h3>${c?'Клиент':'Новый клиент'}</h3><form data-form="saveClient" data-id="${c?.id||''}">
  <label class="field"><span>ФИО</span><input name="name" value="${esc(c?.name)}" required></label>
  <label class="field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone value="${esc(c?.phone?maskPhone(c.phone):'')}" required></label>
  <label class="field"><span>Авто</span><input name="car" value="${esc(c?.car)}"></label>
  <label class="field"><span>Заметка</span><textarea name="note">${esc(c?.note)}</textarea></label>
  <div class="actions">${c&&isAdmin()?'<button type="button" class="btn danger" data-act="delClient" data-id="'+c.id+'">Удалить</button>':''}<button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div></form>`);
A.newClient = () => clientForm(null);
A.editClient = el => clientForm(S.data.clients.find(c=>c.id===+el.dataset.id));
A.saveClient = async f => {
  if(digits(f.phone.value).length!==11) throw new Error('Введите номер полностью: +7 (900) 000-00-00');
  const row={name:f.name.value.trim(),phone:f.phone.value.trim(),car:f.car.value.trim(),note:f.note.value.trim()}, id=+f.dataset.id;
  if(id){
    const old={...S.data.clients.find(c=>c.id===id)};
    const r=await db.update('clients',id,row); Object.assign(S.data.clients.find(c=>c.id===id),r);
    if(old.name!==row.name || old.phone!==row.phone){
      const patch={client_name:row.name, phone:row.phone};
      await db.updateWhere('bookings','client_id',id,patch);
      S.data.bookings.filter(b=>b.client_id===id).forEach(b=>Object.assign(b,patch));
      const phones=[...new Set(S.data.orders.filter(o=>digits(o.phone)===digits(old.phone)).map(o=>o.phone))];
      for(const p of phones){ await db.updateWhere('orders','phone',p,patch); S.data.orders.filter(o=>o.phone===p).forEach(o=>Object.assign(o,patch)); }
    }
  } else S.data.clients.push(await db.insert('clients',row));
  f.closest('.overlay').remove(); toast('Сохранено ✓ (имя обновлено во всех записях и заказах)'); S.render();
};
A.delClient = async el => { if(!confirm('Удалить клиента?')) return; const id=+el.dataset.id; await db.remove('clients',id); S.data.clients=S.data.clients.filter(c=>c.id!==id); el.closest('.overlay').remove(); S.render(); };
A.editService = el => { const s=S.data.services.find(x=>x.id===+el.dataset.id);
  modal(`<h3>${s?'Услуга':'Новая услуга'}</h3><form data-form="saveService" data-id="${s?.id||''}">
  <label class="field"><span>Название</span><input name="name" value="${esc(s?.name)}" required></label>
  <div class="f2"><label class="field"><span>Категория</span><select name="category" required>${[...new Set([...CATS,...S.data.services.map(x=>x.category)])].map(c=>`<option${c===(s?.category||'Мойка')?' selected':''}>${esc(c)}</option>`).join('')}</select></label>
  <label class="field"><span>Цена, ₽</span><input name="price" type="number" min="0" value="${s?.price??''}" required></label></div>
  <div class="f2"><label class="field"><span>Минут</span><input name="minutes" type="number" min="5" value="${s?.minutes??30}" required></label>
  <label class="field"><span>Статус</span><select name="active"><option value="1"${s?.active!==false?' selected':''}>Активна</option><option value="0"${s?.active===false?' selected':''}>Скрыта</option></select></label></div>
  <div class="actions">${s?`<button type="button" class="btn danger" data-act="delService" data-id="${s.id}">Удалить</button>`:''}<button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div></form>`); };
A.delService = async el => {
  const id=+el.dataset.id, s=S.data.services.find(x=>x.id===id);
  if(!confirm(`Удалить услугу «${s.name}»?\n\nВ старых записях и заказах она сохранится как есть. Если услуга временно не нужна, лучше поставить статус «Скрыта».`)) return;
  await db.remove('services',id); S.data.services=S.data.services.filter(x=>x.id!==id);
  el.closest('.overlay').remove(); toast('Услуга удалена'); S.render();
};
A.editSupply = el => { const x=(S.data.supplies||[]).find(v=>v.id===+el.dataset.id);
  const names=[...new Set((S.data.supplies||[]).map(v=>v.name))];
  const m = modal(`<h3>${x?'Закупка':'Новая закупка'}</h3><form data-form="saveSupply" data-id="${x?.id||''}">
  <label class="field"><span>Что заказали</span><input name="name" list="supn" value="${esc(x?.name)}" placeholder="Шампунь, керамика…" required></label>
  <datalist id="supn">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <div class="f2"><label class="field"><span>Количество, шт.</span><input name="qty" type="number" inputmode="decimal" step="any" min="0.01" value="${x?.qty??''}" data-input="supTotal" required></label>
  <label class="field"><span>Цена за 1 шт., ₽</span><input name="price" type="number" inputmode="decimal" step="any" min="0" value="${x?.unit_price??''}" data-input="supTotal" required></label></div>
  <div class="total" style="margin-top:14px"><span class="muted">Итого</span><b id="supsum" class="num">${money(x?x.qty*x.unit_price:0)}</b></div>
  <label class="field"><span>Дата заказа</span><input name="date" type="date" value="${x?.bought_at||dkey(new Date())}" required></label>
  <label class="field"><span>Примечание (поставщик, номер заказа)</span><input name="note" value="${esc(x?.note)}"></label>
  <div class="actions">${x?`<button type="button" class="btn danger" data-act="delSupply" data-id="${x.id}">Удалить</button>`:''}<button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div></form>`); };
A.supTotal = el => { const f=el.form, t=(+f.qty.value||0)*(+f.price.value||0); $('#supsum').textContent=money(t); };
A.saveSupply = async f => {
  const row={name:f.name.value.trim(),qty:+f.qty.value,unit_price:+f.price.value,bought_at:f.date.value,note:f.note.value.trim()||null}, id=+f.dataset.id;
  if(!(row.qty>0)) throw new Error('Количество должно быть больше нуля');
  if(id){ const r=await db.update('supplies',id,row); Object.assign(S.data.supplies.find(v=>v.id===id),r); } else S.data.supplies.push(await db.insert('supplies',row));
  f.closest('.overlay').remove(); toast('Сохранено ✓'); S.render();
};
A.delSupply = async el => { if(!confirm('Удалить эту закупку из журнала?')) return; const id=+el.dataset.id; await db.remove('supplies',id); S.data.supplies=S.data.supplies.filter(v=>v.id!==id); el.closest('.overlay').remove(); toast('Удалено'); S.render(); };
A.saveService = async f => {
  const row={name:f.name.value.trim(),category:f.category.value.trim(),price:+f.price.value,minutes:+f.minutes.value,active:f.active.value==='1'}, id=+f.dataset.id;
  if(id){ const r=await db.update('services',id,row); Object.assign(S.data.services.find(x=>x.id===id),r); } else S.data.services.push(await db.insert('services',row));
  f.closest('.overlay').remove(); toast('Сохранено ✓'); S.render();
};
A.editStaff = el => { const s=S.data.staff.find(x=>x.id===+el.dataset.id);
  modal(`<h3>${s?'Сотрудник':'Новый сотрудник'}</h3><form data-form="saveStaff" data-id="${s?.id||''}">
  <label class="field"><span>Имя</span><input name="name" value="${esc(s?.name)}" required></label>
  <div class="f2"><label class="field"><span>Должность</span><input name="position" value="${esc(s?.position)}"></label><label class="field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone value="${esc(s?.phone?maskPhone(s.phone):'')}"></label></div>
  <div class="f2"><label class="field"><span>% от заказа</span><input name="percent" type="number" min="0" max="100" value="${s?pay(s.id):30}" required></label>
  <label class="field"><span>Статус</span><select name="active"><option value="1"${s?.active!==false?' selected':''}>Работает</option><option value="0"${s?.active===false?' selected':''}>Не работает</option></select></label></div>
  <div class="actions">${s?`<button type="button" class="btn danger" data-act="delStaff" data-id="${s.id}">Удалить</button>`:''}<button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div></form>
  ${s?`<div class="accessbox"><div><b>Доступ в систему</b><div class="muted small">${loginOf(s.id)?`Логин: <b>${esc(loginOf(s.id).full_name)}</b>`:'У сотрудника пока нет логина и пароля'}</div></div>
  <button type="button" class="btn sm" data-act="openAccess" data-id="${s.id}">${loginOf(s.id)?'Управлять':'Выдать доступ'}</button></div>`:'<p class="muted small" style="margin-top:14px">Сначала сохраните сотрудника, потом откройте его снова и выдайте доступ.</p>'}`); };
const RU = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const translit = t => String(t||'').toLowerCase().split(' ')[0].replace(/[а-яё]/g,c=>RU[c]).replace(/[^a-z0-9._-]/g,'');
const genPass = () => { const ch='abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', a=new Uint32Array(10); crypto.getRandomValues(a); return [...a].map(n=>ch[n%ch.length]).join(''); };
const siteUrl = () => location.href.split('?')[0].split('#')[0].replace(/index\.html$/,'');
function accessModal(id){
  const s=S.data.staff.find(x=>x.id===id), p=loginOf(id);
  return p ? modal(`<h3>Доступ: ${esc(s.name)}</h3><p class="muted">Логин: <b>${esc(p.full_name)}</b></p>
    <form data-form="changePass" data-id="${id}" data-login="${esc(p.full_name)}"><label class="field"><span>Новый пароль (не короче 8 символов)</span><input name="pass" value="${genPass()}" required minlength="8" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
    <div class="actions"><button type="button" class="btn danger" data-act="delLogin" data-id="${id}" data-login="${esc(p.full_name)}">Отключить доступ</button><button type="button" class="btn" data-act="closeModal">Закрыть</button><button class="btn primary">Сменить пароль</button></div></form>`)
  : modal(`<h3>Выдать доступ: ${esc(s.name)}</h3><p class="muted small">Сотрудник сможет вводить клиентов, записывать и менять статусы. Выручку, зарплаты и расходники он не увидит.</p>
    <form data-form="createLogin" data-id="${id}"><label class="field"><span>Логин (латиницей)</span><input name="login" value="${esc(translit(s.name))}" required pattern="[a-z0-9._\-]{3,30}" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
    <label class="field"><span>Пароль (можно изменить)</span><input name="pass" value="${genPass()}" required minlength="8" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
    <div class="actions"><button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Создать доступ</button></div></form>`);
}
function credsModal(login, pass, changed){
  const text = `Сайт: ${siteUrl()}\nЛогин: ${login}\nПароль: ${pass}`;
  modal(`<h3>${changed?'Пароль изменён':'Доступ выдан'}</h3><p class="muted small">Передайте сотруднику. Пароль виден только сейчас — потом его можно только заменить на новый.</p>
    <div class="creds"><div><span>Сайт</span><b>${esc(siteUrl())}</b></div><div><span>Логин</span><b>${esc(login)}</b></div><div><span>Пароль</span><b>${esc(pass)}</b></div></div>
    <div class="actions"><button type="button" class="btn primary" data-act="copyCreds" data-text="${esc(text)}">Скопировать</button><button type="button" class="btn" data-act="closeModal">Готово</button></div>`);
}
A.openAccess = el => { el.closest('.overlay').remove(); accessModal(+el.dataset.id); };
A.createLogin = async f => {
  const id=+f.dataset.id, login=f.login.value.trim().toLowerCase(), pass=f.pass.value;
  await db.rpc('admin_create_login',{p_login:login,p_password:pass,p_staff_id:id});
  S.data.profiles = await db.list('profiles'); f.closest('.overlay').remove(); credsModal(login,pass,false);
};
A.changePass = async f => { const login=f.dataset.login, pass=f.pass.value; await db.rpc('admin_set_password',{p_login:login,p_password:pass}); f.closest('.overlay').remove(); credsModal(login,pass,true); };
A.delLogin = async el => {
  if(!confirm(`Отключить вход «${el.dataset.login}»? Сотрудник больше не сможет войти. Сам сотрудник и его история останутся.`)) return;
  await db.rpc('admin_delete_login',{p_login:el.dataset.login}); S.data.profiles = await db.list('profiles'); el.closest('.overlay').remove(); toast('Доступ отключён'); S.render();
};
A.copyCreds = async el => {
  try{ await navigator.clipboard.writeText(el.dataset.text); toast('Скопировано'); }
  catch{ const t=document.createElement('textarea'); t.value=el.dataset.text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast('Скопировано'); }
};
A.delStaff = async el => {
  const id=+el.dataset.id, s=S.data.staff.find(x=>x.id===id);
  if(!confirm(`Удалить сотрудника «${s.name}» навсегда?\n\nВ старых заказах он станет «Не указан», а его процент пропадёт из расчёта зарплат в аналитике. Если он просто уволился, лучше поставить статус «Не работает».`)) return;
  await db.remove('staff',id);
  S.data.staff=S.data.staff.filter(x=>x.id!==id); S.data.staff_pay=S.data.staff_pay.filter(x=>x.staff_id!==id);
  S.data.bookings.forEach(b=>{ if(b.staff_id===id) b.staff_id=null; }); S.data.orders.forEach(o=>{ if(o.staff_id===id) o.staff_id=null; });
  el.closest('.overlay').remove(); toast('Сотрудник удалён'); S.render();
};
A.saveStaff = async f => {
  const row={name:f.name.value.trim(),position:f.position.value.trim(),phone:f.phone.value.trim(),active:f.active.value==='1'}, id=+f.dataset.id, percent=+f.percent.value;
  let r; if(id){ r=await db.update('staff',id,row); Object.assign(S.data.staff.find(x=>x.id===id),r); } else { r=await db.insert('staff',row); S.data.staff.push(r); }
  await db.upsert('staff_pay',{staff_id:r.id,percent},'staff_id');
  const p=S.data.staff_pay.find(x=>x.staff_id===r.id); p?p.percent=percent:S.data.staff_pay.push({staff_id:r.id,percent});
  f.closest('.overlay').remove(); toast('Сохранено ✓'); S.render();
};
export { analyticsView };
