from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_socketio import SocketIO


db = SQLAlchemy()
migrate = Migrate()
# Socket.IO instance (async mode will be auto-selected by the library).
# We configure the Redis message_queue in app.__init__.py so multiple
# Railway instances can share events.
socketio = SocketIO(cors_allowed_origins="*")
