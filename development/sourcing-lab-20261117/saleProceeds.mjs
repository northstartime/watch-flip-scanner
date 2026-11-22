// Shared conservative selling-cost arithmetic. Each distinct percentage fee rounds up.
const fail=()=>{throw Object.assign(Error('DOCUMENTED_SELLING_COSTS_REQUIRED'),{code:'DOCUMENTED_SELLING_COSTS_REQUIRED'});};
const cents=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000000||Math.abs(v*100-Math.round(v*100))>0.00001)fail();return BigInt(Math.round(v*100));};
function fraction(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>=1)fail();if(Math.abs(value*10000-Math.round(value*10000))<1e-10)return[BigInt(Math.round(value*10000)),10000n];const [m,e='0']=String(value).split('e'),places=(m.split('.')[1]?.length??0)-Number(e),n=BigInt(m.replace('.',''));return places>=0?[n,10n**BigInt(places)]:[n*10n**BigInt(-places),1n];}
const ceil=(a,b)=>(a+b-1n)/b;
export function saleCalculator(sale){
 const platform=fraction(sale?.platformRate),payment=fraction(sale?.paymentRate);if(sale.platformRate+sale.paymentRate>=1)fail();
 const fixed=['shipping','insurance','platformFixed','paymentFixed','other'].reduce((sum,k)=>sum+cents(sale[k]),0n);
 const atCents=gross=>{const platformFee=ceil(gross*platform[0],platform[1]),paymentFee=ceil(gross*payment[0],payment[1]),fees=platformFee+paymentFee+fixed;return{gross:Number(gross)/100,platformVariableFee:Number(platformFee)/100,paymentVariableFee:Number(paymentFee)/100,fixedSellingExpenses:Number(fixed)/100,sellingExpenses:Number(fees)/100,netProceeds:Number(gross-fees)/100};};
 return{at:gross=>atCents(cents(gross)),minimumGrossForNet:net=>{const target=cents(net);if(target<100000n)fail();const numerator=platform[0]*payment[1]+payment[0]*platform[1],denominator=platform[1]*payment[1],combined=g=>g-ceil(g*numerator,denominator)-fixed;let lo=0n,hi=10000000000n,best=null;if(combined(hi)<target)return null;while(lo<=hi){const mid=(lo+hi)/2n;if(combined(mid)>=target){best=mid;hi=mid-1n;}else lo=mid+1n;}
 // Separate rounded fees can jump together: net is not strictly monotone by cent.
 // Start at the monotone combined-fee lower bound, then find the first true fit.
 // USD100m cap and at least USD1000 required net bound this interval to100001cents.
 for(let g=best;g<=10000000000n;g++){if(Math.round(atCents(g).netProceeds*100)>=Number(target))return Number(g)/100;}return null;},roundingPolicy:'each_percentage_fee_rounded_up_to_cent_not_provider_schedule'};
}
