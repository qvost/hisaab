const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hisaab-forex-'));
process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const program = ts.createProgram(['src/lib/forex/calculator.ts','src/lib/forex/proxy.ts','src/lib/forex/lookup.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,strict:true,skipLibCheck:true,resolveJsonModule:true,esModuleInterop:true});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
program.emit();
const { calculateRemittanceStatutoryFigures: calculate } = require(path.join(out,'calculator.js'));
const { parseNrbResponse, parsePublication, nstToday } = require(path.join(out,'types.js'));
const { handleForexRequest } = require(path.join(out,'proxy.js'));
const { createForexLookup } = require(path.join(out,'lookup.js'));
const rate={buy:134.2,sell:134.8,unit:1,effectiveBuy:134.2};
const publication=(date,rates={USD:rate})=>({date,publishedOn:Object.keys(rates).length ? date : '',rates});
const raw=(date)=>({status:{code:200},data:{payload:[{date,published_on:`${date} 10:30:00`,rates:[{currency:{iso3:'USD',unit:1},buy:'134.20',sell:'134.80'},{currency:{iso3:'JPY',unit:10},buy:'87.50',sell:'87.90'},{currency:{iso3:'INR',unit:100},buy:'160.00',sell:'160.15'}]}]}});
function setup({entries=[],network=async date=>publication(date),online=true,now='2026-11-13T06:00:00Z'}={}) {
 const cache=new Map(entries.map(p=>[p.date,p])), calls=[];
 const deps={readCache:async date=>cache.get(date),writeCache:async p=>cache.set(p.date,p),fetchPublication:async date=>{calls.push(date);return network(date);},isOnline:()=>online,now:()=>new Date(now)};
 return {lookup:createForexLookup(deps),cache,calls,deps};
}
test('NRB normalization handles quoted units, numeric strings and malformed responses',()=>{
 const p=parseNrbResponse(raw('2024-08-15'),'2024-08-15');
 assert.equal(p.rates.JPY.effectiveBuy,8.75);assert.equal(p.rates.INR.effectiveBuy,1.6);assert.equal(p.rates.USD.effectiveBuy,134.2);
 assert.deepEqual(parseNrbResponse({data:{payload:[]}},'2024-08-15'),publication('2024-08-15',{}));
 for(const value of [{}, {data:{payload:null}},raw('2024-08-14')]) assert.throws(()=>parseNrbResponse(value,'2024-08-15'));
 const zero=raw('2024-08-15');zero.data.payload[0].rates[0].currency.unit=0;assert.throws(()=>parseNrbResponse(zero,'2024-08-15'));
 assert.throws(()=>parsePublication({...p,rates:{USD:{...rate,effectiveBuy:1}}},p.date));
 assert.equal(nstToday(new Date('2024-08-14T18:15:00Z')),'2024-08-15');
});
test('proxy validates dates, never forwards arbitrary URLs, and applies success cache headers',async()=>{
 let forwarded;
 const response=await handleForexRequest(new Request('http://localhost/api/forex?date=2024-08-15'),async(url,options)=>{forwarded={url,options};return Response.json(raw('2024-08-15'));});
 assert.equal(response.status,200);assert.equal((await response.json()).rates.JPY.effectiveBuy,8.75);
 assert.equal(response.headers.get('Cache-Control'),'public, s-maxage=86400, stale-while-revalidate=604800');
 assert.equal(forwarded.url,'https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=1&from=2024-08-15&to=2024-08-15');
 for(const query of ['', '?date=2024-02-30','?date=2024-2-3','?date=https://example.com','?date=2099-01-01','?date=2024-08-15&date=2024-08-16']) {
  const r=await handleForexRequest(new Request(`http://localhost/api/forex${query}`),async()=>{throw new Error('must not fetch');});assert.equal(r.status,400);assert.equal(r.headers.get('Cache-Control'),'no-store');
 }
});
test('empty publication is distinct from failure and is not cached for a day',async()=>{
 const request=new Request('http://localhost/api/forex?date=2024-08-17');
 const empty=await handleForexRequest(request,async()=>Response.json({data:{payload:[]}}));assert.equal(empty.status,200);assert.equal(empty.headers.get('Cache-Control'),'no-store');assert.deepEqual((await empty.json()).rates,{});
 for(const fetcher of [async()=>{throw new Error('down');},async()=>new Response('down',{status:503}),async()=>Response.json({unexpected:true})]) {const r=await handleForexRequest(request,fetcher);assert.equal(r.status,502);assert.equal(r.headers.get('Cache-Control'),'no-store');}
});
test('exact cache hit avoids network and API response is saved',async()=>{
 const p={...publication('2024-08-15'),fetchedAt:'2024-08-15T05:00:00Z'};
 const a=setup({entries:[p]});assert.deepEqual(await a.lookup(p.date),{rate:134.2,isFallback:false,source:'cache'});assert.equal(a.calls.length,0);
 const b=setup();assert.equal((await b.lookup(p.date)).source,'api');assert.equal(b.cache.get(p.date).publishedOn,p.date);assert.equal((await b.lookup(p.date)).source,'cache');
});
test('walkback checks each intervening date, stops at five days and reports publication date',async()=>{
 const a=setup({network:async date=>publication(date,date==='2024-11-08'?{USD:rate}:{})});
 assert.deepEqual(await a.lookup('2024-11-09'),{rate:134.2,isFallback:true,fallbackDate:'2024-11-08',source:'api'});
 assert.deepEqual(a.calls,['2024-11-09','2024-11-08']);assert.equal(a.cache.has('2024-11-09'),false);
 const b=setup({network:async date=>publication(date,date==='2026-11-08'?{USD:rate}:{})});assert.equal((await b.lookup('2026-11-13')).fallbackDate,'2026-11-08');assert.equal(b.calls.length,6);
 const c=setup({network:async date=>publication(date,{})});await assert.rejects(()=>c.lookup('2026-11-13'),/five days/);assert.equal(c.calls.length,6);
});
test('offline cache walkback, benchmark provenance, and uncovered-date failure',async()=>{
 const a=setup({online:false,entries:[{...publication('2024-11-08'),fetchedAt:'2024-11-08T05:00:00Z'}]});assert.equal((await a.lookup('2024-11-09')).source,'cache');assert.equal(a.calls.length,0);
 const b=setup({online:false});assert.deepEqual(await b.lookup('2024-08-15'),{rate:133.36,isFallback:true,source:'bundled',benchmarkPeriod:'mid-July 2024'});
 assert.equal((await b.lookup('2023-08-15','JPY')).rate,.945);assert.equal(b.cache.size,0);
 await assert.rejects(()=>b.lookup('2026-11-13'),/No saved or published/);await assert.rejects(()=>b.lookup('2024-08-15','AUD'),/No saved or published/);
 await assert.rejects(()=>b.lookup('2024-02-30'),RangeError);await assert.rejects(()=>b.lookup('2099-01-01'),RangeError);await assert.rejects(()=>b.lookup('2024-08-15','invalid'),RangeError);
});
test('an upstream outage reuses stale current-day cache and does not imply a holiday',async()=>{
 const a=setup({entries:[{...publication('2026-11-13'),fetchedAt:'2026-11-13T00:00:00Z'}],network:async()=>{throw new Error('down');}});
 const result=await a.lookup('2026-11-13');assert.equal(result.source,'cache');assert.equal(result.isFallback,false);assert.equal(a.calls.length,1);
 const b=setup({network:async()=>{throw new Error('down');}});assert.equal((await b.lookup('2024-08-15')).source,'bundled');assert.equal(b.calls.length,1);
});
test('storage denial does not discard a usable API quote and concurrent lookups share fetch',async()=>{
 const a=setup({network:async date=>{await new Promise(resolve=>setTimeout(resolve,5));return publication(date);}});a.deps.readCache=async()=>{throw new Error('denied');};a.deps.writeCache=async()=>{throw new Error('quota');};
 const [x,y]=await Promise.all([a.lookup('2024-08-15'),a.lookup('2024-08-15')]);assert.equal(x.source,'api');assert.equal(y.rate,134.2);assert.equal(a.calls.length,1);
 const b=setup({network:async date=>publication(date,{JPY:{buy:87.5,sell:87.9,unit:10,effectiveBuy:8.75}})});await assert.rejects(()=>b.lookup('2024-08-15','USD'),/no USD quote/);
});
test('statutory calculations separate net realized rate, FX, TDS and fees',()=>{
 const input={foreignAmount:2500,nrbBuyingRate:134.2,actualCreditedNPR:319475,intermediaryFeeNPR:750};const p=calculate(input);
 assert.equal(p.statutoryGrossNPR,335500);assert.equal(p.expectedTds5PctNPR,16775);assert.equal(p.bankRealizedRate,127.79);assert.equal(p.fxVarianceNPR,1500);assert.equal(p.hasTdsDiscrepancy,false);
 assert.equal(calculate({...input,tdsWithheldNPR:16000}).hasTdsDiscrepancy,true);assert.equal(calculate({...input,tdsWithheldNPR:16775}).hasTdsDiscrepancy,false);
 assert.equal(calculate({foreignAmount:100,nrbBuyingRate:1.15,actualCreditedNPR:109}).expectedTds5PctNPR,6);
 assert.equal(calculate({foreignAmount:1200,nrbBuyingRate:148.5,actualCreditedNPR:168190,intermediaryFeeNPR:500}).fxVarianceNPR,-600);
 for(const change of [{foreignAmount:0},{nrbBuyingRate:NaN},{actualCreditedNPR:-1},{intermediaryFeeNPR:Infinity},{tdsWithheldNPR:-1}])assert.throws(()=>calculate({...input,...change}),RangeError);
});
