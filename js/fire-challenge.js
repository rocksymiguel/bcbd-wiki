// JS for Fire Challenge pages: modal, section toggles, and recorrido navigation

function getCompetitionFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('competition') || params.get('competencia') || params.get('comp') || '').trim().toLowerCase();
    if (raw) {
      if (raw.includes('oba')) return 'copa-oba';
      if (raw.includes('fire')) return 'fire-challenge';
      if (raw.includes('challenge')) return 'fire-challenge';
    }
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/copa-oba-2026/')) return 'copa-oba';
    if (path.includes('/fire-challenge-sto-dmngo-2026/')) return 'fire-challenge';
  } catch (e) {
    console.warn('getCompetitionFromUrl failed', e);
  }
  return 'fire-challenge';
}

function getCompetitionDisplayName(key) {
  return key === 'copa-oba' ? 'Copa OBA 2026' : 'Fire Challenge Santo Domingo 2026';
}

function getCompetitionStationLimit(key) {
  return key === 'copa-oba' ? 4 : 5;
}

// Define the real initStopwatch function at the top level so it's always available
function initStopwatch(idx) {
  try {
    console.log('initStopwatch called for idx', idx);
    // avoid duplicating the panel
    if (document.querySelector('.stopwatch-panel')) { console.log('initStopwatch: panel already exists, skipping'); return; }
    const competitionKey = getCompetitionFromUrl();
    const competitionName = getCompetitionDisplayName(competitionKey);
    const stationLimit = getCompetitionStationLimit(competitionKey);
    const container = document.createElement('div');
    container.className = 'stopwatch-panel';
    container.style.cssText = 'background: rgba(255,255,255,0.98); border: 2px solid #b71c1c; padding:12px; border-radius:8px; margin:12px 0; box-shadow:0 6px 18px rgba(0,0,0,0.06);';
    container.innerHTML = `
      <div class="sw-row" style="display:flex; gap:12px; align-items:flex-end; margin-bottom:12px; flex-wrap:wrap;">
        <label style="flex:1 1 180px; display:flex; flex-direction:column; gap:4px; font-size:14px;">
          Competencia
          <select id="competition-select" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
            <option value="fire-challenge">Fire Challenge Santo Domingo 2026</option>
            <option value="copa-oba">Copa OBA 2026</option>
          </select>
        </label>
        <label style="flex:1 1 220px; display:flex; flex-direction:column; gap:4px; font-size:14px;">
          Nombre del participante
          <input id="participant-name" placeholder="Nombre participante" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px;" />
        </label>
        <div id="sw-display" class="sw-display" style="font-size:24px; font-weight:700; font-family:inherit; min-width:120px; text-align:center;">00:00:00</div>
      </div>
      <div class="sw-row" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="sw-start" class="primary" style="background:#b71c1c; color:white; border:0; padding:10px 16px; border-radius:4px; cursor:pointer; font-weight:600;">Iniciar</button>
        <button id="sw-stop" style="background:#666; color:white; border:0; padding:10px 16px; border-radius:4px; cursor:pointer;">Detener</button>
        <button id="sw-reset" style="background:#999; color:white; border:0; padding:10px 16px; border-radius:4px; cursor:pointer;">Reset</button>
        <button id="sw-next" class="primary" style="background:#b71c1c; color:white; border:0; padding:10px 16px; border-radius:4px; cursor:pointer;">Siguiente</button>
      </div>
      <div style="margin-top:10px; color:#444; font-size:14px;">Competencia seleccionada: <strong>${competitionName}</strong></div>
      <div id="sw-status" style="margin-top:10px; color:#444; font-size:13px;"></div>
    `;
    const main = document.getElementById('main-content') || document.body;
    const competitionSelect = container.querySelector('#competition-select');
    if (competitionSelect) {
      competitionSelect.value = competitionKey;
    }
    const overviewSection = main.querySelector('.overview');
    const stationSteps = overviewSection ? overviewSection.querySelector('.station-steps') : main.querySelector('.station-steps');
    console.log('initStopwatch: stationSteps found=', !!stationSteps, 'overviewSection=', !!overviewSection);
    if (overviewSection && overviewSection.parentNode) {
      overviewSection.parentNode.insertBefore(container, overviewSection);
    } else if (stationSteps && stationSteps.parentNode) {
      stationSteps.parentNode.insertBefore(container, stationSteps);
    } else {
      const firstSection = main.querySelector('section');
      if (firstSection) main.insertBefore(container, firstSection);
      else main.appendChild(container);
    }
    console.log('initStopwatch: panel injected', container);

    let centis = 0, timerId = null;
    function formatTime(c) {
      const cs = c % 100;
      const totalSec = Math.floor(c/100);
      const secs = totalSec % 60;
      const mins = Math.floor(totalSec/60);
      return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}:${String(cs).padStart(2,'0')}`;
    }
    const disp = container.querySelector('#sw-display');
    const input = container.querySelector('#participant-name');
    const btnStart = container.querySelector('#sw-start');
    const btnStop = container.querySelector('#sw-stop');
    const btnReset = container.querySelector('#sw-reset');
    const btnNext = container.querySelector('#sw-next');

    function tick() { centis++; disp.textContent = formatTime(centis); }

    btnStart.addEventListener('click', () => {
      if (timerId) return;
      timerId = setInterval(tick, 10);
      btnStart.disabled = true; btnStop.disabled = false;
    });
    function doStop() {
      if (timerId) { clearInterval(timerId); timerId = null; }
      btnStart.disabled = false; btnStop.disabled = true;
      const name = input.value.trim() || 'Anónimo';
      const competitionSelect = container.querySelector('#competition-select');
      const competition = (competitionSelect && competitionSelect.value) ? competitionSelect.value : competitionKey || getCompetitionFromUrl();
      console.debug('doStop competition:', competition, 'competitionKey:', competitionKey, 'url:', window.location.href);
      recordResult(name, idx, centis, formatTime(centis), competition);
    }
    btnStop.addEventListener('click', doStop);
    btnReset.addEventListener('click', () => { if (timerId) { clearInterval(timerId); timerId=null; } centis=0; disp.textContent='00:00:00'; btnStart.disabled=false; btnStop.disabled=true; });
    btnNext.addEventListener('click', () => {
      doStop();
      const nextIndex = idx + 1;
      if (nextIndex <= stationLimit) {
        const currentCompetition = container.querySelector('#competition-select')?.value || competitionKey;
        const segs = window.location.pathname.split('/').filter(s => s.length>0);
        const estIndex = segs.findIndex(s => s.toLowerCase() === 'estaciones');
        const prefix = estIndex >= 0 ? '/' + segs.slice(0, estIndex+1).join('/') + '/' : '/Estaciones/';
        const competitionQuery = currentCompetition ? `&competition=${currentCompetition}` : '';
        window.location.href = prefix + `estacion${nextIndex}/index.html?recorrido=1${competitionQuery}`;
      }
    });

    disp.textContent = '00:00:00'; btnStop.disabled = true;
  } catch(e) { console.warn('initStopwatch failed',e); }
}

function setSwStatus(message, isError) {
  const statusEl = document.getElementById('sw-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b71c1c' : '#333';
}

function recordResult(name, station, centis, timeStr, competition) {
  try {
    const key = 'fc_results';
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const finalCompetition = competition || getCompetitionFromUrl() || 'fire-challenge';
    const competitionDisplay = getCompetitionDisplayName(finalCompetition);
    const result = {
      name,
      nombre: name,
      station,
      estacion: station,
      competition: competitionDisplay,
      competition_display: competitionDisplay,
      competencia: competitionDisplay,
      competition_key: finalCompetition,
      centis,
      time: timeStr,
      tiempo: timeStr,
      ts: (new Date()).toISOString(),
      fecha: (new Date()).toISOString()
    };
    list.push(result);
    localStorage.setItem(key, JSON.stringify(list));
    console.debug('Recorded result locally', name, station, timeStr, 'competition:', finalCompetition, 'competencia:', competitionDisplay);
    setSwStatus('Subiendo resultado en Base de Datos...', false);
    
    const gsheetUrl = 'https://script.google.com/macros/s/AKfycbwQu6k67mz-TBwGsv2tBhiCq5CYuD0c7LmsBDg-g41f-xcGjm5JGO5l_7UnTVT7tiW5ew/exec';
    console.debug('recordResult payload:', result);
    setSwStatus('Subiendo a base de datos...', false);
    const formBody = new URLSearchParams();
    Object.entries(result).forEach(([k, v]) => formBody.append(k, String(v)));
    fetch(gsheetUrl, {
      method: 'POST',
      mode: 'cors',
      body: formBody
    })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    })
    .then(text => {
      console.log('Google Sheets response:', text);
      setSwStatus('Resultado enviado a la base de datos.', false);
    })
    .catch(e => {
      console.warn('Google Sheets sync failed', e);
      setSwStatus('Error enviando a base de datos: ' + e.message, true);
    });
  } catch(e) {
    console.warn('recordResult failed', e);
    setSwStatus('Error interno al registrar el resultado', true);
  }
}

console.log('fire-challenge.js: initStopwatch exposed globally');
window.initStopwatch = initStopwatch;

// Extract station initialization logic so it runs regardless of DOMContentLoaded timing
function initializeStationPage() {
  const stationIndexEl = document.querySelector('[data-station-index]');
  if (stationIndexEl) {
    const idx = parseInt(stationIndexEl.getAttribute('data-station-index'), 10);
    console.log('initializeStationPage: initializing station', idx);
    addStationNav(idx);
    initStopwatch(idx);
  }
}

// Helper function moved to top level
function addStationNav(idx) {
  const competitionKey = getCompetitionFromUrl();
  const MAX_STATIONS = getCompetitionStationLimit(competitionKey);
  // remove existing nav if any
  const existing = document.querySelector('.station-nav');
  if (existing) existing.remove();

  const prevBtn = document.createElement('button');
  prevBtn.className = 'nav-arrow prev-arrow';
  prevBtn.disabled = idx <= 1;
  prevBtn.innerHTML = '<span class="arrow-icon">←</span><span class="arrow-text">Anterior</span>';

  prevBtn.addEventListener('click', () => {
    if (idx > 1) {
      const segs = window.location.pathname.split('/').filter(s => s.length>0);
      const estIndex = segs.findIndex(s => s.toLowerCase() === 'estaciones');
      const prefix = estIndex >= 0 ? '/' + segs.slice(0, estIndex+1).join('/') + '/' : '/Estaciones/';
      const competitionQuery = competitionKey ? `&competition=${competitionKey}` : '';
      const target = prefix + `estacion${idx-1}/index.html?recorrido=1${competitionQuery}`;
      window.location.href = target;
    }
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'nav-arrow next-arrow';
  nextBtn.disabled = idx >= MAX_STATIONS;
  nextBtn.innerHTML = '<span class="arrow-text">Siguiente</span><span class="arrow-icon">→</span>';

  nextBtn.addEventListener('click', () => {
    if (idx < MAX_STATIONS) {
      const segs = window.location.pathname.split('/').filter(s => s.length>0);
      const estIndex = segs.findIndex(s => s.toLowerCase() === 'estaciones');
      const prefix = estIndex >= 0 ? '/' + segs.slice(0, estIndex+1).join('/') + '/' : '/Estaciones/';
      const competitionQuery = competitionKey ? `&competition=${competitionKey}` : '';
      const target = prefix + `estacion${idx+1}/index.html?recorrido=1${competitionQuery}`;
      window.location.href = target;
    }
  });

  console.debug('addStationNav: adding station nav for index', idx);
  const wrapper = document.createElement('div');
  wrapper.className = 'station-nav';
  wrapper.appendChild(prevBtn);
  wrapper.appendChild(nextBtn);
  document.body.appendChild(wrapper);
}

// Call initializeStationPage as soon as DOM is interactive
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStationPage);
} else {
  // Document already loaded, run immediately
  initializeStationPage();
}

document.addEventListener('DOMContentLoaded', () => {
  const MAX_STATIONS = 5;
  
  // Modal for estaciones — use static modal in DOM with id `stations-modal`
  let modal = document.getElementById('stations-modal');
  console.log('DOMContentLoaded fired, modal=', modal);
  
  // Section toggles on index
  const btnReglas = document.getElementById('btn-reglas');
  const btnEstaciones = document.getElementById('btn-estaciones');
  const btnRanking = document.getElementById('btn-participantes');
  const reglas = document.getElementById('reglas');
  const estaciones = document.getElementById('estaciones');
  const participantes = document.getElementById('participantes');
  const openStationsModal = document.getElementById('open-stations-modal');
  
  console.log('buttons:', {btnReglas, btnEstaciones, btnRanking});

  function hideAll() {
    [reglas, estaciones, participantes].forEach(el => el && el.classList.add('hidden'));
  }

  if (btnReglas) btnReglas.addEventListener('click', () => { hideAll(); reglas.classList.remove('hidden'); });
  if (btnEstaciones) {
    console.log('Registering btnEstaciones listener');
    btnEstaciones.addEventListener('click', () => {
      console.log('btnEstaciones clicked, modal=', modal);
      hideAll();
      estaciones.classList.remove('hidden');
      if (modal) {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        const panel = modal.querySelector('.stations-modal-panel');
        if (panel) panel.focus();
        console.log('Modal opened');
      }
    });
  }
  if (btnRanking) btnRanking.addEventListener('click', () => { window.location.href = 'ranking/index.html'; });

  // Handle openStationsModal button
  if (openStationsModal) {
    openStationsModal.addEventListener('click', () => {
      if (modal) {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        // focus for accessibility
        const panel = modal.querySelector('.stations-modal-panel');
        if (panel) panel.focus();
      }
    });
  }

  // Close handlers for static modal (backdrop and data-close attributes)
  if (modal) {
    modal.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.dataset && target.dataset.close !== undefined) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
      }
    });
    // allow backdrop clicks (backdrop has data-close)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } });
  }

});
