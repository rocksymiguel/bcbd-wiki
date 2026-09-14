document.addEventListener('DOMContentLoaded', () => {
  const cardsContainer = document.getElementById('cards');

  const sections = [
    { title: 'Institución', href: 'institucion/index.html', desc: 'Misión, visión y estructura institucional.' },
    { title: 'Áreas Operativas y Brigadas', href: 'brigadas/index.html', desc: 'Incendios estructurales y áreas de especialización operativa.' },
    { title: 'Operaciones', href: 'operaciones/index.html', desc: 'Procedimientos operativos y tácticas.' },
    { title: 'Sistema de Comando de Incidentes', href: 'sistema-de-comando-de-incidentes/index.html', desc: 'Estructura de mando y coordinación en incidentes.' },
    { title: 'Recursos Operativos', href: 'recursos-operativos/index.html', desc: 'Equipos, vehículos y recursos disponibles.' },
    { title: 'Instrucción Formal', href: 'instruccion-formal/index.html', desc: 'Cursos, formación y certificaciones para aspirantes.' }
  ];

  function createCard(s) {
    const a = document.createElement('a');
    a.className = 'card minimal';
    a.href = s.href;
    a.setAttribute('aria-label', s.title + ' — ' + s.desc);

    const icon = document.createElement('div');
    icon.className = 'card-icon';
    icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/></svg>';

    const h = document.createElement('h3');
    h.textContent = s.title;

    const p = document.createElement('p');
    p.textContent = s.desc;

    a.appendChild(icon);
    a.appendChild(h);
    a.appendChild(p);

    return a;
  }

  sections.forEach(s => cardsContainer.appendChild(createCard(s)));
});
