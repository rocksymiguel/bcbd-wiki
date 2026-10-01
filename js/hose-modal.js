// Keep Three.js and its GPU context lazy: opening the dialog starts the viewer.
(() => {
  const dialog = document.getElementById('hose-dialog');
  const opener = document.getElementById('hose-open');
  const status = document.getElementById('hose-status');
  let viewer;
  let pending;
  let previousOverflow;
  opener.addEventListener('click', async () => {
    if (typeof dialog.showModal !== 'function') {
      alert('Este visor necesita un navegador actualizado compatible con ventanas de diálogo.');
      return;
    }
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    document.getElementById('hose-close').focus();
    if (viewer) { viewer.resume(); return; }
    if (!pending) {
      status.hidden = false;
      status.textContent = 'Cargando modelo 3D…';
      pending = import('./hose-viewer.js?v=20260930b').then(module => module.createHoseViewer(dialog));
    }
    try {
      viewer = await pending;
      if (dialog.open) viewer.resume();
    } catch (error) {
      console.error('Visor de acoples:', error);
      status.hidden = false;
      status.textContent = 'No se pudo abrir el 3D. Comprueba la conexión y que tu navegador permita WebGL. Cierra y vuelve a abrir para reintentar.';
      document.getElementById('hose-viewport').setAttribute('aria-busy', 'false');
      pending = null;
    }
  });
  document.getElementById('hose-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow || '';
    viewer?.pause();
    opener.focus({preventScroll:true});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) viewer?.pause();
    else if (dialog.open) viewer?.resume();
  });
})();
