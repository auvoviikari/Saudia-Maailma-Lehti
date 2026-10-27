// Saudia & Maailma Lehti – newsroom. Publishes articles by committing to the GitHub
// repo through the GitHub API. Only someone with a token that has write
// access to the repo can publish; the public pages only ever read news.json.

const $ = (id) => document.getElementById(id);
const STORE_KEY = "ss-admin";
const MAX_IMAGE_WIDTH = 1600;

let cfg = null;          // { owner, repo, branch, folder, token }
let currentFile = null;  // { sha, data } of news.json
let editingId = null;
let editingImage = "";

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
    const err = new Error(`GitHub ${res.status}${detail ? ": " + detail : ""}`);
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

async function readNews() {
  const ref = `?ref=${encodeURIComponent(cfg.branch)}`;
  try {
    const meta = await gh(`/contents/${filePath("news.json")}${ref}`);
    let content = meta.content;
    if (!content) content = (await gh(`/git/blobs/${meta.sha}`)).content; // files over 1 MB
    const data = JSON.parse(base64ToUtf8(content));
    if (!Array.isArray(data.articles)) data.articles = [];
    return { sha: meta.sha, data };
  } catch (err) {
    if (err.status === 404) return { sha: null, data: { articles: [] } };
    throw err;
  }
}

async function writeFile(path, base64, message, sha) {
  return gh(`/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64, branch: cfg.branch, ...(sha ? { sha } : {}) }),
  });
}

// Read news.json, apply a change, write it back. Retries once if someone
// else changed the file in between.
async function updateNews(change, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await readNews();
    change(file.data);
    file.data.articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const json = JSON.stringify(file.data, null, 2) + "\n";
    try {
      const res = await writeFile(filePath("news.json"), utf8ToBase64(json), message, file.sha);
      currentFile = { sha: res.content.sha, data: file.data };
      return;
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt === 0) continue;
      throw err;
    }
  }
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
    body: $("fBody").value.replace(/\r\n/g, "\n").trim(),
  };
}

function resetForm() {
  for (const id of ["fTitle", "fLead", "fCategory", "fCaption", "fBody"]) $(id).value = "";
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
  $("fBody").value = a.body || "";
  if (editingImage) {
    $("imgPreview").src = editingImage;
    $("imgPreview").classList.remove("hidden");
  }
  $("editorTitle").textContent = "Muokkaa uutista";
  $("publishBtn").textContent = "Tallenna muutokset";
  $("cancelEditBtn").classList.remove("hidden");
  $("editorBox").scrollIntoView({ behavior: "smooth" });
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
    if (!cfg.branch) cfg.branch = repoInfo.default_branch;
    $("branch").value = cfg.branch;
    currentFile = await readNews();
    saveCfg();
    setStatus(status, `Kirjautunut: ${cfg.owner}/${cfg.repo} (${cfg.branch})`, "ok");
    $("editorBox").classList.remove("hidden");
    $("listBox").classList.remove("hidden");
    if (!$("fAuthor").value) $("fAuthor").value = "Toimitus";
    renderList();
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

    setStatus(status, "Julkaistaan…");
    const article = {
      id,
      ...data,
      image,
      date: existing ? existing.date : new Date().toISOString(),
      ...(existing ? { updated: new Date().toISOString() } : {}),
    };
    await updateNews((news) => {
      news.articles = news.articles.filter((a) => a.id !== id);
      news.articles.push(article);
    }, `${existing ? "Päivitä" : "Uusi"} uutinen: ${data.title}`);

    resetForm();
    renderList();
    setStatus(status, "Julkaistu! Näkyy sivulla noin minuutin kuluttua.", "ok");
  } catch (err) {
    setStatus(status, "Virhe: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function deleteArticle(a) {
  if (!confirm(`Poistetaanko uutinen "${a.title}"?`)) return;
  const status = $("publishStatus");
  setStatus(status, "Poistetaan…");
  try {
    await updateNews((news) => {
      news.articles = news.articles.filter((x) => x.id !== a.id);
    }, `Poista uutinen: ${a.title}`);
    if (a.image && a.image.startsWith("images/")) {
      try {
        const meta = await gh(`/contents/${filePath(a.image)}?ref=${encodeURIComponent(cfg.branch)}`);
        await gh(`/contents/${filePath(a.image)}`, {
          method: "DELETE",
          body: JSON.stringify({ message: `Poista kuva: ${a.title}`, sha: meta.sha, branch: cfg.branch }),
        });
      } catch (e) { /* the article is gone; a leftover image is harmless */ }
    }
    if (editingId === a.id) resetForm();
    renderList();
    setStatus(status, "Poistettu.", "ok");
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
  box.replaceChildren(preview);
  box.classList.remove("hidden");
}

// ---------- Wire up ----------

$("loginBtn").onclick = login;
$("logoutBtn").onclick = logout;
$("publishBtn").onclick = publish;
$("previewBtn").onclick = showPreview;
$("cancelEditBtn").onclick = resetForm;
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
