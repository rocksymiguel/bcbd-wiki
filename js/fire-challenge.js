(() => {
if (window.__bcbdChallenge) return;
window.__bcbdChallenge = true;
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

// Extract station initialization logic so it runs regardless of DOMContentLoaded timing
function initializeStationPage() {
  const stationIndexEl = document.querySelector('[data-station-index]');
  if (stationIndexEl) {
    const idx = parseInt(stationIndexEl.getAttribute('data-station-index'), 10);
    console.log('initializeStationPage: initializing station', idx);
    addStationNav(idx);
    if (window.initStopwatch) window.initStopwatch(idx);
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

})();
