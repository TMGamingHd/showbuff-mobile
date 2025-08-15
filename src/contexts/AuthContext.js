import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackendService from '../services/backend';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for stored authentication on app start
  useEffect(() => {
    checkStoredAuth();
  }, []);

  const checkStoredAuth = async () => {
    try {
      console.log('Starting authentication check...');
      
      // Always set a safety timeout to prevent getting stuck on loading screen
      const safetyTimer = setTimeout(() => {
        console.log('Safety timeout triggered - forcing authentication check completion');
        setLoading(false);
        setUser(null);
        setIsAuthenticated(false);
      }, 5000); // 5 second safety timeout
      
      // Check for stored user and token
      const storedUser = await AsyncStorage.getItem('user');
      const storedToken = await AsyncStorage.getItem('authToken');
      
      console.log('Checking stored authentication...');
      console.log('Stored token exists:', storedToken ? 'YES' : 'NO');
      console.log('Stored user exists:', storedUser ? 'YES' : 'NO');
      
      // Default to unauthenticated state
      let authState = false;
      let userData = null;
      
      if (storedUser && storedToken) {
        // Set token in backend service for authenticated requests
        BackendService.setToken(storedToken);
        
        try {
          // Parse user data
          userData = JSON.parse(storedUser);
          console.log('User data parsed successfully');
          
          // Skip backend verification for now - just use the stored credentials
          // This ensures the app doesn't get stuck on loading screen
          authState = true;
          console.log('Authentication restored for user:', userData.username);
        } catch (parseError) {
          console.error('Failed to parse stored user data:', parseError);
          // Clear corrupted data
          await AsyncStorage.multiRemove(['user', 'authToken']);
          BackendService.clearToken();
        }
      } else {
        console.log('No stored authentication found');
      }
      
      // Update state
      setUser(userData);
      setIsAuthenticated(authState);
      
      // Clear the safety timer since we completed normally
      clearTimeout(safetyTimer);
    } catch (error) {
      console.error('Error checking stored auth:', error);
      // On error, clear potentially corrupted data
      await AsyncStorage.multiRemove(['user', 'authToken']);
      BackendService.clearToken();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      // Always set loading to false to prevent app from getting stuck
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      
      console.log('=== AUTHCONTEXT LOGIN START ===');
      console.log('Email:', email);
      console.log('Password length:', password.length);
      console.log('Current user before login:', user);
      
      // Set a safety timeout to prevent getting stuck on loading screen
      const loginTimer = setTimeout(() => {
        console.log('Login safety timeout triggered');
        setLoading(false);
      }, 10000); // 10 second safety timeout
      
      // Create a promise that will race with the login request
      const loginPromise = BackendService.login(email, password);
      
      // Wait for the login response or timeout
      const response = await loginPromise;
      
      // Clear the safety timer since we got a response
      clearTimeout(loginTimer);
      
      console.log('=== BACKEND SERVICE RESPONSE ===');
      console.log('Response:', response);
      console.log('Response.success:', response.success);
      console.log('Response.user:', response.user);
      console.log('Response.token:', response.token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
      
      // Check for network errors first
      if (response.isNetworkError) {
        console.error('=== LOGIN NETWORK ERROR ===');
        console.error('Network error details:', response.error);
        return { 
          success: false, 
          error: 'Cannot connect to the server. Please check your internet connection and try again.',
          isNetworkError: true
        };
      }
      
      // Check for timeout errors
      if (response.isTimeout) {
        console.error('=== LOGIN TIMEOUT ERROR ===');
        return { 
          success: false, 
          error: 'Server is taking too long to respond. Please try again later.',
          isTimeout: true
        };
      }
      
      if (response.success && response.user) {
        const userData = response.user;
        const token = response.token;
        
        console.log('=== LOGIN SUCCESS - SETTING USER DATA ===');
        console.log('User data to set:', userData);
        console.log('Token to set:', token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
        
        // Set token in backend service for authenticated requests
        BackendService.setToken(token);
        
        // Store user data and token
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        await AsyncStorage.setItem('authToken', token);
        
        setUser(userData);
        setIsAuthenticated(true);
        
        console.log('=== LOGIN COMPLETE - USER SET ===');
        console.log('Final user state:', userData);
        
        return { success: true, user: userData };
      } else {
        console.log('=== LOGIN FAILED - BACKEND RESPONSE INVALID ===');
        console.log('Response success:', response.success);
        console.log('Response user:', response.user);
        console.log('Response error:', response.error);
        
        // Handle specific error cases
        if (response.error && response.error.includes('Invalid credentials')) {
          return { 
            success: false, 
            error: 'Invalid email or password. Please try again.' 
          };
        }
        
        return { 
          success: false, 
          error: response.error || 'Login failed. Please check your credentials.' 
        };
      }
    } catch (error) {
      console.error('=== LOGIN ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      return { 
        success: false, 
        error: error.message || 'Login failed. Please check your credentials.' 
      };
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password) => {
    try {
      setLoading(true);
      
      console.log('=== AUTHCONTEXT REGISTER START ===');
      console.log('Username:', username);
      console.log('Email:', email);
      console.log('Password length:', password.length);
      
      // Set a safety timeout to prevent getting stuck on loading screen
      const registerTimer = setTimeout(() => {
        console.log('Register safety timeout triggered');
        setLoading(false);
      }, 10000); // 10 second safety timeout
      
      // Create a promise for the register request
      const registerPromise = BackendService.register(username, email, password);
      
      // Wait for the register response
      const response = await registerPromise;
      
      // Clear the safety timer since we got a response
      clearTimeout(registerTimer);
      
      console.log('=== REGISTER RESPONSE ===');
      console.log('Response:', response);
      console.log('Response.success:', response.success);
      console.log('Response.user:', response.user);
      
      // Check for network errors first
      if (response.isNetworkError) {
        console.error('=== REGISTER NETWORK ERROR ===');
        console.error('Network error details:', response.error);
        return { 
          success: false, 
          error: 'Cannot connect to the server. Please check your internet connection and try again.',
          isNetworkError: true
        };
      }
      
      // Check for timeout errors
      if (response.isTimeout) {
        console.error('=== REGISTER TIMEOUT ERROR ===');
        return { 
          success: false, 
          error: 'Server is taking too long to respond. Please try again later.',
          isTimeout: true
        };
      }
      
      // Check for successful registration
      if (response.success && response.user) {
        const userData = response.user;
        const token = response.token;
        
        console.log('=== REGISTER SUCCESS - SETTING USER DATA ===');
        console.log('User data to set:', userData);
        console.log('Token to set:', token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
        
        // Set token in backend service and store user data and token
        BackendService.setToken(token);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        await AsyncStorage.setItem('authToken', token);
        
        setUser(userData);
        setIsAuthenticated(true);
        
        console.log('=== REGISTER COMPLETE - USER SET ===');
        
        return { success: true, user: userData };
      } else {
        console.log('=== REGISTER FAILED - BACKEND RESPONSE INVALID ===');
        console.log('Response error:', response.error);
        
        // Handle specific error cases
        if (response.error && response.error.includes('Email already registered')) {
          return { 
            success: false, 
            error: 'This email is already registered. Please use a different email or try logging in.' 
          };
        }
        
        return { 
          success: false, 
          error: response.error || 'Registration failed. Please try again.' 
        };
      }
    } catch (error) {
      console.error('=== REGISTER ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      return { 
        success: false, 
        error: error.message || 'Registration failed. Please try again.' 
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      
      // Call backend logout
      try {
        await BackendService.logout();
      } catch (error) {
        console.log('Backend logout failed, continuing with local logout');
      }
      
      // Clear backend service token
      BackendService.clearToken();
      
      // Clear stored data
      await AsyncStorage.multiRemove(['user', 'authToken']);
      
      setUser(null);
      setIsAuthenticated(false);
      
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: 'Logout failed' };
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profileData) => {
    try {
      if (!user) throw new Error('No user logged in');
      
      const response = await BackendService.updateUserProfile(user.id, profileData);
      
      if (response.success) {
        const updatedUser = { ...user, ...profileData };
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        return { success: true, user: updatedUser };
      } else {
        throw new Error(response.message || 'Profile update failed');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      return { 
        success: false, 
        error: error.message || 'Profile update failed' 
      };
    }
  };

  const refreshUserData = async () => {
    try {
      if (!user) return;
      
      const profile = await BackendService.getUserProfile(user.id);
      const updatedUser = { ...user, ...profile };
      
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      return updatedUser;
    } catch (error) {
      console.error('Error refreshing user data:', error);
      return user;
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    signOut: logout, // Alias for logout function
    updateProfile,
    refreshUserData,
    // Helper functions
    userId: user?.id || null,
    username: user?.username || 'User',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
