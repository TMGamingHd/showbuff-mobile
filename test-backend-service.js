// Test script for BackendService
const { BackendService } = require('./src/services/backend');

async function testBackendService() {
  console.log('=== TESTING BACKEND SERVICE ===');
  
  // Create a new instance of BackendService
  const backendService = new BackendService({
    baseUrl: 'http://localhost:3001',
    timeout: 10000
  });
  
  try {
    // Step 1: Login to get auth token
    console.log('\n1. Logging in...');
    const loginResult = await backendService.login('demo@showbuff.com', 'demo123');
    console.log('Login result:', loginResult);
    
    if (!loginResult || !loginResult.token) {
      console.error('Login failed, no token received');
      return;
    }
    
    // Set the token for subsequent requests
    backendService.setToken(loginResult.token);
    console.log('Token set:', loginResult.token);
    
    // Step 2: Get user list
    console.log('\n2. Getting user list...');
    const users = await backendService.searchUsers('');
    console.log('Users:', users);
    
    if (!users || users.length === 0) {
      console.error('No users found');
      return;
    }
    
    // Find a user that is not the logged in user
    const currentUserId = loginResult.user.id;
    const targetUser = users.find(user => user.id !== currentUserId);
    
    if (!targetUser) {
      console.error('No other users found to send friend request to');
      return;
    }
    
    console.log('Target user for friend request:', targetUser);
    
    // Step 3: Send friend request
    console.log('\n3. Sending friend request...');
    const requestResult = await backendService.sendFriendRequest(targetUser.id);
    console.log('Friend request result:', requestResult);
    
    // Step 4: Get pending friend requests
    console.log('\n4. Getting pending friend requests...');
    const pendingRequests = await backendService.getPendingFriendRequests();
    console.log('Pending friend requests:', pendingRequests);
    
    console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testBackendService();
