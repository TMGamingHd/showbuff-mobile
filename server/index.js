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
app.get('/api/user/profile/:userId', requireAuth, (req, res) => {
  const user = getUserById(req.params.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ ...user });
});

app.put('/api/user/profile/:userId', requireAuth, (req, res) => {
  const user = getUserById(req.params.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { username, email } = req.body || {};
  if (username) user.username = username;
  if (email) user.email = email;
  return res.json({ ...user });
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

    // Add to user activity (still in-memory for now)
    const user = getUserById(req.userId);
    const userActivities = activities.get(req.userId) || [];
    userActivities.unshift({
      id: `activity-${Date.now()}`,
      type: 'list',
      action: normalized === 'watchlist' ? 'added_to_watchlist' : 
             normalized === 'currently-watching' ? 'added_to_currentlywatching' : 'added_to_watched',
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      movieId: show.id,
      movieTitle: show.title || 'Unknown Movie',
      moviePoster: show.poster_path,
      createdAt: new Date().toISOString()
    });
    activities.set(req.userId, userActivities.slice(0, 100)); // Keep last 100 activities

    return res.json({ success: true, list: normalized, show });
  } catch (err) {
    console.error('Error adding to list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/user/remove-from-watchlist', requireAuth, async (req, res) => {
  const { showId } = req.body || {};
  try {
    await removeShowFromListDb(req.userId, 'watchlist', showId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error removing from watchlist:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post('/api/user/remove-from-currently-watching', requireAuth, async (req, res) => {
  const { showId } = req.body || {};
  try {
    await removeShowFromListDb(req.userId, 'currently-watching', showId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error removing from currently-watching:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post('/api/user/remove-from-watched', requireAuth, async (req, res) => {
  const { showId } = req.body || {};
  try {
    await removeShowFromListDb(req.userId, 'watched', showId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error removing from watched:', err);
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

    // Add to user activity (still in-memory for now)
    const user = getUserById(req.userId);
    const userActivities = activities.get(req.userId) || [];
    userActivities.unshift({
      id: `activity-${Date.now()}`,
      type: 'list',
      action: normalizedTo === 'watchlist' ? 'moved_to_watchlist' : 
             normalizedTo === 'currently-watching' ? 'moved_to_currentlywatching' : 'moved_to_watched',
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      movieId: show.id,
      movieTitle: show.title || 'Unknown Movie',
      moviePoster: show.poster_path,
      createdAt: new Date().toISOString()
    });
    activities.set(req.userId, userActivities.slice(0, 100)); // Keep last 100 activities

    return res.json({ success: true, fromList: normalizedFrom, toList: normalizedTo, show });
  } catch (err) {
    console.error('Error moving movie between lists:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Copy show from a friend's list to the current user's list
app.post('/api/user/copy-from-friend', requireAuth, async (req, res) => {
  const { friendId, showId, toList } = req.body || {};
  if (!friendId || !showId || !toList) return res.status(400).json({ message: 'friendId, showId, toList required' });

  try {
    const to = normalizeListType(toList);

    // Try to find the show in any of the friend's lists; fall back to minimal show if not found
    const friendShow = await findShowForUser(Number(friendId), showId);
    const movieData = friendShow || { id: Number(showId) };

    const show = await addShowToListDb(req.userId, to, showId, movieData);

    return res.json({ success: true, list: to, show });
  } catch (err) {
    console.error('Error copying movie from friend:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ===== Reviews =====
app.post('/api/user/reviews', requireAuth, (req, res) => {
  try {
    const { showId, rating, comment, movie, tags, isRewatched, containsSpoilers, visibility } = req.body || {};
    if (!showId && !movie?.id) return res.status(400).json({ message: 'showId or movie required' });
    
    const movieId = showId || movie.id;
    const arr = reviews.get(req.userId) || [];
    const user = getUserById(req.userId);
    
    // Check if user already has a review for this movie
    const existingReviewIndex = arr.findIndex(r => Number(r.movieId) === Number(movieId));
    const isEditing = existingReviewIndex !== -1;
    
    const reviewData = { 
      movieId: Number(movieId),
      movie: movie || { id: movieId, title: 'Unknown Movie' },
      rating: Number(rating) || 0, 
      comment: comment || '',
      tags: tags || [],
      isRewatched: Boolean(isRewatched),
      containsSpoilers: Boolean(containsSpoilers),
      visibility: visibility || 'friends',
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      reactions: [],
      comments: []
    };
    
    let review;
    if (isEditing) {
      // Update existing review
      const existingReview = arr[existingReviewIndex];
      review = {
        ...existingReview,
        ...reviewData,
        id: existingReview.id, // Keep original ID
        createdAt: existingReview.createdAt, // Keep original creation date
        updatedAt: new Date().toISOString() // Add update timestamp
      };
      arr[existingReviewIndex] = review;
    } else {
      // Create new review
      review = {
        id: `${req.userId}-${movieId}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...reviewData
      };
      arr.push(review);
    }
    
    reviews.set(req.userId, arr);
    
    // Add to activity feed for social visibility
    const activity = activities.get('global') || [];
    if (visibility === 'public' || visibility === 'friends') {
      activity.unshift({
        id: `activity-${Date.now()}`,
        type: 'review',
        action: isEditing ? 'updated' : 'reviewed',
        userId: req.userId,
        userName: review.userName,
        movie: review.movie,
        rating: review.rating,
        content: review.comment,
        createdAt: review.createdAt,
        visibility: review.visibility
      });
      activities.set('global', activity.slice(0, 50)); // Keep last 50 activities
    }
    
    // Add to user's personal activity feed
    const userActivities = activities.get(req.userId) || [];
    userActivities.unshift({
      id: `activity-${Date.now()}`,
      type: 'review',
      action: isEditing ? 'updated' : 'reviewed',
      userId: req.userId,
      userName: review.userName,
      movieId: review.movieId,
      movieTitle: review.movie?.title || 'Unknown Movie',
      moviePoster: review.movie?.poster_path,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt
    });
    activities.set(req.userId, userActivities.slice(0, 100)); // Keep last 100 activities
    
    // Update the post in activities to include like count
    const updatePostInActivities = (activityMap, postId, likeCount) => {
      for (const [key, activities] of activityMap.entries()) {
        const postIndex = activities.findIndex(a => a.id === postId);
        if (postIndex >= 0) {
          activities[postIndex].reactions = likeCount;
          activities[postIndex].likeCount = likeCount;
        }
      }
    };
    
    updatePostInActivities(activities, review.id, review.reactions.length);
    
    return res.json({ 
      success: true, 
      review, 
      isEditing 
    });
  } catch (error) {
    console.error('Error managing review:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

app.get('/api/user/reviews', requireAuth, (req, res) => {
  return res.json(reviews.get(req.userId) || []);
});

app.get('/api/movie/:showId/reviews', requireAuth, (req, res) => {
  const showId = Number(req.params.showId);
  const all = [];
  for (const [uid, arr] of reviews.entries()) {
    for (const r of arr) if (Number(r.movieId) === showId) all.push({ ...r, userId: uid });
  }
  return res.json(all);
});

// ===== Friends =====
app.get('/api/friends', requireAuth, (req, res) => {
  const userFriends = friends.get(req.userId) || [];
  console.log(`[${new Date().toISOString()}] GET /api/friends for user ${req.userId}`);
  console.log('Current friends:', userFriends);
  console.log('All users in system:', users);
  console.log('All friends data:', Array.from(friends.entries()));
  res.json(userFriends);
});

app.get('/api/friends/requests', requireAuth, (req, res) => {
  res.json(friendRequests.get(req.userId) || []);
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: 'userId required' });
  const to = Number(userId);
  
  // Prevent self friend requests
  if (req.userId === to) {
    return res.status(400).json({ message: 'Cannot send friend request to yourself' });
  }
  
  const fromUser = getUserById(req.userId);
  if (!fromUser) return res.status(404).json({ message: 'Sender user not found' });
  
  // Check if users are already friends
  const userFriends = friends.get(req.userId) || [];
  const isAlreadyFriend = userFriends.some(friend => friend.id === to);
  if (isAlreadyFriend) {
    return res.status(409).json({ message: 'Users are already friends' });
  }
  
  // Check for existing pending request (both directions)
  const reqs = friendRequests.get(to) || [];
  const senderReqs = friendRequests.get(req.userId) || [];
  
  const existingRequest = reqs.find(r => r.fromUserId === req.userId) || 
                         senderReqs.find(r => r.fromUserId === to);
  
  if (existingRequest) {
    return res.status(409).json({ 
      message: 'Friend request already exists',
      existingRequest: existingRequest
    });
  }
  
  const fr = { 
    id: `${to}-${Date.now()}`, 
    fromUserId: req.userId, 
    toUserId: to,
    senderUsername: fromUser.username,
    senderEmail: fromUser.email,
    createdAt: new Date().toISOString()
  };
  reqs.push(fr);
  friendRequests.set(to, reqs);
  res.json({ success: true, request: fr });
});

app.post('/api/friends/accept/:requestId', requireAuth, (req, res) => {
  const requestId = req.params.requestId;
  const reqs = friendRequests.get(req.userId) || [];
  const idx = reqs.findIndex(r => r.id === requestId);
  if (idx < 0) return res.status(404).json({ message: 'Request not found' });
  const r = reqs[idx];
  reqs.splice(idx, 1);
  friendRequests.set(req.userId, reqs);
  // add to friends for both
  const a = friends.get(req.userId) || [];
  const b = friends.get(r.fromUserId) || [];
  const fromUser = getUserById(r.fromUserId);
  const me = getUserById(req.userId);
  if (!a.find(f => Number(f.id) === Number(r.fromUserId))) a.push({ id: fromUser.id, username: fromUser.username });
  if (!b.find(f => Number(f.id) === Number(req.userId))) b.push({ id: me.id, username: me.username });
  friends.set(req.userId, a);
  friends.set(r.fromUserId, b);
  res.json({ success: true });
});

app.post('/api/friends/reject/:requestId', requireAuth, (req, res) => {
  const requestId = req.params.requestId;
  const reqs = friendRequests.get(req.userId) || [];
  const idx = reqs.findIndex(r => r.id === requestId);
  if (idx < 0) return res.status(404).json({ message: 'Request not found' });
  reqs.splice(idx, 1);
  friendRequests.set(req.userId, reqs);
  res.json({ success: true });
});

// Get friend's profile data
app.get('/api/friends/:friendId/profile', requireAuth, (req, res) => {
  const friendId = Number(req.params.friendId);
  const userFriends = friends.get(req.userId) || [];
  
  console.log(`[${new Date().toISOString()}] GET /api/friends/${friendId}/profile`);
  console.log('Requesting user ID:', req.userId);
  console.log('Friend ID:', friendId);
  
  // Check if they are actually friends
  const isFriend = userFriends.some(f => Number(f.id) === friendId);
  if (!isFriend) {
    console.log('Not authorized - not friends');
    return res.status(403).json({ error: 'Not authorized to view this profile' });
  }
  
  // Get friend's basic info
  const friendUser = getUserById(friendId);
  if (!friendUser) {
    return res.status(404).json({ error: 'Friend not found' });
  }
  
  // Get friend's data
  const friendLists = lists.get(friendId) || { watchlist: [], 'currently-watching': [], watched: [] };
  const friendWatchlist = friendLists.watchlist || [];
  const friendCurrentlyWatching = friendLists['currently-watching'] || [];
  const friendWatched = friendLists.watched || [];
  const friendReviews = reviews.get(friendId) || [];
  
  // Get friend's activity
  const friendActivity = activity.get(friendId) || [];
  
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
      email: friendUser.email
    },
    watchlist: friendWatchlist,
    currentlyWatching: friendCurrentlyWatching,
    watched: friendWatched,
    reviews: friendReviews,
    activity: friendActivity
  };
  
  console.log('Sending response:', JSON.stringify(response, null, 2));
  res.json(response);
});

app.delete('/api/friends/remove/:friendId', requireAuth, (req, res) => {
  const friendId = Number(req.params.friendId);
  const userFriends = friends.get(req.userId) || [];
  const friendFriends = friends.get(friendId) || [];
  
  // Remove friend from both users' friend lists
  const userFriendsFiltered = userFriends.filter(f => f.id !== friendId);
  const friendFriendsFiltered = friendFriends.filter(f => f.id !== req.userId);
  
  friends.set(req.userId, userFriendsFiltered);
  friends.set(friendId, friendFriendsFiltered);
  
  res.json({ success: true, message: 'Friend removed successfully' });
});

app.get('/api/users/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const result = users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  res.json(result);
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

// ===== Activity =====
// Create a text post (with optional movie) and add to activity feeds
app.post('/api/activity/create-post', requireAuth, (req, res) => {
  try {
    const { content, visibility = 'friends', movie } = req.body || {};
    const text = String(content || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'content is required' });
    }

    const user = getUserById(req.userId);
    const createdAt = new Date().toISOString();
    const post = {
      id: `activity-${Date.now()}`,
      type: 'post',
      action: 'created',
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      content: text,
      visibility: visibility || 'friends',
      movie: movie || null,
      // Extract movie fields for enrichment system compatibility
      movieId: movie?.id || movie?.tmdbId,
      movieTitle: movie?.title || movie?.name,
      moviePoster: movie?.poster_path,
      createdAt,
    };

    // Initialize post with zero reactions and comments
    post.reactions = [];
    post.comments = 0;
    post.likeCount = 0;
    post.commentCount = 0;

    // Add to user's personal activity feed
    const userActivities = activities.get(req.userId) || [];
    userActivities.unshift(post);
    activities.set(req.userId, userActivities.slice(0, 100));

    // Add to global activity if visible beyond self
    if (post.visibility === 'public' || post.visibility === 'friends') {
      const global = activities.get('global') || [];
      global.unshift(post);
      activities.set('global', global.slice(0, 50));
    }

    return res.json({ success: true, post });
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// ===== Missing Activity Endpoints =====
// Get user's activity feed
app.get('/api/user/activity', requireAuth, (req, res) => {
  try {
    const userActivities = activities.get(req.userId) || [];
    return res.json(userActivities);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get user's specific activity by ID
app.get('/api/user/:userId/activity', requireAuth, (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const userActivities = activities.get(userId) || [];
    return res.json(userActivities);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get social feed (global activity)
app.get('/api/feed/social', requireAuth, (req, res) => {
  try {
    const globalActivity = activities.get('global') || [];
    return res.json(globalActivity);
  } catch (error) {
    console.error('Error fetching social feed:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// ===== Missing Messaging Endpoints =====
// Get conversations
app.get('/api/messages/conversations', requireAuth, (req, res) => {
  try {
    const userFriends = friends.get(req.userId) || [];
    const conversations = userFriends.map(friend => ({
      friendId: friend.id,
      friendName: friend.username,
      lastMessage: null,
      unreadCount: 0
    }));
    return res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get messages with a friend
app.get('/api/messages/conversation/:friendId', requireAuth, (req, res) => {
  try {
    const friendId = Number(req.params.friendId);
    const conversationKey = [req.userId, friendId].sort().join('->');
    const conversation = messages.get(conversationKey) || [];
    console.log(`[DEBUG] Fetching conversation for users ${req.userId} and ${friendId}`);
    console.log(`[DEBUG] Conversation key: ${conversationKey}`);
    console.log(`[DEBUG] Found ${conversation.length} messages`);
    console.log(`[DEBUG] All conversation keys:`, Array.from(messages.keys()));
    return res.json({ messages: conversation });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Send a message
app.post('/api/messages/send', requireAuth, (req, res) => {
  try {
    const { receiverId, friendId, messageText, content } = req.body || {};
    const targetId = receiverId || friendId;
    const text = messageText || content;
    
    if (!targetId || !text) {
      return res.status(400).json({ message: 'receiverId and messageText required' });
    }
    
    const conversationKey = [req.userId, Number(targetId)].sort().join('->');
    const conversation = messages.get(conversationKey) || [];
    
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender_id: req.userId,
      receiver_id: Number(targetId),
      message_text: text,
      message_type: 'text',
      read_by_receiver: false, // Track read status
      created_at: new Date().toISOString()
    };
    
    conversation.push(message);
    messages.set(conversationKey, conversation);
    
    console.log(`[DEBUG] Storing message for users ${req.userId} and ${targetId}`);
    console.log(`[DEBUG] Conversation key: ${conversationKey}`);
    console.log(`[DEBUG] Total messages in conversation: ${conversation.length}`);
    console.log(`[DEBUG] All conversation keys after store:`, Array.from(messages.keys()));
    
    return res.json({ success: true, message });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Send movie recommendation
app.post('/api/messages/send-movie', requireAuth, (req, res) => {
  try {
    const { receiverId, friendId, movieId, tmdbId, messageText, content, movie } = req.body || {};
    const targetId = receiverId || friendId;
    const text = messageText || content || 'Shared a movie with you';
    const movieData = movie;
    
    if (!targetId) {
      return res.status(400).json({ message: 'receiverId required' });
    }
    
    const conversationKey = [req.userId, Number(targetId)].sort().join('->');
    const conversation = messages.get(conversationKey) || [];
    
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender_id: req.userId,
      receiver_id: Number(targetId),
      message_text: text,
      message_type: 'movie_recommendation',
      tmdb_id: tmdbId || movieId,
      movie_data: movieData,
      // Add enrichment-compatible fields
      movieId: movieData?.id || movieData?.tmdbId || tmdbId || movieId,
      movieTitle: movieData?.title || movieData?.name,
      moviePoster: movieData?.poster_path,
      read_by_receiver: false, // Track read status
      created_at: new Date().toISOString()
    };
    
    conversation.push(message);
    messages.set(conversationKey, conversation);
    
    return res.json({ success: true, message });
  } catch (error) {
    console.error('Error sending movie:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Mark messages as read
app.put('/api/messages/mark-read/:friendId', requireAuth, (req, res) => {
  try {
    const userId = req.userId;
    const friendId = Number(req.params.friendId);
    
    const conversationKey = [userId, friendId].sort().join('->');
    const conversation = messages.get(conversationKey) || [];
    
    // Mark all messages from the friend as read
    conversation.forEach(message => {
      if (message.sender_id === friendId && message.receiver_id === userId) {
        message.read_by_receiver = true;
      }
    });
    
    messages.set(conversationKey, conversation);
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get unread message counts
app.get('/api/messages/unread-counts', requireAuth, (req, res) => {
  try {
    const userId = req.userId;
    const unreadCounts = {};
    
    // Check all conversations for unread messages
    for (const [conversationKey, messageList] of messages.entries()) {
      const [user1, user2] = conversationKey.split('->').map(Number);
      
      // Only check conversations involving the current user
      if (user1 === userId || user2 === userId) {
        const otherUserId = user1 === userId ? user2 : user1;
        
        // Count unread messages (messages sent by other user that haven't been read)
        const unreadCount = messageList.filter(msg => 
          msg.sender_id === otherUserId && !msg.read_by_receiver
        ).length;
        
        if (unreadCount > 0) {
          unreadCounts[otherUserId] = unreadCount;
        }
      }
    }
    
    return res.json(unreadCounts);
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get total unread count
app.get('/api/messages/total-unread', requireAuth, (req, res) => {
  try {
    const userId = req.userId;
    let totalUnread = 0;
    
    // Count all unread messages across all conversations
    for (const [conversationKey, messageList] of messages.entries()) {
      const [user1, user2] = conversationKey.split('->').map(Number);
      
      // Only check conversations involving the current user
      if (user1 === userId || user2 === userId) {
        const otherUserId = user1 === userId ? user2 : user1;
        
        // Count unread messages from other user
        const unreadCount = messageList.filter(msg => 
          msg.sender_id === otherUserId && !msg.read_by_receiver
        ).length;
        
        totalUnread += unreadCount;
      }
    }
    
    // Add pending friend requests to total
    const pendingRequests = friendRequests.get(userId) || [];
    totalUnread += pendingRequests.length;
    
    return res.json({ total: totalUnread });
  } catch (error) {
    console.error('Error fetching total unread:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// ===== Post Interaction Endpoints =====
// In-memory storage for post interactions
const postLikes = new Map(); // postId -> Set of userIds who liked it
const postComments = new Map(); // postId -> Array of comments
const commentLikes = new Map(); // commentId -> Set of userIds who liked it

// Like/Unlike a post
app.post('/api/posts/:postId/like', requireAuth, (req, res) => {
  try {
    const postId = req.params.postId;
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
    
    // Update the post in activities to include like count and reactions array
    const updatePostInActivities = (activityMap, postId, likeCount, likesArray) => {
      for (const [key, activities] of activityMap.entries()) {
        const postIndex = activities.findIndex(a => a.id === postId);
        if (postIndex >= 0) {
          activities[postIndex].reactions = likesArray;
          activities[postIndex].likeCount = likeCount;
        }
      }
    };
    
    const likesArray = Array.from(likes);
    updatePostInActivities(activities, postId, likes.size, likesArray);
    
    return res.json({ 
      success: true, 
      liked: !isLiked,
      likeCount: likes.size,
      reactions: likesArray
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get post comments
app.get('/api/posts/:postId/comments', requireAuth, (req, res) => {
  try {
    const postId = req.params.postId;
    const comments = postComments.get(postId) || [];
    const sort = req.query.sort || 'newest';
    
    // Enrich comments with current like status for requesting user
    const enrichedComments = comments.map(comment => {
      const likes = commentLikes.get(comment.id) || new Set();
      return {
        ...comment,
        likeCount: likes.size,
        liked: likes.has(req.userId)
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

// Add comment to post
app.post('/api/posts/:postId/comments', requireAuth, (req, res) => {
  try {
    const postId = req.params.postId;
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
      liked: false
    };
    
    if (!postComments.has(postId)) {
      postComments.set(postId, []);
    }
    
    const comments = postComments.get(postId);
    comments.push(comment);
    
    // Update the post in activities to include comment count
    const updatePostInActivities = (activityMap, postId, commentCount) => {
      for (const [key, activities] of activityMap.entries()) {
        const postIndex = activities.findIndex(a => a.id === postId);
        if (postIndex >= 0) {
          activities[postIndex].comments = commentCount;
          activities[postIndex].commentCount = commentCount;
        }
      }
    };
    
    updatePostInActivities(activities, postId, comments.length);
    
    return res.json({ 
      success: true, 
      comment,
      commentCount: comments.length
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Like/Unlike a comment
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
    const commentIndex = comments.findIndex(c => c.id === commentId);
    if (commentIndex >= 0) {
      comments[commentIndex].likeCount = likes.size;
      comments[commentIndex].liked = !isLiked;
    }
    
    return res.json({ 
      success: true, 
      liked: !isLiked,
      likeCount: likes.size
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get post like status and count
app.get('/api/posts/:postId/likes', requireAuth, (req, res) => {
  try {
    const postId = req.params.postId;
    const likes = postLikes.get(postId) || new Set();
    const isLiked = likes.has(req.userId);
    
    return res.json({
      liked: isLiked,
      likeCount: likes.size,
      likedBy: Array.from(likes)
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
