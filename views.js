// Saudia & Maailma Lehti – read counts for the "Luetuimmat" list.
// Each story has a Firestore document views/<id> holding { count }. A
// reader's browser counts a story at most once a day; firestore.rules only
// lets anyone raise a count by exactly one.

import { firebaseEnabled, firebase } from "./firebase.js?v=20261029";

const SEEN_KEY = "sml-seen";
const MOST_READ = 5;

function seenToday(id) {
  const today = new Date().toISOString().slice(0, 10);
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch (e) {}
  if (seen[id] === today) return true;
  // Forget old days so the list doesn't grow forever.
  for (const key of Object.keys(seen)) if (seen[key] !== today) delete seen[key];
  seen[id] = today;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {}
  return false;
}

async function countView(article) {
  if (seenToday(article.id)) return;
  try {
    const { fs, db } = await firebase();
    await fs.setDoc(fs.doc(db, "views", article.id), { count: fs.increment(1) }, { merge: true });
  } catch (e) { /* counting is best effort */ }
}

async function showMostRead(articles) {
  if (!window.SML_setMostRead) return;
  try {
    const { fs, db } = await firebase();
    const snap = await fs.getDocs(fs.query(fs.collection(db, "views"), fs.orderBy("count", "desc"), fs.limit(30)));
    const byId = new Map(articles.map((a) => [a.id, a]));
    const items = snap.docs
      .filter((d) => byId.has(d.id) && d.data().count > 0)
      .slice(0, MOST_READ)
      .map((d) => ({ article: byId.get(d.id), count: d.data().count }));
    window.SML_setMostRead(items);
  } catch (e) { /* the tab just stays hidden */ }
}

function onEvent(name, globalName, handler) {
  if (window[globalName]) handler(window[globalName]);
  else document.addEventListener(name, (e) => handler(e.detail), { once: true });
}

if (firebaseEnabled()) {
  const page = document.body.dataset.page;
  if (page === "article") onEvent("sml:article", "SML_ARTICLE", countView);
  else if (page === "front") onEvent("sml:articles", "SML_ARTICLES", showMostRead);
}
