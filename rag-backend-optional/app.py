"""
app.py - the web server.

  GET  /            -> the chat page
  POST /api/chat    -> {"message": "...", "history": [...]}  ->  {"answer": "...", "sources": [...]}
  POST /api/reload  -> re-read the data/ folder after you add or edit files

The /api/chat endpoint is what your portfolio website will call later.
"""

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from rag import Retriever, generate_answer

load_dotenv()                      # reads ANTHROPIC_API_KEY from .env

app = Flask(__name__)
CORS(app)                          # lets your portfolio site (another domain) call the API
retriever = Retriever()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    question = (data.get("message") or "").strip()
    if not question:
        return jsonify({"error": "Empty message"}), 400

    # The GitHub Pages portfolio already did the retrieval in the browser and
    # sends its passages as "context". Otherwise search this server's data/ folder.
    if isinstance(data.get("context"), list) and data["context"]:
        passages = [
            {"source": str(c.get("source", "portfolio")), "text": str(c.get("text", ""))[:2000],
             "score": c.get("score", 0)}
            for c in data["context"][:5]
        ]
    else:
        passages = retriever.search(question)
    try:
        answer = generate_answer(question, passages, data.get("history"))
    except Exception as e:
        return jsonify({"error": f"LLM call failed: {e}"}), 500

    return jsonify({
        "answer": answer,
        "sources": [{"source": p["source"], "score": p["score"]} for p in passages],
    })


@app.route("/api/reload", methods=["POST"])
def reload_docs():
    retriever.build()
    return jsonify({"status": "ok", "chunks": len(retriever.chunks)})


if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=os.getenv("FLASK_DEBUG") == "1")
