/* BCBD: floating panels and the compact environment summary of the Daule GIS. */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const root = document.querySelector('.gis');
  const panels = [...document.querySelectorAll('.gis-panel')];
  const railButtons = [...document.querySelectorAll('.gis-rail [data-open]')];
  let current = '';

  function show(name) {
    current = name || '';
    panels.forEach(panel => panel.classList.toggle('is-open', panel.dataset.panel === current));
    railButtons.forEach(button => button.setAttribute('aria-expanded', String(button.dataset.open === current)));
    root.dataset.panel = current;
  }
  railButtons.forEach(button => button.addEventListener('click', () => show(current === button.dataset.open ? '' : button.dataset.open)));
  document.querySelectorAll('.gis-close').forEach(button => button.addEventListener('click', () => {
    const name = current; show('');
    document.querySelector(`.gis-rail [data-open="${name}"]`)?.focus();
  }));
  const adding = () => el('map-add').getAttribute('aria-pressed') === 'true';
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && current && !adding() && !document.querySelector('dialog[open]')) show('');
  });

  // Leaflet only tracks window resizes; the map box can change without one.
  new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(el('daule-map'));

  // A selection (search, sector, feature or observation) opens its card.
  new MutationObserver(() => show('detail')).observe(el('map-detail'), {childList: true});

  // Line colour and width stay one click away instead of always open.
  document.querySelectorAll('.map-boundary-layer').forEach(layer => {
    const button = document.createElement('button'), controls = layer.querySelector('.map-boundary-controls');
    button.type = 'button'; button.className = 'gis-style-toggle'; button.textContent = 'Estilo';
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', controls.id);
    button.addEventListener('click', () => button.setAttribute('aria-expanded', String(layer.classList.toggle('is-tuning'))));
    layer.append(button);
  });

  // Public read-only view hides the shared register; hide its button too.
  new MutationObserver(() => {
    document.querySelector('.gis-rail [data-open="records"]').hidden = el('panel-records').hidden;
  }).observe(el('panel-records'), {attributes: true, attributeFilter: ['hidden']});

  // Compact environment summary built from the full panel's own readings.
  const variables = [['precipitation_hour', 'Lluvia'], ['temperature', 'Temperatura'], ['wind_speed', 'Viento'], ['river_level', 'Río Daule']];
  function chip(label, value, title, state) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'gis-chip' + (state ? ' is-' + state : ''); button.title = title;
    const name = document.createElement('span'); name.textContent = label;
    const reading = document.createElement('strong'); reading.textContent = value;
    button.append(name, reading);
    button.addEventListener('click', () => show('environment'));
    return button;
  }
  function renderStrip() {
    const items = [];
    let readings = 0;
    variables.forEach(([key, label]) => {
      const metric = document.querySelector(`#env-station-values [data-variable="${key}"]`);
      if (!metric) return;
      readings++;
      const value = metric.querySelector('strong').textContent.replace(/ \/ última hora| · datum no documentado/, '');
      if (value === 'Sin dato') return; // A row of empty chips says nothing; one summary chip below does.
      const state = metric.dataset.source === 'open-meteo' ? 'backup' : metric.classList.contains('env-old') ? 'old' : '';
      const source = metric.dataset.source === 'open-meteo' ? 'Respaldo Open-Meteo (modelo)' : 'HM002 · INAMHI';
      items.push(chip(label, value, label + ': ' + value + ' · ' + source, state));
    });
    if (readings && !items.length) items.push(chip('Estación HM002', 'Sin datos', 'La estación no tiene lecturas con fecha válida', 'missing'));
    const tide = /Próxima (pleamar|bajamar): (.+?), ([\d.,]+ m)/.exec(el('env-tide-status').textContent);
    if (tide) items.push(chip(tide[1] === 'pleamar' ? 'Próx. pleamar' : 'Próx. bajamar', (tide[1] === 'pleamar' ? '↑ ' : '↓ ') + tide[2].split(', ').pop(),
      'Predicción INOCAR Guayaquil–Río Guayas · ' + tide[3] + ' MLWS'));
    const icon = el('env-moon').querySelector('.env-moon-icon');
    const moon = /^(.+?) · ([\d.,]+ %)/.exec(icon?.nextElementSibling?.textContent || '');
    if (moon) items.push(chip('Luna', icon.textContent + ' ' + moon[2], moon[1] + ' · ' + moon[2] + ' iluminada'));
    if (!items.length) items.push(chip('Ambiente', 'Cargando…', 'Consultando estación, mareas y luna'));
    el('gis-env-strip').replaceChildren(...items);
  }
  const strip = new MutationObserver(renderStrip);
  ['env-station-values', 'env-tide-status', 'env-moon'].forEach(id => strip.observe(el(id), {childList: true, subtree: true, characterData: true}));
  renderStrip();
})();
