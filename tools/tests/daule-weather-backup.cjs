// Exercise the five-hour policy with real frontend requests and a controlled clock.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {handler}=require('../gis/serve.cjs');
const now=Date.parse('2026-10-05T04:30:00Z'),hour=3600000;
let scenario,requests=[];
const reset=()=>scenario={ages:{precipitation_hour:3,temperature:5,wind_speed:5+1/hour,wind_direction:2,river_level:8},modelAge:0};
reset();
const reading=(value,age)=>({value,at:new Date(now-age*hour).toISOString()});
const server=http.createServer(async(req,res)=>{
  if(!req.url.startsWith('/api/environment/'))return handler(req,res);
  res.setHeader('Content-Type','application/json');requests.push(req.url);
  const s=structuredClone(scenario),stamp=new Date(now).toISOString();
  if(req.url.includes('/station')){
    if(s.stationError)return res.writeHead(503).end('{}');
    const values={precipitation_hour:1.9,temperature:24.9,wind_speed:.69,wind_direction:98,river_level:4.13},measurements={};
    for(const [key,age] of Object.entries(s.ages))measurements[key]=reading(values[key],age);
    if(s.badDate)measurements.temperature.at='invalid';
    if(s.delayStation)await new Promise(r=>setTimeout(r,s.delayStation));
    return res.end(JSON.stringify({code:'HM002',measurements,fetched_at:stamp,stale:false}));
  }
  if(req.url.includes('/weather')){
    if(s.modelError)return res.writeHead(503).end('{}');
    const latitude=new URL(req.url,'http://fixture').searchParams.get('latitude'),daule=latitude==='-1.861';
    const values={temperature_2m:daule?25.9:40,precipitation:0,wind_speed_10m:7.4,wind_direction_10m:225,wind_gusts_10m:15.8};
    if(s.missingModel)values.temperature_2m=null;
    return res.end(JSON.stringify({values,valid_at:s.badModelDate?'invalid':new Date(now-s.modelAge*hour).toISOString(),interval_seconds:900,fetched_at:stamp,stale:!!s.staleModel}));
  }
  const day=new URL(req.url,'http://fixture').searchParams.get('day');
  return res.end(JSON.stringify({day,days:{[day]:[{kind:'bajamar',time:'05:46',height_m:1.04,at:day+'T05:46:00-05:00'},{kind:'pleamar',time:'10:44',height_m:3.94,at:day+'T10:44:00-05:00'}]},fetched_at:stamp,stale:false}));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const config of [{name:'desktop',viewport:{width:1440,height:1050},colorScheme:'light'},
      {name:'mobile',viewport:{width:320,height:850},colorScheme:'dark',isMobile:true,hasTouch:true,prefix:'/bcbd-wiki'}]){
      reset();requests=[];const context=await browser.newContext(config),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
      await page.clock.install({time:new Date(now)});await page.clock.pauseAt(new Date(now));
      await page.goto(base+(config.prefix||'')+'/herramientas/mapa-daule/');
      const card=key=>page.locator(`#env-station-values [data-variable="${key}"]`);
      const source=async(key,expected)=>assert.equal(await card(key).getAttribute('data-source'),expected,key+' source');
      const refresh=async()=>{await page.locator('#env-refresh').click();await page.waitForFunction(()=>!document.querySelector('#env-refresh').disabled);};
      await page.waitForFunction(()=>document.querySelector('#env-backup-status').textContent.includes('Respaldo activo'));
      await source('temperature','hm002');assert.match(await card('temperature').innerText(),/Dentro del límite de 5 h/);
      await source('wind_speed','open-meteo');assert.match(await card('wind_speed').locator('strong').innerText(),/7[,.]4 km\/h/);
      await source('precipitation_hour','hm002');await source('wind_direction','hm002');await source('river_level','hm002');
      assert.match(await card('river_level').innerText(),/no proporciona respaldo/);
      assert.match(await page.locator('#env-station-status').innerText(),/HM002.*Última consulta/);
      assert.match(await page.locator('#env-backup-status').innerText(),/Open-Meteo.*Respaldo por variable.*5 h/);
      // A minute passes without a new station request. Crossing 5 h activates temperature backup.
      await page.clock.runFor(60000);await source('temperature','open-meteo');
      assert.match(await card('temperature').innerText(),/Última medición HM002: 24[,.]9/);
      scenario.ages.precipitation_hour=8;scenario.ages.wind_direction=8;await refresh();
      await source('precipitation_hour','open-meteo');assert.equal(await card('precipitation_hour').locator('strong').innerText(),'0 mm');
      assert.match(await card('precipitation_hour').innerText(),/Acumulada en 15 min; no es la acumulación horaria/);
      await source('wind_direction','open-meteo');assert.match(await card('wind_direction').locator('strong').innerText(),/225°.*SO/);
      // Choosing a different model-explorer sector must never move the station backup away from Daule.
      await page.locator('.env-model summary').click();await page.locator('#env-point option').filter({hasText:'La Aurora'}).waitFor({state:'attached'});
      await page.locator('#env-point').selectOption({label:'La Aurora'});await page.waitForFunction(()=>document.querySelector('#env-weather-values').textContent.includes('40 °C'));
      await refresh();assert.match(await card('temperature').locator('strong').innerText(),/25[,.]9/);
      assert(requests.some(url=>url.includes('latitude=-1.861&longitude=-79.977')));
      const shotDir=process.env.BCBD_MAP_TEST_OUTPUT;
      if(shotDir){fs.mkdirSync(shotDir,{recursive:true});await page.locator('.map-environment').screenshot({path:path.join(shotDir,'backup-'+config.name+'.png')});}
      const width=await page.evaluate(()=>[innerWidth,document.documentElement.scrollWidth]);assert(width[1]<=width[0]+1);
      // A valid recent HM002 reading immediately regains priority.
      scenario.ages={precipitation_hour:1,temperature:1,wind_speed:1,wind_direction:1,river_level:1};await refresh();
      for(const key of Object.keys(scenario.ages))await source(key,'hm002');
      assert.match(await page.locator('#env-backup-status').innerText(),/Respaldo inactivo/);
      // Even a failed station query must not activate backup before the measurement exceeds five hours.
      scenario.stationError=true;await refresh();await source('temperature','hm002');scenario.stationError=false;
      scenario.ages.temperature=8;
      for(const mode of ['modelError','staleModel','missingModel','badModelDate']){
        scenario[mode]=true;await refresh();await source('temperature','hm002');assert.match(await card('temperature').innerText(),/Lectura antigua/);scenario[mode]=false;
      }
      for(const age of [6,-1]){scenario.modelAge=age;await refresh();await source('temperature','hm002');}scenario.modelAge=0;
      await refresh();await source('temperature','open-meteo');
      delete scenario.ages.temperature;await refresh();await source('temperature','open-meteo');
      assert.match(await card('temperature').innerText(),/Última medición HM002/,'partial feed retains the known sensor age');
      // Missing or invalid station dates cannot establish the five-hour condition.
      scenario.ages.temperature=8;scenario.badDate=true;await page.reload();
      await page.waitForFunction(()=>document.querySelector('[data-variable="temperature"]')?.textContent.includes('Sin dato'));
      await source('temperature','hm002');assert.equal(await card('temperature').locator('strong').innerText(),'Sin dato');
      scenario.badDate=false;delete scenario.ages.temperature;await refresh();await source('temperature','hm002');
      assert.equal(await card('temperature').locator('strong').innerText(),'Sin dato');
      // A slow old response must not overwrite a newer station response.
      scenario.ages.temperature=8;scenario.delayStation=400;
      await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(50);scenario.delayStation=0;scenario.ages.temperature=1;
      await refresh();await page.waitForTimeout(500);await source('temperature','hm002');
      assert.deepEqual(errors,[]);console.log('PASS',config.name,'strict 5 h, per-variable sources, minute crossing, recovery, failure, model freshness, fixed Daule point, stale-response race, layout');
      await context.close();
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
