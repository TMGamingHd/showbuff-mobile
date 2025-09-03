const express = require('express');
const cors = require('cors');
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
  ensureUserLists,
  upsertShow,
} = require('./data');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Basic request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health + root
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'ShowBuff mock backend', time: new Date().toISOString() });
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

function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token || !validateToken(token)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  req.token = token;
  req.userId = getUserIdFromToken(token);
  req.user = getUserById(req.userId);
  next();
}

// ===== Auth endpoints =====
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email required' });
  if (!password) return res.status(400).json({ message: 'Password required' });
  
  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  
  // Validate password
  if (user.password !== password) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  
  const token = issueTokenForUser(user.id);
  ensureUserLists(user.id);
  return res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
});

app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email required' });
  if (!password) return res.status(400).json({ message: 'Password required' });
  if (!username) return res.status(400).json({ message: 'Username required' });
  
  const user = createUser({ username, email, password });
  if (!user) {
    return res.status(409).json({ message: 'Email already registered' });
  }
  
  const token = issueTokenForUser(user.id);
  ensureUserLists(user.id);
  return res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
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
app.get('/api/user/watchlist', requireAuth, (req, res) => {
  const l = ensureUserLists(req.userId);
  return res.json(l['watchlist'] || []);
});
app.get('/api/user/currently-watching', requireAuth, (req, res) => {
  const l = ensureUserLists(req.userId);
  return res.json(l['currently-watching'] || []);
});
app.get('/api/user/watched', requireAuth, (req, res) => {
  const l = ensureUserLists(req.userId);
  return res.json(l['watched'] || []);
});

app.post('/api/user/add-to-list', requireAuth, (req, res) => {
  const { movieId, listType, movieData } = req.body || {};
  if (!listType) return res.status(400).json({ message: 'listType required' });
  const normalized = String(listType).replace('_', '-');
  const l = ensureUserLists(req.userId);
  const show = upsertShow(movieData || { id: movieId });
  l[normalized] = l[normalized] || [];
  const exists = l[normalized].some(s => Number(s.id) === Number(show.id));
  if (!exists) l[normalized].push(show);
  
  // Add to user activity
  const user = getUserById(req.userId);
  const userActivities = activities.get(req.userId) || [];
  userActivities.unshift({
    id: `activity-${Date.now()}`,
    type: 'list',
    action: normalized === 'watchlist' ? 'added_to_watchlist' : 
           normalized === 'currently-watching' ? 'added_to_watching' : 'added_to_watched',
    userId: req.userId,
    userName: user?.username || user?.email || 'User',
    movieId: show.id,
    movieTitle: show.title || 'Unknown Movie',
    moviePoster: show.poster_path,
    createdAt: new Date().toISOString()
  });
  activities.set(req.userId, userActivities.slice(0, 100)); // Keep last 100 activities
  
  return res.json({ success: true, list: normalized, show });
});

function removeFrom(list, showId) {
  const idx = list.findIndex(s => Number(s.id) === Number(showId));
  if (idx >= 0) list.splice(idx, 1);
}

app.post('/api/user/remove-from-watchlist', requireAuth, (req, res) => {
  const { showId } = req.body || {};
  const l = ensureUserLists(req.userId);
  l['watchlist'] = l['watchlist'] || [];
  removeFrom(l['watchlist'], showId);
  return res.json({ success: true });
});
app.post('/api/user/remove-from-currently-watching', requireAuth, (req, res) => {
  const { showId } = req.body || {};
  const l = ensureUserLists(req.userId);
  l['currently-watching'] = l['currently-watching'] || [];
  removeFrom(l['currently-watching'], showId);
  return res.json({ success: true });
});
app.post('/api/user/remove-from-watched', requireAuth, (req, res) => {
  const { showId } = req.body || {};
  const l = ensureUserLists(req.userId);
  l['watched'] = l['watched'] || [];
  removeFrom(l['watched'], showId);
  return res.json({ success: true });
});

app.post('/api/user/move-to-list', requireAuth, (req, res) => {
  const { movieId, fromList, toList } = req.body || {};
  if (!fromList || !toList) return res.status(400).json({ message: 'fromList and toList required' });
  
  const normalizedFrom = String(fromList).replace('_', '-');
  const normalizedTo = String(toList).replace('_', '-');
  
  const l = ensureUserLists(req.userId);
  l[normalizedFrom] = l[normalizedFrom] || [];
  l[normalizedTo] = l[normalizedTo] || [];
  
  const showIndex = l[normalizedFrom].findIndex(s => Number(s.id) === Number(movieId));
  if (showIndex === -1) return res.status(404).json({ message: 'Movie not found in source list' });
  
  const show = l[normalizedFrom][showIndex];
  l[normalizedFrom].splice(showIndex, 1);
  
  const exists = l[normalizedTo].some(s => Number(s.id) === Number(show.id));
  if (!exists) l[normalizedTo].push(show);
  
  // Add to user activity
  const user = getUserById(req.userId);
  const userActivities = activities.get(req.userId) || [];
  userActivities.unshift({
    id: `activity-${Date.now()}`,
    type: 'list',
    action: normalizedTo === 'watchlist' ? 'moved_to_watchlist' : 
           normalizedTo === 'currently-watching' ? 'moved_to_watching' : 'moved_to_watched',
    userId: req.userId,
    userName: user?.username || user?.email || 'User',
    movieId: show.id,
    movieTitle: show.title || 'Unknown Movie',
    moviePoster: show.poster_path,
    createdAt: new Date().toISOString()
  });
  activities.set(req.userId, userActivities.slice(0, 100)); // Keep last 100 activities
  
  return res.json({ success: true, fromList: normalizedFrom, toList: normalizedTo, show });
});

// Copy show from a friend's list to the current user's list
app.post('/api/user/copy-from-friend', requireAuth, (req, res) => {
  const { friendId, showId, toList } = req.body || {};
  if (!friendId || !showId || !toList) return res.status(400).json({ message: 'friendId, showId, toList required' });
  const to = String(toList).replace('_', '-');
  const friendLists = ensureUserLists(Number(friendId));
  const meLists = ensureUserLists(req.userId);
  meLists[to] = meLists[to] || [];
  // Find the show in any of friend's lists; if absent, upsert by id
  const friendShow = (friendLists['watchlist'] || []).concat(friendLists['currently-watching'] || [], friendLists['watched'] || [])
    .find(s => Number(s.id) === Number(showId));
  const show = friendShow || upsertShow({ id: Number(showId) });
  const already = meLists[to].some(s => Number(s.id) === Number(show.id));
  if (!already) meLists[to].push(show);
  return res.json({ success: true, list: to, show });
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
    
    return res.json({ success: true, review, isEditing });
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
  console.log('All users:', users);
  console.log('All friends data:', Array.from(friends.entries()));
  console.log('User friends:', userFriends);
  
  // Check if they are actually friends
  const isFriend = userFriends.some(f => Number(f.id) === friendId);
  if (!isFriend) {
    console.log('Not authorized - not friends');
    return res.status(403).json({ error: 'Not authorized to view this profile' });
  }
  
  // Get friend's data
  const friendLists = lists.get(friendId) || { watchlist: [], 'currently-watching': [], watched: [] };
  const friendWatchlist = friendLists.watchlist || [];
  const friendCurrentlyWatching = friendLists['currently-watching'] || [];
  const friendWatched = friendLists.watched || [];
  const friendReviews = reviews.get(friendId) || [];
  
  console.log('Friend data:');
  console.log('- Watchlist:', friendWatchlist.length, 'items');
  console.log('- Currently Watching:', friendCurrentlyWatching.length, 'items');
  console.log('- Watched:', friendWatched.length, 'items');
  console.log('- Reviews:', friendReviews.length, 'items');
  
  const response = {
    watchlist: friendWatchlist,
    currentlyWatching: friendCurrentlyWatching,
    watched: friendWatched,
    reviews: friendReviews
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

app.get('/api/friends/:friendId/profile', requireAuth, (req, res) => {
  const friendId = Number(req.params.friendId);
  const user = getUserById(friendId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ ...user });
});

app.get('/api/friends/:friendId/movies', requireAuth, (req, res) => {
  const friendId = Number(req.params.friendId);
  const l = ensureUserLists(friendId);
  const list = req.query.list ? String(req.query.list).replace('_', '-') : null;
  if (list) return res.json(l[list] || []);
  res.json({ watchlist: l['watchlist'] || [], 'currently-watching': l['currently-watching'] || [], watched: l['watched'] || [] });
});

// ===== Activity =====
app.get('/api/user/:userId/activity', requireAuth, (req, res) => {
  const uid = Number(req.params.userId);
  const l = ensureUserLists(uid);
  const acts = [];
  for (const [k, arr] of Object.entries(l)) {
    for (const s of arr) acts.push({ type: 'list_update', list: k, showId: s.id, at: new Date().toISOString() });
  }
  res.json(acts);
});

app.get('/api/user/activity', requireAuth, (req, res) => {
  const me = req.userId;
  const fs = friends.get(me) || [];
  const acts = [];
  for (const f of fs) {
    const l = ensureUserLists(f.id);
    for (const [k, arr] of Object.entries(l))
      for (const s of arr) acts.push({ userId: f.id, type: 'list_update', list: k, showId: s.id, at: new Date().toISOString() });
  }
  res.json(acts);
});

// Create a new post
app.post('/api/activity/create-post', requireAuth, (req, res) => {
  const { content, type = 'text_post', movie, visibility = 'public' } = req.body || {};

  const trimmed = (content || '').trim();
  if (!trimmed) {
    return res.status(400).json({ success: false, error: 'Content is required' });
  }

  const user = getUserById(req.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Normalize optional movie payload if provided
  let postMovie = undefined;
  if (movie && typeof movie === 'object') {
    // Only include commonly used fields for the feed UI
    postMovie = {
      id: Number(movie.id) || movie.id,
      title: movie.title || movie.name || 'Unknown Movie',
      poster_path: movie.poster_path || null,
      vote_average: typeof movie.vote_average === 'number' ? movie.vote_average : Number(movie.vote_average) || undefined,
      listType: movie.listType || undefined,
    };
  }

  const post = {
    id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: type,
    action: 'created_post',
    userId: req.userId,
    userName: user.username,
    userEmail: user.email,
    content: trimmed,
    movie: postMovie, // May be undefined for text-only posts
    createdAt: new Date().toISOString(),
    visibility: visibility || 'public',
    reactions: [],
    comments: [],
  };

  // Add to global activity feed
  const globalActivity = activities.get('global') || [];
  globalActivity.unshift(post);
  activities.set('global', globalActivity.slice(0, 100)); // Keep last 100 activities

  // Add to user's personal activity feed
  const userActivities = activities.get(req.userId) || [];
  userActivities.unshift(post);
  activities.set(req.userId, userActivities.slice(0, 50)); // Keep last 50 user activities

  res.json({ success: true, post });
});

// Utility to update a post across global and owner activity lists
function updatePostEverywhere(postId, updater) {
  // Update in global feed first
  const global = activities.get('global') || [];
  let idx = global.findIndex(p => p.id === postId);
  if (idx >= 0) {
    const updated = updater({ ...global[idx] });
    global[idx] = updated;
    activities.set('global', global);

    // Also update in owner's personal activity list
    const ownerId = updated.userId;
    const ownerActs = activities.get(ownerId) || [];
    const idx2 = ownerActs.findIndex(p => p.id === postId);
    if (idx2 >= 0) {
      ownerActs[idx2] = updated;
      activities.set(ownerId, ownerActs);
    }
    return updated;
  }

  // Fallback: search all activity lists
  for (const [key, arr] of activities.entries()) {
    if (key === 'global') continue;
    const i = (arr || []).findIndex(p => p.id === postId);
    if (i >= 0) {
      const updated = updater({ ...arr[i] });
      arr[i] = updated;
      activities.set(key, arr);

      // Try syncing to global if exists
      const g2 = activities.get('global') || [];
      const ig = g2.findIndex(p => p.id === postId);
      if (ig >= 0) {
        g2[ig] = updated;
        activities.set('global', g2);
      }
      return updated;
    }
  }
  return null;
}

// Toggle like on a post
app.post('/api/posts/:postId/like', requireAuth, (req, res) => {
  const { postId } = req.params;
  const updated = updatePostEverywhere(postId, (post) => {
    if (!Array.isArray(post.reactions)) post.reactions = [];
    const existsIdx = post.reactions.findIndex(uid => Number(uid) === Number(req.userId));
    if (existsIdx >= 0) {
      post.reactions.splice(existsIdx, 1);
    } else {
      post.reactions.push(req.userId);
    }
    return post;
  });

  if (!updated) return res.status(404).json({ message: 'Post not found' });
  const liked = Array.isArray(updated.reactions) && updated.reactions.some(uid => Number(uid) === Number(req.userId));
  return res.json({ success: true, post: updated, liked, reactions: Array.isArray(updated.reactions) ? updated.reactions.length : 0 });
});

// Add a comment to a post
app.post('/api/posts/:postId/comments', requireAuth, (req, res) => {
  const { postId } = req.params;
  const { text } = req.body || {};
  const trimmed = String(text || '').trim();
  if (!trimmed) return res.status(400).json({ message: 'text required' });
  const user = getUserById(req.userId);

  const updated = updatePostEverywhere(postId, (post) => {
    if (!Array.isArray(post.comments)) post.comments = [];
    const comment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: req.userId,
      userName: user?.username || user?.email || 'User',
      text: trimmed,
      createdAt: new Date().toISOString(),
      likes: [],
    };
    post.comments.push(comment);
    return post;
  });

  if (!updated) return res.status(404).json({ message: 'Post not found' });
  return res.json({ success: true, post: updated, comments: Array.isArray(updated.comments) ? updated.comments.length : 0 });
});

// Get comments for a post
app.get('/api/posts/:postId/comments', requireAuth, (req, res) => {
  const { postId } = req.params;
  const { sort, limit } = req.query || {};
  const global = activities.get('global') || [];
  const post = global.find(p => p.id === postId);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  let comments = Array.isArray(post.comments) ? [...post.comments] : [];

  // Optional sorting: sort=top sorts by likes count desc, then createdAt desc
  if (String(sort).toLowerCase() === 'top') {
    comments.sort((a, b) => {
      const la = Array.isArray(a.likes) ? a.likes.length : 0;
      const lb = Array.isArray(b.likes) ? b.likes.length : 0;
      if (lb !== la) return lb - la;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // Optional limit
  const lim = Number(limit);
  if (!Number.isNaN(lim) && lim > 0) {
    comments = comments.slice(0, lim);
  }

  return res.json({ success: true, comments });
});

// Toggle like on a comment
app.post('/api/posts/:postId/comments/:commentId/like', requireAuth, (req, res) => {
  const { postId, commentId } = req.params;
  let updatedComment = null;
  const updated = updatePostEverywhere(postId, (post) => {
    if (!Array.isArray(post.comments)) post.comments = [];
    const idx = post.comments.findIndex(c => c.id === commentId);
    if (idx < 0) return post;
    const c = { ...(post.comments[idx] || {}) };
    if (!Array.isArray(c.likes)) c.likes = [];
    const likeIdx = c.likes.findIndex(uid => Number(uid) === Number(req.userId));
    if (likeIdx >= 0) c.likes.splice(likeIdx, 1); else c.likes.push(req.userId);
    post.comments[idx] = c;
    updatedComment = c;
    return post;
  });

  if (!updated) return res.status(404).json({ message: 'Post not found' });
  if (!updatedComment) return res.status(404).json({ message: 'Comment not found' });
  const liked = Array.isArray(updatedComment.likes) && updatedComment.likes.some(uid => Number(uid) === Number(req.userId));
  return res.json({ success: true, post: updated, comment: updatedComment, liked, likes: Array.isArray(updatedComment.likes) ? updatedComment.likes.length : 0 });
});

// ===== Messages =====
app.get('/api/messages/conversations', requireAuth, (req, res) => {
  const me = req.userId;
  const fs = friends.get(me) || [];
  // Minimal conversation list
  const convos = fs.map(f => ({ friendId: f.id, friendUsername: f.username }));
  res.json(convos);
});

app.get('/api/messages/conversation/:friendId', requireAuth, (req, res) => {
  const me = req.userId;
  const friendId = Number(req.params.friendId);
  const arr = getConvoArray(me, friendId);
  // Respond in snake_case as mobile normalizes
  res.json({ messages: arr });
});

app.post('/api/messages/send', requireAuth, (req, res) => {
  const me = req.userId;
  const { receiverId, friendId, messageText, content } = req.body || {};
  const to = Number(receiverId || friendId);
  if (!to) return res.status(400).json({ message: 'receiverId/friendId required' });
  const text = String(messageText || content || '').trim();
  const arr = getConvoArray(me, to);
  const row = { id: `${Date.now()}`, sender_id: me, receiver_id: to, message_text: text, message_type: 'text', created_at: new Date().toISOString() };
  arr.push(row);
  res.json({ success: true, message: row });
});

app.post('/api/messages/send-movie', requireAuth, (req, res) => {
  const me = req.userId;
  const { receiverId, friendId, movieId, tmdbId, movie, messageText, content } = req.body || {};
  const to = Number(receiverId || friendId);
  if (!to) return res.status(400).json({ message: 'receiverId/friendId required' });
  const show = upsertShow(movie || { id: tmdbId || movieId });
  const text = String(messageText || content || `Recommended: ${show.title || show.name || 'a movie'}`);
  const arr = getConvoArray(me, to);
  const row = {
    id: `${Date.now()}`,
    sender_id: me,
    receiver_id: to,
    message_text: text,
    message_type: 'movie_recommendation',
    created_at: new Date().toISOString(),
    tmdb_id: show.id,
    movie_id: show.id,
    movie_title: show.title || show.name,
    show_poster_path: show.poster_path || null,
  };
  arr.push(row);
  res.json({ success: true, message: row });
});

app.put('/api/messages/mark-read/:friendId', requireAuth, (req, res) => {
  // Mark messages as read for this conversation
  const me = req.userId;
  const friendId = Number(req.params.friendId);
  const arr = getConvoArray(me, friendId);
  
  // Mark all messages from friend to me as read
  arr.forEach(msg => {
    if (msg.receiver_id === me && msg.sender_id === friendId) {
      msg.read_at = new Date().toISOString();
    }
  });
  
  res.json({ success: true });
});

// Get total unread message count for the authenticated user
app.get('/api/messages/total-unread', requireAuth, (req, res) => {
  const me = req.userId;
  const myFriends = friends.get(me) || [];
  let totalUnread = 0;
  
  // Count unread messages from all friends
  myFriends.forEach(friend => {
    const arr = getConvoArray(me, friend.id);
    const unreadFromFriend = arr.filter(msg => 
      msg.receiver_id === me && 
      msg.sender_id === friend.id && 
      !msg.read_at
    ).length;
    totalUnread += unreadFromFriend;
  });
  
  res.json({ total: totalUnread, count: totalUnread });
});

// Get unread message counts per friend for the authenticated user
app.get('/api/messages/unread-counts', requireAuth, (req, res) => {
  const me = req.userId;
  const myFriends = friends.get(me) || [];
  const counts = {};
  
  // Count unread messages from each friend
  myFriends.forEach(friend => {
    const arr = getConvoArray(me, friend.id);
    const unreadFromFriend = arr.filter(msg => 
      msg.receiver_id === me && 
      msg.sender_id === friend.id && 
      !msg.read_at
    ).length;
    counts[friend.id] = unreadFromFriend;
  });
  
  res.json(counts);
});

// ===== Shows =====
app.get('/api/shows/:showId', requireAuth, (req, res) => {
  const id = Number(req.params.showId);
  const show = shows.get(id) || upsertShow({ id });
  res.json(show);
});

app.post('/api/shows', requireAuth, (req, res) => {
  const show = upsertShow(req.body || {});
  res.json(show);
});

// ===== Users search (duplicate path handled above) =====
// app.get('/api/users/search', ...) already defined

// ===== Social Feed =====
app.get('/api/feed/social', requireAuth, (req, res) => {
  const globalActivity = activities.get('global') || [];
  const userFriends = friends.get(req.userId) || [];
  const friendIds = userFriends.map(f => f.id || f.userId);
  
  // Filter activity to show:
  // 1. Public reviews from anyone
  // 2. Friends-only reviews from actual friends
  // 3. User's own activity
  const socialFeed = globalActivity.filter(activity => {
    if (activity.visibility === 'public') return true;
    if (activity.userId === req.userId) return true;
    if (activity.visibility === 'friends' && friendIds.includes(activity.userId)) return true;
    return false;
  });
  
  res.json(socialFeed.slice(0, 20)); // Return latest 20 items
});

// Always start the server (works for both local and deployed environments)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ShowBuff mock backend listening on http://0.0.0.0:${PORT}`);
});

module.exports = app;
