import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load .env when running locally; Railway will provide env vars directly
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


@dataclass
class Config:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    SQLALCHEMY_DATABASE_URI: str = os.getenv("DATABASE_URL", "sqlite:///showbuff_etl.db")
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # Redis / Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = REDIS_URL
    CELERY_RESULT_BACKEND: str = REDIS_URL

    # TMDB
    TMDB_API_KEY: str = os.getenv("TMDB_API_KEY", "")

    # Misc
    ENV: str = os.getenv("FLASK_ENV", "production")
