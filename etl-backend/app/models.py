from datetime import datetime
import uuid

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Index, String, Integer, Float, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


class Movie(db.Model):
    __tablename__ = "movies"

    id: Mapped[int] = mapped_column(primary_key=True)
    tmdb_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    original_title: Mapped[str | None] = mapped_column(String(255))
    year: Mapped[int | None] = mapped_column(Integer)
    popularity: Mapped[float | None] = mapped_column(Float)
    adult: Mapped[bool] = mapped_column(Boolean, default=False)

    def __repr__(self) -> str:  # pragma: no cover - debug only
        return f"<Movie tmdb_id={self.tmdb_id} title={self.title!r}>"


class TVShow(db.Model):
    __tablename__ = "tv_shows"

    id: Mapped[int] = mapped_column(primary_key=True)
    tmdb_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(255))
    first_air_year: Mapped[int | None] = mapped_column(Integer)
    popularity: Mapped[float | None] = mapped_column(Float)
    adult: Mapped[bool] = mapped_column(Boolean, default=False)


class ImportSession(db.Model):
    __tablename__ = "import_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(32), default="file")
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending, processing, completed, failed
    original_filename: Mapped[str | None] = mapped_column(String(255))
    total_titles: Mapped[int] = mapped_column(Integer, default=0)
    matched_count: Mapped[int] = mapped_column(Integer, default=0)
    unmatched_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    extracted_titles: Mapped[list["ExtractedTitle"]] = relationship(back_populates="import_session", cascade="all, delete-orphan")


class ExtractedTitle(db.Model):
    __tablename__ = "extracted_titles"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("import_sessions.id", ondelete="CASCADE"), index=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_title: Mapped[str | None] = mapped_column(String(255), index=True)
    year: Mapped[int | None] = mapped_column(Integer)

    import_session: Mapped[ImportSession] = relationship(back_populates="extracted_titles")
    matches: Mapped[list["TitleMatch"]] = relationship(back_populates="extracted_title", cascade="all, delete-orphan")


class TitleMatch(db.Model):
    __tablename__ = "title_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    extracted_title_id: Mapped[int] = mapped_column(ForeignKey("extracted_titles.id", ondelete="CASCADE"), index=True)
    media_type: Mapped[str] = mapped_column(String(8))  # movie | tv
    tmdb_id: Mapped[int | None] = mapped_column(Integer, index=True)
    local_id: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    match_method: Mapped[str | None] = mapped_column(String(32))
    is_ambiguous: Mapped[bool] = mapped_column(Boolean, default=False)

    extracted_title: Mapped[ExtractedTitle] = relationship(back_populates="matches")


Index("ix_title_matches_tmdb", TitleMatch.tmdb_id)
Index("ix_extracted_titles_norm_year", ExtractedTitle.normalized_title, ExtractedTitle.year)
