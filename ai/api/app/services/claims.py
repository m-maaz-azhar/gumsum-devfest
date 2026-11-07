"""Claim chat turn (§6.4) and scoring job (§6.5)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import current_app

from ..db import db
from ..serializers import images_by_item, now_iso
from . import ai, rules
from .storage import signed_urls

MAX_FOLLOWUPS = 2


def _messages(claim_id: str) -> list[dict]:
    return db().table("claim_messages").select("role,content,created_at").eq("claim_id", claim_id).order("created_at").execute().data or []


def _details(item_id: str) -> list[str]:
    rows = db().table("item_secrets").select("details,private_description").eq("item_id", item_id).limit(1).execute().data
    if not rows:
        return []
    details = rows[0].get("details") or []
    return details if details else rules.split_details(rows[0].get("private_description") or "")


def add_message(claim_id: str, role: str, content: str) -> None:
    db().table("claim_messages").insert({"claim_id": claim_id, "role": role, "content": content}).execute()


def bot_turn(claim: dict) -> dict:
    """Decide the next bot message after the claimant's latest answer. Returns a ClaimTurn."""
    msgs = _messages(claim["id"])
    user_text = "\n".join(m["content"] for m in msgs if m["role"] == "user")
    asked = [m["content"] for m in msgs if m["role"] == "bot" and m["content"] not in (rules.FIRST_QUESTION, rules.SUBMITTED)]
    details = _details(claim["item_id"])
    followups = int(claim.get("followups_asked") or 0)

    cov = ai.coverage(details, user_text, asked) if followups < MAX_FOLLOWUPS else {"uncovered": []}
    if not cov.get("uncovered") or followups >= MAX_FOLLOWUPS:
        add_message(claim["id"], "bot", rules.SUBMITTED)
        db().table("claims").update({
            "chat_done": True, "status": "submitted", "submitted_at": now_iso(), "score_state": "pending", "scoring_attempts": 0,
        }).eq("id", claim["id"]).execute()
        item = db().table("items").select("org_id,status").eq("id", claim["item_id"]).limit(1).execute().data[0]
        if item["status"] == "available":
            db().table("items").update({"status": "claim_pending"}).eq("id", claim["item_id"]).eq("status", "available").execute()
        db().table("audit_events").insert({"org_id": item["org_id"], "actor_id": claim["claimant_id"], "type": "claim_submitted", "entity_id": claim["id"]}).execute()
        return {"claim_id": claim["id"], "reply": rules.SUBMITTED, "done": True, "followups_left": 0}

    # Every question passes the code leak check; a leaking or repeated one becomes a generic fallback.
    question = rules.safe_question(cov.get("next_question"), details, asked)
    followups += 1
    add_message(claim["id"], "bot", question)
    db().table("claims").update({"followups_asked": followups}).eq("id", claim["id"]).execute()
    return {"claim_id": claim["id"], "reply": question, "done": False, "followups_left": MAX_FOLLOWUPS - followups}


def run_scoring(claim_id: str, *, force: bool = False) -> dict | None:
    """Score a finished claim. Idempotent: skips claims already scored unless forced. Never changes a decision."""
    rows = db().table("claims").select("*").eq("id", claim_id).limit(1).execute().data
    if not rows:
        return None
    claim = rows[0]
    if not claim.get("chat_done") or (claim["score_state"] == "done" and not force):
        return claim
    attempts = int(claim.get("scoring_attempts") or 0) + 1
    db().table("claims").update({"scoring_attempts": attempts}).eq("id", claim_id).execute()
    try:
        item = db().table("items").select("id,title,category,colours,tags").eq("id", claim["item_id"]).limit(1).execute().data[0]
        msgs = _messages(claim_id)
        transcript = "\n".join(f"{'Bot' if m['role'] == 'bot' else 'Claimant'}: {m['content']}" for m in msgs)
        user_text = "\n".join(m["content"] for m in msgs if m["role"] == "user")
        details = _details(claim["item_id"])
        image_urls = [i["url"] for i in images_by_item([item["id"]]).get(item["id"], [])]
        proof_url = signed_urls([claim["proof_image_path"]]).get(claim["proof_image_path"]) if claim.get("proof_image_path") else None
        public_words = [item["title"], item.get("category") or "", *(item.get("colours") or []), *(item.get("tags") or [])]
        rationale, model = ai.score_rationale(
            title=item["title"], details=details, transcript=transcript, user_text=user_text,
            image_urls=image_urls, proof_url=proof_url, public_words=public_words,
        )
        score, label = rules.compute_score(rationale)
        values = {"score": score, "score_label": label, "score_state": "done", "rationale": rationale, "model_version": model, "scored_at": now_iso()}
        if claim["status"] == "submitted":
            values["status"] = "under_review"
        db().table("claims").update(values).eq("id", claim_id).execute()
        return {**claim, **values}
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("scoring failed for %s", claim_id, exc_info=exc)
        if attempts >= 3:
            db().table("claims").update({"score_state": "failed"}).eq("id", claim_id).execute()
        return None


def sweep_stuck(item_id: str, limit: int = 2) -> None:
    """Startup-sweep equivalent (§6.5): score claims left pending for more than 2 minutes."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    rows = (
        db().table("claims").select("id").eq("item_id", item_id).eq("chat_done", True).eq("score_state", "pending")
        .lt("submitted_at", cutoff).limit(limit).execute().data or []
    )
    for r in rows:
        run_scoring(r["id"])
