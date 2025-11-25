const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { initDb, pool } = require('./db');
const {
  users,
  tokens,
  shows,
  lists,
  reviews,
  friends,
  friendRequests,
  messages,
  activities,
  convoKey,
  getConvoArray,
  getUserByEmail,
  createUser,
  issueTokenForUser,
  validateToken,
  getUserIdFromToken,
  getUserById,
  upsertInMemoryUser,
  ensureUserLists,
  upsertShow,
} = require('./data');

// Helper function to ensure user has an activity feed
const ensureUserActivity = (userId) => {
  if (!activities.has(userId)) {
    activities.set(userId, []);
  }
  return activities.get(userId);
};

const app = express();
const PORT = process.env.PORT || 3001;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

// ===== List helpers (Postgres-backed) =====
function normalizeListType(value) {
  return String(value || '').replace(/_/g, '-');
}

async function getOrCreateUserListId(userId, listType) {
  const normalized = normalizeListType(listType);
  const result = await pool.query(
    `INSERT INTO user_lists (user_id, list_type)
     VALUES ($1, $2)
     ON CONFLICT (user_id, list_type) DO UPDATE SET list_type = EXCLUDED.list_type
     RETURNING id`,
    [userId, normalized]
  );
  return { id: result.rows[0].id, listType: normalized };
}

function rowToShow(row) {
  const id = Number(row.tmdb_id);
  const title = row.title || `Show #${id}`;
  return {
    id,
    title,
    name: title,
    poster_path: row.poster_path || null,
  };
}

async function getUserListItemsFromDb(userId, listType) {
  const normalized = normalizeListType(listType);
  const { rows } = await pool.query(
    `SELECT li.tmdb_id, li.title, li.poster_path
     FROM user_lists ul
     JOIN list_items li ON li.user_list_id = ul.id
     WHERE ul.user_id = $1 AND ul.list_type = $2
     ORDER BY li.added_at DESC`,
    [userId, normalized]
  );
  return rows.map(rowToShow);
}

async function addShowToListDb(userId, listType, movieId, movieData) {
  const normalized = normalizeListType(listType);
  const { id: listId } = await getOrCreateUserListId(userId, normalized);

  const tmdbId = Number(movieId || movieData?.id);
  const title = (movieData && (movieData.title || movieData.name)) || `Show #${tmdbId}`;
  const posterPath = movieData?.poster_path || null;
  const mediaType = movieData?.media_type || 'movie';
  const releaseDate = movieData?.release_date || null;
  const firstAirDate = movieData?.first_air_date || null;

  await pool.query(
    `INSERT INTO list_items (user_list_id, tmdb_id, media_type, title, poster_path, release_date, first_air_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_list_id, tmdb_id, media_type) DO NOTHING`,
    [listId, tmdbId, mediaType, title, posterPath, releaseDate, firstAirDate]
  );

  return { id: tmdbId, title, name: title, poster_path: posterPath };
}

async function removeShowFromListDb(userId, listType, showId) {
  const normalized = normalizeListType(listType);
  const { rows } = await pool.query(
    'SELECT id FROM user_lists WHERE user_id = $1 AND list_type = $2',
    [userId, normalized]
  );
  if (!rows.length) return;
  const listId = rows[0].id;
  await pool.query(
    'DELETE FROM list_items WHERE user_list_id = $1 AND tmdb_id = $2',
    [listId, showId]
  );
}

async function findShowForUser(userId, showId) {
  const tmdbId = Number(showId);
  const { rows } = await pool.query(
    `SELECT li.tmdb_id, li.title, li.poster_path
     FROM user_lists ul
     JOIN list_items li ON li.user_list_id = ul.id
     WHERE ul.user_id = $1 AND li.tmdb_id = $2
     ORDER BY li.added_at DESC
     LIMIT 1`,
    [userId, tmdbId]
  );
  if (!rows.length) return null;
  return rowToShow(rows[0]);
}

async function moveShowBetweenListsDb(userId, fromList, toList, movieId) {
  const normalizedFrom = normalizeListType(fromList);
  const normalizedTo = normalizeListType(toList);

  const { rows } = await pool.query(
    `SELECT
        ul_from.id AS from_list_id,
        ul_to.id   AS to_list_id
     FROM user_lists ul_from
     LEFT JOIN user_lists ul_to
       ON ul_to.user_id = ul_from.user_id
      AND ul_to.list_type = $3
     WHERE ul_from.user_id = $1
       AND ul_from.list_type = $2
     LIMIT 1`,
    [userId, normalizedFrom, normalizedTo]
  );

  if (!rows.length) {
    return { notFound: true };
  }

  const fromListId = rows[0].from_list_id;
  let toListId = rows[0].to_list_id;

  const itemRes = await pool.query(
    'SELECT * FROM list_items WHERE user_list_id = $1 AND tmdb_id = $2 LIMIT 1',
    [fromListId, movieId]
  );

  if (!itemRes.rows.length) {
    return { notFound: true };
  }

  const item = itemRes.rows[0];

  if (!toListId) {
    const created = await getOrCreateUserListId(userId, normalizedTo);
    toListId = created.id;
  }

  await pool.query('DELETE FROM list_items WHERE id = $1', [item.id]);

  await pool.query(
    `INSERT INTO list_items (user_list_id, tmdb_id, media_type, title, poster_path, release_date, first_air_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_list_id, tmdb_id, media_type) DO NOTHING`,
    [toListId, item.tmdb_id, item.media_type, item.title, item.poster_path, item.release_date, item.first_air_date]
  );

  return { show: rowToShow(item), fromList: normalizedFrom, toList: normalizedTo };
}

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Basic request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health + root
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'ShowBuff backend', time: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Auth helpers
function getTokenFromHeader(req) {
  const h = req.headers['authorization'] || '';
  const parts = h.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return null;
}

async function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token || !validateToken(token)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = getUserIdFromToken(token);
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let user = getUserById(userId);

  // If user is not in memory (e.g., after server restart), attempt to load from Postgres
  if (!user) {
    try {
      const { rows } = await pool.query(
        'SELECT id, email, username FROM users WHERE id = $1',
        [userId]
      );

      if (!rows.length) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const row = rows[0];
      user = {
        id: row.id,
        email: row.email,
        username: row.username,
      };

      // Mirror into in-memory map for downstream helpers
      upsertInMemoryUser(user);
    } catch (err) {
      console.error('Error loading user in requireAuth:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  req.token = token;
  req.userId = userId;
  req.user = user;
  next();
}

// ===== Auth endpoints =====
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email required' });
  if (!password) return res.status(400).json({ message: 'Password required' });

  try {
    const { rows } = await pool.query(
      'SELECT id, email, username, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const row = rows[0];

    const stored = row.password_hash || '';
    let isValid = false;
    let newHash = null;

    // If the stored value looks like a bcrypt hash, use bcrypt.compare
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      isValid = await bcrypt.compare(password, stored);
    } else {
      // Backward-compat: treat stored value as plaintext from the early phase
      if (stored === password) {
        isValid = true;
        // On successful login, upgrade to bcrypt hash
        newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }
    }

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Persist upgraded hash if needed
    if (newHash) {
      try {
        await pool.query(
          'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [newHash, row.id]
        );
      } catch (err) {
        console.error('Failed to upgrade password hash for user', row.id, err);
      }
    }

    // Keep in-memory representation in sync for the rest of the app
    upsertInMemoryUser({
      id: row.id,
      username: row.username,
      email: row.email,
    });

    const token = issueTokenForUser(row.id);
    ensureUserLists(row.id);
    return res.json({ token, user: { id: row.id, username: row.username, email: row.email } });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email required' });
  if (!password) return res.status(400).json({ message: 'Password required' });
  if (!username) return res.status(400).json({ message: 'Username required' });

  try {
    // Check for existing email or username in Postgres
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password before storing in Postgres
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert new user into Postgres with hashed password
    const insert = await pool.query(
      'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username',
      [email, username, passwordHash]
    );

    const user = insert.rows[0];

    // Mirror into in-memory users array for compatibility with the rest of the app
    upsertInMemoryUser({
      id: user.id,
      username: user.username,
      email: user.email,
    });

    const token = issueTokenForUser(user.id);
    ensureUserLists(user.id);
    return res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Error during registration:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  // Invalidate token (optional)
  try { tokens.delete(req.token); } catch (_) {}
  return res.json({ success: true });
});

// ===== User profile =====
app.get('/api/user/profile/:userId', requireAuth, async (req, res) => {
  const userId = Number(req.params.userId);

  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, avatar_url, bio FROM users WHERE id = $1',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const row = rows[0];

    // Keep in-memory cache in sync
    upsertInMemoryUser({ id: row.id, username: row.username, email: row.email });

    return res.json({
      id: row.id,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url || null,
      bio: row.bio || null,
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/user/profile/:userId', requireAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  const { username, email, avatarUrl, bio } = req.body || {};

  if (!username && !email && typeof avatarUrl === 'undefined' && typeof bio === 'undefined') {
    return res.status(400).json({ message: 'No profile fields provided' });
  }

  try {
    const fields = [];
    const values = [];

    if (typeof username === 'string') {
      fields.push('username');
      values.push(username);
    }
    if (typeof email === 'string') {
      fields.push('email');
      values.push(email);
    }
    if (typeof avatarUrl !== 'undefined') {
      fields.push('avatar_url');
      values.push(avatarUrl);
    }
    if (typeof bio !== 'undefined') {
      fields.push('bio');
      values.push(bio);
    }

    const setClauses = fields.map((f, idx) => `${f} = $${idx + 1}`).join(', ');
    values.push(userId);

    const { rows } = await pool.query(
      `UPDATE users
         SET ${setClauses}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, username, email, avatar_url, bio`,
      values
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const row = rows[0];

    // Sync in-memory cache
    upsertInMemoryUser({ id: row.id, username: row.username, email: row.email });

    return res.json({
      id: row.id,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url || null,
      bio: row.bio || null,
    });
  } catch (err) {
    console.error('Error updating user profile:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Lists =====
app.get('/api/user/watchlist', requireAuth, async (req, res) => {
  try {
    const items = await getUserListItemsFromDb(req.userId, 'watchlist');
    return res.json(items);
  } catch (err) {
    console.error('Error fetching watchlist:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/user/currently-watching', requireAuth, async (req, res) => {
  try {
    const items = await getUserListItemsFromDb(req.userId, 'currently-watching');
    return res.json(items);
  } catch (err) {
    console.error('Error fetching currently-watching list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/user/watched', requireAuth, async (req, res) => {
  try {
    const items = await getUserListItemsFromDb(req.userId, 'watched');
    return res.json(items);
  } catch (err) {
    console.error('Error fetching watched list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/user/add-to-list', requireAuth, async (req, res) => {
  const { movieId, listType, movieData } = req.body || {};
  if (!listType) return res.status(400).json({ message: 'listType required' });

  try {
    const normalized = normalizeListType(listType);
    const show = await addShowToListDb(req.userId, normalized, movieId, movieData);

    // Record list activity in Postgres so it persists across sessions
    const action =
      normalized === 'watchlist'
        ? 'added_to_watchlist'
        : normalized === 'currently-watching'
        ? 'added_to_currentlywatching'
        : 'added_to_watched';

    await pool.query(
      `INSERT INTO activities (user_id, type, action, tmdb_id, media_type, movie_title, movie_poster, visibility)
       VALUES ($1, 'list', $2, $3, $4, $5, $6, 'friends')`,
      [
        req.userId,
        action,
        show.id,
        (movieData && movieData.media_type) || 'movie',
        show.title || 'Unknown Movie',
        show.poster_path || null,
      ]
    );

    return res.json({ success: true, list: normalized, show });
  } catch (err) {
    console.error('Error adding to list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/user/move-to-list', requireAuth, async (req, res) => {
  const { movieId, fromList, toList } = req.body || {};
  if (!fromList || !toList) return res.status(400).json({ message: 'fromList and toList required' });

  try {
    const result = await moveShowBetweenListsDb(req.userId, fromList, toList, movieId);
    if (result.notFound) {
      return res.status(404).json({ message: 'Movie not found in source list' });
    }

    const { show, fromList: normalizedFrom, toList: normalizedTo } = result;

    // Record move activity in Postgres
    const moveAction =
      normalizedTo === 'watchlist'
        ? 'moved_to_watchlist'
        : normalizedTo === 'currently-watching'
        ? 'moved_to_currentlywatching'
        : 'moved_to_watched';

    await pool.query(
      `INSERT INTO activities (user_id, type, action, tmdb_id, media_type, movie_title, movie_poster, visibility)
       VALUES ($1, 'list', $2, $3, $4, $5, $6, 'friends')`,
      [
        req.userId,
        moveAction,
        show.id,
        (show && show.media_type) || 'movie',
        show.title || 'Unknown Movie',
        show.poster_path || null,
      ]
    );

    return res.json({ success: true, fromList: normalizedFrom, toList: normalizedTo, show });
  } catch (err) {
    console.error('Error moving movie between lists:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/user/reviews', requireAuth, async (req, res) => {
  const { showId, rating, comment, movie, tags, isRewatched, containsSpoilers, visibility } = req.body || {};
  if (!showId && !movie?.id) return res.status(400).json({ message: 'showId or movie required' });

  const movieId = Number(showId || movie.id);
  const mediaType = movie?.media_type || 'movie';

  try {
    const user = getUserById(req.userId);

    // Check if user already has a review for this movie
    const existing = await pool.query(
      'SELECT id, created_at FROM reviews WHERE user_id = $1 AND tmdb_id = $2 AND media_type = $3',
      [req.userId, movieId, mediaType]
    );

    const isEditing = existing.rows.length > 0;
    let reviewRow;

    if (isEditing) {
      const id = existing.rows[0].id;
      await pool.query(
        `UPDATE reviews
           SET rating = $1,
               comment = $2,
               tags = $3,
               is_rewatched = $4,
               contains_spoilers = $5,
               visibility = $6,
               updated_at = NOW()
         WHERE id = $7`,
        [
          Number(rating) || 0,
          comment || '',
          JSON.stringify(tags || []),
          Boolean(isRewatched),
          Boolean(containsSpoilers),
          visibility || 'friends',
          id,
        ]
      );

      const { rows } = await pool.query(
        'SELECT * FROM reviews WHERE id = $1',
        [id]
      );
      reviewRow = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO reviews
         (user_id, tmdb_id, media_type, rating, comment, tags, is_rewatched, contains_spoilers, visibility)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
         RETURNING *`,
        [
          req.userId,
          movieId,
          mediaType,
          Number(rating) || 0,
          comment || '',
          JSON.stringify(tags || []),
          Boolean(isRewatched),
          Boolean(containsSpoilers),
          visibility || 'friends',
        ]
      );
      reviewRow = rows[0];
    }

    const createdAt = reviewRow.created_at;
    const updatedAt = reviewRow.updated_at;

    const review = {
      id: `review-${reviewRow.id}`,
      movieId,
      movie: movie || { id: movieId, title: 'Unknown Movie' },
      rating: reviewRow.rating,
      comment: reviewRow.comment,
      tags: Array.isArray(reviewRow.tags) ? reviewRow.tags : reviewRow.tags || [],
      isRewatched: reviewRow.is_rewatched,
      containsSpoilers: reviewRow.contains_spoilers,
      visibility: reviewRow.visibility,
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      reactions: [],
      comments: [],
      createdAt,
      updatedAt,
    };

    // Persist review activity to Postgres so it appears in feeds
    const activityAction = isEditing ? 'updated' : 'reviewed';

    await pool.query(
      `INSERT INTO activities (
         user_id, type, action,
         tmdb_id, media_type, movie_title, movie_poster,
         rating, comment, visibility
       )
       VALUES ($1, 'review', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.userId,
        activityAction,
        review.movieId,
        mediaType,
        review.movie?.title || 'Unknown Movie',
        review.movie?.poster_path || null,
        review.rating,
        review.comment,
        review.visibility,
      ]
    );

    return res.json({ success: true, review, isEditing });
  } catch (error) {
    console.error('Error managing review:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.email
       FROM friends f
       JOIN users u ON u.id = f.friend_user_id
       WHERE f.user_id = $1
       ORDER BY u.username`,
      [req.userId]
    );

    const result = rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
    }));

    friends.set(
      req.userId,
      result.map((f) => ({ id: f.id, username: f.username }))
    );

    return res.json(result);
  } catch (err) {
    console.error('Error fetching friends:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/friends/requests', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fr.id,
              fr.from_user_id,
              fr.to_user_id,
              fr.status,
              fr.created_at,
              u.username,
              u.email
       FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user_id
       WHERE fr.to_user_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [req.userId]
    );

    const requests = rows.map((row) => ({
      id: row.id,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      status: row.status,
      senderUsername: row.username,
      senderEmail: row.email,
      createdAt: row.created_at,
    }));

    return res.json(requests);
  } catch (err) {
    console.error('Error fetching friend requests:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/friends/request', requireAuth, async (req, res) => {
  const { userId } = req.body || {};
  const targetId = Number(userId);

  if (!targetId || targetId === req.userId) {
    return res.status(400).json({ message: 'Invalid target user' });
  }

  try {
    const existingFriend = await pool.query(
      `SELECT 1 FROM friends
       WHERE (user_id = $1 AND friend_user_id = $2)
          OR (user_id = $2 AND friend_user_id = $1)
       LIMIT 1`,
      [req.userId, targetId]
    );
    if (existingFriend.rows.length) {
      return res.status(400).json({ message: 'Already friends' });
    }

    // Look for any existing friend request between these two users
    const existingReq = await pool.query(
      `SELECT * FROM friend_requests
       WHERE (from_user_id = $1 AND to_user_id = $2)
          OR (from_user_id = $2 AND to_user_id = $1)
       LIMIT 1`,
      [req.userId, targetId]
    );

    if (existingReq.rows.length) {
      const row = existingReq.rows[0];

      // If the other user has already sent us a pending request, client should accept instead
      if (row.status === 'pending' && row.from_user_id === targetId && row.to_user_id === req.userId) {
        return res.status(400).json({ message: 'User has already sent you a friend request' });
      }

      // If we previously sent a request (any status), reuse that row by resetting it to pending
      if (row.from_user_id === req.userId && row.to_user_id === targetId) {
        if (row.status === 'pending') {
          return res.status(400).json({ message: 'Request already exists' });
        }

        const updated = await pool.query(
          `UPDATE friend_requests
             SET status = 'pending',
                 created_at = NOW(),
                 responded_at = NULL
           WHERE id = $1
           RETURNING id, from_user_id, to_user_id, status, created_at`,
          [row.id]
        );

        const ur = updated.rows[0];
        return res.json({
          success: true,
          message: 'Friend request sent',
          request: {
            id: ur.id,
            fromUserId: ur.from_user_id,
            toUserId: ur.to_user_id,
            status: ur.status,
            createdAt: ur.created_at,
          },
        });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO friend_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (from_user_id, to_user_id)
       DO UPDATE SET
         status = 'pending',
         created_at = NOW(),
         responded_at = NULL
       RETURNING id, from_user_id, to_user_id, status, created_at`,
      [req.userId, targetId]
    );

    const r = rows[0];
    return res.json({
      success: true,
      message: 'Friend request sent',
      request: {
        id: r.id,
        fromUserId: r.from_user_id,
        toUserId: r.to_user_id,
        status: r.status,
        createdAt: r.created_at,
      },
    });
  } catch (err) {
    console.error('Error sending friend request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/friends/accept/:requestId', requireAuth, async (req, res) => {
  const requestId = Number(req.params.requestId);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM friend_requests
       WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
      [requestId, req.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    const fr = rows[0];

    await pool.query('BEGIN');

    await pool.query(
      `UPDATE friend_requests
         SET status = 'accepted', responded_at = NOW()
       WHERE id = $1`,
      [requestId]
    );

    await pool.query(
      `INSERT INTO friends (user_id, friend_user_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
      [fr.from_user_id, fr.to_user_id]
    );
    await pool.query(
      `INSERT INTO friends (user_id, friend_user_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, friend_user_id) DO NOTHING`,
      [fr.to_user_id, fr.from_user_id]
    );

    await pool.query('COMMIT');

    return res.json({ success: true });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('Error accepting friend request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/friends/reject/:requestId', requireAuth, async (req, res) => {
  const requestId = Number(req.params.requestId);

  try {
    const result = await pool.query(
      `UPDATE friend_requests
         SET status = 'rejected', responded_at = NOW()
       WHERE id = $1 AND to_user_id = $2 AND status = 'pending'
       RETURNING id`,
      [requestId, req.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error rejecting friend request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/friends/:friendId/profile', requireAuth, async (req, res) => {
  const friendId = Number(req.params.friendId);

  try {
    console.log(`[${new Date().toISOString()}] GET /api/friends/${friendId}/profile`);
    console.log('Requesting user ID:', req.userId);
    console.log('Friend ID:', friendId);

    // Check if they are actually friends (one direction is enough)
    const rel = await pool.query(
      `SELECT 1 FROM friends WHERE user_id = $1 AND friend_user_id = $2 LIMIT 1`,
      [req.userId, friendId]
    );
    if (!rel.rows.length) {
      console.log('Not authorized - not friends');
      return res.status(403).json({ error: 'Not authorized to view this profile' });
    }

    // Get friend's basic info
    const userRes = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [friendId]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'Friend not found' });
    }
    const friendUser = userRes.rows[0];

    // Get friend's lists from Postgres
    const [friendWatchlist, friendCurrentlyWatching, friendWatched] = await Promise.all([
      getUserListItemsFromDb(friendId, 'watchlist'),
      getUserListItemsFromDb(friendId, 'currently-watching'),
      getUserListItemsFromDb(friendId, 'watched'),
    ]);

    // Get friend's reviews from Postgres
    const reviewsRes = await pool.query(
      'SELECT * FROM reviews WHERE user_id = $1 ORDER BY updated_at DESC',
      [friendId]
    );
    const friendReviews = reviewsRes.rows.map((row) => ({
      id: `review-${row.id}`,
      movieId: Number(row.tmdb_id),
      movie: { id: Number(row.tmdb_id) },
      rating: row.rating,
      comment: row.comment,
      tags: Array.isArray(row.tags) ? row.tags : row.tags || [],
      isRewatched: row.is_rewatched,
      containsSpoilers: row.contains_spoilers,
      visibility: row.visibility,
      userId: friendId,
      userName: friendUser.username || friendUser.email,
      reactions: [],
      comments: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Get friend's activity from Postgres
    const { rows: activityRows } = await pool.query(
      `SELECT a.*, u.username, u.email
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [friendId]
    );

    const friendActivity = activityRows.map(mapActivityRowToPost);

    console.log('Friend data:');
    console.log('- Watchlist:', friendWatchlist.length, 'items');
    console.log('- Currently Watching:', friendCurrentlyWatching.length, 'items');
    console.log('- Watched:', friendWatched.length, 'items');
    console.log('- Reviews:', friendReviews.length, 'items');
    console.log('- Activity:', friendActivity.length, 'items');

    const response = {
      user: {
        id: friendUser.id,
        username: friendUser.username,
        email: friendUser.email,
      },
      watchlist: friendWatchlist,
      currentlyWatching: friendCurrentlyWatching,
      watched: friendWatched,
      reviews: friendReviews,
      activity: friendActivity,
    };

    console.log('Sending response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
    console.error('Error fetching friend profile:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/friends/remove/:friendId', requireAuth, async (req, res) => {
  const friendId = Number(req.params.friendId);

  try {
    // Remove friendship in both directions from DB
    await pool.query(
      'DELETE FROM friends WHERE (user_id = $1 AND friend_user_id = $2) OR (user_id = $2 AND friend_user_id = $1)',
      [req.userId, friendId]
    );

    // Refresh in-memory friends lists for both users
    const meFriendsRes = await pool.query(
      `SELECT u.id, u.username
       FROM friends f
       JOIN users u ON u.id = f.friend_user_id
       WHERE f.user_id = $1
       ORDER BY u.username`,
      [req.userId]
    );
    friends.set(
      req.userId,
      meFriendsRes.rows.map((row) => ({ id: row.id, username: row.username }))
    );

    const otherFriendsRes = await pool.query(
      `SELECT u.id, u.username
       FROM friends f
       JOIN users u ON u.id = f.friend_user_id
       WHERE f.user_id = $1
       ORDER BY u.username`,
      [friendId]
    );
    friends.set(
      friendId,
      otherFriendsRes.rows.map((row) => ({ id: row.id, username: row.username }))
    );

    res.json({ success: true, message: 'Friend removed successfully' });
  } catch (err) {
    console.error('Error removing friend:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) {
    return res.json([]);
  }

  try {
    const pattern = `%${q}%`;
    const { rows } = await pool.query(
      `SELECT id, username, email
       FROM users
       WHERE LOWER(username) LIKE $1 OR LOWER(email) LIKE $1
       ORDER BY username`,
      [pattern]
    );

    const result = rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
    }));

    // Optionally sync in-memory users cache for compatibility
    result.forEach((u) => {
      upsertInMemoryUser({ id: u.id, username: u.username, email: u.email });
    });

    res.json(result);
  } catch (err) {
    console.error('Error searching users:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/friends/:friendId/movies', requireAuth, async (req, res) => {
  const friendId = Number(req.params.friendId);
  const list = req.query.list ? normalizeListType(req.query.list) : null;

  try {
    if (list) {
      const items = await getUserListItemsFromDb(friendId, list);
      return res.json(items);
    }

    const [watchlist, currentlyWatching, watched] = await Promise.all([
      getUserListItemsFromDb(friendId, 'watchlist'),
      getUserListItemsFromDb(friendId, 'currently-watching'),
      getUserListItemsFromDb(friendId, 'watched'),
    ]);

    return res.json({
      watchlist,
      'currently-watching': currentlyWatching,
      watched,
    });
  } catch (err) {
    console.error('Error fetching friend movies:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Activity (Postgres-backed) =====
// Helper to map an activities row + in-memory like/comment state into the post shape
function mapActivityRowToPost(row) {
  const postId = String(row.id);

  // In-memory likes/comments are keyed by postId (string)
  const likesSet = postLikes.get(postId) || new Set();
  const commentsArr = postComments.get(postId) || [];

  const movie = row.tmdb_id
    ? {
        id: row.tmdb_id,
        tmdbId: row.tmdb_id,
        title: row.movie_title,
        name: row.movie_title,
        poster_path: row.movie_poster,
        media_type: row.media_type,
      }
    : null;

  const movieId = movie?.id;
  const movieTitle = movie?.title || movie?.name;
  const moviePoster = movie?.poster_path;

  return {
    id: postId,
    type: row.type,
    action: row.action,
    userId: row.user_id,
    userName: row.username || row.user_name || row.email || 'User',
    content: row.comment,
    visibility: row.visibility || 'friends',
    movie,
    movieId,
    movieTitle,
    moviePoster,
    createdAt: row.created_at,
    reactions: Array.from(likesSet),
    comments: commentsArr.length,
    likeCount: likesSet.size,
    commentCount: commentsArr.length,
  };
}

// Create a text post (with optional movie) and persist to activities table
app.post('/api/activity/create-post', requireAuth, async (req, res) => {
  const { content, visibility = 'friends', movie } = req.body || {};
  const text = String(content || '').trim();

  if (!text) {
    return res.status(400).json({ message: 'content is required' });
  }

  try {
    const user = getUserById(req.userId);

    const tmdbId = movie?.id || movie?.tmdbId || null;
    const mediaType = movie?.media_type || 'movie';
    const movieTitle = movie?.title || movie?.name || null;
    const moviePoster = movie?.poster_path || null;

    const { rows } = await pool.query(
      `INSERT INTO activities (user_id, type, action, comment, visibility, tmdb_id, media_type, movie_title, movie_poster)
       VALUES ($1, 'post', 'created', $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, type, action, comment, visibility, tmdb_id, media_type, movie_title, movie_poster, created_at`,
      [
        req.userId,
        text,
        visibility || 'friends',
        tmdbId,
        mediaType,
        movieTitle,
        moviePoster,
      ]
    );

    const row = rows[0];
    // Attach username/email for mapping helper
    row.username = user?.username || null;
    row.email = user?.email || null;

    const post = mapActivityRowToPost(row);
    return res.json({ success: true, post });
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get friends+own activity feed
app.get('/api/user/activity', requireAuth, async (req, res) => {
  try {
    // Load friend user IDs
    const { rows: friendRows } = await pool.query(
      'SELECT friend_user_id FROM friends WHERE user_id = $1',
      [req.userId]
    );

    const friendIds = friendRows.map((r) => r.friend_user_id);
    const allIds = Array.from(new Set([req.userId, ...friendIds]));

    const { rows } = await pool.query(
      `SELECT a.*, u.username, u.email
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id = ANY($1::bigint[])
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [allIds]
    );

    const feed = rows.map(mapActivityRowToPost);
    return res.json(feed);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get a specific user's activity
app.get('/api/user/:userId/activity', requireAuth, async (req, res) => {
  const userId = Number(req.params.userId);

  if (!userId) {
    return res.status(400).json({ message: 'Invalid userId' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.username, u.email
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [userId]
    );

    const feed = rows.map(mapActivityRowToPost);
    return res.json(feed);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get social feed (global activity: friends+public visibility)
app.get('/api/feed/social', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.username, u.email
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.type = 'post'
         AND (a.visibility = 'public' OR a.visibility = 'friends')
       ORDER BY a.created_at DESC
       LIMIT 100`
    );

    const feed = rows.map(mapActivityRowToPost);
    return res.json(feed);
  } catch (error) {
    console.error('Error fetching social feed:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// ===== Messaging (Postgres-backed) =====
// Get conversations
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    // Start from friends list (Postgres-backed)
    const friendsRes = await pool.query(
      `SELECT u.id, u.username
       FROM friends f
       JOIN users u ON u.id = f.friend_user_id
       WHERE f.user_id = $1
       ORDER BY u.username`,
      [req.userId]
    );

    const userFriends = friendsRes.rows.map((row) => ({ id: row.id, username: row.username }));

    // For each friend, compute unread count from messages table
    const conversations = [];
    for (const friend of userFriends) {
      const unreadRes = await pool.query(
        `SELECT COUNT(*) AS count
         FROM messages
         WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
        [friend.id, req.userId]
      );
      const unreadCount = parseInt(unreadRes.rows[0]?.count || '0', 10);

      conversations.push({
        friendId: friend.id,
        friendName: friend.username,
        lastMessage: null, // Placeholder for now; UI currently doesn't depend on it
        unreadCount,
      });
    }

    return res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get messages with a friend
app.get('/api/messages/conversation/:friendId', requireAuth, async (req, res) => {
  const friendId = Number(req.params.friendId);

  try {
    const { rows } = await pool.query(
      `SELECT
         m.id,
         m.sender_id,
         m.receiver_id,
         su.username AS sender_username,
         ru.username AS receiver_username,
         m.message_type,
         m.text AS message_text,
         m.tmdb_id,
         m.media_type,
         m.movie_payload AS movie_data,
         m.created_at
       FROM messages m
       JOIN users su ON su.id = m.sender_id
       JOIN users ru ON ru.id = m.receiver_id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC`,
      [req.userId, friendId]
    );

    console.log(`[DEBUG] Fetching conversation (DB) for users ${req.userId} and ${friendId}`);
    console.log(`[DEBUG] Found ${rows.length} messages`);

    return res.json({ messages: rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Send a message
app.post('/api/messages/send', requireAuth, async (req, res) => {
  const { receiverId, friendId, messageText, content } = req.body || {};
  const targetId = receiverId || friendId;
  const text = messageText || content;

  if (!targetId || !text) {
    return res.status(400).json({ message: 'receiverId and messageText required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, message_type, text)
       VALUES ($1, $2, 'text', $3)
       RETURNING id, sender_id, receiver_id, message_type,
                 text AS message_text, tmdb_id, media_type,
                 movie_payload AS movie_data, created_at`,
      [req.userId, Number(targetId), text]
    );

    const message = rows[0];
    return res.json({ success: true, message });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Send movie recommendation
app.post('/api/messages/send-movie', requireAuth, async (req, res) => {
  const { receiverId, friendId, movieId, tmdbId, messageText, content, movie } = req.body || {};
  const targetId = receiverId || friendId;
  const text = messageText || content || 'Shared a movie with you';
  const movieData = movie || null;

  if (!targetId) {
    return res.status(400).json({ message: 'receiverId required' });
  }

  const effectiveTmdbId = tmdbId || movieId || movieData?.id || null;
  const mediaType = movieData?.media_type || 'movie';

  try {
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, message_type, text, tmdb_id, media_type, movie_payload)
       VALUES ($1, $2, 'movie_recommendation', $3, $4, $5, $6::jsonb)
       RETURNING id, sender_id, receiver_id, message_type,
                 text AS message_text, tmdb_id, media_type,
                 movie_payload AS movie_data, created_at`,
      [
        req.userId,
        Number(targetId),
        text,
        effectiveTmdbId,
        mediaType,
        movieData ? JSON.stringify(movieData) : null,
      ]
    );

    const message = rows[0];
    return res.json({ success: true, message });
  } catch (error) {
    console.error('Error sending movie:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Mark messages as read
app.put('/api/messages/mark-read/:friendId', requireAuth, async (req, res) => {
  const friendId = Number(req.params.friendId);

  try {
    await pool.query(
      `UPDATE messages
         SET read_at = NOW()
       WHERE receiver_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [req.userId, friendId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get unread message counts (per friend)
app.get('/api/messages/unread-counts', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sender_id, COUNT(*) AS count
       FROM messages
       WHERE receiver_id = $1 AND read_at IS NULL
       GROUP BY sender_id`,
      [req.userId]
    );

    const unreadCounts = {};
    for (const row of rows) {
      unreadCounts[row.sender_id] = parseInt(row.count || '0', 10);
    }

    return res.json(unreadCounts);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get total unread count
app.get('/api/messages/total-unread', requireAuth, async (req, res) => {
  try {
    // Unread messages for the user
    const unreadRes = await pool.query(
      `SELECT COUNT(*) AS count
       FROM messages
       WHERE receiver_id = $1 AND read_at IS NULL`,
      [req.userId]
    );
    const unreadMessages = parseInt(unreadRes.rows[0]?.count || '0', 10);

    // Pending friend requests for the user
    const reqRes = await pool.query(
      `SELECT COUNT(*) AS count
       FROM friend_requests
       WHERE to_user_id = $1 AND status = 'pending'`,
      [req.userId]
    );
    const pendingRequests = parseInt(reqRes.rows[0]?.count || '0', 10);

    const totalUnread = unreadMessages + pendingRequests;
    return res.json({ total: totalUnread });
  } catch (error) {
    console.error('Error fetching total unread:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// ===== Post Interaction Endpoints =====
// In-memory storage for post interactions (likes/comments) keyed by activity ID
const postLikes = new Map(); // postId -> Set of userIds who liked it
const postComments = new Map(); // postId -> Array of comments
const commentLikes = new Map(); // commentId -> Set of userIds who liked it

// Like/Unlike a post (activity row)
app.post('/api/posts/:postId/like', requireAuth, (req, res) => {
  try {
    const postId = String(req.params.postId);
    const userId = req.userId;

    if (!postLikes.has(postId)) {
      postLikes.set(postId, new Set());
    }

    const likes = postLikes.get(postId);
    const isLiked = likes.has(userId);

    if (isLiked) {
      likes.delete(userId);
    } else {
      likes.add(userId);
    }

    const likesArray = Array.from(likes);

    return res.json({
      success: true,
      liked: !isLiked,
      likeCount: likes.size,
      reactions: likesArray,
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get post comments
app.get('/api/posts/:postId/comments', requireAuth, (req, res) => {
  try {
    const postId = String(req.params.postId);
    const comments = postComments.get(postId) || [];
    const sort = req.query.sort || 'newest';

    // Enrich comments with current like status for requesting user
    const enrichedComments = comments.map(comment => {
      const likes = commentLikes.get(comment.id) || new Set();
      return {
        ...comment,
        likeCount: likes.size,
        liked: likes.has(req.userId),
      };
    });

    let sortedComments = [...enrichedComments];
    if (sort === 'top') {
      // Sort by like count (descending), then by creation date (newest first)
      sortedComments.sort((a, b) => {
        const aLikes = (a.likeCount || 0);
        const bLikes = (b.likeCount || 0);
        if (aLikes !== bLikes) return bLikes - aLikes;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else {
      // Sort by creation date (newest first)
      sortedComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return res.json(sortedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Add comment to post (in-memory, keyed by activity ID)
app.post('/api/posts/:postId/comments', requireAuth, (req, res) => {
  try {
    const postId = String(req.params.postId);
    const { text } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const user = getUserById(req.userId);
    const comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      postId,
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      text: text.trim(),
      createdAt: new Date().toISOString(),
      likeCount: 0,
      liked: false,
    };

    if (!postComments.has(postId)) {
      postComments.set(postId, []);
    }

    const comments = postComments.get(postId);
    comments.push(comment);

    return res.json({
      success: true,
      comment,
      commentCount: comments.length,
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Like/Unlike a comment (in-memory only)
app.post('/api/posts/:postId/comments/:commentId/like', requireAuth, (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.userId;

    // Initialize comment likes storage if needed
    if (!commentLikes.has(commentId)) {
      commentLikes.set(commentId, new Set());
    }

    const likes = commentLikes.get(commentId);
    const isLiked = likes.has(userId);

    if (isLiked) {
      likes.delete(userId);
    } else {
      likes.add(userId);
    }

    // Update the comment in postComments to include like count
    const comments = postComments.get(postId) || [];
    const commentIndex = comments.findIndex((c) => c.id === commentId);
    if (commentIndex >= 0) {
      comments[commentIndex].likeCount = likes.size;
      comments[commentIndex].liked = !isLiked;
    }

    return res.json({
      success: true,
      liked: !isLiked,
      likeCount: likes.size,
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Like/Unlike a post (activity row)
app.post('/api/posts/:postId/like', requireAuth, (req, res) => {
  try {
    const postId = String(req.params.postId);
    const userId = req.userId;

    if (!postLikes.has(postId)) {
      postLikes.set(postId, new Set());
    }

    const likes = postLikes.get(postId);
    const isLiked = likes.has(userId);

    if (isLiked) {
      likes.delete(userId);
    } else {
      likes.add(userId);
    }

    const likesArray = Array.from(likes);

    return res.json({
      success: true,
      liked: !isLiked,
      likeCount: likes.size,
      reactions: likesArray,
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get post like status and count (from in-memory likes map)
app.get('/api/posts/:postId/likes', requireAuth, (req, res) => {
  try {
    const postId = String(req.params.postId);
    const likes = postLikes.get(postId) || new Set();
    const isLiked = likes.has(req.userId);

    return res.json({
      liked: isLiked,
      likeCount: likes.size,
      likedBy: Array.from(likes),
    });
  } catch (error) {
    console.error('Error fetching likes:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Function to start the server
const startServer = () => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShowBuff backend listening on http://0.0.0.0:${PORT}`);
  });

  return server;
};

// Only start the server if this file is run directly (not required)
if (require.main === module) {
  (async () => {
    try {
      await initDb();
    } catch (err) {
      console.error('[Server] Failed to initialize database schema:', err);
    }
    startServer();
  })();
}

module.exports = { app, startServer };
