document.addEventListener('DOMContentLoaded', () => {
  const cardsContainer = document.getElementById('cards');

  const sections = [
    { title: 'Institución', href: 'institucion/index.html', desc: 'Misión, visión y estructura institucional.', links: [['Misión y visión', 'institucion/index.html'], ['Estructura organizacional', 'institucion/index.html'], ['Funciones y roles', 'institucion/index.html'], ['Historia y evolución', 'historia/index.html']] },
    { title: 'Áreas operativas', href: 'brigadas/index.html', desc: 'Incendios estructurales y áreas de especialización operativa.', links: [['Incendios estructurales', 'brigadas/incendios-estructurales/index.html'], ['Atención prehospitalaria', 'brigadas/aph/index.html'], ['Rescate vehicular', 'brigadas/r-vehicular/index.html'], ['Rescate acuático', 'brigadas/r-acuatico/index.html'], ['Incendios forestales', 'brigadas/i-forestal/index.html'], ['División apícola', 'brigadas/d-apicola/index.html']] },
    { title: 'Recursos', href: 'recursos-operativos/index.html', desc: 'Equipos, vehículos y recursos disponibles.', links: [['Equipos de protección personal', 'recursos-operativos/epp/index.html'], ['Herramientas y equipamiento', 'recursos-operativos/herramientas-equipamiento/index.html'], ['Vehículos y unidades', 'recursos-operativos/unidades/index.html'], ['Sistemas y apoyo logístico', 'recursos-operativos/sistemas-logistico/index.html'], ['Infraestructura operativa', 'recursos-operativos/infraestructura/index.html']] }
  ];

  function createCard(s) {
    const a = document.createElement('article');
    a.className = 'home-column';

    const icon = document.createElement('div');
    icon.className = 'home-column-icon';
    icon.textContent = s.title === 'Institución' ? '▣' : s.title === 'Áreas operativas' ? '♨' : '◉';

    const h = document.createElement('h3');
    h.textContent = s.title;

    const p = document.createElement('p');
    p.textContent = s.desc;

    const head = document.createElement('div');
    head.className = 'home-column-head';
    head.appendChild(icon);
    const text = document.createElement('div');
    text.appendChild(h);
    text.appendChild(p);
    head.appendChild(text);
    a.appendChild(head);

    const list = document.createElement('div');
    list.className = 'home-column-links';
    s.links.forEach(([label, href]) => {
      const link = document.createElement('a');
      link.href = href;
      link.innerHTML = `<span>${label}</span><span aria-hidden="true">›</span>`;
      list.appendChild(link);
    });
    a.appendChild(list);

    const all = document.createElement('a');
    all.className = 'home-column-all';
    all.href = s.href;
    all.textContent = `Ver todo en ${s.title} →`;
    a.appendChild(all);

    return a;
  }

  sections.forEach(s => cardsContainer.appendChild(createCard(s)));
});
