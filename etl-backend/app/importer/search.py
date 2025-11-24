from __future__ import annotations

from typing import Iterable

from sqlalchemy import or_, func

from ..extensions import db
from ..models import Movie, TVShow, ExtractedTitle, TitleMatch


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

    for m in movies:
        matches.append(
            TitleMatch(
                extracted_title=extracted,
                media_type="movie",
                tmdb_id=m.tmdb_id,
                local_id=m.id,
                confidence=0.9,
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
                confidence=0.9,
                match_method="local_exact",
                is_ambiguous=False,
            )
        )

    # Mark ambiguous if we have multiple matches
    if len(matches) > 1:
        for m in matches:
            m.is_ambiguous = True

    return matches
