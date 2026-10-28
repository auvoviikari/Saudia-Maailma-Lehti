// Saudia & Maailma Lehti – read-only rendering of news.json.
// All article text is inserted with textContent, so nothing typed in an
// article can run as code on the page.

const NEWS_URL = "news.json";
const SITE_NAME = "Saudia & Maailma Lehti";
const SITE_SHORT = "SML";

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

function link(href, className, text) {
  const a = el("a", className, text);
  a.href = href;
  return a;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric" }) +
    " klo " + d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return "juuri nyt";
  if (min < 60) return `${min} min sitten`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t sitten`;
  return formatDate(iso);
}

function safeImageUrl(src) {
  if (!src) return "";
  // Only allow files stored with the site or plain https links.
  if (/^(images|media)\/[\w.\-]+$/.test(src) || /^https:\/\//.test(src)) return src;
  return "";
}

// Accepts the usual YouTube link shapes and returns the 11-character video id.
function youtubeId(url) {
  const m = String(url || "").trim().match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(String(url || "").trim()) ? String(url).trim() : "";
}

const MEDIA_TOKEN = /^\[media (\d+)\]$/i;

// One photo or video inside a story, with its caption.
function mediaFigure(item, srcFor = safeImageUrl) {
  const fig = el("figure", "media");
  if (item.type === "youtube") {
    const id = youtubeId(item.youtube);
    if (!id) return null;
    const frame = el("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${id}`;
    frame.title = item.caption || "YouTube-video";
    frame.loading = "lazy";
    frame.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    const box = el("div", "media__embed");
    box.append(frame);
    fig.append(box);
  } else {
    const src = srcFor(item.src);
    if (!src) return null;
    if (item.type === "video") {
      const video = el("video");
      video.src = src;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      fig.append(video);
    } else {
      const img = el("img");
      img.src = src;
      img.alt = item.caption || "";
      img.loading = "lazy";
      fig.append(img);
    }
  }
  if (item.caption) fig.append(el("figcaption", null, item.caption));
  return fig;
}

// Story text with its photos and videos. A paragraph that is only
// "[media N]" is replaced by the Nth item; items not placed in the text
// go after it.
function articleText(article, srcFor = safeImageUrl) {
  const text = el("div", "article-body__text");
  const media = Array.isArray(article.media) ? article.media : [];
  const used = new Set();
  for (const para of String(article.body || "").split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const token = para.trim().match(MEDIA_TOKEN);
    if (token) {
      const n = Number(token[1]) - 1;
      if (media[n] && !used.has(n)) {
        used.add(n);
        const fig = mediaFigure(media[n], srcFor);
        if (fig) text.append(fig);
      }
      continue;
    }
    const p = el("p");
    // Keep single line breaks inside a paragraph.
    para.trim().split("\n").forEach((line, i) => {
      if (i) p.append(el("br"));
      p.append(document.createTextNode(line));
    });
    text.append(p);
  }
  media.forEach((item, n) => {
    if (used.has(n)) return;
    const fig = mediaFigure(item, srcFor);
    if (fig) text.append(fig);
  });
  return text;
}

function brand(className = "brand") {
  const a = link("index.html", className);
  a.append(el("span", "brand__mark", SITE_SHORT));
  const name = el("span", "brand__name");
  name.append("Saudia ", el("em", null, "&"), " Maailma Lehti");
  a.append(name);
  return a;
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
    wrap.append(el("span", null, SITE_SHORT));
  }
  if (article.imageCaption) wrap.append(el("div", "nametag", article.imageCaption));
  return wrap;
}

function articleLink(article) {
  return `article.html?id=${encodeURIComponent(article.id)}`;
}

function categoryLink(category) {
  return `index.html?kategoria=${encodeURIComponent(category)}`;
}

// ---------- Page chrome (header + footer) ----------

function renderChrome({ articles = [], activeCategory = null, admin = false } = {}) {
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");

  if (header) {
    const today = new Date().toLocaleDateString("fi-FI", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    const utility = el("div", "utility");
    const uw = el("div", "wrap");
    uw.append(
      el("span", null, today.charAt(0).toUpperCase() + today.slice(1)),
      el("span", "utility__right", admin ? "Toimitus" : "Saudiasta ja maailmalta"),
    );
    utility.append(uw);

    const mast = el("div", "masthead");
    const mw = el("div", "wrap");
    mw.append(brand(), el("p", "brand__tagline", admin ? "Toimituksen työkalu" : "Uutiset · Analyysit · Maailma"));
    mast.append(mw);

    const parts = [utility, mast];

    if (!admin) {
      const nav = el("nav", "nav");
      const nw = el("div", "wrap");
      const home = link("index.html", activeCategory ? "" : "is-active", "Etusivu");
      nw.append(home);
      // A category holding every story would just repeat the front page.
      const categories = [...new Set(articles.map((a) => a.category).filter(Boolean))]
        .filter((c) => c === activeCategory || articles.some((a) => a.category !== c));
      for (const c of categories) {
        nw.append(link(categoryLink(c), c === activeCategory ? "is-active" : "", c));
      }
      nav.append(nw);
      parts.push(nav);

      // The ticker loops its headlines, so it needs a few to not look repetitive.
      if (articles.length >= 3) {
        const ticker = el("div", "ticker");
        const tw = el("div", "wrap");
        const viewport = el("div", "ticker__viewport");
        const track = el("div", "ticker__track");
        const items = articles.slice(0, 8);
        // Two copies so the scroll loops seamlessly.
        for (let i = 0; i < 2; i++) {
          for (const a of items) track.append(link(articleLink(a), null, a.title));
        }
        viewport.append(track);
        tw.append(el("span", "ticker__label", "Tuoreimmat"), viewport);
        ticker.append(tw);
        parts.push(ticker);
      }
    }
    header.replaceChildren(...parts);
  }

  if (footer && !footer.hasChildNodes()) {
    const fw = el("div", "wrap");
    fw.append(
      brand(),
      el("span", null, `© ${new Date().getFullYear()} ${SITE_NAME} (${SITE_SHORT}). Kaikki oikeudet pidätetään.`),
    );
    footer.append(fw);
  }
}

// ---------- Building blocks ----------

function kicker(article) {
  return article.category ? el("span", "kicker", article.category) : null;
}

function hero(article) {
  const a = link(articleLink(article), "hero");
  const content = el("div", "hero__content");
  const k = kicker(article);
  if (k) content.append(k);
  content.append(el("h1", "hero__title", article.title));
  if (article.lead) content.append(el("p", "hero__lead", article.lead));
  content.append(el("div", "meta", [article.author, timeAgo(article.date)].filter(Boolean).join(" · ")));
  const pic = photo(article);
  pic.querySelector("img")?.removeAttribute("loading");
  a.append(pic, content);
  return a;
}

function card(article) {
  const a = link(articleLink(article), "card");
  const body = el("div", "card__body");
  const k = kicker(article);
  if (k) body.append(k);
  body.append(el("h3", "card__title", article.title));
  if (article.lead) body.append(el("p", "card__lead", article.lead));
  body.append(el("div", "meta", [article.author, timeAgo(article.date)].filter(Boolean).join(" · ")));
  a.append(photo(article), body);
  return a;
}

function latestList(articles) {
  const box = el("aside", "latest");
  box.append(el("h2", "latest__title", "Uusimmat"));
  if (!articles.length) {
    box.append(el("p", "latest__empty", "Lisää uutisia tulossa pian."));
    return box;
  }
  const ol = el("ol");
  for (const a of articles) {
    const li = el("li");
    const l = link(articleLink(a));
    const text = el("span");
    text.append(el("span", "latest__headline", a.title), el("span", "meta", timeAgo(a.date)));
    l.append(text);
    li.append(l);
    ol.append(li);
  }
  box.append(ol);
  return box;
}

function section(title, articles) {
  const s = el("section", "section");
  s.append(el("h2", "section-title", title));
  const grid = el("div", "grid");
  grid.append(...articles.map(card));
  s.append(grid);
  return s;
}

// Used by the article page and the newsroom preview.
function headlinePanel(article) {
  const head = el("div", "article-head");
  const k = kicker(article);
  if (k) head.append(k);
  head.append(el("h1", "article-head__title", article.title));
  if (article.lead) head.append(el("p", "article-head__lead", article.lead));
  const byline = el("div", "byline");
  const author = article.author || "Toimitus";
  const initials = author.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const who = el("div");
  who.append(el("div", "byline__name", author), el("div", "meta", formatDate(article.date)));
  byline.append(el("div", "byline__avatar", initials), who);
  head.append(byline);
  return head;
}

// ---------- Pages ----------

async function renderFrontPage() {
  const main = document.getElementById("main");
  const category = new URLSearchParams(location.search).get("kategoria");
  let articles;
  try {
    articles = await loadArticles();
  } catch (err) {
    renderChrome();
    main.replaceChildren(el("div", "empty-state", "Uutisia ei voitu ladata."));
    return;
  }
  renderChrome({ articles, activeCategory: category });

  const shown = category ? articles.filter((a) => a.category === category) : articles;
  if (!shown.length) {
    main.replaceChildren(el("div", "empty-state", "Ei vielä uutisia."));
    return;
  }
  if (category) document.title = `${category} – ${SITE_NAME}`;

  const wrap = el("div", "wrap front");
  const [top, ...rest] = shown;
  const topRow = el("div", "top");
  topRow.append(hero(top), latestList(shown.slice(0, 6)));
  wrap.append(topRow);
  if (rest.length) wrap.append(section(category ? `Lisää: ${category}` : "Lisää uutisia", rest));
  main.replaceChildren(wrap);
}

async function renderArticlePage() {
  const main = document.getElementById("main");
  const id = new URLSearchParams(location.search).get("id");
  let articles;
  try {
    articles = await loadArticles();
  } catch (err) {
    renderChrome();
    main.replaceChildren(el("div", "empty-state", "Uutista ei voitu ladata."));
    return;
  }
  renderChrome({ articles });
  const article = articles.find((a) => a.id === id);
  if (!article) {
    const box = el("div", "empty-state", "Uutista ei löytynyt.");
    box.append(el("br"), link("index.html", "back-link", "← Etusivulle"));
    main.replaceChildren(box);
    return;
  }

  document.title = `${article.title} – ${SITE_NAME}`;

  const top = el("div", "article-hero");
  const pic = photo(article);
  pic.querySelector("img")?.removeAttribute("loading");
  top.append(pic);

  const body = el("article", "article-body");
  if (article.imageText && safeImageUrl(article.image)) {
    body.append(el("p", "article-body__photo-text", article.imageText));
  }
  body.append(articleText(article), link("index.html", "back-link", "← Etusivulle"));

  // Filled in by comments.js.
  const comments = el("section", "comments");
  comments.id = "comments";

  const nodes = [top, headlinePanel(article), body, comments];
  const others = articles.filter((a) => a.id !== article.id);
  const related = [
    ...others.filter((a) => article.category && a.category === article.category),
    ...others.filter((a) => !article.category || a.category !== article.category),
  ].slice(0, 3);
  if (related.length) {
    const rel = el("div", "related");
    rel.append(section("Lue myös", related));
    nodes.push(rel);
  }
  main.replaceChildren(...nodes);
  window.SML_ARTICLE = article;
  document.dispatchEvent(new CustomEvent("sml:article", { detail: article }));
}

const page = document.body.dataset.page;
if (page === "article") renderArticlePage();
else if (page === "front") renderFrontPage();
else renderChrome({ admin: true });
