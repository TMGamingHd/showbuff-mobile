# ShowBuff Importer Backend (Flask + Celery)

This service powers the movie/TV title importer for the ShowBuff mobile app.
It provides:

- `POST /api/import/file` – upload TXT/PDF/CSV/Excel files for import
- `GET /api/import/<importId>/matches` – inspect extracted titles and matches
- `GET /api/import/matches/pending` – list pending imports for a user

Processing is done asynchronously via Celery + Redis, and results are stored in
PostgreSQL (movies/tv_shows/import_sessions/extracted_titles/title_matches).

## Local development

From `etl-backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Create DB tables (for local SQLite or Postgres)
FLASK_APP=wsgi.py flask db upgrade  # if you add migrations
# or, as a simple start:
python -c "from app import create_app; from app.extensions import db; app = create_app();\
with app.app_context(): db.create_all()"

# Run web server
python wsgi.py

# Run Celery worker (separate terminal)
celery -A celery_app.celery worker --loglevel=info
```

Make sure `.env` in this folder has valid values for `DATABASE_URL`, `REDIS_URL`, and
`TMDB_API_KEY` when running locally.

## Railway deployment

1. **Create a new Railway project** (via dashboard).
2. **Add a Postgres database** resource.
3. **Add a Redis** resource.
4. **Add a new Service from this repo (web app)**:
   - Root: `showbuff-mobile/etl-backend`
   - Start command: `python wsgi.py`
5. **Add another Service in the same project for the Celery worker**:
   - Root: `showbuff-mobile/etl-backend`
   - Start command: `celery -A celery_app.celery worker --loglevel=info`

6. **Configure environment variables** on both services:

   - `SECRET_KEY`: any random string
   - `DATABASE_URL`: **use the Postgres URL from Railway**
   - `REDIS_URL`: **use the Redis URL from Railway**
   - `TMDB_API_KEY`: your TMDB API key
   - `PORT`: `8000` (or let Railway set it and keep default `PORT`)

7. **Initialize the database** (one time):

   - Open a Railway shell on the **web service** and run:

     ```bash
     python -c "from app import create_app; from app.extensions import db;\
     app = create_app();\
     with app.app_context(): db.create_all()"
     ```

Once deployed, the web service will expose the importer API over HTTPS. Use
that base URL from the mobile app when calling `/api/import/...` endpoints.
