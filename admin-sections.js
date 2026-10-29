// Saudia & Maailma Lehti – newsroom: every box opens and closes from its
// heading. Which boxes are closed is remembered in this browser.

const SECTIONS_KEY = "sml-admin-closed";

function closedSections() {
  try { return new Set(JSON.parse(localStorage.getItem(SECTIONS_KEY) || "[]")); } catch (e) { return new Set(); }
}

function rememberSection(id, closed) {
  const set = closedSections();
  if (closed) set.add(id); else set.delete(id);
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...set])); } catch (e) {}
}

function setSectionOpen(box, open) {
  box.classList.toggle("is-closed", !open);
  box.querySelector(":scope > h2").setAttribute("aria-expanded", String(open));
}

// Opens a box, e.g. when "Muokkaa" is pressed for something inside it.
window.SML_openSection = (id) => {
  const box = document.getElementById(id);
  if (!box || !box.classList.contains("is-closed")) return;
  setSectionOpen(box, true);
  rememberSection(id, false);
};

// Closes a box without remembering it, e.g. the login box once logged in.
window.SML_closeSection = (id) => {
  const box = document.getElementById(id);
  if (box) setSectionOpen(box, false);
};

(function setUpSections() {
  const closed = closedSections();
  for (const box of document.querySelectorAll(".admin__box")) {
    const head = box.querySelector(":scope > h2");
    if (!head) continue;
    // Everything after the heading goes into a body that can be hidden.
    const body = document.createElement("div");
    body.className = "admin__body";
    while (head.nextSibling) body.append(head.nextSibling);
    box.append(body);

    head.classList.add("admin__toggle");
    head.tabIndex = 0;
    head.setAttribute("role", "button");
    setSectionOpen(box, !closed.has(box.id));
    const toggle = () => {
      const open = box.classList.contains("is-closed");
      setSectionOpen(box, open);
      rememberSection(box.id, !open);
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  }
})();
