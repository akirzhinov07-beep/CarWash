import { db, DEMO } from './db.js';
import { views, NAV } from './views.js';
import { S, $, toast, esc, icon, maskPhone, modal, friendly } from './core.js';
const brand = `<a class="brand homelink" href="./" data-act="home" aria-label="На главную"><b>Бумеранг</b><span>${icon('pin')}Атажукина 2Б</span></a>`;

const root = document.getElementById('root');
db.warm(); // подготовить соединение с базой, пока пользователь вводит логин

function loginScreen(msg=''){
  root.innerHTML = `
  <div class="login"><form class="login-card" id="lf" autocomplete="on">
    ${brand}<div class="logo"><i>${icon('drop')}</i>CarwasH</div>
    <h1>Вход в систему</h1><p class="muted small">Введите логин и пароль, выданные администратором</p>
    <label class="field"><span>Логин</span><input name="login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus></label>
    <label class="field"><span>Пароль</span><input name="pass" type="password" autocomplete="current-password" required></label>
    <div class="err" role="alert">${esc(msg)}</div>
    <button class="btn primary block" type="submit">Войти</button>
    ${DEMO?'<p class="muted small" style="margin-top:14px">Демо: admin / admin или staff / staff</p>':''}
  </form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target), b = e.target.querySelector('button');
    b.disabled = true; b.textContent = 'Входим…';
    try{ S.user = await db.signIn(f.get('login'), f.get('pass')); await boot(); }
    catch(err){ loginScreen(friendly(err.message)); }
  };
}

async function boot(){
  const allowed = NAV.filter(n => n.roles.includes(S.user.role));
  S.tab = allowed[0].id;
  const many = allowed.length > 5; S.secTabs = many ? allowed.slice(4).map(n=>n.id) : [];
  root.innerHTML = `<div class="shell"><aside class="side">${brand}<a class="logo homelink" href="./" data-act="home" aria-label="На главную"><i>${icon('drop')}</i>CarwasH</a>
    <nav class="nav" id="nav">${allowed.map((n,i)=>`<button data-tab="${n.id}"${many&&i>=4?' class="sec"':''}>${icon(n.icon)}<span>${n.title}</span></button>`).join('')}${many?'<button class="morebtn" data-more aria-label="Ещё"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg><span>Ещё</span></button>':''}</nav>
    <div class="me"><div><b>${esc(S.user.name)}</b><br><span class="role">${S.user.role==='admin'?'Администратор':'Сотрудник'}</span></div>
    <button class="btn sm" id="out">Выйти</button></div></aside>
    <div><div class="topbar">${brand}<button class="btn sm" id="out2">Выйти</button></div>
    <main class="main" id="main"><div class="grid g4"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></main></div></div>`;
  const out = async () => { await db.signOut(); S.user=null; loginScreen(); };
  $('#out').onclick = out; $('#out2').onclick = out;
  $('#nav').onclick = e => {
    if(e.target.closest('[data-more]')){
      const m = modal(`<h3>Меню</h3><div class="sheet">${allowed.slice(4).map(n=>`<button class="btn block${S.tab===n.id?' primary':''}" data-sheet="${n.id}">${icon(n.icon)}${n.title}</button>`).join('')}<button class="btn block" data-sheet="__out">Выйти</button></div>`);
      m.onclick = ev => { const x=ev.target.closest('[data-sheet]'); if(!x) return; m.remove(); if(x.dataset.sheet==='__out') out(); else { S.tab=x.dataset.sheet; render(); } };
      return;
    }
    const b=e.target.closest('[data-tab]'); if(b){ S.tab=b.dataset.tab; render(); }
  };
  try{ S.data = await db.loadAll(S.user.role); }catch(err){ toast('Ошибка загрузки: '+err.message,true); S.data = {clients:[],services:[],staff:[],bookings:[],orders:[],staff_pay:[]}; }
  S.data.clients = []; S.data.cars = []; S.data.client_photos = []; S.data._clientsLoading = true;
  render();
  // клиентов и авто — тысячи, поэтому догружаем их фоном, когда главная уже открыта
  db.loadClients().then(x=>Object.assign(S.data,x)).catch(err=>toast('Не удалось загрузить клиентов: '+err.message,true))
    .finally(()=>{ S.data._clientsLoading = false; if(S.tab==='clients') render(); else if(S.tab==='record') views.record.sync?.(); });
}

export function render(){
  const main = $('#main'); if(!main) return;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.more!==undefined ? (S.secTabs||[]).includes(S.tab) : b.dataset.tab===S.tab));
  main.innerHTML = `<div class="view">${views[S.tab].html()}</div>`;
  views[S.tab].after?.();
  window.scrollTo({top:0});
}
S.render = render;
views.actions.home = () => { const first = NAV.find(n => n.roles.includes(S.user.role)); S.tab = first.id; render(); };

// делегирование событий
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  const fn = views.actions[el.dataset.act]; if(!fn) return;
  if(el.tagName==='A' && !el.target) e.preventDefault();
  try{ await fn(el, e); }catch(err){ toast(err.message,true); }
});
document.addEventListener('input', e => {
  const ph = e.target.closest('[data-phone]'); if(ph) ph.value = maskPhone(ph.value);
  const el = e.target.closest('[data-input]'); if(el) views.actions[el.dataset.input](el,e);
});
document.documentElement.classList.add('lite'); // анимации отключены везде
window.addEventListener('offline',()=>toast('Нет связи с интернетом. Запись не сохранится, пока связь не вернётся',true));
window.addEventListener('online',()=>toast('Связь восстановлена'));
document.addEventListener('change', async e => { const el=e.target.closest('[data-change]'); if(el){ try{ await views.actions[el.dataset.change](el,e);}catch(err){toast(err.message,true);} } });
document.addEventListener('submit', async e => { const f=e.target.closest('[data-form]'); if(!f) return; e.preventDefault(); try{ await views.actions[f.dataset.form](f,e);}catch(err){toast(err.message,true);} });

(async () => {
  try{ S.user = await db.session(); }catch{ S.user = null; }
  S.user ? boot() : loginScreen();
})();

window.__cw=1;
