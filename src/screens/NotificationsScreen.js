import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';

const NotificationsScreen = ({ navigation }) => {
  const { 
    friends, 
    friendRequests,
    unreadMessageCount, 
    unreadMessageCounts, 
    loadNotifications,
    markMessagesAsRead,
    acceptFriendRequest,
    rejectFriendRequest,
    totalUnreadNotifications
  } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'messages', 'requests'
  // Restored notification screen state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadNotificationData();
  }, []);

  // Reload notifications when friendRequests or friends data changes
  useEffect(() => {
    console.log('NotificationsScreen: AppContext data changed, updating notifications');
    console.log('Friend requests:', friendRequests?.length || 0);
    console.log('Friends:', friends?.length || 0);
    loadNotificationData();
  }, [friendRequests, friends, unreadMessageCounts]);

  const loadNotificationData = async () => {
    if (loading) return; // Prevent multiple simultaneous loads
    
    setLoading(true);
    try {
      // Don't call loadNotifications here as it's already called by useEffect
      // Just use the current state from AppContext
      
      // Create notification items from friend requests
      const friendRequestItems = (friendRequests || []).map(request => ({
        id: `friend_request_${request.id}`,
        type: 'friend_request',
        requestId: request.id,
        friendUsername: request.senderUsername || request.username,
        friendEmail: request.senderEmail || request.email,
        timestamp: new Date(request.createdAt || request.created_at || Date.now()),
        title: 'Friend Request',
        message: `${request.senderUsername || request.username} wants to be friends`,
      }));
      
      // Create notification items from unread message counts
      const messageItems = friends
        .filter(friend => unreadMessageCounts[friend.id] > 0)
        .map(friend => ({
          id: `unread_${friend.id}`,
          type: 'unread_messages',
          friendId: friend.id,
          friendUsername: friend.username,
          friendEmail: friend.email,
          count: unreadMessageCounts[friend.id],
          timestamp: new Date(), // Could be enhanced with actual timestamp
          title: `New message${unreadMessageCounts[friend.id] > 1 ? 's' : ''}`,
          message: `${unreadMessageCounts[friend.id]} unread message${unreadMessageCounts[friend.id] > 1 ? 's' : ''} from ${friend.username}`,
        }));
      
      // Combine and sort by timestamp (newest first)
      const allNotifications = [...friendRequestItems, ...messageItems].sort((a, b) => b.timestamp - a.timestamp);
      
      setNotifications(allNotifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh AppContext data first, then local notifications will update via useEffect
    await loadNotifications();
    setRefreshing(false);
  };

  const handleNotificationPress = async (notification) => {
    if (notification.type === 'unread_messages') {
      // Mark messages as read
      await markMessagesAsRead(notification.friendId);
      
      // Navigate to chat with that friend
      const friend = friends.find(f => f.id === notification.friendId);
      if (friend) {
        navigation.navigate('Chat', { friend });
      }
      
      // Refresh notifications
      await loadNotificationData();
    }
  };

  const handleAcceptFriendRequest = async (requestId) => {
    console.log('=== NOTIFICATIONS SCREEN ACCEPT FRIEND REQUEST ===');
    console.log('Request ID:', requestId);
    
    // Make API call first
    const result = await acceptFriendRequest(requestId);
    console.log('Accept result:', result);
    
    if (!result.success) {
      Alert.alert('Error', result.error || 'Failed to accept friend request');
    } else {
      Alert.alert('Success', 'Friend request accepted!');
    }
    
    // Don't manually update local state - let useEffect handle it via AppContext updates
  };

  const handleRejectFriendRequest = async (requestId) => {
    console.log('=== NOTIFICATIONS SCREEN REJECT FRIEND REQUEST ===');
    console.log('Request ID:', requestId);
    
    // Make API call first
    const result = await rejectFriendRequest(requestId);
    console.log('Reject result:', result);
    
    if (!result.success) {
      Alert.alert('Error', result.error || 'Failed to reject friend request');
    } else {
      Alert.alert('Success', 'Friend request rejected');
    }
    
    // Don't manually update local state - let useEffect handle it via AppContext updates
  };

  const getFilteredNotifications = () => {
    switch (activeTab) {
      case 'messages':
        return notifications.filter(item => item.type === 'unread_messages');
      case 'requests':
        return notifications.filter(item => item.type === 'friend_request');
      case 'all':
      default:
        return notifications;
    }
  };

  const getTabCounts = () => {
    const messages = notifications.filter(item => item.type === 'unread_messages').length;
    const requests = notifications.filter(item => item.type === 'friend_request').length;
    return { messages, requests };
  };

  const filteredNotifications = getFilteredNotifications();
  const { messages: messageCount, requests: requestCount } = getTabCounts();

  const renderTabButton = (tab, title, icon, badgeCount = 0) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.activeTab]}
      onPress={() => setActiveTab(tab)}
    >
      <Ionicons
        name={icon}
        size={20}
        color={activeTab === tab ? '#3B82F6' : '#6B7280'}
      />
      <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
        {title}
      </Text>
      {badgeCount > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const formatTimeAgo = (timestamp) => {
    try {
      const t = new Date(timestamp);
      const diffMs = Date.now() - t.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      if (Number.isNaN(hours) || hours < 1) return 'Just now';
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    } catch (e) {
      return 'Just now';
    }
  };

  const renderNotificationItem = ({ item }) => (
    item.type === 'friend_request' ? (
      <View style={styles.notificationItem}>
        <View style={styles.notificationIcon}>
          <Ionicons 
            name={item.type === 'unread_messages' ? 'chatbubble' : item.type === 'friend_request' ? 'person-add' : 'notifications'} 
            size={24} 
            color="#FFFFFF" 
          />
        </View>
        
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <Text style={styles.notificationTime}>
              {formatTimeAgo(item.timestamp)}
            </Text>
          </View>
          
          <Text style={styles.notificationMessage}>{item.message}</Text>
          
          {item.count > 1 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{item.count}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.friendRequestActions}>
          <TouchableOpacity 
            style={styles.acceptButton}
            onPress={() => handleAcceptFriendRequest(item.requestId)}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.rejectButton}
            onPress={() => handleRejectFriendRequest(item.requestId)}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    ) : (
      <TouchableOpacity
        style={styles.notificationItem}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.notificationIcon}>
          <Ionicons 
            name={item.type === 'unread_messages' ? 'chatbubble' : item.type === 'friend_request' ? 'person-add' : 'notifications'} 
            size={24} 
            color="#FFFFFF" 
          />
        </View>
        
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <Text style={styles.notificationTime}>
              {formatTimeAgo(item.timestamp)}
            </Text>
          </View>
          
          <Text style={styles.notificationMessage}>{item.message}</Text>
          
          {item.count > 1 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{item.count}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.actionButton}>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
    )
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-outline" size={72} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No new notifications</Text>
      <Text style={styles.emptySubtitle}>
        Please check back later for updates from your friends.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.title}>Notifications</Text>
          {totalUnreadNotifications > 0 && (
            <Text style={styles.subtitle}>
              {totalUnreadNotifications} notification{totalUnreadNotifications > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton('all', 'All', 'notifications', totalUnreadNotifications)}
        {renderTabButton('messages', 'Messages', 'chatbubble', messageCount)}
        {renderTabButton('requests', 'Requests', 'person-add', requestCount)}
      </View>

      {/* Notifications List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
            />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  listContainer: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  notificationContent: {
    flex: 1,
    position: 'relative',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  notificationTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  countBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  friendRequestActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rejectButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    padding: 8,
  },

  // Empty state styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },

  // Tab Navigation Styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default NotificationsScreen;
