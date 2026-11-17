// Identity only. These mappings are not market prices or executable resale exits.
const rolex = {
  '126000':'Oyster Perpetual 36','124300':'Oyster Perpetual 41','116000':'Oyster Perpetual',
  '116500LN':'Daytona','126500LN':'Daytona','116520':'Daytona',
  '116618LB':'Submariner','116618LN':'Submariner','126618LB':'Submariner',
  '126610LN':'Submariner','126610LV':'Submariner','116610LN':'Submariner','116610LV':'Submariner',
  '124060':'Submariner','114060':'Submariner','16610':'Submariner','14060':'Submariner',
  '126710GRNR':'GMT-Master II','126710BLNR':'GMT-Master II','126710BLRO':'GMT-Master II',
  '116710BLNR':'GMT-Master II','116710LN':'GMT-Master II','126720VTNR':'GMT-Master II',
  '116713LN':'GMT-Master II','116400GV':'Milgauss',
  '126300':'Datejust','126334':'Datejust','126333':'Datejust','126234':'Datejust','16234':'Datejust',
  '124270':'Explorer','214270':'Explorer','114270':'Explorer','224270':'Explorer',
  '226570':'Explorer II','216570':'Explorer II','16570':'Explorer II','126900':'Air-King','116900':'Air-King',
};
// Exact observed references only; identity is not condition/configuration or value.
const observedReferences={
 '210.30.42.20.10.001':{brand:'Omega',model:'Seamaster Diver 300M'},
 '26470ST':{brand:'Audemars Piguet',model:'Royal Oak Offshore Chronograph'},
 '26470ST.OO.A104CR.01':{brand:'Audemars Piguet',model:'Royal Oak Offshore Chronograph'},
};
const targetBrands={
 Tudor:['79360N','25407N','7939G1A0NRU','79830RB','79030N','7941A1A0NU','25600TB','25600TN'],
 Omega:['310.30.42.50.01.002','311.30.42.30.01.006'],Cartier:['WSSA0018','W20073X8'],
 Rolex:['126613LN','116613LN','116300','116334'],
};
export function watchReferences(value) {
  const text=String(value??'').normalize('NFKC');
  const found=[];
  const pattern=/\b(?:7939G1A0NRU|7941A1A0NU|WSSA0018|W20073X8|\d{3}(?:\.[A-Z0-9]+){2,}|PAM\d{3,6}|M?\d{4,6}[A-Z]{1,4}(?:-\d{4})?|1[01246]\d{3,4}|2[12]\d{4})\b/gi;
  for(const m of text.matchAll(pattern)) {
    const before=text.slice(Math.max(0,m.index-24),m.index);
    if(/(?:\$|\b(?:price|asking|msrp|retail|comps?))\s*[:=-]?\s*$/i.test(before))continue;
    const ref=m[0].toUpperCase();if(!found.includes(ref))found.push(ref);
  }
  return found;
}
export function recognizeWatchIdentity(text,existing={}) {
  const normalized=String(text??'').normalize('NFKC');
  const reference=existing.reference?.toUpperCase() || watchReferences(normalized)[0] || null;
  let brand=existing.brand??null,model=existing.model??null;
  const mapped=rolex[reference];
  if(mapped && (!brand || brand==='Rolex')){brand='Rolex';model=mapped;}
  const observed=observedReferences[reference];
  if(observed && (!brand || brand===observed.brand)){brand=observed.brand;model=observed.model;}
  if(!brand)for(const [name,references]of Object.entries(targetBrands))if(references.includes(reference)){brand=name;break;}
  if(!brand && /\b(?:HBLT|HUBLOT)\b/i.test(normalized))brand='Hublot';
  if(!brand && /\b(?:RLX|R0LEX|ROLEX)\b/i.test(normalized))brand='Rolex';
  if(!brand && /\b(?:TDR|TUDOR)\b/i.test(normalized))brand='Tudor';
  if(!brand && /\b(?:OMG|OMEGA)\b/i.test(normalized))brand='Omega';
  if(brand==='Hublot' && /\bBIG BANG\b/i.test(normalized))model=/\bSANG BLEU\s*II\b/i.test(normalized)?'Big Bang Unico Sang Bleu II':'Big Bang';
  return {brand,model,reference};
}
