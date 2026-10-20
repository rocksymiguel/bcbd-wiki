(() => {
  const header=document.getElementById('header');
  function observeHeader(){
    const nav=header?.querySelector('.site-header');if(!nav)return false;
    const measure=()=>document.documentElement.style.setProperty('--manual-header-offset',Math.ceil(nav.getBoundingClientRect().height+44)+'px');
    new ResizeObserver(measure).observe(nav);measure();return true;
  }
  if(!observeHeader()&&header){const observer=new MutationObserver(()=>{if(observeHeader())observer.disconnect();});observer.observe(header,{childList:true});}
  const toc=document.getElementById('manual-toc');
  const mobile=matchMedia('(max-width: 1000px)');
  if(toc)toc.open=false;
  toc?.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{if(mobile.matches)toc.open=false;}));
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
