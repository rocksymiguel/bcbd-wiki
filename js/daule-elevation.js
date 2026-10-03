/* Render local numeric DSM samples in Leaflet; no external terrain tiles. */
(function () {
  'use strict';
  const base=new URL('../assets/gis/daule/elevation/',document.currentScript.src);
  window.DauleElevation={create(map) {
    const el=id=>document.getElementById(id);
    let meta, heights, loading, active=false, marker;
    const opacity=el('map-elevation-opacity'),key='gis-daule-elevation-opacity';
    try{const saved=Number(localStorage.getItem(key));if(saved>=20&&saved<=100)opacity.value=String(saved);}catch{}
    const valueAt=(lat,lng)=>{
      if(!heights||!Number.isFinite(lat)||!Number.isFinite(lng))return null;
      const col=Math.floor((lng-meta.west)/meta.step_lon),row=Math.floor((meta.north-lat)/meta.step_lat);
      if(row<0||col<0||row>=meta.height||col>=meta.width)return null;
      const value=heights[row*meta.width+col];return Number.isFinite(value)?value:null;
    };
    const legend=L.control({position:'bottomright'});
    legend.onAdd=()=>{
      const box=L.DomUtil.create('div','map-elevation-legend');
      const title=document.createElement('strong');title.textContent='Altitud aproximada · m';box.append(title);
      for(const band of meta.palette){
        const row=document.createElement('div'),swatch=document.createElement('i'),label=document.createElement('span');
        swatch.style.background=band.color;label.textContent=band.label;row.append(swatch,label);box.append(row);
      }
      const note=document.createElement('small');note.textContent='Superficie · ~30 m · EGM2008';box.append(note);
      L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);return box;
    };
    const Grid=L.GridLayer.extend({createTile(coords){
      const tile=document.createElement('canvas');tile.width=tile.height=256;
      if(!heights)return tile;
      const ctx=tile.getContext('2d'),image=ctx.createImageData(256,256),pixels=image.data;
      const world=256*2**coords.z,columns=new Int32Array(256),rows=new Int32Array(256);
      for(let x=0;x<256;x++)columns[x]=Math.floor((((coords.x*256+x+.5)/world*360-180)-meta.west)/meta.step_lon);
      for(let y=0;y<256;y++){
        const n=Math.PI*(1-2*(coords.y*256+y+.5)/world);
        const lat=Math.atan(Math.sinh(n))*180/Math.PI;
        rows[y]=Math.floor((meta.north-lat)/meta.step_lat);
      }
      const colors=meta.palette.map(b=>b.color.slice(1).match(/../g).map(v=>parseInt(v,16)));
      for(let y=0;y<256;y++){
        const row=rows[y];if(row<0||row>=meta.height)continue;
        for(let x=0;x<256;x++){
          const col=columns[x];if(col<0||col>=meta.width)continue;
          const value=heights[row*meta.width+col];if(!Number.isFinite(value))continue;
          const band=meta.palette.findIndex(b=>b.below===null||value<b.below),rgb=colors[band],i=(y*256+x)*4;
          pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];pixels[i+3]=255;
        }
      }
      ctx.putImageData(image,0,0);return tile;
    }});
    const layer=new Grid({tileSize:256,minZoom:9,maxZoom:19,noWrap:true,keepBuffer:1,
      attribution:'Altitud: <a href="https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM">Copernicus DEM GLO-30</a> · <a href="#map-elevation-source">Créditos</a>'});
    const setOpacity=()=>{
      const amount=Math.min(100,Math.max(20,Number(opacity.value)||85));
      layer.setOpacity(amount/100);el('map-elevation-value').textContent=amount+' %';
      opacity.setAttribute('aria-valuetext',amount+' por ciento');
    };
    opacity.addEventListener('input',()=>{setOpacity();try{localStorage.setItem(key,opacity.value);}catch{}});setOpacity();
    async function load(){
      if(heights)return;if(loading)return loading;
      el('map-elevation-readout').textContent='Cargando alturas locales de Daule…';
      el('map-elevation-retry').hidden=true;el('map-elevation-controls').dataset.state='loading';
      loading=(async()=>{
        const response=await fetch(new URL('metadata.json',base));if(!response.ok)throw new Error('inventario no disponible');
        meta=await response.json();
        if(meta.format!=='float32-le-row-major-gzip'||!Number.isInteger(meta.width)||!Number.isInteger(meta.height)||meta.width<1||meta.height<1||meta.width*meta.height>4000000)throw new Error('formato no compatible');
        const numeric=await fetch(new URL(meta.file,base));if(!numeric.ok)throw new Error('datos no disponibles');
        let bytes=await numeric.arrayBuffer();
        if(new Uint8Array(bytes)[0]===31&&new Uint8Array(bytes)[1]===139){
          if(!window.DecompressionStream)throw new Error('actualiza el navegador para abrir los datos');
          bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        }
        if(bytes.byteLength!==meta.width*meta.height*4)throw new Error('descarga incompleta');
        heights=new Float32Array(bytes);
        if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1){const view=new DataView(bytes);heights=Float32Array.from({length:meta.width*meta.height},(_,i)=>view.getFloat32(i*4,true));}
        layer.options.bounds=L.latLngBounds([meta.bbox[1],meta.bbox[0]],[meta.bbox[3],meta.bbox[2]]);
        el('map-elevation-controls').dataset.state='ready';layer.redraw();
        if(active){legend.addTo(map);el('map-elevation-readout').textContent='Selecciona un punto para consultar su altura aproximada. Cobertura: Daule y alrededores.';}
      })().catch(error=>{
        heights=null;el('map-elevation-controls').dataset.state='error';
        el('map-elevation-readout').textContent='No se pudieron cargar las alturas: '+error.message+'. Las demás capas siguen disponibles.';
        el('map-elevation-retry').hidden=false;
      }).finally(()=>{loading=null;});return loading;
    }
    el('map-elevation-retry').addEventListener('click',load);
    return {layer,setActive(value){
      active=value;el('map-elevation-controls').hidden=!value;el('map-elevation-panel').hidden=!value;
      if(!value){legend.remove();if(marker){marker.remove();marker=null;}return;}
      if(heights){legend.addTo(map);el('map-elevation-readout').textContent='Selecciona un punto para consultar su altura aproximada.';}
      else load();
    },query(latlng){
      if(!active||!heights)return;
      const value=valueAt(latlng.lat,latlng.lng);
      if(marker)marker.remove();
      marker=L.circleMarker(latlng,{pane:'selection',interactive:false,radius:5,color:'#111827',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(map);
      const point=latlng.lat.toFixed(5)+', '+latlng.lng.toFixed(5);
      el('map-elevation-readout').textContent=value===null?point+' · Sin dato de altitud en este punto.':
        point+' · Altitud aproximada: '+Math.round(value).toLocaleString('es-EC')+' m sobre el nivel del mar (EGM2008). Modelo de superficie; no es profundidad de agua.';
    }};
  }};
})();
