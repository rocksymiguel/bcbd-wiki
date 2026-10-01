// Headless browser integration tests. Requires Playwright (NODE_PATH can locate it).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const screenshots = process.env.HOSE_TEST_OUTPUT;
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.glb':'model/gltf-binary','.png':'image/png'};
const server = http.createServer((req,res) => {
  let requested = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/bcbd-wiki(?=\/)/,'');
  if (requested.endsWith('/')) requested += 'index.html';
  const file = path.resolve(root,'.'+requested);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403).end(); return;}
  try {res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(fs.readFileSync(file));}
  catch {res.writeHead(404).end();}
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = process.env.HOSE_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  try {
    for (const config of [
      {name:'desktop-dark',viewport:{width:1920,height:1080},colorScheme:'dark'},
      {name:'mobile-light',viewport:{width:390,height:844},colorScheme:'light',isMobile:true,hasTouch:true},
      {name:'subpath',viewport:{width:1366,height:768},colorScheme:'light',subpath:true}
    ]) {
      if (process.env.HOSE_TEST_URL && config.subpath) continue;
      const context = await browser.newContext(config);
      const page = await context.newPage();
      const errors=[],requests=[];
      page.on('pageerror',error => errors.push(error.message));
      page.on('request',request => requests.push(request.url()));
      page.on('response',response => {if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
      await page.goto(config.subpath ? url+'bcbd-wiki/' : url);
      assert(!requests.some(item => item.includes('vendor/three') || item.includes('.glb')),'3D must remain lazy');
      await page.locator('#hose-open').click();
      await page.locator('#hose-viewport[data-ready="true"]').waitFor({timeout:30000});
      await page.waitForTimeout(800);
      assert.equal(await page.locator('#hose-viewport canvas').count(),1);
      assert.equal(await page.locator('#hose-viewport').getAttribute('data-view'),'coupled');
      assert.equal(await page.locator('#hose-viewport').getAttribute('data-running'),'true');
      assert.equal(await page.evaluate(() => document.body.style.overflow),'hidden');
      const layout = await page.evaluate(() => {
        const dialog=document.querySelector('#hose-dialog'),host=document.querySelector('#hose-viewport');
        return {dialogWidth:dialog.getBoundingClientRect().width,viewportWidth:host.clientWidth,overflow:dialog.scrollWidth>dialog.clientWidth+1};
      });
      assert(layout.viewportWidth>250 && !layout.overflow,JSON.stringify(layout));
      await page.locator('[data-hose-view="separated"]').click();
      assert.equal(await page.locator('#hose-viewport').getAttribute('data-view'),'separated');
      const separatedPixels = await page.locator('#hose-viewport canvas').screenshot();
      await page.locator('[data-hose-part="male"]').click();
      assert.match(await page.locator('#hose-explanation').innerText(),/Macho resaltado/);
      await page.locator('[data-hose-part="female"]').click();
      assert.match(await page.locator('#hose-explanation').innerText(),/Hembra resaltada/);
      await page.locator('#hose-rotate').click();
      assert.equal(await page.locator('#hose-rotate').getAttribute('aria-pressed'),'true');
      await page.locator('#hose-reset').click();
      await page.waitForTimeout(200);
      const coupledPixels = await page.locator('#hose-viewport canvas').screenshot();
      assert.notDeepEqual(coupledPixels,separatedPixels,'Separated mode must visibly change the render');
      assert.equal(await page.locator('#hose-rotate').getAttribute('aria-pressed'),'false');
      assert.equal(await page.locator('#hose-viewport').getAttribute('data-view'),'coupled');
      await page.locator('#hose-viewport canvas').focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('+');
      await page.locator('#hose-reset').click();
      await page.locator('#hose-dialog').evaluate(el => {el.scrollTop=0;});
      await page.locator('#hose-dialog').evaluate(el => {el.scrollTop=el.scrollHeight;});
      const closePosition = await page.locator('#hose-close').boundingBox();
      assert(closePosition.y>=0 && closePosition.y+closePosition.height<config.viewport.height,'Close button must remain visible while scrolling');
      await page.locator('#hose-dialog').evaluate(el => {el.scrollTop=0;});
      if(screenshots) {
        fs.mkdirSync(screenshots,{recursive:true});
        await page.screenshot({path:path.join(screenshots,config.name+'.png')});
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#hose-viewport').dataset.running === 'false');
      assert.equal(await page.locator('#hose-dialog').evaluate(el=>el.open),false);
      assert.equal(await page.locator('#hose-viewport').getAttribute('data-running'),'false');
      assert.equal(await page.evaluate(() => document.body.style.overflow),'');
      assert.equal(await page.evaluate(() => document.activeElement.id),'hose-open');
      await page.locator('#hose-open').click();
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#hose-viewport canvas').count(),1);
      assert.equal(await page.locator('#hose-viewport').getAttribute('data-running'),'true');
      await page.locator('#hose-close').click();
      assert.deepEqual(errors,[]);
      console.log('PASS',config.name,layout,'no console/network errors');
      await context.close();
    }
    if (!process.env.HOSE_TEST_URL) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let fail=true;
      await page.route('**/linea-acoplada.glb*',route => fail ? route.abort() : route.continue());
      await page.goto(url);
      await page.locator('#hose-open').click();
      await page.getByRole('status').filter({hasText:'No se pudo abrir'}).waitFor();
      assert.equal(await page.locator('#hose-viewport canvas').count(),0);
      await page.locator('#hose-close').click();
      fail=false;
      await page.locator('#hose-open').click();
      await page.locator('#hose-viewport[data-ready="true"]').waitFor();
      assert.equal(await page.locator('#hose-viewport canvas').count(),1);
      console.log('PASS failed model request, clean retry');
      await context.close();
      const slowContext = await browser.newContext();
      const slowPage = await slowContext.newPage();
      await slowPage.route('**/linea-acoplada.glb*',async route => {await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
      await slowPage.goto(url);
      await slowPage.locator('#hose-open').click();
      await slowPage.locator('#hose-close').click();
      await slowPage.waitForFunction(() => document.querySelector('#hose-viewport').dataset.ready === 'true');
      assert.equal(await slowPage.locator('#hose-dialog').evaluate(el=>el.open),false);
      assert.notEqual(await slowPage.locator('#hose-viewport').getAttribute('data-running'),'true');
      await slowPage.locator('#hose-open').click();
      assert.equal(await slowPage.locator('#hose-viewport').getAttribute('data-running'),'true');
      console.log('PASS close during loading, reopen without duplicate viewer');
      await slowContext.close();
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
