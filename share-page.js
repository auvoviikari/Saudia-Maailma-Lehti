// Saudia & Maailma Lehti – builds a story's own page, uutiset/<id>.html.
// Chat apps and social media don't run JavaScript, so the headline, summary
// and photo they show as a link preview must be written into the page's
// HTML. The page then shows the story like article.html does.

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sharePagePath(article) {
  return `uutiset/${article.id}.html`;
}

// siteUrl is the site's address ending in "/", e.g.
// https://auvoviikari.github.io/Saudia-Maailma-Lehti/
function sharePageHtml(article, siteUrl) {
  const summary = (article.lead || String(article.body || "")
    .split(/\n\s*\n/)
    .filter((p) => !/^\s*\[media \d+\]\s*$/i.test(p))
    .join(" "))
    .replace(/\s+/g, " ").trim();
  const description = summary.length > 200 ? `${summary.slice(0, 197).trimEnd()}…` : summary;
  const image = /^images\/[\w.\-]+$/.test(article.image || "")
    ? siteUrl + article.image
    : /^https:\/\//.test(article.image || "") ? article.image : siteUrl + "og-image.png";
  const url = siteUrl + sharePagePath(article);
  const e = escapeHtml;
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<base href="../" />
<title>${e(article.title)} – Saudia &amp; Maailma Lehti</title>
<meta name="description" content="${e(description)}" />
<meta name="theme-color" content="#0a1428" />
<link rel="canonical" href="${e(url)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Saudia &amp; Maailma Lehti" />
<meta property="og:locale" content="fi_FI" />
<meta property="og:title" content="${e(article.title)}" />
<meta property="og:description" content="${e(description)}" />
<meta property="og:url" content="${e(url)}" />
<meta property="og:image" content="${e(image)}" />
<meta property="og:image:alt" content="${e(article.imageCaption || article.title)}" />
<meta property="article:published_time" content="${e(article.date)}" />
${article.category ? `<meta property="article:section" content="${e(article.category)}" />\n` : ""}<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(article.title)}" />
<meta name="twitter:description" content="${e(description)}" />
<meta name="twitter:image" content="${e(image)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="style.css" />
</head>
<body data-page="article" data-id="${e(article.id)}">
  <div class="page">
    <header id="site-header"></header>

    <main id="main">
      <div class="empty-state">Ladataan…</div>
    </main>

    <footer class="footer" id="site-footer"></footer>
  </div>
  <script src="site.js"></script>
  <script src="comments-config.js"></script>
  <script type="module" src="comments.js"></script>
  <script type="module" src="views.js"></script>
</body>
</html>
`;
}

if (typeof module !== "undefined") module.exports = { sharePageHtml, sharePagePath, escapeHtml };
