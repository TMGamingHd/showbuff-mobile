from flask import Blueprint

importer_bp = Blueprint("importer", __name__)

from . import routes  # noqa: E402,F401
