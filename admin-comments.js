// Saudia & Maailma Lehti – comment moderation on the admin page.
// The owner signs in with the Firebase account whose UID is written into
// firestore.rules; only that account is allowed to delete comments.

import { commentsEnabled, firebase, commentDate } from "./comments.js?v=20261029c";
import { firebaseAuth } from "./firebase.js?v=20261029c";

const area = document.getElementById("commentsArea");
let unsubscribe = null;

function status(msg, kind) {
  return el("div", "status" + (kind ? ` status--${kind}` : ""), msg);
}

function field(id, label, type = "text") {
  const wrap = el("div", "field");
  const l = el("label", null, label);
  l.htmlFor = id;
  const input = el("input");
  input.id = id;
  input.type = type;
  wrap.append(l, input);
  return { wrap, input };
}

function showLogin(fb) {
  const help = el("p", "admin__help",
    "Kirjaudu Firebase-tunnuksellasi poistaaksesi kommentteja. " +
    "(Tämä on eri tunnus kuin GitHub-token, ks. README.)");
  const email = field("fbEmail", "Sähköposti", "email");
  const password = field("fbPassword", "Salasana", "password");
  const btn = el("button", "btn", "Kirjaudu");
  const msg = status("");
  btn.onclick = async () => {
    btn.disabled = true;
    msg.textContent = "Kirjaudutaan…";
    msg.className = "status";
    try {
      await fb.auth.signInWithEmailAndPassword(fb.authInstance, email.input.value.trim(), password.input.value);
    } catch (err) {
      msg.textContent = "Kirjautuminen epäonnistui. Tarkista sähköposti ja salasana.";
      msg.className = "status status--err";
    } finally {
      btn.disabled = false;
    }
  };
  const row = el("div", "row");
  row.append(email.wrap, password.wrap);
  const actions = el("div", "actions");
  actions.append(btn);
  area.replaceChildren(help, row, actions, msg);
}

async function showList(fb, user) {
  const { fs, db } = fb;
  let titles = {};
  try {
    for (const a of await loadArticles()) titles[a.id] = a.title;
  } catch (e) {}
  // Comments on letters to the editor have the thread id "letter-<id>".
  try {
    const letters = await fs.getDocs(fs.collection(db, "letters"));
    for (const d of letters.docs) titles[`letter-${d.id}`] = `Mielipide: ${d.data().title}`;
  } catch (e) {}

  const info = el("p", "admin__help", `Kirjautunut: ${user.email}. Uusimmat kommentit ensin.`);
  const list = el("ul", "list");
  const msg = status("");
  const logout = el("button", "btn btn--ghost btn--small", "Kirjaudu ulos");
  logout.onclick = () => fb.auth.signOut(fb.authInstance);
  const actions = el("div", "actions");
  actions.style.marginTop = "16px";
  actions.append(logout);
  area.replaceChildren(info, list, msg, actions);

  const q = fs.query(fs.collection(db, "comments"), fs.orderBy("createdAt", "desc"), fs.limit(200));
  unsubscribe = fs.onSnapshot(q, (snap) => {
    if (snap.empty) {
      list.replaceChildren(el("li", null, "Ei kommentteja."));
      return;
    }
    list.replaceChildren(...snap.docs.map((d) => {
      const c = d.data({ serverTimestamps: "estimate" });
      const li = el("li");
      const text = el("span", null, `${c.parentId ? "↳ vastaus · " : ""}${c.name}: ${c.text}`);
      text.append(el("small", null,
        `${titles[c.articleId] || "Poistettu uutinen"} · ${formatDate(commentDate(c).toISOString())}`));
      const del = el("button", "btn btn--danger btn--small", "Poista");
      del.onclick = async () => {
        const extra = c.parentId ? "" : " Myös sen vastaukset poistetaan.";
        if (!confirm(`Poistetaanko kommentti käyttäjältä "${c.name}"?${extra}`)) return;
        try {
          if (!c.parentId) {
            const replies = await fs.getDocs(fs.query(fs.collection(db, "comments"), fs.where("parentId", "==", d.id)));
            await Promise.all(replies.docs.map((r) => fs.deleteDoc(r.ref)));
          }
          await fs.deleteDoc(d.ref);
          msg.textContent = "Kommentti poistettu.";
          msg.className = "status status--ok";
        } catch (err) {
          msg.textContent = err && err.code === "permission-denied"
            ? "Firebase ei antanut poistaa. Tarkista, että Firestoren Rules-kohdassa on oma User UID:si OMA_UID:n tilalla ja että painoit Publish."
            : "Poisto epäonnistui. Tarkista nettiyhteys ja yritä uudelleen.";
          msg.className = "status status--err";
        }
      };
      li.append(text, del);
      return li;
    }));
  }, () => {
    msg.textContent = "Kommentteja ei voitu ladata.";
    msg.className = "status status--err";
  });
}

async function init() {
  if (!area) return;
  if (!commentsEnabled()) {
    area.replaceChildren(el("p", "admin__help",
      "Kommentit eivät ole vielä käytössä. Ota ne käyttöön README.md:n ohjeilla " +
      "(Firebase-projekti + comments-config.js)."));
    return;
  }
  let fb;
  try {
    fb = { ...(await firebase()), ...(await firebaseAuth()) };
  } catch (err) {
    area.replaceChildren(status("Firebasea ei voitu ladata.", "err"));
    return;
  }
  // Used by admin.js when a story is deleted. Returns how many comments were
  // removed, or null when the owner isn't signed in.
  window.SML_deleteArticleComments = async (articleId) => {
    if (!fb.authInstance.currentUser) return null;
    try {
      const snap = await fb.fs.getDocs(fb.fs.query(
        fb.fs.collection(fb.db, "comments"), fb.fs.where("articleId", "==", articleId)));
      await Promise.all(snap.docs.map((d) => fb.fs.deleteDoc(d.ref)));
      // Its read count goes too, so it can't linger in "Luetuimmat".
      await fb.fs.deleteDoc(fb.fs.doc(fb.db, "views", articleId)).catch(() => {});
      return snap.size;
    } catch (e) {
      return 0;
    }
  };

  fb.auth.onAuthStateChanged(fb.authInstance, (user) => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (user) showList(fb, user);
    else showLogin(fb);
  });
}

init();
