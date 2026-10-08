# Fahad's RAG Chatbot

A simple chatbot that answers questions using **your own documents** (the `data/` folder).

```
rag-backend-optional/
├── app.py              <- web server (Flask)
├── rag.py              <- RAG brain: load -> chunk -> TF-IDF -> search -> Claude
├── templates/index.html<- chat page
├── data/               <- PUT YOUR .md / .txt FILES HERE
├── requirements.txt
└── .env.example        <- rename to .env, add API key
```

## Run it (Windows, Anaconda Prompt)

```bash
# 1. go into the backend folder in this repository
cd C:/path/to/fahad-portfolio/rag-backend-optional

# 2. make + activate an environment
conda create -n ragbot python=3.11 -y
conda activate ragbot

# 3. install packages
pip install -r requirements.txt

# 4. add your API key
copy .env.example .env
#    open .env in VS Code and paste your key after ANTHROPIC_API_KEY=

# 5. start
python app.py
```

Open **http://127.0.0.1:5000** and chat.

> No API key yet? It still runs - it just shows the passages it found instead of a written answer. Good for testing retrieval.

## Change what the bot knows

1. Edit / add `.md` or `.txt` files in `data/` (leave a blank line between paragraphs).
2. Restart `python app.py`.

## How RAG works here (5 steps)

1. **Load** every file in `data/`
2. **Chunk** into ~600-character passages
3. **Index** each passage as a TF-IDF vector
4. **Retrieve** the top 3 passages most similar to the question (cosine similarity)
5. **Generate**: Claude answers using *only* those passages

## Later: add to your portfolio website

Your portfolio just needs to call the API:

```js
const res = await fetch("https://YOUR-BACKEND-URL/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "What projects has Fahad built?", history: [] })
});
const data = await res.json();   // { answer: "...", sources: [...] }
```

Host the backend free on Render / Railway / Hugging Face Spaces, and set `ANTHROPIC_API_KEY` there
(never put the key in your website's JavaScript).
