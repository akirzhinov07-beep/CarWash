import { SUPABASE_URL, SUPABASE_KEY, LOGIN_DOMAIN } from './config.js';

// Единый слой данных: Supabase (боевой) или демо в localStorage (?demo=1, только для показа/тестов).
export const DEMO = new URLSearchParams(location.search).has('demo');
let sb = null;

const T = ['clients','services','staff','bookings','orders','staff_pay','supplies','profiles','settings','cars','client_photos'];
const ADMIN_ONLY = ['orders','staff_pay','supplies','profiles'];

async function supa(){
  if(sb) return sb;
  const { createClient } = await import('../vendor/supabase.js');
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
    clients:[{id:1,name:'Алексей Смирнов',phone:'+7 901 555-01-01',car:'Toyota Camry',note:'',marketing_ok:true,created_at:new Date(now-9*day).toISOString()},{id:2,name:'Мария Орлова',phone:'+7 902 555-02-02',car:'BMW X5',note:'Любит без воска',marketing_ok:true,created_at:new Date(now-3*day).toISOString()}],
    cars:[{id:11,client_id:1,model:'Toyota Camry',plate:'А123ВС 123',created_at:new Date(now-9*day).toISOString()},{id:12,client_id:1,model:'Lada Vesta',plate:'К777КК 07',created_at:new Date(now-5*day).toISOString()},{id:13,client_id:2,model:'BMW X5',plate:null,created_at:new Date(now-3*day).toISOString()}], client_photos:[],
    bookings:[], orders:[], supplies:[{id:300,name:'Шампунь для бесконтактной мойки',qty:5,unit_price:1800,bought_at:new Date(now-6*day).toISOString().slice(0,10),note:'Канистры по 5 л',created_at:new Date().toISOString()}] };
  for(let i=0;i<24;i++){ const sv=d.services[i%4], st=d.staff[i%2], c=d.clients[i%2], at=new Date(now-(i%9)*day-i*36e5).toISOString();
    d.orders.push({id:200+i,booking_id:null,client_name:c.name,phone:c.phone,car:c.car,services:[{id:sv.id,name:sv.name,category:sv.category,price:sv.price}],total:sv.price,staff_id:st.id,pay_type:i%3?'card':'cash',created_at:at}); }
  return d;
}
let demo = DEMO ? demoLoad() : null;
if(demo && !demo.supplies) demo.supplies = [];
if(demo && !demo.profiles) demo.profiles = [{id:'admin',full_name:'admin',role:'admin',staff_id:null}];
if(demo && !demo.creds) demo.creds = {};
if(demo && !demo.settings) demo.settings = [];
if(demo && !demo.cars) demo.cars = [];
if(demo && !demo.client_photos) demo.client_photos = [];
const demoSave = () => localStorage.setItem(LS, JSON.stringify(demo));

/* ---------- публичный API ---------- */
export const db = {
  warm(){ if(!DEMO) supa().catch(()=>{}); },
  async session(){
    if(DEMO) return demo.user;
    const c = await supa(); const { data } = await c.auth.getSession();
    if(!data.session) return null;
    db.startLoad();
    return loadProfile(c, data.session.user);
  },
  async signIn(login, pass){
    if(DEMO){
      const l = login.trim().toLowerCase();
      if((l==='admin'||l==='staff') && pass===l){ demo.user={id:l,name:l,role:l}; demoSave(); return demo.user; }
      if(demo.creds[l] && demo.creds[l]===pass){ demo.user={id:l,name:l,role:'staff'}; demoSave(); return demo.user; }
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
    db.startLoad();
    return loadProfile(c, data.user);
  },
  async signOut(){ if(DEMO){ demo.user=null; demoSave(); return; } const c=await supa(); await c.auth.signOut(); },

  // Данные грузятся параллельно. Клиенты и авто (их тысячи) — отдельным вторым шагом, чтобы главная открывалась сразу.
  startLoad(){ if(!DEMO && !this._pre) this._pre = loadCore(); },
  async loadAll(role){
    const out = {};
    const names = T.filter(t => (role==='admin' || !ADMIN_ONLY.includes(t)) && !HEAVY.includes(t));
    if(DEMO){ names.forEach(n => out[n]=[...demo[n]]); out.clients=[]; out.cars=[]; out.client_photos=[]; return fill(out); }
    const got = await (this._pre || loadCore()); this._pre = null;
    names.forEach(n => { out[n] = got[n]; }); Object.assign(out, got._flags);
    return fill(out);
  },
  async loadClients(){
    if(DEMO) return { clients:[...demo.clients], cars:[...demo.cars], _carsMissing:false };
    const c = await supa(), out = {};
    const [cl, ca] = await Promise.all([fetchAll(c,'clients'), fetchAll(c,'cars')]);
    if(cl.error) throw new Error(cl.error.message);
    out.clients = cl.data; out.cars = ca.error ? [] : ca.data; out._carsMissing = !!ca.error;
    return out;
  },
  async list(table){
    if(DEMO) return [...demo[table]];
    const c = await supa(); const { data, error } = await c.from(table).select('*');
    if(error) throw new Error(error.message); return data;
  },
  async rpc(name, args){
    if(DEMO){
      const l = String(args.p_login||'').toLowerCase();
      if(name==='admin_create_login'){
        if(demo.creds[l]) throw new Error('Такой логин уже существует');
        if(String(args.p_password).length<8) throw new Error('Пароль должен быть не короче 8 символов');
        demo.creds[l]=args.p_password; demo.profiles.push({id:'u'+(++demo.seq),full_name:l,role:'staff',staff_id:args.p_staff_id});
      } else if(name==='admin_set_password'){ if(!demo.creds[l]) throw new Error('Логин не найден'); demo.creds[l]=args.p_password; }
      else if(name==='admin_delete_login'){ delete demo.creds[l]; demo.profiles=demo.profiles.filter(p=>p.full_name!==l); }
      demoSave(); return;
    }
    const c = await supa(); const { error } = await c.rpc(name, args);
    if(error) throw new Error(error.message);
  },
  async listWhere(table, col, val){
    if(DEMO) return demo[table].filter(x=>x[col]===val);
    const c = await supa(); const { data, error } = await c.from(table).select('*').eq(col,val).order('id',{ascending:true});
    if(error) throw new Error(error.message); return data;
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
  async insertMany(table, rows){
    if(!rows.length) return [];
    if(DEMO){ const out=rows.map(row=>({...row,id:++demo.seq,created_at:new Date().toISOString()})); demo[table].push(...out); demoSave(); return out; }
    const c = await supa(); const { data, error } = await c.from(table).insert(rows).select();
    if(error) throw new Error(error.message); return data;
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
  async updateWhere(table, col, val, patch){
    if(DEMO){ demo[table].filter(x=>x[col]===val).forEach(x=>Object.assign(x,patch)); demoSave(); return; }
    const c = await supa(); const { error } = await c.from(table).update(patch).eq(col, val);
    if(error) throw new Error(error.message);
  },
  // Фото: в боевом режиме — закрытое хранилище Supabase, в демо — data-URL
  async uploadPhoto(clientId, blob){
    if(DEMO) return await new Promise((ok,no)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>no(new Error('Не удалось прочитать фото')); r.readAsDataURL(blob); });
    const c = await supa(), path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
    const { error } = await c.storage.from('client-photos').upload(path, blob, { contentType:'image/jpeg' });
    if(error) throw new Error(error.message.includes('Bucket not found') ? 'Хранилище фото не настроено: выполните supabase/cars.sql' : error.message);
    return path;
  },
  async photoUrls(paths){
    const out = {}; if(!paths.length) return out;
    if(DEMO){ paths.forEach(p=>out[p]=p); return out; }
    const c = await supa(); const { data, error } = await c.storage.from('client-photos').createSignedUrls(paths, 3600);
    if(error) throw new Error(error.message);
    (data||[]).forEach(d=>{ if(d.signedUrl) out[d.path]=d.signedUrl; }); return out;
  },
  async removeFiles(paths){
    if(DEMO || !paths.length) return;
    const c = await supa(); const { error } = await c.storage.from('client-photos').remove(paths);
    if(error) throw new Error(error.message);
  },
  async remove(table, id){
    if(DEMO){ demo[table]=demo[table].filter(x=>x.id!==id); demoSave(); return; }
    const c = await supa();
    const { error } = await c.from(table).delete().eq('id',id);
    if(error) throw new Error(error.message);
  }
};
const fill = o => { T.forEach(t => o[t] = o[t] || []); return o; };

const HEAVY = ['clients','cars','client_photos'];
const PAGE = 1000; // Supabase отдаёт не больше 1000 строк за запрос
async function fetchAll(c, n){
  const ordered = n!=='staff_pay' && n!=='settings';
  const mk = () => { let q = c.from(n).select('*'); return ordered ? q.order('id',{ascending:true}) : q; };
  const first = await (ordered ? c.from(n).select('*',{count:'exact'}).order('id',{ascending:true}) : c.from(n).select('*',{count:'exact'})).range(0, PAGE-1);
  if(first.error || !ordered) return first;
  const total = first.count ?? first.data.length; if(total <= PAGE) return first;
  const jobs = []; for(let from=PAGE; from<total; from+=PAGE) jobs.push(mk().range(from, from+PAGE-1));
  const rest = await Promise.all(jobs), bad = rest.find(r=>r.error); if(bad) return bad;
  return { data: first.data.concat(...rest.map(r=>r.data)), error:null };
}
async function loadCore(){
  const c = await supa(), out = { _flags:{} };
  await Promise.all(T.filter(t=>!HEAVY.includes(t)).map(async n => {
    const r = await fetchAll(c, n);
    if(r.error){
      if(n==='supplies'){ out.supplies = []; out._flags._suppliesMissing = true; return; }
      if(n==='settings'){ out.settings = []; out._flags._settingsMissing = true; return; }
      if(ADMIN_ONLY.includes(n)){ out[n] = []; return; }
      throw new Error(r.error.message);
    }
    out[n] = r.data;
  }));
  return out;
}
async function loadProfile(c, user){
  const { data, error } = await c.from('profiles').select('full_name,role').eq('id',user.id).single();
  if(error || !data){ await c.auth.signOut(); throw new Error('Профиль не найден. Обратитесь к администратору.'); }
  return { id:user.id, name:data.full_name || user.email, role:data.role };
}
