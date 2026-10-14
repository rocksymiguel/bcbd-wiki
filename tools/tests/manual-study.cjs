const {chromium}=require('playwright');
const {Marked}=require('marked');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {handler,root}=require('../gis/serve.cjs');
const book=path.join(root,'material-de-estudio/bomberos-i');
const manifest=JSON.parse(fs.readFileSync(path.join(book,'manifest.json')));
const md=fs.readFileSync(path.join(book,'manual.md'));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
assert.equal(hash(md),manifest.source.sha256);
const marked=new Marked({gfm:true,breaks:false});
const chapterText=md.toString().slice(md.toString().indexOf('## Herramientas y equipos'));
const plain=chapterText.replace(/!\[\[[^\]]+\]\]/g,'').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,target,label)=>label||target.replace(/^#/,''));
const expectedHTML=marked.parse(plain);
const out=path.join(root,'.local/manual-study-test');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=(process.env.MANUAL_TEST_URL||`http://127.0.0.1:${server.address().port}/`).replace(/\/?$/,'/');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const checked=await browser.newContext();
    const originalMD=await checked.request.get(base+'material-de-estudio/bomberos-i/manual.md');
    assert.equal(originalMD.status(),200);assert.equal(hash(await originalMD.body()),manifest.source.sha256);
    // Read all shipped assets and verify exact bytes, not only HTTP status.
    for(const asset of manifest.assets){
      const res=await checked.request.get(base+'material-de-estudio/bomberos-i/'+asset.path.split('/').map(encodeURIComponent).join('/'),{timeout:60000});
      assert.equal(res.status(),200,asset.path);assert.equal(hash(await res.body()),asset.sha256,asset.path);
    }
    console.log('PASS original PDF and all 189 illustrations: served SHA-256 hashes match the imported source');
    await checked.close();
    for(const config of [
      {name:'desktop-light',viewport:{width:1920,height:1080},colorScheme:'light'},
      {name:'desktop-dark',viewport:{width:1366,height:900},colorScheme:'dark'},
      {name:'mobile',viewport:{width:390,height:844},colorScheme:'light',isMobile:true,hasTouch:true},
      {name:'mobile-landscape',viewport:{width:844,height:390},colorScheme:'dark',isMobile:true,hasTouch:true},
      {name:'narrow',viewport:{width:320,height:640},colorScheme:'dark',isMobile:true,hasTouch:true},
      ...(!process.env.MANUAL_TEST_URL?[{name:'subpath',viewport:{width:1280,height:800},colorScheme:'light',prefix:'bcbd-wiki/'}]:[])
    ]){
      const context=await browser.newContext(config);const page=await context.newPage();const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const url=base+(config.prefix||'')+'material-de-estudio/bomberos-i/';
      const response=await page.goto(url,{waitUntil:'networkidle'});assert.equal(response.status(),200);
      await page.locator('.site-header').waitFor();await page.evaluate(()=>document.fonts.ready);
      const audit=await page.evaluate(expected=>{
        const temp=document.createElement('div');temp.innerHTML=expected;
        const normalize=s=>s.replace(/\s+/g,' ').trim();
        const article=document.getElementById('manual-content');
        return {actual:normalize(article.textContent),expected:normalize(temp.textContent),chapters:article.querySelectorAll('h2').length,
          images:article.querySelectorAll('.manual-image img').length,lazy:[...article.querySelectorAll('img')].every(im=>im.loading==='lazy'),
          visibleBullets:[...article.querySelectorAll('ul')].every(ul=>getComputedStyle(ul).listStyleType!=='none'),
          missing:[...document.querySelectorAll('#manual-toc a')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash),
          overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(article).fontFamily,
          duplicateIds:[...document.querySelectorAll('[id]')].map(el=>el.id).filter((id,i,arr)=>arr.indexOf(id)!==i)};
      },expectedHTML);
      assert.equal(audit.actual,audit.expected,'Every heading, paragraph and list item must match the source Markdown');
      assert.equal(audit.chapters,9);assert.equal(audit.images,189);assert(audit.lazy);assert(audit.visibleBullets);assert.deepEqual(audit.missing,[]);assert.deepEqual(audit.duplicateIds,[]);
      assert(!audit.overflow,config.name+' must not overflow');assert.match(audit.font,/JetBrains Mono/);
      await page.screenshot({path:path.join(out,config.name+'.png')});
      const toc=page.locator('#manual-toc');
      if(config.isMobile){assert.equal(await toc.getAttribute('open'),null);await page.locator('#manual-toc summary').click();}
      const target=manifest.chapters[1];await page.locator('#manual-toc a[href="#'+target.id+'"]').click();
      assert.equal(new URL(page.url()).hash,'#'+target.id);
      if(config.isMobile)assert.equal(await toc.getAttribute('open'),null);
      const image=page.locator('.manual-image').first();await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>document.querySelector('.manual-image img').naturalWidth>0);
      await image.click();const dialog=page.locator('#manual-image-dialog');assert(await dialog.evaluate(el=>el.open));
      await page.waitForFunction(()=>document.getElementById('manual-image-full').naturalWidth>0);
      await page.locator('#manual-image-close').click();assert(!(await dialog.evaluate(el=>el.open)));
      await image.click();await page.keyboard.press('Escape');assert(!(await dialog.evaluate(el=>el.open)));
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
      if(config.name==='desktop-light'){
        const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.manual-download').click()]);
        assert.equal(download.suggestedFilename(),'Manual - Bomberos I.pdf');
        const stream=await download.createReadStream();const digest=crypto.createHash('sha256');let bytes=0;
        for await(const chunk of stream){digest.update(chunk);bytes+=chunk.length;}
        const pdf=manifest.assets.find(a=>a.path.endsWith('.pdf'));assert.equal(bytes,pdf.bytes);assert.equal(digest.digest('hex'),pdf.sha256);
        console.log('PASS browser download: original filename, size and PDF SHA-256');
      }
      assert.deepEqual(errors,[]);console.log('PASS '+config.name+': exact manual text, 9 chapters, 189 images, index, lightbox, theme/font and no overflow');
      await page.goto(base+(config.prefix||'')+'material-de-estudio/');await page.locator('.study-card').click();await page.waitForURL('**/material-de-estudio/bomberos-i/index.html');
      await context.close();
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
