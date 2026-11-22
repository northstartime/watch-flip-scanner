import fs from 'node:fs/promises';
// Separate from the original 28, and opt-in through the existing local watchlist.
export async function optionalTargets(){
 const data=JSON.parse(await fs.readFile(new URL('./optional-acquisition-targets.json',import.meta.url),'utf8'));
 if(data.schemaVersion!==1||!Array.isArray(data.entries)||data.entries.length!==5||new Set(data.entries.map(t=>t.reference)).size!==5)throw Error('INVALID_OPTIONAL_TARGETS');
 for(const t of data.entries)if(t.brand!=='Rolex'||!t.configuration?.dial||!t.playbook?.configurationChecks?.length||t.minimumNetProfit!==1000||t.optional!==true)throw Error('INVALID_OPTIONAL_TARGETS');
 return data.entries;
}
