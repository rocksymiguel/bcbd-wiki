// Public-hostname browser simulation and optional real HTTPS gateway checks.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http');
const {handler}=require('../gis/serve.cjs');
const publicBase='https://rocksymiguel.github.io/bcbd-wiki/';
(async()=>{
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const local='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
    const page=await context.newPage(),calls=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>calls.push(request.url()));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='rocksymiguel.github.io') {
        const response=await fetch(local+url.pathname+url.search);
        return route.fulfill({status:response.status,body:Buffer.from(await response.arrayBuffer()),headers:{'content-type':response.headers.get('content-type')}});
      }
      if(url.hostname==='bcbd-wiki.tail4eb990.ts.net') {
        if(process.env.BCBD_PUBLIC_API_URL)return route.continue();
        // Verify degraded-source behavior as well as correct public endpoint selection.
        return route.fulfill({status:503,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'https://rocksymiguel.github.io'}});
      }
      return route.abort(); // No external basemap dependency for these assertions.
    });
    await page.goto(publicBase+'herramientas/mapa-daule/');
    await page.locator('#daule-map[data-ready="true"]').waitFor({timeout:30000});
    assert.equal(await page.locator('#map-add').isVisible(),false);
    assert.equal(await page.locator('.map-records').isVisible(),false);
    assert.equal(await page.locator('[data-layer="reports"]').isVisible(),false);
    assert.equal(await page.locator('#map-canton-color').isEnabled(),true);
    await page.locator('#map-canton-color').evaluate(element=>{element.value='#123456';element.dispatchEvent(new Event('input'));});
    assert.match(await page.evaluate(()=>localStorage.getItem('gis-daule-boundary-style-canton')),/#123456/);
    assert(calls.some(url=>url.startsWith('https://bcbd-wiki.tail4eb990.ts.net/api/environment/')));
    if(process.env.BCBD_PUBLIC_API_URL) {
      await page.waitForFunction(()=>document.querySelector('#env-weather-status').textContent.includes('Hora del dato'),{},{timeout:65000});
      assert.equal(await page.locator('#env-weather-values .env-metric').count(),4);
      console.log('PASS real cross-origin browser weather read from the VM HTTPS gateway');
    }
    await page.goto(publicBase+'competencias-preparacion/fire-challenge-sto-dmngo-2026/Estaciones/estacion1/');
    await page.locator('.public-competition-notice').waitFor();
    assert.equal(await page.locator('#participant-register').count(),0);
    await page.goto(publicBase+'competencias-preparacion/ranking/');
    await page.waitForFunction(()=>document.querySelector('#results-panel').textContent.includes('todavía no habilitado'));
    assert(!calls.some(url=>/\/api\/(gis|competitions)\//.test(url)),'Never request LAN databases in the public browser');
    assert.deepEqual(errors,[]);
    console.log('PASS public GIS controls, unavailable-source handling, hidden uploads, no participant/time registration, no LAN database requests');
    await context.close();
    if(process.env.BCBD_PUBLIC_API_URL) {
      const base=process.env.BCBD_PUBLIC_API_URL.replace(/\/$/,'');
      const health=await fetch(base+'/api/environment/health',{headers:{Origin:'https://rocksymiguel.github.io'},signal:AbortSignal.timeout(15000)});
      assert.equal(health.status,200);assert.equal(health.headers.get('access-control-allow-origin'),'https://rocksymiguel.github.io');
      assert.equal(health.headers.get('access-control-allow-credentials'),null);
      for(const url of ['/','/api/gis/reports','/api/gis/session','/api/competitions/participants','/api/competitions/results','/tools/gis/api/app.py','/.git/config','/api/environment/unknown']) {
        const response=await fetch(base+url,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,404,url);
      }
      for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) {
        const response=await fetch(base+'/api/environment/health',{method,signal:AbortSignal.timeout(15000)});assert.equal(response.status,405,method);
      }
      console.log('PASS real HTTPS gateway/CORS, private-path denials and write denials');
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
