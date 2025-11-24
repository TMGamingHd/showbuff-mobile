import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load .env when running locally; Railway will provide env vars directly
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


def _coerce_db_uri() -> str:
    """Normalize DATABASE_URL so SQLAlchemy uses psycopg driver.

    Railway exposes URLs like postgresql://user:pass@host/db. We rewrite them
    to postgresql+psycopg://... so SQLAlchemy will use the new psycopg driver
    instead of psycopg2.
    """
    uri = os.getenv("DATABASE_URL", "sqlite:///showbuff_etl.db")
    if uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql+psycopg://", 1)
    elif uri.startswith("postgresql://") and "+psycopg" not in uri:
        uri = uri.replace("postgresql://", "postgresql+psycopg://", 1)
    return uri


@dataclass
class Config:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    SQLALCHEMY_DATABASE_URI: str = _coerce_db_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # Redis / Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = REDIS_URL
    CELERY_RESULT_BACKEND: str = REDIS_URL

    # TMDB
    TMDB_API_KEY: str = os.getenv("TMDB_API_KEY", "")

    # Misc
    ENV: str = os.getenv("FLASK_ENV", "production")
