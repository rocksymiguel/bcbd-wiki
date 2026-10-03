/* BCBD: local cartography and shared VM observations. No live telemetry. */
(function () {
  'use strict';
  const dataBase = new URL('../assets/gis/daule/', document.currentScript.src);
  const el = id => document.getElementById(id);
  const names = {canton:'Límite cantonal',parishes:'Parroquias',waterways:'Ríos, esteros y canales',
    roads:'Vías',places:'Poblados y sectores',facilities:'Servicios cartografiados',susceptibility:'Susceptibilidad a inundación'};
  const labels = {observation:'Observación',flood:'Inundación observada',closure:'Acceso comprometido',resource:'Recurso por verificar'};
  const storageKey = 'bcbd-daule-observations-v1';
  const dateFormat = new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'medium',timeStyle:'short'});
  const layers = {}, collections = {};
  const placeLabels = [], riverLabelLayers = [];
  let map, manifest, index = [], selection, reports = [], reportLayer, draft, adding = false, storageError = false, serverReady = false, csrf = "", loadingReports = false;
  const node = (tag,text,className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const sourceFor = key => manifest.sources.find(source => source.id === key);
  const titleFor = f => f.properties.name || f.properties.ref || ({fire_station:'Estación de bomberos',
    hospital:'Hospital',clinic:'Centro de atención',police:'Policía'}[f.properties.amenity]) ||
    (f.properties.waterway ? 'Cauce sin nombre registrado' : 'Elemento sin nombre registrado');

  function detail(title, entries, description) {
    const panel = el('map-detail');
    const heading = node('h2',title); heading.id = 'map-detail-title';
    const list = node('dl');
    entries.forEach(([label,value]) => {
      if (value === undefined || value === null || value === '') return;
      list.append(node('dt',label),node('dd',String(value)));
    });
    panel.replaceChildren(heading,list);
    if (description) panel.append(node('p',description));
  }

  function selected(feature,key,layer,zoom) {
    if (!map.hasLayer(layers[key])) {
      map.addLayer(layers[key]);
      document.querySelector(`[data-layer="${key}"]`).checked = true;
      if (key === 'susceptibility') el('map-hazard-legend').hidden = false;
    }
    if (selection) selection.remove();
    selection = L.geoJSON(feature,{interactive:false,pane:'selection',style:{color:'#ec4899',weight:5,fill:false},
      pointToLayer:(_f,latlng) => L.circleMarker(latlng,{radius:11,color:'#ec4899',weight:3,fill:false})}).addTo(map);
    if (zoom) {
      if (layer.getBounds) map.fitBounds(layer.getBounds(),{padding:[35,35],maxZoom:15});
      else map.setView(layer.getLatLng(),15);
    }
    const p = feature.properties, source = sourceFor(key);
    detail(titleFor(feature),[
      ['Capa',names[key]],['Fuente',key === 'canton' || key === 'parishes' ? 'CONALI · portal SGR' : source.source],
      ['Descarga',dateFormat.format(new Date(source.retrieved_at))],
      ['Referencia',p.ref || p.dpa_parroq || p.dpa_canton],['Tipo',p.waterway || p.place || p.amenity || p.highway],
      ['Superficie',p.surface],['Puente',p.bridge],['Susceptibilidad',p.sui],['Año de capa',p.anno || p.dpa_anio]
    ],key === 'susceptibility' ? 'Clasificación territorial de referencia. No es una inundación actual ni una simulación.' :
      key === 'roads' ? 'Transitabilidad desconocida. Esta línea no confirma que el acceso esté habilitado.' :
      key === 'facilities' ? 'Referencia de OpenStreetMap, pendiente de comprobación. No informa disponibilidad operativa.' :
      key === 'waterways' ? 'Geometría cartográfica. Sin mediciones de nivel, caudal o profundidad.' : 'Referencia cartográfica para localizar el sector.');
  }

  function layerStyle(key,f) {
    const dark = document.documentElement.dataset.theme === 'dark';
    if (key === 'canton') return {color:dark?'#c4b5fd':'#7c3aed',weight:2.5,dashArray:'9 5',fill:false};
    if (key === 'parishes') return {color:dark?'#94a3b8':'#64748b',weight:1.2,dashArray:'5 5',fill:false};
    if (key === 'waterways') return {color:dark?'#38bdf8':'#0284c7',weight:f.properties.waterway === 'river'?3:1.3};
    if (key === 'roads') return {color:dark?'#7c9297':'#889490',weight:/^(trunk|primary|motorway)$/.test(f.properties.highway)?2.3:1,opacity:.8};
    const colors = {ALTA:'#dc2626',MEDIA:'#f59e0b',BAJA:'#eab308','NO APLICABLE':'#94a3b8',SIN:'#94a3b8'};
    return {color:colors[f.properties.sui] || '#94a3b8',weight:.25,fillOpacity:.28};
  }

  function addLayer(key,data) {
    layers[key] = L.geoJSON(data,{pane:key === 'susceptibility'?'hazard':key === 'roads'?'roads':key === 'waterways'?'rivers':'references',
      style:f => layerStyle(key,f),
      pointToLayer:(f,latlng) => L.circleMarker(latlng,{radius:key==='facilities'?6:4,color:key==='facilities'?'#7c3aed':'#334155',
        weight:1.5,fillColor:key==='facilities'?'#a78bfa':'#f8fafc',fillOpacity:1}),
      onEachFeature:(feature,layer) => {
        layer.on('click',event => { L.DomEvent.stopPropagation(event); if(!adding) selected(feature,key,layer,false); });
        if (key === 'places' && feature.properties.name) {
          layer.bindTooltip(node('span',titleFor(feature)),{direction:'right',className:'map-place-label'});
          placeLabels.push({feature,layer});
        }
        if (feature.properties.name || feature.properties.ref) index.push({feature,key,layer,title:titleFor(feature)});
      }});
    if (document.querySelector(`[data-layer="${key}"]`).checked) layers[key].addTo(map);
  }

  function updateLabels() {
    // Display a collision-free subset at each zoom; all sites remain searchable.
    const occupied=[], bounds=map.getBounds(), mapRect=map.getContainer().getBoundingClientRect();
    const main=['daule','la aurora','laurel','limonal','juan bautista aguirre','los lojas'];
    const priority=item => {const i=main.indexOf(fold(item.feature.properties.name));return i<0?100:i;};
    const fits=box => box.left>=mapRect.left+40 && box.right<=mapRect.right-6 && box.top>=mapRect.top+8 && box.bottom<=mapRect.bottom-25 &&
      !occupied.some(r => box.left<r.right+9 && box.right>r.left-9 && box.top<r.bottom+7 && box.bottom>r.top-7);
    placeLabels.forEach(item => item.layer.closeTooltip());
    riverLabelLayers.splice(0).forEach(label => label.remove());
    if(map.hasLayer(layers.places)) {
      placeLabels.slice().sort((a,b) => priority(a)-priority(b)).forEach(item => {
        if(!bounds.contains(item.layer.getLatLng()))return;
        const p=item.feature.properties;
        if(priority(item)===100 && map.getZoom()<13 && !/^(city|town)$/.test(p.place))return;
        item.layer.openTooltip();
        const label=item.layer.getTooltip().getElement();
        if(!label)return; // Leaflet adds child layers after the first map load event.
        const box=label.getBoundingClientRect();
        if(fits(box))occupied.push(box);else item.layer.closeTooltip();
      });
    }
    if(map.hasLayer(layers.waterways)) {
      const rivers=['daule','pula','banife','los tintos','babahoyo'];
      rivers.forEach(name => {
        const candidates=collections.waterways.features.filter(f => fold(f.properties.name).includes(name));
        const positions=[];
        candidates.forEach(f => {
          const coords=f.geometry.coordinates;
          for(let i=0;i<coords.length;i+=Math.max(1,Math.floor(coords.length/12))) {
            const ll=L.latLng(coords[i][1],coords[i][0]);if(!bounds.contains(ll))continue;
            const pt=map.latLngToContainerPoint(ll),size=map.getSize();
            const distance=(pt.x-size.x/2)**2+(pt.y-size.y/2)**2;
            positions.push({ll,name:titleFor(f),distance});
          }
        });
        for(const chosen of positions.sort((a,b) => a.distance-b.distance)) {
          const label=L.tooltip({permanent:true,direction:'center',className:'map-river-label',interactive:false})
            .setLatLng(chosen.ll).setContent(node('span',chosen.name)).addTo(map);
          const box=label.getElement().getBoundingClientRect();
          if(fits(box)){occupied.push(box);riverLabelLayers.push(label);break;}
          label.remove();
        }
      });
    }
  }

  async function json(name) {
    const response = await fetch(new URL(name,dataBase));
    if (!response.ok) throw new Error('No se pudo cargar '+name);
    return response.json();
  }

  function search(event) {
    event.preventDefault();
    const query = fold(el('map-search').value.trim());
    el('map-results').replaceChildren();
    if (!query) return;
    const seen = new Set();
    const found = index.filter(item => {
      const id = item.key+':'+fold(item.title);
      if (!fold(item.title).includes(query) || seen.has(id)) return false;
      seen.add(id); return true;
    }).slice(0,10);
    if (!found.length) el('map-results').append(node('p','Sin coincidencias en esta descarga.','map-caption'));
    found.forEach(item => {
      const button = node('button',item.title,'map-result'); button.type='button';
      button.append(node('small',names[item.key]));
      button.addEventListener('click',() => selected(item.feature,item.key,item.layer,true));
      el('map-results').append(button);
    });
  }

  function setAdding(value) {
    adding = value;
    el('map-add').setAttribute('aria-pressed',String(value));
    el('map-add').textContent = value ? 'Cancelar selección' : 'Añadir observación';
    el('map-report-hint').hidden = !value;
    map.getContainer().style.cursor = value ? 'crosshair' : '';
  }

  function localTimeNow() {
    // Ecuador continental is UTC-05:00; independent of the browser's timezone.
    return new Date(Date.now()-5*3600000).toISOString().slice(0,16);
  }

  function validateReports(data) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 1000)
      throw new Error('Se requiere una colección de hasta 1000 observaciones.');
    return data.features.map(f => {
      const c = f?.geometry?.coordinates, p = f?.properties;
      if (f?.type !== 'Feature' || f.geometry?.type !== 'Point' || !Array.isArray(c) || c.length!==2 ||
        !c.every(Number.isFinite) || Math.abs(c[0])>180 || Math.abs(c[1])>90 || !p ||
        typeof p.name !== 'string' || !p.name.trim() || p.name.length>100 || typeof p.note !== 'string' || p.note.length>1000 ||
        !Object.hasOwn(labels,p.kind) || typeof p.observed_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(p.observed_at) || !Number.isFinite(Date.parse(p.observed_at)))
        throw new Error('Hay observaciones con coordenadas, fecha o campos inválidos.');
      return {type:'Feature',geometry:{type:'Point',coordinates:c.slice()},properties:{
        id:typeof (p.client_id || p.id)==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(p.client_id || p.id)?(p.client_id || p.id):randomID(),
        name:p.name.trim(),note:p.note,kind:p.kind,observed_at:new Date(p.observed_at).toISOString(),
        source:'Registro local del usuario',verification:'Pendiente de verificación'}};
    });
  }

  function collection() { return {type:'FeatureCollection',features:reports}; }

  function randomID() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
  }

  async function api(path, options={}) {
    const response=await fetch('/api/gis/'+path,{credentials:'same-origin',...options,
      headers:{...(options.method?{'X-BCBD-CSRF':csrf}:{}),...options.headers}});
    let data; try {data=await response.json();} catch {throw new Error('El registro de la VM no respondió.');}
    if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'El envío no es válido o excede los límites.');
    return data;
  }

  function attachments(container, feature) {
    const media=feature.properties.attachments || [];
    if(!media.length)return;
    const group=node('div',undefined,'map-attachments');
    media.forEach(item => {
      if(!/^\/api\/gis\/media\/[a-f0-9]{32}$/.test(item.url))return;
      if(item.mime==='image/jpeg') {
        const link=node('a');link.href=item.url;link.target='_blank';link.rel='noopener';
        const img=node('img');img.src=item.url;img.alt='Foto: '+feature.properties.name;img.loading='lazy';link.append(img);group.append(link);
      } else if(item.mime==='video/mp4') {
        const video=node('video');video.src=item.url;video.controls=true;video.preload='metadata';video.playsInline=true;group.append(video);
      }
    });
    container.append(group);
  }

  async function refreshReports() {
    if(loadingReports)return;loadingReports=true;
    try {
      if(!csrf)csrf=(await api('session')).csrf;
      const data=await api('reports');
      if(data.type!=='FeatureCollection' || !Array.isArray(data.features))throw new Error('Respuesta del registro no válida.');
      reports=data.features;serverReady=true;renderReports();
      el('map-storage-status').textContent='Registro compartido actualizado: '+dateFormat.format(new Date(data.updated_at))+' (Ecuador). Pendiente de verificación.';
      el('map-add').disabled=false;el('map-import').disabled=false;
    } catch(error) {
      serverReady=false;el('map-add').disabled=true;el('map-import').disabled=true;
      el('map-storage-status').textContent='Registro de la VM no disponible. '+error.message+' Las capas cartográficas siguen accesibles.';
    } finally {loadingReports=false;}
  }

  function showReport(f,zoom) {
    if (!map.hasLayer(reportLayer)) { reportLayer.addTo(map); document.querySelector('[data-layer="reports"]').checked=true; }
    if(zoom) map.setView([f.geometry.coordinates[1],f.geometry.coordinates[0]],15);
    detail(f.properties.name,[['Tipo',labels[f.properties.kind]],['Observado',dateFormat.format(new Date(f.properties.observed_at))],
      ['Fuente','Registro compartido en la VM'],['Estado','Pendiente de verificación']],f.properties.note || 'Sin detalle adicional.');
    attachments(el('map-detail'),f);
  }

  function renderReports() {
    reportLayer.clearLayers();reportLayer.addData(collection());
    el('map-report-list').replaceChildren();
    if (!reports.length) el('map-report-list').append(node('li','No hay observaciones guardadas.'));
    reports.forEach(f => {
      const row=node('li'),copy=node('div',undefined,'map-report-copy'),locate=node('button',f.properties.name);locate.type='button';
      locate.addEventListener('click',() => showReport(f,true));
      copy.append(locate,node('p',f.properties.note),node('small',labels[f.properties.kind]+' · '+dateFormat.format(new Date(f.properties.observed_at))+' · Pendiente de verificación'));
      attachments(copy,f);row.append(copy);
      if(f.properties.can_delete) {
        const remove=node('button','Eliminar');remove.type='button';remove.setAttribute('aria-label','Eliminar observación '+f.properties.name);
        remove.addEventListener('click',async () => {
          remove.disabled=true;
          try {await api('reports/'+encodeURIComponent(f.properties.id),{method:'DELETE'});await refreshReports();}
          catch(error){el('map-storage-status').textContent='No se pudo eliminar: '+error.message;remove.disabled=false;}
        });row.append(remove);
      }
      el('map-report-list').append(row);
    });
    el('map-export').disabled=!reports.length;
  }

  function setupReports() {
    reportLayer=L.geoJSON(null,{pane:'observations',pointToLayer:(_f,ll) => L.circleMarker(ll,{radius:8,color:'#fff',
      weight:2,fillColor:'#e11d48',fillOpacity:1}),onEachFeature:(f,l) => l.on('click',() => {if(!adding)showReport(f,false);})}).addTo(map);
    layers.reports=reportLayer;
    renderReports();refreshReports();
    setInterval(() => {if(!document.hidden)refreshReports();},30000);
    document.addEventListener('visibilitychange',() => {if(!document.hidden)refreshReports();});
    try {if(localStorage.getItem(storageKey))el('map-migrate').hidden=false;} catch {}
    el('map-migrate').addEventListener('click',async () => {
      try {
        const saved=JSON.parse(localStorage.getItem(storageKey));
        const features=validateReports(saved.data);
        const result=await api('import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'FeatureCollection',features})});
        await refreshReports();el('map-storage-status').textContent=result.created+' registros anteriores compartidos. La copia local se conserva.';
      } catch(error){el('map-storage-status').textContent='No se compartieron los registros anteriores: '+error.message;}
    });
    el('map-add').addEventListener('click',() => {if(serverReady)setAdding(!adding);});
    map.on('click',event => {
      el('map-coordinate').textContent=event.latlng.lat.toFixed(6)+', '+event.latlng.lng.toFixed(6);
      if(!adding)return;
      draft=[Number(event.latlng.lng.toFixed(6)),Number(event.latlng.lat.toFixed(6))];setAdding(false);el('map-report-form').reset();
      el('map-report-time').value=localTimeNow();el('map-report-coordinates').textContent=`Latitud ${draft[1]} · Longitud ${draft[0]}`;
      el('map-report-error').textContent='';el('map-report-dialog').showModal();el('map-report-name').focus();
    });
    el('map-report-cancel').addEventListener('click',() => el('map-report-dialog').close());
    document.addEventListener('keydown',event => {if(event.key==='Escape' && adding)setAdding(false);});
    el('map-report-form').addEventListener('submit',async event => {
      event.preventDefault();const submit=event.target.querySelector('[type="submit"]');submit.disabled=true;
      try {
        if(!draft || !serverReady)throw new Error('Selecciona un punto y verifica la conexión con la VM.');
        const time=el('map-report-time').value;
        if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time))throw new Error('Revisa la fecha y hora.');
        const features=validateReports({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:draft},
          properties:{id:randomID(),name:el('map-report-name').value,note:el('map-report-note').value,kind:el('map-report-type').value,observed_at:time+'-05:00'}}]});
        const files=Array.from(el('map-report-media').files);
        if(files.length>3)throw new Error('Máximo 3 adjuntos por observación.');
        let total=0;
        files.forEach(file => {total+=file.size;const image=/\.(jpe?g|png|webp)$/i.test(file.name);
          if(file.size>(image?50:100)*1024*1024)throw new Error(image?'Cada imagen admite 50 MB.':'Cada video admite 100 MB.');});
        if(total>200*1024*1024)throw new Error('Máximo 200 MB por envío.');
        const body=new FormData();body.append('report',JSON.stringify(features[0]));files.forEach(file=>body.append('media',file));
        el('map-report-error').textContent='Enviando y preparando adjuntos en la VM…';
        await api('reports',{method:'POST',body});el('map-report-dialog').close();draft=null;await refreshReports();
      } catch(error){el('map-report-error').textContent='No se pudo guardar: '+error.message;}
      finally{submit.disabled=false;}
    });
    el('map-export').addEventListener('click',() => {
      const blob=new Blob([JSON.stringify(collection(),null,2)],{type:'application/geo+json'});
      const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='bcbd-daule-observaciones-'+localTimeNow().slice(0,10)+'.geojson';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    el('map-import').addEventListener('change',async event => {
      try {
        const file=event.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('El archivo supera 2 MB.');
        const features=validateReports(JSON.parse(await file.text()));
        const result=await api('import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'FeatureCollection',features})});
        await refreshReports();el('map-storage-status').textContent=result.created+' observaciones incorporadas al registro de la VM.';
      } catch(error){el('map-storage-status').textContent='No se importó el archivo: '+error.message;}
      event.target.value='';
    });
  }

  function setupBackground() {
    // No bulk download or prefetch; fetch only the viewport the visitor opens.
    const backgrounds={
      streets:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}),
      satellite:L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community'}),
      relief:L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Relief: Esri, Vantor, Airbus DS, USGS, NGA, NASA, CGIAR, N Robinson, NCEAS, NLS, OS, NMA, Geodatastyrelsen, Rijkswaterstaat, GSA, Geoland, FEMA, Intermap, GIS User Community'})
    };
    let active='streets';
    Object.values(backgrounds).forEach(layer => layer.on('tileerror',() => {
      if(!map.hasLayer(layer))return;
      el('map-tile-status').hidden=false;el('map-tile-status').textContent='El fondo en línea no está disponible. Puedes elegir otro o usar las capas locales sin fondo.';
    }));
    const select=name => {
      Object.values(backgrounds).forEach(layer=>layer.remove());active=name;
      el('map-tile-status').hidden=true;
      document.querySelectorAll('[data-basemap]').forEach(input=>input.checked=input.dataset.basemap===name);
      if(backgrounds[name])backgrounds[name].addTo(map);
    };
    document.querySelectorAll('[data-basemap]').forEach(input=>input.addEventListener('change',()=>select(input.checked?input.dataset.basemap:'none')));
    select(active);
  }

  function showSources() {
    el('map-source-date').textContent='Preparación: '+dateFormat.format(new Date(manifest.generated_at))+' (Ecuador continental).';
    el('map-source-list').replaceChildren();
    manifest.sources.forEach(s => {
      const item=node('li'), link=node('a',names[s.id]); link.href=new URL(s.id+'.geojson',dataBase).href;link.download=s.id+'.geojson';
      const source=node('a',s.source);source.href=s.source_page || s.url;source.target='_blank';source.rel='noopener noreferrer';
      item.append(link,document.createTextNode(` · ${s.features.toLocaleString('es-EC')} elementos · `),source,
        document.createTextNode(' · Descarga '+dateFormat.format(new Date(s.retrieved_at))));
      el('map-source-list').append(item);
    });
  }

  async function start() {
    el('map-retry').hidden=true;el('map-status').textContent='Cargando cartografía local…';
    el('daule-map').setAttribute('aria-busy','true');
    try {
      if(!window.L)throw new Error('La biblioteca cartográfica no está disponible.');
      const keys=Object.keys(names);
      const results=await Promise.all(['manifest.json',...keys.map(k => k+'.geojson')].map(json));
      manifest=results[0]; keys.forEach((key,i) => collections[key]=results[i+1]);
      if(!map) {
        map=L.map('daule-map',{preferCanvas:true,scrollWheelZoom:true,minZoom:9,maxZoom:19});
        [['hazard',210],['roads',250],['rivers',300],['references',350],['selection',410],['observations',420]].forEach(([name,z]) => {map.createPane(name).style.zIndex=z;});
        map.attributionControl.addAttribution('Datos © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) · CONALI / SGR');
        L.control.scale({imperial:false}).addTo(map);
        keys.forEach(key => addLayer(key,collections[key]));
        setupReports();setupBackground();
        document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change',() => {
          if(input.checked)layers[input.dataset.layer].addTo(map);else layers[input.dataset.layer].remove();
          if(selection){selection.remove();selection=null;}
          if(input.dataset.layer==='susceptibility')el('map-hazard-legend').hidden=!input.checked;
          updateLabels();
        }));
        const select=el('map-sector');
        const sectorItems=index.filter(item => item.key==='parishes');
        const aurora=index.find(item => item.key==='places' && fold(item.title)==='la aurora');
        if(aurora)sectorItems.push(aurora);
        sectorItems.forEach((item,i) => {const option=node('option',item.title);option.value=String(i);select.append(option);});
        select.addEventListener('change',() => {if(select.value==='')map.fitBounds(layers.canton.getBounds(),{padding:[25,25]});
          else {const item=sectorItems[Number(select.value)];selected(item.feature,item.key,item.layer,true);}});
        el('map-search-form').addEventListener('submit',search);
        el('map-fit').addEventListener('click',() => {map.fitBounds(layers.canton.getBounds(),{padding:[25,25]});select.value='';if(selection){selection.remove();selection=null;}});
        new MutationObserver(() => Object.keys(names).forEach(key => layers[key].setStyle?.(f => layerStyle(key,f)))).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
        map.on('moveend zoomend resize',updateLabels);
      }
      map.fitBounds(layers.canton.getBounds(),{padding:[25,25]});
      updateLabels();
      showSources();
      document.querySelectorAll('.map-sidebar input,.map-sidebar select,.map-sidebar button,#map-import').forEach(control => control.disabled=false);
      el('map-add').disabled=!serverReady;el('map-import').disabled=!serverReady;
      el('daule-map').setAttribute('data-ready','true');
      el('map-status').textContent='Cartografía local cargada · Condiciones actuales sin verificar';
    } catch(error) {
      el('map-status').textContent='No se pudo abrir el mapa. '+error.message;
      el('map-retry').hidden=false;
    } finally {el('daule-map').setAttribute('aria-busy','false');}
  }
  el('map-retry').addEventListener('click',start);
  start();
})();
