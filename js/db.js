import { SUPABASE_URL, SUPABASE_KEY, LOGIN_DOMAIN } from './config.js';

// Единый слой данных: Supabase (боевой) или демо в localStorage (?demo=1, только для показа/тестов).
export const DEMO = new URLSearchParams(location.search).has('demo');
let sb = null;

const T = ['clients','services','staff','bookings','orders','staff_pay'];

async function supa(){
  if(sb) return sb;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:true, autoRefreshToken:true } });
  return sb;
}

/* ---------- демо-хранилище ---------- */
const LS = 'carwash-demo-v1';
function demoLoad(){
  try{ const d = JSON.parse(localStorage.getItem(LS)); if(d) return d; }catch{}
  const now = Date.now(), day = 864e5, d = { seq:100, user:null,
    services:[[1,'Мойка кузова','Мойка',800,30],[2,'Комплексная мойка','Мойка',1500,60],[3,'Химчистка салона','Химчистка',6000,180],[4,'Полировка кузова','Полировка',5000,150],[5,'Керамика','Защита',12000,240],[6,'Чернение резины','Прочее',300,10]]
      .map(([id,name,category,price,minutes])=>({id,name,category,price,minutes,active:true})),
    staff:[{id:1,name:'Иван Петров',position:'Мойщик',phone:'+7 900 111-11-11',active:true},{id:2,name:'Сергей Ким',position:'Детейлер',phone:'+7 900 222-22-22',active:true}],
    staff_pay:[{staff_id:1,percent:30},{staff_id:2,percent:35}],
    clients:[{id:1,name:'Алексей Смирнов',phone:'+7 901 555-01-01',car:'Toyota Camry',note:'',created_at:new Date(now-9*day).toISOString()},{id:2,name:'Мария Орлова',phone:'+7 902 555-02-02',car:'BMW X5',note:'Любит без воска',created_at:new Date(now-3*day).toISOString()}],
    bookings:[], orders:[] };
  for(let i=0;i<24;i++){ const sv=d.services[i%4], st=d.staff[i%2], c=d.clients[i%2], at=new Date(now-(i%9)*day-i*36e5).toISOString();
    d.orders.push({id:200+i,booking_id:null,client_name:c.name,phone:c.phone,car:c.car,services:[{id:sv.id,name:sv.name,category:sv.category,price:sv.price}],total:sv.price,staff_id:st.id,pay_type:i%3?'card':'cash',created_at:at}); }
  return d;
}
let demo = DEMO ? demoLoad() : null;
const demoSave = () => localStorage.setItem(LS, JSON.stringify(demo));

/* ---------- публичный API ---------- */
export const db = {
  async session(){
    if(DEMO) return demo.user;
    const c = await supa(); const { data } = await c.auth.getSession();
    if(!data.session) return null;
    return loadProfile(c, data.session.user);
  },
  async signIn(login, pass){
    if(DEMO){
      const l = login.trim().toLowerCase();
      if((l==='admin'||l==='staff') && pass===l){ demo.user={id:l,name:l,role:l}; demoSave(); return demo.user; }
      throw new Error('Неверный логин или пароль');
    }
    const c = await supa();
    const { data, error } = await c.auth.signInWithPassword({ email: login.trim().toLowerCase()+LOGIN_DOMAIN, password: pass });
    if(error){
      const m = (error.message||'').toLowerCase();
      if(m.includes('not confirmed')) throw new Error('Почта пользователя не подтверждена: в Supabase включите Auto Confirm для этого пользователя');
      if(m.includes('fetch') || m.includes('network')) throw new Error('Нет связи с базой. Проверьте интернет или VPN');
      throw new Error('Неверный логин или пароль');
    }
    return loadProfile(c, data.user);
  },
  async signOut(){ if(DEMO){ demo.user=null; demoSave(); return; } const c=await supa(); await c.auth.signOut(); },

  async loadAll(role){
    const out = {};
    const names = T.filter(t => role==='admin' || !['orders','staff_pay'].includes(t));
    if(DEMO){ names.forEach(n => out[n]=[...demo[n]]); return fill(out); }
    const c = await supa();
    await Promise.all(names.map(async n => {
      const { data, error } = await c.from(n).select('*').order('id',{ascending:true}).limit(5000);
      if(error) throw new Error(error.message);
      out[n] = data;
    }));
    return fill(out);
  },
  async insert(table, row, returning=true){
    if(DEMO){ const r={...(table==='bookings'?{status:'pending',pay_type:null}:{}),...row,id:++demo.seq,created_at:row.created_at||new Date().toISOString()}; demo[table].push(r); demoSave(); return r; }
    const c = await supa();
    const q = c.from(table).insert(row);
    if(!returning){ const { error } = await q; if(error) throw new Error(error.message); return null; }
    const { data, error } = await q.select().single();
    if(error) throw new Error(error.message);
    return data;
  },
  async update(table, id, patch, key='id'){
    if(DEMO){ const r=demo[table].find(x=>x[key]===id); Object.assign(r,patch); demoSave(); return r; }
    const c = await supa();
    const { data, error } = await c.from(table).update(patch).eq(key,id).select().single();
    if(error) throw new Error(error.message);
    return data;
  },
  async upsert(table, row, key){
    if(DEMO){ const i=demo[table].findIndex(x=>x[key]===row[key]); i<0?demo[table].push(row):Object.assign(demo[table][i],row); demoSave(); return row; }
    const c = await supa();
    const { error } = await c.from(table).upsert(row,{onConflict:key});
    if(error) throw new Error(error.message);
    return row;
  },
  async remove(table, id){
    if(DEMO){ demo[table]=demo[table].filter(x=>x.id!==id); demoSave(); return; }
    const c = await supa();
    const { error } = await c.from(table).delete().eq('id',id);
    if(error) throw new Error(error.message);
  }
};
const fill = o => { T.forEach(t => o[t] = o[t] || []); return o; };

async function loadProfile(c, user){
  const { data, error } = await c.from('profiles').select('full_name,role').eq('id',user.id).single();
  if(error || !data){ await c.auth.signOut(); throw new Error('Профиль не найден. Обратитесь к администратору.'); }
  return { id:user.id, name:data.full_name || user.email, role:data.role };
}
