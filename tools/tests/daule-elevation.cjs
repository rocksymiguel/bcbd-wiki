// Validate numeric source integrity, geographic sampling and browser rendering.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const http=require('node:http'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {handler,root}=require('../gis/serve.cjs');
const dir=path.join(root,'assets/gis/daule/elevation');
const meta=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8'));
const compressed=fs.readFileSync(path.join(dir,meta.file)),raw=zlib.gunzipSync(compressed);
assert.equal(crypto.createHash('sha256').update(compressed).digest('hex'),meta.sha256);
assert.equal(raw.length,meta.width*meta.height*4);
const at=(lat,lon)=>{
  const col=Math.floor((lon-meta.west)/meta.step_lon),row=Math.floor((meta.north-lat)/meta.step_lat);
  return row<0||col<0||row>=meta.height||col>=meta.width?null:raw.readFloatLE((row*meta.width+col)*4);
};
for(const point of meta.validation_samples)assert.equal(at(point.lat,point.lon),point.height_m,'original pixel sample across tile seams');
for(const point of JSON.parse(fs.readFileSync(path.join(dir,'../canton.geojson'),'utf8')).features[0].geometry.coordinates[0])assert(Number.isFinite(at(point[1],point[0])),'complete canton coverage');
let min=Infinity,max=-Infinity;
for(let i=0;i<raw.length;i+=4){const v=raw.readFloatLE(i);assert(Number.isFinite(v));min=Math.min(min,v);max=Math.max(max,v);}
assert.equal(min,meta.minimum_m);assert.equal(max,meta.maximum_m);
const server=http.createServer(handler);
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=process.env.BCBD_ELEVATION_VM_URL||`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const config of [{name:'desktop',viewport:{width:1440,height:1050},colorScheme:'light'},
      {name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'},
      {name:'subpath',viewport:{width:1366,height:900},prefix:'/bcbd-wiki',colorScheme:'dark'}]){
      if(process.env.BCBD_ELEVATION_VM_URL&&config.prefix)continue;
      const context=await browser.newContext(config),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://**',r=>r.abort());
      await page.route('**/js/daule-map.js',async r=>{
        const response=await r.fetch();await r.fulfill({response,body:'L.Map.addInitHook(function(){window.__terrainTestMap=this;});\n'+await response.text()});
      });
      const url=base+(config.prefix||'')+'/herramientas/mapa-daule/?v=elevation-test';
      await page.goto(url);await page.locator('#daule-map[data-ready="true"]').waitFor();
      assert(await page.locator('[data-basemap="streets"]').isChecked(),'preserve default streets');
      assert(!(await page.locator('#map-elevation-controls').isVisible()));
      let fail=!process.env.BCBD_ELEVATION_VM_URL;
      await page.route('**/heights.f32.gz',r=>fail?r.abort():r.continue());
      await page.locator('[data-basemap="elevation"]').check();
      if(fail){await page.locator('#map-elevation-controls[data-state="error"]').waitFor();assert(await page.locator('#map-elevation-retry').isVisible());fail=false;await page.locator('#map-elevation-retry').click();}
      await page.locator('#map-elevation-controls[data-state="ready"]').waitFor({timeout:30000});
      assert(!(await page.locator('[data-basemap="streets"]').isChecked()));
      assert.equal(await page.locator('.map-elevation-legend').count(),1);
      // Every click samples the same original float32 cell, including seams.
      for(const point of meta.validation_samples){
        await page.evaluate(p=>window.__terrainTestMap.fire('click',{latlng:L.latLng(p.lat,p.lon)}),point);
        assert.match(await page.locator('#map-elevation-readout').innerText(),new RegExp('Altitud aproximada: '+Math.round(point.height_m)+' m'));
      }
      await page.evaluate(()=>window.__terrainTestMap.fire('click',{latlng:L.latLng(-3,-81)}));
      assert.match(await page.locator('#map-elevation-readout').innerText(),/Sin dato/);
      // Verify actual canvas pixels after the map projection, not just legend text.
      const rendered=await page.evaluate(()=>{
        const map=window.__terrainTestMap;let terrain;map.eachLayer(l=>{if(l.options.attribution?.startsWith('Altitud:'))terrain=l;});
        return Object.values(terrain._tiles).flatMap(t=>{
          const data=t.el.getContext('2d').getImageData(0,0,256,256).data,result=[];
          for(let y=16;y<256;y+=32)for(let x=16;x<256;x+=32){
            const i=(y*256+x)*4;if(data[i+3]!==255)continue;
            const p=map.unproject(L.point(t.coords.x*256+x+.5,t.coords.y*256+y+.5),t.coords.z);
            result.push({lat:p.lat,lon:p.lng,rgb:Array.from(data.slice(i,i+3))});
          }return result;
        });
      });
      assert(rendered.length>10,'actual colored terrain pixels at the viewport zoom');
      for(const pixel of rendered){const v=at(pixel.lat,pixel.lon),band=meta.palette.find(b=>b.below===null||v<b.below);
        assert(v!==null);assert.deepEqual(pixel.rgb,band.color.slice(1).match(/../g).map(c=>parseInt(c,16)));}
      const slider=page.locator('#map-elevation-opacity');await slider.focus();await slider.press('Home');for(let i=0;i<3;i++)await slider.press('ArrowRight');
      assert.equal(await slider.inputValue(),'35');assert.equal(await page.locator('#map-elevation-value').innerText(),'35 %');
      assert(await page.evaluate(()=>{let opacity;window.__terrainTestMap.eachLayer(l=>{if(l.options.attribution?.startsWith('Altitud:'))opacity=l.getContainer().style.opacity;});return opacity==='0.35';}));
      await page.locator('#map-fit').click();
      await page.locator('#daule-map').click({position:{x:100,y:100}});
      assert.match(await page.locator('#map-elevation-readout').innerText(),/Altitud aproximada|Sin dato/);
      const layout=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth}));assert(layout.doc<=layout.width+1);
      if(process.env.BCBD_MAP_TEST_OUTPUT){fs.mkdirSync(process.env.BCBD_MAP_TEST_OUTPUT,{recursive:true});
        await page.evaluate(()=>window.__terrainTestMap.fire('click',{latlng:L.latLng(-1.861,-79.977)}));
        // Restore 85% only for the screenshot; leave persistence verification at 35%.
        await slider.evaluate(e=>{e.value='85';e.dispatchEvent(new Event('input'));});
        await page.locator('#daule-map').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.BCBD_MAP_TEST_OUTPUT,'elevation-'+config.name+'.png'),fullPage:true});
        await slider.evaluate(e=>{e.value='35';e.dispatchEvent(new Event('input'));});}
      await page.locator('[data-basemap="elevation"]').uncheck();assert(await page.locator('[data-basemap="none"]').isChecked());
      assert.equal(await page.locator('.map-elevation-legend').count(),0);assert(!(await page.locator('#map-elevation-panel').isVisible()));
      await page.reload();await page.locator('#daule-map[data-ready="true"]').waitFor();
      await page.locator('[data-basemap="elevation"]').check();await page.locator('#map-elevation-controls[data-state="ready"]').waitFor();
      assert.equal(await slider.inputValue(),'35');assert.deepEqual(errors,[]);
      console.log('PASS',config.name,'source samples, canvas projection/colors, no extrapolation, retry, opacity, mobile layout, persistence');
      await context.close();
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
