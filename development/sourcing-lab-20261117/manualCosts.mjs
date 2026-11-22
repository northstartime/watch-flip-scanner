const fail=()=>{throw Object.assign(Error('ALL_DOCUMENTED_COST_FIELDS_REQUIRED'),{code:'ALL_DOCUMENTED_COST_FIELDS_REQUIRED'});};
export function manualCosts(fields){
 const amount=(name,percentage=false)=>{const value=fields?.[name],pattern=percentage?/^\d{1,3}(?:\.\d{1,16})?$/:/^\d{1,9}(?:\.\d{1,2})?$/;if(typeof value!=='string'||!pattern.test(value.trim()))fail();const n=Number(value);if(n>100000000)fail();return n;};
 const basis=name=>{if(typeof fields?.[name]!=='string'||!fields[name].trim()||fields[name].length>1000)fail();return fields[name].trim();};
 const platformRate=amount('platformPercent',true)/100,paymentRate=amount('paymentPercent',true)/100;if(platformRate+paymentRate>=1)fail();
 return{acquisitionExtras:amount('acquisitionExtras'),acquisitionCostBasis:basis('acquisitionCostBasis'),sale:{shipping:amount('saleShipping'),insurance:amount('saleInsurance'),platformFixed:amount('platformFixed'),paymentFixed:amount('paymentFixed'),other:amount('saleOther'),platformRate,paymentRate,costBasis:basis('saleCostBasis')}};
}
