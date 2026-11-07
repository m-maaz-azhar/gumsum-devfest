"""Deterministic AI rules (ARCHITECTURE §6). Code, not a model:

- leak check for follow-up questions (§6.4, decision D5)
- the 0-100 score formula from per-detail verdicts (§6.5, decision D6)
- heuristic fallbacks used when OpenAI is unavailable

Ported 1:1 from web/src/mock/ai/*.ts so the mock and the real API behave the same.
"""
from __future__ import annotations

import re
import unicodedata

STOPWORDS = set(
    """a an the and or but if of to in on at by for with from into onto over under near about as is are was were be been
    being it its it's this that these those there here my your our their his her me you we they i he she them us
    do does did have has had can could would should will shall may might must just very really so too also not no yes
    any anything something some one ones what which who whom whose when where why how all each every both few more most
    other such only own same than then once again ever still like think maybe sure know dont don't im i'm""".split()
)
GENERIC_WORDS = set(
    """inside attached attach marks mark stickers sticker damage damaged side back front top bottom small little tiny
    big large left right item thing things part corner usually kept""".split()
)

FIRST_QUESTION = "Tell us why this is yours. Describe anything only the owner would know, like what's inside, marks or stickers."
SUBMITTED = "Thanks, your request was submitted. The team will review it and we'll notify you."
FALLBACK_QUESTIONS = [
    "Is there anything inside it?",
    "Any marks, stickers or damage?",
    "Anything attached to it?",
    "Where and when do you think you lost it?",
]


def normalise(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9\s-]", " ", s).replace("-", " ")
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str) -> list[str]:
    return [t for t in normalise(s).split(" ") if t and t not in STOPWORDS]


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a or not b:
        return len(a) or len(b)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def words_match(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4 and levenshtein(a, b) <= 1:
        return True
    return len(a) >= 5 and len(b) >= 5 and a[:5] == b[:5]


# ---- leak check ------------------------------------------------------------------------

def detail_keywords(details: list[str]) -> list[str]:
    out: list[str] = []
    for d in details:
        for t in tokens(d):
            if len(t) >= 3 and t not in GENERIC_WORDS and t not in out:
                out.append(t)
    return out


def leaks(question: str, details: list[str]) -> bool:
    keywords = detail_keywords(details)
    q_tokens = [t for t in tokens(question) if len(t) >= 3]
    return any(q == k or (min(len(q), len(k)) >= 4 and levenshtein(q, k) <= 1) for q in q_tokens for k in keywords)


def safe_question(candidate: str | None, details: list[str], already_asked: list[str]) -> str:
    """The candidate if it passes the leak check and wasn't asked before, else an unused generic fallback."""
    if candidate and candidate.strip() and not leaks(candidate, details) and candidate not in already_asked:
        return candidate.strip()
    return next((q for q in FALLBACK_QUESTIONS if q not in already_asked), FALLBACK_QUESTIONS[0])


# ---- score formula -----------------------------------------------------------------------

VERDICT_VALUE = {"match": 1.0, "partial": 0.5, "none": 0.0, "contradiction": -1.0}
PHOTO_VALUE = {"consistent": 1.0, "unclear": 0.5, "inconsistent": 0.0}


def label_for(score: int) -> str:
    return "High" if score >= 75 else "Medium" if score >= 40 else "Low"


def compute_score(rationale: dict) -> tuple[int, str]:
    details = rationale.get("details") or []
    n = len(details)
    detail_score = 0.0 if n == 0 else min(1.0, max(0.0, sum(VERDICT_VALUE.get(d.get("verdict"), 0.0) for d in details) / n))
    photo_score = PHOTO_VALUE.get(rationale.get("photo_consistency"), 0.5)
    proof_bonus = 0.05 if rationale.get("proof_photo") == "supports" else 0.0
    raw = 0.75 * detail_score + 0.25 * photo_score + proof_bonus
    score = round(100 * min(1.0, max(0.0, raw)))
    if any(d.get("verdict") == "contradiction" for d in details):
        score = min(score, 40)
    return score, label_for(score)


# ---- heuristic fallbacks ---------------------------------------------------------------

def _keywords(detail: str) -> list[str]:
    return [t for t in tokens(detail) if len(t) >= 2 and t not in GENERIC_WORDS]


def detail_coverage(detail: str, text: str) -> float:
    kw = _keywords(detail)
    if not kw:
        return 0.0
    said = tokens(text)
    return sum(1 for k in kw if any(words_match(s, k) for s in said)) / len(kw)


def detail_kind(detail: str) -> str:
    d = normalise(detail)
    if re.search(r"\b(keychain|keyring|tag|strap|attached|charm|pouch|lanyard)\b", d):
        return "attached"
    if re.search(r"\b(scratch|dent|stain|crack|cracked|chip|torn|broken|bent|missing|sticker|logo|patch|engraved|stitch|stitching|stitched|sketch|initials|written|polka|bow|carved|embroidered|size|lock screen)\b", d):
        return "marks"
    if re.search(r"\b(inside|contains|pocket|receipt|card|photo|tucked)\b", d):
        return "contents"
    return "other"


QUESTION_FOR = {
    "contents": "Is there anything inside it?",
    "marks": "Any marks, stickers or damage?",
    "attached": "Anything attached to it?",
    "other": "Is there anything else that makes it yours?",
}


def heuristic_coverage(details: list[str], user_text: str, already_asked: list[str]) -> dict:
    covered, uncovered = [], []
    for i, d in enumerate(details):
        (covered if detail_coverage(d, user_text) >= 0.5 else uncovered).append(i)
    candidates = [QUESTION_FOR[detail_kind(details[i])] for i in uncovered]
    candidates = [q for q in candidates if q not in already_asked]
    return {"covered": covered, "uncovered": uncovered, "next_question": candidates[0] if candidates else None}


NEGATIONS = {
    "contents": r"\b(nothing|empty)\b.*\b(inside|in it)\b|\bnothing inside\b|\bit was empty\b",
    "marks": r"\bno (marks|scratches|damage|stickers)\b|\bbrand new\b|\bno marks at all\b",
    "attached": r"\bnothing (was )?attached\b|\bno (keychain|keyring|tag)\b",
    "other": r"$^",
}


def heuristic_rationale(details: list[str], user_text: str, has_proof: bool, public_words: list[str]) -> dict:
    text = normalise(user_text)
    rows = []
    for idx, d in enumerate(details):
        c = detail_coverage(d, user_text)
        verdict = "match" if c >= 0.67 else "partial" if c >= 0.34 else "none"
        if verdict == "none" and re.search(NEGATIONS[detail_kind(d)], text):
            verdict = "contradiction"
        evidence = {"match": "describes this detail", "partial": "partly describes this detail", "contradiction": "says the opposite"}.get(verdict, "not mentioned")
        rows.append({"idx": idx, "verdict": verdict, "evidence": evidence})
    said = tokens(text)
    mentions_public = any(words_match(t, normalise(w)) for w in public_words if w for t in said)
    matched = sum(1 for r in rows if r["verdict"] == "match")
    contradiction = any(r["verdict"] == "contradiction" for r in rows)
    return {
        "details": rows,
        "photo_consistency": "consistent" if mentions_public else "unclear",
        "proof_photo": "supports" if has_proof else "none",
        "summary": f"{matched} of {len(details)} private details matched{'; contradictions found' if contradiction else ''}.",
    }


def split_details(description: str) -> list[str]:
    parts = [p.strip(" .") for p in re.split(r"[;,\n.]+|\band\b", description, flags=re.I)]
    return [p for p in parts if len(p) >= 3][:12]


def parse_query(q: str) -> dict:
    text = re.sub(r"\s+", " ", q.strip())
    lead = re.match(r"^(?:in|at|near)\s+(.+)$", text, flags=re.I)
    if lead:
        where = re.sub(r"^the\s+", "", lead.group(1), flags=re.I).strip()
        return {"what": None, "where": where or None}
    parts = re.split(r"\s+(?:in|at|near)\s+", text, flags=re.I)
    if len(parts) < 2:
        return {"what": text or None, "where": None}
    where = re.sub(r"^the\s+", "", parts.pop(), flags=re.I).strip()
    what = " ".join(parts).strip()
    return {"what": what or None, "where": where or None}


BLOCKED = ["fuck", "shit", "bitch", "bastard", "asshole", "cunt", "motherfucker", "dick", "slut", "whore"]


def is_flagged_locally(text: str) -> bool:
    t = text.lower()
    return any(re.search(rf"\b{w}", t) for w in BLOCKED)
