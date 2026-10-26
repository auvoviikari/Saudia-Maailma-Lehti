// Saudian Sanomat – read-only rendering of news.json.
// All article text is inserted with textContent, so nothing typed in an
// article can run as code on the page.

const NEWS_URL = "news.json";

async function loadArticles() {
  const res = await fetch(`${NEWS_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`news.json: ${res.status}`);
  const data = await res.json();
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric" }) +
    " klo " + d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
}

function safeImageUrl(src) {
  if (!src) return "";
  // Only allow images stored with the site or plain https links.
  if (/^images\/[\w.\-]+$/.test(src) || /^https:\/\//.test(src)) return src;
  return "";
}

function photo(article) {
  const wrap = el("div", "photo");
  const src = safeImageUrl(article.image);
  if (src) {
    const img = el("img");
    img.src = src;
    img.alt = article.imageCaption || article.title || "";
    img.loading = "lazy";
    wrap.append(img);
  } else {
    wrap.classList.add("photo--empty");
    wrap.append(el("span", null, "SS"));
  }
  if (article.imageCaption) wrap.append(el("div", "nametag", article.imageCaption));
  return wrap;
}

function articleLink(article) {
  return `article.html?id=${encodeURIComponent(article.id)}`;
}

function metaLine(article) {
  return [article.author, formatDate(article.date)].filter(Boolean).join(" · ");
}

function headlinePanel(article, { full = false } = {}) {
  const panel = el("div", "panel");
  if (article.category) panel.append(el("div", "panel__kicker", article.category));
  panel.append(el(full ? "h1" : "h2", "panel__title", article.title));
  if (article.lead) panel.append(el("p", "panel__lead", article.lead));
  panel.append(el("div", "panel__meta", metaLine(article)));
  return panel;
}

function renderTodayBar() {
  const bar = document.getElementById("datebar");
  if (!bar) return;
  const today = new Date().toLocaleDateString("fi-FI", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  bar.textContent = today.charAt(0).toUpperCase() + today.slice(1);
}

async function renderFrontPage() {
  const main = document.getElementById("main");
  let articles;
  try {
    articles = await loadArticles();
  } catch (err) {
    main.replaceChildren(el("div", "empty-state", "Uutisia ei voitu ladata"));
    return;
  }
  if (!articles.length) {
    main.replaceChildren(el("div", "empty-state", "Ei vielä uutisia"));
    return;
  }

  const [top, ...rest] = articles;
  const lead = el("a", "lead-story");
  lead.href = articleLink(top);
  lead.append(photo(top), headlinePanel(top));

  const nodes = [lead];
  if (rest.length) {
    nodes.push(el("h2", "section-head", "Lisää uutisia"));
    const grid = el("div", "grid");
    for (const a of rest) {
      const card = el("a", "card");
      card.href = articleLink(a);
      const body = el("div", "card__body");
      body.append(el("h3", "card__title", a.title));
      if (a.lead) body.append(el("p", "card__lead", a.lead));
      body.append(el("div", "card__meta", [a.category, formatDate(a.date)].filter(Boolean).join(" · ")));
      card.append(photo(a), body);
      grid.append(card);
    }
    nodes.push(grid);
  }
  main.replaceChildren(...nodes);
}

async function renderArticlePage() {
  const main = document.getElementById("main");
  const id = new URLSearchParams(location.search).get("id");
  let article;
  try {
    article = (await loadArticles()).find((a) => a.id === id);
  } catch (err) {
    main.replaceChildren(el("div", "empty-state", "Uutista ei voitu ladata"));
    return;
  }
  if (!article) {
    const back = el("a", "back-link", "← Etusivulle");
    back.href = "index.html";
    const box = el("div", "empty-state", "Uutista ei löytynyt");
    box.append(el("br"), back);
    main.replaceChildren(box);
    return;
  }

  document.title = `${article.title} – Saudian Sanomat`;

  const body = el("div", "article-body");
  const inner = el("div", "article-body__inner");
  for (const para of String(article.body || "").split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const p = el("p");
    // Keep single line breaks inside a paragraph.
    para.trim().split("\n").forEach((line, i) => {
      if (i) p.append(el("br"));
      p.append(document.createTextNode(line));
    });
    inner.append(p);
  }
  const back = el("a", "back-link", "← Etusivulle");
  back.href = "index.html";
  inner.append(back);
  body.append(inner);

  main.replaceChildren(photo(article), headlinePanel(article, { full: true }), body);
}

renderTodayBar();
if (document.body.dataset.page === "article") renderArticlePage();
else if (document.body.dataset.page === "front") renderFrontPage();
