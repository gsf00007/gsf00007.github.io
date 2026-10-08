/* app.js - draws the portfolio from data/portfolio.json and runs the chat widget. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- load data (admin "Preview" uses the unsaved draft) ----------
  let data;
  const preview = new URLSearchParams(location.search).has("preview");
  if (preview) {
    try { data = JSON.parse(localStorage.getItem("portfolio_draft")); } catch (e) {}
  }
  if (!data) {
    const res = await fetch("data/portfolio.json?v=" + Date.now());
    data = await res.json();
  }
  const p = data.profile || {};

  // ---------- hero ----------
  document.title = `${p.shortName || p.name} · ${p.title}`;
  $("logo").textContent = p.shortName || p.name;
  $("name").textContent = p.name;
  $("role").textContent = `${p.title} · ${p.location}`;
  $("summary").textContent = p.summary;
  if (p.photo) {
    $("photo").src = p.photo;
    $("photo").alt = "Photo of " + p.name;
    $("photo-wrap").hidden = false;
    document.querySelector(".hero").classList.add("has-photo");
  }
  $("availability").textContent = p.availability || "Open to opportunities";
  if (!p.availability) $("availability").style.display = "none";

  const links = [
    p.email && `<a class="btn primary" href="mailto:${esc(p.email)}">✉ Email me</a>`,
    p.linkedin && `<a class="btn" href="${esc(p.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
    p.github && `<a class="btn" href="${esc(p.github)}" target="_blank" rel="noopener">GitHub</a>`,
    p.cv && `<a class="btn" href="${esc(p.cv)}" target="_blank" rel="noopener">Download CV</a>`,
  ].filter(Boolean).join("");
  $("hero-btns").innerHTML = links + `<button class="btn" id="hero-chat">💬 Ask my AI</button>`;
  $("contact-btns").innerHTML = links;
  $("contact-line").textContent = [p.email, p.phone, p.location].filter(Boolean).join(" · ");

  // ---------- projects with category filter ----------
  const projects = data.projects || [];
  const cats = ["All", ...new Set(projects.map(x => x.category).filter(Boolean))];
  let activeCat = "All";

  function drawProjects() {
    const list = projects.filter(x => activeCat === "All" || x.category === activeCat);
    $("project-grid").innerHTML = list.map((x, i) => {
      const hl = x.highlights || [];
      const shown = x.featured ? hl : hl.slice(0, 2);
      return `
      <article class="card ${x.featured && activeCat === "All" ? "featured" : ""} ${x.image ? "has-img" : ""}">
        ${x.image ? `<img class="card-img" src="${esc(x.image)}" alt="${esc(x.title)}" loading="lazy">` : ""}
        <div class="meta"><span class="cat">${esc(x.category)}</span><span>${esc(x.year)}</span></div>
        <h3>${esc(x.title)}</h3>
        <div class="meta"><span>${esc(x.context)}</span></div>
        <p>${esc(x.description)}</p>
        ${shown.length ? `<ul data-i="${i}">${shown.map(h => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        ${hl.length > shown.length ? `<button class="more" data-title="${esc(x.title)}">Show ${hl.length - shown.length} more</button>` : ""}
        ${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">View project →</a>` : ""}
        <div class="tags">${(x.tech || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </article>`;
    }).join("");
  }
  $("filters").innerHTML = cats.length > 2
    ? cats.map(c => `<button class="chip ${c === "All" ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")
    : "";
  $("filters").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    activeCat = b.dataset.cat;
    document.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === b));
    drawProjects();
  });
  $("project-grid").addEventListener("click", e => {
    const b = e.target.closest(".more"); if (!b) return;
    const x = projects.find(pr => pr.title === b.dataset.title);
    const ul = b.previousElementSibling;
    ul.innerHTML = x.highlights.map(h => `<li>${esc(h)}</li>`).join("");
    b.remove();
  });
  drawProjects();

  // ---------- experience, skills, education ----------
  $("exp-list").innerHTML = (data.experience || []).map(e => `
    <div class="tl-item">
      <div class="when">${esc(e.period)}</div>
      <div><h3>${esc(e.role)}</h3><div class="org">${esc(e.org)}</div>
      <ul>${(e.points || []).map(pt => `<li>${esc(pt)}</li>`).join("")}</ul></div>
    </div>`).join("");

  $("skill-list").innerHTML = (data.skills || []).map(s => `
    <div class="card"><h3>${esc(s.group)}</h3>
    <div class="tags">${(s.items || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>`).join("");

  $("edu-list").innerHTML = (data.education || []).map(e => `
    <div class="tl-item">
      <div class="when">${esc(e.period)}</div>
      <div><h3>${esc(e.degree)}</h3><div class="org">${esc(e.school)}</div><p>${esc(e.details)}</p></div>
    </div>`).join("");

  $("certs").innerHTML = (data.certifications || []).map(c => `<span class="tag">${esc(c)}</span>`).join("");
  $("langs").innerHTML = (data.languages || []).map(c => `<span class="tag">${esc(c)}</span>`).join("");

  // ---------- chat widget (RAG) ----------
  const n = PortfolioRAG.build(data);
  console.log(`[RAG] indexed ${n} passages`);
  const history = [];
  const log = $("chat-log"), panel = $("chat-panel");

  function fmt(text) {   // tiny markdown: **bold** + line breaks
    return esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function bubble(text, who, sources) {
    const d = document.createElement("div");
    d.className = "bubble " + who;
    d.innerHTML = fmt(text) + (sources && sources.length
      ? `<div class="src">Sources: ${sources.map(s => esc(s.title)).join(" · ")}</div>` : "");
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  async function ask(q) {
    q = q.trim(); if (!q) return;
    $("suggest").style.display = "none";
    bubble(q, "me");
    const thinking = bubble("…", "bot");
    const r = await PortfolioRAG.answer(q, data, history);
    thinking.remove();
    bubble(r.text, "bot", r.sources);
    history.push({ role: "user", content: q }, { role: "assistant", content: r.text });
  }

  bubble((data.chatbot && data.chatbot.greeting) || "Hi! Ask me anything about this portfolio.", "bot");
  const suggestions = ["What is his MSc project?", "What skills does he have?", "Where did he intern?", "How can I contact him?"];
  $("suggest").innerHTML = suggestions.map(s => `<button>${esc(s)}</button>`).join("");
  $("suggest").addEventListener("click", e => { if (e.target.tagName === "BUTTON") ask(e.target.textContent); });

  const open = () => { panel.classList.add("open"); $("chat-input").focus(); };
  $("chat-fab").onclick = () => panel.classList.contains("open") ? panel.classList.remove("open") : open();
  $("chat-close").onclick = () => panel.classList.remove("open");
  $("hero-chat").onclick = open;
  $("chat-form").addEventListener("submit", e => {
    e.preventDefault();
    const inp = $("chat-input"); const q = inp.value; inp.value = ""; ask(q);
  });
})();
