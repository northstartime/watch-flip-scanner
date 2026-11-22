// Explicit documented costs only. No source data access or inferred fee schedules.
const fail=()=>{throw Object.assign(Error('DOCUMENTED_ACQUISITION_TERMS_REQUIRED'),{code:'DOCUMENTED_ACQUISITION_TERMS_REQUIRED'});};
const cents=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000000||Math.abs(v*100-Math.round(v*100))>0.00001)fail();return Math.round(v*100);};
const rate=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>=1||Math.abs(v*10000-Math.round(v*10000))>0.000001)fail();return Math.round(v*10000);};
export function acquisitionCalculator(costs){
 const fixed=cents(costs?.acquisitionExtras),t=costs.acquisitionTerms;let premiumRate=0,taxRate=0,minimum=0,maximum=Infinity;
 if(t!==undefined){
  if(!t||typeof t.reference!=='string'||!t.reference.trim()||!['price','price_plus_premium'].includes(t.taxBase)||!Object.hasOwn(t,'premiumMaximum'))fail();
  premiumRate=rate(t.premiumRate);taxRate=rate(t.taxRate);minimum=cents(t.premiumMinimum);maximum=t.premiumMaximum===null?Infinity:cents(t.premiumMaximum);if(maximum<minimum)fail();
 }
 const atCents=price=>{const premium=Math.min(maximum,Math.max(minimum,Math.ceil(price*premiumRate/10000))),tax=Math.ceil((price+(t?.taxBase==='price_plus_premium'?premium:0))*taxRate/10000);return{price:price/100,premium:premium/100,tax:tax/100,fixed:fixed/100,allIn:(price+premium+tax+fixed)/100};};
 return{at:price=>atCents(cents(price)),ceiling:allIn=>{const budget=cents(allIn);if(fixed>budget||Math.round(atCents(0).allIn*100)>budget)return null;let lo=0,hi=budget,best=0;while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(Math.round(atCents(mid).allIn*100)<=budget){best=mid;lo=mid+1;}else hi=mid-1;}return best/100;},basis:t?'documented_fixed_extras_plus_variable_premium_and_tax':'documented_fixed_extras',variableTermsNeverInferred:true};
}
