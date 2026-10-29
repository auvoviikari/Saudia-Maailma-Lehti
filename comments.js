// Saudia & Maailma Lehti – reader comments, stored in Firebase Firestore.
// Anyone can post with a nickname of their choice; only the owner (signed in
// on the admin page) can delete. The limits here are enforced again by the
// Firestore security rules in firestore.rules.

import { firebaseEnabled, firebase } from "./firebase.js?v=20261029c";

const NAME_KEY = "sml-nickname";
const LAST_POST_KEY = "sml-last-comment";
export const MAX_NAME = 40;
export const MAX_TEXT = 2000;
const COOLDOWN_MS = 30 * 1000;

export { firebase };
export const commentsEnabled = firebaseEnabled;

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

function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = "status" + (kind ? ` status--${kind}` : "");
}

// A nickname + text form, used for new comments and for replies.
function commentForm({ id, label, placeholder, submit, hint, reply = false }) {
  const form = el("form", reply ? "comment-form comment-form--reply" : "comment-form");
  form.noValidate = true;

  const nameField = el("div", "field");
  const nameLabel = el("label", null, "Nimimerkki");
  nameLabel.htmlFor = `${id}Name`;
  const name = el("input");
  name.id = `${id}Name`;
  name.maxLength = MAX_NAME;
  name.autocomplete = "nickname";
  name.placeholder = "Millä nimellä haluat näkyä?";
  name.value = store(NAME_KEY) || "";
  nameField.append(nameLabel, name);

  const textField = el("div", "field");
  const textLabel = el("label", null, label);
  textLabel.htmlFor = `${id}Text`;
  const text = el("textarea");
  text.id = `${id}Text`;
  text.maxLength = MAX_TEXT;
  text.placeholder = placeholder;
  textField.append(textLabel, text);

  // Hidden from people; bots that fill every field get ignored.
  const trap = el("input", "comment-form__trap");
  trap.tabIndex = -1;
  trap.autocomplete = "off";
  trap.setAttribute("aria-hidden", "true");

  const actions = el("div", "actions");
  const send = el("button", reply ? "btn btn--small" : "btn", submit);
  send.type = "submit";
  actions.append(send);
  let cancel = null;
  if (reply) {
    cancel = el("button", "btn btn--ghost btn--small", "Peru");
    cancel.type = "button";
    actions.append(cancel);
  }
  if (hint) actions.append(el("span", "comment-form__hint", hint));
  const status = el("div", "status");
  form.append(nameField, textField, trap, actions, status);
  return { form, name, text, trap, send, cancel, status };
}

// Validates and stores one comment (or reply). Returns true when posted.
async function postComment(fb, article, ui, parentId) {
  const { fs, db } = fb;
  const name = ui.name.value.trim().replace(/\s+/g, " ");
  const text = ui.text.value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (ui.trap.value) return false;
  if (!name) { setStatus(ui.status, "Valitse nimimerkki.", "err"); ui.name.focus(); return false; }
  if (!text) { setStatus(ui.status, "Kirjoita jotain ensin.", "err"); ui.text.focus(); return false; }
  const wait = COOLDOWN_MS - (Date.now() - Number(store(LAST_POST_KEY) || 0));
  if (wait > 0) {
    setStatus(ui.status, `Odota ${Math.ceil(wait / 1000)} s ennen seuraavaa kommenttia.`, "err");
    return false;
  }

  ui.send.disabled = true;
  setStatus(ui.status, "Lähetetään…");
  try {
    await fs.addDoc(fs.collection(db, "comments"), {
      articleId: article.id,
      name: name.slice(0, MAX_NAME),
      text: text.slice(0, MAX_TEXT),
      createdAt: fs.serverTimestamp(),
      ...(parentId ? { parentId } : {}),
    });
    store(NAME_KEY, name);
    store(LAST_POST_KEY, String(Date.now()));
    ui.text.value = "";
    setStatus(ui.status, parentId ? "Vastaus julkaistu!" : "Kommentti julkaistu!", "ok");
    return true;
  } catch (err) {
    setStatus(ui.status, "Kommenttia ei voitu lähettää. Yritä uudelleen.", "err");
    return false;
  } finally {
    ui.send.disabled = false;
  }
}

function commentItem(c, onReply) {
  const node = el("div", "comment");
  const avatar = el("div", "comment__avatar", initials(c.name));
  avatar.style.background = avatarColor(c.name);
  const main = el("div", "comment__main");
  const head = el("div", "comment__head");
  head.append(el("span", "comment__name", c.name), el("span", "meta", timeAgo(commentDate(c).toISOString())));
  const text = el("p", "comment__text");
  textWithBreaks(text, c.text);
  const reply = el("button", "comment__reply", "Vastaa");
  reply.type = "button";
  reply.onclick = onReply;
  main.append(head, text, reply);
  node.append(avatar, main);
  return node;
}

// Builds a live comment section in `mount` for anything with an id: a story,
// or a letter ("letter-<id>"). `prefix` keeps form ids unique when several
// sections are on one page; `onCount` hears the number of comments.
export async function mountComments(mount, threadId, { prefix = "c", compact = false, onCount = null } = {}) {
  const article = { id: threadId };
  const title = el(compact ? "h4" : "h2", compact ? "comments__subtitle" : "section-title", "Kommentit ");
  const count = el("span", "comments__count", "0");
  title.append(count);
  const main = commentForm({
    id: prefix, label: "Kommentti", placeholder: "Kirjoita kommenttisi…",
    submit: "Lähetä kommentti", hint: "Kommentit näkyvät kaikille lukijoille.",
  });
  const list = el("ol", "comment-list");
  const empty = el("p", "comments__empty", "Ei vielä kommentteja. Ole ensimmäinen!");
  // In a letter the "Kommentit (n)" button already names the section.
  mount.replaceChildren(...(compact ? [] : [title]), main.form, empty, list);

  let fb;
  try {
    fb = await firebase();
  } catch (err) {
    setStatus(main.status, "Kommentteja ei voitu ladata.", "err");
    return;
  }

  // Only one reply form is open at a time. It survives re-renders, so
  // a new comment arriving doesn't wipe what the reader is typing.
  let reply = null; // { parentId, ui }

  function openReply(parentId, mention) {
    if (!reply || reply.parentId !== parentId) {
      const ui = commentForm({
        id: `${prefix}r`, label: "Vastaus", placeholder: "Kirjoita vastauksesi…", submit: "Vastaa", reply: true,
      });
      ui.cancel.onclick = () => { reply = null; ui.form.remove(); };
      ui.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (await postComment(fb, article, ui, parentId)) {
          reply = null;
          ui.form.remove();
        }
      });
      reply = { parentId, ui };
      placeReply();
    }
    const box = reply.ui.text;
    if (mention && !box.value.trim()) box.value = `@${mention} `;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }

  function placeReply() {
    if (!reply) return;
    const slot = list.querySelector(`[data-thread="${CSS.escape(reply.parentId)}"] > .comment-thread__form`);
    if (slot) slot.append(reply.ui.form);
    else { reply.ui.form.remove(); reply = null; } // the comment was deleted
  }

  fb.fs.onSnapshot(fb.fs.query(fb.fs.collection(fb.db, "comments"), fb.fs.where("articleId", "==", article.id)), (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    const tops = items.filter((c) => !c.parentId).sort((a, b) => commentDate(b) - commentDate(a));
    const ids = new Set(tops.map((c) => c.id));
    const replies = {};
    for (const c of items) {
      if (c.parentId && ids.has(c.parentId)) (replies[c.parentId] ||= []).push(c);
    }

    const threads = tops.map((c) => {
      const li = el("li", "comment-thread");
      li.dataset.thread = c.id;
      li.append(commentItem(c, () => openReply(c.id)));
      const children = (replies[c.id] || []).sort((a, b) => commentDate(a) - commentDate(b));
      if (children.length) {
        const ol = el("ol", "comment-replies");
        for (const r of children) {
          const item = el("li");
          item.append(commentItem(r, () => openReply(c.id, r.name)));
          ol.append(item);
        }
        li.append(ol);
      }
      li.append(el("div", "comment-thread__form"));
      return li;
    });

    const total = tops.length + Object.values(replies).reduce((n, r) => n + r.length, 0);
    count.textContent = String(total);
    if (onCount) onCount(total);
    empty.classList.toggle("hidden", tops.length > 0);
    list.replaceChildren(...threads);
    placeReply();
  }, () => setStatus(main.status, "Kommentteja ei voitu ladata.", "err"));

  main.form.addEventListener("submit", (e) => {
    e.preventDefault();
    postComment(fb, article, main, null);
  });
}

async function initArticleComments(article) {
  const mount = document.getElementById("comments");
  if (!mount || !commentsEnabled()) return;
  await mountComments(mount, article.id);
}

if (document.body.dataset.page === "article") {
  if (window.SML_ARTICLE) initArticleComments(window.SML_ARTICLE);
  else document.addEventListener("sml:article", (e) => initArticleComments(e.detail), { once: true });
}
