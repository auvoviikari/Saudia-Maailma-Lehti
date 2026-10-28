// Saudia & Maailma Lehti – reader comments, stored in Firebase Firestore.
// Anyone can post with a nickname of their choice; only the owner (signed in
// on the admin page) can delete. The limits here are enforced again by the
// Firestore security rules in firestore.rules.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const NAME_KEY = "sml-nickname";
const LAST_POST_KEY = "sml-last-comment";
export const MAX_NAME = 40;
export const MAX_TEXT = 2000;
const COOLDOWN_MS = 30 * 1000;

let firebasePromise = null;

export function commentsEnabled() {
  return Boolean(window.SML_FIREBASE && window.SML_FIREBASE.projectId);
}

// Loads the Firebase SDK once and returns the modules plus a Firestore handle.
export function firebase() {
  if (!firebasePromise) {
    firebasePromise = (async () => {
      const [app, fs, auth] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
        import(`${SDK}/firebase-auth.js`),
      ]);
      const instance = app.initializeApp(window.SML_FIREBASE);
      return { fs, auth, db: fs.getFirestore(instance), authInstance: auth.getAuth(instance) };
    })();
  }
  return firebasePromise;
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) {}
  return null;
}

export function commentDate(c) {
  const ts = c.createdAt;
  return ts && typeof ts.toDate === "function" ? ts.toDate() : new Date();
}

function initials(name) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

// Gives each nickname its own steady shade of blue.
function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `hsl(${205 + (h % 35)}, ${45 + (h % 25)}%, ${32 + (h % 14)}%)`;
}

function textWithBreaks(node, text) {
  text.split("\n").forEach((line, i) => {
    if (i) node.append(el("br"));
    node.append(document.createTextNode(line));
  });
}

function commentItem(c) {
  const li = el("li", "comment");
  const avatar = el("div", "comment__avatar", initials(c.name));
  avatar.style.background = avatarColor(c.name);
  const main = el("div", "comment__main");
  const head = el("div", "comment__head");
  head.append(el("span", "comment__name", c.name), el("span", "meta", timeAgo(commentDate(c).toISOString())));
  const text = el("p", "comment__text");
  textWithBreaks(text, c.text);
  main.append(head, text);
  li.append(avatar, main);
  return li;
}

function renderSection(mount, article) {
  const title = el("h2", "section-title", "Kommentit ");
  const count = el("span", "comments__count", "0");
  title.append(count);

  const form = el("form", "comment-form");
  form.noValidate = true;
  const nameField = el("div", "field");
  const nameLabel = el("label", null, "Nimimerkki");
  nameLabel.htmlFor = "cName";
  const name = el("input");
  name.id = "cName";
  name.maxLength = MAX_NAME;
  name.autocomplete = "nickname";
  name.placeholder = "Millä nimellä haluat näkyä?";
  name.value = store(NAME_KEY) || "";
  nameField.append(nameLabel, name);

  const textField = el("div", "field");
  const textLabel = el("label", null, "Kommentti");
  textLabel.htmlFor = "cText";
  const text = el("textarea");
  text.id = "cText";
  text.maxLength = MAX_TEXT;
  text.placeholder = "Kirjoita kommenttisi…";
  textField.append(textLabel, text);

  // Hidden from people; bots that fill every field get ignored.
  const trap = el("input", "comment-form__trap");
  trap.tabIndex = -1;
  trap.autocomplete = "off";
  trap.setAttribute("aria-hidden", "true");

  const actions = el("div", "actions");
  const send = el("button", "btn", "Lähetä kommentti");
  send.type = "submit";
  actions.append(send, el("span", "comment-form__hint", "Kommentit näkyvät kaikille lukijoille."));
  const status = el("div", "status");
  form.append(nameField, textField, trap, actions, status);

  const list = el("ol", "comment-list");
  const empty = el("p", "comments__empty", "Ei vielä kommentteja. Ole ensimmäinen!");

  mount.replaceChildren(title, form, empty, list);
  return { form, name, text, trap, send, status, list, empty, count };
}

function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = "status" + (kind ? ` status--${kind}` : "");
}

async function initArticleComments(article) {
  const mount = document.getElementById("comments");
  if (!mount || !commentsEnabled()) return;
  const ui = renderSection(mount, article);

  let fb;
  try {
    fb = await firebase();
  } catch (err) {
    setStatus(ui.status, "Kommentteja ei voitu ladata.", "err");
    return;
  }
  const { fs, db } = fb;
  const comments = fs.collection(db, "comments");

  fs.onSnapshot(fs.query(comments, fs.where("articleId", "==", article.id)), (snap) => {
    const items = snap.docs
      .map((d) => d.data({ serverTimestamps: "estimate" }))
      .sort((a, b) => commentDate(b) - commentDate(a));
    ui.count.textContent = String(items.length);
    ui.empty.classList.toggle("hidden", items.length > 0);
    ui.list.replaceChildren(...items.map(commentItem));
  }, () => setStatus(ui.status, "Kommentteja ei voitu ladata.", "err"));

  ui.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ui.name.value.trim().replace(/\s+/g, " ");
    const text = ui.text.value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (ui.trap.value) return;
    if (!name) { setStatus(ui.status, "Valitse nimimerkki.", "err"); ui.name.focus(); return; }
    if (!text) { setStatus(ui.status, "Kommentti on tyhjä.", "err"); ui.text.focus(); return; }
    const wait = COOLDOWN_MS - (Date.now() - Number(store(LAST_POST_KEY) || 0));
    if (wait > 0) {
      setStatus(ui.status, `Odota ${Math.ceil(wait / 1000)} s ennen seuraavaa kommenttia.`, "err");
      return;
    }

    ui.send.disabled = true;
    setStatus(ui.status, "Lähetetään…");
    try {
      await fs.addDoc(comments, {
        articleId: article.id,
        name: name.slice(0, MAX_NAME),
        text: text.slice(0, MAX_TEXT),
        createdAt: fs.serverTimestamp(),
      });
      store(NAME_KEY, name);
      store(LAST_POST_KEY, String(Date.now()));
      ui.text.value = "";
      setStatus(ui.status, "Kommentti julkaistu!", "ok");
    } catch (err) {
      setStatus(ui.status, "Kommenttia ei voitu lähettää. Yritä uudelleen.", "err");
    } finally {
      ui.send.disabled = false;
    }
  });
}

if (document.body.dataset.page === "article") {
  if (window.SML_ARTICLE) initArticleComments(window.SML_ARTICLE);
  else document.addEventListener("sml:article", (e) => initArticleComments(e.detail), { once: true });
}
