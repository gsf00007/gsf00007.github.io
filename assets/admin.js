/*
 * admin.js - edit portfolio.json in the browser.
 * Changes are kept as a draft in this browser until you click "Publish to GitHub"
 * (needs a GitHub token, stored only in your browser) or "Download JSON".
 */
(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---------- field schemas ----------
  // type: text | area | lines (one per line -> array) | csv (comma list -> array) | bool | image
  const PROFILE = [
    ["photo", "Profile photo", "image", "A clear, square-ish headshot works best. It is resized automatically."],
    ["name", "Full name"], ["shortName", "Short name (logo / chatbot)"], ["title", "Job title"],
    ["location", "Location"], ["email", "Email"], ["phone", "Phone (leave empty to hide)"],
    ["linkedin", "LinkedIn URL"], ["github", "GitHub URL"],
    ["cv", "CV link", "text", "e.g. assets/Fahad_CV.pdf after uploading the PDF to the repo"],
    ["availability", "Availability badge"], ["summary", "Summary", "area"],
  ];
  const LISTS = {
    projects: {
      label: "Projects", one: "project", titleKey: "title",
      hint: "Add, edit, reorder or delete projects. Featured projects are shown full-width at the top.",
      fields: [["title", "Title"], ["context", "Context (e.g. MSc Dissertation · University)"], ["year", "Year"],
        ["category", "Category (used for the filter buttons)"], ["featured", "Featured project", "bool"],
        ["description", "Short description", "area"], ["highlights", "Highlights / results", "lines", "One bullet per line"],
        ["tech", "Tech stack", "csv", "Comma separated"], ["link", "Link (GitHub / demo, optional)"],
        ["image", "Project image (optional)", "image", "A screenshot, diagram or demo photo."]],
      blank: { title: "New project", context: "", year: "", category: "", featured: false, description: "", highlights: [], tech: [], link: "", image: "" },
    },
    experience: {
      label: "Experience", one: "role", titleKey: "role", hint: "Jobs and internships, newest first.",
      fields: [["role", "Role"], ["org", "Company"], ["period", "Period"], ["points", "Bullet points", "lines", "One bullet per line"]],
      blank: { role: "New role", org: "", period: "", points: [] },
    },
    skills: {
      label: "Skills", one: "skill group", titleKey: "group", hint: "Skill groups and the skills in each.",
      fields: [["group", "Group name"], ["items", "Skills", "csv", "Comma separated"]],
      blank: { group: "New group", items: [] },
    },
    education: {
      label: "Education", one: "degree", titleKey: "degree", hint: "Degrees, newest first.",
      fields: [["degree", "Degree"], ["school", "University"], ["period", "Period"], ["details", "Details / coursework", "area"]],
      blank: { degree: "New degree", school: "", period: "", details: "" },
    },
  };
  const TABS = [["profile", "Profile"], ["projects", "Projects"], ["experience", "Experience"], ["skills", "Skills"],
    ["education", "Education"], ["other", "Certs & languages"], ["chatbot", "Chatbot (RAG)"], ["publish", "Publish settings"]];

  // ---------- load: draft first, else live file ----------
  let live = null, data = null;
  try { live = await (await fetch("data/portfolio.json?v=" + Date.now())).json(); } catch (e) {}
  try { data = JSON.parse(store.get("portfolio_draft")); } catch (e) {}
  if (!data) data = JSON.parse(JSON.stringify(live || {}));
  let tab = "projects";

  function status(msg) { $("status").textContent = msg; }
  function changed() {
    store.set("portfolio_draft", JSON.stringify(data));
    const same = live && JSON.stringify(live) === JSON.stringify(data);
    status(same ? "No unpublished changes." : "Draft saved in this browser · not published yet");
  }

  // ---------- form helpers ----------
  function toVal(type, v) {
    if (type === "lines") return (v || []).join("\n");
    if (type === "csv") return (v || []).join(", ");
    return v ?? "";
  }
  function fromVal(type, el) {
    if (type === "bool") return el.checked;
    if (type === "lines") return el.value.split("\n").map(s => s.trim()).filter(Boolean);
    if (type === "csv") return el.value.split(",").map(s => s.trim()).filter(Boolean);
    return el.value;
  }
  function fieldHTML([key, label, type = "text", help], obj, path) {
    const id = `${path}.${key}`;
    if (type === "image") {
      const v = obj[key] || "";
      return `<div class="field"><label>${esc(label)}</label>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          ${v ? `<img src="${esc(v)}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`
              : `<div style="width:88px;height:88px;border-radius:12px;border:1px dashed var(--line);display:grid;place-items:center;color:var(--muted);font-size:12px">No image</div>`}
          <label class="btn">📷 ${v ? "Change" : "Upload"} image<input type="file" accept="image/*" hidden data-imgpath="${path}" data-key="${key}"></label>
          ${v ? `<button class="btn" data-imgdel="${path}" data-key="${key}">Remove</button>` : ""}
        </div>
        <small>${esc(help || "")}${v && !v.startsWith("data:") ? ` · File: ${esc(v)}` : v ? " · Will be uploaded to GitHub when you publish" : ""}</small></div>`;
    }
    if (type === "bool")
      return `<div class="field check"><input type="checkbox" id="${id}" data-path="${path}" data-key="${key}" data-type="bool" ${obj[key] ? "checked" : ""}><label for="${id}">${esc(label)}</label></div>`;
    const input = (type === "text")
      ? `<input type="text" id="${id}" value="${esc(toVal(type, obj[key]))}" data-path="${path}" data-key="${key}" data-type="${type}">`
      : `<textarea id="${id}" data-path="${path}" data-key="${key}" data-type="${type}">${esc(toVal(type, obj[key]))}</textarea>`;
    return `<div class="field"><label for="${id}">${esc(label)}</label>${input}${help ? `<small>${esc(help)}</small>` : ""}</div>`;
  }
  function target(path) {           // "profile" | "projects.2" | "chatbot"
    const [a, b] = path.split(".");
    return b === undefined ? data[a] : data[a][+b];
  }

  // ---------- render ----------
  function render() {
    $("tabs").innerHTML = TABS.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}">${l}</button>`).join("");
    const P = $("panel");

    if (tab === "profile") {
      data.profile = data.profile || {};
      P.innerHTML = `<h2>Profile</h2><p class="hint">Your name, headline and contact links.</p>` +
        PROFILE.map(f => fieldHTML(f, data.profile, "profile")).join("");

    } else if (LISTS[tab]) {
      const L = LISTS[tab]; data[tab] = data[tab] || [];
      P.innerHTML = `<h2>${L.label}</h2><p class="hint">${L.hint}</p>` +
        data[tab].map((it, i) => `
          <div class="item" data-i="${i}">
            <div class="item-head" data-toggle="${i}">
              <span class="t">${esc(it[L.titleKey]) || "(untitled)"}</span>
              <button data-act="up" data-i="${i}" title="Move up">↑</button>
              <button data-act="down" data-i="${i}" title="Move down">↓</button>
              <button class="del" data-act="del" data-i="${i}">Delete</button>
            </div>
            <div class="item-body">${L.fields.map(f => fieldHTML(f, it, `${tab}.${i}`)).join("")}</div>
          </div>`).join("") +
        `<button class="btn primary" data-act="add">+ Add ${L.one}</button>`;

    } else if (tab === "other") {
      P.innerHTML = `<h2>Certifications & languages</h2><p class="hint">One per line.</p>
        <div class="field"><label>Certifications</label><textarea id="f-certs">${esc((data.certifications || []).join("\n"))}</textarea></div>
        <div class="field"><label>Languages</label><textarea id="f-langs">${esc((data.languages || []).join("\n"))}</textarea></div>`;

    } else if (tab === "chatbot") {
      data.chatbot = data.chatbot || {};
      P.innerHTML = `<h2>Chatbot (RAG)</h2>
        <p class="hint">The chatbot automatically knows everything on your portfolio. Use "Extra knowledge" for facts that aren't shown on the page (FAQs, notice period, interests…). Separate facts with a blank line - each paragraph becomes one searchable passage.</p>` +
        fieldHTML(["greeting", "Greeting message"], data.chatbot, "chatbot") +
        fieldHTML(["extraKnowledge", "Extra knowledge", "area"], data.chatbot, "chatbot") +
        fieldHTML(["apiUrl", "Backend URL (optional)", "text", "Leave empty = free mode (answers from the best-matching passage). Set to your hosted Flask + Claude backend for written AI answers."], data.chatbot, "chatbot") +
        `<div class="field"><label>Test the chatbot with your current draft</label>
          <div style="display:flex;gap:8px"><input type="text" id="t-q" placeholder="e.g. what did he do at Virufy?"><button class="btn" id="t-go">Ask</button></div>
          <div class="test-out" id="t-out"></div></div>`;
      $("panel").querySelector("#chatbot\\.extraKnowledge").style.minHeight = "180px";

    } else if (tab === "publish") {
      const s = settings();
      P.innerHTML = `<h2>Publish settings</h2>
        <div class="note">"Publish to GitHub" saves <code>data/portfolio.json</code> straight into your repository. GitHub Pages updates the live site about a minute later. Your token is kept only in this browser, never in the website files.</div>
        <div class="field"><label>GitHub username</label><input type="text" id="s-owner" value="${esc(s.owner)}"></div>
        <div class="field"><label>Repository name</label><input type="text" id="s-repo" value="${esc(s.repo)}"><small>e.g. yourname.github.io</small></div>
        <div class="field"><label>Branch</label><input type="text" id="s-branch" value="${esc(s.branch)}"></div>
        <div class="field"><label>Fine-grained access token</label><input type="text" id="s-token" value="${esc(s.token)}" autocomplete="off" style="-webkit-text-security:disc">
          <small>GitHub → Settings → Developer settings → Fine-grained tokens → only this repository → Contents: Read and write.</small></div>
        <div class="field check"><input type="checkbox" id="s-remember" ${s.remember ? "checked" : ""}><label for="s-remember">Remember the token on this computer</label></div>
        <button class="btn primary" id="s-save">Save settings</button>
        <hr style="border:0;border-top:1px solid var(--line);margin:28px 0">
        <h2 style="font-size:18px">Other actions</h2><p class="hint">Import a JSON file, or throw away the draft and reload what's live.</p>
        <div class="btns"><label class="btn">Import JSON<input type="file" id="s-import" accept=".json" hidden></label>
        <button class="btn" id="s-reset">Discard draft</button></div>`;
    }
  }

  // ---------- events ----------
  $("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { tab = b.dataset.tab; render(); } });

  $("panel").addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.path) {
      target(el.dataset.path)[el.dataset.key] = fromVal(el.dataset.type, el);
      const L = LISTS[tab];
      if (L && el.dataset.key === L.titleKey) el.closest(".item").querySelector(".t").textContent = el.value || "(untitled)";
      changed();
    } else if (el.id === "f-certs" || el.id === "f-langs") {
      data[el.id === "f-certs" ? "certifications" : "languages"] = el.value.split("\n").map(s => s.trim()).filter(Boolean);
      changed();
    }
  });
  $("panel").addEventListener("change", e => { if (e.target.dataset.type === "bool") { target(e.target.dataset.path)[e.target.dataset.key] = e.target.checked; changed(); } });

  $("panel").addEventListener("click", async e => {
    const b = e.target.closest("[data-act],[data-toggle],#t-go,#s-save,#s-reset");
    if (!b) return;
    const list = data[tab];
    if (b.dataset.act) {
      e.stopPropagation();
      const i = +b.dataset.i;
      if (b.dataset.act === "add") { list.unshift(JSON.parse(JSON.stringify(LISTS[tab].blank))); changed(); render(); $("panel").querySelector(".item").classList.add("open"); return; }
      if (b.dataset.act === "del" && confirm("Delete this " + LISTS[tab].one + "?")) list.splice(i, 1);
      if (b.dataset.act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      if (b.dataset.act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      changed(); render();
    } else if (b.dataset.toggle !== undefined) {
      b.closest(".item").classList.toggle("open");
    } else if (b.id === "t-go") {
      PortfolioRAG.build(data);
      const q = $("t-q").value;
      const hits = PortfolioRAG.search(q, 3);
      const r = await PortfolioRAG.answer(q, { ...data, chatbot: { ...data.chatbot, apiUrl: "" } });
      $("t-out").style.display = "block";
      $("t-out").textContent = r.text.replace(/\*\*/g, "") + "\n\nTop passages: " +
        (hits.map(h => `${h.title} (${h.score})`).join(", ") || "none");
    } else if (b.id === "s-save") {
      saveSettings(); status("Settings saved.");
    } else if (b.id === "s-reset") {
      if (confirm("Discard all unpublished changes?")) { store.del("portfolio_draft"); data = JSON.parse(JSON.stringify(live)); changed(); render(); }
    }
  });
  // ---------- images: resize in the browser, keep as a draft until publish ----------
  function resizeImage(file, max = 900) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);   // flatten PNG transparency
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Couldn't read that image"));
      img.src = URL.createObjectURL(file);
    });
  }
  $("panel").addEventListener("change", async e => {
    const el = e.target;
    if (!el.dataset.imgpath || !el.files[0]) return;
    status("Processing image…");
    try {
      const keepOpen = el.closest(".item") && el.closest(".item").dataset.i;
      target(el.dataset.imgpath)[el.dataset.key] = await resizeImage(el.files[0], el.dataset.key === "photo" ? 700 : 1200);
      changed(); render();
      if (keepOpen !== undefined) $("panel").querySelector(`.item[data-i="${keepOpen}"]`).classList.add("open");
    } catch (err) { status("❌ " + err.message); }
  });
  $("panel").addEventListener("click", e => {
    const b = e.target.closest("[data-imgdel]"); if (!b) return;
    e.preventDefault();
    const keepOpen = b.closest(".item") && b.closest(".item").dataset.i;
    target(b.dataset.imgdel)[b.dataset.key] = "";
    changed(); render();
    if (keepOpen !== undefined) $("panel").querySelector(`.item[data-i="${keepOpen}"]`).classList.add("open");
  });

  $("panel").addEventListener("change", e => {
    if (e.target.id !== "s-import") return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { data = JSON.parse(t); changed(); status("Imported " + f.name + " as a draft."); })
      .catch(() => alert("That file isn't valid JSON."));
  });

  // ---------- settings ----------
  function settings() {
    let s = {};
    try { s = JSON.parse(store.get("portfolio_settings")) || {}; } catch (e) {}
    const host = location.hostname;
    const guessOwner = host.endsWith(".github.io") ? host.split(".")[0] : "";
    const seg = location.pathname.split("/").filter(Boolean)[0];
    const guessRepo = guessOwner ? (seg && !seg.endsWith(".html") ? seg : host) : "";
    return { owner: s.owner || guessOwner, repo: s.repo || guessRepo, branch: s.branch || "main",
      token: s.token || sessionStorage.getItem("gh_token") || "", remember: !!s.token };
  }
  function saveSettings() {
    const remember = $("s-remember").checked, token = $("s-token").value.trim();
    store.set("portfolio_settings", JSON.stringify({
      owner: $("s-owner").value.trim(), repo: $("s-repo").value.trim(), branch: $("s-branch").value.trim() || "main",
      token: remember ? token : "" }));
    try { sessionStorage.setItem("gh_token", token); } catch (e) {}
  }

  // ---------- bottom bar ----------
  $("b-preview").onclick = () => { changed(); window.open("index.html?preview=1", "_blank"); };
  $("b-download").onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "portfolio.json" });
    a.click(); URL.revokeObjectURL(a.href);
  };
  $("b-publish").onclick = async () => {
    const s = settings();
    if (!s.owner || !s.repo || !s.token) { tab = "publish"; render(); status("Fill in the publish settings first."); return; }
    const api = (path) => `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${path}`;
    const url = api("data/portfolio.json");
    const headers = { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github+json" };
    status("Publishing…");
    try {
      // 1. upload any new images (kept as data: URLs in the draft) and swap in their file paths
      const slug = (t) => String(t || "image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
      const jobs = [];
      if ((data.profile || {}).photo?.startsWith("data:")) jobs.push([data.profile, "photo", "profile-photo"]);
      (data.projects || []).forEach(pr => { if (pr.image?.startsWith("data:")) jobs.push([pr, "image", "project-" + slug(pr.title)]); });
      for (const [n, [obj, key, name]] of jobs.entries()) {
        status(`Uploading image ${n + 1} of ${jobs.length}…`);
        const path = `assets/img/${name}-${Date.now()}.jpg`;
        const r = await fetch(api(path), { method: "PUT", headers, body: JSON.stringify({
          message: "Add image " + name, content: obj[key].split(",")[1], branch: s.branch }) });
        if (!r.ok) throw new Error((await r.json()).message || r.status);
        obj[key] = path;
      }
      if (jobs.length) changed();

      // 2. save portfolio.json
      status("Publishing…");
      const cur = await fetch(`${url}?ref=${encodeURIComponent(s.branch)}`, { headers });
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const text = JSON.stringify(data, null, 2) + "\n";
      const content = btoa(unescape(encodeURIComponent(text)));
      const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify({
        message: "Update portfolio content", content, sha, branch: s.branch }) });
      if (!res.ok) throw new Error((await res.json()).message || res.status);
      live = JSON.parse(JSON.stringify(data));
      store.del("portfolio_draft");
      status("✅ Published! The live site updates in about a minute.");
      render();
    } catch (err) {
      status("❌ Publish failed: " + err.message + " (check username, repo, branch and token)");
    }
  };

  render();
  changed();
})();
