var isGitHub = window.location.hostname.includes("github.io");

// Public Pages never connects to LAN databases or enables registration.
// This HTTPS gateway exposes only the VM's read-only environment connector.
window.BCBD_PUBLIC_ACCESS = Object.freeze({
  readOnly: isGitHub,
  environmentOrigin: 'https://bcbd-wiki.tail4eb990.ts.net'
});

var basePath = isGitHub
  ? "/bcbd-wiki/"
  : "/";

// Theme: follow the device until the visitor picks light or dark; that choice
// is remembered in this browser.
var themeStorageKey = 'bcbd-wiki-theme';
var systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
var themePreference = null;

function readStored(key, allowed) {
  try {
    var value = window.localStorage.getItem(key);
    return allowed.indexOf(value) !== -1 ? value : null;
  } catch (error) {
    return null;
  }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch (error) { /* Storage can be unavailable. */ }
}

function activeTheme() {
  return themePreference || (systemThemeQuery.matches ? 'dark' : 'light');
}

function updateThemeToggle() {
  var toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;
  var isDark = activeTheme() === 'dark';
  toggle.setAttribute('aria-label', isDark ? 'Usar modo claro' : 'Usar modo oscuro');
  toggle.setAttribute('title', isDark ? 'Usar modo claro' : 'Usar modo oscuro');
}

function applyTheme() {
  document.documentElement.dataset.theme = activeTheme();
  updateThemeToggle();
}

function initializeTheme() {
  themePreference = readStored(themeStorageKey, ['light', 'dark']);
  applyTheme();
  var onSystemThemeChange = function () { if (!themePreference) applyTheme(); };
  if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener('change', onSystemThemeChange);
  else if (systemThemeQuery.addListener) systemThemeQuery.addListener(onSystemThemeChange);
}

initializeTheme();

// Sidebar: compact (icons only) or expanded. Without a saved choice, reading-heavy
// and map pages start compact so their content gets the width.
var sidebarStorageKey = 'bcbd-wiki-sidebar';

function sidebarIsCompact() {
  var saved = readStored(sidebarStorageKey, ['compact', 'expanded']);
  if (saved) return saved === 'compact';
  return !!document.body && (document.body.classList.contains('manual-page') || document.body.classList.contains('map-page'));
}

function applySidebar(compact) {
  document.documentElement.classList.toggle('sidebar-compact', compact);
  var button = document.querySelector('.sidebar-collapse');
  if (button) {
    button.setAttribute('aria-pressed', String(compact));
    button.setAttribute('aria-label', compact ? 'Expandir menú' : 'Compactar menú');
    var label = button.querySelector('.nav-label');
    if (label) label.textContent = compact ? 'Expandir menú' : 'Compactar menú';
  }
  // Labels are hidden in compact mode, so links expose them as tooltips.
  document.querySelectorAll('#header .site-nav a, .sidebar-collapse').forEach(function (el) {
    var text = el.querySelector('.nav-label');
    if (compact && text) el.setAttribute('title', text.textContent);
    else el.removeAttribute('title');
  });
}

applySidebar(sidebarIsCompact());

// If running on GitHub Pages and the site is served at the user root (e.g. https://user.github.io/...),
// some pages may be accessed without the repo prefix. Fix absolute asset paths dynamically so
// links like `/css/styles.css` and `/js/*.js` point to the repo path when needed.
function fixAbsoluteAssetPathsForGithub() {
  if (!isGitHub) return;
  const repoPrefix = basePath.replace(/\/$/, ''); // e.g. '/bcbd-wiki'
  // If current pathname already starts with repoPrefix, nothing to do
  if (window.location.pathname.startsWith(repoPrefix + '/') || window.location.pathname === repoPrefix) return;

  // Update stylesheet links
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/')) {
      link.setAttribute('href', repoPrefix + href);
    }
  });

  // Update script srcs (will re-request them)
  document.querySelectorAll('script[src]').forEach(script => {
    const src = script.getAttribute('src');
    if (src && src.startsWith('/')) {
      script.setAttribute('src', repoPrefix + src);
    }
  });

  // Update image/media sources and srcset so images referenced with leading
  // slash work correctly when the site is served under a repo subpath.
  document.querySelectorAll('img[src], source[src], video[src], audio[src]').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.startsWith('/')) el.setAttribute('src', repoPrefix + s);
  });

  // Update srcset attributes (e.g. responsive images)
  document.querySelectorAll('[srcset]').forEach(el => {
    const ss = el.getAttribute('srcset');
    if (!ss) return;
    const updated = ss.split(',').map(part => {
      const trimmed = part.trim();
      const pieces = trimmed.split(/\s+/);
      const url = pieces[0];
      if (url && url.startsWith('/')) {
        pieces[0] = repoPrefix + url;
      }
      return pieces.join(' ');
    }).join(', ');
    el.setAttribute('srcset', updated);
  });
}

// run early to correct asset paths on pages served from user root
try { fixAbsoluteAssetPathsForGithub(); } catch (e) { console.warn('fixAbsoluteAssetPathsForGithub failed', e); }

function safePrefixHref(href) {
  if (!href) return href;

  // Do not modify absolute URLs, anchors, or protocol links
  if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return href;
  }

  // If href already starts with a slash, treat as absolute path on current host
  if (href.startsWith("/")) return href;

  // Convert relative links to root-relative using basePath.
  // This ensures header/footer links always point to the site's root paths
  // regardless of the current page nesting or whether the site is served via file://
  const cleaned = href.replace(/^\.\//, '').replace(/^\//, '');
  return (basePath === '/' ? '/' : basePath) + cleaned;
}

// Helper: try fetching a partial from several relative levels (handles nested pages and file:// use)
function tryFetchPartial(partialPath, callback) {
  const maxDepth = 6; // pages won't be deeper than this

  // Build candidate list. When running on GitHub Pages and the current
  // pathname does not contain the repo prefix, try the repo-root absolute
  // path first to avoid many 404s from deeply nested relative attempts.
  const candidates = [];
  const repoPrefix = basePath.replace(/\/$/, ''); // '/bcbd-wiki'

  // Always try the repo-root absolute path first when on GitHub Pages.
  // This ensures partials living at `/partials/...` or `/bcbd-wiki/partials/...`
  // are attempted before many relative fallbacks.
  if (isGitHub) {
    candidates.push(repoPrefix + '/' + partialPath); // /bcbd-wiki/partials/header.html
    candidates.push('/' + partialPath); // /partials/header.html (user-root)
  }

  // Local relative attempt
  candidates.push(partialPath);

  // go up 1..maxDepth levels
  for (let i = 1; i <= maxDepth; i++) {
    candidates.push('../'.repeat(i) + partialPath);
  }

  // Ensure repo-root fallback exists
  if (!candidates.includes(basePath + partialPath)) candidates.push(basePath + partialPath);

  // Try sequentially until one succeeds
  (function tryNext(i) {
    if (i >= candidates.length) {
      console.error('No se pudo cargar partial:', partialPath);
      return;
    }
    console.debug('tryFetchPartial: probando candidato ->', candidates[i]);
    fetch(candidates[i]).then(res => {
      if (!res.ok) throw new Error('no-ok');
      return res.text();
    }).then(html => callback(null, html, candidates[i]))
    .catch(() => tryNext(i+1));
  })(0);
}

// Load header partial (with fallbacks)
tryFetchPartial('partials/header.html', (err, html, usedPath) => {
  if (err) return console.error('Error cargando header:', err);
  const headerEl = document.getElementById("header");
  if (headerEl) headerEl.innerHTML = html;

  var themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      themePreference = activeTheme() === 'dark' ? 'light' : 'dark';
      writeStored(themeStorageKey, themePreference);
      applyTheme();
    });
  }
  updateThemeToggle();

  var collapse = document.querySelector('.sidebar-collapse');
  if (collapse) {
    collapse.addEventListener('click', function () {
      var compact = !document.documentElement.classList.contains('sidebar-compact');
      writeStored(sidebarStorageKey, compact ? 'compact' : 'expanded');
      applySidebar(compact);
    });
  }
  applySidebar(sidebarIsCompact());

  // The tab bar is fixed to the viewport; a transformed #header would carry it away.
  const tabbar = headerEl ? headerEl.querySelector('.tabbar') : null;
  if (tabbar) document.body.appendChild(tabbar);

  // Ajustar enlaces dentro del header y la barra de pestañas
  const links = document.querySelectorAll("#header a, .tabbar a");
  links.forEach(link => {
    const originalHref = link.getAttribute("href");
    const newHref = safePrefixHref(originalHref);
    if (newHref !== originalHref) link.setAttribute("href", newHref);
  });

  // Mark the section being viewed: the longest matching link path wins.
  const here = window.location.pathname.replace(/index\.html$/, '');
  const sectionOf = link => new URL(link.href, window.location.href).pathname.replace(/index\.html$/, '');
  [document.querySelectorAll('#header .site-nav a'), document.querySelectorAll('.tabbar a')].forEach(group => {
    let best = null;
    group.forEach(link => {
      // data-also lets one entry cover a related section (Institución includes Historia).
      const paths = [sectionOf(link)].concat((link.dataset.also || '').split(' ').filter(Boolean).map(p => basePath + p));
      paths.forEach(path => {
        const isHome = path === basePath;
        if ((isHome ? here === path : here.startsWith(path)) && (!best || path.length > best.length)) best = { link, length: path.length };
      });
    });
    if (best) best = best.link;
    if (best) best.setAttribute('aria-current', 'page');
  });

  // Mobile menu: the header button and the tab bar "Menú" open the same panel.
  const toggles = document.querySelectorAll('.nav-toggle, .nav-toggle-tab');
  const setMenu = open => {
    headerEl.classList.toggle('nav-open', open);
    if (open) headerEl.classList.remove('site-header-hidden');
    toggles.forEach(t => {
      t.setAttribute('aria-expanded', String(open));
      if (t.classList.contains('nav-toggle')) t.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
  };
  toggles.forEach(t => t.addEventListener('click', () => setMenu(!headerEl.classList.contains('nav-open'))));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && headerEl.classList.contains('nav-open')) setMenu(false); });

  // The page-level host owns sticky positioning; an inner sticky header would
  // otherwise stop at the bottom of its own short placeholder.
  const headerNode = document.querySelector('.site-header');
  if (headerNode && headerEl) {
    let lastScrollY = Math.max(0, window.scrollY);
    const onScroll = () => {
      const current = Math.max(0, window.scrollY);
      const delta = current - lastScrollY;
      headerNode.classList.toggle('site-header--scrolled', current > 8);
      if (current <= headerEl.offsetHeight || headerEl.contains(document.activeElement) || headerEl.classList.contains('nav-open')) {
        headerEl.classList.remove('site-header-hidden');
        lastScrollY = current;
      } else if (Math.abs(delta) >= 6) {
        headerEl.classList.toggle('site-header-hidden', delta > 0);
        lastScrollY = current;
      }
    };
    // Keyboard navigation must reveal links even when the bar is tucked away.
    headerEl.addEventListener('focusin', () => headerEl.classList.remove('site-header-hidden'));
    window.addEventListener('scroll', onScroll, { passive: true });
    // run once to set initial state
    onScroll();
  }
});

// Load footer partial into #footer if present, otherwise append as before
// Load footer partial (with fallbacks)
tryFetchPartial('partials/footer.html', (err, html, usedPath) => {
  if (err) return console.error('Error cargando footer:', err);
  const footerPlaceholder = document.getElementById("footer");
  if (footerPlaceholder) {
    footerPlaceholder.innerHTML = html;
    // If footer contains links, adjust them as well
    const links = footerPlaceholder.querySelectorAll("a");
    links.forEach(link => {
      const originalHref = link.getAttribute("href");
      const newHref = safePrefixHref(originalHref);
      if (newHref !== originalHref) link.setAttribute("href", newHref);
    });
    return;
  }

  // Fallback: append footer if none exists on the page
  if (!document.querySelector(".footer")) {
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }
});
