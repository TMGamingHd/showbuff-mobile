# ShowBuff Mobile App - Debug Testing Protocol

## 🔍 **SYSTEMATIC FEATURE VERIFICATION**

### **CURRENT STATUS**
- ✅ Backend server running with debug logging
- ✅ Friend request saved to database (confirmed via SQL query)
- ❌ Friend request not appearing in demo account UI
- ⚠️ Need to test all other features systematically

---

## 🧪 **TESTING PROTOCOL - STEP BY STEP**

### **STEP 1: Friend Request Debug Test**
**Objective**: Fix friend request loading for demo account

**Test Actions**:
1. Log into demo account
2. Check Friends tab for pending requests
3. Monitor backend logs for friend request loading
4. Verify API call reaches backend with correct user ID

**Expected Backend Logs**:
```
Loading friend requests for user: 1
Friend requests found: 1 [request data]
```

**If No Logs**: Frontend not calling backend API
**If Empty Results**: SQL query or database issue
**If Correct Results**: Frontend display issue

---

### **STEP 2: Authentication Verification**
**Objective**: Ensure all accounts authenticate correctly

**Test Matrix**:
- [ ] Tony account login → Correct user data (ID: 32)
- [ ] Demo account login → Correct user data (ID: 1)  
- [ ] New account registration → New user created
- [ ] Logout → Session cleared properly

**Debug Points**:
- Token storage and retrieval
- User ID consistency
- Backend authentication verification

---

### **STEP 3: Cross-Account Feature Testing**
**Objective**: Verify features work between different accounts

**Test Scenarios**:
1. **Friend Request Flow**:
   - Tony → Demo: Send request
   - Demo: See pending request
   - Demo: Accept request
   - Both: See each other as friends

2. **Movie Sharing**:
   - Add movie to list
   - Share with friend
   - Friend receives notification

3. **Chat System**:
   - Send message between accounts
   - Verify real-time delivery
   - Check message persistence

---

### **STEP 4: Data Persistence Testing**
**Objective**: Ensure all data saves to backend correctly

**Test Categories**:
- [ ] Movie lists (watchlist, currently watching, watched)
- [ ] Reviews and ratings
- [ ] Friend relationships
- [ ] Chat messages
- [ ] User profile data

**Verification Method**:
- Perform action in app
- Check backend logs
- Query database directly
- Restart app and verify data persists

---

## 🔧 **DEBUGGING TOOLS IMPLEMENTED**

### **Backend Logging**
- ✅ Friend request endpoint logging
- ✅ Friend request database query logging
- ✅ Authentication token verification
- [ ] All API endpoint request/response logging
- [ ] Database query logging for all operations

### **Frontend Debugging**
- [ ] API request/response logging
- [ ] State management debugging
- [ ] Error boundary implementation
- [ ] Real-time update verification

---

## 🚨 **IMMEDIATE PRIORITY FIXES**

### **1. Friend Request Loading Issue**
**Problem**: Friend request exists in database but not showing in demo account
**Debug Steps**:
1. Check if frontend calls `/api/friends/requests` for demo account
2. Verify authentication token is sent correctly
3. Check if response data is processed correctly
4. Verify UI updates with received data

### **2. Data Sync Verification**
**Problem**: Need to verify all features persist data correctly
**Debug Steps**:
1. Add comprehensive logging to all backend endpoints
2. Test each CRUD operation individually
3. Verify real-time updates between accounts
4. Check database integrity after each operation

---

## 📋 **TESTING CHECKLIST**

### **Authentication System**
- [ ] Login with existing account
- [ ] Register new account  
- [ ] Demo account access
- [ ] Logout functionality
- [ ] Token persistence
- [ ] Session management

### **Friend System**
- [ ] User search
- [ ] Send friend request
- [ ] Receive friend request notification
- [ ] Accept friend request
- [ ] Reject friend request
- [ ] View friends list
- [ ] Remove friend

### **Movie Management**
- [ ] Search movies (TMDB)
- [ ] Add to watchlist
- [ ] Add to currently watching
- [ ] Mark as watched
- [ ] Remove from lists
- [ ] Move between lists
- [ ] Add reviews/ratings
- [ ] View movie details

### **Social Features**
- [ ] View friend's profile
- [ ] See friend's movie lists
- [ ] Chat with friends
- [ ] Share movie recommendations
- [ ] View activity feed
- [ ] Real-time notifications

---

## 🎯 **SUCCESS CRITERIA**

**Each feature must pass ALL tests**:
1. ✅ **UI Functionality**: Works correctly in the app interface
2. ✅ **Backend Integration**: API calls reach backend successfully
3. ✅ **Data Persistence**: Changes saved to database
4. ✅ **Cross-Account Sync**: Updates visible to other users
5. ✅ **Real-time Updates**: Immediate UI updates
6. ✅ **Error Handling**: Graceful failure and recovery

**Ready for production when**:
- All features pass comprehensive testing
- No data loss or corruption
- Reliable cross-user functionality
- Robust error handling and recovery
