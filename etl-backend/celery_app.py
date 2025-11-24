from __future__ import annotations

import os

from celery import Celery

from app import create_app
from app.config import Config


celery = Celery("showbuff_importer", include=["app.tasks.import_tasks"])


def _make_celery_app() -> Celery:
    cfg = Config()
    celery.conf.broker_url = cfg.CELERY_BROKER_URL
    celery.conf.result_backend = cfg.CELERY_RESULT_BACKEND

    flask_app = create_app(cfg.__class__)

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):  # type: ignore[override]
            with flask_app.app_context():
                return super().__call__(*args, **kwargs)

    celery.Task = ContextTask  # type: ignore[assignment]

    return celery


_make_celery_app()
