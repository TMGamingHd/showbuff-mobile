// In-memory data store for ShowBuff mock backend
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Start with demo account and tony account
const users = [
  { id: 1, username: 'demo', email: 'demo@showbuff.com', password: 'demo123' },
  { id: 2, username: 'tony', email: 'tony@gmail.com', password: 'tony123' },
  { id: 3, username: 'alice', email: 'alice@test.com', password: 'alice123' }
];

// Token map: token -> userId (kept for backward compatibility/logging)
const tokens = new Map();

// Activities map: userId -> array of activities
const activities = new Map();

// Seed shows
const shows = new Map([
  [100, { id: 100, title: 'Inception', name: 'Inception', poster_path: '/inception.jpg' }],
  [101, { id: 101, title: 'The Matrix', name: 'The Matrix', poster_path: '/matrix.jpg' }],
  [102, { id: 102, title: 'Interstellar', name: 'Interstellar', poster_path: '/interstellar.jpg' }],
]);

// Lists per userId - start empty
const lists = new Map();

// Reviews per userId - start empty
const reviews = new Map();

// Friends - start empty for clean testing
const friends = new Map();
const friendRequests = new Map();

// Messages per (userId, friendId) key -> array
// Use key format `${a}->${b}` where a < b to normalize conversation
const messages = new Map();

function convoKey(a, b) {
  const [x, y] = [Number(a), Number(b)].sort((m, n) => m - n);
  return `${x}->${y}`;
}

function getConvoArray(a, b) {
  const key = convoKey(a, b);
  if (!messages.has(key)) messages.set(key, []);
  return messages.get(key);
}

function getUserByEmail(email) {
  return users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
}

function createUser({ username, email, password }) {
  const existing = getUserByEmail(email);
  if (existing) return null; // Don't create duplicate users
  const user = { id: users.length + 1, username, email, password };
  users.push(user);
  return user;
}

function issueTokenForUser(userId) {
  // Production-ready JWT token instead of opaque string
  const secret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  const payload = { userId };
  const token = jwt.sign(payload, secret, { expiresIn });

  // Optional: also track in local map for debugging/compatibility
  tokens.set(token, userId);

  return token;
}

function validateToken(token) {
  const secret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
  try {
    jwt.verify(token, secret);
    return true;
  } catch (err) {
    return false;
  }
}

function getUserIdFromToken(token) {
  const secret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
  try {
    const decoded = jwt.verify(token, secret);
    return decoded && decoded.userId ? decoded.userId : null;
  } catch (err) {
    return null;
  }
}

function getUserById(id) {
  return users.find(u => Number(u.id) === Number(id));
}

function ensureUserLists(userId) {
  if (!lists.has(userId)) {
    lists.set(userId, { watchlist: [], 'currently-watching': [], watched: [] });
  }
  return lists.get(userId);
}

function upsertShow(movieDataOrId) {
  if (!movieDataOrId) return null;
  const id = Number(movieDataOrId.id || movieDataOrId.tmdbId || movieDataOrId);
  if (!shows.has(id)) {
    const title = movieDataOrId.title || movieDataOrId.name || `Show #${id}`;
    const show = { id, title, name: title, poster_path: movieDataOrId.poster_path || null };
    shows.set(id, show);
  }
  return shows.get(id);
}

module.exports = {
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
};
