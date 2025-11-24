from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_socketio import SocketIO


db = SQLAlchemy()
migrate = Migrate()
# Use Redis message queue when running behind multiple workers
socketio = SocketIO(async_mode="eventlet", cors_allowed_origins="*")
