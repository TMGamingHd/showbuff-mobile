import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import TMDBService from '../services/tmdb';
import { dbToClient, listLabel } from '../utils/lists';
import { showToast } from '../utils/toast';
import { showMoveDialog } from '../utils/moveDialog';

const SocialFeedScreen = ({ navigation }) => {
  const { friends, activity, refreshData, addToList, moveToList, isInList, unreadMessageCount, loadNotifications } = useApp();
  const { user } = useAuth();
  const [socialFeed, setSocialFeed] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const loadSocialFeed = async () => {
    try {
      setLoading(true);
      
      // Load trending movies without calling refreshData to avoid circular dependency
      const trendingData = await TMDBService.getTrending('movie', 'week').catch(() => ({ results: [] }));
      
      // Set trending movies for "Popular This Week" section
      setTrendingMovies((trendingData.results || []).slice(0, 8));
      
      // Build social feed from existing activity data with enhanced formatting
      const feedItems = (activity || []).map(item => ({
        ...item,
        type: 'activity',
        timestamp: new Date(item.createdAt || Date.now() - Math.random() * 86400000), // Random within last day for demo
        userName: item.userName || `Friend ${Math.floor(Math.random() * 100)}`,
        userAvatar: item.userAvatar || null,
        reactions: item.reactions || Math.floor(Math.random() * 12),
        comments: item.comments || Math.floor(Math.random() * 5),
      }));
      
      // Add some demo social activity if none exists
      if (feedItems.length === 0) {
        const demoActivity = [
          {
            id: 'demo1',
            type: 'activity',
            userName: 'Alex Chen',
            content: 'Just watched an incredible thriller! The plot twists had me on the edge of my seat the entire time. Highly recommend! 🍿',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
            action: 'reviewed',
            rating: 9,
            reactions: 8,
            comments: 3,
            movie: {
              id: 550,
              title: 'Fight Club',
              poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
              vote_average: 8.8
            }
          },
          {
            id: 'demo2',
            type: 'activity', 
            userName: 'Sarah Johnson',
            content: 'Finally watched this classic! Now I understand why everyone raves about it. The cinematography is absolutely stunning! 📽️',
            timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
            action: 'added to watched',
            rating: 8,
            reactions: 12,
            comments: 7,
            movie: {
              id: 13,
              title: 'Forrest Gump',
              poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
              vote_average: 8.8
            }
          }
        ];
        feedItems.push(...demoActivity);
      }
      
      setSocialFeed(feedItems.sort((a, b) => b.timestamp - a.timestamp));
      
    } catch (error) {
      console.error('Error loading social feed:', error);
      Alert.alert('Error', 'Failed to load social feed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSocialFeed();
    await loadNotifications(); // Refresh notifications on pull-to-refresh
    setRefreshing(false);
  };

  const handleNotificationPress = () => {
    navigation.navigate('Notifications');
  };

  useEffect(() => {
    loadSocialFeed();
    loadNotifications(); // Load notification counts on screen load
  }, []);

  const handleMoviePress = (movie) => {
    navigation.navigate('MovieDetail', { movie });
  };

  const handleTrendingMovieActions = (movie) => {
    const handleAddWithConflict = async (targetList) => {
      const result = await addToList(movie, targetList);
      if (result.success) {
        showToast(`Added to ${listLabel(targetList)}!`);
        return;
      }
      if (result.status === 409 && result.existingList) {
        const existingClientList = dbToClient(result.existingList);
        if (existingClientList === targetList) {
          showToast(`Already in ${listLabel(targetList)}`);
          return;
        }
        showMoveDialog({
          movie,
          existingList: existingClientList,
          targetList,
          onMove: async () => {
            const moveRes = await moveToList(movie.id, existingClientList, targetList);
            if (moveRes.success) {
              showToast(`Moved to ${listLabel(targetList)}.`);
            } else {
              Alert.alert('Error', moveRes.error || 'Failed to move movie');
            }
          },
        });
        return;
      }
      Alert.alert('Error', result.error || 'Failed to add to list');
    };

    const actions = [
      {
        text: 'Add to Watchlist',
        onPress: async () => {
          if (isInList(movie.id, 'watchlist')) {
            showToast('Already in Watchlist');
            return;
          }
          await handleAddWithConflict('watchlist');
        }
      },
      {
        text: 'Add to Currently Watching',
        onPress: async () => {
          if (isInList(movie.id, 'currently_watching')) {
            showToast('Already in Currently Watching');
            return;
          }
          await handleAddWithConflict('currently_watching');
        }
      },
      {
        text: 'Mark as Watched',
        onPress: async () => {
          if (isInList(movie.id, 'watched')) {
            showToast('Already in Watched');
            return;
          }
          await handleAddWithConflict('watched');
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ];

    Alert.alert(
      movie.title || movie.name,
      `${movie.overview || 'No overview available.'}\n\nRating: ${TMDBService.formatVoteAverage(movie.vote_average)}/10\nRelease: ${TMDBService.getYear(movie.release_date || movie.first_air_date)}`,
      actions
    );
  };

  const handleQuickReview = () => {
    navigation.navigate('ReviewWrite');
  };

  const renderSocialFeedItem = ({ item }) => {
    const timeSince = new Date(Date.now() - new Date(item.timestamp).getTime());
    const hoursAgo = Math.floor(timeSince / (1000 * 60 * 60));
    const timeText = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo/24)}d ago`;
    
    return (
      <View style={styles.socialFeedItem}>
        <View style={styles.feedHeader}>
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{item.userName}</Text>
              <Text style={styles.feedTime}>{timeText}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.reactionBtn}>
            <Ionicons name="heart-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.feedContent}>{item.content}</Text>
        
        {item.movie && (
          <TouchableOpacity style={styles.movieReference} onPress={() => handleMoviePress(item.movie)}>
            <Image 
              source={{ 
                uri: item.movie.poster_path 
                  ? `https://image.tmdb.org/t/p/w200${item.movie.poster_path}`
                  : 'https://via.placeholder.com/60x90?text=No+Image'
              }}
              style={styles.feedMoviePoster}
              resizeMode="cover"
            />
            <View style={styles.movieInfo}>
              <Text style={styles.feedMovieTitle}>{item.movie.title}</Text>
              <View style={styles.movieMetaContainer}>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.rating}>{item.movie.vote_average?.toFixed(1)}</Text>
                </View>
                {item.rating && (
                  <View style={styles.userRating}>
                    <Text style={styles.userRatingText}>★ {item.rating}/10</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
        
        <View style={styles.feedFooter}>
          <TouchableOpacity style={styles.feedAction}>
            <Ionicons name="heart-outline" size={16} color="#6B7280" />
            <Text style={styles.feedActionText}>{item.reactions || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedAction}>
            <Ionicons name="chatbubble-outline" size={16} color="#6B7280" />
            <Text style={styles.feedActionText}>{item.comments || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedAction}>
            <Ionicons name="share-outline" size={16} color="#6B7280" />
            <Text style={styles.feedActionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTrendingMovieItem = ({ item }) => {
    const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
    const isInWatchlist = isInList(item.id, 'watchlist');
    const isInCurrentlyWatching = isInList(item.id, 'currently_watching');
    const isInWatched = isInList(item.id, 'watched');

    return (
      <TouchableOpacity 
        style={styles.trendingMovieCard} 
        onPress={() => handleMoviePress(item)}
        onLongPress={() => handleTrendingMovieActions(item)}
        activeOpacity={0.8}
      >
        <Image 
          source={{ 
            uri: item.poster_path 
              ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
              : 'https://via.placeholder.com/120x180?text=No+Image'
          }}
          style={styles.trendingMoviePoster}
          resizeMode="cover"
        />
        
        {(isInWatchlist || isInCurrentlyWatching || isInWatched) && (
          <View style={styles.statusBadge}>
            <Ionicons 
              name={
                isInWatched ? 'checkmark-circle' :
                isInCurrentlyWatching ? 'play-circle' : 'bookmark'
              }
              size={12} 
              color="#FFFFFF"
            />
          </View>
        )}
        
        <View style={styles.trendingMovieOverlay}>
          <Text style={styles.trendingMovieTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.trendingMovieYear}>{year}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFeedContent = () => {
    const feedData = [];
    
    // Add trending section if we have movies
    if (trendingMovies.length > 0) {
      feedData.push({ type: 'trending_section', data: trendingMovies });
    }
    
    // Add social feed items
    feedData.push(...socialFeed);
    
    return (
      <FlatList
        data={feedData}
        renderItem={({ item }) => {
          if (item.type === 'trending_section') {
            return (
              <View style={styles.trendingSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🔥 Popular This Week</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('PopularMovies')}>
                    <Text style={styles.seeAllText}>See All</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={item.data}
                  renderItem={renderTrendingMovieItem}
                  keyExtractor={(movie) => movie.id.toString()}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.trendingList}
                />
              </View>
            );
          }
          return renderSocialFeedItem({ item });
        }}
        keyExtractor={(item, index) => `${item.type || 'activity'}-${item.id || index}`}
        contentContainerStyle={styles.feedContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Activity Yet</Text>
            <Text style={styles.emptySubtitle}>
              Add friends and start reviewing movies to see their activity here!
            </Text>
            <TouchableOpacity style={styles.addFriendsBtn} onPress={() => navigation.navigate('Friends')}>
              <Text style={styles.addFriendsBtnText}>Find Friends</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>ShowBuff</Text>
            <Text style={styles.subtitle}>Friends' Reviews & Activity</Text>
          </View>
          <TouchableOpacity style={styles.notificationBtn} onPress={handleNotificationPress}>
            <Ionicons name="notifications-outline" size={24} color="#1F2937" />
            {unreadMessageCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading your social feed...</Text>
        </View>
      ) : (
        renderFeedContent()
      )}
      
      {/* Quick Review Floating Action Button */}
      <TouchableOpacity 
        style={styles.quickReviewFAB}
        onPress={handleQuickReview}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  notificationBtn: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  feedContainer: {
    padding: 16,
  },
  
  // Trending Section Styles
  trendingSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  seeAllText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  trendingList: {
    paddingLeft: 4,
  },
  trendingMovieCard: {
    width: 120,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  trendingMoviePoster: {
    width: 120,
    height: 180,
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingMovieOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
  },
  trendingMovieTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  trendingMovieYear: {
    fontSize: 10,
    color: '#E5E7EB',
  },
  
  // Social Feed Item Styles
  socialFeedItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  feedTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reactionBtn: {
    padding: 4,
  },
  feedContent: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  
  // Movie Reference Styles
  movieReference: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  feedMoviePoster: {
    width: 50,
    height: 75,
    borderRadius: 6,
    marginRight: 12,
  },
  movieInfo: {
    flex: 1,
  },
  feedMovieTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  movieMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  rating: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 2,
    fontWeight: '500',
  },
  userRating: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userRatingText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
  },
  
  // Feed Footer Styles
  feedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  feedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  feedActionText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
    fontWeight: '500',
  },
  
  // Empty State Styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  addFriendsBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFriendsBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Quick Review FAB
  quickReviewFAB: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default SocialFeedScreen;
