// Utilities for list type normalization and labels

// Convert DB list type (hyphen) to client (underscore)
export const dbToClient = (lt) => {
  if (!lt) return lt;
  if (lt === 'currently-watching') return 'currently_watching';
  return lt.replace('-', '_');
};

// Convert client list type (underscore) to DB (hyphen)
export const clientToDb = (lt) => {
  if (!lt) return lt;
  if (lt === 'currently_watching') return 'currently-watching';
  return lt.replace('_', '-');
};

// Human-friendly label for a list type (accepts either form)
export const listLabel = (lt) => {
  if (!lt) return '';
  const norm = lt.replace('-', '_');
  switch (norm) {
    case 'watchlist':
      return 'Watchlist';
    case 'currently_watching':
      return 'Currently Watching';
    case 'watched':
      return 'Watched';
    default:
      // Fallback: title-case words
      return norm
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  }
};

export default { dbToClient, clientToDb, listLabel };
