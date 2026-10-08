"""
rag.py - the "brain" of the chatbot.

RAG = Retrieval-Augmented Generation:
  1. LOAD     : read every .txt / .md file in the data/ folder
  2. CHUNK    : split them into small passages (~600 characters)
  3. INDEX    : turn every passage into a TF-IDF vector (numbers)
  4. RETRIEVE : for a question, find the passages most similar to it
  5. GENERATE : give those passages to Claude and ask it to answer ONLY from them
"""

import glob
import os

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
CHUNK_SIZE = 600      # max characters per chunk
TOP_K = 3             # how many chunks to give the LLM
MIN_SCORE = 0.05      # ignore chunks that are basically unrelated


# ---------- 1. LOAD ----------
def load_documents(folder=DATA_DIR):
    docs = []
    for path in sorted(glob.glob(os.path.join(folder, "**", "*"), recursive=True)):
        if path.lower().endswith((".txt", ".md")):
            with open(path, encoding="utf-8") as f:
                docs.append({"source": os.path.basename(path), "text": f.read()})
    return docs


# ---------- 2. CHUNK ----------
def chunk_text(text, chunk_size=CHUNK_SIZE):
    """Split on blank lines (paragraphs), then glue paragraphs together
    until a chunk is about chunk_size characters."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, current = [], ""
    for p in paragraphs:
        if current and len(current) + len(p) > chunk_size:
            chunks.append(current)
            current = p
        else:
            current = f"{current}\n\n{p}" if current else p
    if current:
        chunks.append(current)
    return chunks


# ---------- 3 + 4. INDEX & RETRIEVE ----------
class Retriever:
    def __init__(self, folder=DATA_DIR):
        self.folder = folder
        self.build()

    def build(self):
        self.chunks = []
        for doc in load_documents(self.folder):
            for c in chunk_text(doc["text"]):
                self.chunks.append({"source": doc["source"], "text": c})
        if not self.chunks:
            raise RuntimeError(f"No .txt or .md files found in {self.folder}")
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        self.matrix = self.vectorizer.fit_transform([c["text"] for c in self.chunks])
        print(f"[RAG] Indexed {len(self.chunks)} chunks from {self.folder}")

    def search(self, query, k=TOP_K):
        scores = cosine_similarity(self.vectorizer.transform([query]), self.matrix)[0]
        best = scores.argsort()[::-1][:k]
        return [
            {**self.chunks[i], "score": round(float(scores[i]), 3)}
            for i in best
            if scores[i] >= MIN_SCORE
        ]


# ---------- 5. GENERATE ----------
SYSTEM_PROMPT = (
    "You are a friendly assistant on Fahad's portfolio website. "
    "Answer the visitor's question using ONLY the context passages provided. "
    "If the answer is not in the context, say you don't have that information "
    "and suggest contacting Fahad directly. Keep answers short and clear."
)


def generate_answer(question, passages, history=None):
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()

    # No key yet? Still works: just show what retrieval found.
    if not api_key:
        if not passages:
            return "(No API key set) I couldn't find anything relevant in the documents."
        found = "\n\n---\n\n".join(p["text"] for p in passages)
        return "(No API key set - showing the most relevant passages)\n\n" + found

    import anthropic

    context = "\n\n".join(
        f"[Passage {i + 1} | {p['source']}]\n{p['text']}" for i, p in enumerate(passages)
    ) or "(no relevant passages found)"

    messages = []
    for turn in (history or [])[-6:]:            # last 3 exchanges for follow-ups
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {question}",
    })

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=os.getenv("CLAUDE_MODEL", "claude-haiku-5-5"),
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    return response.content[0].text
