/*
 * rag.js - RAG that runs 100% in the browser (free on GitHub Pages).
 *
 *  1. CHUNK    : turn portfolio.json into small passages (one per project, job, skill group...)
 *  2. INDEX    : TF-IDF vector for every passage
 *  3. RETRIEVE : cosine similarity between the question and every passage
 *  4. ANSWER   : free mode   -> pick the most relevant sentences from the top passage
 *                backend mode -> send the passages to your Flask + Claude API (chatbot.apiUrl)
 */
(function () {
  const STOP = new Set(("a an the and or but of to in on at for with by from is are was were be been " +
    "it its this that these those as he his him she her they them their you your i me my we our " +
    "what which who whom how when where why does do did has have had can could would should will " +
    "about tell me please any some there here than then so if into out up more most also all any " +
    "fahad fahad's shaik gundlur").split(" "));

  // Extra words attached to each section so natural questions still match.
  const TAGS = {
    about: "about summary who introduction background profile overview",
    contact: "contact email reach hire linkedin phone get in touch available availability join visa location based",
    skills: "skills skill tech technologies tools stack know languages frameworks expertise good at",
    experience: "experience work worked job jobs intern internship internships company employment career",
    project: "project projects built build made developed portfolio work",
    education: "education study studied studying degree university college masters msc btech bachelor qualification coursework",
    certs: "certifications certificates certified courses",
    langs: "languages speak spoken language",
    extra: ""
  };

  function stem(w) {
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }
  function tokens(text) {
    return (text.toLowerCase().match(/[a-z0-9+#.]+/g) || [])
      .map(w => w.replace(/^\.+|\.+$/g, ""))
      .filter(w => w && !STOP.has(w))
      .map(stem);
  }
  const join = (arr) => (arr || []).filter(Boolean).join(" ");

  // ---------- 1. CHUNK ----------
  function makeChunks(d) {
    const out = [];
    const add = (title, text, kind, boost = "", featured = false) =>
      out.push({ title, text, kind, featured, tagText: (TAGS[kind] || "") + " " + boost });
    const p = d.profile || {};

    add("About " + (p.shortName || p.name),
      `${p.name} is an ${p.title} based in ${p.location}. ${p.summary || ""}`, "about");
    add("Contact & availability",
      [p.email && `Email: ${p.email}.`, p.phone && `Phone: ${p.phone}.`, p.linkedin && `LinkedIn: ${p.linkedin}.`,
       p.github && `GitHub: ${p.github}.`, p.location && `Location: ${p.location}.`, p.availability && `${p.availability}.`]
        .filter(Boolean).join(" "), "contact");

    (d.skills || []).forEach(s => add("Skills: " + s.group, `${s.group}: ${(s.items || []).join(", ")}.`, "skills"));
    (d.experience || []).forEach(e => add(`${e.role} at ${e.org}`,
      `${e.role} at ${e.org} (${e.period}). ${join(e.points)}`, "experience"));
    (d.projects || []).forEach(pr => add(pr.title,
      `${pr.title} (${pr.context}, ${pr.year}). ${pr.description} ${join(pr.highlights)} Technologies used: ${(pr.tech || []).join(", ")}.`,
      "project", `${pr.context} ${pr.context} ${pr.category} ${pr.featured ? "main best biggest major final dissertation thesis" : ""}`, !!pr.featured));
    (d.education || []).forEach(e => add(e.degree,
      `${e.degree} at ${e.school} (${e.period}). ${e.details || ""}`, "education"));
    if ((d.certifications || []).length)
      add("Certifications", `Certifications: ${d.certifications.join(", ")}.`, "certs");
    if ((d.languages || []).length)
      add("Languages", `Languages spoken: ${d.languages.join(", ")}.`, "langs");
    ((d.chatbot && d.chatbot.extraKnowledge) || "").split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
      .forEach(t => add("More about " + (p.shortName || "me"), t, "extra"));
    return out.filter(c => c.text.trim());
  }

  // ---------- 2. INDEX ----------
  let chunks = [], idf = {}, vecs = [];

  function tf(toks) {
    const v = {};
    toks.forEach(t => (v[t] = (v[t] || 0) + 1));
    return v;
  }
  function weigh(counts) {
    const v = {}; let norm = 0;
    for (const t in counts) {
      if (!idf[t]) continue;
      v[t] = (1 + Math.log(counts[t])) * idf[t];
      norm += v[t] * v[t];
    }
    norm = Math.sqrt(norm) || 1;
    for (const t in v) v[t] /= norm;
    return v;
  }

  function build(data) {
    chunks = makeChunks(data);
    const docs = chunks.map(c => tokens(`${c.title} ${c.title} ${c.text} ${c.tagText}`));
    const df = {};
    docs.forEach(toks => new Set(toks).forEach(t => (df[t] = (df[t] || 0) + 1)));
    idf = {};
    for (const t in df) idf[t] = Math.log((1 + docs.length) / (1 + df[t])) + 1;
    vecs = docs.map(toks => weigh(tf(toks)));
    return chunks.length;
  }

  // ---------- 3. RETRIEVE ----------
  // If the question clearly asks about one kind of section, boost that kind.
  const INTENT = {
    project: "project projects built build made dissertation thesis",
    experience: "intern internship internships experience work worked job company",
    education: "study studied studying degree university education coursework",
    skills: "skill skills tools stack frameworks",
    contact: "contact email reach hire phone linkedin available"
  };
  const INTENT_TOKENS = Object.fromEntries(Object.entries(INTENT).map(([k, v]) => [k, new Set(tokens(v))]));

  function search(query, k = 3, minScore = 0.06) {
    const qt = tokens(query);
    const q = weigh(tf(qt));
    const wanted = Object.keys(INTENT_TOKENS).filter(kind => qt.some(t => INTENT_TOKENS[kind].has(t)));
    return vecs
      .map((v, i) => {
        let s = 0;
        for (const t in q) if (v[t]) s += q[t] * v[t];
        if (s > 0 && wanted.includes(chunks[i].kind)) s *= 1.6;
        if (s > 0 && chunks[i].featured) s *= 1.2;          // featured projects win ties
        return { ...chunks[i], score: +s.toFixed(3) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter(r => r.score >= minScore);
  }

  // ---------- 4. ANSWER (free, no LLM) ----------
  function sentencesOf(text) {
    // split only where a sentence really ends (keeps "B.Tech", "0.91", "gmail.com" intact)
    return text.split(/(?<=[.!?])\s+(?=[A-Z(])/).map(s => s.trim()).filter(Boolean);
  }
  function extractive(question, hits) {
    // show the top passage, plus the 2nd one if it is almost as relevant and the same kind
    const parts = [summarise(question, hits[0])];
    if (hits[1] && hits[1].kind === hits[0].kind && hits[1].score >= hits[0].score * 0.7)
      parts.push(summarise(question, hits[1]));
    return parts.join("\n\n");
  }
  function summarise(question, top) {
    const qt = new Set(tokens(question));
    const sentences = sentencesOf(top.text);
    const ranked = sentences
      .map((s, i) => ({ s: s.trim(), i, score: tokens(s).filter(t => qt.has(t)).length }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, 3)
      .sort((a, b) => a.i - b.i);
    let answer = ranked.map(r => r.s).join(" ");
    if (ranked.every(r => r.score === 0)) answer = sentences.slice(0, 3).join(" ");
    return `**${top.title}**\n${answer}`;
  }

  // "what projects has he built?" -> list every project instead of guessing one
  const LIST_LABEL = { project: "Projects", experience: "Experience", education: "Education", skills: "Skills" };
  function listAnswer(question) {
    const qt = tokens(question);
    const kinds = Object.keys(LIST_LABEL).filter(k => qt.some(t => INTENT_TOKENS[k].has(t)));
    if (kinds.length !== 1) return null;
    const general = qt.every(t => INTENT_TOKENS[kinds[0]].has(t) || ["list", "all", "show", "give", "ha", "done", "doe"].includes(t));
    if (!general) return null;
    const items = chunks.filter(c => c.kind === kinds[0]);
    if (!items.length) return null;
    return { text: `**${LIST_LABEL[kinds[0]]}**\n` + items.map(c => "• " + c.title).join("\n") +
      "\n\nAsk me about any of these for details.", sources: [] };
  }

  async function answer(question, data, history) {
    const hits = search(question);
    const api = data.chatbot && data.chatbot.apiUrl;

    if (api) {
      try {
        const res = await fetch(api.replace(/\/$/, "") + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: question,
            history: history || [],
            context: hits.map(h => ({ source: h.title, text: h.text, score: h.score }))
          })
        });
        const j = await res.json();
        if (j.answer) return { text: j.answer, sources: hits };
      } catch (e) { /* backend asleep or offline: fall back to free mode */ }
    }

    const list = listAnswer(question);
    if (list) return list;

    if (!hits.length) {
      const email = data.profile && data.profile.email;
      return {
        text: "I couldn't find that in the portfolio." + (email ? ` You can ask directly at ${email}.` : ""),
        sources: []
      };
    }
    return { text: extractive(question, hits), sources: hits };
  }

  window.PortfolioRAG = { build, search, answer, makeChunks, tokens };
})();
