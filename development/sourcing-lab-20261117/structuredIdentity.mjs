import {identifyReference} from './listingSignals.mjs';
const aliases=new Map([['reference number','reference'],['reference','reference'],['brand','brand'],['dial','dial'],['dial color','dial'],['bracelet','bracelet'],['bracelet type','bracelet'],['year','year'],['year manufactured','year'],['condition','condition'],['completeness','completeness'],['case material','caseMaterial']]);
export function identifyStructuredWatch({title='',localizedAspects=[]}={},targets){
 if(!Array.isArray(localizedAspects)||localizedAspects.length>100)return{watch:null,status:'invalid_structured_aspects'};
 const values=new Map();
 for(const aspect of localizedAspects){if(typeof aspect?.name!=='string'||typeof aspect.value!=='string')continue;const key=aliases.get(aspect.name.trim().toLowerCase()),value=aspect.value.normalize('NFKC').trim();if(!key||!value||value.length>120||/^(unknown|unspecified|not specified|does not apply|n\/a)$/i.test(value))continue;
  if(values.has(key)&&values.get(key).toLowerCase()!==value.toLowerCase())return{watch:null,status:'contradictory_structured_'+key};values.set(key,value);
 }
 const identity=identifyReference({title,reference:values.get('reference')??null,brand:values.get('brand')??null},targets);if(!identity.watch)return identity;
 const configuration={};for(const field of ['dial','bracelet','year','condition','completeness','caseMaterial']){const value=values.get(field);if(!value)continue;if(field==='year'&&!/^\d{4}$/.test(value)||field==='bracelet'&&/^(bracelet|strap|band)$/i.test(value)||field==='condition'&&/^(used|pre-owned|preowned)$/i.test(value))continue;configuration[field]=value;}
 return{...identity,watch:{...identity.watch,configuration},configurationOrigin:'explicit_provider_fields_unverified',status:'identity_identified_configuration_unverified'};
}
