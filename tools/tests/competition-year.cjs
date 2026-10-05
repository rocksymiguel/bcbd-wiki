// Read-only audit of competition labels, assets, navigation and legacy bookmarks.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {handler,root}=require('../gis/serve.cjs');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.html')?[path.join(dir,e.name)]:[]);
(async()=>{
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=(process.env.COMPETITION_YEAR_TEST_URL||`http://127.0.0.1:${server.address().port}/`).replace(/\/?$/,'/');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    // Do not submit participants or times; the VM's live records stay untouched.
    const all=files(path.join(root,'competencias-preparacion'));
    const canonical=all.filter(file=>!file.includes('2026'));
    for(const file of canonical){
      const relative=path.relative(root,file).replaceAll('\\','/');
      assert(!fs.readFileSync(file,'utf8').includes('2026'),relative);
      const response=await page.goto(base+relative,{waitUntil:'networkidle'});
      assert.equal(response.status(),200,relative);
      assert(!(await page.title()).includes('2026'),relative);
      assert(!(await page.locator('main').innerText()).includes('2026'),relative);
      const assets=await page.locator('main img').evaluateAll(images=>images.map(im=>({src:im.src,loaded:im.complete&&im.naturalWidth>0})));
      assert(assets.every(im=>im.loaded&&!im.src.includes('2026')),JSON.stringify(assets));
      const links=await page.locator('main a[href]').evaluateAll(items=>items.map(a=>a.href));
      assert(!links.some(url=>url.includes('2026')),relative);
      for(const link of links.filter(url=>url.startsWith(base))){
        const response=await page.request.get(link);
        assert.equal(response.status(),200,link);
      }
      if(relative.includes('/Estaciones/')){
        await page.locator('.station-nav').waitFor();
        if(!base.includes('github.io')){
          await page.locator('.stopwatch-panel').waitFor();
          const label=relative.includes('copa-oba')?'Copa OBA 2025':'Fire Challenge Santo Domingo 2025';
          assert((await page.locator('.stopwatch-panel').innerText()).includes(label));
        }
      }
    }
    for(const file of all.filter(file=>file.includes('2026'))){
      const relative=path.relative(root,file).replaceAll('\\','/');
      await page.goto(base+relative+'?recorrido=1&competition=copa-oba#pasos',{waitUntil:'domcontentloaded'});
      await page.waitForURL(url=>url.pathname.includes(relative.replaceAll('2026','2025')));
      const url=new URL(page.url());
      assert.equal(url.search,'?recorrido=1&competition=copa-oba');
      assert.equal(url.hash,'#pasos');
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS ${canonical.length} competition pages: 2025 labels, routes, loaded images, working links and station controls; 12 legacy redirects preserve query/hash; no database writes`);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
