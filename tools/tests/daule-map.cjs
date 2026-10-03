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
assert(read('riverbanks.geojson').features.some(f=>f.properties.name==='Río Daule' && f.geometry.type==='MultiPolygon'),'Daule geographic water footprint');
assert(read('street-style.json').layers.every(l=>l['source-layer']!=='poi'&&!/bus|transit/i.test(l.id)),'street style excludes bus/transit POIs');

// A deterministic HTTP fixture exercises the shared frontend; the real Python
// service has independent image/video, security and persistence integration tests.
let records=[],sessionNumber=0;
const server=http.createServer(async (req,res) => {
  if(req.url.startsWith('/api/environment/')) {
    res.setHeader('Content-Type','application/json');
    const now=new Date().toISOString(), old=new Date(Date.now()-8*3600000).toISOString();
    if(req.url.includes('/station'))return res.end(JSON.stringify({code:'HM002',measurements:{precipitation_hour:{value:1.9,at:now},temperature:{value:24.9,at:old},river_level:{value:4.13,at:old}},fetched_at:now,stale:false}));
    if(req.url.includes('/weather'))return res.end(JSON.stringify({values:{temperature_2m:25,precipitation:0,wind_speed_10m:3,wind_direction_10m:101,wind_gusts_10m:12},valid_at:now,interval_seconds:900,fetched_at:now,stale:false}));
    const day=new URL(req.url,'http://fixture').searchParams.get('day');
    return res.end(JSON.stringify({day,days:{[day]:[{kind:'bajamar',time:'05:46',height_m:1.04,at:day+'T05:46:00-05:00'},{kind:'pleamar',time:'10:44',height_m:3.94,at:day+'T10:44:00-05:00'}]},fetched_at:now,stale:false}));
  }
  if(!req.url.startsWith('/api/gis/'))return handler(req,res);
  const cookie=/bcbd_gis_session=([^;]+)/.exec(req.headers.cookie||'')?.[1]||'';
  const reply=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.url==='/api/gis/session'){const token=cookie||String(++sessionNumber);res.setHeader('Set-Cookie','bcbd_gis_session='+token+'; Path=/api/gis; HttpOnly; SameSite=Strict');return reply({csrf:token});}
  if(req.method==='GET' && req.url==='/api/gis/reports')return reply({type:'FeatureCollection',updated_at:new Date().toISOString(),features:records.map(f=>({...f,properties:{...f.properties,can_delete:f.owner===cookie}}))});
  let body='';for await(const chunk of req)body+=chunk;
  if(req.method==='POST' && req.url==='/api/gis/reports'){
    const boundary=req.headers['content-type'].split('boundary=')[1];
    const report=body.split('--'+boundary).find(part=>part.includes('name="report"'));
    const f=JSON.parse(report.split('\r\n\r\n')[1].trim());f.owner=cookie;
    f.properties.client_id=f.properties.id;f.properties.attachments=[];records.push(f);return reply({created:true,id:f.properties.id});
  }
  if(req.method==='POST' && req.url==='/api/gis/import'){
    const data=JSON.parse(body);let created=0;
    data.features.forEach(f=>{if(records.some(old=>old.owner===cookie && old.properties.client_id===f.properties.id))return;
      f.owner=cookie;f.properties.client_id=f.properties.id;f.properties.attachments=[];records.push(f);created++;});return reply({created});
  }
  if(req.method==='DELETE'){records=records.filter(f=>f.properties.id!==req.url.split('/').pop());return reply({deleted:true});}
  res.writeHead(404).end();
});
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
      await page.route('https://tiles.openfreemap.org/**',route => route.abort());
      await page.goto(base+(config.prefix||'')+'/herramientas/mapa-daule/');
      await page.locator('#daule-map[data-ready="true"]').waitFor({timeout:30000});
      await page.waitForFunction(()=>document.querySelector('#env-tides').textContent.includes('Pleamar'));
      assert(external.every(url=>url.startsWith('https://tiles.openfreemap.org/')),'only vector street provider may be requested externally by default');
      assert.match(await page.locator('#map-source-date').textContent(),/Ecuador/);
      assert.equal(await page.locator('#map-source-list li').count(),8);
      assert.equal(await page.locator('.map-eyebrow').count(),0,'no institutional ownership line above GIS title');
      assert.match(await page.locator('#env-station-values').innerText(),/1,9|1\.9/);
      assert.match(await page.locator('#env-station-values .env-old').first().innerText(),/Lectura antigua/);
      assert.match(await page.locator('#env-moon').innerText(),/iluminada/);
      await page.locator('#env-day').fill('2026-10-03');await page.locator('#env-day').dispatchEvent('change');
      await page.waitForFunction(()=>document.querySelector('#env-tide-status').textContent.includes('2026-10-03'));
      assert.match(await page.locator('#env-tides').innerText(),/MLWS/);
      const layout=await page.evaluate(() => ({width:innerWidth,doc:document.documentElement.scrollWidth,
        map:document.querySelector('#daule-map').clientWidth,canvas:document.querySelectorAll('#daule-map canvas').length}));
      assert(layout.doc<=layout.width+1,JSON.stringify(layout));assert(layout.map>270 && layout.canvas>0);
      await page.locator('#map-search').fill('Banife');await page.locator('#map-search-form').evaluate(f => f.requestSubmit());
      assert(await page.locator('.map-result').count()>0);await page.locator('.map-result').first().click();
      assert.match(await page.locator('#map-detail').innerText(),/Banife/);
      await page.locator('#map-sector').selectOption({label:'La Aurora'});
      assert.match(await page.locator('#map-detail').innerText(),/La Aurora/);
      await page.locator('#map-sector').selectOption({label:'Guarumal'});
      assert.match(await page.locator('#map-detail').innerText(),/No delimita/);
      await page.locator('#map-sector').selectOption({label:'Palo Alto'});
      assert.match(await page.locator('#map-detail').innerText(),/Palo Alto/);
      await page.locator('[data-layer="susceptibility"]').check();
      assert(await page.locator('#map-hazard-legend').isVisible());
      await page.locator('[data-layer="susceptibility"]').uncheck();
      assert(!(await page.locator('#map-hazard-legend').isVisible()));
      await page.locator('[data-layer="roads"]').uncheck();await page.locator('[data-layer="roads"]').check();
      assert(await page.locator('[data-basemap="streets"]').isChecked());
      await page.locator('[data-basemap="streets"]').uncheck();assert(await page.locator('[data-basemap="none"]').isChecked());
      await page.route('https://services.arcgisonline.com/**',route=>route.abort());
      await page.locator('[data-basemap="satellite"]').check();assert(!(await page.locator('[data-basemap="none"]').isChecked()));
      await page.locator('[data-basemap="relief"]').check();assert(!(await page.locator('[data-basemap="satellite"]').isChecked()));
      await page.locator('[data-basemap="relief"]').uncheck();assert(await page.locator('[data-basemap="none"]').isChecked());
      if(!config.isMobile){
        await page.locator('#daule-map').scrollIntoViewIfNeeded();
        const scale=await page.locator('.leaflet-control-scale-line').first().innerText(),before=await page.evaluate(()=>scrollY);
        await page.locator('#daule-map').hover();await page.mouse.wheel(0,-600);
        await page.waitForFunction(old=>document.querySelector('.leaflet-control-scale-line').textContent!==old,scale);
        assert.equal(await page.evaluate(()=>scrollY),before,'wheel over map must not scroll the page');
        await page.mouse.move(10,200);await page.mouse.wheel(0,600);await page.waitForFunction(y=>scrollY>y,before);
      }
      await page.locator('#map-fit').click();
      await page.locator('#map-add').click();
      await page.locator('#daule-map').click({position:{x:90,y:90}});
      assert(await page.locator('#map-report-dialog').evaluate(d => d.open));
      await page.locator('#map-report-name').fill('Prueba de campo <img src=x onerror=alert(1)>');
      await page.locator('#map-report-type').selectOption('closure');
      await page.locator('#map-report-time').fill('2026-10-02T14:30');
      await page.locator('#map-report-note').fill('Observación de prueba para validar almacenamiento local.');
      await page.locator('#map-report-form button[type="submit"]').click();
      await page.waitForFunction(()=>!document.querySelector('#map-report-dialog').open);
      assert.equal(await page.locator('#map-report-list img').count(),0,'user text must remain plain text');
      await page.reload();await page.locator('#daule-map[data-ready="true"]').waitFor();
      await page.waitForFunction(()=>document.querySelector('#map-report-list').textContent.includes('Prueba de campo'));
      await page.waitForFunction(()=>document.querySelector('#map-report-list').textContent.includes('Prueba de campo'));
      assert.equal(records[0].properties.observed_at,'2026-10-02T19:30:00.000Z');
      const guest=await browser.newContext(config),guestPage=await guest.newPage();
      await guestPage.route('https://tiles.openfreemap.org/**',r=>r.abort());
      await guestPage.goto(base+(config.prefix||'')+'/herramientas/mapa-daule/');
      await guestPage.waitForFunction(()=>document.querySelector('#map-report-list').textContent.includes('Prueba de campo'));
      assert.equal(await guestPage.getByRole('button',{name:'Eliminar observación',exact:false}).count(),0);await guest.close();
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
      await page.waitForFunction(()=>document.querySelector('#map-report-list').textContent.includes('No hay observaciones'));
      assert.deepEqual(errors,[]);
      await page.goto(base+(config.prefix||'')+'/');
      await page.locator('.home-gis img').waitFor();
      assert.deepEqual(await page.locator('#cards h3').allTextContents(),['GIS Daule','Institución','Áreas operativas']);
      await page.waitForFunction(()=>document.querySelector('.home-gis img').naturalWidth>0);
      console.log('PASS',config.name,JSON.stringify(layout),'home, backgrounds, wheel, shared reports, safe text, import/export');
      await context.close();
    }
    const context=await browser.newContext(), page=await context.newPage();
    let fail=true;
    await page.route('**/waterways.geojson',route => fail?route.abort():route.continue());
    await page.goto(base+'/herramientas/mapa-daule/');
    await page.locator('#map-retry').waitFor();
    assert(!(await page.locator('#map-add').isEnabled()));
    await page.route('https://tiles.openfreemap.org/**',route => route.abort());
    fail=false;await page.locator('#map-retry').click();await page.locator('#daule-map[data-ready="true"]').waitFor();
    await page.route('https://tiles.openfreemap.org/**',route => route.abort());
    await page.waitForFunction(()=>!document.querySelector('#map-add').disabled);
    await page.locator('#map-tile-status').waitFor();
    assert(await page.locator('#map-add').isEnabled(),'tile failure cannot disable local layers');
    await page.locator('#map-basemap').uncheck();
    assert(!(await page.locator('#map-tile-status').isVisible()));
    console.log('PASS missing source retry + unavailable external tiles');
    await context.close();
  } finally {await browser.close();server.close();}
})().catch(error => {console.error(error);server.close();process.exitCode=1;});
