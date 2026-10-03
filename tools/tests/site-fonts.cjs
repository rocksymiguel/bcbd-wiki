// Verify actual self-hosted glyph rendering and the font cascade on every HTML route.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {handler,root} = require('../gis/serve.cjs');
function htmlFiles(dir=root) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    if(entry.name.startsWith('.') || ['assets','js','tools','partials'].includes(entry.name)) return [];
    const file=path.join(dir,entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [path.relative(root,file).replaceAll('\\','/')] : [];
  });
}
(async () => {
  const server=http.createServer(handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base=process.env.SITE_FONT_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1920,height:1080}});
    const page=await context.newPage();
    const failures=[];
    page.on('response',response => {if(response.url().includes('/assets/fonts/') && response.status()>=400) failures.push(response.url());});
    // Fonts must work with no external font or application services.
    await page.route('**/*',route => {
      const url=route.request().url();
      if(!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) return route.abort();
      return route.continue();
    });
    for(const route of htmlFiles()) {
      const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,route);
      await page.waitForFunction(() => document.querySelector('.site-header'));
      await page.evaluate(() => document.fonts.ready);
      const audit=await page.evaluate(async () => {
        const loaded=await document.fonts.load('400 16px "JetBrains Mono"','Formación: áéíóúñü¿¡');
        const exceptions=[...document.body.querySelectorAll('*')].filter(element => {
          const text=[...element.childNodes].some(node => node.nodeType===Node.TEXT_NODE && node.textContent.trim());
          return (text || element.matches('input,select,textarea')) && !element.matches('script,style') && !getComputedStyle(element).fontFamily.includes('JetBrains Mono');
        }).map(element => `${element.tagName}.${element.className}: ${getComputedStyle(element).fontFamily}`);
        return {loaded:loaded.length,exceptions};
      });
      assert(audit.loaded>0,`No webfont face on ${route}`);
      assert.deepEqual(audit.exceptions,[],route);
    }
    assert.deepEqual(failures,[],'No broken font URLs');
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.evaluate(() => document.fonts.ready);
    const cdp=await context.newCDPSession(page);
    await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const {root:documentRoot}=await cdp.send('DOM.getDocument');
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'.lead'});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    assert(fonts.some(font => font.familyName==='JetBrains Mono' && font.isCustomFont),'Must render real webfont glyphs, not an installed font or fallback');
    console.log(`PASS ${htmlFiles().length} HTML routes, all text/controls use JetBrains Mono, real webfont glyphs verified`);
    await cdp.detach();
    if(process.env.SITE_FONT_TEST_OUTPUT) fs.mkdirSync(process.env.SITE_FONT_TEST_OUTPUT,{recursive:true});
    for(const config of [
      {name:'desktop-light',viewport:{width:1920,height:1080},colorScheme:'light'},
      {name:'desktop-dark',viewport:{width:1920,height:1080},colorScheme:'dark'},
      {name:'android-portrait',viewport:{width:390,height:844},colorScheme:'dark',isMobile:true,hasTouch:true},
      {name:'iphone-portrait',viewport:{width:390,height:844},colorScheme:'light',isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}
    ]) {
      const view=await browser.newContext(config);
      const sample=await view.newPage();
      await sample.goto(base);
      await sample.evaluate(() => document.fonts.ready);
      await sample.locator('.site-header').waitFor();
      const width=await sample.evaluate(() => ({screen:innerWidth,document:document.documentElement.scrollWidth}));
      assert(width.document<=width.screen+1,`${config.name} horizontal overflow: ${JSON.stringify(width)}`);
      if(process.env.SITE_FONT_TEST_OUTPUT) await sample.screenshot({path:path.join(process.env.SITE_FONT_TEST_OUTPUT,config.name+'.png'),fullPage:false});
      console.log('PASS',config.name,'font loaded and no horizontal overflow (Chromium emulation)');
      await view.close();
    }
    await context.close();
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
