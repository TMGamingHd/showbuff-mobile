from __future__ import annotations

import os
from uuid import UUID

from flask import request, jsonify

from . import importer_bp
from ..extensions import db
from ..models import ImportSession, ExtractedTitle, TitleMatch
from .parsing import extract_titles_from_file
from .search import find_matches_for_extracted_title
from celery_app import celery


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

    # Store file to a temporary path inside the container
    tmp_dir = os.path.join(os.getcwd(), "tmp_imports")
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_path = os.path.join(tmp_dir, f"{session.id}_{file.filename}")
    file.save(tmp_path)

    list_type = request.form.get("listType")

    # Enqueue Celery task
    celery.send_task(
        "tasks.process_import_file",
        args=[str(session.id), tmp_path, list_type, user_id],
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
