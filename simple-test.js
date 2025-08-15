// Simple test script for friend request functionality
const fetch = require('node-fetch');

// Force console output to be synchronous
process.stdout.isTTY = true;
console.log = function() {
  process.stdout.write(require('util').format.apply(this, arguments) + '\n');
};

async function testFriendRequest() {
  console.log('=== TESTING FRIEND REQUEST FUNCTIONALITY ===');
  
  try {
    // Step 1: Login to get auth token
    console.log('\n1. Logging in to get auth token...');
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@showbuff.com', password: 'demo123' })
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed with status: ${loginResponse.status}`);
    }
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
    if (!loginData.token) {
      throw new Error('Login failed, no token received');
    }
    
    const token = loginData.token;
    console.log('Token received:', token);
    
    // Step 2: Get user list to find a user to send request to
    console.log('\n2. Getting user list...');
    const usersResponse = await fetch('http://localhost:3001/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!usersResponse.ok) {
      throw new Error(`Get users failed with status: ${usersResponse.status}`);
    }
    
    const users = await usersResponse.json();
    console.log('Users:', users);
    
    // Find a user that is not the logged in user
    const currentUserId = loginData.user.id;
    const targetUser = users.find(user => user.id !== currentUserId);
    
    if (!targetUser) {
      throw new Error('No other users found to send friend request to');
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
    
    if (!requestResponse.ok) {
      throw new Error(`Send friend request failed with status: ${requestResponse.status}`);
    }
    
    const requestData = await requestResponse.json();
    console.log('Friend request response:', requestData);
    
    // Step 4: Verify friend request was saved
    console.log('\n4. Verifying friend request was saved...');
    const verifyResponse = await fetch('http://localhost:3001/api/friends/requests', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!verifyResponse.ok) {
      throw new Error(`Get friend requests failed with status: ${verifyResponse.status}`);
    }
    
    const verifyData = await verifyResponse.json();
    console.log('Friend requests:', verifyData);
    
    console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testFriendRequest();
