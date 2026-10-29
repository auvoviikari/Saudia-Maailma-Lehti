// Saudia & Maailma Lehti – "Mielipide": letters to the editor.
// Readers send letters to Firestore as "pending"; only the editor (signed in
// on the admin page) can publish them, and only published letters can be
// read by others. firestore.rules enforces both.

import { firebaseEnabled, firebase } from "./firebase.js";

export const LIMITS = { name: 60, place: 60, title: 120, text: 4000 };
const NAME_KEY = "sml-letter-name";
const LAST_KEY = "sml-last-letter";
const COOLDOWN_MS = 2 * 60 * 1000;

export function letterDate(l, field = "publishedAt") {
  const ts = l[field] || l.createdAt;
  return ts && typeof ts.toDate === "function" ? ts.toDate() : new Date();
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) {}
  return null;
}

function paragraphs(node, text) {
  for (const para of String(text).split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const p = el("p");
    para.trim().split("\n").forEach((line, i) => {
      if (i) p.append(el("br"));
      p.append(document.createTextNode(line));
    });
    node.append(p);
  }
}

// Letters longer than this start folded to a short preview.
const PREVIEW_CHARS = 280;
const PAGE_SIZE = 10;

export function letterCard(l) {
  const card = el("article", "letter");
  card.append(el("h3", "letter__title", l.title));
  const sign = el("p", "letter__sign");
  sign.append(el("strong", null, l.name));
  if (l.place) sign.append(`, ${l.place}`);
  sign.append(el("span", "letter__date", ` · ${formatDate(letterDate(l).toISOString())}`));
  card.append(sign);

  const body = el("div", "letter__text");
  paragraphs(body, l.text);
  card.append(body);

  const long = l.text.length > PREVIEW_CHARS || /\n\s*\n/.test(l.text.trim());
  if (long) {
    card.classList.add("is-folded");
    const toggle = el("button", "letter__toggle", "Lue koko kirjoitus");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.onclick = () => {
      const folded = card.classList.toggle("is-folded");
      toggle.textContent = folded ? "Lue koko kirjoitus" : "Näytä vähemmän";
      toggle.setAttribute("aria-expanded", String(!folded));
      if (folded) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    card.append(toggle);
  }
  return card;
}

// Shows letters PAGE_SIZE at a time with a "show more" button.
function showLetters(listBox, letters) {
  let shown = 0;
  const more = el("button", "btn btn--ghost letters__more");
  more.type = "button";
  const step = () => {
    const next = letters.slice(shown, shown + PAGE_SIZE);
    shown += next.length;
    more.before(...next.map(letterCard));
    const left = letters.length - shown;
    more.textContent = `Näytä lisää kirjoituksia (${left})`;
    more.classList.toggle("hidden", left <= 0);
  };
  more.onclick = step;
  listBox.replaceChildren(
    el("p", "meta letters__count", `${letters.length} ${letters.length === 1 ? "kirjoitus" : "kirjoitusta"}`),
    more,
  );
  step();
}

function field(id, label, { textarea = false, max, placeholder = "", hint = "" } = {}) {
  const wrap = el("div", "field");
  const l = el("label", null, label);
  l.htmlFor = id;
  if (hint) l.append(" ", el("small", null, hint));
  const input = el(textarea ? "textarea" : "input");
  input.id = id;
  input.maxLength = max;
  input.placeholder = placeholder;
  wrap.append(l, input);
  return { wrap, input };
}

function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = "status" + (kind ? ` status--${kind}` : "");
}

async function init() {
  const formBox = document.getElementById("letterForm");
  const listBox = document.getElementById("letterList");
  if (!formBox || !listBox) return;
  if (!firebaseEnabled()) {
    listBox.replaceChildren(el("p", "letters__empty", "Mielipidepalsta ei ole vielä käytössä."));
    return;
  }

  // ----- The form -----
  const form = el("form", "comment-form letter-form");
  form.noValidate = true;
  const name = field("lName", "Nimi tai nimimerkki", { max: LIMITS.name });
  name.input.value = store(NAME_KEY) || "";
  const place = field("lPlace", "Paikkakunta", { max: LIMITS.place, hint: "(valinnainen)" });
  const title = field("lTitle", "Otsikko", { max: LIMITS.title });
  const text = field("lText", "Kirjoitus", {
    textarea: true, max: LIMITS.text, placeholder: "Mitä mieltä olet? Tyhjä rivi aloittaa uuden kappaleen.",
  });
  const counter = el("small", "letter-form__count", `0 / ${LIMITS.text}`);
  text.wrap.append(counter);
  text.input.oninput = () => { counter.textContent = `${text.input.value.length} / ${LIMITS.text}`; };
  const row = el("div", "row");
  row.append(name.wrap, place.wrap);
  const trap = el("input", "comment-form__trap");
  trap.tabIndex = -1;
  trap.autocomplete = "off";
  trap.setAttribute("aria-hidden", "true");
  const actions = el("div", "actions");
  const send = el("button", "btn", "Lähetä toimitukselle");
  send.type = "submit";
  actions.append(send, el("span", "comment-form__hint",
    "Toimitus lukee kaikki kirjoitukset ja julkaisee valitut. Kirjoitus voi odottaa julkaisua jonkin aikaa."));
  const status = el("div", "status");
  form.append(row, title.wrap, text.wrap, trap, actions, status);
  formBox.replaceChildren(form);

  let fb;
  try {
    fb = await firebase();
  } catch (e) {
    listBox.replaceChildren(el("p", "letters__empty", "Kirjoituksia ei voitu ladata."));
    return;
  }
  const { fs, db } = fb;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (trap.value) return;
    const values = {
      name: name.input.value.trim().replace(/\s+/g, " "),
      place: place.input.value.trim().replace(/\s+/g, " "),
      title: title.input.value.trim().replace(/\s+/g, " "),
      text: text.input.value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    };
    if (!values.name) { setStatus(status, "Kirjoita nimesi tai nimimerkki.", "err"); name.input.focus(); return; }
    if (!values.title) { setStatus(status, "Anna kirjoitukselle otsikko.", "err"); title.input.focus(); return; }
    if (values.text.length < 20) { setStatus(status, "Kirjoitus on liian lyhyt.", "err"); text.input.focus(); return; }
    const wait = COOLDOWN_MS - (Date.now() - Number(store(LAST_KEY) || 0));
    if (wait > 0) {
      setStatus(status, `Odota ${Math.ceil(wait / 1000)} s ennen seuraavaa kirjoitusta.`, "err");
      return;
    }
    send.disabled = true;
    setStatus(status, "Lähetetään…");
    try {
      await fs.addDoc(fs.collection(db, "letters"), {
        ...values,
        status: "pending",
        createdAt: fs.serverTimestamp(),
      });
      store(NAME_KEY, values.name);
      store(LAST_KEY, String(Date.now()));
      title.input.value = "";
      text.input.value = "";
      counter.textContent = `0 / ${LIMITS.text}`;
      setStatus(status, "Kiitos! Kirjoituksesi on lähetetty toimitukselle.", "ok");
    } catch (err) {
      setStatus(status, "Lähetys epäonnistui. Yritä uudelleen.", "err");
    } finally {
      send.disabled = false;
    }
  });

  // ----- Published letters -----
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, "letters"), fs.where("status", "==", "published")));
    const letters = snap.docs.map((d) => d.data()).sort((a, b) => letterDate(b) - letterDate(a));
    if (!letters.length) {
      listBox.replaceChildren(el("p", "letters__empty", "Ei vielä julkaistuja kirjoituksia. Kirjoita ensimmäinen!"));
    } else {
      showLetters(listBox, letters);
    }
  } catch (err) {
    listBox.replaceChildren(el("p", "letters__empty", "Kirjoituksia ei voitu ladata."));
  }
}

if (document.body.dataset.page === "letters") {
  if (document.getElementById("letterForm")) init();
  else document.addEventListener("sml:page", init, { once: true });
}
