// Export the Obsidian source to a static manual page. The vault is read-only;
// Chapters with a template are presented as structured lessons; the rest as a direct transcription.
// Requires marked 17.x at build time only (NODE_PATH can locate bundled packages).
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {Marked}=require('marked');
const root=path.resolve(__dirname,'../..');
const sourceDir=path.resolve(process.argv[2]||'O:/obsidian-vault/rocksymiguel/BCBD Wiki/Material de estudio/Bomberos I');
const output=path.join(root,'material-de-estudio/bomberos-i');
const sourceFile=path.join(sourceDir,'Manual Bomberos I.md');
const bytes=fs.readFileSync(sourceFile);
const source=bytes.toString('utf8');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const slug=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const encode=s=>s.split('/').map(encodeURIComponent).join('/');
const marked=new Marked({gfm:true,breaks:false});
const original=marked.lexer(source);
const headings=[];
marked.walkTokens(original,token=>{if(token.type==='heading')headings.push(token);});
const targets=new Map(),used=new Map(),stack=[];
for(const heading of headings){
  stack.length=heading.depth-1;stack.push(heading.text);
  const names=stack.filter(Boolean),full=names.slice(1).join('#')||names[0];
  const base=names.slice(1).map(slug).join('--')||slug(names[0]);
  const count=(used.get(base)||0)+1;used.set(base,count);
  heading.manualId=base+(count>1?'-'+count:'');
  targets.set(full,heading.manualId);
  if(!targets.has(heading.text))targets.set(heading.text,heading.manualId);
}
// Each chapter becomes its own page; its headings link there. Chapters with a long title get a short address.
const shortPages={'equipo-de-proteccion-personal-y-equipo-de-respiracion-autonoma':'epp-y-era'};
const pageFile=id=>(shortPages[id]||id)+'.html';
const pageOf=new Map();
{let current='index.html',seenIndex=false;
  for(const h of headings){
    if(h.depth===2){if(h.text==='Índice')seenIndex=true;else if(seenIndex)current=pageFile(h.manualId);}
    pageOf.set(h.manualId,current);
  }}
const imports=new Map();
function importFile(relative){
  assert(/^(Attachment|Reference)\//.test(relative),'Unexpected vault reference: '+relative);
  const input=path.resolve(sourceDir,relative),dest=path.resolve(output,relative);
  assert(input.startsWith(sourceDir+path.sep)&&dest.startsWith(output+path.sep),'Unsafe asset path');
  if(!imports.has(relative)){
    const data=fs.readFileSync(input);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.copyFileSync(input,dest);
    assert.equal(hash(fs.readFileSync(dest)),hash(data),'Asset copy mismatch: '+relative);
    const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    imports.set(relative,{path:relative,bytes:data.length,sha256:hash(data),...(png?{width:data.readUInt32BE(16),height:data.readUInt32BE(20)}:{})});
  }
  return imports.get(relative);
}
let imageCount=0;
const converted=source.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,relative,width)=>{
  const image=importFile(relative);imageCount++;
  assert(image.width&&image.height,'Expected a PNG illustration: '+relative);
  const size=/^\d+$/.test(width||'')?width:'700';
  const label=relative.split('/').pop().replace(/\.png$/i,'').replace(/^p\d+-/,'').replaceAll('-',' ');
  const url=escape(encode(relative));
  return `<a class="manual-image" href="${url}" style="--image-width:${size}px" aria-label="Ampliar imagen: ${escape(label)}"><img src="${url}" alt="${escape(label)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async"></a>`;
}).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,target,label)=>{
  let url;
  if(target.startsWith('#')){
    const id=targets.get(target.slice(1));
    assert(id,'Unresolved manual heading: '+target);
    url=pageOf.get(id)+'#'+id;
  }else{importFile(target);url=encode(target);}
  return `<a href="${escape(url)}">${escape(label||target.replace(/^#/,''))}</a>`;
});
const tokens=marked.lexer(converted);
let cursor=0;
marked.walkTokens(tokens,token=>{
  if(token.type==='heading'){
    const originalHeading=headings[cursor++];
    assert.equal(token.text,originalHeading.text);
    token.manualId=originalHeading.manualId;
  }
});
assert.equal(cursor,headings.length);
// Headings render one level up inside a chapter page, whose title is the page's h1.
let depthShift=0;
marked.use({renderer:{heading(token){const d=Math.max(1,token.depth-depthShift);return `<h${d} id="${token.manualId}">${this.parser.parseInline(token.tokens)}</h${d}>\n`;}}});
const indexStart=tokens.findIndex(t=>t.type==='heading'&&t.depth===2&&t.text==='Índice');
const chapterStarts=tokens.map((t,i)=>t.type==='heading'&&t.depth===2&&i>indexStart?i:-1).filter(i=>i>=0);
assert(indexStart>0&&chapterStarts.length===9);
const title=tokens[0].text;
const intro=marked.parser(tokens.slice(1,indexStart));
const chapters=chapterStarts.map((start,n)=>{
  const end=chapterStarts[n+1]??tokens.length;
  return {n:n+1,title:tokens[start].text,id:tokens[start].manualId,page:pageFile(tokens[start].manualId),start,end};
});
assert.deepEqual(chapters.map(c=>c.title),headings.filter(h=>h.depth===2&&h.text!=='Índice').map(h=>h.text));

// Chapters with a template (<chapter-id>.html here) follow the brochure's sections (###) as their backbone,
// each one placed once and in order; the template adds the expansion around them. `omit` lists brochure
// sections a template replaces with its own material. The rest stay as a direct transcription.
const templates={'teoria-del-fuego':{omit:['Guía didáctica complementaria']},'herramientas-y-equipos':{},'equipo-de-proteccion-personal-y-equipo-de-respiracion-autonoma':{},'abastecimiento-de-agua':{},'escaleras-portatiles':{}};
const templated=[];
depthShift=1;
for(const c of chapters){
  const template=templates[c.id];
  if(!template){c.html=marked.parser(tokens.slice(c.start+1,c.end));continue;}
  const sections=new Map();
  for(let i=c.start+1;i<c.end;){
    if(tokens[i].type!=='heading'||tokens[i].depth!==3){assert(sections.size||tokens[i].type==='space','Content before the first section of '+c.title);i++;continue;}
    const start=i,name=tokens[i].text;
    let end=i+1;
    while(end<c.end&&!(tokens[end].type==='heading'&&tokens[end].depth<=3))end++;
    if(!(template.omit||[]).includes(name))sections.set(name,{id:tokens[start].manualId,html:marked.parser(tokens.slice(start+1,end))});
    i=end;
  }
  const html=fs.readFileSync(path.join(__dirname,c.id+'.html'),'utf8');
  const placed=[...html.matchAll(/\{\{SOURCE:([^}]+)\}\}/g)].map(m=>m[1]);
  assert.deepEqual(placed,[...sections.keys()],`${c.title}: the template must place every brochure section once, in its original order`);
  c.html=html.replace(/\{\{(SOURCE|ID):([^}]+)\}\}/g,(_,kind,name)=>{
    assert(sections.has(name),`Missing ${c.title} source section: ${name}`);
    return kind==='ID'?sections.get(name).id:sections.get(name).html;
  });
  templated.push(`${c.title} (${sections.size})`);
}
depthShift=0;

const stripTags=s=>s.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>');
for(const c of chapters)c.minutes=Math.max(1,Math.round(stripTags(c.html).split(/\s+/).filter(Boolean).length/200));
for(const c of chapters)c.sections=[...c.html.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map(m=>({id:m[1],text:stripTags(m[2])}));

const pdf=importFile('Reference/Manual - Bomberos I.pdf');
const pdfURL=encode(pdf.path);
const pdfSize=(pdf.bytes/1024/1024).toFixed(1).replace('.',',');
const num=n=>String(n).padStart(2,'0');
const arrowIcon=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// Right-hand index: every chapter, with the current one expanded to its sections.
const renderToc=current=>`<ol class="manual-toc-chapters">${chapters.map(c=>`<li${c===current?' class="is-current"':''}><a href="${c.page}"${c===current?' aria-current="page"':''}><span class="manual-toc-num">${num(c.n)}</span><span>${escape(c.title)}</span></a>${c===current&&c.sections.length?`<ol class="manual-toc-sections">${c.sections.map(s=>`<li><a href="#${escape(s.id)}">${escape(s.text)}</a></li>`).join('')}</ol>`:''}</li>`).join('')}</ol>`;

const page=({docTitle,crumbs,body,script=''})=>`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(docTitle)} | Material de estudio | BCBD Wiki</title>
  <link rel="stylesheet" href="../../css/styles.css">
  <link rel="stylesheet" href="../../css/manual.css">
</head>
<body class="manual-page">
  <a class="manual-skip" href="#manual-content">Ir al contenido</a>
  <div id="header"></div>
  <main id="main-content">
    <nav class="manual-breadcrumb" aria-label="Ubicación">${crumbs}</nav>
${body}
  </main>
  <div id="footer"></div>
  <dialog id="manual-image-dialog" class="manual-lightbox" aria-labelledby="manual-image-title">
    <div class="manual-lightbox-head"><h2 id="manual-image-title">Imagen del manual</h2><span id="manual-image-count" class="manual-lightbox-count" aria-live="polite"></span><button id="manual-image-prev" class="manual-lightbox-nav" type="button" aria-label="Lámina anterior">${arrowIcon('M15 6l-6 6 6 6')}</button><button id="manual-image-next" class="manual-lightbox-nav" type="button" aria-label="Lámina siguiente">${arrowIcon('M9 6l6 6-6 6')}</button><button id="manual-image-close" type="button" aria-label="Cerrar imagen">×</button></div>
    <div class="manual-lightbox-body"><img id="manual-image-full" alt=""></div>
    <a id="manual-image-original" target="_blank" rel="noopener">Abrir imagen original</a>
  </dialog>
  <script src="../../js/layout.js"></script>
  <script src="../../js/manual.js"></script>${script}
</body>
</html>
`;

fs.mkdirSync(output,{recursive:true});
fs.rmSync(path.join(output,'manual.md'),{force:true});
const crumbRoot='<a href="../index.html">Material de estudio</a><span aria-hidden="true">/</span>';
const written=new Map();

// Overview: what the manual is, the PDF, and the chapters as the way in.
const overview=`    <header class="manual-hero">
      <div><p class="manual-eyebrow">Material de estudio</p><h1 id="${headings[0].manualId}">${escape(title)}</h1>${intro}<p class="manual-meta">9 capítulos · ${imageCount} ilustraciones · Transcripción con imágenes</p></div>
      <a class="manual-download" href="${pdfURL}" download="Manual - Bomberos I.pdf">Descargar PDF original <small>${pdfSize} MiB · Documento escaneado</small></a>
    </header>
    <section id="manual-content" class="manual-chapters" aria-labelledby="capitulos">
      <a class="manual-continue" href="index.html" hidden><span><small>Continuar donde quedaste</small><strong class="manual-continue-chapter"></strong><span class="manual-continue-section"></span></span>${arrowIcon('M5 12h14M13 6l6 6-6 6')}</a>
      <h2 id="capitulos">Capítulos</h2>
      <ol>${chapters.map(c=>`<li><a href="${c.page}" data-chapter="${c.page}" data-total="${c.sections.length}"><span class="manual-chapter-num">${num(c.n)}</span><span class="manual-chapter-body"><strong>${escape(c.title)}</strong><small>${c.sections.length} secciones · ≈ ${c.minutes} min de lectura</small><span class="manual-chapter-progress" hidden><span class="manual-chapter-bar"><span></span></span><span class="manual-chapter-progress-text"></span></span></span></a></li>`).join('')}</ol>
    </section>`;
// Links written before the split pointed at #anchors of the single page; send them to their chapter.
const legacy=Object.fromEntries(headings.filter(h=>pageOf.get(h.manualId)!=='index.html').map(h=>[h.manualId,pageOf.get(h.manualId)]));
// Renamed chapters (old id → new id) keep a page at their old address that forwards there, anchors included.
const renamed={'equipo-de-respiracion-autonoma':'equipo-de-proteccion-personal-y-equipo-de-respiracion-autonoma'};
for(const [from,to] of Object.entries(renamed)){
  assert(chapters.some(c=>c.id===to),'Renamed chapter not found: '+to);
  for(const h of headings)if(h.manualId===to||h.manualId.startsWith(to+'--'))legacy[from+h.manualId.slice(to.length)]=pageFile(from);
}
const legacyScript=`\n  <script>(function(){var m=${JSON.stringify(legacy)};var id=decodeURIComponent(location.hash.slice(1));if(m[id])location.replace(m[id]+location.hash);})();</script>`;
written.set('index.html',page({docTitle:title,crumbs:crumbRoot+`<span>${escape(title)}</span>`,body:overview,script:legacyScript}));
for(const [from,to] of Object.entries(renamed)){
  const target=pageFile(to);
  written.set(pageFile(from),`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>Página movida · ${escape(title)}</title>
  <link rel="canonical" href="${target}">
  <script>(function(){var h=decodeURIComponent(location.hash.slice(1));if(h.indexOf(${JSON.stringify(from)})===0)h=${JSON.stringify(to)}+h.slice(${from.length});location.replace(${JSON.stringify(target)}+(h?'#'+h:''));})();</script>
  <meta http-equiv="refresh" content="0; url=${target}">
</head>
<body><p>Este capítulo cambió de dirección: <a href="${target}">${escape(chapters.find(c=>c.id===to).title)}</a>.</p></body>
</html>
`);
}

for(const c of chapters){
  const prev=chapters[c.n-2],next=chapters[c.n];
  const arrow=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const pager=`<nav class="manual-pager" aria-label="Capítulos">${prev?`<a class="manual-pager-prev" href="${prev.page}">${arrow('M19 12H5M11 6l-6 6 6 6')}<span><small>Capítulo anterior</small><strong>${escape(prev.title)}</strong></span></a>`:'<span></span>'}${next?`<a class="manual-pager-next" href="${next.page}"><span><small>Siguiente capítulo</small><strong>${escape(next.title)}</strong></span>${arrow('M5 12h14M13 6l6 6-6 6')}</a>`:`<a class="manual-pager-next" href="index.html"><span><small>Terminaste el manual</small><strong>Volver a los capítulos</strong></span>${arrow('M5 12h14M13 6l6 6-6 6')}</a>`}</nav>`;
  const body=`    <header class="manual-chapter-opener">
      <span class="reflective-stripe" aria-hidden="true"></span>
      <p class="manual-chapter-count">Capítulo ${c.n} de ${chapters.length}</p>
      <h1 id="${c.id}">${escape(c.title)}</h1>
      <p class="manual-meta">${c.sections.length} secciones · ≈ ${c.minutes} min de lectura · <a href="${pdfURL}" download="Manual - Bomberos I.pdf">PDF original (${pdfSize} MiB)</a></p>
    </header>
    <div class="manual-layout">
      <article id="manual-content" class="manual-content" aria-labelledby="${c.id}" data-chapter="${c.page}" data-chapter-n="${c.n}" data-chapter-title="${escape(c.title)}"><div class="manual-context" aria-hidden="true"><span class="manual-context-num"></span><span class="manual-context-section"></span><span class="manual-context-topic"></span></div>${c.html}${pager}</article>
      <aside class="manual-sidebar" aria-label="Índice del manual">
        <details id="manual-toc"><summary><span class="manual-toc-title">Índice</span></summary><nav aria-label="Capítulos y secciones">${renderToc(c)}</nav></details>
      </aside>
    </div>
    <a class="manual-next-float" href="${next?next.page:'index.html'}" aria-hidden="true" tabindex="-1"><span><small>${next?'Siguiente capítulo':'Terminaste el manual'}</small><strong>${escape(next?next.title:'Volver a los capítulos')}</strong></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>`;
  written.set(c.page,page({docTitle:`${c.title} · ${title}`,crumbs:crumbRoot+`<a href="index.html">${escape(title)}</a><span aria-hidden="true">/</span><span>Capítulo ${c.n}</span>`,body}));
}

// Every in-manual link must land on an id that exists on its target page.
for(const [file,html] of written){
  for(const m of html.matchAll(/href="([^"#:]*\.html)?#([^"]+)"/g)){
    const target=m[1]||file;
    if(!written.has(target))continue;
    assert(written.get(target).includes(`id="${m[2]}"`),`Broken link in ${file}: ${m[1]||''}#${m[2]}`);
  }
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'Duplicate ids in '+file);
  fs.writeFileSync(path.join(output,file),html);
}
const manifest={chapters:chapters.map(c=>({n:c.n,title:c.title,id:c.id,page:c.page,sections:c.sections.length})),headings:headings.length,imageCount,assets:[...imports.values()]};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
assert.equal(hash(fs.readFileSync(sourceFile)),hash(bytes),'The source vault must remain unchanged');
console.log(`Exported ${chapters.length} chapter pages plus the overview, ${imageCount} images, ${headings.length} source headings; all internal links resolved. Templated chapters follow the brochure's sections: ${templated.join(', ')}; the vault was not modified.`);
