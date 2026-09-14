var isGitHub = window.location.hostname.includes("github.io");

var basePath = isGitHub
  ? "/bcbd-wiki/"
  : "/";

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

  // Ajustar enlaces dentro del header
  const links = document.querySelectorAll("#header a");
  links.forEach(link => {
    const originalHref = link.getAttribute("href");
    const newHref = safePrefixHref(originalHref);
    if (newHref !== originalHref) link.setAttribute("href", newHref);
  });

  // Add scroll listener to toggle header scrolled state (shadow)
  const headerNode = document.querySelector('.site-header');
  if (headerNode) {
    const onScroll = () => {
      if (window.scrollY > 8) headerNode.classList.add('site-header--scrolled');
      else headerNode.classList.remove('site-header--scrolled');
    };
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
