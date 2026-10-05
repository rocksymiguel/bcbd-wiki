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
  const stamp = at => Number.isFinite(Date.parse(at)) ? format.format(new Date(at)) : 'Fecha no disponible';
  const direction = degrees => Number.isFinite(degrees) ? `${Math.round(degrees)}° · ${['N','NE','E','SE','S','SO','O','NO'][Math.round(degrees/45)%8]}` : 'Sin dato';
  let selectedDay=today(), followsToday=true, tideData, weatherRequest=0, tideRequest=0;
  const backupAfter=5*3600000, refreshEvery=15*60000;
  const backupPoint=['-1.861','-79.977']; // Daule, independent of the model explorer's selected sector.
  const variables=[
    {key:'precipitation_hour',title:'Precipitación',unit:'mm / última hora',model:'precipitation',modelUnit:'mm'},
    {key:'temperature',title:'Temperatura',unit:'°C',model:'temperature_2m',modelUnit:'°C',modelNote:'A 2 m'},
    {key:'wind_speed',title:'Viento',unit:'m/s',model:'wind_speed_10m',modelUnit:'km/h',modelNote:'A 10 m'},
    {key:'wind_direction',title:'Dirección',unit:'°',model:'wind_direction_10m',modelNote:'Viento desde · a 10 m'},
    {key:'river_level',title:'Nivel de río',unit:'m · datum no documentado'}
  ];
  let stationData, stationError='', stationRequest=0, backupData, backupError='', backupLoading, backupAttempt=0;
  const lastStationReadings={};
  const modelRequests=new Map();

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

  function getModel(latitude,longitude) {
    const path=`weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`;
    // Share concurrent requests for Daule between the explorer and backup panel.
    if(!modelRequests.has(path))modelRequests.set(path,get(path).finally(()=>modelRequests.delete(path)));
    return modelRequests.get(path);
  }
  function readingFor(variable) {
    const reading=stationData?.measurements?.[variable.key],at=Date.parse(reading?.at);
    if(reading&&Number.isFinite(reading.value)&&Number.isFinite(at)&&at<=Date.now())lastStationReadings[variable.key]=reading;
    // Partial responses must not erase a known sensor timestamp and its age.
    return lastStationReadings[variable.key]||null;
  }
  function needsBackup() {
    return variables.some(v=>v.model&&readingFor(v)&&Date.now()-Date.parse(readingFor(v).at)>backupAfter);
  }
  function renderStation() {
    const items=[],backupUsed=[],stationUsed=[];
    for(const v of variables) {
      const reading=readingFor(v),age=reading?Date.now()-Date.parse(reading.at):null,old=age!==null&&age>backupAfter;
      const modelAge=Date.now()-Date.parse(backupData?.valid_at),modelValue=backupData?.values?.[v.model];
      const useBackup=old&&v.model&&!backupData?.stale&&Number.isFinite(modelAge)&&modelAge>=0&&modelAge<=backupAfter&&
        Number.isFinite(modelValue)&&(v.key!=='precipitation_hour'||(backupData.interval_seconds>=1&&backupData.interval_seconds<=3600));
      const display=(n,unit)=>v.key==='wind_direction'?direction(n):value(n,unit);
      let item;
      if(useBackup) {
        const note=v.key==='precipitation_hour'?`Acumulada en ${backupData.interval_seconds/60} min; no es la acumulación horaria de HM002.`:v.modelNote;
        item=metric(v.title,display(modelValue,v.modelUnit),`Hora del dato: ${stamp(backupData.valid_at)} · ${note}`);
        item.classList.add('env-backup');item.dataset.source='open-meteo';backupUsed.push(v.title);
        item.append(node('small',`Última medición HM002: ${display(reading.value,v.unit)} · ${stamp(reading.at)}. Más de 5 h sin actualización.`));
      } else {
        item=metric(v.title,reading?display(reading.value,v.unit):'Sin dato',reading?
          `Hora del dato: ${stamp(reading.at)} · ${old?'Lectura antigua · Más de 5 h sin actualización':'Dentro del límite de 5 h; respaldo inactivo'}.`: 'Sin lectura con fecha válida; no se puede comprobar el umbral de 5 h.',old);
        item.dataset.source='hm002';if(reading)stationUsed.push(v.title);
        if(old)item.append(node('small',v.model?
          (backupLoading?'Consultando respaldo Open-Meteo…':'Respaldo Open-Meteo sin dato reciente disponible; se conserva la medición antigua.'):
          'Open-Meteo no proporciona respaldo del nivel de río en este panel.'));
      }
      item.dataset.variable=v.key;
      item.insertBefore(node('small',useBackup?'Fuente: Open-Meteo · Respaldo (modelo)':'Fuente: HM002 · INAMHI (estación)','env-source'),item.children[2]||null);
      items.push(item);
    }
    el('env-station-values').replaceChildren(...items);
    status('env-station-status',`HM002 · EMAPAG-EP (SAICA) · Publicación: INAMHI · Última consulta: ${stamp(stationData?.fetched_at)}.`+
      ` En uso: ${stationUsed.join(', ')||'ninguna lectura disponible'}. Cada sensor tiene su propia hora; la consulta no cambia la fecha de la medición.`+
      `${stationData?.partial?' Hay sensores sin respuesta.':''}${stationData?.stale?' '+stationData.error:''}${stationError?' Consulta sin respuesta: '+stationError:''}`,
      !!(stationError||stationData?.stale||stationData?.partial));
    status('env-backup-status','Open-Meteo · Modelo meteorológico para Daule. Respaldo por variable solo después de 5 h sin actualización de HM002. '+
      (backupUsed.length?`Respaldo activo: ${backupUsed.join(', ')}.`:needsBackup()?'Respaldo requerido, todavía sin dato utilizable.':'Respaldo inactivo: ninguna lectura disponible supera 5 h.')+
      (backupData?` Última consulta: ${stamp(backupData.fetched_at)} · Hora del modelo: ${stamp(backupData.valid_at)}.`:'')+
      (backupError&&needsBackup()?' Consulta de respaldo sin respuesta: '+backupError:'')+
      ' Son estimaciones, no mediciones de HM002. El respaldo siempre corresponde a Daule, independientemente del sector elegido abajo.',!!backupError&&needsBackup());
  }
  async function loadBackup() {
    if(backupLoading)return backupLoading;
    backupAttempt=Date.now();
    backupLoading=(async()=>{
      try{backupData=await getModel(...backupPoint);backupError='';}
      catch(error){backupData=null;backupError=error.message;}
      finally{backupLoading=null;renderStation();}
    })();
    renderStation();return backupLoading;
  }

  async function weather() {
    const request=++weatherRequest, [latitude,longitude]=el('env-point').value.split(',');
    el('env-weather-values').replaceChildren();status('env-weather-status','Consultando estimación…');
    try {
      const data=await getModel(latitude,longitude);
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
    const request=++stationRequest;
    try {
      const data=await get('station');if(request!==stationRequest)return;
      stationData=data;stationError='';
    } catch(error) {
      if(request!==stationRequest)return;stationError=error.message;
    }
    renderStation();if(needsBackup())await loadBackup();
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
  setInterval(()=>{if(document.hidden)return;moon();renderStation();if(needsBackup()&&Date.now()-backupAttempt>=refreshEvery)loadBackup();if(followsToday&&selectedDay!==today())changeDay(today(),true);else renderTides();},60000);
  setInterval(()=>{if(!document.hidden){weather();station();}},900000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(followsToday)selectedDay=today();el('env-day').value=selectedDay;refresh();}});
})();
