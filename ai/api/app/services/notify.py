"""Claim status notifications (USR-NOT-01): email for every status change, Web Push when configured.
Best effort only: a failed notification is logged and never breaks the request."""
from __future__ import annotations

import json
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from flask import current_app

from ..db import db

COPY = {
    "approved": ("Good news! Your {title} is ready for pickup", "Good news! Your {title} is ready for pickup at {place}. Open Gumsum to see your pickup code."),
    "not_selected": ("Update on your request", "This item went to another owner. We hope you find yours soon."),
    "rejected": ("Update on your request", "We couldn't verify this item as yours. If you think this is a mistake, visit the desk."),
    "collected": ("Thanks for collecting your item", "Your {title} has been collected. Thanks for using Gumsum."),
}


def _send_email(to: str, subject: str, body: str, link: str) -> None:
    cfg = current_app.config
    if not (cfg.get("SMTP_HOST") and cfg.get("SMTP_USER") and cfg.get("SMTP_PASS") and to):
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg.get("SMTP_SENDER_NAME") or "Gumsum", cfg.get("SMTP_SENDER_EMAIL") or cfg["SMTP_USER"]))
    msg["To"] = to
    msg.set_content(f"{body}\n\n{link}")
    msg.add_alternative(
        f"""<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a;max-width:440px;margin:0 auto;padding:24px">
<p style="color:#737373;font-size:15px;margin:0 0 16px">Gumsum</p><p style="font-size:17px;line-height:24px">{body}</p>
<p><a href="{link}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 20px;border-radius:14px;text-decoration:none">Open my request</a></p></div>""",
        subtype="html",
    )
    port = int(cfg.get("SMTP_PORT") or 587)
    if port == 465:
        with smtplib.SMTP_SSL(cfg["SMTP_HOST"], port, timeout=8) as s:
            s.login(cfg["SMTP_USER"], cfg["SMTP_PASS"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["SMTP_HOST"], port, timeout=8) as s:
            s.starttls()
            s.login(cfg["SMTP_USER"], cfg["SMTP_PASS"])
            s.send_message(msg)


def _send_push(user_id: str, title: str, body: str, claim_id: str) -> None:
    key = current_app.config.get("VAPID_PRIVATE_KEY")
    if not key:
        return
    from pywebpush import WebPushException, webpush

    subject = current_app.config.get("VAPID_SUBJECT") or "mailto:admin@example.com"
    if not subject.startswith(("mailto:", "https://")):
        subject = f"mailto:{subject}"
    for sub in db().table("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", user_id).execute().data or []:
        try:
            webpush(
                {"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                json.dumps({"title": title, "body": body, "claim_id": claim_id}),
                vapid_private_key=key,
                vapid_claims={"sub": subject},
                timeout=8,
            )
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                db().table("push_subscriptions").delete().eq("id", sub["id"]).execute()  # invalid token removed
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("push failed: %s", exc)


def claim_status_changed(claim_ids: list[str], status: str) -> None:
    if status not in COPY or not claim_ids:
        return
    try:
        rows = db().table("claims").select("id,claimant_id,items(title,locations(name))").in_("id", claim_ids).execute().data or []
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("notify lookup failed: %s", exc)
        return
    for row in rows:
        item = row.get("items") or {}
        title = (item.get("title") or "item").lower()
        place = (item.get("locations") or {}).get("name") or "the desk"
        subject, body = (t.format(title=title, place=place) for t in COPY[status])
        link = f"{current_app.config.get('APP_URL', '')}/requests/{row['id']}"
        try:
            user = db().auth.admin.get_user_by_id(row["claimant_id"]).user
            _send_email(user.email if user else "", subject, body, link)
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("email failed: %s", exc)
        try:
            _send_push(row["claimant_id"], subject, body, row["id"])
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("push failed: %s", exc)
