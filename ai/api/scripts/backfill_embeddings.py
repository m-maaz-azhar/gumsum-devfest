"""Embed title + category + colours + tags for items that have no search vector yet (§6.2).

    ../.venv/bin/python scripts/backfill_embeddings.py [--all]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from run import app  # noqa: E402  (loads .env)
from app.db import db  # noqa: E402
from app.services.ai import embed  # noqa: E402

with app.app_context():
    q = db().table("items").select("id,title,category,colours,tags")
    rows = q.execute().data if "--all" in sys.argv else q.is_("embedding", "null").execute().data
    done = 0
    for r in rows:
        text = " ".join([r["title"], r.get("category") or "", *(r.get("colours") or []), *(r.get("tags") or [])])
        vec = embed(text)
        if vec:
            db().table("items").update({"embedding": vec}).eq("id", r["id"]).execute()
            done += 1
    print(f"embedded {done} of {len(rows)} items")
