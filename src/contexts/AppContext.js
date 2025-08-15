import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import BackendService from '../services/backend';
import TMDBService from '../services/tmdb';

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
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // Cache management
  const [lastSync, setLastSync] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);

  // Load user data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadUserData();
    } else if (!isAuthenticated) {
      clearUserData();
    }
  }, [isAuthenticated, user]);

  // Load cached data on app start
  useEffect(() => {
    loadCachedData();
  }, []);

  const loadCachedData = async () => {
    try {
      const cachedWatchlist = await AsyncStorage.getItem('watchlist');
      const cachedCurrentlyWatching = await AsyncStorage.getItem('currentlyWatching');
      const cachedWatched = await AsyncStorage.getItem('watched');
      const cachedReviews = await AsyncStorage.getItem('reviews');
      
      if (cachedWatchlist) setWatchlist(JSON.parse(cachedWatchlist));
      if (cachedCurrentlyWatching) setCurrentlyWatching(JSON.parse(cachedCurrentlyWatching));
      if (cachedWatched) setWatched(JSON.parse(cachedWatched));
      if (cachedReviews) setReviews(JSON.parse(cachedReviews));
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  };

  const cacheUserData = async () => {
    try {
      await AsyncStorage.multiSet([
        ['watchlist', JSON.stringify(watchlist)],
        ['currentlyWatching', JSON.stringify(currentlyWatching)],
        ['watched', JSON.stringify(watched)],
        ['reviews', JSON.stringify(reviews)],
        ['lastSync', new Date().toISOString()]
      ]);
    } catch (error) {
      console.error('Error caching user data:', error);
    }
  };

  // Load data from AsyncStorage cache
  const loadFromCache = async () => {
    try {
      const cachedData = await AsyncStorage.getItem('userData');
      if (cachedData) {
        return JSON.parse(cachedData);
      }
      return null;
    } catch (error) {
      console.error('Error loading from cache:', error);
      return null;
    }
  };
  
  // Apply cached user data to state
  const applyUserData = (data) => {
    if (!data) return;
    
    if (data.watchlist) setWatchlist(data.watchlist);
    if (data.currentlyWatching) setCurrentlyWatching(data.currentlyWatching);
    if (data.watched) setWatched(data.watched);
    if (data.reviews) setReviews(data.reviews);
    if (data.friends) setFriends(data.friends);
    if (data.friendRequests) setFriendRequests(data.friendRequests);
    if (data.activity) setActivity(data.activity);
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
      
      // Try to load from cache first for immediate display
      const cachedData = await loadFromCache();
      if (cachedData) {
        console.log('Loaded data from cache');
        applyUserData(cachedData);
      }
      
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
        
        // Update state with fetched data
        setWatchlist(Array.isArray(watchlistData) ? watchlistData : []);
        setCurrentlyWatching(Array.isArray(currentlyWatchingData) ? currentlyWatchingData : []);
        setWatched(Array.isArray(watchedData) ? watchedData : []);
        setReviews(Array.isArray(reviewsData) ? reviewsData : []);
      } catch (error) {
        console.error('Error fetching movie lists:', error);
        // Continue with other data fetching even if movie lists fail
      }
      
      // Load social data (always from backend)
      try {
        const [friendsData, requestsData, activityData] = await Promise.all([
          BackendService.getFriends(user.id),
          BackendService.getFriendRequests(),
          BackendService.getActivity(),
        ]);
        
        console.log('Social data fetched successfully:');
        console.log('- Friends:', friendsData?.length || 0);
        console.log('- Friend requests:', requestsData?.length || 0);
        console.log('- Activity items:', activityData?.length || 0);
        
        setFriends(Array.isArray(friendsData) ? friendsData : []);
        setFriendRequests(Array.isArray(requestsData) ? requestsData : []);
        setActivity(Array.isArray(activityData) ? activityData : []);
      } catch (error) {
        console.error('Error fetching social data:', error);
        // Continue even if social data fails
      }
      
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

  const clearUserData = () => {
    setWatchlist([]);
    setCurrentlyWatching([]);
    setWatched([]);
    setReviews([]);
    setFriends([]);
    setFriendRequests([]);
    setConversations([]);
    setActivity([]);
    setUnreadMessageCount(0);
    setUnreadMessageCounts({});
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
        // Cache updated data
        await cacheUserData();
        return { success: true };
      } else {
        console.error('Backend returned error:', result);
        // Rollback on failure
        setWatchlist(originalLists.watchlist);
        setCurrentlyWatching(originalLists.currentlyWatching);
        setWatched(originalLists.watched);
        
        // If backend returned an existing list, convert it to client format
        let clientExistingList = result.existingList;
        if (clientExistingList) {
          clientExistingList = backendToClient(clientExistingList);
        }
        
        return { 
          success: false, 
          error: result.error,
          status: result.status,
          existingList: clientExistingList
        };
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
      // Support both old format (movieId, rating, comment) and new format (reviewData object)
      let requestData;
      if (typeof reviewData === 'object' && reviewData.movieId) {
        // New enhanced review format
        requestData = {
          showId: reviewData.movieId,
          movie: reviewData.movie,
          rating: reviewData.rating,
          comment: reviewData.comment,
          tags: reviewData.tags || [],
          isRewatched: reviewData.isRewatched || false,
          containsSpoilers: reviewData.containsSpoilers || false,
          visibility: reviewData.visibility || 'friends',
        };
      } else {
        // Legacy format support
        const [movieId, rating, comment] = arguments;
        requestData = {
          showId: movieId,
          rating: rating,
          comment: comment || '',
          visibility: 'friends'
        };
      }

      console.log(`[AppContext] Adding review:`, requestData);
      
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
        console.log('[AppContext] Review added successfully:', response.review);
        
        // Add to local reviews array for immediate UI update
        const newReview = {
          movieId: Number(requestData.showId),
          rating: Number(requestData.rating),
          comment: requestData.comment || '',
          ...response.review
        };
        
        setReviews(prev => [...prev, newReview]);
        
        // Refresh activity to show new review in social feed
        await refreshData();
        
        return { success: true, review: newReview };
      } else {
        console.error('[AppContext] Failed to add review:', response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('[AppContext] Error adding review:', error);
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
      return await BackendService.shareMovie(friendId, movie);
    } catch (error) {
      console.error('Error sharing movie:', error);
      return { success: false, error: error.message };
    }
  };

  // Notification management
  const loadNotifications = async () => {
    try {
      const [totalUnread, unreadCounts] = await Promise.all([
        BackendService.getTotalUnreadCount().catch(() => ({ total: 0 })),
        BackendService.getUnreadMessageCounts().catch(() => ({}))
      ]);
      
      setUnreadMessageCount(totalUnread?.total || totalUnread?.count || 0);
      setUnreadMessageCounts(unreadCounts || {});
      
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
      await BackendService.acceptFriendRequest(requestId);
      
      // Refresh friend requests and friends list
      const [requestsData, friendsData] = await Promise.all([
        BackendService.getFriendRequests(),
        BackendService.getFriends(user.id)
      ]);
      
      // Normalize in case service returns wrapped objects
      const normalizedRequests = Array.isArray(requestsData) ? requestsData : (requestsData?.requests || []);
      const normalizedFriends = Array.isArray(friendsData) ? friendsData : (friendsData?.friends || []);
      setFriendRequests(normalizedRequests);
      setFriends(normalizedFriends);
      
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

  const value = {
    // Movie lists
    watchlist,
    currentlyWatching,
    watched,
    reviews,
    friends,
    friendRequests,
    activity,
    
    // Loading states
    loading,
    refreshing,
    
    // Actions
    refreshData,
    addToList,
    removeFromList,
    moveToList,
    addReview,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    searchUsers,
    getConversation,
    sendMessage,
    shareMovie,
    
    // Notification management
    unreadMessageCount,
    unreadMessageCounts,
    loadNotifications,
    markMessagesAsRead,
    
    // Utility functions
    isInList,
    getMovieFromLists,
    getMovieList,
    getUserReview,
    
    // UI state
    loading,
    refreshing,
    error,
    offlineMode,
    lastSync,
    
    // Stats
    stats: {
      watchlistCount: watchlist.length,
      currentlyWatchingCount: currentlyWatching.length,
      watchedCount: watched.length,
      reviewsCount: reviews.length,
      friendsCount: friends.length
    }
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
