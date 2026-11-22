import {parseCSV} from './reused/development/market-intelligence/authorizedExport.mjs';
// Date.parse silently rolls February 30 into March. Do not invent an event date.
export function validCalendarTime(value){
 if(typeof value!=='string')return false;
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/);
 if(!m)return false;const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 if(y<1000||month<1||month>12||day<1||day>new Date(Date.UTC(y,month,0)).getUTCDate())return false;
 if(m[4]&&(Number(m[4])>23||Number(m[5])>59||Number(m[6])>59))return false;
 if(m[7]&&m[7]!=='Z'&&(Number(m[7].slice(1,3))>23||Number(m[7].slice(4))>59))return false;
 return Number.isFinite(Date.parse(value));
}
export function evidenceCalendarIssues(csv){
 const {header,rows}=parseCSV(csv),issues=[];
 for(let i=0;i<rows.length;i++)for(const field of ['observedAt','eventAt','originalListedAt','expiresAt']){const index=header.indexOf(field);if(index>=0&&rows[i][index]&&!validCalendarTime(rows[i][index]))issues.push({row:i+2,code:'INVALID_CALENDAR_DATE',field});}
 return issues;
}
