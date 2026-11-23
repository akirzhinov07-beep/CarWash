// Разбор файла контактов (.vcf) из телефонной книги: берём только тех, у кого в имени есть гос. номер.
// Формат имени в контакте: «Имя Марка А123ВС» (имя и марка могут отсутствовать, номер может стоять в середине).
const LAT2CYR = { A:'А', B:'В', E:'Е', K:'К', M:'М', H:'Н', O:'О', P:'Р', C:'С', T:'Т', Y:'У', X:'Х' };
const PLATE = /(?<![A-Za-zА-Яа-яЁё0-9])([АВЕКМНОРСТУХABEKMHOPCTYX])\s?(\d{3})\s?([АВЕКМНОРСТУХABEKMHOPCTYX]{2})(?:\s?(\d{2,3}))?(?![A-Za-zА-Яа-яЁё])/i;

function qp(val){ // quoted-printable (UTF-8) -> строка
  const bytes = []; 
  for(let i=0;i<val.length;i++){
    if(val[i]==='=' && /^[0-9A-F]{2}$/i.test(val.slice(i+1,i+3))){ bytes.push(parseInt(val.slice(i+1,i+3),16)); i+=2; }
    else { const cp = val.codePointAt(i); if(cp>0xFFFF) i++; new TextEncoder().encode(String.fromCodePoint(cp)).forEach(b=>bytes.push(b)); }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}
export function readCards(text){
  const t = text.replace(/\r\n?/g,'\n').replace(/=\n/g,'').replace(/\n[ \t]/g,'');
  const out = [];
  for(const card of t.split(/BEGIN:VCARD/i).slice(1)){
    let fn = '', tels = [];
    for(const ln of card.split('\n')){
      const m = /^([^:]+):(.*)$/.exec(ln); if(!m) continue;
      const head = m[1].toUpperCase(), val = /QUOTED-PRINTABLE/.test(head) ? qp(m[2]) : m[2];
      if(head.startsWith('FN')) fn = val.trim(); else if(head.startsWith('TEL')) tels.push(val.trim());
    }
    out.push({ fn, tels });
  }
  return out;
}
const phone11 = tels => { for(const x of tels){ const d=x.replace(/\D/g,''); if(d.length===11 && (d[0]==='7'||d[0]==='8')) return '7'+d.slice(1); if(d.length===10) return '7'+d; } return null; };
const plateOf = m => { const s=(m[1]+m[3]).toUpperCase().replace(/[A-Z]/g,ch=>LAT2CYR[ch]||ch); return s[0]+m[2]+s.slice(1)+(m[4]?' '+m[4]:''); };

export function parseVcf(text){
  const cards = readCards(text), found = []; let noPlate = 0, noPhone = 0;
  for(const c of cards){
    const m = PLATE.exec(c.fn); if(!m){ noPlate++; continue; }
    const ph = phone11(c.tels); if(!ph){ noPhone++; continue; }
    found.push({ ph, plate:plateOf(m), tokens:(c.fn.slice(0,m.index)+' '+c.fn.slice(m.index+m[0].length)).split(/\s+/).filter(Boolean) });
  }
  // какие слова — марки, а какие — имена (по частоте в файле)
  const asModel = new Map(), asName = new Map();
  found.forEach(r=>{ r.tokens.forEach((t,i)=>{ const k=t.toLowerCase(), mp=i? asModel: asName; mp.set(k,(mp.get(k)||0)+1); }); });
  const isModel = t => { const k=t.toLowerCase(); return (asModel.get(k)||0)>=3 && (asModel.get(k)||0) > (asName.get(k)||0); };
  found.forEach(r=>{
    const [first,...rest] = r.tokens;
    if(first && !isModel(first)){ r.name = first; r.model = rest.join(' '); }
    else { r.name = ''; r.model = r.tokens.join(' '); }
  });
  // один клиент = один телефон; у него может быть несколько авто
  const byPhone = new Map();
  found.forEach(r=>{
    let g = byPhone.get(r.ph); if(!g){ g = { phone:r.ph, name:r.name, cars:[] }; byPhone.set(r.ph,g); }
    if(!g.name && r.name) g.name = r.name;
    const key = r.plate.replace(/\s/g,'');
    if(!g.cars.some(k=>k.plate.replace(/\s/g,'')===key)) g.cars.push({ model:r.model||'Не указано', plate:r.plate });
  });
  return { total:cards.length, noPlate, noPhone, matched:found.length, groups:[...byPhone.values()] };
}
