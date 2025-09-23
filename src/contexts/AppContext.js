import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackendService from '../services/backend';
import TMDBService from '../services/tmdb';
import { useAuth } from './AuthContext';

const AppContext = createContext({});

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const USE_BACKEND_ACTIVITY = true; // enable backend activity feed for Profile persistence
  
  // Movie lists state
  const [watchlist, setWatchlist] = useState([]);
  const [currentlyWatching, setCurrentlyWatching] = useState([]);
  const [watched, setWatched] = useState([]);
  const [reviews, setReviews] = useState([]);
  
  // Social features state
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activity, setActivity] = useState([]);
  
  // Notification state
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState({});
  const [totalUnreadNotifications, setTotalUnreadNotifications] = useState(0);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // Cache management
  const [lastSync, setLastSync] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);

  // Use user-specific storage keys (same as lists: strictly user.id based)
  const getStorageKey = (key) => {
    return user?.id ? `${user.id}_${key}` : key;
  };

  // Activity logging helper function
  const createActivity = (type, action, movie, additionalData = {}) => {
    const newActivity = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      action,
      movieId: movie?.id,
      movieTitle: movie?.title || movie?.name,
      moviePoster: movie?.poster_path,
      userId: user?.id,
      createdAt: new Date().toISOString(),
      ...additionalData
    };
    
    // Add to activity state (newest first)
    setActivity(prev => {
      const updated = [newActivity, ...prev].slice(0, 100);
      return updated;
    });
    
    console.log('Created activity:', newActivity);
    return newActivity;
  };

  // Load user data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadUserData();
    } else if (!isAuthenticated) {
      clearUserData();
    }
  }, [isAuthenticated, user]);

  // Save activity whenever it changes - exactly like movie lists
  useEffect(() => {
    if (!user?.id || !activity || activity.length === 0) return;
    const saveActivity = async () => {
      try {
        const storageKey = getStorageKey('activity');
        
        // Apply deduplication before saving to prevent cached duplicates
        const createDedupeKey = (activityItem) => {
          const timestamp = new Date(activityItem.createdAt || activityItem.created_at || 0).getTime();
          const roundedTimestamp = Math.floor(timestamp / 1000) * 1000;
          const contentKey = activityItem.type === 'post' ? (activityItem.comment || activityItem.content || activityItem.text || '') : '';
          
          return [
            activityItem.type || 'unknown',
            activityItem.action || '',
            activityItem.movieId || '',
            activityItem.movieTitle || '',
            activityItem.userId || '',
            contentKey,
            roundedTimestamp
          ].join('|');
        };

        const mapByContent = new Map();
        activity.forEach(a => {
          if (!a) return;
          const dedupeKey = createDedupeKey(a);
          if (!mapByContent.has(dedupeKey)) {
            mapByContent.set(dedupeKey, a);
          }
        });
        
        const dedupedActivity = Array.from(mapByContent.values()).sort((a, b) => {
          const ta = new Date(a.createdAt || a.created_at || 0).getTime();
          const tb = new Date(b.createdAt || b.created_at || 0).getTime();
          return tb - ta;
        });

        await AsyncStorage.setItem(storageKey, JSON.stringify(dedupedActivity));
        console.log(`[Activity] Saved ${dedupedActivity.length} deduplicated activities to ${storageKey}`);
        
        // Update state if deduplication removed items
        if (dedupedActivity.length !== activity.length) {
          console.log(`[Activity] Removed ${activity.length - dedupedActivity.length} duplicate activities`);
          setActivity(dedupedActivity);
        }
      } catch (e) {
        console.error('[Activity] Save failed:', e);
      }
    };
    saveActivity();
  }, [activity, user?.id]);





  const cacheUserData = async () => {
    try {
      await AsyncStorage.multiSet([
        [getStorageKey('watchlist'), JSON.stringify(watchlist)],
        [getStorageKey('currentlyWatching'), JSON.stringify(currentlyWatching)],
        [getStorageKey('watched'), JSON.stringify(watched)],
        [getStorageKey('reviews'), JSON.stringify(reviews)],
        [getStorageKey('activity'), JSON.stringify(activity)],
        [getStorageKey('lastSync'), new Date().toISOString()]
      ]);
    } catch (error) {
      console.error('Error caching user data:', error);
    }
  };


  // Load data from AsyncStorage cache
  const loadCachedData = async () => {
    try {
      // Proactively remove deprecated combined cache to prevent contamination
      await AsyncStorage.removeItem('userData');
      
      if (!user?.id) return;
      
      const wlKey = getStorageKey('watchlist');
      const cwKey = getStorageKey('currentlyWatching');
      const wdKey = getStorageKey('watched');
      const rvKey = getStorageKey('reviews');
      const acKey = getStorageKey('activity');
      
      const cachedWatchlist = await AsyncStorage.getItem(wlKey);
      const cachedCurrentlyWatching = await AsyncStorage.getItem(cwKey);
      const cachedWatched = await AsyncStorage.getItem(wdKey);
      const cachedReviews = await AsyncStorage.getItem(rvKey);
      const cachedActivity = await AsyncStorage.getItem(acKey);
      
      const wl = cachedWatchlist ? JSON.parse(cachedWatchlist) : null;
      const cw = cachedCurrentlyWatching ? JSON.parse(cachedCurrentlyWatching) : null;
      const wd = cachedWatched ? JSON.parse(cachedWatched) : null;
      const rv = cachedReviews ? JSON.parse(cachedReviews) : null;
      const ac = cachedActivity ? JSON.parse(cachedActivity) : null;

      if (wl) setWatchlist(wl);
      if (cw) setCurrentlyWatching(cw);
      if (wd) setWatched(wd);
      if (rv) setReviews(rv);
      if (ac) setActivity(ac);
      
      console.log('[AppContext] Loaded cached lists:', {
        watchlist: Array.isArray(wl) ? wl.length : 0,
        currentlyWatching: Array.isArray(cw) ? cw.length : 0,
        watched: Array.isArray(wd) ? wd.length : 0,
        reviews: Array.isArray(rv) ? rv.length : 0,
        activity: Array.isArray(ac) ? ac.length : 0,
      }, 'keys:', { wlKey, cwKey, wdKey, rvKey, acKey });
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  };
  
  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading user data for:', user?.id);
      
      if (!user || !user.id) {
        console.error('Cannot load user data: No user ID available');
        setError('Authentication issue. Please log in again.');
        setLoading(false);
        return;
      }
      
      // Apply cached data immediately for better perceived performance and to ensure activity is visible
      try {
        await loadCachedData();
      } catch (e) {
        console.warn('[AppContext] Failed to pre-load cached data before backend fetch:', e);
      }

      // Clear deprecated combined cache key to avoid stale data usage
      await AsyncStorage.removeItem('userData');
      
      console.log('Fetching fresh data from backend...');
      
      // Then fetch fresh data from backend
      try {
        const [watchlistData, currentlyWatchingData, watchedData, reviewsData] = await Promise.all([
          BackendService.getUserList('watchlist'),
          BackendService.getUserList('currently-watching'),
          BackendService.getUserList('watched'),
          BackendService.getUserReviews(user.id),
        ]);
        
        console.log('Movie lists fetched successfully:');
        console.log('- Watchlist items:', watchlistData?.length || 0);
        console.log('- Currently watching items:', currentlyWatchingData?.length || 0);
        console.log('- Watched items:', watchedData?.length || 0);
        console.log('- Reviews:', reviewsData?.length || 0);
        
        // Update state with fetched data and enrich movie data
        const watchlistMovies = await BackendService.enrichMovieList(Array.isArray(watchlistData) ? watchlistData : []);
        const currentlyWatchingMovies = await BackendService.enrichMovieList(Array.isArray(currentlyWatchingData) ? currentlyWatchingData : []);
        const watchedMovies = await BackendService.enrichMovieList(Array.isArray(watchedData) ? watchedData : []);
        
        setWatchlist(watchlistMovies);
        setCurrentlyWatching(currentlyWatchingMovies);
        setWatched(watchedMovies);
        setReviews(Array.isArray(reviewsData) ? reviewsData : []);
        
        // Auto-refresh incomplete movie data after setting initial state
        console.log('Auto-refreshing incomplete movie data...');
        await refreshIncompleteMovieData(watchlistMovies, currentlyWatchingMovies, watchedMovies);
        
      } catch (error) {
        console.error('Error fetching movie lists:', error);
        // Continue with other data fetching even if movie lists fail
      }
      
      // Load social data
      try {
        // Fetch friends and requests regardless
        const [friendsData, requestsData] = await Promise.all([
          BackendService.getFriends(user.id),
          BackendService.getFriendRequests(),
        ]);
        let activityData = [];
        if (USE_BACKEND_ACTIVITY) {
          // Prefer personal activity for Profile; fallback to friends feed only if needed
          const userActivityData = await BackendService.getUserActivity(user.id).catch(() => []);
          activityData = Array.isArray(userActivityData) ? userActivityData : [];
          if (!Array.isArray(activityData) || activityData.length === 0) {
            // Fallback to friends activity/feed (normalized in BackendService)
            activityData = await BackendService.getActivity();
          }
        } else {
          // Load from local cache only when backend is disabled
          try {
            const cachedStr = await AsyncStorage.getItem(getStorageKey('activity'));
            activityData = cachedStr ? JSON.parse(cachedStr) : [];
          } catch (e) {
            console.warn('Failed to load cached activity:', e);
            activityData = [];
          }
        }
        
        console.log('Social data fetched successfully:');
        console.log('- Friends:', friendsData?.length || 0);
        console.log('- Friend requests:', requestsData?.length || 0);
        console.log('- Activity items:', activityData?.length || 0);
        try { console.log('[AppContext] Raw activity sample:', Array.isArray(activityData) ? activityData[0] : null); } catch(_) {}
        
        setFriends(Array.isArray(friendsData) ? friendsData : []);
        setFriendRequests(Array.isArray(requestsData) ? requestsData : []);

        // Normalize backend activity objects to the UI schema expected by ProfileScreen
        const normalizeActivityItem = (item) => {
          if (!item || typeof item !== 'object') return null;
          const rawType = (item.type || item.activity_type || item.category || '').toString().toLowerCase();
          // Drop backend 'list_update' fillers outright
          if (rawType === 'list_update') return null;

          let type = rawType;
          if (['post_create', 'created_post', 'create_post', 'post_created', 'movie_post', 'text_post'].includes(rawType)) {
            type = 'post';
          }
          if (!type && (item.postId || item.post_id)) {
            type = 'post';
          }
          // Handle generic/ambiguous activity records that represent posts
          if ((!type || type === 'activity') && (item.content || item.text) && (item.postId || item.post_id || item.movie || item.show)) {
            type = 'post';
          }
          const action = item.action || item.activity || (type === 'post' ? 'created' : undefined);
          const createdAt = item.createdAt || item.created_at || item.at || item.timestamp || new Date().toISOString();

          // Extract nested movie/show data commonly returned by backend
          const nestedMovie = item.movie || item.show || item.movie_data || item.movieData || null;

          const movieId =
            item.movieId ?? item.showId ?? item.show_id ?? item.tmdb_id ?? item.tmdbId ??
            nestedMovie?.id ?? nestedMovie?.tmdb_id ?? nestedMovie?.movie_id;

          const movieTitle =
            item.movieTitle || item.movie_title || item.title || item.show_title || item.name ||
            nestedMovie?.title || nestedMovie?.name;

          const moviePoster =
            item.moviePoster || item.show_poster_path || item.poster_path || item.movie_poster ||
            nestedMovie?.poster_path || nestedMovie?.show_poster_path || nestedMovie?.movie_poster;
          const rating = item.rating ?? item.stars;
          const comment = item.comment || item.text || item.content;
          const userId = item.userId ?? item.user_id ?? user?.id;
          const listName = item.list || item.list_name || undefined;

          // Build a stable ID to avoid duplicates across reloads
          const stableId = item.id || [userId, type || 'unknown', listName || '', movieId || '', createdAt || ''].join(':');

          return {
            id: stableId,
            type: type || 'unknown',
            action,
            movieId,
            movieTitle,
            moviePoster,
            rating,
            comment,
            userId,
            createdAt,
            list: listName,
            // keep any other fields for future use
            ...item,
          };
        };

        const normalizedActivity = Array.isArray(activityData)
          ? activityData.map(normalizeActivityItem).filter(Boolean)
          : [];
        
        // Enrich movie data in activities
        const enrichedActivity = await BackendService.enrichActivityData(normalizedActivity);
        try { console.log('[AppContext] Normalized activity sample (pre-merge):', normalizedActivity[0]); } catch(_) {}

        // Filter to current user's activity for Profile screen
        const personalActivity = (enrichedActivity || normalizedActivity).filter((a) => {
          const uid = Number(a?.userId ?? a?.user_id);
          return Number(uid) === Number(user?.id);
        });

        // Merge with cached activity, de-duplicate by content and timestamp, sort by createdAt desc
        let cachedActivity = [];
        try {
          const cachedStr = await AsyncStorage.getItem(getStorageKey('activity'));
          cachedActivity = cachedStr ? JSON.parse(cachedStr) : [];
        } catch (e) {
          console.warn('Failed to read cached activity for merge:', e);
        }

        // Create a more robust deduplication key based on content rather than just ID
        const createDedupeKey = (activity) => {
          const timestamp = new Date(activity.createdAt || activity.created_at || 0).getTime();
          const roundedTimestamp = Math.floor(timestamp / 1000) * 1000; // Round to nearest second
          
          // For reviews, use a more stable key since reviews are unique per user per movie
          if (activity.type === 'review') {
            return [
              'review',
              activity.action || 'reviewed',
              activity.movieId || '',
              activity.userId || ''
            ].join('|');
          }
          
          // For posts, include the comment/content to distinguish different posts about the same movie
          const contentKey = activity.type === 'post' ? (activity.comment || activity.content || activity.text || '') : '';
          
          return [
            activity.type || 'unknown',
            activity.action || '',
            activity.movieId || '',
            activity.userId || '',
            contentKey,
            roundedTimestamp
          ].join('|');
        };

        const mapByContent = new Map();
        [...personalActivity, ...cachedActivity].forEach(a => {
          if (!a) return;
          const dedupeKey = createDedupeKey(a);
          // Prefer newer data (backend data comes first in the array)
          if (!mapByContent.has(dedupeKey)) {
            mapByContent.set(dedupeKey, a);
          }
        });
        
        const merged = Array.from(mapByContent.values()).sort((a, b) => {
          const ta = new Date(a.createdAt || a.created_at || 0).getTime();
          const tb = new Date(b.createdAt || b.created_at || 0).getTime();
          return tb - ta;
        }).slice(0, 500);

        // Filter to remove ambiguous/placeholder entries; require meaningful context
        const isMeaningful = (item) => {
          if (!item) return false;
          const type = String(item.type || item.activity_type || '').toLowerCase();
          if (type === 'list_update') return false; // never show fillers
          // Allow common types with minimal requirements
          if (['post', 'movie_post', 'text_post', 'movie_share', 'review', 'list'].includes(type)) {
            // For list/review types require at least some context
            if (type === 'list' || type === 'review') {
              return Boolean(item.movieTitle || item.movieId || item.moviePoster || item.comment || item.rating || item.action);
            }
            return true;
          }
          // Unknown types: require at least action AND createdAt
          return Boolean(item.action && item.createdAt);
        };

        const cleaned = merged.filter(isMeaningful);

        console.log('[AppContext] Normalized+filtered activity sample:', cleaned[0]);
        if (cleaned.length > 0) {
          setActivity(cleaned);
        }
      } catch (error) {
        console.error('Error fetching social data:', error);
        // Continue even if social data fails
      }
      
      // Load notifications after all other data
      await loadNotifications();
      
      // Cache the data
      await cacheUserData();
      
      console.log('User data loaded successfully');
    } catch (error) {
      console.error('Error loading user data:', error);
      setError('Failed to load your data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearUserData = async () => {
    setWatchlist([]);
    setCurrentlyWatching([]);
    setWatched([]);
    setReviews([]);
    setActivity([]);
    setFriends([]);
    setFriendRequests([]);
    setConversations([]);
    setError(null);
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  // Normalize list types for consistent handling
  const normalizeListType = (listType) => {
    if (!listType) return 'watchlist'; // Default
    
    // Convert to standard format (using underscores)
    if (listType === 'currently-watching') return 'currently_watching';
    return listType;
  };
  
  // Convert from client format (underscores) to backend format (hyphens)
  const clientToBackend = (listType) => {
    if (!listType) return 'watchlist';
    return String(listType).replace(/_/g, '-');
  };
  
  // Convert from backend format (hyphens) to client format (underscores)
  const backendToClient = (listType) => {
    if (!listType) return 'watchlist';
    return String(listType).replace(/-/g, '_');
  };

  // Check if a movie is missing important TMDB details
  const isMovieIncomplete = (movie) => {
    if (!movie || !movie.id) return false;
    // Check for missing key details that should be fetched from TMDB
    return !movie.overview || 
           !movie.vote_average || 
           !movie.poster_path ||
           !movie.release_date ||
           !movie.genre_ids;
  };

  // Refresh incomplete movie data by fetching from TMDB
  const refreshIncompleteMovieData = async (watchlistMovies, currentlyWatchingMovies, watchedMovies) => {
    try {
      const allMovies = [...watchlistMovies, ...currentlyWatchingMovies, ...watchedMovies];
      const incompleteMovies = allMovies.filter(isMovieIncomplete);
      
      if (incompleteMovies.length === 0) {
        console.log('All movies have complete data, no refresh needed');
        return;
      }
      
      console.log(`Refreshing ${incompleteMovies.length} incomplete movies from TMDB...`);
      
      // Batch fetch movie details from TMDB
      const movieUpdatePromises = incompleteMovies.map(async (movie) => {
        try {
          console.log(`Fetching details for movie ID: ${movie.id}`);
          const tmdbDetails = await TMDBService.getMovieDetails(movie.id);
          
          // Merge the TMDB data with existing movie data
          return {
            ...movie,
            title: tmdbDetails.title || movie.title,
            name: tmdbDetails.name || tmdbDetails.title || movie.name,
            overview: tmdbDetails.overview || movie.overview,
            poster_path: tmdbDetails.poster_path || movie.poster_path,
            backdrop_path: tmdbDetails.backdrop_path || movie.backdrop_path,
            vote_average: tmdbDetails.vote_average || movie.vote_average,
            vote_count: tmdbDetails.vote_count || movie.vote_count,
            release_date: tmdbDetails.release_date || movie.release_date,
            first_air_date: tmdbDetails.first_air_date || movie.first_air_date,
            genre_ids: tmdbDetails.genre_ids || movie.genre_ids,
            genres: tmdbDetails.genres || movie.genres,
            runtime: tmdbDetails.runtime || movie.runtime,
            popularity: tmdbDetails.popularity || movie.popularity,
            adult: tmdbDetails.adult !== undefined ? tmdbDetails.adult : movie.adult,
            original_language: tmdbDetails.original_language || movie.original_language,
            original_title: tmdbDetails.original_title || movie.original_title
          };
        } catch (error) {
          console.error(`Failed to fetch details for movie ${movie.id}:`, error);
          return movie; // Return original movie if fetch fails
        }
      });
      
      const updatedMovies = await Promise.all(movieUpdatePromises);
      console.log(`Successfully refreshed ${updatedMovies.length} movies`);
      
      // Create lookup map of updated movies
      const updatedMoviesMap = new Map(updatedMovies.map(movie => [movie.id, movie]));
      
      // Update each list with refreshed movie data
      const updateMovieList = (movieList) => {
        return movieList.map(movie => updatedMoviesMap.get(movie.id) || movie);
      };
      
      const refreshedWatchlist = updateMovieList(watchlistMovies);
      const refreshedCurrentlyWatching = updateMovieList(currentlyWatchingMovies);
      const refreshedWatched = updateMovieList(watchedMovies);
      
      // Update state with refreshed data
      setWatchlist(refreshedWatchlist);
      setCurrentlyWatching(refreshedCurrentlyWatching);
      setWatched(refreshedWatched);
      
      // Cache the updated data
      await cacheUserData();
      
      console.log('Movie data refresh completed successfully');
    } catch (error) {
      console.error('Error refreshing incomplete movie data:', error);
    }
  };

  // Helper functions for list management
  const getListByType = (listType) => {
    const normalized = normalizeListType(listType);
    switch (normalized) {
      case 'watchlist': return watchlist;
      case 'currently_watching': return currentlyWatching;
      case 'watched': return watched;
      default: return [];
    }
  };

  const getListSetter = (listType) => {
    const normalized = normalizeListType(listType);
    switch (normalized) {
      case 'watchlist': return setWatchlist;
      case 'currently_watching': return setCurrentlyWatching;
      case 'watched': return setWatched;
      default: return null;
    }
  };

  // Movie list management
  const addToList = async (movie, listType) => {
    // Normalize list type for consistent handling
    const normalizedListType = normalizeListType(listType);
    
    console.log(`Adding movie ${movie.id} to ${normalizedListType}`);
    
    // Save the original state for rollback
    const originalLists = {
      watchlist: [...watchlist],
      currentlyWatching: [...currentlyWatching],
      watched: [...watched],
    };

    // Check if movie is already in any list
    const existingList = getMovieList(movie.id);
    
    // If already in the target list, do nothing
    if (existingList === normalizedListType) {
      console.log(`Movie ${movie.id} already in ${normalizedListType}`);
      return { success: true };
    }
    
    // If in another list, move it
    if (existingList) {
      console.log(`Movie ${movie.id} found in ${existingList}, moving to ${normalizedListType}`);
      return moveToList(movie.id, existingList, normalizedListType);
    }

    // Optimistic update
    const setter = getListSetter(normalizedListType);
    if (setter) {
      console.log('Performing optimistic UI update');
      setter(prev => [...prev, movie]);
    }

    try {
      // Convert to backend format (with hyphens) for API call
      const backendListType = clientToBackend(normalizedListType);
      
      console.log(`Calling backend addToList with: ${movie.id} to ${backendListType}`);
      const result = await BackendService.addToList(movie, backendListType);
      
      if (result.success) {
        console.log('Add successful:', result);
      
      // Create activity log for successful add
      const action = `added_to_${normalizedListType.replace('_', '')}`;
      createActivity('list', action, movie);
      
      // Cache updated data
      await cacheUserData();
      return { success: true };
      } else {
        console.error('Backend returned error:', result);
        // Rollback on failure
        setWatchlist(originalLists.watchlist);
        setCurrentlyWatching(originalLists.currentlyWatching);
        setWatched(originalLists.watched);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error adding to list, rolling back:', error);
      // Rollback on error
      setWatchlist(originalLists.watchlist);
      setCurrentlyWatching(originalLists.currentlyWatching);
      setWatched(originalLists.watched);
      return { success: false, error: error.message };
    }
  };

  const removeFromList = async (movieId, listType) => {
    // Normalize list type for consistent handling
    const normalizedListType = normalizeListType(listType);
    
    console.log(`Removing movie ${movieId} from ${normalizedListType}`);
    
    // Save the original state for rollback
    const originalLists = {
      watchlist: [...watchlist],
      currentlyWatching: [...currentlyWatching],
      watched: [...watched],
    };

    // Optimistic update
    const setter = getListSetter(normalizedListType);
    if (setter) {
      console.log('Performing optimistic UI update');
      setter(prev => prev.filter(m => m.id !== movieId));
    }

    try {
      // Convert to backend format (with hyphens) for API call
      const backendListType = clientToBackend(normalizedListType);
      
      console.log(`Calling backend removeFromList with: ${movieId} from ${backendListType}`);
      const result = await BackendService.removeFromList(movieId, backendListType);
      
      if (!result.success) {
        console.error('Backend returned error:', result);
        // Rollback on failure
        setWatchlist(originalLists.watchlist);
        setCurrentlyWatching(originalLists.currentlyWatching);
        setWatched(originalLists.watched);
        return { success: false, error: result.error };
      }

      console.log('Remove successful:', result);
    
    // Create activity log for successful removal
    const movieData = getMovieFromLists(movieId) || { id: movieId, title: 'Unknown Movie' };
    const action = `removed_from_${normalizedListType.replace('_', '')}`;
    createActivity('list', action, movieData);
    
    // Cache updated data
    await cacheUserData();
    return { success: true };
    } catch (error) {
      console.error('Error removing from list:', error);
      // Rollback on error
      setWatchlist(originalLists.watchlist);
      setCurrentlyWatching(originalLists.currentlyWatching);
      setWatched(originalLists.watched);
      return { success: false, error: error.message };
    }
  };

  const moveToList = async (movieId, fromList, toList) => {
    // Normalize list types for consistent handling
    const normalizedFromList = normalizeListType(fromList);
    const normalizedToList = normalizeListType(toList);
    
    console.log(`Moving movie ${movieId} from ${normalizedFromList} to ${normalizedToList}`);
    
    // Save the original state for rollback
    const originalLists = {
      watchlist: [...watchlist],
      currentlyWatching: [...currentlyWatching],
      watched: [...watched],
    };

    // Optimistic update
    const movieToMove = getMovieFromLists(movieId);
    if (!movieToMove) {
      console.error('Movie not found in any list:', movieId);
      return { success: false, error: 'Movie not found in any list' };
    }

    const fromSetter = getListSetter(normalizedFromList);
    const toSetter = getListSetter(normalizedToList);

    if (fromSetter && toSetter) {
      console.log('Performing optimistic UI update');
      fromSetter(prev => prev.filter(m => m.id !== movieId));
      toSetter(prev => [...prev, movieToMove]);
    }

    try {
      // Convert to backend format (with hyphens) for API call
      const backendFromList = clientToBackend(normalizedFromList);
      const backendToList = clientToBackend(normalizedToList);
      
      console.log('Calling backend moveToList with:', { 
        movieId, 
        fromList: backendFromList, 
        toList: backendToList 
      });
      
      const result = await BackendService.moveToList(movieId, backendFromList, backendToList);
      
      // Backend returns success: true on successful operations
      if (result && (result.success === true || result.status === 200)) {
        console.log('Move successful:', result);
      
      // Create activity log for successful move
      const action = `moved_to_${normalizedToList.replace('_', '')}`;
      createActivity('list', action, movieToMove);
      
      // Cache updated data
      await cacheUserData();
      return { success: true };
      } else {
        console.error('Backend returned error:', result);
        // Rollback on failure
        setWatchlist(originalLists.watchlist);
        setCurrentlyWatching(originalLists.currentlyWatching);
        setWatched(originalLists.watched);
        return { 
          success: false, 
          error: (result && result.error) || 'Failed to move movie between lists'
        };
      }
    } catch (error) {
      console.error('Error moving list, rolling back:', error);
      // Rollback on error
      setWatchlist(originalLists.watchlist);
      setCurrentlyWatching(originalLists.currentlyWatching);
      setWatched(originalLists.watched);
      return { 
        success: false, 
        error: error.message || 'An error occurred while moving the movie'
      };
    }
  };

  // Enhanced review management for social features
  const addReview = async (reviewData) => {
    if (!isAuthenticated) {
      console.log('Not authenticated, skipping addReview');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      console.log(`[AppContext] Raw reviewData received:`, reviewData);
      console.log(`[AppContext] reviewData type:`, typeof reviewData);
      
      // Support both old format (movieId, rating, comment) and new format (reviewData object)
      let requestData;
      if (typeof reviewData === 'object' && reviewData.movieId) {
        // New enhanced review format - ensure all values are clean primitives
        requestData = {
          showId: Number(reviewData.movieId),
          movie: {
            id: reviewData.movie?.id,
            title: reviewData.movie?.title || reviewData.movie?.name,
            poster_path: reviewData.movie?.poster_path
          },
          rating: Number(reviewData.rating),
          comment: String(reviewData.comment || '').trim(),
          tags: Array.isArray(reviewData.tags) ? reviewData.tags : [],
          isRewatched: Boolean(reviewData.isRewatched),
          containsSpoilers: Boolean(reviewData.containsSpoilers),
          visibility: String(reviewData.visibility || 'friends'),
        };
      } else {
        // Legacy format support
        const [movieId, rating, comment] = arguments;
        requestData = {
          showId: Number(movieId),
          rating: Number(rating),
          comment: String(comment || '').trim(),
          visibility: 'friends'
        };
      }

      console.log(`[AppContext] Clean requestData:`, requestData);
      
      // Check if user already has a review for this movie
      const existingReview = getUserReview(requestData.showId);
      const isEditing = !!existingReview;
      
      console.log(`[AppContext] Existing review found:`, isEditing, existingReview);
      
      const response = await BackendService.addReview(
        requestData.showId,
        requestData.rating,
        requestData.comment,
        requestData.movie,
        requestData.tags,
        requestData.isRewatched,
        requestData.containsSpoilers,
        requestData.visibility
      );
      
      if (response.success) {
        console.log(`[AppContext] Review ${isEditing ? 'updated' : 'added'} successfully:`, response.review);
        
        // Create the review object for local state
        const reviewUpdate = {
          movieId: Number(requestData.showId),
          rating: Number(requestData.rating),
          comment: requestData.comment || '',
          ...response.review
        };
        
        if (isEditing) {
          // Update existing review in local state
          setReviews(prev => prev.map(r => 
            r.movieId === requestData.showId ? reviewUpdate : r
          ));
        } else {
          // Add new review to local state
          setReviews(prev => [...prev, reviewUpdate]);
        }
      
        // Create activity log for review action
        createActivity('review', isEditing ? 'updated' : 'reviewed', requestData.movie, {
          rating: requestData.rating,
          comment: requestData.comment
        });
        
        // Cache updated data
        await cacheUserData();
        
        return { success: true, review: reviewUpdate, isEditing };
      } else {
        console.error(`[AppContext] Failed to ${isEditing ? 'update' : 'add'} review:`, response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('[AppContext] Error managing review:', error);
      return { success: false, error: error.message };
    }
  };

  // Friend management
  const sendFriendRequest = async (targetUserId) => {
    try {
      const response = await BackendService.sendFriendRequest(targetUserId);
      const message = (response && (response.message || response.msg)) || 'Friend request sent!';
      return { success: true, message };
    } catch (error) {
      console.error('Error sending friend request:', error);
      return { success: false, error: error.message };
    }
  };

  const rejectFriendRequest = async (requestId) => {
    try {
      await BackendService.rejectFriendRequest(requestId);
      
      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.id !== requestId));
      
      // Update total notifications (friend request count decreased)
      setTotalUnreadNotifications(prev => Math.max(0, prev - 1));
      
      return { success: true };
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      return { success: false, error: error.message };
    }
  };

  const searchUsers = async (query) => {
    try {
      return await BackendService.searchUsers(query);
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  };

  // Chat and messaging
  const getConversation = async (friendId) => {
    try {
      return await BackendService.getConversation(friendId);
    } catch (error) {
      console.error('Error getting conversation:', error);
      return { messages: [] };
    }
  };

  const sendMessage = async (friendId, message) => {
    try {
      return await BackendService.sendMessage(friendId, message);
    } catch (error) {
      console.error('Error sending message:', error);
      return { success: false, error: error.message };
    }
  };

  const shareMovie = async (friendId, movie) => {
    try {
      const result = await BackendService.shareMovie(friendId, movie);
      
      if (result.success) {
        // Create activity log for successful movie share
        createActivity('movie_share', 'shared', movie, {
          friendId: friendId
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error sharing movie:', error);
      return { success: false, error: error.message };
    }
  };

  // Notification management
  const loadNotifications = async () => {
    try {
      const [totalUnread, unreadCounts, friendRequestsData] = await Promise.all([
        BackendService.getTotalUnreadCount().catch(() => ({ total: 0 })),
        BackendService.getUnreadMessageCounts().catch(() => ({})),
        BackendService.getFriendRequests().catch(() => [])
      ]);
      
      // The backend total already includes friend requests, so don't double count
      const totalNotifications = totalUnread?.total || totalUnread?.count || 0;
      const friendRequestCount = Array.isArray(friendRequestsData) ? friendRequestsData.length : 0;
      const messageCount = Math.max(0, totalNotifications - friendRequestCount);
      
      setUnreadMessageCount(messageCount);
      setUnreadMessageCounts(unreadCounts || {});
      setFriendRequests(friendRequestsData);
      setTotalUnreadNotifications(totalNotifications);
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const markMessagesAsRead = async (friendId) => {
    try {
      await BackendService.markMessagesAsRead(friendId);
      
      // Update local unread counts
      setUnreadMessageCounts(prev => ({
        ...prev,
        [friendId]: 0
      }));
      
      // Refresh total unread count
      await loadNotifications();
      
      return { success: true };
    } catch (error) {
      console.error('Error marking messages as read:', error);
      return { success: false, error: error.message };
    }
  };

  const acceptFriendRequest = async (requestId) => {
    try {
      console.log('=== APP CONTEXT ACCEPT FRIEND REQUEST ===');
      console.log('Request ID:', requestId);
      console.log('User ID:', user?.id);
      
      const acceptResult = await BackendService.acceptFriendRequest(requestId);
      console.log('Backend accept result:', acceptResult);
      
      // Refresh friend requests and friends list
      const [requestsData, friendsData] = await Promise.all([
        BackendService.getFriendRequests(),
        BackendService.getFriends(user.id)
      ]);
      
      console.log('Refreshed requests data:', requestsData);
      console.log('Refreshed friends data:', friendsData);
      
      // Normalize in case service returns wrapped objects
      const normalizedRequests = Array.isArray(requestsData) ? requestsData : (requestsData?.requests || []);
      const normalizedFriends = Array.isArray(friendsData) ? friendsData : (friendsData?.friends || []);
      setFriendRequests(normalizedRequests);
      setFriends(normalizedFriends);
      
      console.log('Normalized requests:', normalizedRequests);
      console.log('Normalized friends:', normalizedFriends);
      
      // Refresh notifications to get updated counts
      await loadNotifications();
      
      return { success: true };
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return { success: false, error: error.message };
    }
  };

  const removeFriend = async (friendId) => {
    try {
      const response = await BackendService.makeRequest(`/friends/remove/${friendId}`, {
        method: 'DELETE',
      });
      
      if (response.success) {
        // Remove friend from local friends list for immediate UI update
        setFriends(prev => prev.filter(friend => friend.id !== friendId));
        
        // Refresh friends list to ensure consistency
        const friendsData = await BackendService.getFriends(user.id);
        const normalizedFriends = Array.isArray(friendsData) ? friendsData : (friendsData?.friends || []);
        setFriends(normalizedFriends);
        
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to remove friend' };
      }
    } catch (error) {
      console.error('Error removing friend:', error);
      return { success: false, error: error.message };
    }
  };

  const getFriendProfile = async (friendId) => {
    try {
      const profileData = await BackendService.getFriendProfile(friendId);
      return profileData;
    } catch (error) {
      console.error('Error fetching friend profile:', error);
      throw error;
    }
  };

  // Utility functions
  const isInList = (movieId, listType) => {
    // Normalize list type for consistent handling
    const normalizedListType = normalizeListType(listType);
    
    switch (normalizedListType) {
      case 'watchlist':
        return Array.isArray(watchlist) && watchlist.some(m => m.id === movieId);
      case 'currently_watching':
        return Array.isArray(currentlyWatching) && currentlyWatching.some(m => m.id === movieId);
      case 'watched':
        return Array.isArray(watched) && watched.some(m => m.id === movieId);
      default:
        return false;
    }
  };

  const getMovieFromLists = (movieId) => {
    return (Array.isArray(watchlist) && watchlist.find(m => m.id === movieId)) ||
           (Array.isArray(currentlyWatching) && currentlyWatching.find(m => m.id === movieId)) ||
           (Array.isArray(watched) && watched.find(m => m.id === movieId));
  };

  // Return which client list the movie is currently in: 'watchlist' | 'currently_watching' | 'watched' | null
  const getMovieList = (movieId) => {
    // Check each list and return the normalized list type
    if (Array.isArray(watchlist) && watchlist.some(m => m.id === movieId)) {
      return normalizeListType('watchlist');
    }
    if (Array.isArray(currentlyWatching) && currentlyWatching.some(m => m.id === movieId)) {
      return normalizeListType('currently_watching');
    }
    if (Array.isArray(watched) && watched.some(m => m.id === movieId)) {
      return normalizeListType('watched');
    }
    return null;
  };

  const getUserReview = (movieId) => {
    return Array.isArray(reviews) && reviews.find(r => r.movieId === movieId);
  };

  // Post creation function
  const createPost = async (postData) => {
    try {
      const response = await BackendService.makeRequest('/api/activity/create-post', {
        method: 'POST',
        body: JSON.stringify(postData),
      });

      if (response.success) {
        // Don't add to local state immediately - let the next refresh handle it
        // This prevents duplicates when the backend returns the same post
        console.log('Post created successfully, will appear after refresh');
        
        return { success: true, post: response.post };
      } else {
        return { success: false, error: response.error || 'Failed to create post' };
      }
    } catch (error) {
      console.error('Error creating post:', error);
      return { success: false, error: error.message };
    }
  };

  const value = {
    // Auth/meta
    user,
    isAuthenticated,

    // Lists and reviews
    watchlist,
    currentlyWatching,
    watched,
    reviews,
    addToList,
    removeFromList,
    moveToList,
    getMovieList,
    getMovieFromLists,
    isInList,
    getUserReview,

    // Activity
    activity,

    // Social + messaging
    friends,
    friendRequests,
    conversations,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    searchUsers,
    getFriendProfile,
    getConversation,
    sendMessage,
    shareMovie,

    // Posts/Reviews
    addReview,
    createPost,

    // Notifications
    unreadMessageCount,
    unreadMessageCounts,
    totalUnreadNotifications,
    loadNotifications,
    markMessagesAsRead,

    // UI / refresh
    loading,
    refreshing,
    error,
    offlineMode,
    lastSync,
    refreshData,

    // Stats
    stats: {
      watchlistCount: watchlist.length,
      currentlyWatchingCount: currentlyWatching.length,
      watchedCount: watched.length,
      reviewsCount: reviews.length,
      friendsCount: friends.length,
    },
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
