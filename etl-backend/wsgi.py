import os

from app import create_app
from app.extensions import socketio


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    # Use Socket.IO runner; allow Werkzeug in this managed environment.
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
