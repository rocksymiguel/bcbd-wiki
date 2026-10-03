/* Public readings, model estimates and tide predictions remain distinct. */
(function () {
  'use strict';
  const root = new URL('../', document.currentScript.src), el = id => document.getElementById(id);
  const endpoint = new URL('/api/environment/', location.origin);
  const format = new Intl.DateTimeFormat('es-EC', {timeZone:'America/Guayaquil',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const number = new Intl.NumberFormat('es-EC', {maximumFractionDigits:2});
  const today = () => new Date(Date.now()-5*3600000).toISOString().slice(0,10);
  const node = (tag, text, cls) => {const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  const value = (n, unit) => Number.isFinite(n) ? number.format(n)+' '+unit : 'Sin dato';
  const stamp = at => format.format(new Date(at));
  const direction = degrees => Number.isFinite(degrees) ? `${Math.round(degrees)}° · ${['N','NE','E','SE','S','SO','O','NO'][Math.round(degrees/45)%8]}` : 'Sin dato';
  let selectedDay=today(), followsToday=true, tideData, weatherRequest=0, tideRequest=0;

  function metric(title, text, note, warning) {
    const item=node('div','','env-metric');item.append(node('span',title),node('strong',text));
    if(note)item.append(node('small',note));if(warning)item.classList.add('env-old');return item;
  }
  async function get(path) {
    const response=await fetch(new URL(path,endpoint),{signal:AbortSignal.timeout(55000)});
    if(!response.ok)throw new Error('Fuente sin respuesta o sin datos para esta consulta.');
    return response.json();
  }
  function unavailable(target, message) {
    const text=el(target);text.textContent=message;text.classList.add('env-error');
  }
  function status(target, text, stale) {el(target).textContent=text;el(target).classList.toggle('env-error',!!stale);}

  async function weather() {
    const request=++weatherRequest, [latitude,longitude]=el('env-point').value.split(',');
    el('env-weather-values').replaceChildren();status('env-weather-status','Consultando estimación…');
    try {
      const data=await get(`weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`);
      if(request!==weatherRequest)return;
      const v=data.values, minutes=data.interval_seconds/60;
      el('env-weather-values').replaceChildren(
        metric('Temperatura',value(v.temperature_2m,'°C'),'A 2 m'),
        metric('Precipitación',value(v.precipitation,'mm'),`Acumulada en ${minutes} min`),
        metric('Viento',value(v.wind_speed_10m,'km/h'),'A 10 m · desde '+direction(v.wind_direction_10m)),
        metric('Ráfagas',value(v.wind_gusts_10m,'km/h')));
      status('env-weather-status',`Estimación de modelo · Hora del dato: ${stamp(data.valid_at)} · Consulta: ${stamp(data.fetched_at)}. No confirma la lluvia en una calle.${data.stale?' '+data.error:''}`,data.stale);
    } catch(error) {if(request===weatherRequest)unavailable('env-weather-status',error.message);}
  }
  async function station() {
    try {
      const data=await get('station'), m=data.measurements, items=[];
      for(const [key,title,unit] of [['precipitation_hour','Precipitación','mm / última hora'],['temperature','Temperatura','°C'],['wind_speed','Viento','m/s'],['wind_direction','Dirección','°'],['river_level','Nivel de río','m · datum no documentado']]) {
        const reading=m[key];
        if(!reading){items.push(metric(title,'Sin dato'));continue;}
        const age=(Date.now()-Date.parse(reading.at))/3600000, old=age>2;
        items.push(metric(title,key==='wind_direction'?direction(reading.value):value(reading.value,unit),`${stamp(reading.at)}${old?' · Lectura antigua':''}`,old));
      }
      el('env-station-values').replaceChildren(...items);
      status('env-station-status',`HM002 · EMAPAG-EP (SAICA) · Última consulta: ${stamp(data.fetched_at)}. Horas de cada sensor tal como las publica INAMHI.${data.partial?' Hay sensores sin respuesta.':''}${data.stale?' '+data.error:''}`,data.stale||data.partial);
    } catch(error) {
      el('env-station-values').replaceChildren();unavailable('env-station-status',error.message+' No se sustituyen mediciones por estimaciones.');
    }
  }
  function moon() {
    if(!window.Astronomy){el('env-moon').textContent='Cálculo lunar no disponible.';return;}
    const instant=selectedDay===today()?new Date():new Date(selectedDay+'T12:00:00-05:00');
    const angle=Astronomy.MoonPhase(instant), illumination=Astronomy.Illumination(Astronomy.Body.Moon,instant).phase_fraction;
    // Name the nearest principal phase within +/- 7 degrees; otherwise growing/waning.
    let index;
    if(angle<7||angle>=353)index=0;else if(angle<83)index=1;else if(angle<97)index=2;else if(angle<173)index=3;
    else if(angle<187)index=4;else if(angle<263)index=5;else if(angle<277)index=6;else index=7;
    const phases=['Luna nueva','Luna creciente','Cuarto creciente','Gibosa creciente','Luna llena','Gibosa menguante','Cuarto menguante','Luna menguante'];
    el('env-moon').replaceChildren(node('span',['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][index],'env-moon-icon'),
      node('span',`${phases[index]} · ${number.format(illumination*100)} % iluminada · Cálculo: ${stamp(instant)}`));
  }
  function renderTides() {
    if(!tideData||tideData.day!==selectedDay)return;
    const events=tideData.days[selectedDay];
    el('env-tides').replaceChildren(...events.map(event => {
      const item=metric(event.kind==='pleamar'?'↑ Pleamar':'↓ Bajamar',event.time,value(event.height_m,'m · MLWS'));
      item.dataset.kind=event.kind;return item;
    }));
    const next=selectedDay===today()?Object.values(tideData.days).flat().filter(e=>Date.parse(e.at)>Date.now()).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0]:null;
    const text=`Predicción INOCAR · ${selectedDay}${next?` · Próxima ${next.kind}: ${stamp(next.at)}, ${value(next.height_m,'m')}`:''} · Consulta: ${stamp(tideData.fetched_at)}.${tideData.stale?' '+tideData.error:''}`;
    status('env-tide-status',text,tideData.stale);
  }
  async function tides() {
    const request=++tideRequest;el('env-tides').replaceChildren(node('p','Consultando INOCAR…'));status('env-tide-status','');moon();
    try {const data=await get('tides?day='+encodeURIComponent(selectedDay));if(request!==tideRequest)return;tideData=data;renderTides();}
    catch(error){if(request!==tideRequest)return;tideData=null;el('env-tides').replaceChildren();unavailable('env-tide-status',error.message+' No se genera una tabla aproximada.');}
  }
  function changeDay(day, auto) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){el('env-day').value=selectedDay;return;}
    selectedDay=day;followsToday=auto;el('env-day').value=day;tides();
  }
  function refresh() {return Promise.allSettled([weather(),station(),tides()]);}
  el('env-day').value=selectedDay;el('env-day').max=(Number(today().slice(0,4))+1)+'-12-31';
  el('env-day').addEventListener('change',event=>changeDay(event.target.value,event.target.value===today()));
  el('env-today').addEventListener('click',()=>changeDay(today(),true));
  el('env-point').addEventListener('change',weather);
  el('env-refresh').addEventListener('click',async ()=>{el('env-refresh').disabled=true;try{await refresh();}finally{el('env-refresh').disabled=false;}});
  fetch(new URL('assets/gis/daule/places.geojson',root)).then(r=>r.json()).then(data=>{
    for(const name of ['La Aurora','Guarumal','Palo Alto']) {
      const feature=data.features.find(f=>f.properties.name?.toLowerCase()===name.toLowerCase());if(!feature)continue;
      const option=node('option',name), [lon,lat]=feature.geometry.coordinates;option.value=lat+','+lon;el('env-point').append(option);
    }
  }).catch(()=>{});
  refresh();
  setInterval(()=>{if(document.hidden)return;moon();if(followsToday&&selectedDay!==today())changeDay(today(),true);else renderTides();},60000);
  setInterval(()=>{if(!document.hidden){weather();station();}},900000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(followsToday)selectedDay=today();el('env-day').value=selectedDay;refresh();}});
})();
