// Backend service for ShowBuff mobile app
// Connects to the existing ShowBuff backend server
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

class BackendService {
  constructor() {
    // Get environment variables from Expo Constants (support both new and legacy fields)
    const env = (Constants.expoConfig?.extra) || (Constants.manifest?.extra) || {};
    
    // More reliable physical device detection
    const isPhysicalDevice = Constants.isDevice === true;
    
    // Resolve base URL depending on simulator vs device and Expo host IP
    this.baseURL = this.computeBaseURL(env, isPhysicalDevice);
    
    // Debug info
    console.log('Environment variables:', env);
    console.log(`BackendService initialized with baseURL: ${this.baseURL}`);
    console.log('Platform:', Platform.OS);
    console.log('Is Physical Device:', isPhysicalDevice);
    const hostUri = (Constants.expoConfig?.hostUri) || (Constants.manifest?.hostUri) || (Constants.manifest?.debuggerHost);
    console.log('Expo hostUri/debuggerHost:', hostUri);
    
    this.token = null;
    this.demoMode = false;
    // Initialize with network timeout for requests from environment or default
    this.timeout = env.API_TIMEOUT ? parseInt(env.API_TIMEOUT) : 10000; // Default 10 seconds timeout
    
    // TMDB configuration for movie data enrichment
    this.tmdbApiKey = env.TMDB_API_KEY || '45eff3de944d9ab75c41d53848cce337';
    this.tmdbBaseUrl = env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
    
    // Cache for enriched movie data
    this.movieCache = new Map();
    this.loadMovieCache();
  }

  async makeRequest(endpoint, options = {}) {
    // Demo mode disabled: always call real backend
    console.log(`Making request to: ${endpoint}`);
    // Normalize base and endpoint to avoid double /api or missing slashes
    const base = (this.baseURL || '').replace(/\/+$/g, ''); // remove trailing slash(es)
    let path = String(endpoint || '');
    if (!path.startsWith('/')) path = '/' + path; // ensure leading slash
    // If base already ends with /api and endpoint starts with /api, drop one to avoid /api/api
    if (base.endsWith('/api') && path.startsWith('/api/')) {
      path = path.slice(4); // remove leading '/api'
    }
    const url = `${base}${path}`;
    console.log(`[BackendService] Full URL: ${url}`);
    
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {}),
      },
    };

    // Debug logging
    console.log(`[BackendService] Headers:`, config.headers);
    console.log(`[BackendService] Method: ${options.method || 'GET'}`);

    // Create a timeout promise that rejects after this.timeout milliseconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const timeoutError = new Error(`Request timeout for ${endpoint}`);
        timeoutError.isTimeout = true;
        reject(timeoutError);
      }, this.timeout);
    });

    try {
      console.log(`Attempting fetch to ${url}...`);
      // Race between the fetch request and the timeout
      const fetchPromise = fetch(url, config);
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      console.log(`Received response with status: ${response.status}`);

      if (!response.ok) {
        // Try to extract error details from JSON body
        let message = `HTTP error! status: ${response.status}`;
        let errJson = null;
        try {
          errJson = await response.json();
          if (errJson && (errJson.message || errJson.error)) {
            message = errJson.message || errJson.error;
          }
        } catch (_) {
          // ignore body parse errors
        }
        const err = new Error(message);
        err.status = response.status;
        err.endpoint = endpoint;
        // Attach parsed body for callers to inspect (e.g., existingList on 409)
        if (errJson) {
          err.body = errJson;
          if (typeof errJson.existingList !== 'undefined') {
            err.existingList = errJson.existingList;
          }
        }
        throw err;
      }

      // Gracefully handle empty or non-JSON responses (e.g., 204 No Content)
      const contentType = response.headers.get('content-type');
      const hasJson = contentType && contentType.includes('application/json');

      if (hasJson) {
        return await response.json();
      } else {
        return { success: true };
      }
    } catch (error) {
      // Suppress logout endpoint errors to avoid noisy logs and allow local logout
      if (endpoint === '/api/auth/logout') {
        return { success: true };
      }
      
      // Enhanced error logging
      console.error(`Backend API Error for ${endpoint}:`, error);
      
      // Handle network errors specifically
      if (error.message && error.message.includes('Network request failed')) {
        console.error('Network connection error details:');
        console.error(`- URL attempted: ${url}`);
        console.error(`- Base URL: ${this.baseURL}`);
        console.error('- Possible causes: Server not running, wrong IP/port, or network connectivity issues');
        
        return { 
          success: false, 
          error: 'Network connection failed. Please check your internet connection and server status.',
          isNetworkError: true
        };
      }
      
      // Handle timeout errors
      if (error.message && error.message.includes('timeout') || error.isTimeout) {
        console.error(`Request to ${endpoint} timed out after ${this.timeout}ms`);
        return { 
          success: false, 
          error: `Request timed out after ${this.timeout/1000} seconds. Please try again.`,
          isTimeout: true
        };
      }
      
      // Return a structured error response instead of throwing
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        status: error.status || 500
      };
    }
  }

  // Demo/mock responses removed

  // Authentication methods
  async login(email, password) {
    console.log('=== BACKEND SERVICE LOGIN START ===');
    console.log('Email:', email);
    console.log('Password length:', password.length);
    console.log('Request URL:', `${this.baseURL}/api/auth/login`);
    console.log('Current token:', this.token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
    console.log('Demo mode:', this.demoMode);
    
    const response = await this.makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    console.log('=== BACKEND SERVICE RAW RESPONSE ===');
    console.log('Raw response:', response);
    console.log('Response type:', typeof response);
    console.log('Response.token:', response.token);
    console.log('Response.user:', response.user);
    console.log('Response.message:', response.message);
    
    // Backend returns {token, user}, transform to expected format
    if (response.token && response.user) {
      console.log('=== BACKEND SERVICE SUCCESS ===');
      console.log('Setting token in service');
      this.token = response.token;
      
      const result = {
        success: true,
        token: response.token,
        user: response.user
      };
      
      console.log('=== BACKEND SERVICE RETURNING ===');
      console.log('Result:', result);
      return result;
    }
    
    console.log('=== BACKEND SERVICE FAILURE ===');
    console.log('No token or user in response');
    console.log('Returning failure result');
    
    return { success: false, error: response.message || 'Login failed' };
  }

  async register(username, email, password) {
    console.log('=== BACKEND SERVICE REGISTER START ===');
    console.log('Username:', username);
    console.log('Email:', email);
    console.log('Password length:', password.length);
    console.log('Request URL:', `${this.baseURL}/api/auth/register`);
    console.log('Current token:', this.token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
    
    const response = await this.makeRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    
    console.log('=== BACKEND SERVICE REGISTER RESPONSE ===');
    console.log('Raw response:', response);
    console.log('Response type:', typeof response);
    console.log('Response.token:', response.token);
    console.log('Response.user:', response.user);
    console.log('Response.message:', response.message);
    console.log('Response.error:', response.error);
    
    // Backend returns {token, user}, transform to expected format
    if (response.token && response.user) {
      console.log('=== REGISTER SUCCESS - SETTING TOKEN ===');
      this.token = response.token;
      return {
        success: true,
        token: response.token,
        user: response.user
      };
    }
    
    console.log('=== REGISTER FAILED ===');
    console.log('Error message:', response.error || response.message || 'Registration failed');
    
    return { 
      success: false, 
      error: response.error || response.message || 'Registration failed',
      isNetworkError: response.isNetworkError || false,
      isTimeout: response.isTimeout || false
    };
  }

  async logout() {
    const response = await this.makeRequest('/api/auth/logout', {
      method: 'POST',
    });
    // Clear token on logout
    this.token = null;
    return response;
  }

  // Token management
  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  // User profile methods
  async getUserProfile(userId) {
    return await this.makeRequest(`/user/profile/${userId}`);
  }

  async updateUserProfile(userId, profileData) {
    return await this.makeRequest(`/user/profile/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  // Movie list methods
  async getUserMovies(userId, listType = null) {
    let endpoint;
    switch (listType) {
      case 'watchlist':
        endpoint = '/user/watchlist';
        break;
      case 'currently_watching':
        endpoint = '/user/currently-watching';
        break;
      case 'watched':
        endpoint = '/user/watched';
        break;
      default:
        endpoint = '/user/watchlist'; // Default to watchlist
    }
    return await this.makeRequest(endpoint);
  }

  // Wrapper used by AppContext to fetch lists with hyphenated names
  async getUserList(listType) {
    switch (String(listType)) {
      case 'watchlist':
        return await this.makeRequest('/user/watchlist');
      case 'currently-watching':
        return await this.makeRequest('/user/currently-watching');
      case 'watched':
        return await this.makeRequest('/user/watched');
      default:
        return await this.makeRequest('/user/watchlist');
    }
  }

  async getWatchlist() {
    const movies = await this.makeRequest('/api/movies/watchlist');
    return await this.enrichMovieList(movies);
  }

  async getCurrentlyWatching() {
    const movies = await this.makeRequest('/api/movies/currently-watching');
    return await this.enrichMovieList(movies);
  }

  async getWatched() {
    const movies = await this.makeRequest('/api/movies/watched');
    return await this.enrichMovieList(movies);
  }

  async addToList(movieData, listType) {
    console.log('BackendService.addToList called with:', { movieId: movieData?.id, listType });
    
    // Normalize list type to backend format (hyphenated)
    const normalizedList = String(listType).replace(/_/g, '-');

    const requestBody = {
      movieId: movieData.id,
      listType: normalizedList
    };
    
    console.log('Sending add-to-list request:', requestBody);
    
    return await this.makeRequest('/user/add-to-list', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  async removeFromList(showId, listType) {
    let endpoint;
    switch (listType) {
      case 'watchlist':
        endpoint = `/user/remove-from-watchlist`;
        break;
      case 'currently_watching':
        endpoint = `/user/remove-from-currently-watching`;
        break;
      case 'watched':
        endpoint = `/user/remove-from-watched`;
        break;
      default:
        endpoint = `/user/remove-from-watchlist`;
    }
    return await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ showId }),
    });
  }

  async moveToList(showId, fromList, toList) {
    console.log('BackendService.moveToList called with:', { showId, fromList, toList });
    
    // Normalize list type strings to backend format (hyphens)
    const requestBody = { 
      // Backend expects `movieId` for this endpoint
      movieId: showId, 
      fromList: String(fromList).replace(/_/g, '-'), 
      toList: String(toList).replace(/_/g, '-') 
    };
    console.log('Move to list request body:', requestBody);
    
    return await this.makeRequest('/user/move-to-list', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  // Review methods
  async addReview(showId, rating, comment) {
    return await this.makeRequest('/user/reviews', {
      method: 'POST',
      body: JSON.stringify({ showId, rating, comment }),
    });
  }

  async getUserReviews(userId) {
    return await this.makeRequest('/user/reviews');
  }

  async getMovieReviews(showId) {
    return await this.makeRequest(`/api/movie/${showId}/reviews`);
  }

  // Friend methods
  async getFriends(userId) {
    // Normalize to always return an array and add basic diagnostics
    console.log('=== BACKEND SERVICE GET FRIENDS ===');
    console.log('Token present:', this.token ? 'YES' : 'NO');
    const res = await this.makeRequest('/api/friends');
    const friends = Array.isArray(res) ? res : (res?.friends || []);
    console.log('Friends count:', Array.isArray(friends) ? friends.length : 0);
    return friends;
  }

  async getFriendRequests() {
    // Normalize to always return an array and add basic diagnostics
    console.log('=== BACKEND SERVICE GET FRIEND REQUESTS ===');
    console.log('Token present:', this.token ? 'YES' : 'NO');
    const res = await this.makeRequest('/api/friends/requests');
    const requests = Array.isArray(res) ? res : (res?.requests || []);
    console.log('Friend requests count:', Array.isArray(requests) ? requests.length : 0);
    return requests;
  }

  async searchUsers(query) {
    return await this.makeRequest(`/users/search?q=${encodeURIComponent(query)}`);
  }

  async sendFriendRequest(userId) {
    console.log('=== BACKEND SERVICE SEND FRIEND REQUEST ===');
    console.log('Target userId:', userId);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    return await this.makeRequest('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async acceptFriendRequest(requestId) {
    console.log('=== BACKEND SERVICE ACCEPT FRIEND REQUEST ===');
    console.log('Request ID:', requestId);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    return await this.makeRequest(`/api/friends/accept/${requestId}`, {
      method: 'POST',
    });
  }

  async rejectFriendRequest(requestId) {
    console.log('=== BACKEND SERVICE REJECT FRIEND REQUEST ===');
    console.log('Request ID:', requestId);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    return await this.makeRequest(`/api/friends/reject/${requestId}`, {
      method: 'POST',
    });
  }

  async getFriendProfile(friendId) {
    return await this.makeRequest(`/api/friends/${friendId}/profile`);
  }

  async getFriendMovies(friendId, listType = null) {
    const endpoint = listType 
      ? `/api/friends/${friendId}/movies?list=${listType}`
      : `/api/friends/${friendId}/movies`;
    return await this.makeRequest(endpoint);
  }

  // Activity methods
  async getUserActivity(userId) {
    const activities = await this.makeRequest(`/api/user/${userId}/activity`);
    return await this.enrichActivityData(activities);
  }

  async getActivity() {
    const res = await this.makeRequest('/api/feed/social');
    try {
      console.log('=== BACKEND SERVICE GET ACTIVITY RAW ===');
      console.log('Type:', typeof res);
      if (res && typeof res === 'object') {
        console.log('Keys:', Object.keys(res));
      }
      console.log('First item:', res?.[0]);
      console.log('=== END RAW ===');
    } catch (e) {
      console.warn('Debug log failed:', e);
    }
    return await this.enrichActivityData(res);
  }

  async getFriendsActivity() {
    const res = await this.makeRequest('/api/user/activity');
    try {
      console.log('=== BACKEND SERVICE GET FRIENDS ACTIVITY RAW ===');
      console.log('Type:', typeof res);
      if (res && typeof res === 'object') {
        console.log('Keys:', Object.keys(res));
      }
      const arr = Array.isArray(res)
        ? res
        : (Array.isArray(res?.activities) ? res.activities
          : Array.isArray(res?.activity) ? res.activity
          : Array.isArray(res?.data) ? res.data
          : Array.isArray(res?.feed) ? res.feed
          : Array.isArray(res?.rows) ? res.rows
          : Array.isArray(res?.items) ? res.items
          : []);
      console.log('Normalized activity array length:', Array.isArray(arr) ? arr.length : 0);
      return arr;
    } catch (e) {
      console.warn('getFriendsActivity normalization failed, returning empty array:', e);
      return [];
    }
  }

  // Alias used by AppContext
  async getActivity() {
    return await this.getFriendsActivity();
  }
  
  async getSocialFeed() {
    return await this.makeRequest('/api/feed/social');
  }

  // Post interactions
  async likePost(postId) {
    return await this.makeRequest(`/api/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  // Create a new post with optional movie data
  async createPost(postData) {
    return await this.makeRequest('/api/activity/create-post', {
      method: 'POST',
      body: JSON.stringify(postData)
    });
  }

  async addPostComment(postId, text) {
    return await this.makeRequest(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async getPostComments(postId, options = {}) {
    const params = new URLSearchParams();
    if (options.sort) params.append('sort', options.sort);
    if (options.limit) params.append('limit', String(options.limit));
    const qs = params.toString();
    const path = qs ? `/api/posts/${postId}/comments?${qs}` : `/api/posts/${postId}/comments`;
    return await this.makeRequest(path);
  }

  async likeComment(postId, commentId) {
    return await this.makeRequest(`/api/posts/${postId}/comments/${commentId}/like`, {
      method: 'POST',
    });
  }

  // Chat/messaging methods
  async getConversations() {
    console.log('Getting conversations...');
    return await this.makeRequest('/api/messages/conversations');
  }

  async getMessages(friendId) {
    console.log('=== BACKEND SERVICE GET MESSAGES START ===');
    console.log('Friend ID:', friendId);
    console.log('Demo mode:', this.demoMode);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    console.log('Calling makeRequest with endpoint: /api/messages/conversation/' + friendId);
  
    try {
      const result = await this.makeRequest(`/api/messages/conversation/${friendId}`);
      console.log('=== GET MESSAGES SUCCESS ===');
      console.log('Raw result:', result);
      const rows = Array.isArray(result?.messages)
        ? result.messages
        : (Array.isArray(result) ? result : []);

      // Normalize backend rows (snake_case) to UI schema (camelCase)
      const messages = rows.map((row) => {
        const type = (row.message_type === 'movie_recommendation' || row.message_type === 'movie_share')
          ? 'movie_share'
          : 'text';

        const base = {
          id: row.id,
          senderId: Number(row.sender_id),
          receiverId: Number(row.receiver_id),
          senderUsername: row.sender_username,
          receiverUsername: row.receiver_username,
          messageType: type,
          createdAt: row.created_at || row.createdAt,
        };

        if (type === 'movie_share') {
          const title = row.movie_title || row.show_title || row.title || '';
          const tmdbId = row.tmdb_id || row.tmdbId;
          return {
            ...base,
            text: row.message_text || (title ? `Recommended: ${title}` : 'Recommended a movie'),
            movie: row.movie_data || row.movie || null,
            movieData: {
              // Prefer TMDB ID for navigation/details fetch; fall back to internal as last resort
              id: (typeof tmdbId !== 'undefined' ? tmdbId : (row.tmdb_id || undefined)) ?? row.movie_id ?? row.movieId ?? undefined,
              title: title || row.movieTitle || row.movie_title,
              name: title || row.movieTitle || row.movie_title,
              // Prefer joined show's poster_path
              poster_path: row.show_poster_path || row.poster_path || row.movie_poster || row.moviePoster || null,
            }
          };
        } else {
          return {
            ...base,
            text: row.message_text || row.content,
            movie: row.movie_data || row.movie || null,
          };
        }
      });
      
      return messages;
    } catch (error) {
      console.log('=== GET MESSAGES FAILED ===');
      console.log('Error:', error);
      return [];
    }
  }

  async sendMessage(friendId, message) {
    console.log('=== BACKEND SERVICE SEND MESSAGE START ===');
    console.log('Friend ID:', friendId);
    console.log('Message:', message);
    console.log('Demo mode:', this.demoMode);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    
    const requestBody = {
      receiverId: friendId,
      messageText: message
    };
    
    console.log('Send message request body:', requestBody);
    console.log('Calling makeRequest with endpoint: /api/messages/send');
    
    try {
      const result = await this.makeRequest('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          // include common aliases to maximize backend compatibility
          receiverId: friendId,
          friendId,
          messageText: message,
          content: message,
        }),
      });
      console.log('=== SEND MESSAGE SUCCESS ===');
      console.log('Result:', result);
      return { success: true, data: result };
    } catch (error) {
      console.log('=== SEND MESSAGE FAILED ===');
      console.log('Error:', error);
      return { success: false, error: error.message || 'Failed to send message' };
    }
  }

  async getFriendProfile(friendId) {
    console.log('=== BACKEND SERVICE GET FRIEND PROFILE ===');
    console.log('Friend ID:', friendId);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    
    try {
      const response = await this.makeRequest(`/api/friends/${friendId}/profile`);
      console.log('Friend profile response:', response);
      return response;
    } catch (error) {
      console.error('Error fetching friend profile:', error);
      throw error;
    }
  }

  async shareMovie(friendId, movieData) {
    console.log('=== BACKEND SERVICE SHARE MOVIE START ===');
    console.log('Friend ID:', friendId);
    console.log('Movie Data:', movieData);
    console.log('Movie Title:', movieData?.title);
    console.log('Movie ID:', movieData?.id);
    console.log('Demo mode:', this.demoMode);
    console.log('Token present:', this.token ? 'YES' : 'NO');
    
    const messageText = movieData ? `Check out this movie: ${movieData.title}` : 'Shared a movie with you';
    
    // Strip down movie data to essential fields only to avoid 413 payload too large errors
    const essentialMovieData = movieData ? {
      id: movieData.id,
      title: movieData.title || movieData.name,
      name: movieData.name || movieData.title,
      poster_path: movieData.poster_path,
      backdrop_path: movieData.backdrop_path,
      overview: movieData.overview,
      release_date: movieData.release_date || movieData.first_air_date,
      first_air_date: movieData.first_air_date || movieData.release_date,
      vote_average: movieData.vote_average,
      vote_count: movieData.vote_count,
      genre_ids: movieData.genre_ids,
      media_type: movieData.media_type,
      adult: movieData.adult,
      original_language: movieData.original_language,
      original_title: movieData.original_title,
      popularity: movieData.popularity
    } : null;
    
    const requestBody = {
      receiverId: friendId,
      friendId,
      movieId: movieData?.id,
      tmdbId: movieData?.id,
      messageText: messageText,
      content: messageText,
      type: 'movie_share',
      movie: essentialMovieData,
    };
    
    console.log('Share movie request body (size reduced):', requestBody);
    console.log('Calling makeRequest with endpoint: /api/messages/send-movie');
    
    try {
      const result = await this.makeRequest('/api/messages/send-movie', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      console.log('=== SHARE MOVIE SUCCESS ===');
      console.log('Result:', result);
      return { success: true, data: result };
    } catch (error) {
      console.log('=== SHARE MOVIE FAILED ===');
      console.log('Error:', error);
      return { success: false, error: error.message || 'Failed to share movie' };
    }
  }

  async clearStoredAuth() {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      this.token = null;
      console.log('Cleared stored authentication for backend switch');
    } catch (error) {
      console.error('Error clearing stored auth:', error);
    }
  }

  async markMessagesAsRead(friendId) {
    console.log('Marking messages as read for friend:', friendId);
    return await this.makeRequest(`/api/messages/mark-read/${friendId}`, {
      method: 'PUT',
    });
  }

  async getUnreadMessageCounts() {
    console.log('Getting unread message counts...');
    return await this.makeRequest('/api/messages/unread-counts');
  }

  async getTotalUnreadCount() {
    console.log('Getting total unread count...');
    return await this.makeRequest('/api/messages/total-unread');
  }

  // Copy from friend methods
  async copyFromFriend(friendId, showId, toList) {
    // Normalize list type to backend format (hyphenated)
    const normalizedToList = String(toList).replace('_', '-');
    return await this.makeRequest('/api/user/copy-from-friend', {
      method: 'POST',
      body: JSON.stringify({ friendId, showId, toList: normalizedToList }),
    });
  }

  // Search users
  async searchUsers(query) {
    return await this.makeRequest(`/api/users/search?q=${encodeURIComponent(query)}`);
  }

  // Get show details from backend (with TMDB fallback)
  async getShowDetails(showId) {
    return await this.makeRequest(`/api/shows/${showId}`);
  }

  // Add show to backend database
  async addShow(showData) {
    return await this.makeRequest('/api/shows', {
      method: 'POST',
      body: JSON.stringify(showData),
    });
  }

  // Missing methods that were causing 500 errors
  async getConversation(friendId) {
    return await this.getMessages(friendId);
  }

  // Comment-related methods
  async getPostComments(postId, options = {}) {
    const queryParams = new URLSearchParams();
    if (options.sort) {
      queryParams.append('sort', options.sort);
    }
    const queryString = queryParams.toString();
    const endpoint = `/api/posts/${postId}/comments${queryString ? `?${queryString}` : ''}`;
    return await this.makeRequest(endpoint);
  }

  async addPostComment(postId, text) {
    return await this.makeRequest(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async likeComment(postId, commentId) {
    return await this.makeRequest(`/api/posts/${postId}/comments/${commentId}/like`, {
      method: 'POST',
    });
  }

  async likePost(postId) {
    return await this.makeRequest(`/api/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  // Helper methods for resolving correct backend base URL
  computeBaseURL(env, isPhysicalDevice) {
    try {
      // Default to production backend unless explicitly set to false
      const useProd = env.USE_PRODUCTION_BACKEND !== 'false';
      if (useProd) {
        return 'https://showbuff-production.up.railway.app/api';
      }

      // Development mode - local backend
      const platform = Platform.OS;

      // Simulators/Emulators talk to host machine via special loopback addresses
      if (platform === 'ios' && !isPhysicalDevice) {
        return 'http://127.0.0.1:3001/api';
      }
      if (platform === 'android' && !isPhysicalDevice) {
        // Android emulator maps host loopback to 10.0.2.2
        return 'http://10.0.2.2:3001/api';
      }

      // Physical device: derive LAN IP from Expo host when possible
      const host = this.getExpoHostIp(env);
      if (host) {
        return `http://${host}:3001/api`;
      }

      // Fallback to production if we can't determine local IP
      console.warn('[BackendService] Could not determine local development URL. Falling back to production backend.');
      return 'https://showbuff-production.up.railway.app/api';
    } catch (e) {
      console.warn('[BackendService] Error computing base URL, defaulting to http://127.0.0.1:3001/api', e);
      return 'http://127.0.0.1:3001/api';
    }
  }

  getExpoHostIp(env) {
    try {
      // Prefer explicit override via app config extra
      const override = env.LOCAL_LAN_IP || env.LAN_IP || env.BACKEND_LAN_IP;
      if (override && typeof override === 'string') {
        const ip = override.split(':')[0].trim();
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
      }

      // Try to read from Expo host URI (e.g., "192.168.68.103:8081")
      const hostUri = (Constants.expoConfig?.hostUri) || (Constants.manifest?.hostUri) || (Constants.manifest?.debuggerHost);
      if (typeof hostUri === 'string') {
        const host = hostUri.split('@').pop()?.split(':')[0]; // supports tunnel URLs like "exp://exp.host/@user/app+GUID"
        if (host && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
          return host;
        }
      }
    } catch (_) {}
    return null;
  }

  // ===== Movie Data Enrichment =====
  async loadMovieCache() {
    try {
      const cached = await AsyncStorage.getItem('movieCache');
      if (cached) {
        const data = JSON.parse(cached);
        this.movieCache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn('Failed to load movie cache:', error);
    }
  }

  async saveMovieCache() {
    try {
      const data = Object.fromEntries(this.movieCache);
      await AsyncStorage.setItem('movieCache', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save movie cache:', error);
    }
  }

  async fetchMovieFromTMDB(movieId) {
    try {
      const url = `${this.tmdbBaseUrl}/movie/${movieId}?api_key=${this.tmdbApiKey}`;
      const response = await fetch(url, { timeout: this.timeout });
      
      if (!response.ok) {
        // Try TV show if movie fails
        const tvUrl = `${this.tmdbBaseUrl}/tv/${movieId}?api_key=${this.tmdbApiKey}`;
        const tvResponse = await fetch(tvUrl, { timeout: this.timeout });
        
        if (!tvResponse.ok) {
          throw new Error(`TMDB API error: ${response.status}`);
        }
        
        const tvData = await tvResponse.json();
        return {
          id: movieId,
          title: tvData.name,
          name: tvData.name,
          poster_path: tvData.poster_path,
          backdrop_path: tvData.backdrop_path,
          overview: tvData.overview,
          vote_average: tvData.vote_average,
          vote_count: tvData.vote_count,
          release_date: tvData.first_air_date,
          first_air_date: tvData.first_air_date,
          genre_ids: tvData.genre_ids,
          genres: tvData.genres,
          popularity: tvData.popularity,
          adult: tvData.adult,
          original_language: tvData.original_language,
          original_name: tvData.original_name,
          type: 'tv'
        };
      }
      
      const movieData = await response.json();
      return {
        id: movieId,
        title: movieData.title,
        name: movieData.title,
        poster_path: movieData.poster_path,
        backdrop_path: movieData.backdrop_path,
        overview: movieData.overview,
        vote_average: movieData.vote_average,
        vote_count: movieData.vote_count,
        release_date: movieData.release_date,
        genre_ids: movieData.genre_ids,
        genres: movieData.genres,
        runtime: movieData.runtime,
        popularity: movieData.popularity,
        adult: movieData.adult,
        original_language: movieData.original_language,
        original_title: movieData.original_title,
        type: 'movie'
      };
    } catch (error) {
      console.warn(`Failed to fetch movie ${movieId} from TMDB:`, error);
      return null;
    }
  }

  async enrichMovieData(movieData) {
    if (!movieData) return null;
    
    const movieId = movieData.id || movieData.movieId || movieData.tmdb_id || movieData.tmdbId;
    const title = movieData.title || movieData.movieTitle || movieData.name || movieData.movie_title;
    
    // Only enrich if we have a valid movieId AND the title is clearly generic/incomplete
    // Be much more conservative - don't overwrite existing valid titles
    const isClearlyGeneric = title && (
      title.match(/^Show #\d+$/) || 
      title === 'Unknown Movie' || 
      title === 'Unknown' ||
      !title.trim()
    );
    
    if (isClearlyGeneric && movieId) {
      // Check cache first
      const cacheKey = `movie_${movieId}`;
      if (this.movieCache.has(cacheKey)) {
        const cached = this.movieCache.get(cacheKey);
        // Only use cached data if it has a better title
        if (cached.title && !cached.title.match(/^Show #\d+$/)) {
          return { ...movieData, ...cached };
        }
      }
      
      // Only fetch from TMDB if we don't have a valid title in cache
      const tmdbData = await this.fetchMovieFromTMDB(movieId);
      if (tmdbData && tmdbData.title) {
        this.movieCache.set(cacheKey, tmdbData);
        await this.saveMovieCache();
        return { ...movieData, ...tmdbData };
      }
    }
    
    // Return original data unchanged if we don't need to enrich
    return movieData;
  }

  async enrichActivityData(activities) {
    if (!Array.isArray(activities)) return activities;
    
    const enriched = await Promise.all(
      activities.map(async (activity) => {
        if (!activity) return activity;
        
        // Handle nested movie object in posts
        const movieObj = activity.movie;
        const movieId = activity.movieId || movieObj?.id || movieObj?.tmdbId;
        const movieTitle = activity.movieTitle || movieObj?.title || movieObj?.name;
        const moviePoster = activity.moviePoster || movieObj?.poster_path;
        
        // Only enrich if we have a movieId AND the title looks incomplete
        // Don't overwrite existing good data
        const needsEnrichment = movieId && (
          !movieTitle || 
          movieTitle === 'Unknown Movie' ||
          movieTitle.match(/^Show #\d+$/)
        );
        
        if (needsEnrichment) {
          const enrichedMovie = await this.enrichMovieData({
            id: movieId,
            title: movieTitle,
            poster_path: moviePoster,
            ...movieObj
          });
          
          if (enrichedMovie && enrichedMovie.title !== movieTitle) {
            return {
              ...activity,
              movieId: enrichedMovie.id,
              movieTitle: enrichedMovie.title || enrichedMovie.name,
              moviePoster: enrichedMovie.poster_path,
              // Update nested movie object too
              movie: enrichedMovie
            };
          }
        }
        
        return activity;
      })
    );
    
    return enriched;
  }

  async enrichMovieList(movies) {
    if (!Array.isArray(movies)) return movies;
    
    const enriched = await Promise.all(
      movies.map(async (movie) => {
        // Always try to enrich with latest TMDB data for complete movie info
        const movieId = movie.id || movie.movieId || movie.tmdb_id || movie.tmdbId;
        if (movieId) {
          // Check if movie needs enrichment (missing key fields like ratings)
          const needsEnrichment = !movie.vote_average || !movie.overview || !movie.poster_path;
          
          if (needsEnrichment) {
            const cacheKey = `movie_${movieId}`;
            let enrichedData = null;
            
            // Check cache first
            if (this.movieCache.has(cacheKey)) {
              enrichedData = this.movieCache.get(cacheKey);
            } else {
              // Fetch from TMDB
              enrichedData = await this.fetchMovieFromTMDB(movieId);
              if (enrichedData) {
                this.movieCache.set(cacheKey, enrichedData);
                await this.saveMovieCache();
              }
            }
            
            if (enrichedData) {
              return { ...movie, ...enrichedData };
            }
          }
        }
        
        return movie;
      })
    );
    
    return enriched;
  }
}

export default new BackendService();
