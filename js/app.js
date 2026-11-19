import { db, DEMO } from './db.js';
import { views, NAV } from './views.js';
import { S, $, toast, esc, icon } from './core.js';

const root = document.getElementById('root');

function loginScreen(msg=''){
  root.innerHTML = `
  <div class="login"><form class="login-card" id="lf" autocomplete="on">
    <div class="logo"><i>${icon('drop')}</i>CarwasH</div>
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
    catch(err){ loginScreen(err.message); }
  };
}

async function boot(){
  const allowed = NAV.filter(n => n.roles.includes(S.user.role));
  S.tab = allowed[0].id;
  root.innerHTML = `<div class="shell"><aside class="side"><div class="logo"><i>${icon('drop')}</i>CarwasH</div>
    <nav class="nav" id="nav">${allowed.map(n=>`<button data-tab="${n.id}">${icon(n.icon)}<span>${n.title}</span></button>`).join('')}</nav>
    <div class="me"><div><b>${esc(S.user.name)}</b><br><span class="role">${S.user.role==='admin'?'Администратор':'Сотрудник'}</span></div>
    <button class="btn sm" id="out">Выйти</button></div></aside>
    <div><div class="topbar"><div class="logo"><i>${icon('drop')}</i>CarwasH</div><button class="btn sm" id="out2">Выйти</button></div>
    <main class="main" id="main"><div class="grid g4"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></main></div></div>`;
  const out = async () => { await db.signOut(); S.user=null; loginScreen(); };
  $('#out').onclick = out; $('#out2').onclick = out;
  $('#nav').onclick = e => { const b=e.target.closest('[data-tab]'); if(b){ S.tab=b.dataset.tab; render(); } };
  try{ S.data = await db.loadAll(S.user.role); }catch(err){ toast('Ошибка загрузки: '+err.message,true); S.data = {clients:[],services:[],staff:[],bookings:[],orders:[],staff_pay:[]}; }
  render();
}

export function render(){
  const main = $('#main'); if(!main) return;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab===S.tab));
  main.innerHTML = `<div class="view">${views[S.tab].html()}</div>`;
  views[S.tab].after?.();
  window.scrollTo({top:0});
}
S.render = render;

// делегирование событий
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  const fn = views.actions[el.dataset.act]; if(!fn) return;
  try{ await fn(el, e); }catch(err){ toast(err.message,true); }
});
document.addEventListener('input', e => { const el=e.target.closest('[data-input]'); if(el) views.actions[el.dataset.input](el,e); });
document.addEventListener('change', async e => { const el=e.target.closest('[data-change]'); if(el){ try{ await views.actions[el.dataset.change](el,e);}catch(err){toast(err.message,true);} } });
document.addEventListener('submit', async e => { const f=e.target.closest('[data-form]'); if(!f) return; e.preventDefault(); try{ await views.actions[f.dataset.form](f,e);}catch(err){toast(err.message,true);} });

(async () => {
  try{ S.user = await db.session(); }catch{ S.user = null; }
  S.user ? boot() : loginScreen();
})();
