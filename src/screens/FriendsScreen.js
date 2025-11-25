import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FriendsScreen = ({ navigation }) => {
  const { 
    friends, 
    friendRequests, 
    sendFriendRequest, 
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    searchUsers,
    refreshData,
    loading,
    refreshing 
  } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Unified search state: searches both existing friends (locally) and all users (via backend)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.length > 2) {
      handleUserSearch();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleUserSearch = async () => {
    try {
      setSearchLoading(true);
      const results = await searchUsers(searchQuery);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendFriendRequest = async (userId) => {
    const result = await sendFriendRequest(userId);
    if (result.success) {
      Alert.alert('Success', result.message);
      refreshData(); // Refresh to show updated friend requests
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    console.log('=== FRIENDS SCREEN ACCEPT REQUEST V2 ===');
    console.log('Request ID:', requestId);
    console.log('acceptFriendRequest function type:', typeof acceptFriendRequest);
    console.log('acceptFriendRequest value:', acceptFriendRequest);
    
    if (!acceptFriendRequest) {
      console.error('ERROR: acceptFriendRequest is undefined!');
      Alert.alert('Error', 'Accept function not available');
      return;
    }
    
    try {
      console.log('CALLING acceptFriendRequest now...');
      const result = await acceptFriendRequest(requestId);
      console.log('RESULT from acceptFriendRequest:', result);
      
      if (result && result.success) {
        Alert.alert('Success', 'Friend request accepted!');
      } else {
        Alert.alert('Error', result?.error || 'Failed to accept friend request');
      }
    } catch (error) {
      console.error('CAUGHT ERROR in handleAcceptRequest:', error);
      console.error('Error stack:', error.stack);
      Alert.alert('Error', 'Failed to accept friend request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    const result = await rejectFriendRequest(requestId);
    if (result.success) {
      Alert.alert('Success', 'Friend request rejected');
      // No need to call refreshData since rejectFriendRequest already updates state
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const openChat = (friend) => {
    navigation.navigate('Chat', { friend });
  };

  const handleRemoveFriend = (friend) => {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.username} from your friends list?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(friend.id);
              Alert.alert('Success', `${friend.username} has been removed from your friends list.`);
            } catch (error) {
              console.error('Error removing friend:', error);
              Alert.alert('Error', 'Failed to remove friend. Please try again.');
            }
          },
        },
      ]
    );
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();

  // Friends filtered locally by search query (used for both default view and search view)
  const filteredFriends = (friends || []).filter((friend) => {
    if (!normalizedSearch) return true;
    const name = (friend.username || '').toLowerCase();
    const email = (friend.email || '').toLowerCase();
    return name.includes(normalizedSearch) || email.includes(normalizedSearch);
  });

  const renderFriendItem = (friend) => (
    <View key={friend.id} style={styles.friendItem}>
      <View style={styles.friendInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(friend.username || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.friendDetails}>
          <Text style={styles.friendName}>{friend.username}</Text>
          <Text style={styles.friendEmail}>{friend.email}</Text>
          {friend.lastActivity && (
            <Text style={styles.lastActivity}>
              Last active: {new Date(friend.lastActivity).toLocaleDateString()}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.friendActions}>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate('FriendProfile', { friend })}
        >
          <Ionicons name="person-outline" size={20} color="#3B82F6" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.messageButton}
          onPress={() => openChat(friend)}
        >
          <Ionicons name="chatbubble-outline" size={20} color="#3B82F6" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeFriendButton}
          onPress={() => handleRemoveFriend(friend)}
        >
          <Ionicons name="person-remove-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFriendRequest = (request) => {
    const sender = request?.sender || {};
    const senderUsername = request?.senderUsername || request?.username || sender?.username || 'User';
    const senderEmail = request?.senderEmail || request?.email || sender?.email || '';
    const createdAt = request?.createdAt || request?.created_at || request?.created || null;

    const initial = (senderUsername || senderEmail || 'U').charAt(0).toUpperCase();

    return (
      <View key={request.id} style={styles.requestItem}>
        <View style={styles.friendInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{senderUsername}</Text>
            {!!senderEmail && <Text style={styles.friendEmail}>{senderEmail}</Text>}
            {!!createdAt && (
              <Text style={styles.requestDate}>
                {new Date(createdAt).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptRequest(request.id)}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => handleRejectRequest(request.id)}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchResult = (searchUser) => {
    // Don't show own profile in search results
    if (searchUser.id === user?.id) {
      return null;
    }
    
    // Check relationship status
    const isAlreadyFriend = friends.some(friend => friend.id === searchUser.id);
    const hasPendingRequest = friendRequests.some(req => 
      req.fromUserId === searchUser.id || req.toUserId === searchUser.id
    );
    
    // Don't show existing friends in search results
    if (isAlreadyFriend) {
      return null;
    }
    
    return (
      <View key={searchUser.id} style={styles.searchResultItem}>
        <View style={styles.friendInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(searchUser.username || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{searchUser.username}</Text>
            <Text style={styles.friendEmail}>{searchUser.email}</Text>
            {hasPendingRequest && (
              <Text style={styles.pendingText}>Friend request pending</Text>
            )}
          </View>
        </View>
        
        {hasPendingRequest ? (
          <View style={styles.pendingButton}>
            <Ionicons name="hourglass-outline" size={20} color="#F59E0B" />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleSendFriendRequest(searchUser.id)}
          >
            <Ionicons name="person-add-outline" size={20} color="#3B82F6" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets?.top || 0) + 12 }]}>
        <Text style={styles.headerTitle}>Friends</Text>
      </View>
      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} />
        }
      >
        {/* Unified search bar for friends + users */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends and users by username or email..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Friend Requests section (always on this screen) */}
        {(friendRequests || []).length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="mail-outline" size={18} color="#6B7280" />
              <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#4B5563' }}>
                Friend Requests ({(friendRequests || []).length})
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color="#3B82F6" style={styles.loader} />
            ) : (
              (friendRequests || []).map(renderFriendRequest)
            )}
          </View>
        )}

        {/* Friends list / Search results (single unified view) */}
        {normalizedSearch.length <= 2 ? (
          // Default view: just show all friends when not searching
          <View>
            {loading ? (
              <ActivityIndicator size="large" color="#3B82F6" style={styles.loader} />
            ) : (filteredFriends || []).length > 0 ? (
              filteredFriends.map(renderFriendItem)
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Friends Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Search for users to add as friends
                </Text>
              </View>
            )}
          </View>
        ) : (
          // Search view: combined results (matching friends + other users)
          <View>
            {/* Matching friends first */}
            {(filteredFriends || []).length > 0 && (
              <View style={{ marginBottom: 8 }}>
                {filteredFriends.map(renderFriendItem)}
              </View>
            )}

            {/* Backend user search results */}
            {searchLoading ? (
              <ActivityIndicator size="large" color="#3B82F6" style={styles.loader} />
            ) : searchResults.length > 0 ? (
              searchResults.map(renderSearchResult)
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Users Found</Text>
                <Text style={styles.emptySubtitle}>
                  Try a different search term
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    position: 'relative',
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginVertical: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  friendDetails: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  lastActivity: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  requestDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  messageButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  removeFriendButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  requestActions: {
    flexDirection: 'row',
  },
  acceptButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rejectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingText: {
    fontSize: 12,
    color: '#F59E0B',
    fontStyle: 'italic',
    marginTop: 2,
  },
  addButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 15,
    marginBottom: 5,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loader: {
    marginVertical: 40,
  },
});

export default FriendsScreen;
