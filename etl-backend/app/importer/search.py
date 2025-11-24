from __future__ import annotations

from typing import Iterable

from sqlalchemy import or_, func

from ..extensions import db
from ..models import Movie, TVShow, ExtractedTitle, TitleMatch
from ..tmdb_client import search_tmdb_movies, search_tmdb_tv


def find_matches_for_extracted_title(extracted: ExtractedTitle) -> list[TitleMatch]:
    """Simple local DB search for a given extracted title.

    Strategy:
    - Case-insensitive exact match on title/name.
    - Optional year filter when available.
    - Rank by popularity descending.
    """
    title = (extracted.normalized_title or "").strip()
    if not title:
        return []

    year = extracted.year

    movie_query = Movie.query.filter(func.lower(Movie.title) == func.lower(title))
    tv_query = TVShow.query.filter(func.lower(TVShow.name) == func.lower(title))

    if year:
        movie_query = movie_query.filter(Movie.year == year)
        tv_query = tv_query.filter(TVShow.first_air_year == year)

    movie_query = movie_query.order_by(Movie.popularity.desc().nullslast())
    tv_query = tv_query.order_by(TVShow.popularity.desc().nullslast())

    movies = movie_query.limit(5).all()
    shows = tv_query.limit(5).all()

    matches: list[TitleMatch] = []

    # 1) Local DB exact matches first (fast, cheap)
    for m in movies:
        matches.append(
            TitleMatch(
                extracted_title=extracted,
                media_type="movie",
                tmdb_id=m.tmdb_id,
                local_id=m.id,
                confidence=0.95,
                match_method="local_exact",
                is_ambiguous=False,
            )
        )

    for s in shows:
        matches.append(
            TitleMatch(
                extracted_title=extracted,
                media_type="tv",
                tmdb_id=s.tmdb_id,
                local_id=s.id,
                confidence=0.95,
                match_method="local_exact",
                is_ambiguous=False,
            )
        )

    # If we already have local matches, return them (they may be ambiguous and
    # the UI can ask the user to pick one).
    if matches:
        if len(matches) > 1:
            for m in matches:
                m.is_ambiguous = True
        return matches

    # 2) Fallback to TMDB search (movies + TV) and upsert into our local DB.
    tmdb_movies = search_tmdb_movies(title, year)
    tmdb_shows = search_tmdb_tv(title, year)

    # Basic heuristic: take top N results and assign decreasing confidence.
    MAX_RESULTS = 3

    def _upsert_movie(data) -> Movie | None:
        tmdb_id = data.get("id")
        if not tmdb_id:
            return None
        movie = Movie.query.filter_by(tmdb_id=tmdb_id).first()
        if not movie:
            movie = Movie(tmdb_id=tmdb_id)
            db.session.add(movie)
        movie.title = data.get("title") or data.get("original_title") or movie.title or ""
        movie.original_title = data.get("original_title") or movie.original_title
        release_date = data.get("release_date") or ""
        try:
            movie.year = int(release_date[:4]) if release_date else movie.year
        except ValueError:
            pass
        movie.popularity = data.get("popularity") or movie.popularity
        movie.adult = bool(data.get("adult", False))
        return movie

    def _upsert_tv(data) -> TVShow | None:
        tmdb_id = data.get("id")
        if not tmdb_id:
            return None
        show = TVShow.query.filter_by(tmdb_id=tmdb_id).first()
        if not show:
            show = TVShow(tmdb_id=tmdb_id)
            db.session.add(show)
        show.name = data.get("name") or data.get("original_name") or show.name or ""
        show.original_name = data.get("original_name") or show.original_name
        first_air_date = data.get("first_air_date") or ""
        try:
            show.first_air_year = int(first_air_date[:4]) if first_air_date else show.first_air_year
        except ValueError:
            pass
        show.popularity = data.get("popularity") or show.popularity
        show.adult = bool(data.get("adult", False))
        return show

    # Movies
    for idx, data in enumerate(tmdb_movies[:MAX_RESULTS]):
        movie = _upsert_movie(data)
        if not movie:
            continue
        # Flush so movie.id is available
        db.session.flush()
        confidence = 0.9 if idx == 0 else 0.75
        matches.append(
            TitleMatch(
                extracted_title=extracted,
                media_type="movie",
                tmdb_id=movie.tmdb_id,
                local_id=movie.id,
                confidence=confidence,
                match_method="tmdb_search",
                is_ambiguous=False,
            )
        )

    # TV shows
    for idx, data in enumerate(tmdb_shows[:MAX_RESULTS]):
        show = _upsert_tv(data)
        if not show:
            continue
        db.session.flush()
        confidence = 0.9 if idx == 0 else 0.75
        matches.append(
            TitleMatch(
                extracted_title=extracted,
                media_type="tv",
                tmdb_id=show.tmdb_id,
                local_id=show.id,
                confidence=confidence,
                match_method="tmdb_search",
                is_ambiguous=False,
            )
        )

    # Mark ambiguous if we have multiple matches
    if len(matches) > 1:
        for m in matches:
            m.is_ambiguous = True

    return matches
