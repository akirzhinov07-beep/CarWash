import { db } from './db.js';
import { S, $, esc, money, dt, dkey, localInput, toast, modal, countUp, icon, maskPhone, cfg, freeWindows } from './core.js';
const CATS = ['Мойка','Детейлинг','Химчистка','Полировка','Защита','Прочее'];
const catRank = c => { const i = CATS.indexOf(c); return i<0 ? 99 : i; };
import { parseVcf } from './vcf.js';
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
  { id:'settings', title:'Настройки', icon:'gear', roles:['admin'] },
];
const digits = p => String(p||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7');
const isAdmin = () => S.user.role==='admin';
const hasMk = () => !S.data.clients.length || 'marketing_ok' in S.data.clients[0];
const waLink = (phone,text='') => digits(phone).length===11 ? `<a class="waicon" title="Написать в WhatsApp" aria-label="WhatsApp" href="https://wa.me/${digits(phone)}${text?'?text='+encodeURIComponent(text):''}" target="_blank" rel="noopener">${icon('chat')}</a>` : '';
const carsOn = () => !S.data._carsMissing;
let _ci = null; // индекс авто по клиенту (чтобы список из тысяч клиентов не тормозил)
const carsOf = id => { const a=S.data.cars||[]; if(!_ci||_ci.a!==a||_ci.n!==a.length){ const m=new Map(); a.forEach(k=>{ let l=m.get(k.client_id); if(!l) m.set(k.client_id,l=[]); l.push(k); }); _ci={a,n:a.length,m}; } return _ci.m.get(id)||[]; };
const plateTag = p => p ? `<span class="plate">${esc(p)}</span>` : '';
const carsText = c => { const ks=carsOf(c.id); return ks.length ? ks.map(k=>`${esc(k.model)} ${plateTag(k.plate)}`).join('<br>') : esc(c.car||'—'); };
const carShort = c => { const ks=carsOf(c.id); return ks.length ? ks.map(k=>k.model+(k.plate?' '+k.plate:'')).join(', ') : (c.car||''); };
const carHay = c => (c.car||'')+' '+carsOf(c.id).map(k=>k.model+' '+(k.plate||'')).join(' ');
const LAT2CYR = { A:'А', B:'В', E:'Е', K:'К', M:'М', H:'Н', O:'О', P:'Р', C:'С', T:'Т', Y:'У', X:'Х' };
const plateKey = p => String(p||'').toUpperCase().replace(/[A-Z]/g, ch=>LAT2CYR[ch]||ch).replace(/[^А-ЯЁ0-9]/g,'');
// Умный поиск клиента: 3 цифры = ровно цифры гос. номера (не телефон и не регион), 4+ цифры = телефон или номер, текст = имя/авто/заметка/номер
function clientMatcher(q){
  q = String(q||'').trim().toLowerCase(); if(!q) return () => true;
  const qd = digits(q), onlyDigits = /^[\d\s()+-]+$/.test(q), pk = plateKey(q);
  const plates = c => carsOf(c.id).map(k=>k.plate).filter(Boolean);
  if(onlyDigits){
    if(qd.length < 3) return () => false;
    if(qd.length === 3) return c => plates(c).some(p => (String(p).match(/\d{3}/)||[])[0] === qd);
    return c => digits(c.phone).includes(qd) || plates(c).some(p => plateKey(p).includes(qd));
  }
  return c => c.name.toLowerCase().includes(q) || carHay(c).toLowerCase().includes(q) || (c.note||'').toLowerCase().includes(q)
    || (pk.length>=3 && plates(c).some(p => plateKey(p).includes(pk))) || (qd.length>=4 && digits(c.phone).includes(qd));
}
const carLine = b => esc(b.car)+(b.plate?' '+plateTag(b.plate):'');
const normS = s => String(s||'').replace(/\s+/g,'').toLowerCase();
async function ensureCar(client, model, plate){
  if(!carsOn() || !model) return;
  const own = carsOf(client.id), m = normS(model);
  let k = plate ? own.find(x=>normS(x.plate)===normS(plate)) : own.find(x=>normS(x.model)===m);
  if(!k && plate) k = own.find(x=>!x.plate && normS(x.model)===m);
  if(k){ const patch={}; if(k.model!==model) patch.model=model; if(plate && k.plate!==plate) patch.plate=plate; if(Object.keys(patch).length) Object.assign(k, await db.update('cars',k.id,patch)); }
  else S.data.cars.push(await db.insert('cars',{client_id:client.id, model, plate:plate||null}));
}
// зарплата сотрудника: фиксированная сумма в рублях по каждой услуге (если у услуги не задана — процент сотрудника от её цены)
export const payOn = () => S.data.services.length>0 && 'pay' in S.data.services[0];
const earnOf = (services, staffId) => (services||[]).reduce((t,x)=>{ const v = x.pay ?? bySvc(x.id)?.pay; return t + (v!=null ? +v : (+x.price||0)*pay(staffId)/100); },0);
const listSum = svcs => (svcs||[]).reduce((t,x)=>t+(+x.price||0),0);
const calc = (list, disc, gift) => { const d = gift ? 0 : Math.min(Math.max(0,+disc||0), list); return { disc:d, total: gift ? 0 : list-d }; };
const priceTag = b => b.gift ? '<span class="pill p-warn">🎁 подарок</span>' : (+b.discount>0 ? `<span class="muted small">скидка −${money(b.discount)}</span>` : '');
const STATUS = { pending:['Ожидает','p-warn'], done:['Выполнено','p-ok'], cancelled:['Отказался','p-bad'] };
const PAY = { cash:'Наличными', card:'Безналичная оплата' };
export const payName = p => PAY[p] || '—';
const bySvc = id => S.data.services.find(s=>s.id===id);
const staffName = id => S.data.staff.find(s=>s.id===id)?.name || '—';

/* ================= ЗАПИСЬ ================= */
const rec = { carId:null, client:null, svcs:new Set(), q:'', date:null, time:null, disc:0, gift:false };
const pad2 = n => String(n).padStart(2,'0');
const toMin = t => +t.slice(0,2)*60 + +t.slice(3,5);
const fromMin = m => pad2(Math.floor(m/60))+':'+pad2(m%60);
const openM = () => toMin(cfg('open_time')), closeM = () => toMin(cfg('close_time')), stepM = () => +cfg('slot_step') || 30;
const allowPast = () => cfg('allow_past') === true;
function recDefaults(){
  const now=new Date(), today=dkey(now);
  if(rec.date && (allowPast() || rec.date>=today) && rec.time) return;
  let m = Math.ceil((now.getHours()*60+now.getMinutes())/stepM())*stepM();
  if(m<openM()) m=openM();
  if(m>closeM()){ rec.date=dkey(new Date(now.getTime()+864e5)); rec.time=cfg('open_time'); }
  else { rec.date=today; rec.time=fromMin(m); }
}
function slotsHtml(){
  const now=new Date(), isToday=rec.date===dkey(now), nowM=now.getHours()*60+now.getMinutes(), st=stepM();
  const day=S.data.bookings.filter(b=>b.status!=='cancelled' && dkey(b.starts_at)===rec.date);
  const out=[]; for(let m=openM(); m<=closeM(); m+=st){
    const t=fromMin(m), n=day.filter(b=>{ const d=new Date(b.starts_at), bm=d.getHours()*60+d.getMinutes(); return bm>=m && bm<m+st; }).length;
    const past = !allowPast() && isToday && m+st<=nowM;
    out.push(`<button type="button" class="slot${rec.time===t?' on':''}${n?' busy':''}" data-act="recSlot" data-t="${t}"${past?' disabled':''}>${t}${n?`<small>записей: ${n}</small>`:''}</button>`);
  }
  return out.join('');
}
const dayKey = off => dkey(new Date(Date.now()+off*864e5));
const dayBtns = () => [...(allowPast()?[[-1,'Вчера']]:[]),[0,'Сегодня'],[1,'Завтра']].map(([d,l])=>`<button type="button" class="${rec.date===dayKey(d)?'on':''}" data-act="recDay" data-d="${d}">${l}</button>`).join('');
function whenBlock(){
  recDefaults(); const today=dkey(new Date());
  return `<div class="field"><span>Дата</span><div class="row"><div class="seg" id="recdays">${dayBtns()}</div>
    <input type="date" id="recdate" value="${rec.date}"${allowPast()?'':` min="${today}"`} data-change="recDate" style="width:auto"></div></div>
  <div class="field"><span>Время <b id="rectime" class="num" style="color:var(--text)">${rec.time||''}</b></span><div class="slots" id="slots">${slotsHtml()}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="recNow">Сейчас</button><label class="muted small" style="display:flex;align-items:center;gap:8px">или своё время <input type="time" step="300" id="rectcustom" data-change="recTime" style="width:auto;min-height:36px"></label></div></div>`;
}
function refreshWhen(){
  const a=$('#recdays'); if(a) a.innerHTML=dayBtns();
  const d=$('#recdate'); if(d) d.value=rec.date; const s=$('#slots'); if(s) s.innerHTML=slotsHtml(); const t=$('#rectime'); if(t) t.textContent=rec.time||'';
}
const recView = {
  html(){
    const cats = [...new Set(S.data.services.filter(s=>s.active).map(s=>s.category))].sort((a,b)=>catRank(a)-catRank(b));
    return `<div class="head"><h2>Запись клиента</h2></div>
    <form data-form="saveBooking" class="grid g-rec" autocomplete="off">
      <div class="card stagger"><h3>1. Клиент</h3>
        <div id="picked"></div>
        <label class="field" style="margin-top:0"><span>Поиск: имя, телефон, авто или 3 цифры гос. номера</span><input data-input="recSearch" id="rq" placeholder="Начните вводить…"></label>
        <div id="sugg"></div>
        <div class="f2"><label class="field"><span>Имя клиента</span><input name="name" required></label>
        <label class="field"><span>Телефон *</span><input name="phone" type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone data-input="recPhone" required></label></div>
        <div id="carpick"></div>
        <div class="${carsOn()?'f2':''}"><label class="field"><span>Марка и модель авто *</span><input name="car" placeholder="Toyota Camry" required></label>
        ${carsOn()?'<label class="field"><span>Гос. знак</span><input name="plate" placeholder="А123ВС 123" autocapitalize="characters" style="text-transform:uppercase"></label>':''}</div>
        ${hasMk()?'<label class="check"><input type="checkbox" name="mk" checked><span class="small">Клиент согласен получать сообщения от мойки (WhatsApp)</span></label>':''}
        ${whenBlock()}
        <div><label class="field"><span>Сотрудник (необязательно)</span><select name="staff"><option value="">Любой</option>${S.data.staff.filter(s=>s.active).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label></div>
        <label class="field"><span>Комментарий</span><textarea name="comment"></textarea></label>
      </div>
      <div class="card stagger"><h3>2. Услуги</h3>
        ${cats.map(c=>`<div class="cat">${esc(c)}</div><div class="chips">${S.data.services.filter(s=>s.active&&s.category===c).map(s=>
          `<button type="button" class="chip${rec.svcs.has(s.id)?' on':''}" data-act="togSvc" data-id="${s.id}">${esc(s.name)}<small>${money(s.price)} · ${s.minutes} мин</small></button>`).join('')}</div>`).join('') || '<div class="empty">Услуг пока нет</div>'}
        ${payOn()?`<div class="f2" style="margin-top:14px"><label class="field"><span>Скидка, ₽</span><input type="number" min="0" inputmode="numeric" id="recdisc" data-input="recDisc" placeholder="0" value="${rec.disc||''}"${rec.gift?' disabled':''}></label>
          <label class="check" style="align-self:end;margin-bottom:12px"><input type="checkbox" id="recgift" data-change="recGift"${rec.gift?' checked':''}><span>🎁 Мойка в подарок</span></label></div>`:''}
        <div class="total"><span class="muted">Итого</span><b id="tot" class="num">0 ₽</b></div><div id="totnote" class="muted small" style="text-align:right"></div>
        <button class="btn primary block" style="margin-top:0" type="submit">Записать клиента</button>
      </div>
    </form>`;
  },
  after(){ recView.sync(); }, 
  sync(){
    const list = [...rec.svcs].reduce((s,id)=>s+(bySvc(id)?.price||0),0), c = calc(list, rec.disc, rec.gift); const el=$('#tot'); if(el) el.textContent=money(c.total);
    const nt=$('#totnote'); if(nt) nt.textContent = rec.gift ? `Подарок: по прайсу ${money(list)}, в кассу 0 ₽` : (c.disc ? `Скидка −${money(c.disc)} (по прайсу ${money(list)})` : '');
    const p=$('#picked'); if(!p) return;
    p.innerHTML = rec.client ? `<div class="picked" style="margin-bottom:12px"><span>✓ ${esc(rec.client.name)} · ${esc(carShort(rec.client))}</span><button type="button" class="btn sm" data-act="unpick">Сменить</button></div>` : '';
    const cp=$('#carpick'), ks = rec.client && carsOn() ? carsOf(rec.client.id) : [];
    if(cp) cp.innerHTML = ks.length ? `<div class="field"><span>Авто клиента</span><div class="chips">${ks.map(k=>`<button type="button" class="chip${rec.carId===k.id?' on':''}" data-act="pickCar" data-id="${k.id}">${esc(k.model)}${k.plate?`<small>${esc(k.plate)}</small>`:''}</button>`).join('')}<button type="button" class="chip${rec.carId==='new'?' on':''}" data-act="pickCar" data-id="new">+ Другое авто</button></div></div>` : '';
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
      <div><b>${esc(b.client_name)}</b> · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>${waLink(b.phone)}</div><div>${carLine(b)}</div>
      <div class="muted small">${(b.services||[]).map(s=>esc(s.name)).join(', ')}${b.comment?` · 💬 ${esc(b.comment)}`:''}</div>
      <div class="mrow"><span class="muted small">${staffName(b.staff_id)}</span><span style="text-align:right"><b class="num">${money(b.total)}</b><br>${priceTag(b)}</span></div></div>`).join('')}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Время</th><th>Клиент</th><th>Авто</th><th>Услуги</th><th>Сотрудник</th><th class="right">Сумма</th><th>Статус</th></tr></thead><tbody>
    ${list.map(b=>`<tr><td class="num">${new Date(b.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</td>
      <td><b>${esc(b.client_name)}</b><br><span class="muted small">${esc(b.phone)}</span>${waLink(b.phone)}${b.comment?`<br><span class="muted small">💬 ${esc(b.comment)}</span>`:''}</td>
      <td>${carLine(b)}</td><td>${(b.services||[]).map(s=>esc(s.name)).join(', ')}</td><td>${staffName(b.staff_id)}</td>
      <td class="right num">${money(b.total)}<br>${priceTag(b)}</td>
      <td>${statusCtl(b)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card empty">На этот день записей нет</div>`}`;
  }
};

/* ================= КЛИЕНТЫ ================= */
const cl = { q:'', limit:50, t:null };
const cardBtn = c => carsOn() ? `<button class="btn sm" data-act="openCard" data-id="${c.id}">Авто и фото</button>` : '';
function clList(){ return S.data.clients.filter(clientMatcher(cl.q)).reverse(); }
function ordStat(){ const m=new Map(); for(const o of S.data.orders){ const k=digits(o.phone), v=m.get(k)||[0,0]; v[0]++; v[1]+=o.total; m.set(k,v); } return m; }
function clBody(){
  const all = clList(), shown = all.slice(0, cl.limit), st = isAdmin() ? ordStat() : null;
  const rows = shown.length ? shown.map(c=>{ const [n,sum]=st?(st.get(digits(c.phone))||[0,0]):[0,0]; return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}${waLink(c.phone)}</td><td>${carsText(c)}</td><td class="muted">${esc(c.note||'')}</td>
    <td><input type="checkbox" title="Согласие на сообщения" data-change="togConsent" data-id="${c.id}"${c.marketing_ok?' checked':''}${hasMk()?'':' disabled'}></td>
    ${isAdmin()?`<td class="num">${n}</td><td class="num">${money(sum)}</td>`:''}<td class="right" style="white-space:nowrap">${cardBtn(c)}${isAdmin()?`<button class="btn sm" data-act="editClient" data-id="${c.id}">Изменить</button>`:''}</td></tr>`; }).join('')
    : `<tr><td colspan="8" class="empty">Никого не найдено</td></tr>`;
  const cards = shown.length ? shown.map(c=>`<div class="mcard"><div class="mrow"><b>${esc(c.name)}</b><span class="row">${cardBtn(c)}${isAdmin()?`<button class="btn sm" data-act="editClient" data-id="${c.id}">Изменить</button>`:''}</span></div>
    <div><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${waLink(c.phone)}</div><div>${carsText(c)}</div>
    <label class="check" style="margin:4px 0"><input type="checkbox" data-change="togConsent" data-id="${c.id}"${c.marketing_ok?' checked':''}${hasMk()?'':' disabled'}><span class="small">Согласен на сообщения</span></label>${c.note?`<div class="muted small">${esc(c.note)}</div>`:''}</div>`).join('') : '<div class="card empty">Никого не найдено</div>';
  const foot = all.length ? `<div class="clfoot"><span class="muted small">Показано ${shown.length} из ${all.length}${all.length>shown.length?'. Остальных найдите через поиск.':''}</span>${all.length>shown.length?'<button class="btn" data-act="clMore">Показать ещё</button>':''}</div>` : '';
  return { rows, cards, foot };
}
function clUpdate(){ const b=clBody(), r=$('#clrows'); if(!r) return; r.innerHTML=b.rows; const m=$('#clcards'); if(m) m.innerHTML=b.cards; const f=$('#clfoot'); if(f) f.innerHTML=b.foot; }
const clientsView = {
  html(){ return `${S.data._carsMissing?'<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>Фото и несколько авто ещё не подключены.</b><p class="muted small" style="margin-top:6px">Откройте в репозитории файл <code>supabase/cars.sql</code>, вставьте в Supabase → SQL Editor и нажмите Run. Затем обновите страницу.</p></div>':''}<div class="head"><h2>Клиенты</h2><div class="row">${isAdmin()&&carsOn()?'<button class="btn" data-act="impOpen">Импорт контактов</button>':''}<button class="btn primary" data-act="newClient">+ Новый клиент</button></div></div>
    <input data-input="clSearch" placeholder="ФИО, телефон, авто или 3 цифры гос. номера" value="${esc(cl.q)}" style="margin-bottom:14px;max-width:460px">
    ${(()=>{ cl.b=S.data._clientsLoading?{rows:'<tr><td colspan="8" class="empty">Загружаем клиентов…</td></tr>',cards:'<div class="card empty">Загружаем клиентов…</div>',foot:''}:clBody(); return ''; })()}<div class="mcards" id="clcards">${cl.b.cards}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Клиент</th><th>Телефон</th><th>Авто</th><th>Заметка</th><th title="Согласие на сообщения">Рассылка</th>${isAdmin()?'<th>Визитов</th><th>Потрачено</th>':''}<th></th></tr></thead><tbody id="clrows">${cl.b.rows}</tbody></table></div><div id="clfoot">${cl.b.foot}</div>`; }
};

/* ================= УСЛУГИ / СОТРУДНИКИ ================= */
const servicesView = {
  html(){ return `<div class="head"><h2>Услуги</h2><button class="btn primary" data-act="editService" data-id="">+ Услуга</button></div>
    ${payOn()?'':'<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>Зарплата в рублях, скидки и подарки ещё не подключены.</b><p class="muted small" style="margin-top:6px">Выполните в Supabase → SQL Editor файл <code>supabase/pay_gift.sql</code> и обновите страницу.</p></div>'}
    <div class="mcards">${S.data.services.map(s=>`<div class="mcard"><div class="mrow"><b>${esc(s.name)}</b><button class="btn sm" data-act="editService" data-id="${s.id}">Изменить</button></div>
      <div class="muted small">${esc(s.category)} · ${s.minutes} мин</div><div class="mrow"><b class="num">${money(s.price)}${payOn()?` <span class="muted small">· ЗП ${s.pay!=null?money(s.pay):'по %'}</span>`:''}</b><span class="pill ${s.active?'p-ok':'p-warn'}">${s.active?'Активна':'Скрыта'}</span></div></div>`).join('')}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Название</th><th>Категория</th><th class="right">Цена</th>${payOn()?'<th class="right">Зарплата</th>':''}<th>Время</th><th>Статус</th><th></th></tr></thead><tbody>
    ${S.data.services.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.category)}</td><td class="right num">${money(s.price)}</td>${payOn()?`<td class="right num">${s.pay!=null?money(s.pay):'<span class="muted">по %</span>'}</td>`:''}<td>${s.minutes} мин</td>
    <td><span class="pill ${s.active?'p-ok':'p-warn'}">${s.active?'Активна':'Скрыта'}</span></td><td class="right"><button class="btn sm" data-act="editService" data-id="${s.id}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`; }
};
const staffView = {
  html(){ return `<div class="head"><h2>Сотрудники</h2><button class="btn primary" data-act="editStaff" data-id="">+ Сотрудник</button></div>
    <div class="mcards">${S.data.staff.map(s=>`<div class="mcard"><div class="mrow"><b>${esc(s.name)}</b><button class="btn sm" data-act="editStaff" data-id="${s.id}">Изменить</button></div>
      <div class="muted small">${esc(s.position||'')}${s.phone?' · '+esc(s.phone):''} · ${pay(s.id)}% от заказа</div>
      <div class="row">${loginOf(s.id)?`<span class="pill p-ok">🔑 ${esc(loginOf(s.id).full_name)}</span>`:'<span class="pill p-warn">Нет входа</span>'}<span class="pill ${s.active?'p-ok':'p-warn'}">${s.active?'Работает':'Не работает'}</span></div></div>`).join('')}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Имя</th><th>Должность</th><th>Телефон</th><th class="right">% от заказа</th><th>Доступ в систему</th><th>Статус</th><th></th></tr></thead><tbody>
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
    ${list.length?`<div class="mcards">${list.map(x=>`<div class="mcard"><div class="mrow"><b>${esc(x.name)}</b><button class="btn sm" data-act="editSupply" data-id="${x.id}">Изменить</button></div>
      <div class="muted small">${new Date(x.bought_at+'T12:00').toLocaleDateString('ru-RU')} · ${money2(x.qty)} шт × ${money(x.unit_price)}</div><div class="mrow"><b class="num">${money(tot(x))}</b>${x.note?`<span class="muted small">${esc(x.note)}</span>`:''}</div></div>`).join('')}</div>
    <div class="tablewrap dtonly"><table><thead><tr><th>Дата</th><th>Что заказали</th><th class="right">Кол-во</th><th class="right">Цена за ед.</th><th class="right">Сумма</th><th>Примечание</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr><td class="num">${new Date(x.bought_at+'T12:00').toLocaleDateString('ru-RU')}</td><td><b>${esc(x.name)}</b></td><td class="right num">${money2(x.qty)}</td><td class="right num">${money(x.unit_price)}</td><td class="right num"><b>${money(tot(x))}</b></td><td class="muted">${esc(x.note||'')}</td><td class="right"><button class="btn sm" data-act="editSupply" data-id="${x.id}">Изменить</button></td></tr>`).join('')}
    </tbody></table></div>`:`<div class="card empty">Закупок пока нет. Нажмите «+ Закупка» и запишите, что заказали.</div>`}`;
  },
  after(){ document.querySelectorAll('[data-count]').forEach(el=>countUp(el,+el.dataset.count)); }
};

/* ================= НАСТРОЙКИ ================= */
const settingsView = {
  html(){
    const sel = (k,opts) => `<select data-change="setCfg" data-key="${k}">${opts.map(o=>`<option value="${o}"${String(cfg(k))===String(o)?' selected':''}>${o}${k==='slot_step'?' мин':''}</option>`).join('')}</select>`;
    return `<div class="head"><h2>Настройки</h2></div>
    ${S.data._settingsMissing?`<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>Настройки ещё не подключены к базе.</b><p class="muted small" style="margin-top:6px">Откройте в репозитории файл <code>supabase/settings.sql</code>, вставьте в Supabase → SQL Editor и нажмите Run. Затем обновите страницу.</p></div>`:''}
    <div class="card" style="max-width:660px"><h3>Запись клиентов</h3>
      <label class="check"><input type="checkbox" data-change="setCfg" data-key="allow_past"${allowPast()?' checked':''}><span>Разрешить запись на прошедшие даты</span></label>
      <p class="muted small" style="margin:2px 0 14px 31px">Когда включено, при записи появляется кнопка «Вчера», доступны любые прошлые даты и время. Действует для всех сотрудников.</p>
      <div class="f2"><label class="field"><span>Начало работы</span><input type="time" data-change="setCfg" data-key="open_time" value="${cfg('open_time')}"></label>
      <label class="field"><span>Конец (последняя запись)</span><input type="time" data-change="setCfg" data-key="close_time" value="${cfg('close_time')}"></label></div>
      <label class="field"><span>Шаг времени в записи</span>${sel('slot_step',[15,30,60])}</label>
    </div>
    <div class="card" style="max-width:660px;margin-top:14px"><h3>Телефон мойки</h3>
      <label class="field"><span>Указывается в сообщениях клиентам</span><input type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone data-change="setCfg" data-key="biz_phone" value="${esc(cfg('biz_phone'))}"></label>
    </div>`;
  }
};

export const views = { dashboard:dashboardView, supplies:suppliesView, settings:settingsView, record:recView, bookings:bookingsView, clients:clientsView, services:servicesView, staff:staffView, analytics:analyticsView, actions:{} };
const A = views.actions;
registerActions(A);

/* ---------- действия ---------- */
A.recDay = el => { rec.date=dayKey(+el.dataset.d); if(!allowPast() && rec.date===dkey(new Date()) && rec.time && toMin(rec.time)+stepM()<=new Date().getHours()*60+new Date().getMinutes()) rec.time=null; refreshWhen(); };
A.recDate = el => { if(!el.value) return; if(!allowPast() && el.value<dkey(new Date())){ el.value=rec.date; throw new Error('Запись на прошедшие даты отключена. Администратор может включить её в «Настройки»'); } rec.date=el.value; refreshWhen(); };
A.setCfg = async el => {
  const key=el.dataset.key; let value = el.type==='checkbox' ? el.checked : key==='slot_step' ? +el.value : el.value;
  if(!value && el.type!=='checkbox' && key!=='biz_phone') return;
  const o = key==='open_time'?value:cfg('open_time'), c = key==='close_time'?value:cfg('close_time');
  if(toMin(c) <= toMin(o)){ S.render(); throw new Error('Конец работы должен быть позже начала'); }
  await db.upsert('settings',{key,value},'key');
  const r=S.data.settings.find(x=>x.key===key); r?r.value=value:S.data.settings.push({key,value});
  rec.time=null; toast('Настройка сохранена ✓'); S.render();
};
A.recSlot = el => { rec.time=el.dataset.t; const c=$('#rectcustom'); if(c) c.value=''; refreshWhen(); };
A.recNow = () => { const n=new Date(); rec.date=dkey(n); rec.time=pad2(n.getHours())+':'+pad2(n.getMinutes()); refreshWhen(); };
A.recTime = el => { if(el.value){ rec.time=el.value; refreshWhen(); } };
A.togSvc = el => { const id=+el.dataset.id; rec.svcs.has(id)?rec.svcs.delete(id):rec.svcs.add(id); el.classList.toggle('on'); recView.sync(); };
A.recDisc = el => { rec.disc = Math.max(0, +el.value||0); recView.sync(); };
A.recGift = el => { rec.gift = el.checked; const d=$('#recdisc'); if(d){ d.disabled=rec.gift; } recView.sync(); };
A.unpick = () => { rec.client=null; rec.carId=null; recView.sync(); };
A.recSearch = el => {
  if(S.data._clientsLoading){ $('#sugg').innerHTML='<p class="muted small" style="margin-top:6px">Загружаем клиентов…</p>'; return; }
  const q=el.value.trim(), box=$('#sugg');
  if(q.length<2){ box.innerHTML=''; return; }
  const r = S.data.clients.filter(clientMatcher(q)).slice(0,6);
  box.innerHTML = r.length? `<div class="suggest">${r.map(c=>`<button type="button" data-act="pickClient" data-id="${c.id}"><span><b>${esc(c.name)}</b> · ${esc(carShort(c))}</span><span class="muted">${esc(c.phone)}</span></button>`).join('')}</div>` : '<p class="muted small" style="margin-top:6px">Не найден — заполните данные ниже, клиент сохранится автоматически</p>';
};
A.recPhone = el => {
  const d = digits(el.value), f = el.form;
  if(rec.client && digits(rec.client.phone)!==d){ rec.client=null; recView.sync(); }
  if(d.length!==11 || rec.client) return;
  const c = S.data.clients.find(x=>digits(x.phone)===d); if(!c) return;
  rec.client=c; f.name.value=c.name; fillCar(f,c); recView.sync(); toast('Клиент найден: данные подставлены');
};
function fillCar(f,c){ const ks=carsOf(c.id), k=ks[ks.length-1]; rec.carId=k?k.id:null; f.car.value=k?k.model:(c.car||''); if(f.plate) f.plate.value=k?.plate||''; }
A.pickCar = el => { const f=$('form[data-form=saveBooking]'), id=el.dataset.id;
  if(id==='new'){ rec.carId='new'; f.car.value=''; if(f.plate) f.plate.value=''; f.car.focus(); }
  else { const k=(S.data.cars||[]).find(x=>x.id===+id); rec.carId=k.id; f.car.value=k.model; if(f.plate) f.plate.value=k.plate||''; }
  recView.sync(); };
A.pickClient = el => {
  const c = S.data.clients.find(x=>x.id===+el.dataset.id); rec.client=c; const f=$('form[data-form=saveBooking]');
  f.name.value=c.name; f.phone.value=maskPhone(c.phone); fillCar(f,c); $('#sugg').innerHTML=''; $('#rq').value=''; recView.sync();
};
A.saveBooking = async f => {
  if(S.data._clientsLoading) throw new Error('Клиенты ещё загружаются, подождите пару секунд и повторите');
  const name=f.name.value.trim(), phone=f.phone.value.trim(), car=f.car.value.trim(), plate=f.plate?f.plate.value.trim().toUpperCase():'';
  if(digits(phone).length!==11) throw new Error('Введите номер полностью: +7 (900) 000-00-00');
  if(!rec.svcs.size) throw new Error('Выберите хотя бы одну услугу');
  if(!rec.date || !rec.time) throw new Error('Выберите дату и время');
  if(!allowPast() && new Date(`${rec.date}T${rec.time}`) < new Date(Date.now()-stepM()*6e4)) throw new Error('Это время уже прошло. Запись задним числом отключена в «Настройки».');
  let client = rec.client || S.data.clients.find(c=>digits(c.phone)===digits(phone));
  if(!client){ client = await db.insert('clients',{name,phone,car,...(hasMk()?{marketing_ok:!!f.mk?.checked}:{})}); S.data.clients.push(client); }
  else if(!carsOn() && client.car!==car && car){ await db.update('clients',client.id,{car}); client.car=car; }
  const svcs=[...rec.svcs].map(id=>{const s=bySvc(id);return {id:s.id,name:s.name,category:s.category,price:s.price,...(payOn()&&s.pay!=null?{pay:s.pay}:{})};});
  const cc = calc(listSum(svcs), rec.disc, rec.gift); if(payOn() && !rec.gift && (+rec.disc||0) > listSum(svcs)) throw new Error('Скидка больше суммы услуг');
  const carJob = ensureCar(client, car, plate).catch(()=>{});
  const b = await db.insert('bookings',{ client_id:client.id, client_name:name||client.name, phone, car, ...(carsOn()?{plate:plate||null}:{}), comment:f.comment.value.trim()||null,
    services:svcs, total:cc.total, ...(payOn()?{discount:cc.disc, gift:rec.gift}:{}), staff_id:f.staff.value?+f.staff.value:null, starts_at:new Date(`${rec.date}T${rec.time}`).toISOString() });
  await carJob; S.data.bookings.push(b); rec.client=null; rec.carId=null; rec.svcs=new Set(); rec.date=null; rec.time=null; rec.disc=0; rec.gift=false; bk.day=dkey(b.starts_at);
  toast('Клиент записан ✓'); S.tab='bookings'; S.render();
};
A.setDay = el => { bk.day=el.value||dkey(new Date()); S.render(); };
A.dayToday = () => { bk.day=dkey(new Date()); S.render(); };
A.dayShift = el => { const d=new Date(bk.day+'T12:00'); d.setDate(d.getDate()+ +el.dataset.d); bk.day=dkey(d); S.render(); };
A.setStatus = async el => {
  const b = S.data.bookings.find(x=>x.id===+el.dataset.id), v = el.value;
  if(v==='pending') return;
  if(v==='cancelled'){ b.status='cancelled'; await db.update('bookings',b.id,{status:'cancelled'}); toast('Запись отменена'); return S.render(); }
  const lst = listSum(b.services);
  const m = modal(`<h3>Оплата</h3><p class="muted">${esc(b.client_name)} · ${esc(b.car)} · по прайсу <b>${money(lst)}</b></p>
    <form data-form="payDone" data-id="${b.id}">
    ${payOn()?`<div class="f2"><label class="field"><span>Скидка, ₽</span><input name="disc" type="number" min="0" inputmode="numeric" placeholder="0" value="${b.discount||''}" data-input="payCalc"${b.gift?' disabled':''}></label>
      <label class="check" style="align-self:end;margin-bottom:12px"><input type="checkbox" name="gift" data-change="payCalc"${b.gift?' checked':''}><span>🎁 Мойка в подарок</span></label></div>
      <div class="total"><span class="muted">К оплате</span><b id="paytot" class="num">${money(b.total)}</b></div>`:''}<div class="field"><span>Тип оплаты</span><div class="paychoice"><label class="opt"><input type="radio" name="pay" value="cash" checked><b>💵 Наличными</b></label><label class="opt"><input type="radio" name="pay" value="card"><b>💳 Безналичная оплата</b></label></div></div>
    <label class="field"><span>Кто выполнил</span><select name="staff" required><option value="">— выберите —</option>${S.data.staff.filter(s=>s.active).map(s=>`<option value="${s.id}"${s.id===b.staff_id?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
    <div class="actions"><button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Подтвердить</button></div></form>`);
  m.addEventListener('mousedown', e=>{ if(e.target===m) S.render(); });
};
A.closeModal = el => { el.closest('.overlay').remove(); S.render(); };
A.payCalc = el => {
  const f = el.closest('form'), b = S.data.bookings.find(x=>x.id===+f.dataset.id), gift = f.gift.checked; f.disc.disabled = gift;
  $('#paytot').textContent = money(calc(listSum(b.services), f.disc.value, gift).total);
};
A.payDone = async f => {
  const b = S.data.bookings.find(x=>x.id===+f.dataset.id), pay_type=f.querySelector('[name=pay]:checked').value, staff_id=+f.staff.value;
  const lst = listSum(b.services), gift = payOn() ? f.gift.checked : false, rawDisc = payOn() ? (+f.disc.value||0) : 0;
  if(!gift && rawDisc > lst) throw new Error('Скидка больше суммы услуг');
  const cc = payOn() ? calc(lst, rawDisc, gift) : { disc:0, total:b.total };
  const extra = payOn() ? { discount:cc.disc, gift, total:cc.total } : {};
  await db.update('bookings',b.id,{status:'done',pay_type,staff_id,...extra});
  Object.assign(b,{status:'done',pay_type,staff_id,...extra});
  const o = { booking_id:b.id, client_name:b.client_name, phone:b.phone, car:b.car, services:b.services, total:b.total, staff_id, pay_type,
    ...(payOn()?{ discount:cc.disc, gift, list_total:lst, staff_earn:earnOf(b.services, staff_id) }:{}) };
  if(isAdmin()) S.data.orders.push(await db.insert('orders',o)); else await db.insert('orders',o,false);
  f.closest('.overlay').remove(); toast('Заказ выполнен ✓'); S.render();
};
A.clSearch = el => { cl.q=el.value; cl.limit=50; clearTimeout(cl.t); cl.t=setTimeout(clUpdate,150); };
A.clMore = () => { cl.limit+=50; clUpdate(); };
const clientForm = c => modal(`<h3>${c?'Клиент':'Новый клиент'}</h3><form data-form="saveClient" data-id="${c?.id||''}">
  <label class="field"><span>ФИО</span><input name="name" value="${esc(c?.name)}" required></label>
  <label class="field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone value="${esc(c?.phone?maskPhone(c.phone):'')}" required></label>
  ${c&&carsOn()?'<p class="muted small">Автомобили и фото — кнопка «Авто и фото» в списке клиентов.</p>':`<div class="${carsOn()?'f2':''}"><label class="field"><span>Авто</span><input name="car" value="${esc(c?.car)}"></label>${carsOn()?'<label class="field"><span>Гос. знак</span><input name="plate" autocapitalize="characters" style="text-transform:uppercase"></label>':''}</div>`}
  <label class="field"><span>Заметка</span><textarea name="note">${esc(c?.note)}</textarea></label>
  ${hasMk()?`<label class="check"><input type="checkbox" name="mk"${(c?c.marketing_ok:true)?' checked':''}><span>Согласен получать сообщения (WhatsApp)</span></label>`:''}
  <div class="actions">${c&&isAdmin()?'<button type="button" class="btn danger" data-act="delClient" data-id="'+c.id+'">Удалить</button>':''}<button type="button" class="btn" data-act="closeModal">Отмена</button><button class="btn primary">Сохранить</button></div></form>`);
A.newClient = () => clientForm(null);
A.editClient = el => clientForm(S.data.clients.find(c=>c.id===+el.dataset.id));
A.saveClient = async f => {
  if(digits(f.phone.value).length!==11) throw new Error('Введите номер полностью: +7 (900) 000-00-00');
  const row={name:f.name.value.trim(),phone:f.phone.value.trim(),...(f.car?{car:f.car.value.trim()}:{}),note:f.note.value.trim(), ...(hasMk()?{marketing_ok:!!f.mk?.checked}:{})}, id=+f.dataset.id;
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
  } else { const nc=await db.insert('clients',row); S.data.clients.push(nc); await ensureCar(nc, row.car, f.plate?f.plate.value.trim().toUpperCase():''); }
  f.closest('.overlay').remove(); toast('Сохранено ✓ (имя обновлено во всех записях и заказах)'); S.render();
};
A.delClient = async el => { if(!confirm('Удалить клиента?')) return; const id=+el.dataset.id; try{ await db.removeFiles((S.data.client_photos||[]).filter(p=>p.client_id===id).map(p=>p.path)); }catch{} await db.remove('clients',id); S.data.cars=(S.data.cars||[]).filter(k=>k.client_id!==id); S.data.client_photos=(S.data.client_photos||[]).filter(p=>p.client_id!==id); S.data.clients=S.data.clients.filter(c=>c.id!==id); el.closest('.overlay').remove(); S.render(); };
A.editService = el => { const s=S.data.services.find(x=>x.id===+el.dataset.id);
  modal(`<h3>${s?'Услуга':'Новая услуга'}</h3><form data-form="saveService" data-id="${s?.id||''}">
  <label class="field"><span>Название</span><input name="name" value="${esc(s?.name)}" required></label>
  <div class="f2"><label class="field"><span>Категория</span><select name="category" required>${[...new Set([...CATS,...S.data.services.map(x=>x.category)])].map(c=>`<option${c===(s?.category||'Мойка')?' selected':''}>${esc(c)}</option>`).join('')}</select></label>
  <label class="field"><span>Цена, ₽</span><input name="price" type="number" min="0" value="${s?.price??''}" required></label></div>
  ${payOn()?`<label class="field"><span>Зарплата сотруднику за эту услугу, ₽</span><input name="pay" type="number" min="0" inputmode="numeric" placeholder="например 450" value="${s?.pay??''}"></label><p class="muted small" style="margin:-6px 0 10px">Если оставить пустым, зарплата считается по проценту сотрудника.</p>`:''}
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
  const row={name:f.name.value.trim(),category:f.category.value.trim(),price:+f.price.value,minutes:+f.minutes.value,active:f.active.value==='1',...(payOn()?{pay:f.pay.value===''?null:+f.pay.value}:{})}, id=+f.dataset.id;
  if(id){ const r=await db.update('services',id,row); Object.assign(S.data.services.find(x=>x.id===id),r); } else S.data.services.push(await db.insert('services',row));
  f.closest('.overlay').remove(); toast('Сохранено ✓'); S.render();
};
A.editStaff = el => { const s=S.data.staff.find(x=>x.id===+el.dataset.id);
  modal(`<h3>${s?'Сотрудник':'Новый сотрудник'}</h3><form data-form="saveStaff" data-id="${s?.id||''}">
  <label class="field"><span>Имя</span><input name="name" value="${esc(s?.name)}" required></label>
  <div class="f2"><label class="field"><span>Должность</span><input name="position" value="${esc(s?.position)}"></label><label class="field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" placeholder="+7 (900) 000-00-00" data-phone value="${esc(s?.phone?maskPhone(s.phone):'')}"></label></div>
  <div class="f2"><label class="field"><span>% от цены (если у услуги не задана сумма)</span><input name="percent" type="number" min="0" max="100" value="${s?pay(s.id):30}" required></label>
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

/* ================= WhatsApp: оповещение о свободных окнах ================= */
const wa = { day:'today', from:'18:00', to:'21:00', minDays:0, text:'', edited:false, sent:new Set() };
const waDate = () => { const d=new Date(); if(wa.day==='tomorrow') d.setDate(d.getDate()+1); return dkey(d); };
const firstName = n => { const p=String(n||'').trim().split(/\s+/); return p.length>1 ? p[1] : p[0]||''; };
const waAutoText = () => `Здравствуйте, {имя}! Приглашаем вас на мойку «Бумеранг» (Атажукина 2Б) ${wa.day==='today'?'сегодня':'завтра'} с ${wa.from} до ${wa.to}.${cfg('biz_phone')?` Для записи и уточнения свяжитесь с нами по номеру ${cfg('biz_phone')}.`:' Для записи и уточнения свяжитесь с нами.'}`;
function waRecipients(){
  const date = waDate(), now = Date.now();
  const busy = new Set(S.data.bookings.filter(b=>b.status==='pending' && dkey(b.starts_at)===date).map(b=>digits(b.phone)));
  return S.data.clients.filter(c=>c.marketing_ok===true && digits(c.phone).length===11 && !busy.has(digits(c.phone))).filter(c=>{
    if(!wa.minDays) return true;
    const last = Math.max(0,...(S.data.orders||[]).filter(o=>digits(o.phone)===digits(c.phone)).map(o=>+new Date(o.created_at||0)));
    return !last || (now-last)/864e5 >= wa.minDays;
  });
}
function waBody(){
  const list = waRecipients(), tpl = wa.edited ? wa.text : waAutoText();
  const total = S.data.clients.length, consent = S.data.clients.filter(c=>c.marketing_ok===true).length;
  const wins = freeWindows(waDate());
  return `${hasMk()?'':'<p class="muted small" style="color:var(--warn)">Чтобы включить согласие клиентов, выполните <code>supabase/marketing.sql</code> в Supabase (см. README).</p>'}
  <div class="row" style="margin-bottom:10px"><button class="btn sm${wa.day==='today'?' primary':''}" data-act="waDay" data-d="today">Сегодня</button><button class="btn sm${wa.day==='tomorrow'?' primary':''}" data-act="waDay" data-d="tomorrow">Завтра</button>
  ${wins.map(w=>`<button class="pill p-ok" style="border:0;cursor:pointer" data-act="waWin" data-f="${w.from}" data-t="${w.to}">${w.from}–${w.to}</button>`).join('')}</div>
  <div class="f2"><label class="field"><span>С</span><input type="time" value="${wa.from}" data-change="waFrom"></label><label class="field"><span>До</span><input type="time" value="${wa.to}" data-change="waTo"></label></div>
  <label class="field"><span>Текст ({имя} заменится именем клиента)</span><textarea rows="4" data-input="waText">${esc(tpl)}</textarea></label>
  <label class="field"><span>Только тем, кто не был не менее (дней, 0 — всем)</span><input type="number" min="0" value="${wa.minDays}" data-change="waMin" style="max-width:140px"></label>
  <p class="muted small">Получатели: <b>${list.length}</b> (согласие есть у ${consent} из ${total}). Тем, кто уже записан на этот день, не пишем.</p>
  <div id="warows" style="max-height:38vh;overflow:auto">${list.length?list.slice(0,150).map(c=>`<div class="warow${wa.sent.has(c.id)?' sent':''}"><span><b>${esc(c.name)}</b> <span class="muted small">${esc(c.phone)}</span></span>
    <a class="btn wa sm" href="https://wa.me/${digits(c.phone)}?text=${encodeURIComponent(tpl.replaceAll('{имя}',firstName(c.name)))}" target="_blank" rel="noopener" data-act="waSent" data-id="${c.id}">${icon('chat')}${wa.sent.has(c.id)?'Отправлено':'Написать'}</a></div>`).join(''):'<div class="empty">Нет клиентов с согласием на сообщения. Отметьте согласие в разделе «Клиенты».</div>'}${list.length>150?`<p class="muted small">Показаны первые 150 из ${list.length}. Рассылайте партиями, отметившиеся уходят из списка после записи.</p>`:''}</div>
  <div class="actions"><button class="btn" data-act="closeModal">Закрыть</button></div>`;
}
function waRefresh(){ const m=$('#wabox'); if(m) m.innerHTML=waBody(); }
A.waOpen = () => {
  if(S.data._clientsLoading) throw new Error('Клиенты ещё загружаются, подождите пару секунд');
  const w = freeWindows(waDate()).sort((a,b)=>b.mins-a.mins)[0]; if(w){ wa.from=w.from; wa.to=w.to; }
  wa.edited=false; wa.sent=new Set();
  const m = modal(`<h3>Оповестить в WhatsApp</h3><div id="wabox">${waBody()}</div>`); m.firstElementChild.classList.add('wide');
};
A.waDay = el => { wa.day=el.dataset.d; const w=freeWindows(waDate()).sort((a,b)=>b.mins-a.mins)[0]; if(w){wa.from=w.from;wa.to=w.to;} waRefresh(); };
A.waWin = el => { wa.from=el.dataset.f; wa.to=el.dataset.t; waRefresh(); };
A.waFrom = el => { if(el.value){ wa.from=el.value; waRefresh(); } };
A.waTo = el => { if(el.value){ wa.to=el.value; waRefresh(); } };
A.waMin = el => { wa.minDays=Math.max(0,+el.value||0); waRefresh(); };
A.waText = el => { wa.text=el.value; wa.edited=true; document.querySelectorAll('#warows a.wa').forEach(a=>{ const id=a.dataset.id, c=S.data.clients.find(x=>x.id===+id); a.href=`https://wa.me/${digits(c.phone)}?text=${encodeURIComponent(wa.text.replaceAll('{имя}',firstName(c.name)))}`; }); };
A.waSent = el => { wa.sent.add(+el.dataset.id); setTimeout(()=>{ const row=el.closest('.warow'); if(row){ row.classList.add('sent'); el.lastChild.textContent='Отправлено'; } },300); };
A.togConsent = async el => {
  const c=S.data.clients.find(x=>x.id===+el.dataset.id), v=el.checked;
  try{ await db.update('clients',c.id,{marketing_ok:v}); c.marketing_ok=v; toast(v?'Согласие отмечено':'Согласие снято'); }
  catch(e){ el.checked=!v; throw e; }
};

/* ================= Карточка клиента: авто и фото ================= */
const card = { id:null, edit:null, urls:{}, busy:false };
async function shrink(file, max=1280){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((ok,no)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>no(new Error('Не удалось открыть фото')); i.src=url; });
    const k = Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight)), cv=document.createElement('canvas');
    cv.width=Math.round(img.naturalWidth*k); cv.height=Math.round(img.naturalHeight*k);
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    return await new Promise(ok=>cv.toBlob(ok,'image/jpeg',.82));
  } finally { URL.revokeObjectURL(url); }
}
function photoGrid(){
  if(card.loading) return '<p class="muted small">Загрузка фото…</p>';
  const ph = S.data.client_photos.filter(p=>p.client_id===card.id).slice().reverse();
  if(!ph.length) return '<p class="muted small">Фотографий пока нет</p>';
  return `<div class="photos">${ph.map(p=>{ const k=S.data.cars.find(x=>x.id===p.car_id), u=card.urls[p.path];
    return `<figure>${u?`<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Фото клиента" loading="lazy"></a>`:'<div class="ph-wait"></div>'}
      <figcaption>${k?esc(k.model):'Без привязки'}${isAdmin()?`<button type="button" class="x" title="Удалить фото" data-act="delPhoto" data-id="${p.id}">×</button>`:''}</figcaption></figure>`; }).join('')}</div>`;
}
function cardBody(){
  const c=S.data.clients.find(x=>x.id===card.id), ks=carsOf(c.id), ed=ks.find(k=>k.id===card.edit);
  return `<h3>${esc(c.name)}</h3><p class="muted">${esc(c.phone)}</p>
  <div class="cat">Автомобили</div>
  ${ks.length?ks.map(k=>`<div class="warow"><span><b>${esc(k.model)}</b> ${plateTag(k.plate)}</span><span class="row"><button class="btn sm" data-act="carEdit" data-id="${k.id}">Изменить</button>${isAdmin()?`<button class="btn sm danger" data-act="carDel" data-id="${k.id}">Удалить</button>`:''}</span></div>`).join(''):'<p class="muted small">Авто не указано</p>'}
  <form data-form="carSave" data-id="${ed?.id||''}" style="margin-top:10px" autocomplete="off"><div class="f2">
    <label class="field"><span>${ed?'Изменить авто':'Добавить авто'}</span><input name="model" placeholder="Марка и модель" value="${esc(ed?.model)}" required></label>
    <label class="field"><span>Гос. знак (необязательно)</span><input name="plate" placeholder="А123ВС 123" autocapitalize="characters" style="text-transform:uppercase" value="${esc(ed?.plate)}"></label></div>
    <div class="row"><button class="btn primary sm">${ed?'Сохранить':'+ Добавить'}</button>${ed?'<button type="button" class="btn sm" data-act="carEditCancel">Отмена</button>':''}</div></form>
  <div class="cat" style="margin-top:18px">Фотографии</div>
  <div class="row" style="margin-bottom:10px">
    <select id="photocar" style="width:auto;max-width:60%"><option value="">Без привязки к авто</option>${ks.map(k=>`<option value="${k.id}">${esc(k.model)}${k.plate?' · '+esc(k.plate):''}</option>`).join('')}</select>
    <label class="btn sm${card.busy?' disabled':''}" style="cursor:pointer">${icon('plus')}${card.busy?'Загрузка…':'Добавить фото'}<input type="file" accept="image/*" multiple style="display:none" data-change="photoPick"${card.busy?' disabled':''}></label>
    <label class="btn sm${card.busy?' disabled':''}" style="cursor:pointer">📷 Снять<input type="file" accept="image/*" capture="environment" style="display:none" data-change="photoPick"${card.busy?' disabled':''}></label></div>
  <div id="photogrid">${photoGrid()}</div>
  <div class="actions"><button type="button" class="btn" data-act="closeModal">Закрыть</button></div>`;
}
async function cardRefresh(){
  const box=$('#cardbox'); if(!box) return;
  const keep=$('#photocar')?.value; box.innerHTML=cardBody(); if(keep&&$('#photocar')) $('#photocar').value=keep;
  const need=S.data.client_photos.filter(p=>p.client_id===card.id && !card.urls[p.path]).map(p=>p.path);
  if(need.length){ try{ Object.assign(card.urls, await db.photoUrls(need)); }catch(e){ toast(e.message,true); } const g=$('#photogrid'); if(g) g.innerHTML=photoGrid(); }
}
A.openCard = async el => {
  card.id=+el.dataset.id; card.edit=null; card.loading=true; const m=modal('<div id="cardbox"></div>'); m.firstElementChild.classList.add('wide'); cardRefresh();
  try{ const ph=await db.listWhere('client_photos','client_id',card.id); S.data.client_photos=S.data.client_photos.filter(p=>p.client_id!==card.id).concat(ph); }catch(e){ toast(e.message,true); }
  card.loading=false; cardRefresh();
};
A.carEdit = el => { card.edit=+el.dataset.id; cardRefresh(); };
A.carEditCancel = () => { card.edit=null; cardRefresh(); };
A.carSave = async f => {
  const model=f.model.value.trim(), plate=f.plate.value.trim().toUpperCase(), id=+f.dataset.id;
  if(!model) throw new Error('Укажите марку и модель');
  if(id){ Object.assign(S.data.cars.find(k=>k.id===id), await db.update('cars',id,{model,plate:plate||null})); }
  else S.data.cars.push(await db.insert('cars',{client_id:card.id, model, plate:plate||null}));
  const c=S.data.clients.find(x=>x.id===card.id); if(c.car!==model){ await db.update('clients',c.id,{car:model}); c.car=model; }
  card.edit=null; toast('Сохранено ✓'); cardRefresh();
};
A.carDel = async el => {
  const id=+el.dataset.id, k=S.data.cars.find(x=>x.id===id);
  if(!confirm(`Удалить авто «${k.model}»? Фотографии останутся, но потеряют привязку к авто.`)) return;
  await db.remove('cars',id); S.data.cars=S.data.cars.filter(x=>x.id!==id); S.data.client_photos.filter(p=>p.car_id===id).forEach(p=>p.car_id=null); cardRefresh();
};
A.photoPick = async el => {
  const files=[...el.files]; el.value=''; if(!files.length || card.busy) return;
  const car_id = $('#photocar')?.value ? +$('#photocar').value : null;
  card.busy=true; cardRefresh(); let ok=0;
  try{
    for(const f of files){
      const blob = await shrink(f); const path = await db.uploadPhoto(card.id, blob);
      S.data.client_photos.push(await db.insert('client_photos',{client_id:card.id, car_id, path})); ok++;
    }
  } catch(e){ toast(e.message,true); }
  card.busy=false; if(ok) toast(ok>1?`Загружено фото: ${ok} ✓`:'Фото добавлено ✓'); cardRefresh();
};
A.delPhoto = async el => {
  const id=+el.dataset.id, p=S.data.client_photos.find(x=>x.id===id); if(!confirm('Удалить фото? Это нельзя отменить.')) return;
  await db.remove('client_photos',id); try{ await db.removeFiles([p.path]); }catch{}
  S.data.client_photos=S.data.client_photos.filter(x=>x.id!==id); cardRefresh();
};

/* ================= Импорт контактов (.vcf) ================= */
const imp = { plan:null, busy:false };
function impPlan(parsed){
  const byPh = new Map(S.data.clients.map(c=>[digits(c.phone),c]));
  const fresh=[], extra=[]; let carsNew=0;
  for(const g of parsed.groups){
    const ex = byPh.get(g.phone);
    if(!ex){ fresh.push(g); carsNew+=g.cars.length; continue; }
    const have = new Set(carsOf(ex.id).map(k=>normS(k.plate)).filter(Boolean));
    const add = g.cars.filter(k=>!have.has(normS(k.plate)));
    if(add.length){ extra.push({client:ex, cars:add}); carsNew+=add.length; }
  }
  return { parsed, fresh, extra, carsNew, same: parsed.groups.length-fresh.length-extra.length };
}
function impBody(){
  const p=imp.plan;
  if(!p) return `<p class="muted">Выберите файл контактов (.vcf), скачанный из телефонной книги. Будут взяты только контакты, у которых в имени есть гос. номер (например «Алим Камри А123ВС») и есть телефон. Файл никуда не отправляется, он разбирается прямо на этом устройстве.</p>
    <label class="btn primary" style="cursor:pointer">Выбрать файл<input type="file" accept=".vcf,text/vcard,text/x-vcard,text/plain" style="display:none" data-change="impFile"></label>
    <div class="actions"><button class="btn" data-act="closeModal">Закрыть</button></div>`;
  const q=p.parsed;
  return `<p>В файле контактов: <b>${q.total}</b>. С гос. номером и телефоном: <b>${q.matched}</b> (без номера — ${q.noPlate}, без телефона — ${q.noPhone}, они пропущены).</p>
  <div class="card" style="margin:10px 0"><div>Новых клиентов: <b>${p.fresh.length}</b></div><div>Новых авто всего: <b>${p.carsNew}</b></div>
  <div>Клиент уже есть в CRM, добавлю только новые авто: <b>${p.extra.length}</b></div><div>Уже есть полностью, пропускаю: <b>${p.same}</b></div></div>
  <div class="muted small" style="margin-bottom:10px">Например: ${p.fresh.slice(0,4).map(g=>esc((g.name||'Без имени')+' — '+g.cars[0].model+' '+g.cars[0].plate)).join('; ')}</div>
  ${hasMk()?'<label class="check"><input type="checkbox" id="impmk"><span class="small">Отметить у всех согласие на сообщения (только если клиенты действительно давали согласие)</span></label>':''}
  <p class="muted small">Названия марок записываются так, как они были в контакте. Их можно поправить в «Авто и фото».</p>
  <div class="actions"><button class="btn" data-act="closeModal">Отмена</button><button class="btn primary" data-act="impGo"${imp.busy||(!p.fresh.length&&!p.extra.length)?' disabled':''}>${imp.busy?'Импортирую…':'Импортировать'}</button></div>`;
}
const impRefresh = () => { const b=$('#impbox'); if(b) b.innerHTML=impBody(); };
A.impOpen = () => {
  if(S.data._clientsLoading) throw new Error('Клиенты ещё загружаются, подождите пару секунд'); imp.plan=null; imp.busy=false; const m=modal('<h3>Импорт клиентов из контактов</h3><div id="impbox"></div>'); m.firstElementChild.classList.add('wide'); impRefresh(); };
A.impFile = async el => {
  const f=el.files[0]; el.value=''; if(!f) return;
  const parsed = parseVcf(await f.text());
  if(!parsed.matched) throw new Error('В файле не нашлось контактов с гос. номером и телефоном');
  imp.plan = impPlan(parsed); impRefresh();
};
A.impGo = async () => {
  const p=imp.plan; if(imp.busy||!p) return; imp.busy=true; impRefresh();
  const mk = $('#impmk')?.checked===true; let done=0;
  try{
    for(let i=0;i<p.fresh.length;i+=300){
      const part=p.fresh.slice(i,i+300);
      const cl = await db.insertMany('clients', part.map(g=>({ name:g.name||'Без имени', phone:maskPhone(g.phone), car:g.cars[0].model, note:'', ...(hasMk()?{marketing_ok:mk}:{}) })));
      S.data.clients.push(...cl);
      const cars = []; cl.forEach((c,j)=>part[j].cars.forEach(k=>cars.push({client_id:c.id, model:k.model, plate:k.plate})));
      S.data.cars.push(...await db.insertMany('cars',cars)); done+=part.length;
    }
    const more=[]; p.extra.forEach(e=>e.cars.forEach(k=>more.push({client_id:e.client.id, model:k.model, plate:k.plate})));
    for(let i=0;i<more.length;i+=300) S.data.cars.push(...await db.insertMany('cars',more.slice(i,i+300)));
  } catch(e){ imp.busy=false; toast(`Остановлено на ошибке (уже добавлено клиентов: ${done}): ${e.message}`,true); S.render(); return; }
  imp.busy=false; $('.overlay')?.remove(); toast(`Импорт завершён: клиентов ${p.fresh.length}, авто ${p.carsNew} ✓`); S.render();
};
