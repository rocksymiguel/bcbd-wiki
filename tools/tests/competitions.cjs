// Real API integration; disposable test participants are removed by the scoped cleanup script.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const {handler}=require('../gis/serve.cjs');
const output=require('node:path').resolve(__dirname,'../../.local/competition-test');
fs.mkdirSync(output,{recursive:true});
const run='BCBD TEST '+Date.now();
const server=http.createServer((req,res)=>{
  if(!req.url.startsWith('/api/competitions/')) return handler(req,res);
  const headers={...req.headers,host:'192.168.18.150'};
  if(headers.origin) headers.origin='http://192.168.18.150';
  const proxy=http.request({hostname:'192.168.18.150',path:req.url,method:req.method,headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  }); proxy.on('error',()=>res.writeHead(502).end());req.pipe(proxy);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=process.env.COMPETITIONS_TEST_URL || `http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const ids=[];
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const station='/competencias-preparacion/fire-challenge-sto-dmngo-2025/Estaciones/estacion1/index.html';
    await page.goto(base+station); await page.waitForSelector('.stopwatch-panel');
    await page.fill('#participant-name',run+' José María');
    const created=page.waitForResponse(r=>r.url().endsWith('/participants') && r.request().method()==='POST');
    await page.click('#participant-register'); const person=await (await created).json();
    assert.ok(person.id);ids.push(person.id); fs.writeFileSync(output+'/ids.json',JSON.stringify(ids));
    await page.waitForFunction(()=>!document.querySelector('#sw-start').disabled);
    for(const theme of ['dark','light','dark']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      const colors=await page.locator('#sw-display').evaluate(el=>({text:getComputedStyle(el).color,surface:getComputedStyle(el.closest('.stopwatch-panel')).backgroundColor}));
      assert.notEqual(colors.text,colors.surface);
      assert.equal(colors.text,theme==='dark'?'rgb(249, 250, 251)':'rgb(17, 24, 39)');
    }
    await page.click('#sw-start'); await page.waitForTimeout(450);
    await page.route('**/api/competitions/results',route=>route.request().method()==='POST'?route.abort():route.continue());
    await page.click('#sw-stop');
    await page.waitForFunction(()=>document.querySelector('#sw-status').textContent.includes('Pendiente de envío'));
    const queue=await page.evaluate(()=>JSON.parse(localStorage.getItem('fc_pending_results')));
    assert.equal(queue.length,1); assert.ok(queue[0].centis>=35 && queue[0].centis<200);
    await page.unroute('**/api/competitions/results'); await page.click('#sw-sync');
    await page.waitForFunction(()=>document.querySelector('#sw-status').textContent.includes('Todos los tiempos'));
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fc_pending_results')).length),0);
    await page.click('#sw-next'); await page.waitForURL('**/estacion2/index.html?recorrido=1');
    assert.match(await page.locator('#participant-selected').textContent(),/José María/);
    await page.fill('#participant-name','jose');
    await page.getByRole('button',{name:run+' José María · '+person.id,exact:true}).click();
    await page.reload(); await page.waitForSelector('.stopwatch-panel');
    assert.match(await page.locator('#participant-selected').textContent(),/José María/);
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    await page.screenshot({path:output+'/mobile-dark.png',fullPage:true});
    const second=await browser.newContext({viewport:{width:1366,height:900}});
    const other=await second.newPage(); await other.goto(base+'/competencias-preparacion/ranking/index.html');
    await other.getByText(run+' José María',{exact:false}).waitFor();
    await other.selectOption('#competition-filter','copa-oba');
    await other.getByText('No hay tiempos registrados para esta selección.').waitFor();
    await other.selectOption('#competition-filter','fire-challenge');
    await other.getByText(run+' José María',{exact:false}).waitFor();
    const rows=await context.request.get(base+'/api/competitions/results');
    assert.equal((await rows.json()).filter(r=>r.participant_id===person.id).length,1);
    for(const competition of ['copa-oba-2025','fire-challenge-sto-dmngo-2025']) {
      await page.goto(base+'/competencias-preparacion/'+competition+'/index.html');
      await page.click('#btn-estaciones'); assert.equal(await page.locator('#stations-modal').getAttribute('aria-hidden'),'false');
      for(let n=1;n<=(competition==='copa-oba-2025'?4:5);n++) {
        await page.goto(base+'/competencias-preparacion/'+competition+'/Estaciones/estacion'+n+'/index.html');
        await page.waitForSelector('.stopwatch-panel');
        await page.locator('footer').count();
        const image=page.locator('.station-circuit img'); await image.scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>[...document.querySelectorAll('.station-circuit img')].every(im=>im.complete && im.naturalWidth>0));
        assert.equal(await page.locator('img[src*="illustraciones"]').count(),0);
      }
    }
    await page.goto(base+'/competencias-preparacion/fire-challenge-sto-dmngo-2025/Reglas/index.html');
    await page.getByText('El reglamento oficial aún no está incorporado.',{exact:false}).waitFor();
    if(!process.env.COMPETITIONS_TEST_URL) {
      await page.goto(base+'/bcbd-wiki'+station); await page.waitForSelector('.stopwatch-panel');
      await page.waitForFunction(()=>document.querySelector('.station-circuit img').naturalWidth>0);
    }
    assert.deepEqual(errors,[]); console.log('PASS: timer, dark/light themes, offline retry, no duplicate, selection, shared ranking, nine circuits, modal and rules.');
  } finally {
    await browser.close(); await new Promise(resolve=>server.close(resolve));
    if(ids.length) {
      assert.ok(ids.every(id=>/^[a-f0-9]{16}$/.test(id)));
      const cleanup=require('node:child_process').spawnSync('ssh',[
        '-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','bcbd-wiki',
        'docker exec -i bcbd-competitions python - '+ids.join(',')],
        {input:fs.readFileSync(__dirname+'/cleanup-competition-tests.py'),encoding:'utf8'});
      assert.equal(cleanup.status,0,cleanup.stderr); console.log(cleanup.stdout.trim());
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
