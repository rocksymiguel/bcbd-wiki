// Real cartography + browser integration. Never downloads public OSM map tiles.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {handler,root}=require('../gis/serve.cjs');
const dataDir=path.join(root,'assets/gis/daule');
const read=name => JSON.parse(fs.readFileSync(path.join(dataDir,name),'utf8'));
const manifest=read('manifest.json');
assert.equal(manifest.canton_code,'0906');
for(const s of manifest.sources) {
  const geo=read(s.id+'.geojson');
  assert.equal(geo.type,'FeatureCollection');assert.equal(geo.features.length,s.features);
  const sourceFile=path.join(dataDir,'sources',s.id==='canton'||s.id==='parishes'||s.id==='susceptibility'?s.id+'.geojson':'openstreetmap.json');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),s.sha256,'source checksum '+s.id);
}
assert.equal(read('canton.geojson').features.length,1);
assert.equal(read('parishes.geojson').features.length,5);
for(const name of ['daule','banife','pula']) assert(read('waterways.geojson').features.some(f =>
  (f.properties.name || '').toLowerCase().includes(name)),'missing river '+name);
assert(read('places.geojson').features.some(f => (f.properties.name || '').toLowerCase()==='la aurora'),'La Aurora location');

const server=http.createServer(handler);
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const output=process.env.BCBD_MAP_TEST_OUTPUT;
  try {
    for(const config of [
      {name:'desktop-light',viewport:{width:1440,height:1000},colorScheme:'light'},
      {name:'desktop-dark',viewport:{width:1440,height:1000},colorScheme:'dark'},
      {name:'mobile',viewport:{width:390,height:844},colorScheme:'light',isMobile:true,hasTouch:true},
      {name:'narrow',viewport:{width:320,height:760},colorScheme:'dark',isMobile:true,hasTouch:true},
      {name:'subpath',viewport:{width:1366,height:900},colorScheme:'light',prefix:'/bcbd-wiki'}
    ]) {
      const context=await browser.newContext(config);
      const page=await context.newPage(),errors=[],external=[];
      page.on('pageerror',error => errors.push(error.message));
      page.on('request',request => {if(!request.url().startsWith(base))external.push(request.url());});
      await page.route('https://tile.openstreetmap.org/**',route => route.abort());
      await page.goto(base+(config.prefix||'')+'/herramientas/mapa-daule/');
      await page.locator('#daule-map[data-ready="true"]').waitFor({timeout:30000});
      assert.deepEqual(external,[],'local cartography must work without external requests');
      assert.match(await page.locator('#map-source-date').textContent(),/Ecuador/);
      assert.equal(await page.locator('#map-source-list li').count(),7);
      const layout=await page.evaluate(() => ({width:innerWidth,doc:document.documentElement.scrollWidth,
        map:document.querySelector('#daule-map').clientWidth,canvas:document.querySelectorAll('#daule-map canvas').length}));
      assert(layout.doc<=layout.width+1,JSON.stringify(layout));assert(layout.map>270 && layout.canvas>0);
      await page.locator('#map-search').fill('Banife');await page.locator('#map-search-form').evaluate(f => f.requestSubmit());
      assert(await page.locator('.map-result').count()>0);await page.locator('.map-result').first().click();
      assert.match(await page.locator('#map-detail').innerText(),/Banife/);
      await page.locator('#map-sector').selectOption({label:'La Aurora'});
      assert.match(await page.locator('#map-detail').innerText(),/La Aurora/);
      await page.locator('[data-layer="susceptibility"]').check();
      assert(await page.locator('#map-hazard-legend').isVisible());
      await page.locator('[data-layer="susceptibility"]').uncheck();
      assert(!(await page.locator('#map-hazard-legend').isVisible()));
      await page.locator('[data-layer="roads"]').uncheck();await page.locator('[data-layer="roads"]').check();
      await page.locator('#map-fit').click();
      await page.locator('#map-add').click();
      await page.locator('#daule-map').click({position:{x:90,y:90}});
      assert(await page.locator('#map-report-dialog').evaluate(d => d.open));
      await page.locator('#map-report-name').fill('Prueba de campo <img src=x onerror=alert(1)>');
      await page.locator('#map-report-type').selectOption('closure');
      await page.locator('#map-report-time').fill('2026-10-02T14:30');
      await page.locator('#map-report-note').fill('Observación de prueba para validar almacenamiento local.');
      await page.locator('#map-report-form button[type="submit"]').click();
      assert(!(await page.locator('#map-report-dialog').evaluate(d => d.open)));
      assert.equal(await page.locator('#map-report-list img').count(),0,'user text must remain plain text');
      await page.reload();await page.locator('#daule-map[data-ready="true"]').waitFor();
      assert.match(await page.locator('#map-report-list').innerText(),/Prueba de campo/);
      const stored=await page.evaluate(() => JSON.parse(localStorage.getItem('bcbd-daule-observations-v1')));
      assert.equal(stored.data.features[0].properties.observed_at,'2026-10-02T19:30:00.000Z');
      const downloadWait=page.waitForEvent('download');await page.locator('#map-export').click();
      const download=await downloadWait;
      const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
      assert.equal(exported.features.length,1);
      await page.locator('#map-import').setInputFiles({name:'observaciones.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(exported))});
      await page.waitForFunction(() => document.querySelector('#map-storage-status').textContent.includes('0 observaciones incorporadas'));
      assert.equal(await page.locator('#map-report-list li').count(),1,'duplicate import must not duplicate reports');
      await page.locator('#map-import').setInputFiles({name:'invalid.geojson',mimeType:'application/json',buffer:Buffer.from('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[200,0]},"properties":{}}]}')});
      await page.waitForFunction(() => document.querySelector('#map-storage-status').textContent.includes('No se importó'));
      assert.equal(await page.locator('#map-report-list li').count(),1);
      if(output) {fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,config.name+'.png'),fullPage:true});}
      await page.getByRole('button',{name:'Eliminar observación',exact:false}).click();
      assert.match(await page.locator('#map-report-list').innerText(),/No hay observaciones/);
      assert.deepEqual(errors,[]);
      console.log('PASS',config.name,JSON.stringify(layout),'search, layers, reports, persistence, import/export');
      await context.close();
    }
    const context=await browser.newContext(), page=await context.newPage();
    let fail=true;
    await page.route('**/waterways.geojson',route => fail?route.abort():route.continue());
    await page.goto(base+'/herramientas/mapa-daule/');
    await page.locator('#map-retry').waitFor();
    assert(!(await page.locator('#map-add').isEnabled()));
    fail=false;await page.locator('#map-retry').click();await page.locator('#daule-map[data-ready="true"]').waitFor();
    await page.route('https://tile.openstreetmap.org/**',route => route.abort());
    await page.locator('#map-basemap').check();
    await page.locator('#map-tile-status').waitFor();
    assert(await page.locator('#map-add').isEnabled(),'tile failure cannot disable local layers');
    await page.locator('#map-basemap').uncheck();
    assert(!(await page.locator('#map-tile-status').isVisible()));
    console.log('PASS missing source retry + unavailable external tiles');
    await context.close();
  } finally {await browser.close();server.close();}
})().catch(error => {console.error(error);server.close();process.exitCode=1;});
