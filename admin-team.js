// Saudia & Maailma Lehti – newsroom: team profiles for the "Tapaa tiimi" page.
// Profiles live in team.json in the repo, like the stories, and use the
// GitHub helpers from admin.js.

const TEAM_FILE = "team.json";
const EMPTY_TEAM = { members: [] };
const PHOTO_SIZE = 640;

let team = { members: [] };
let editingMemberId = null;

function teamStatus(msg, kind) {
  setStatus($("teamStatus"), msg, kind);
}

// Square, centred crop so every profile photo looks the same.
function squarePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const out = Math.min(PHOTO_SIZE, side);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = out;
      canvas.getContext("2d").drawImage(
        img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Kuvaa ei voitu lukea")); };
    img.src = url;
  });
}

function memberForm() {
  return {
    name: $("tName").value.trim().replace(/\s+/g, " "),
    role: $("tRole").value.trim(),
    bio: $("tBio").value.replace(/\r\n/g, "\n").trim(),
    email: $("tEmail").value.trim(),
  };
}

function resetMemberForm() {
  for (const id of ["tName", "tRole", "tBio", "tEmail"]) $(id).value = "";
  $("tPhoto").value = "";
  $("tPhotoPreview").classList.add("hidden");
  editingMemberId = null;
  $("teamFormTitle").textContent = "Uusi profiili";
  $("teamSaveBtn").textContent = "Lisää profiili";
  $("teamCancelBtn").classList.add("hidden");
}

function fillAuthorSuggestions() {
  const list = $("authorList");
  list.replaceChildren(...team.members.map((m) => {
    const o = document.createElement("option");
    o.value = m.name;
    return o;
  }));
}

function renderTeam() {
  fillAuthorSuggestions();
  const list = $("teamList");
  if (!team.members.length) {
    list.replaceChildren(el("li", null, "Ei vielä profiileja."));
    return;
  }
  list.replaceChildren(...team.members.map((m, i) => {
    const li = el("li", "team-row");
    const pic = el("div", "team-row__photo");
    if (safeImageUrl(m.photo)) {
      const img = el("img");
      img.src = m.photo;
      img.alt = "";
      // A just-uploaded photo goes live with the next site update.
      img.onerror = () => { pic.textContent = initialsOf(m.name); };
      pic.append(img);
    } else {
      pic.textContent = initialsOf(m.name);
    }
    const text = el("span", null, m.name);
    text.append(el("small", null, m.role || ""));
    const up = el("button", "btn btn--ghost btn--small", "↑");
    up.title = "Siirrä ylemmäs";
    up.disabled = i === 0;
    up.onclick = () => moveMember(m.id, -1);
    const down = el("button", "btn btn--ghost btn--small", "↓");
    down.title = "Siirrä alemmas";
    down.disabled = i === team.members.length - 1;
    down.onclick = () => moveMember(m.id, 1);
    const edit = el("button", "btn btn--ghost btn--small", "Muokkaa");
    edit.onclick = () => startMemberEdit(m);
    const del = el("button", "btn btn--danger btn--small", "Poista");
    del.onclick = () => deleteMember(m);
    li.append(pic, text, up, down, edit, del);
    return li;
  }));
}

function startMemberEdit(m) {
  resetMemberForm();
  editingMemberId = m.id;
  $("tName").value = m.name || "";
  $("tRole").value = m.role || "";
  $("tBio").value = m.bio || "";
  $("tEmail").value = m.email || "";
  if (safeImageUrl(m.photo)) {
    $("tPhotoPreview").src = m.photo;
    $("tPhotoPreview").classList.remove("hidden");
  }
  $("teamFormTitle").textContent = `Muokkaa: ${m.name}`;
  $("teamSaveBtn").textContent = "Tallenna muutokset";
  $("teamCancelBtn").classList.remove("hidden");
  $("teamFormTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveTeam(change, message) {
  team = (await updateJsonFile(TEAM_FILE, EMPTY_TEAM, (data) => {
    if (!Array.isArray(data.members)) data.members = [];
    change(data);
  }, message)).data;
  renderTeam();
}

async function saveMember() {
  const data = memberForm();
  if (!data.name) { teamStatus("Nimi puuttuu.", "err"); return; }
  if (data.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(data.email)) {
    teamStatus("Sähköpostiosoite ei näytä oikealta.", "err");
    return;
  }
  const btn = $("teamSaveBtn");
  btn.disabled = true;
  try {
    const existing = editingMemberId && team.members.find((m) => m.id === editingMemberId);
    const id = existing ? existing.id : `${slugify(data.name)}-${Date.now().toString(36)}`;
    let photo = existing ? existing.photo || "" : "";
    const file = $("tPhoto").files[0];
    if (file) {
      teamStatus("Ladataan kuvaa…");
      const name = `images/tiimi-${id}-${Date.now().toString(36)}.jpg`;
      await writeFile(filePath(name), (await squarePhoto(file)).split(",")[1], `Profiilikuva: ${data.name}`);
      if (photo && photo !== name) await deleteRepoFile(photo, `Poista vanha profiilikuva: ${data.name}`);
      photo = name;
    }
    teamStatus("Tallennetaan…");
    const member = { id, ...data, photo };
    await saveTeam((t) => {
      const i = t.members.findIndex((m) => m.id === id);
      if (i >= 0) t.members[i] = member;
      else t.members.push(member);
    }, `${existing ? "Päivitä" : "Uusi"} profiili: ${data.name}`);
    resetMemberForm();
    teamStatus("Tallennettu! Näkyy sivulla noin minuutin kuluttua.", "ok");
  } catch (err) {
    teamStatus("Virhe: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function moveMember(id, step) {
  teamStatus("Tallennetaan järjestystä…");
  try {
    await saveTeam((t) => {
      const i = t.members.findIndex((m) => m.id === id);
      const j = i + step;
      if (i < 0 || j < 0 || j >= t.members.length) return;
      [t.members[i], t.members[j]] = [t.members[j], t.members[i]];
    }, "Järjestä tiimi");
    teamStatus("Järjestys tallennettu.", "ok");
  } catch (err) {
    teamStatus("Virhe: " + err.message, "err");
  }
}

async function deleteMember(m) {
  if (!confirm(`Poistetaanko profiili "${m.name}"? Hänen juttunsa jäävät sivulle.`)) return;
  teamStatus("Poistetaan…");
  try {
    await saveTeam((t) => { t.members = t.members.filter((x) => x.id !== m.id); }, `Poista profiili: ${m.name}`);
    if (m.photo && m.photo.startsWith("images/")) await deleteRepoFile(m.photo, `Poista profiilikuva: ${m.name}`);
    if (editingMemberId === m.id) resetMemberForm();
    teamStatus("Poistettu.", "ok");
  } catch (err) {
    teamStatus("Virhe: " + err.message, "err");
  }
}

document.addEventListener("sml:github-login", async () => {
  $("teamBox").classList.remove("hidden");
  try {
    const file = await readJsonFile(TEAM_FILE, EMPTY_TEAM);
    team = Array.isArray(file.data.members) ? file.data : { members: [] };
    renderTeam();
  } catch (err) {
    teamStatus("Tiimiä ei voitu ladata: " + err.message, "err");
  }
});

$("teamSaveBtn").onclick = saveMember;
$("teamCancelBtn").onclick = resetMemberForm;
$("tPhoto").onchange = () => {
  const file = $("tPhoto").files[0];
  if (!file) return;
  $("tPhotoPreview").src = URL.createObjectURL(file);
  $("tPhotoPreview").classList.remove("hidden");
};
