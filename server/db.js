const { Pool } = require('pg');

// Create a shared connection pool using DATABASE_URL from the environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL is usually required on Railway Postgres; let node-postgres auto-detect via DATABASE_SSL envs
});

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB] DATABASE_URL not set; skipping Postgres initialization');
    return;
  }

  console.log('[DB] Initializing Postgres schema...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              BIGSERIAL PRIMARY KEY,
        email           TEXT NOT NULL UNIQUE,
        username        TEXT NOT NULL UNIQUE,
        password_hash   TEXT NOT NULL,
        avatar_url      TEXT,
        bio             TEXT,
        last_login_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // User settings (notification / privacy prefs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id                   BIGSERIAL PRIMARY KEY,
        user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        push_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
        email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
        activity_visibility  TEXT NOT NULL DEFAULT 'friends',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id)
      );
    `);

    // User lists (watchlist, currently_watching, watched)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_lists (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        list_type   TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, list_type)
      );
    `);

    // List items (per user_list)
    await client.query(`
      CREATE TABLE IF NOT EXISTS list_items (
        id              BIGSERIAL PRIMARY KEY,
        user_list_id    BIGINT NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
        tmdb_id         BIGINT NOT NULL,
        media_type      TEXT NOT NULL,
        title           TEXT,
        poster_path     TEXT,
        release_date    DATE,
        first_air_date  DATE,
        added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_list_id, tmdb_id, media_type)
      );
    `);

    // Reviews
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id                BIGSERIAL PRIMARY KEY,
        user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tmdb_id           BIGINT NOT NULL,
        media_type        TEXT NOT NULL,
        rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
        comment           TEXT,
        tags              JSONB DEFAULT '[]'::JSONB,
        is_rewatched      BOOLEAN NOT NULL DEFAULT FALSE,
        contains_spoilers BOOLEAN NOT NULL DEFAULT FALSE,
        visibility        TEXT NOT NULL DEFAULT 'friends',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, tmdb_id, media_type)
      );
    `);

    // Friends
    await client.query(`
      CREATE TABLE IF NOT EXISTS friends (
        id              BIGSERIAL PRIMARY KEY,
        user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, friend_user_id)
      );
    `);

    // Friend requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id            BIGSERIAL PRIMARY KEY,
        from_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status        TEXT NOT NULL DEFAULT 'pending',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at  TIMESTAMPTZ,
        UNIQUE (from_user_id, to_user_id)
      );
    `);

    // Messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id            BIGSERIAL PRIMARY KEY,
        sender_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_type  TEXT NOT NULL,
        text          TEXT,
        tmdb_id       BIGINT,
        media_type    TEXT,
        movie_payload JSONB,
        read_at       TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Activities
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id            BIGSERIAL PRIMARY KEY,
        user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type          TEXT NOT NULL,
        action        TEXT,
        tmdb_id       BIGINT,
        media_type    TEXT,
        movie_title   TEXT,
        movie_poster  TEXT,
        rating        INTEGER,
        comment       TEXT,
        visibility    TEXT DEFAULT 'friends',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('[DB] Schema initialization complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Schema initialization failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDb,
};
