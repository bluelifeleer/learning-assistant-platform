import logging
import threading
from collections.abc import Callable
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import Organization
from app.services.digest import digest_is_due, send_digest

logger = logging.getLogger(__name__)


def smtp_ready(organization: Organization) -> bool:
    return bool(
        organization.smtp_host and organization.smtp_username and organization.smtp_password and organization.email_to
    )


def run_digest_tick(session_factory: Callable[[], Session] = SessionLocal, now: datetime | None = None) -> None:
    db = session_factory()
    try:
        organizations = db.query(Organization).filter(Organization.digest_auto.is_(True)).all()
        for organization in organizations:
            try:
                if not smtp_ready(organization):
                    continue
                if digest_is_due(organization, now or datetime.now()):
                    send_digest(db, organization)
            except Exception:
                logger.exception("digest send failed for organization %s", organization.id)
    finally:
        db.close()


def _scheduler_loop(interval_seconds: int) -> None:
    while True:
        threading.Event().wait(interval_seconds)
        try:
            run_digest_tick()
        except Exception:
            logger.exception("digest scheduler tick failed")


def start_digest_scheduler() -> threading.Thread:
    interval = get_settings().digest_scheduler_interval_seconds
    thread = threading.Thread(target=_scheduler_loop, args=(interval,), name="digest-scheduler", daemon=True)
    thread.start()
    return thread
