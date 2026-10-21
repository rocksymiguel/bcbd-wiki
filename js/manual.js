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
    if(targets.length){
      let ticking=false;
      const update=()=>{
        ticking=false;
        const line=innerHeight*0.25;
        let active=0;
        targets.forEach((el,i)=>{if(el.getBoundingClientRect().top<=line)active=i;});
        links.forEach((link,i)=>{link.classList.toggle('is-active',i===active);if(i===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
      };
      addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}},{passive:true});
      update();
    }
  }
  // "Next chapter" floats in during the last stretch of the chapter, and steps aside when the pager itself is on screen.
  const nextFloat=document.querySelector('.manual-next-float');
  const pager=document.querySelector('.manual-pager');
  const article=document.getElementById('manual-content');
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
  const dialog=document.getElementById('manual-image-dialog');
  if(!dialog)return;
  const full=document.getElementById('manual-image-full');
  const original=document.getElementById('manual-image-original');
  let previousFocus,previousOverflow='';
  document.querySelectorAll('.manual-image').forEach(link=>link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();previousFocus=link;previousOverflow=document.body.style.overflow;
    full.src=link.href;full.alt=link.querySelector('img').alt;
    original.href=link.href;
    dialog.showModal();document.body.style.overflow='hidden';
  }));
  document.getElementById('manual-image-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    const rect=dialog.getBoundingClientRect();
    if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();
  });
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;full.removeAttribute('src');previousFocus?.focus({preventScroll:true});});
})();
