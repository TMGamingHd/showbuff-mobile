import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';

const NotificationsScreen = ({ navigation }) => {
  const { 
    friends, 
    unreadMessageCount, 
    unreadMessageCounts, 
    loadNotifications,
    markMessagesAsRead 
  } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadNotificationData();
  }, []);

  const loadNotificationData = async () => {
    setLoading(true);
    try {
      await loadNotifications();
      
      // Create notification items from unread message counts
      const notificationItems = friends
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
      
      setNotifications(notificationItems);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotificationData();
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

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const diffInHours = (now - timestamp) / (1000 * 60 * 60);
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  const renderNotificationItem = ({ item }) => (
    <TouchableOpacity
      style={styles.notificationItem}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationIcon}>
        <Ionicons 
          name={item.type === 'unread_messages' ? 'chatbubble' : 'notifications'} 
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
      
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>All caught up!</Text>
      <Text style={styles.emptySubtitle}>
        You have no new notifications. Check back later for updates from your friends.
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
          {unreadMessageCount > 0 && (
            <Text style={styles.subtitle}>
              {unreadMessageCount} unread message{unreadMessageCount > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>

      {/* Notifications List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
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
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default NotificationsScreen;
