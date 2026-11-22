// ENTIRELY SYNTHETIC TEST DATA. No listing, sale, quote, cost or proof is real.
export const dataKind='SYNTHETIC_FIXTURE';
export const now='2026-11-18T12:00:00Z';
export const watch={brand:'Tudor',reference:'25407N',configuration:{dial:'Black',bracelet:'Titanium',year:'2024',condition:'Excellent'}};
const observation=(id,price,at=now,extra={})=>({source:'fixture-private',sourceRecordId:id,title:`SYNTHETIC FIXTURE Tudor 25407N ${id}`,url:`https://example.test/fixture/${id}`,watch,askingPrice:price,currency:'USD',saleStatus:'sale',originalListedAt:'2026-09-01T00:00:00Z',observedAt:at,...extra});
export const batches=[
 [observation('motivated',3100,'2026-11-01T12:00:00Z')],
 [observation('motivated',2950,'2026-11-10T12:00:00Z')],
 [observation('motivated',2800),observation('unknown-ask',null),observation('configuration-gap',2700,now,{watch:{...watch,configuration:{}}}),observation('stale-observation',2500,'2026-11-10T12:00:00Z'),observation('reserve-not-met',null,now,{auctionStatus:'reserve_not_met',saleStatus:'other'})]
];
const sale=(id,amount,extra={})=>({source:'fixture-sales',recordId:id,url:`https://example.test/fixture-sales/${id}`,watch,kind:'sold',amount,currency:'USD',eventAt:'2026-11-12T12:00:00Z',observedAt:now,...extra});
export const sales=[sale('one',3800),sale('two',3900),sale('three',4000),sale('wrong-dial',2000,{watch:{...watch,configuration:{...watch.configuration,dial:'Blue'}}}),sale('current-ask',10000,{kind:'asking'}),sale('unreviewed',99999)];
export const quote={...sale('exit-quote',3700),kind:'executable_exit',eventAt:now,expiresAt:'2026-11-19T12:00:00Z'};
export const costs={acquisitionExtras:100,acquisitionCostBasis:'SYNTHETIC FIXTURE: explicit shipping/tax/service budget',sale:{shipping:50,insurance:20,platformFixed:0,paymentFixed:0,other:30,platformRate:0.02,paymentRate:0,costBasis:'SYNTHETIC FIXTURE: documented fictional fee scenario'}};
export const reviewedIds=['one','two','three','wrong-dial','current-ask','exit-quote'];
