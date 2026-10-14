const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const {handler}=require('../gis/serve.cjs');
(async()=>{
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=(process.env.STUDY_NAV_TEST_URL||`http://127.0.0.1:${server.address().port}/`).replace(/\/?$/,'/');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const viewport of [{width:1920,height:1080},{width:1366,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base,{waitUntil:'networkidle'});
      await page.locator('.nav-study-star').waitFor();
      const study=page.locator('.site-nav a[href$="material-de-estudio/index.html"]');
      assert.equal(await study.locator('.nav-study-star').textContent(),'★');
      assert.equal(await page.locator('.home-featured > a').count(),3);
      const manual=page.locator('.home-featured > a').first();
      assert.match(await manual.textContent(),/Manual Bomberos I/);
      assert.equal(await manual.getAttribute('href'),'material-de-estudio/bomberos-i/index.html');
      assert(!(await page.locator('.home-featured').textContent()).includes('Fundamentos del fuego'));
      await manual.click();await page.waitForURL('**/material-de-estudio/bomberos-i/index.html');
      await page.locator('.site-header').waitFor();
      assert.equal(await page.locator('#manual-toc').getAttribute('open'),null);
      await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,2200);});
      await page.waitForFunction(()=>document.getElementById('header').classList.contains('site-header-hidden'));
      await page.waitForTimeout(250);
      const hidden=await page.locator('#header').boundingBox();assert(hidden.y+hidden.height<=1);
      await page.evaluate(()=>window.scrollBy(0,-24));
      await page.waitForFunction(()=>!document.getElementById('header').classList.contains('site-header-hidden'));
      await page.waitForTimeout(250);
      const shown=await page.locator('.brand').boundingBox();assert(shown.y>=0&&shown.y+shown.height<viewport.height);
      assert(await page.locator('.site-nav a[href$="index.html"]').first().isVisible());
      await page.evaluate(()=>window.scrollBy(0,90));
      await page.waitForFunction(()=>document.getElementById('header').classList.contains('site-header-hidden'));
      await page.locator('.brand').focus();
      await page.waitForFunction(()=>!document.getElementById('header').classList.contains('site-header-hidden'));
      await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(250);
      assert(!(await page.locator('#header').evaluate(el=>el.classList.contains('site-header-hidden'))));
      assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)));
      assert.deepEqual(errors,[]);
      console.log(`PASS ${viewport.width}px: starred study link, featured manual, collapsed index and header hides down/reappears after 24px up or keyboard focus`);
      await page.close();
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
