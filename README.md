# Fahad's Portfolio (GitHub Pages + RAG chatbot)

100% free. No server, no database, no build step.

```
index.html                 <- the portfolio page (GitHub Pages root)
admin.html                 <- the editor (add / edit / delete projects etc.)
data/portfolio.json        <- ALL your content lives here
assets/                    <- site styles and JavaScript
rag-backend-optional/      <- optional Flask backend for AI-written answers
```

---

## 1. Put it on GitHub Pages (one time, ~10 minutes)

1. Make a free account at **github.com** (if you don't have one).
2. Click **+ → New repository**.
   - Name it exactly **`YOUR-USERNAME.github.io`** (e.g. `fahadshaik07.github.io`). Your site will be `https://YOUR-USERNAME.github.io`
   - Public → **Create repository**.
3. Push this project to the repository's `main` branch. The site files (`index.html`, `admin.html`, `README.md`, `data/`, and `assets/`) are at the repository root; `rag-backend-optional/` contains the optional chatbot backend.
4. Go to **Settings → Pages**. Under *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, folder **/ (root)** → **Save**.
5. Wait 1–2 minutes and open `https://YOUR-USERNAME.github.io`. Done! 🎉

## 2. Let the editor save to GitHub (one time)

1. GitHub → your profile picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name: `portfolio editor` · Expiration: 1 year · **Repository access: Only select repositories → your `.github.io` repo**.
3. **Permissions → Repository permissions → Contents → Read and write**. Generate and copy the token.
4. Open `https://YOUR-USERNAME.github.io/admin.html` → **Publish settings** → paste the token (username + repo are filled in automatically) → **Save settings**.

> The token is saved only in *your* browser. It is never in the website files, so visitors can't use it.
> Anyone can open `admin.html`, but without your token they can only play with a draft in their own browser and can't change your site.

## 3. Everyday use: add or change things

1. Open `/admin.html`.
2. Edit anything: **Projects → + Add project**, reorder with ↑ ↓, **Delete**, etc. Changes are kept as a draft in your browser.
3. **Preview** opens the site with your draft.
4. **Publish to GitHub**. The live site updates in about a minute (hard-refresh with Ctrl+F5).

No token? Click **Download JSON** and upload it to the repo's `data/` folder on github.com (replace `portfolio.json`).

**Add your CV PDF:** upload it to the repo's `assets/` folder, then in the editor set *Profile → CV link* to `assets/YourFile.pdf`.

## 4. How the chatbot (RAG) works

| Step | What happens | Where |
|---|---|---|
| Chunk | portfolio.json → passages (1 per project, job, skill group, degree + your *Extra knowledge* paragraphs) | `rag.js → makeChunks` |
| Index | each passage → TF-IDF vector | `rag.js → build` |
| Retrieve | question → vector → cosine similarity → top 3 passages (+ boost if the question says "project", "intern", "study"…) | `rag.js → search` |
| Answer | **Free mode:** shows the most relevant sentences from the best passage(s). **AI mode:** sends the passages to your backend, which asks Claude to write the answer. | `rag.js → answer` |

Because everything comes from `portfolio.json`, **adding a project in the editor automatically teaches the chatbot about it**.

Put facts that aren't on the page in **Editor → Chatbot (RAG) → Extra knowledge** (one fact per paragraph).

## 5. (Optional) AI-written answers

Free mode works forever at $0. If you later want Claude to *write* the answers:

1. Deploy the `rag-backend-optional` folder (Flask backend) to a host such as **Render**. Configure its root directory as `rag-backend-optional`, start command as `gunicorn app:app`, and set the `ANTHROPIC_API_KEY` environment variable there.
2. Paste the backend URL (e.g. `https://fahad-rag.onrender.com`) into **Editor → Chatbot (RAG) → Backend URL** and publish.

Note: hosting can be free, but **Claude API calls are pay-as-you-go** (Haiku costs a fraction of a cent per question). If the backend is asleep or fails, the site automatically falls back to free mode.

## Test locally

```bash
python -m http.server 8000
```
Open http://localhost:8000 (opening `index.html` by double-clicking won't work, because browsers block loading the JSON file that way).
