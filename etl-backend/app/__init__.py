import os

from flask import Flask
from .config import Config
from .extensions import db, migrate, socketio
from .importer.routes import importer_bp


def create_app(config_class: type[Config] | None = None) -> Flask:
    app = Flask(__name__)

    # Load configuration
    cfg_class = config_class or Config
    app.config.from_object(cfg_class())

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(
        app,
        cors_allowed_origins="*",
        message_queue=app.config.get("REDIS_URL"),
    )

    # Ensure database schema exists (idempotent); this avoids needing a
    # manual shell step on Railway to create tables.
    with app.app_context():
        db.create_all()

    # Register blueprints
    app.register_blueprint(importer_bp, url_prefix="/api/import")

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "service": "showbuff-importer", "env": app.config.get("ENV", "prod")}

    return app
