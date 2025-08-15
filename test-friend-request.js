// Test script for friend request functionality
const fetch = require('node-fetch').default;

async function testFriendRequest() {
  console.log('=== TESTING FRIEND REQUEST FUNCTIONALITY ===');
  
  // Step 1: Login to get auth token
  console.log('\n1. Logging in to get auth token...');
  const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testuser4@example.com', password: 'test4' })
  });
  
  const loginData = await loginResponse.json();
  console.log('Login response:', loginData);
  
  if (!loginData.token) {
    console.error('Login failed, no token received');
    return;
  }
  
  const token = loginData.token;
  console.log('Token received:', token);
  
  // Step 2: Get user list to find a user to send request to
  console.log('\n2. Getting user list...');
  const usersResponse = await fetch('http://localhost:3001/api/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const users = await usersResponse.json();
  console.log('Users:', users);
  
  // Find a user that is not the logged in user
  const currentUserId = loginData.user.id;
  const targetUser = users.find(user => user.id !== currentUserId);
  
  if (!targetUser) {
    console.error('No other users found to send friend request to');
    return;
  }
  
  console.log('Target user for friend request:', targetUser);
  
  // Step 3: Send friend request
  console.log('\n3. Sending friend request...');
  const requestResponse = await fetch('http://localhost:3001/api/friends/request', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ userId: targetUser.id })
  });
  
  const requestData = await requestResponse.json();
  console.log('Friend request response:', requestData);
  
  // Step 4: Verify friend request was saved
  console.log('\n4. Verifying friend request was saved...');
  const verifyResponse = await fetch('http://localhost:3001/api/friends/requests', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const verifyData = await verifyResponse.json();
  console.log('Friend requests:', verifyData);
  
  console.log('\n=== TEST COMPLETED ===');
}

testFriendRequest().catch(err => {
  console.error('Test failed with error:', err);
});
