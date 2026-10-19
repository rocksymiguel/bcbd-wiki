// Export the Obsidian source to a static manual page. The vault is read-only;
// the fire-theory chapter is presented as a structured lesson, not as a raw MD.
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
    url='#'+id;
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
marked.use({renderer:{heading(token){return `<h${token.depth} id="${token.manualId}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;}}});
const indexStart=tokens.findIndex(t=>t.type==='heading'&&t.depth===2&&t.text==='Índice');
const firstChapter=tokens.findIndex((t,i)=>i>indexStart&&t.type==='heading'&&t.depth===2);
assert(indexStart>0&&firstChapter>indexStart);
const title=tokens[0].text;
const intro=marked.parser(tokens.slice(1,indexStart));
const chapters=headings.filter(h=>h.depth===2&&h.text!=='Índice');
assert.equal(chapters.length,9);
const secondChapter=tokens.findIndex((t,i)=>i>firstChapter&&t.type==='heading'&&t.depth===2);
assert(secondChapter>firstChapter);
const sourceSections=new Map();
for(let i=firstChapter+1;i<secondChapter;){
  if(tokens[i].type!=='heading'||tokens[i].depth!==3){i++;continue;}
  const start=i,name=tokens[i].text;
  let end=i+1;
  while(end<secondChapter&&!(tokens[end].type==='heading'&&tokens[end].depth<=3))end++;
  sourceSections.set(name,marked.parser(tokens.slice(start,end)));
  i=end;
}
const theoryTemplate=fs.readFileSync(path.join(__dirname,'teoria-del-fuego.html'),'utf8');
const theoryHtml=theoryTemplate.replace(/\{\{SOURCE:([^}]+)\}\}/g,(_,name)=>{
  assert(sourceSections.has(name),'Missing theory source section: '+name);
  return sourceSections.get(name);
});
assert(!/\{\{SOURCE:/.test(theoryHtml),'Unexpanded theory source placeholder');
const theoryToc=`<ul>
<li><a href="#teoria-del-fuego">Teoría del fuego</a><ul>
<li><a href="#energia-calor-combustion">Energía, calor y temperatura</a></li>
<li><a href="#combustion-y-componentes">Combustión y componentes</a></li>
<li><a href="#combustibles-mezclas-fuentes">Combustibles, mezclas y fuentes de energía</a></li>
<li><a href="#transferencia-de-calor">Transferencia de calor</a></li>
<li><a href="#incendio-en-recinto">Desarrollo, humo, capas y presión</a></li>
<li><a href="#fenomenos-y-condiciones-especiales">Transiciones y condiciones especiales</a></li>
<li><a href="#repaso-teoria-fuego">Repaso rápido</a></li>
</ul></li></ul>`;
const remainingItems=[];
const tocStack=[{depth:1,children:remainingItems}];
for(const heading of headings.slice(headings.indexOf(chapters[1]))){
  if(heading.depth<2||heading.depth>6)continue;
  while(tocStack.at(-1).depth>=heading.depth)tocStack.pop();
  const item={text:heading.text,id:heading.manualId,children:[]};
  tocStack.at(-1).children.push(item);
  tocStack.push({depth:heading.depth,children:item.children});
}
const renderToc=items=>`<ul>${items.map(item=>`<li><a href="#${escape(item.id)}">${escape(item.text)}</a>${item.children.length?renderToc(item.children):''}</li>`).join('')}</ul>`;
const remainingToc=renderToc(remainingItems);
const courseToc=theoryToc+remainingToc;
const article=theoryHtml+marked.parser(tokens.slice(secondChapter));
const pdf=importFile('Reference/Manual - Bomberos I.pdf');
const pdfURL=encode(pdf.path);
const pdfSize=(pdf.bytes/1024/1024).toFixed(1).replace('.',',');
fs.mkdirSync(output,{recursive:true});
fs.rmSync(path.join(output,'manual.md'),{force:true});
const html=`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(title)} | Material de estudio | BCBD Wiki</title>
  <link rel="stylesheet" href="../../css/styles.css">
  <link rel="stylesheet" href="../../css/manual.css">
</head>
<body class="manual-page">
  <a class="manual-skip" href="#manual-content">Ir al contenido del manual</a>
  <div id="header"></div>
  <main id="main-content">
    <nav class="manual-breadcrumb" aria-label="Ubicación"><a href="../index.html">Material de estudio</a><span aria-hidden="true">/</span><span>${escape(title)}</span></nav>
    <header class="manual-hero">
      <div><p class="manual-eyebrow">Material de estudio</p><h1 id="${headings[0].manualId}">${escape(title)}</h1>${intro}<p class="manual-meta">9 capítulos · ${imageCount} ilustraciones · Transcripción con imágenes</p></div>
      <a class="manual-download" href="${pdfURL}" download="Manual - Bomberos I.pdf">Descargar PDF original <small>${pdfSize} MiB · Documento escaneado</small></a>
    </header>
    <div class="manual-layout">
      <aside class="manual-sidebar" aria-label="Índice del manual">
        <details id="manual-toc"><summary><h2 id="${headings.find(h=>h.text==='Índice').manualId}">Índice</h2></summary><nav aria-label="Capítulos y subtemas">${courseToc}</nav></details>
        <a class="manual-back-top" href="#${headings[0].manualId}">Volver al inicio ↑</a>
      </aside>
      <article id="manual-content" class="manual-content" aria-label="Contenido completo del Manual Bomberos I">${article}</article>
    </div>
  </main>
  <div id="footer"></div>
  <dialog id="manual-image-dialog" class="manual-lightbox" aria-labelledby="manual-image-title">
    <div class="manual-lightbox-head"><h2 id="manual-image-title">Imagen del manual</h2><button id="manual-image-close" type="button" aria-label="Cerrar imagen">×</button></div>
    <div class="manual-lightbox-body"><img id="manual-image-full" alt=""></div>
    <a id="manual-image-original" target="_blank" rel="noopener">Abrir imagen original</a>
  </dialog>
  <script src="../../js/layout.js"></script>
  <script src="../../js/manual.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(output,'index.html'),html);
const manifest={chapters:chapters.map(h=>({title:h.text,id:h.manualId})),headings:headings.length,imageCount,assets:[...imports.values()]};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
assert.equal(hash(fs.readFileSync(sourceFile)),hash(bytes),'The source vault must remain unchanged');
console.log(`Exported ${chapters.length} chapters, ${imageCount} images, ${headings.length} source headings; all internal references resolved. The fire-theory chapter is integrated into a guided lesson, no Markdown file is published, and the vault was not modified.`);
