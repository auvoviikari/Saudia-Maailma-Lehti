// Saudia & Maailma Lehti – newsroom. Publishes articles by committing to the GitHub
// repo through the GitHub API. Only someone with a token that has write
// access to the repo can publish; the public pages only ever read news.json.

const $ = (id) => document.getElementById(id);
const STORE_KEY = "ss-admin";
const MAX_IMAGE_WIDTH = 1600;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

let cfg = null;          // { owner, repo, branch, folder, token }
let currentFile = null;  // { sha, data } of news.json
let editingId = null;
let editingImage = "";
// Photos and videos inside the story text. Each is
// { type: "image"|"video"|"youtube", src?, file?, url?, youtube?, caption }.
let media = [];

function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = "status" + (kind ? ` status--${kind}` : "");
}

function saveCfg() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) {}
}

function loadCfg() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
}

// ---------- GitHub API ----------

async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) {}
    let text = `GitHub ${res.status}${detail ? ": " + detail : ""}`;
    if (res.status === 403 && /personal access token/i.test(detail)) {
      text = "Tokenilla ei ole kirjoitusoikeutta. Muokkaa tokenia GitHubissa: " +
        "Repository access → Only select repositories → tämä repo, ja " +
        "Permissions → Contents → Read and write. Kirjaudu sitten uudelleen.";
    }
    const err = new Error(text);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

function filePath(name) {
  const folder = cfg.folder.replace(/^\/+|\/+$/g, "");
  return folder ? `${folder}/${name}` : name;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Reads a JSON file from the repo: { sha, data }, or the given empty value.
async function readJsonFile(name, empty) {
  const ref = `?ref=${encodeURIComponent(cfg.branch)}`;
  try {
    const meta = await gh(`/contents/${filePath(name)}${ref}`);
    let content = meta.content;
    if (!content) content = (await gh(`/git/blobs/${meta.sha}`)).content; // files over 1 MB
    return { sha: meta.sha, data: JSON.parse(base64ToUtf8(content)) };
  } catch (err) {
    if (err.status === 404) return { sha: null, data: empty };
    throw err;
  }
}

// Reads a JSON file, applies a change and writes it back. Retries once if
// someone else changed the file in between. Returns { sha, data }.
async function updateJsonFile(name, empty, change, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await readJsonFile(name, empty);
    change(file.data);
    const json = JSON.stringify(file.data, null, 2) + "\n";
    try {
      const res = await writeFile(filePath(name), utf8ToBase64(json), message, file.sha);
      return { sha: res.content.sha, data: file.data };
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt === 0) continue;
      throw err;
    }
  }
}

async function readNews() {
  const file = await readJsonFile("news.json", { articles: [] });
  if (!Array.isArray(file.data.articles)) file.data.articles = [];
  return file;
}

async function writeFile(path, base64, message, sha) {
  return gh(`/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64, branch: cfg.branch, ...(sha ? { sha } : {}) }),
  });
}

async function updateNews(change, message) {
  currentFile = await updateJsonFile("news.json", { articles: [] }, (data) => {
    if (!Array.isArray(data.articles)) data.articles = [];
    change(data);
    data.articles.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, message);
}

// ---------- Images ----------

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Kuvaa ei voitu lukea")); };
    img.src = url;
  });
}

// ---------- Helpers ----------

function slugify(text) {
  return text.toLowerCase()
    .replace(/[äå]/g, "a").replace(/ö/g, "o")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || "uutinen";
}

function formArticle() {
  return {
    title: $("fTitle").value.trim(),
    lead: $("fLead").value.trim(),
    category: $("fCategory").value.trim(),
    author: $("fAuthor").value.trim(),
    imageCaption: $("fCaption").value.trim(),
    imageText: $("fImageText").value.trim(),
    body: $("fBody").value.replace(/\r\n/g, "\n").trim(),
  };
}

function resetForm() {
  for (const id of ["fTitle", "fLead", "fCategory", "fCaption", "fImageText", "fBody"]) $(id).value = "";
  for (const item of media) if (item.url) URL.revokeObjectURL(item.url);
  media = [];
  renderMedia();
  $("fImage").value = "";
  $("imgPreview").classList.add("hidden");
  $("preview").classList.add("hidden");
  editingId = null;
  editingImage = "";
  $("editorTitle").textContent = "Uusi uutinen";
  $("publishBtn").textContent = "Julkaise";
  $("cancelEditBtn").classList.add("hidden");
}

function renderList() {
  const list = $("articleList");
  const articles = currentFile ? currentFile.data.articles : [];
  if (!articles.length) {
    list.replaceChildren(el("li", null, "Ei vielä uutisia."));
    return;
  }
  list.replaceChildren(...articles.map((a) => {
    const li = el("li");
    const text = el("span", null, a.title);
    text.append(el("small", null, formatDate(a.date)));
    const edit = el("button", "btn btn--ghost btn--small", "Muokkaa");
    edit.onclick = () => startEdit(a);
    const del = el("button", "btn btn--danger btn--small", "Poista");
    del.onclick = () => deleteArticle(a);
    li.append(text, edit, del);
    return li;
  }));
}

function startEdit(a) {
  resetForm();
  editingId = a.id;
  editingImage = a.image || "";
  $("fTitle").value = a.title || "";
  $("fLead").value = a.lead || "";
  $("fCategory").value = a.category || "";
  $("fAuthor").value = a.author || "";
  $("fCaption").value = a.imageCaption || "";
  $("fImageText").value = a.imageText || "";
  $("fBody").value = a.body || "";
  media = (Array.isArray(a.media) ? a.media : []).map((m) => ({ ...m, caption: m.caption || "" }));
  renderMedia();
  if (editingImage) {
    $("imgPreview").src = editingImage;
    $("imgPreview").classList.remove("hidden");
  }
  $("editorTitle").textContent = "Muokkaa uutista";
  $("publishBtn").textContent = "Tallenna muutokset";
  $("cancelEditBtn").classList.remove("hidden");
  window.SML_openSection("editorBox");
  $("editorBox").scrollIntoView({ behavior: "smooth" });
}

// ---------- Photos and videos in the story ----------

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Tiedostoa ei voitu lukea"));
    reader.readAsDataURL(file);
  });
}

// Puts "[media N]" on its own paragraph at the cursor in the story text.
function insertToken(n) {
  const box = $("fBody");
  const token = `[media ${n}]`;
  const start = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? start;
  const before = box.value.slice(0, start).replace(/\s+$/, "");
  const after = box.value.slice(end).replace(/^\s+/, "");
  box.value = [before, token, after].filter(Boolean).join("\n\n");
  const pos = (before ? before.length + 2 : 0) + token.length;
  box.focus();
  box.setSelectionRange(pos, pos);
}

// After removing item n (1-based), drop its marker and renumber the rest.
function removeToken(n) {
  const box = $("fBody");
  box.value = box.value
    .split(/\n\s*\n/)
    .filter((p) => {
      const m = p.trim().match(/^\[media (\d+)\]$/i);
      return !(m && Number(m[1]) === n);
    })
    .map((p) => p.replace(/^(\s*)\[media (\d+)\](\s*)$/i, (all, a, num, b) =>
      Number(num) > n ? `${a}[media ${Number(num) - 1}]${b}` : all))
    .join("\n\n");
}

function addMedia(item) {
  media.push({ caption: "", ...item });
  insertToken(media.length);
  renderMedia();
}

function mediaThumb(item) {
  if (item.type === "youtube") {
    const img = el("img", "media-item__thumb");
    img.src = `https://i.ytimg.com/vi/${youtubeId(item.youtube)}/mqdefault.jpg`;
    img.alt = "";
    return img;
  }
  const src = item.url || safeImageUrl(item.src);
  if (item.type === "video") {
    const v = el("video", "media-item__thumb");
    if (src) v.src = src;
    v.muted = true;
    v.preload = "metadata";
    return v;
  }
  const img = el("img", "media-item__thumb");
  img.src = src;
  img.alt = "";
  return img;
}

function renderMedia() {
  const list = $("mediaList");
  list.replaceChildren(...media.map((item, i) => {
    const n = i + 1;
    const li = el("li", "media-item");
    const info = el("div");
    const top = el("div", "media-item__top");
    const kind = { image: "Kuva", video: "Video", youtube: "YouTube" }[item.type];
    const name = item.file ? item.file.name : item.type === "youtube" ? item.youtube : item.src;
    top.append(el("span", "media-item__tag", `[media ${n}]`), el("span", "media-item__name", `${kind} · ${name}`));
    const caption = el("input");
    caption.placeholder = "Kuvateksti (valinnainen)";
    caption.maxLength = 300;
    caption.value = item.caption;
    caption.oninput = () => { item.caption = caption.value; };
    const actions = el("div", "actions");
    const place = el("button", "btn btn--ghost btn--small", "Lisää tekstiin kursorin kohtaan");
    place.type = "button";
    place.onclick = () => insertToken(n);
    const remove = el("button", "btn btn--danger btn--small", "Poista");
    remove.type = "button";
    remove.onclick = () => {
      if (item.url) URL.revokeObjectURL(item.url);
      media.splice(i, 1);
      removeToken(n);
      renderMedia();
    };
    actions.append(place, remove);
    info.append(top, caption, actions);
    li.append(mediaThumb(item), info);
    return li;
  }));
}

// Uploads new files and returns the media list as stored in news.json.
async function uploadMedia(id, title, status) {
  const stored = [];
  for (const [i, item] of media.entries()) {
    const caption = item.caption.trim();
    if (item.type === "youtube") {
      stored.push({ type: "youtube", youtube: youtubeId(item.youtube), caption });
      continue;
    }
    let src = item.src;
    if (item.file) {
      setStatus(status, `Ladataan ${item.type === "video" ? "videota" : "kuvaa"} ${i + 1}/${media.length}…`);
      const stamp = Date.now().toString(36);
      if (item.type === "video") {
        src = `media/${id}-${i + 1}-${stamp}.${VIDEO_TYPES[item.file.type] || "mp4"}`;
        await writeFile(filePath(src), await readAsBase64(item.file), `Video: ${title}`);
      } else {
        src = `images/${id}-${i + 1}-${stamp}.jpg`;
        await writeFile(filePath(src), (await resizeImage(item.file)).split(",")[1], `Kuva: ${title}`);
      }
      item.src = src;
      item.file = null;
    }
    stored.push({ type: item.type, src, caption });
  }
  return stored;
}

// Creates or replaces a file, looking up the current version when it exists.
async function putFile(path, base64, message) {
  let sha;
  try {
    sha = (await gh(`/contents/${filePath(path)}?ref=${encodeURIComponent(cfg.branch)}`)).sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  return writeFile(filePath(path), base64, message, sha);
}

async function deleteRepoFile(path, message) {
  try {
    const meta = await gh(`/contents/${filePath(path)}?ref=${encodeURIComponent(cfg.branch)}`);
    await gh(`/contents/${filePath(path)}`, {
      method: "DELETE",
      body: JSON.stringify({ message, sha: meta.sha, branch: cfg.branch }),
    });
  } catch (e) { /* a leftover file is harmless */ }
}

// GitHub Pages takes a minute or two to rebuild after each change. Poll the
// public news.json and tell the user once the change is actually live.
let liveCheck = 0;
async function waitUntilLive(isLive, status, doneMsg) {
  const run = ++liveCheck;
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 8000));
    if (run !== liveCheck) return; // a newer action took over the status line
    try {
      if (isLive(await loadArticles())) {
        setStatus(status, doneMsg, "ok");
        return;
      }
    } catch (e) { /* keep waiting */ }
    const secs = Math.round((Date.now() - started) / 1000);
    setStatus(status, `Tallennettu. Odotetaan, että sivu päivittyy… (${secs} s)`);
  }
  if (run === liveCheck) {
    setStatus(status, "Tallennettu, mutta sivun päivitys kestää tavallista kauemmin. Tarkista sivu hetken päästä.", "ok");
  }
}

// ---------- Actions ----------

async function login() {
  cfg = {
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim(),
    folder: $("folder").value.trim(),
    token: $("token").value.trim(),
  };
  const status = $("loginStatus");
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    setStatus(status, "Täytä käyttäjä, repo ja token.", "err");
    return;
  }
  setStatus(status, "Tarkistetaan…");
  try {
    const repoInfo = await gh("");
    if (!repoInfo.permissions || !repoInfo.permissions.push) {
      throw new Error("Tällä tokenilla ei ole kirjoitusoikeutta repoon.");
    }
    // GitHub follows renames, so take the repo's current name from the reply.
    cfg.owner = repoInfo.owner.login;
    cfg.repo = repoInfo.name;
    $("owner").value = cfg.owner;
    $("repo").value = cfg.repo;
    if (!cfg.branch) cfg.branch = repoInfo.default_branch;
    $("branch").value = cfg.branch;
    currentFile = await readNews();
    saveCfg();
    setStatus(status, `Kirjautunut: ${cfg.owner}/${cfg.repo} (${cfg.branch})`, "ok");
    $("editorBox").classList.remove("hidden");
    $("listBox").classList.remove("hidden");
    if (!$("fAuthor").value) $("fAuthor").value = "Toimitus";
    renderList();
    window.SML_closeSection("loginBox");
    document.dispatchEvent(new CustomEvent("sml:github-login"));
  } catch (err) {
    setStatus(status, err.status === 401 ? "Token ei kelpaa." : err.message, "err");
  }
}

function logout() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  location.reload();
}

async function publish() {
  const status = $("publishStatus");
  liveCheck++;
  const data = formArticle();
  if (!data.title) { setStatus(status, "Otsikko puuttuu.", "err"); return; }
  if (!data.body) { setStatus(status, "Teksti puuttuu.", "err"); return; }

  const btn = $("publishBtn");
  btn.disabled = true;
  try {
    const existing = editingId && currentFile.data.articles.find((a) => a.id === editingId);
    const id = existing ? existing.id
      : `${slugify(data.title)}-${Date.now().toString(36)}`;

    let image = existing ? editingImage : "";
    const file = $("fImage").files[0];
    if (file) {
      setStatus(status, "Ladataan kuvaa…");
      const dataUrl = await resizeImage(file);
      const name = `images/${id}-${Date.now().toString(36)}.jpg`;
      await writeFile(filePath(name), dataUrl.split(",")[1], `Kuva: ${data.title}`);
      image = name;
    }

    const storedMedia = await uploadMedia(id, data.title, status);

    setStatus(status, "Julkaistaan…");
    const article = {
      id,
      ...data,
      image,
      media: storedMedia,
      page: sharePagePath({ id }),
      date: existing ? existing.date : new Date().toISOString(),
      ...(existing ? { updated: new Date().toISOString() } : {}),
    };
    // The story's own page carries the link preview for chat apps.
    const siteUrl = new URL(".", location.href).href;
    await putFile(article.page, utf8ToBase64(sharePageHtml(article, siteUrl)), `Jakosivu: ${data.title}`);
    await updateNews((news) => {
      news.articles = news.articles.filter((a) => a.id !== id);
      news.articles.push(article);
    }, `${existing ? "Päivitä" : "Uusi"} uutinen: ${data.title}`);

    resetForm();
    renderList();
    setStatus(status, "Tallennettu. Odotetaan, että sivu päivittyy…");
    const stamp = article.updated || article.date;
    waitUntilLive(
      (list) => list.some((a) => a.id === id && (a.updated || a.date) === stamp),
      status,
      existing ? "✓ Muutokset näkyvät nyt sivulla." : "✓ Uutinen näkyy nyt sivulla.",
    );
  } catch (err) {
    setStatus(status, "Virhe: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function deleteArticle(a) {
  if (!confirm(`Poistetaanko uutinen "${a.title}"?`)) return;
  const status = $("publishStatus");
  liveCheck++;
  setStatus(status, "Poistetaan…");
  try {
    await updateNews((news) => {
      news.articles = news.articles.filter((x) => x.id !== a.id);
    }, `Poista uutinen: ${a.title}`);
    const files = [a.image, a.page, ...(Array.isArray(a.media) ? a.media.map((m) => m.src) : [])]
      .filter((f) => f && /^(images|media|uutiset)\//.test(f));
    for (const f of files) await deleteRepoFile(f, `Poista tiedosto: ${a.title}`);
    if (editingId === a.id) resetForm();
    renderList();

    // The story's comments live in Firebase; admin-comments.js removes them
    // when the owner is signed in there.
    let note = "";
    if (window.SML_deleteArticleComments) {
      const removed = await window.SML_deleteArticleComments(a.id);
      if (removed === null) note = " Kirjaudu Kommentit-osioon, niin voit poistaa myös uutisen kommentit.";
      else if (removed > 0) note = ` Myös ${removed} kommenttia poistettiin.`;
    }
    setStatus(status, "Poistettu. Odotetaan, että sivu päivittyy…" + note);
    waitUntilLive(
      (list) => !list.some((x) => x.id === a.id),
      status,
      "✓ Uutinen on poistettu sivulta." + note,
    );
  } catch (err) {
    setStatus(status, "Virhe: " + err.message, "err");
  }
}

async function showPreview() {
  const data = formArticle();
  const article = { ...data, title: data.title || "Otsikko", date: new Date().toISOString(), image: "" };
  const file = $("fImage").files[0];
  const box = $("preview");
  // Preview the story as it will look at the top of the front page.
  const preview = hero(article);
  preview.removeAttribute("href");
  const src = file ? URL.createObjectURL(file) : editingImage;
  if (src) {
    const pic = preview.querySelector(".photo");
    pic.classList.remove("photo--empty");
    const img = el("img");
    img.src = src;
    img.alt = "";
    pic.replaceChildren(img, ...(data.imageCaption ? [el("div", "nametag", data.imageCaption)] : []));
  }
  // ...followed by the story page body, with photos and videos in place.
  const body = el("div", "article-body");
  if (data.imageText && src) body.append(el("p", "article-body__photo-text", data.imageText));
  const local = { ...article, media: media.map((m) => ({ ...m, src: m.url || m.src })) };
  body.append(articleText(local, (s) => (String(s).startsWith("blob:") ? s : safeImageUrl(s))));
  box.replaceChildren(preview, body);
  box.classList.remove("hidden");
}

// ---------- Wire up ----------

$("loginBtn").onclick = login;
$("logoutBtn").onclick = logout;
$("publishBtn").onclick = publish;
$("previewBtn").onclick = showPreview;
$("cancelEditBtn").onclick = resetForm;
$("addImageBtn").onclick = () => $("mediaImageInput").click();
$("addVideoBtn").onclick = () => $("mediaVideoInput").click();
$("mediaImageInput").onchange = () => {
  for (const file of $("mediaImageInput").files) {
    addMedia({ type: "image", file, url: URL.createObjectURL(file) });
  }
  $("mediaImageInput").value = "";
};
$("mediaVideoInput").onchange = () => {
  const file = $("mediaVideoInput").files[0];
  $("mediaVideoInput").value = "";
  if (!file) return;
  if (!VIDEO_TYPES[file.type]) {
    setStatus($("publishStatus"), "Video pitää olla MP4-, WebM- tai MOV-muodossa.", "err");
    return;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    setStatus($("publishStatus"), `Video on liian iso (${mb} Mt, enintään 25 Mt). Laita se YouTubeen ja lisää linkkinä.`, "err");
    return;
  }
  setStatus($("publishStatus"), "");
  addMedia({ type: "video", file, url: URL.createObjectURL(file) });
};
$("addYoutubeBtn").onclick = () => {
  const link = prompt("Liitä YouTube-videon linkki:");
  if (link == null) return;
  const id = youtubeId(link);
  if (!id) {
    setStatus($("publishStatus"), "Linkki ei ole kelvollinen YouTube-linkki.", "err");
    return;
  }
  setStatus($("publishStatus"), "");
  addMedia({ type: "youtube", youtube: id });
};
$("fImage").onchange = () => {
  const file = $("fImage").files[0];
  if (!file) return;
  $("imgPreview").src = URL.createObjectURL(file);
  $("imgPreview").classList.remove("hidden");
};

const saved = loadCfg();
if (saved) {
  for (const key of ["owner", "repo", "branch", "folder", "token"]) {
    if (saved[key] != null) $(key).value = saved[key];
  }
  if (saved.token) login();
}
