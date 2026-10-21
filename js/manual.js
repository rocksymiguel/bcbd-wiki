(() => {
  const header=document.getElementById('header');
  function observeHeader(){
    const nav=header?.querySelector('.site-header');if(!nav)return false;
    // On desktop the header is a side rail, so only the mobile top bar needs clearing.
    const desktop=matchMedia('(min-width: 1000px)');
    const measure=()=>document.documentElement.style.setProperty('--manual-header-offset',(desktop.matches?24:Math.ceil(nav.getBoundingClientRect().height+30))+'px');
    desktop.addEventListener('change',measure);
    new ResizeObserver(measure).observe(nav);measure();return true;
  }
  if(!observeHeader()&&header){const observer=new MutationObserver(()=>{if(observeHeader())observer.disconnect();});observer.observe(header,{childList:true});}
  // Reading progress and the last position live only in this browser.
  const progressKey='bcbd-wiki-manual-progress',lastKey='bcbd-wiki-manual-last';
  const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch(e){return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}};
  const article=document.getElementById('manual-content');
  const chapterPage=article?.dataset.chapter;

  // Overview: a bar per chapter and a way back to where reading stopped.
  const chapterLinks=document.querySelectorAll('.manual-chapters a[data-chapter]');
  if(chapterLinks.length){
    const progress=load(progressKey,{});
    chapterLinks.forEach(link=>{
      const read=(progress[link.dataset.chapter]||[]).length,total=Number(link.dataset.total);
      if(!read)return;
      const box=link.querySelector('.manual-chapter-progress');
      box.hidden=false;
      box.querySelector('.manual-chapter-bar span').style.width=Math.min(100,Math.round(read/total*100))+'%';
      box.querySelector('.manual-chapter-progress-text').textContent=read>=total?'Completado':`${read} de ${total} secciones`;
    });
    const last=load(lastKey,null),resume=document.querySelector('.manual-continue');
    if(last&&resume){
      resume.href=last.page+(last.id?'#'+encodeURIComponent(last.id):'');
      resume.querySelector('.manual-continue-chapter').textContent=`Capítulo ${last.n}: ${last.chapter}`;
      resume.querySelector('.manual-continue-section').textContent=last.section||'';
      resume.hidden=false;
    }
  }
  const toc=document.getElementById('manual-toc');
  // On phones the index is a sheet opened from its button; wider screens keep it as a column.
  const overlay=matchMedia('(max-width: 999.98px)');
  const tocKey='bcbd-wiki-manual-toc';
  let tocSaved=null;try{tocSaved=localStorage.getItem(tocKey);}catch(e){}
  if(toc){
    toc.open=!overlay.matches&&tocSaved!=='closed';
    toc.addEventListener('toggle',()=>{if(!overlay.matches){try{localStorage.setItem(tocKey,toc.open?'open':'closed');}catch(e){}}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.matches&&toc.open)toc.open=false;});
    document.addEventListener('click',event=>{if(overlay.matches&&toc.open&&!toc.contains(event.target))toc.open=false;});
    toc.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{if(overlay.matches)toc.open=false;}));
    // Mark the section being read: the last heading that has passed the top quarter of the screen.
    const links=[...toc.querySelectorAll('.manual-toc-sections a')];
    const targets=links.map(link=>document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(Boolean);
    const context=document.querySelector('.manual-context');
    const subtopics=[...document.querySelectorAll('#manual-content h3')].filter(h=>!h.closest('.manual-margin, .fire-concept-grid, .fire-phenomena, .fire-explainer'));
    // A section counts as read once the next one is reached, or the chapter's end is on screen.
    const progress=load(progressKey,{});
    const read=new Set(chapterPage?progress[chapterPage]||[]:[]);
    let lastActive=-1;
    const paint=()=>links.forEach((link,i)=>link.classList.toggle('is-read',read.has(targets[i]?.id)));
    if(targets.length){
      let ticking=false;
      const update=()=>{
        ticking=false;
        const line=innerHeight*0.25;
        let active=0;
        targets.forEach((el,i)=>{if(el.getBoundingClientRect().top<=line)active=i;});
        links.forEach((link,i)=>{link.classList.toggle('is-active',i===active);if(i===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
        if(chapterPage){
          const atEnd=innerHeight+scrollY>=document.documentElement.scrollHeight-80;
          let changed=false;
          targets.forEach((el,i)=>{if((i<active||atEnd)&&!read.has(el.id)){read.add(el.id);changed=true;}});
          if(changed){const all=load(progressKey,{});all[chapterPage]=[...read];save(progressKey,all);paint();}
          if(active!==lastActive&&targets[0].getBoundingClientRect().top<=line){
            lastActive=active;
            save(lastKey,{page:chapterPage,n:article.dataset.chapterN,chapter:article.dataset.chapterTitle,id:targets[active].id,section:links[active].textContent.trim()});
          }
        }
        // "Where am I": the section and the subtopic (h3) being read, once reading has started.
        if(context){
          const section=targets[active];
          let topic='';
          for(const h of subtopics){if(h.getBoundingClientRect().top>line)break;if(section.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING)topic=h.textContent.trim();}
          context.querySelector('.manual-context-num').textContent=String(active+1).padStart(2,'0');
          context.querySelector('.manual-context-section').textContent=links[active].textContent.trim();
          context.querySelector('.manual-context-topic').textContent=topic;
          context.classList.toggle('is-visible',targets[0].getBoundingClientRect().top<=line);
        }
      };
      addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}},{passive:true});
      paint();update();
    }
  }
  // "Next chapter" floats in during the last stretch of the chapter, and steps aside when the pager itself is on screen.
  const nextFloat=document.querySelector('.manual-next-float');
  const pager=document.querySelector('.manual-pager');
  if(nextFloat&&pager&&article){
    let pagerVisible=false;
    const show=()=>{
      const reached=article.getBoundingClientRect().bottom<innerHeight*3;
      const visible=reached&&!pagerVisible;
      nextFloat.classList.toggle('is-visible',visible);
      nextFloat.setAttribute('aria-hidden',String(!visible));
      nextFloat.tabIndex=visible?0:-1;
    };
    new IntersectionObserver(entries=>{pagerVisible=entries[0].isIntersecting;show();}).observe(pager);
    addEventListener('scroll',show,{passive:true});
    show();
  }
  document.querySelectorAll('[data-answer-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const answer=document.getElementById(button.getAttribute('aria-controls'));
    if(!answer)return;
    const show=answer.hidden;
    answer.hidden=!show;
    button.setAttribute('aria-expanded',String(show));
    button.textContent=show?'Ocultar':'Mostrar';
  }));
  // Diagrams: touching a piece shows its explanation; the tetrahedron switch adds the chain reaction.
  document.querySelectorAll('.fire-diagram').forEach(fig=>{
    const nodes=[...fig.querySelectorAll('[data-show]')],details=[...fig.querySelectorAll('[data-detail]')],hint=fig.querySelector('.fire-diagram-hint');
    const select=id=>{
      nodes.forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.show===id)));
      details.forEach(d=>{d.hidden=d.dataset.detail!==id;});
      if(hint)hint.hidden=!!id;
    };
    nodes.forEach(n=>{n.setAttribute('aria-pressed','false');n.addEventListener('click',()=>select(n.getAttribute('aria-pressed')==='true'?null:n.dataset.show));});
    const modes=[...fig.querySelectorAll('[data-tetra-mode]')];
    modes.forEach(b=>b.addEventListener('click',()=>{
      fig.dataset.mode=b.dataset.tetraMode;
      modes.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
      const core=fig.querySelector('.fire-tetra-only');
      if(b.dataset.tetraMode==='tetra')select(core?.dataset.show||null);
      else if(core?.getAttribute('aria-pressed')==='true')select(null);
    }));
    // The heat's way back is traced once, the first time the cycle comes into view.
    if(fig.classList.contains('fire-cycle')&&'IntersectionObserver' in window){
      const io=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){fig.classList.add('is-drawn');io.disconnect();}},{threshold:.4});
      io.observe(fig);
    }
  });
  // Ladder: the base distance sets the angle; NIOSH's target is 75.5° within 2°.
  document.querySelectorAll('[data-ladder]').forEach(fig=>{
    const input=fig.querySelector('input[type="range"]'),rail=fig.querySelector('.dg-ladder-rail');
    const wall=+fig.dataset.wall,ground=+fig.dataset.ground,length=+fig.dataset.length;
    const angleOut=fig.querySelector('[data-out="angle"]'),ratioOut=fig.querySelector('[data-out="ratio"]'),status=fig.querySelector('.dg-status');
    const update=()=>{
      const share=input.value/100,base=share*length,angle=Math.acos(share)*180/Math.PI;
      rail.setAttribute('x1',wall-base);rail.setAttribute('y1',ground);
      rail.setAttribute('x2',wall);rail.setAttribute('y2',ground-Math.sqrt(length*length-base*base));
      angleOut.textContent=angle.toFixed(1).replace('.',',')+'°';
      ratioOut.textContent='largo ÷ '+(1/share).toFixed(1).replace('.',',');
      const ok=Math.abs(angle-75.5)<=2;
      status.dataset.ok=String(ok);
      status.textContent=ok?'Cerca de 75°: ángulo correcto.':angle>75.5?'Demasiado parada: puede caer hacia atrás.':'Demasiado acostada: la base puede resbalar.';
      input.setAttribute('aria-valuetext',`${angleOut.textContent}, ${status.textContent}`);
    };
    input.addEventListener('input',update);update();
  });
  const dialog=document.getElementById('manual-image-dialog');
  if(!dialog)return;
  const full=document.getElementById('manual-image-full');
  const original=document.getElementById('manual-image-original');
  const images=[...document.querySelectorAll('.manual-image')];
  const title=document.getElementById('manual-image-title'),count=document.getElementById('manual-image-count');
  const prevButton=document.getElementById('manual-image-prev'),nextButton=document.getElementById('manual-image-next');
  let previousFocus,previousOverflow='',current=0;
  const showImage=i=>{
    current=Math.max(0,Math.min(images.length-1,i));
    const link=images[current],img=link.querySelector('img');
    full.src=link.href;full.alt=img.alt;original.href=link.href;
    title.textContent=img.alt?img.alt.charAt(0).toUpperCase()+img.alt.slice(1):'Imagen del manual';
    if(count)count.textContent=`${current+1} / ${images.length}`;
    if(prevButton)prevButton.disabled=current===0;
    if(nextButton)nextButton.disabled=current===images.length-1;
  };
  images.forEach((link,i)=>link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();previousFocus=link;previousOverflow=document.body.style.overflow;
    showImage(i);
    dialog.showModal();document.body.style.overflow='hidden';
  }));
  prevButton?.addEventListener('click',()=>showImage(current-1));
  nextButton?.addEventListener('click',()=>showImage(current+1));
  dialog.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();showImage(current-1);}
    if(event.key==='ArrowRight'){event.preventDefault();showImage(current+1);}
  });
  let touchX=null;
  dialog.addEventListener('touchstart',event=>{touchX=event.touches[0].clientX;},{passive:true});
  dialog.addEventListener('touchend',event=>{
    if(touchX===null)return;
    const dx=event.changedTouches[0].clientX-touchX;touchX=null;
    if(Math.abs(dx)>50)showImage(current+(dx<0?1:-1));
  });
  document.getElementById('manual-image-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    const rect=dialog.getBoundingClientRect();
    if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();
  });
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;full.removeAttribute('src');previousFocus?.focus({preventScroll:true});});
})();
