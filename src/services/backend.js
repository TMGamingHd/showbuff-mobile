// Backend service for ShowBuff mobile app
// Connects to the existing ShowBuff backend server
import { Platform } from 'react-native';
import Constants from 'expo-constants';

class BackendService {
  constructor() {
    // Get environment variables from Expo Constants (support both new and legacy fields)
    const env = (Constants.expoConfig?.extra) || (Constants.manifest?.extra) || {};
    
    const isAndroid = Platform.OS === 'android';
    // More reliable physical device detection
    const isPhysicalDevice = Constants.isDevice === true;
    
    // Use deployed backend for production, local for development
    const PRODUCTION_BACKEND_URL = 'https://showbuff-production.up.railway.app/api';
    
    // Force production backend for now (environment variables not loading correctly)
    this.baseURL = PRODUCTION_BACKEND_URL;
    
    // Debug environment variables
    console.log('Environment variables:', env);
    console.log('USE_PRODUCTION_BACKEND:', env.USE_PRODUCTION_BACKEND);
    
    console.log(`BackendService initialized with baseURL: ${this.baseURL}`);
    console.log('Platform:', Platform.OS);
    console.log('Is Physical Device:', isPhysicalDevice);
    console.log('Constants.isDevice:', Constants.isDevice);
    console.log('Constants.appOwnership:', Constants.appOwnership);
    console.log('Constants.executionEnvironment:', Constants.executionEnvironment);
    console.log('Constants.platform:', Constants.platform);
    console.log('Environment variables available:', Object.keys(env).join(', '));
    
    // Remove old fallback logic that was overriding the production URL
    console.log('FINAL baseURL being used:', this.baseURL);
    
    this.token = null;
    this.demoMode = false;
    // Initialize with network timeout for requests from environment or default
    this.timeout = env.API_TIMEOUT ? parseInt(env.API_TIMEOUT) : 10000; // Default 10 seconds timeout
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
    console.log(`Full URL: ${url}`);
    
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {}),
      },
    };

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
    return await this.makeRequest(`/api/user/${userId}/activity`);
  }

  async getFriendsActivity() {
    return await this.makeRequest('/api/user/activity');
  }

  // Alias used by AppContext
  async getActivity() {
    return await this.getFriendsActivity();
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
              id: (typeof tmdbId !== 'undefined' ? tmdbId : (row.tmdb_id || undefined)) ?? row.movie_id ?? undefined,
              title: title,
              name: title,
              // Prefer joined show's poster_path
              poster_path: row.show_poster_path || row.poster_path || row.movie_poster || null,
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
}

export default new BackendService();
