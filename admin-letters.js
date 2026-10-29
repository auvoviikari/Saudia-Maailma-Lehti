// Saudia & Maailma Lehti – newsroom: letters to the editor waiting for
// approval. Uses the same Firebase sign-in as comment moderation.

import { firebaseEnabled, firebase, firebaseAuth } from "./firebase.js";
import { letterDate } from "./letters.js";

const area = document.getElementById("lettersArea");
let unsubscribe = null;

function msgLine() {
  return el("div", "status");
}

function show(node, msg, kind) {
  node.textContent = msg;
  node.className = "status" + (kind ? ` status--${kind}` : "");
}

function letterRow(fb, d, msg) {
  const { fs } = fb;
  const l = d.data({ serverTimestamps: "estimate" });
  const li = el("li", "letter-row");
  const head = el("div", "letter-row__head");
  head.append(
    el("strong", null, l.title),
    el("small", null, `${l.name}${l.place ? ", " + l.place : ""} · ${formatDate(letterDate(l, "createdAt").toISOString())}`),
  );
  const text = el("p", "letter-row__text", l.text);
  const actions = el("div", "actions");
  const published = l.status === "published";
  const toggle = el("button", published ? "btn btn--ghost btn--small" : "btn btn--small",
    published ? "Piilota sivulta" : "Julkaise");
  toggle.onclick = async () => {
    toggle.disabled = true;
    try {
      await fs.updateDoc(d.ref, published
        ? { status: "pending" }
        : { status: "published", publishedAt: fs.serverTimestamp() });
      show(msg, published ? "Kirjoitus piilotettu." : "Kirjoitus julkaistu Mielipide-sivulle.", "ok");
    } catch (err) {
      show(msg, "Ei onnistunut. Tarkista, että Firestoren säännöt on päivitetty (README).", "err");
      toggle.disabled = false;
    }
  };
  const del = el("button", "btn btn--danger btn--small", "Poista");
  del.onclick = async () => {
    if (!confirm(`Poistetaanko kirjoitus "${l.title}"?`)) return;
    try {
      await fs.deleteDoc(d.ref);
      show(msg, "Kirjoitus poistettu.", "ok");
    } catch (err) {
      show(msg, "Poisto epäonnistui.", "err");
    }
  };
  actions.append(toggle, del);
  li.append(head, text, actions);
  return li;
}

function showList(fb) {
  const { fs, db } = fb;
  const pendingTitle = el("h3", "admin__subtitle", "Odottaa julkaisua");
  const pending = el("ul", "letter-rows");
  const publishedTitle = el("h3", "admin__subtitle", "Julkaistut");
  const published = el("ul", "letter-rows");
  const msg = msgLine();
  area.replaceChildren(msg, pendingTitle, pending, publishedTitle, published);

  const q = fs.query(fs.collection(db, "letters"), fs.orderBy("createdAt", "desc"), fs.limit(200));
  unsubscribe = fs.onSnapshot(q, (snap) => {
    const docs = snap.docs;
    const waiting = docs.filter((d) => d.data().status !== "published");
    const live = docs.filter((d) => d.data().status === "published");
    pendingTitle.textContent = `Odottaa julkaisua (${waiting.length})`;
    publishedTitle.textContent = `Julkaistut (${live.length})`;
    pending.replaceChildren(...(waiting.length ? waiting.map((d) => letterRow(fb, d, msg)) : [el("li", "letter-row--empty", "Ei uusia kirjoituksia.")]));
    published.replaceChildren(...(live.length ? live.map((d) => letterRow(fb, d, msg)) : [el("li", "letter-row--empty", "Ei julkaistuja kirjoituksia.")]));
  }, () => show(msg, "Kirjoituksia ei voitu ladata. Tarkista, että Firestoren säännöt on päivitetty (README).", "err"));
}

async function init() {
  if (!area) return;
  if (!firebaseEnabled()) {
    area.replaceChildren(el("p", "admin__help", "Ota ensin Firebase käyttöön (README → Kommentit)."));
    return;
  }
  let fb;
  try {
    fb = { ...(await firebase()), ...(await firebaseAuth()) };
  } catch (err) {
    area.replaceChildren(el("p", "status status--err", "Firebasea ei voitu ladata."));
    return;
  }
  fb.auth.onAuthStateChanged(fb.authInstance, (user) => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (user) showList(fb);
    else area.replaceChildren(el("p", "admin__help", "Kirjaudu Kommentit-osiossa Firebase-tunnuksellasi nähdäksesi lähetetyt kirjoitukset."));
  });
}

init();
