from __future__ import annotations

from uuid import UUID

from celery import shared_task

from app.extensions import db, socketio
from app.models import ImportSession, ExtractedTitle
from app.importer.parsing import extract_titles_from_text
from app.importer.search import find_matches_for_extracted_title


@shared_task(name="tasks.process_import_file")
def process_import_file(import_id: str, file_text: str, list_type: str | None, user_id: str | None) -> None:
    """Background job: parse the uploaded file and populate matches.

    This version only uses local DB search; TMDB API fallback and list updates
    can be added in follow-up iterations.
    """
    session = ImportSession.query.get(UUID(import_id))
    if not session:
        return

    session.status = "processing"
    db.session.commit()

    records = extract_titles_from_text(file_text or "")

    total = len(records)
    matched = 0

    for idx, rec in enumerate(records, start=1):
        extracted = ExtractedTitle(
            import_session=session,
            raw_text=rec.raw_text,
            normalized_title=rec.normalized_title,
            year=rec.year,
        )
        db.session.add(extracted)
        db.session.flush()  # assign id

        matches = find_matches_for_extracted_title(extracted)
        for m in matches:
            db.session.add(m)

        if matches:
            matched += 1

        # Emit progress update via Socket.IO (using Redis message queue)
        try:
            socketio.emit(
                "import_progress",
                {
                    "importId": import_id,
                    "processed": idx,
                    "total": total,
                    "matched": matched,
                },
                namespace="/imports",
            )
        except Exception:
            # Avoid crashing the worker due to transient socket errors
            pass

    session.total_titles = total
    session.matched_count = matched
    session.unmatched_count = total - matched
    session.status = "completed"
    db.session.commit()
