from __future__ import annotations

import os
from uuid import UUID

from flask import request, jsonify

from . import importer_bp
from ..extensions import db
from ..models import ImportSession, ExtractedTitle, TitleMatch


@importer_bp.post("/file")
def upload_file():
    """Upload a file and enqueue background import processing.

    Expects multipart/form-data with:
    - file: the uploaded file
    - listType (optional): target list type (watchlist/currently-watching/watched)
    - source (optional): import source label
    - userId (optional): user identifier (string)
    """
    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "empty filename"}), 400

    user_id = request.form.get("userId") or request.headers.get("X-User-Id")
    source = request.form.get("source", "file")

    session = ImportSession(user_id=user_id, source=source, status="pending", original_filename=file.filename)
    db.session.add(session)
    db.session.commit()

    # Read file contents into memory; the Celery worker runs in a separate
    # container and cannot see this web container's filesystem, so we send
    # the text instead of a path.
    file_bytes = file.read() or b""
    try:
        file_text = file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        file_text = ""

    list_type = request.form.get("listType")

    # Enqueue Celery task (import Celery lazily to avoid circular imports
    # during Flask app initialization)
    from celery_app import celery

    celery.send_task(
        "tasks.process_import_file",
        args=[str(session.id), file_text, list_type, user_id],
    )

    return jsonify({"importId": str(session.id), "status": session.status})


@importer_bp.get("/<import_id>/matches")
def get_import_matches(import_id: str):
    """Return extracted titles and candidate matches for a given import session."""
    try:
        session_id = UUID(import_id)
    except ValueError:
        return jsonify({"error": "invalid import id"}), 400

    session = ImportSession.query.get(session_id)
    if not session:
        return jsonify({"error": "import not found"}), 404

    titles = []
    for t in session.extracted_titles:
        titles.append(
            {
                "id": t.id,
                "rawText": t.raw_text,
                "normalizedTitle": t.normalized_title,
                "year": t.year,
                "matches": [
                    {
                        "id": m.id,
                        "mediaType": m.media_type,
                        "tmdbId": m.tmdb_id,
                        "localId": m.local_id,
                        "confidence": m.confidence,
                        "matchMethod": m.match_method,
                        "isAmbiguous": m.is_ambiguous,
                    }
                    for m in t.matches
                ],
            }
        )

    return jsonify(
        {
            "importId": str(session.id),
            "status": session.status,
            "originalFilename": session.original_filename,
            "totalTitles": session.total_titles,
            "matchedCount": session.matched_count,
            "unmatchedCount": session.unmatched_count,
            "titles": titles,
        }
    )


@importer_bp.post("/confirm")
def confirm_matches():
    """Record which matches the user chose and desired list types.

    Body:
    {
      "importId": "...",
      "choices": [
        { "extractedTitleId": 3, "matchId": 10, "listType": "watchlist" },
        ...
      ]
    }

    For now this endpoint only validates that the referenced ImportSession,
    ExtractedTitle, and TitleMatch rows exist and belong together. It stores
    aggregate stats on the ImportSession but does not yet call the
    main ShowBuff backend to mutate user lists; the mobile app should still
    call the existing list endpoints for that.
    """
    payload = request.get_json(silent=True) or {}
    import_id = payload.get("importId")
    choices = payload.get("choices") or []

    if not import_id:
        return jsonify({"error": "importId is required"}), 400

    try:
        session_id = UUID(import_id)
    except ValueError:
        return jsonify({"error": "invalid import id"}), 400

    session = ImportSession.query.get(session_id)
    if not session:
        return jsonify({"error": "import not found"}), 404

    validated: list[dict] = []
    invalid: list[dict] = []

    for choice in choices:
        extracted_id = choice.get("extractedTitleId")
        match_id = choice.get("matchId")
        list_type = (choice.get("listType") or "").strip()

        if not extracted_id or not match_id or not list_type:
            invalid.append({"choice": choice, "reason": "missing fields"})
            continue

        extracted = ExtractedTitle.query.get(extracted_id)
        match = TitleMatch.query.get(match_id)

        if not extracted or not match or extracted.import_id != session.id or match.extracted_title_id != extracted.id:
            invalid.append({"choice": choice, "reason": "mismatched ids"})
            continue

        # Normalize list type to expected form (watchlist/currently_watching/watched)
        lt = list_type.lower().replace("-", "_")
        if lt not in {"watchlist", "currently_watching", "watched"}:
            invalid.append({"choice": choice, "reason": "invalid listType"})
            continue

        validated.append(
            {
                "extractedTitleId": extracted.id,
                "matchId": match.id,
                "listType": lt,
                "mediaType": match.media_type,
                "tmdbId": match.tmdb_id,
                "localId": match.local_id,
            }
        )

    # For now we just echo back the validated choices; in a future iteration
    # we could persist them on a dedicated table or fan out to the main
    # ShowBuff backend for list mutations.
    return jsonify({
        "importId": str(session.id),
        "validated": validated,
        "invalid": invalid,
    })


@importer_bp.get("/matches/pending")
def get_pending_imports():
    """Return all non-completed import sessions for a (optional) user."""
    user_id = request.args.get("userId") or request.headers.get("X-User-Id")

    query = ImportSession.query
    if user_id:
        query = query.filter_by(user_id=user_id)

    sessions = query.filter(ImportSession.status != "completed").order_by(ImportSession.created_at.desc()).all()

    return jsonify(
        [
            {
                "importId": str(s.id),
                "status": s.status,
                "originalFilename": s.original_filename,
                "createdAt": s.created_at.isoformat(),
            }
            for s in sessions
        ]
    )
