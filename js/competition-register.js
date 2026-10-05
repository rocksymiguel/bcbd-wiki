(() => {
  if (window.__competitionRegister) return;
  window.__competitionRegister = true;
  if (window.BCBD_PUBLIC_ACCESS?.readOnly || location.hostname.endsWith('.github.io')) {
    // No participant reads, session cookies, queued submissions, or database writes.
    window.initStopwatch = function () {
      if(document.querySelector('.public-competition-notice'))return;
      const main=document.getElementById('main-content') || document.querySelector('main');
      if(!main)return;
      const note=document.createElement('p');note.className='public-competition-notice';
      note.textContent='Vista pública de consulta. El registro de participantes y tiempos todavía no está habilitado.';
      main.prepend(note);
    };
    function publicView() {
      if(document.querySelector('[data-station-index]'))window.initStopwatch();
      const panel=document.getElementById('results-panel');
      if(panel)panel.textContent='Los registros y tiempos de la VM no se publican en esta vista. Registro público todavía no habilitado.';
      const filter=document.getElementById('competition-filter');if(filter)filter.disabled=true;
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',publicView);else publicView();
    return;
  }
  const API = '/api/competitions';
  let csrf;
  async function api(path, body) {
    if (body && !csrf) {
      const response = await fetch(API + '/session');
      if (!response.ok) throw new Error('No se pudo iniciar la sesión');
      csrf = (await response.json()).csrf;
    }
    const response = await fetch(API + path, body ? {method:'POST',
      headers:{'Content-Type':'application/json','X-BCBD-CSRF':csrf}, body:JSON.stringify(body)} : {});
    if (!response.ok) {
      if (response.status === 403) csrf = null;
      throw new Error('Servicio no disponible (' + response.status + ')');
    }
    return response.json();
  }
  function read(key, fallback) { try {return JSON.parse(localStorage.getItem(key)) || fallback;} catch {return fallback;} }
  function write(key, value) {localStorage.setItem(key, JSON.stringify(value));}
  const format = c => [Math.floor(c/6000),Math.floor(c/100)%60,c%100].map(n=>String(n).padStart(2,'0')).join(':');
  const labels = {'fire-challenge':'Fire Challenge Santo Domingo 2026','copa-oba':'Copa OBA 2026'};
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const pendingKey = 'fc_pending_results';
  window.initStopwatch = function(idx) {
    if (document.querySelector('.stopwatch-panel')) return;
    const competition = location.pathname.includes('/copa-oba-2026/') ? 'copa-oba' : 'fire-challenge';
    const limit = competition === 'copa-oba' ? 4 : 5;
    const panel = document.createElement('section'); panel.className = 'stopwatch-panel';
    panel.innerHTML = `<h2>Cronómetro · Estación ${idx}</h2><p>${labels[competition]}</p>
      <label for="participant-name">Buscar participante o registrar su nombre completo</label>
      <div class="sw-row"><input id="participant-name" autocomplete="off" maxlength="100" placeholder="Ej. José María" aria-controls="participant-options">
      <button id="participant-register" type="button">Registrar participante</button></div>
      <div id="participant-options" class="participant-options" aria-label="Participantes registrados"></div>
      <p id="participant-selected" aria-live="polite">Selecciona un participante.</p>
      <output id="sw-display" class="sw-display" aria-label="Minutos, segundos y centésimas">00:00:00</output>
      <div class="sw-row"><button id="sw-start" type="button" disabled>Iniciar</button>
      <button id="sw-stop" type="button" disabled>Detener y guardar</button>
      <button id="sw-reset" type="button">Reiniciar</button>
      <button id="sw-next" type="button">Siguiente estación</button>
      <button id="sw-sync" type="button">Reintentar pendientes</button></div>
      <p id="sw-status" role="status" aria-live="polite"></p>`;
    const main = document.getElementById('main-content'); main.insertBefore(panel,main.querySelector('.overview'));
    const el = id => panel.querySelector('#'+id);
    const input = el('participant-name'), display = el('sw-display');
    let people = read('fc_participants',[]), selected = read('fc_selected_participant',null);
    let elapsed = 0, started = null, interval, saved = false, unsaved, syncing = false;
    const status = (text,error=false) => {el('sw-status').textContent=text; el('sw-status').classList.toggle('sw-error',error);};
    const time = () => elapsed + (started === null ? 0 : performance.now()-started);
    function controls() {
      el('sw-start').disabled = !selected || started !== null || saved || !!unsaved;
      el('sw-stop').disabled = started === null;
      input.disabled = started !== null || !!unsaved;
      el('participant-register').disabled=input.disabled;
      el('participant-options').querySelectorAll('button').forEach(b=>b.disabled=input.disabled);
    }
    function reset() {
      if (unsaved) {status('Guarda primero el tiempo pendiente.',true); return;}
      if (started !== null && !confirm('¿Descartar el tiempo en curso?')) return;
      clearInterval(interval); elapsed=0; started=null; saved=false; display.textContent='00:00:00'; controls();
    }
    function select(person) {
      if (started !== null || unsaved) return;
      selected=person; input.value=person.name;
      try {write('fc_selected_participant',person);} catch {status('No se puede recordar la selección en este navegador.',true);}
      el('participant-selected').textContent=person.name+' · ID: '+person.id;
      if (saved) reset(); render();
    }
    function render() {
      const target=el('participant-options'); target.replaceChildren();
      people.filter(p=>normalize(p.name).includes(normalize(input.value.trim()))).slice(0,15).forEach(p=>{
        const b=document.createElement('button'); b.type='button'; b.textContent=p.name+' · '+p.id;
        b.addEventListener('click',()=>select(p)); target.appendChild(b);
      }); controls();
    }
    async function sync() {
      if (syncing) return; syncing=true;
      try {
        if (unsaved) {await api('/results',unsaved); unsaved=null; saved=true; controls();}
        for (const item of read(pendingKey,[])) {
          await api('/results',item);
          write(pendingKey,read(pendingKey,[]).filter(r=>r.id!==item.id));
        }
        status('Todos los tiempos están guardados en la base de datos de la VM.');
      } catch(e) {status('Pendiente de envío: '+e.message+'. Mantén esta página abierta si falló la copia local y pulsa Reintentar pendientes.',true);}
      finally {syncing=false;}
    }
    function stop() {
      if (started === null) return;
      elapsed=time(); started=null; clearInterval(interval);
      const centis=Math.max(1,Math.floor(elapsed/10)); display.textContent=format(centis);
      unsaved={id:crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2),
        participant_id:selected.id,competition,station:idx,centis};
      try {const queue=read(pendingKey,[]); queue.push(unsaved); write(pendingKey,queue); unsaved=null; saved=true;}
      catch {status('No se pudo conservar el tiempo localmente. Mantén esta página abierta y reintenta guardar.',true);}
      controls(); void sync();
    }
    el('sw-start').addEventListener('click',()=>{
      if (!selected || started !== null || saved || unsaved) return;
      started=performance.now(); interval=setInterval(()=>display.textContent=format(Math.floor(time()/10)),30);
      status('Midiendo el tiempo de '+selected.name+'.'); controls();
    });
    el('sw-stop').addEventListener('click',stop); el('sw-reset').addEventListener('click',reset);
    el('sw-sync').addEventListener('click',sync);
    el('sw-next').disabled=idx>=limit;
    el('sw-next').addEventListener('click',()=>{stop(); if (!unsaved && idx<limit) location.href='../estacion'+(idx+1)+'/index.html?recorrido=1';});
    el('participant-register').addEventListener('click',async()=>{
      el('participant-register').disabled=true;
      try {
        const person=await api('/participants',{name:input.value.trim()});
        if (!people.some(p=>p.id===person.id)) people.push(person);
        try {write('fc_participants',people);} catch {}
        select(person); status('Participante registrado en la VM.');
      } catch(e) {status('No se pudo registrar: '+e.message,true);} finally {controls();}
    });
    input.addEventListener('input',()=>{selected=null; el('participant-selected').textContent='Selecciona una persona de la lista o registra el nombre completo.'; render();});
    window.addEventListener('beforeunload',e=>{if (started!==null || unsaved) {e.preventDefault(); e.returnValue='';}});
    window.addEventListener('online',sync);
    if (selected) select(selected); else render();
    api('/participants').then(list=>{
      people=list; try {write('fc_participants',people);} catch {}
      if (selected && !people.some(p=>p.id===selected.id)) {selected=null; el('participant-selected').textContent='Selecciona un participante registrado.';}
      render(); if (read(pendingKey,[]).length) void sync(); else status('Registro conectado a la VM.');
    }).catch(()=>status('Base de datos no disponible. Se conservan los participantes y tiempos pendientes de este navegador.',true));
  };
  async function ranking() {
    const panel=document.getElementById('results-panel'); if (!panel) return;
    const filter=document.getElementById('competition-filter');
    panel.textContent='Cargando tiempos de la VM…';
    try {
      const results=await api('/results'); panel.replaceChildren();
      const requested=new URLSearchParams(location.search).get('competition') || '';
      if (filter && !filter.children.length) {
        for (const [key,label] of [['','Todas las competencias'],...Object.entries(labels)]) {
          const option=document.createElement('option'); option.value=key; option.textContent=label; filter.appendChild(option);
        }
        filter.value=requested; filter.addEventListener('change',ranking);
      }
      const groups=new Map();
      for (const row of results) {
        const chosen=filter ? filter.value : requested;
        if (chosen && row.competition!==chosen) continue;
        const key=row.competition+':'+row.station;
        if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(row);
      }
      if (!groups.size) panel.textContent='No hay tiempos registrados para esta selección.';
      for (const rows of groups.values()) {
        const section=document.createElement('section'); section.className='competition-results';
        const h=document.createElement('h2'); h.textContent=labels[rows[0].competition]+' · Estación '+rows[0].station; section.appendChild(h);
        const people=new Map();
        for (const row of rows) {if (!people.has(row.participant_id)) people.set(row.participant_id,[]); people.get(row.participant_id).push(row);}
        const ordered=[...people.values()].sort((a,b)=>Math.min(...a.map(r=>r.centis))-Math.min(...b.map(r=>r.centis)));
        for (const attempts of ordered) {
          const details=document.createElement('details'), summary=document.createElement('summary');
          summary.textContent=attempts[0].name+' · '+format(Math.min(...attempts.map(r=>r.centis)))+' · '+attempts.length+' registros';
          details.appendChild(summary);
          for (const r of attempts) {const p=document.createElement('p'); p.textContent=format(r.centis)+' · '+new Date(r.recorded_at).toLocaleString('es-EC')+' · ID '+r.participant_id; details.appendChild(p);}
          section.appendChild(details);
        }
        panel.appendChild(section);
      }
    } catch {panel.textContent='No se pudo consultar la base de datos de la VM. Recarga la página cuando vuelva la conexión.';}
  }
  function init() {const station=document.querySelector('[data-station-index]'); if (station) window.initStopwatch(Number(station.dataset.stationIndex)); void ranking();}
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
