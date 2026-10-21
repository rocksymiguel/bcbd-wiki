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

// Theme: "auto" (default) is light by day and dark by night, following the sun
// in Daule. A manual light/dark choice is remembered in this browser.
var themeStorageKey = 'bcbd-wiki-theme';
var themePreference = 'auto';
var DAULE = { lat: -1.8622, lng: -79.9775 };

function readThemePreference() {
  try {
    var value = window.localStorage.getItem(themeStorageKey);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch (error) {
    return 'auto';
  }
}

// NOAA approximation; minutes are UTC. Accurate to a few minutes, enough for a theme.
function sunTimesUtcMinutes(date, lat, lng) {
  var start = Date.UTC(date.getUTCFullYear(), 0, 0);
  var dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  var g = 2 * Math.PI / 365 * (dayOfYear - 1);
  var eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  var rad = Math.PI / 180;
  var hourAngle = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  return { sunrise: 720 - 4 * (lng + hourAngle) - eqTime, sunset: 720 - 4 * (lng - hourAngle) - eqTime };
}

function isDaylightInDaule(now) {
  var times = sunTimesUtcMinutes(now, DAULE.lat, DAULE.lng);
  var minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  var rise = (times.sunrise + 1440) % 1440;
  var set = (times.sunset + 1440) % 1440;
  return rise < set ? minutes >= rise && minutes < set : minutes >= rise || minutes < set;
}

function activeTheme() {
  if (themePreference === 'light' || themePreference === 'dark') return themePreference;
  return isDaylightInDaule(new Date()) ? 'light' : 'dark';
}

function updateThemeSwitch() {
  document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === themePreference));
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = activeTheme();
  updateThemeSwitch();
}

function setThemePreference(choice) {
  themePreference = choice;
  try {
    if (choice === 'auto') window.localStorage.removeItem(themeStorageKey);
    else window.localStorage.setItem(themeStorageKey, choice);
  } catch (error) { /* Storage can be unavailable. */ }
  applyTheme();
}

function initializeTheme() {
  themePreference = readThemePreference();
  applyTheme();
  // Sunrise and sunset happen while a page stays open.
  window.setInterval(function () { if (themePreference === 'auto') applyTheme(); }, 5 * 60 * 1000);
}

initializeTheme();

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

  document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
    button.addEventListener('click', function () { setThemePreference(button.dataset.themeChoice); });
  });
  updateThemeSwitch();

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
      const path = sectionOf(link);
      const isHome = path === basePath;
      if ((isHome ? here === path : here.startsWith(path)) && (!best || path.length > sectionOf(best).length)) best = link;
    });
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
