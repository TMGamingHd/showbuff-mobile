import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  FlatList,
  SectionList,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import TMDBService from '../services/tmdb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FriendSelectionModal from '../components/FriendSelectionModal';
import { showToast } from '../utils/toast';

const ProfileScreen = ({ navigation }) => {
  const { 
    watchlist, 
    currentlyWatching, 
    watched, 
    reviews,
    activity,
    loading,
    error,
    refreshData,
    refreshing,
    hydrateActivityFromCache
  } = useApp();
  const { user, signOut, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState('watchlist'); // 'watchlist', 'watching', 'watched', 'activity'
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ keys: {}, counts: {} });

  const getPerUserKey = (key) => (user?.id ? `${user.id}_${key}` : key);

  const refreshDebugInfo = async () => {
    try {
      const keys = {
        watchlist: getPerUserKey('watchlist'),
        currentlyWatching: getPerUserKey('currentlyWatching'),
        watched: getPerUserKey('watched'),
        reviews: getPerUserKey('reviews'),
        activity: getPerUserKey('activity'),
      };
      const results = await Promise.all(
        Object.values(keys).map((k) => AsyncStorage.getItem(k))
      );
      const counts = {};
      Object.keys(keys).forEach((name, idx) => {
        try {
          const arr = results[idx] ? JSON.parse(results[idx]) : [];
          counts[name] = Array.isArray(arr) ? arr.length : 0;
        } catch (_) {
          counts[name] = 0;
        }
      });
      console.log('[Profile Debug] Keys:', keys, 'Counts:', counts);
      setDebugInfo({ keys, counts });
    } catch (e) {
      console.warn('[Profile Debug] Failed to load debug info:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'activity') {
      refreshDebugInfo();
    }
  }, [activeTab, user?.id]);

  const forceSaveActivity = async () => {
    try {
      const key = getPerUserKey('activity');
      await AsyncStorage.setItem(key, JSON.stringify(activity || []));
      console.log('[Profile Debug] Force-saved activity to', key, 'len=', Array.isArray(activity) ? activity.length : 0);
      await refreshDebugInfo();
    } catch (e) {
      console.warn('[Profile Debug] Force save failed:', e);
    }
  };

  const forceLoadActivity = async () => {
    try {
      const meta = await hydrateActivityFromCache?.();
      console.log('[Profile Debug] Force-loaded activity from cache:', meta);
      await refreshDebugInfo();
    } catch (e) {
      console.warn('[Profile Debug] Force load failed:', e);
    }
  };

  const getActivityIcon = (activityType, action) => {
    if (activityType === 'list') {
      switch (action) {
        case 'added_to_watchlist':
        case 'moved_to_watchlist':
          return 'bookmark';
        case 'added_to_currentlywatching':
        case 'moved_to_currentlywatching':
          return 'play-circle';
        case 'added_to_watched':
        case 'moved_to_watched':
          return 'checkmark-circle';
        default:
          return 'list';
      }
    }
    
    switch (activityType) {
      case 'review':
        return 'star';
      case 'post':
      case 'movie_post':
      case 'text_post':
        // Use a distinct icon for posts instead of generic chat bubble
        return 'create';
      case 'movie_share':
        return 'share';
      default:
        return 'film';
    }
  };

  const getActivityColor = (activityType, action) => {
    if (activityType === 'list') {
      if (action?.includes('watchlist')) {
        return '#3B82F6'; // Blue
      } else if (action?.includes('watching')) {
        return '#10B981'; // Green
      } else if (action?.includes('watched')) {
        return '#8B5CF6'; // Purple
      }
    }
    
    switch (activityType) {
      case 'review':
        return '#F59E0B'; // Amber
      case 'post':
      case 'movie_post':
      case 'text_post':
        return '#EC4899'; // Pink
      case 'movie_share':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray
    }
  };

  const getActivityText = (activityItem) => {
    if (activityItem.type === 'list') {
      switch (activityItem.action) {
        case 'added_to_watchlist':
          return `Added "${activityItem.movieTitle}" to watchlist`;
        case 'moved_to_watchlist':
          return `Moved "${activityItem.movieTitle}" to watchlist`;
        case 'added_to_currentlywatching':
          return `Started watching "${activityItem.movieTitle}"`;
        case 'moved_to_currentlywatching':
          return `Moved "${activityItem.movieTitle}" to currently watching`;
        case 'added_to_watched':
          return `Finished watching "${activityItem.movieTitle}"`;
        case 'moved_to_watched':
          return `Moved "${activityItem.movieTitle}" to watched`;
        case 'removed_from_watchlist':
          return `Removed "${activityItem.movieTitle}" from watchlist`;
        case 'removed_from_currentlywatching':
          return `Removed "${activityItem.movieTitle}" from currently watching`;
        case 'removed_from_watched':
          return `Removed "${activityItem.movieTitle}" from watched`;
        default:
          return `Updated "${activityItem.movieTitle}" in your lists`;
      }
    }
    
    switch (activityItem.type) {
      case 'review':
        return `Reviewed "${activityItem.movieTitle}" with ${activityItem.rating}/10 stars`;
      case 'post':
      case 'movie_post':
      case 'text_post':
        // For movie posts, show a specific label with the movie title
        if (activityItem.movieTitle || activityItem.movieId || activityItem.moviePoster) {
          const title = activityItem.movieTitle || 'a movie';
          return `You made a post about "${title}"`;
        }
        // Fallback for non-movie posts
        return 'You made a post';
      case 'movie_share':
        return `Shared "${activityItem.movieTitle}" with a friend`;
      default:
        return `Performed an action on "${activityItem.movieTitle || 'a movie'}"`;
    }
  };

  const formatActivityTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = (now - date) / (1000 * 60);
    const diffInHours = diffInMinutes / 60;
    const diffInDays = diffInHours / 24;

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${Math.floor(diffInMinutes)}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)}d ago`;
    } else {
      // Format as Month Day, Year (e.g., Aug 14, 2025)
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
  };
  
  // Get the full date string for activity headers
  const getActivityDateString = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
  };

  const renderTabButton = (tab, title, icon, count) => (
    <TouchableOpacity
      key={tab}
      style={[styles.tabButton, activeTab === tab && styles.activeTab]}
      onPress={() => setActiveTab(tab)}
    >
      <Ionicons 
        name={icon} 
        size={18} 
        color={activeTab === tab ? '#3B82F6' : '#6B7280'} 
      />
      <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
        {title}
      </Text>
      {count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderMovieItem = ({ item: movie }) => {
    // Find user review for this movie from reviews array
    const userReview = reviews.find(review => review.movieId === movie.id || review.showId === movie.id);

    return (
      <TouchableOpacity
        style={styles.movieItem}
        onPress={() => {
          setSelectedMovie(movie);
          setActionModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: TMDBService.getImageUrl(movie.poster_path, 'w342') }}
          style={styles.moviePoster}
          resizeMode="cover"
        />
        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {movie.title || movie.name}
          </Text>
          <Text style={styles.movieYear}>
            {TMDBService.getYear(movie.release_date || movie.first_air_date)}
          </Text>
          <View style={styles.movieRating}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={styles.ratingText}>
              {TMDBService.formatVoteAverage(movie.vote_average)}
            </Text>
          </View>
          
          {userReview && (
            <View style={styles.userReviewPreview}>
              <Text style={styles.userRatingText}>
                Your rating: {userReview.rating}/10
              </Text>
              {userReview.comment && (
                <Text style={styles.userCommentPreview} numberOfLines={2}>
                  "{userReview.comment}"
                </Text>
              )}
            </View>
          )}
          
          <Text style={styles.addedDate}>
            Added {movie.dateAdded ? formatActivityTime(movie.dateAdded) : 'recently'}
          </Text>
        </View>
        
        {/* No editing actions on Profile screen per spec */}
      </TouchableOpacity>
    );
  };

  // Group activities by date
  const groupActivitiesByDate = (activities) => {
    // Sort newest first to ensure sections and items are ordered correctly
    const sorted = [...(activities || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const grouped = {};

    sorted.forEach(activity => {
      const dateString = getActivityDateString(activity.createdAt);
      if (!grouped[dateString]) {
        grouped[dateString] = [];
      }
      grouped[dateString].push(activity);
    });

    // Convert to array format for SectionList, preserving insertion order
    return Object.keys(grouped).map(date => ({
      date,
      data: grouped[date]
    }));
  };
  
  const renderActivityItem = ({ item: activityItem }) => (
    <View style={styles.activityItem}>
      <View style={[
        styles.activityIcon,
        { backgroundColor: getActivityColor(activityItem.type, activityItem.action) }
      ]}>
        <Ionicons 
          name={getActivityIcon(activityItem.type, activityItem.action)} 
          size={16} 
          color="#FFFFFF" 
        />
      </View>
      
      <View style={styles.activityContent}>
        <Text style={styles.activityText}>
          {getActivityText(activityItem)}
        </Text>
        <Text style={styles.activityTime}>
          {formatActivityTime(activityItem.createdAt)}
        </Text>
        
        {activityItem.comment && (
          <Text style={styles.activityComment}>
            "{activityItem.comment}"
          </Text>
        )}
      </View>
      
      {activityItem.moviePoster && (
        <TouchableOpacity
          onPress={() => navigation.navigate('MovieDetail', { 
            movie: { 
              id: activityItem.movieId, 
              title: activityItem.movieTitle,
              poster_path: activityItem.moviePoster 
            } 
          })}
        >
          <Image
            source={{ uri: TMDBService.getImageUrl(activityItem.moviePoster, 'w185') }}
            style={styles.activityMoviePoster}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}
    </View>
  );
  
  const renderActivityHeader = ({ section }) => (
    <View style={styles.activityDateHeader}>
      <Text style={styles.activityDateText}>{section.date}</Text>
    </View>
  );

  // Filter out only truly empty/placeholder activity items; allow unknowns with meaningful context
  const isMeaningfulActivity = (item) => {
    if (!item) return false;
    const type = (item.type || '').toString().toLowerCase();
    if (type === 'post' || type === 'movie_post' || type === 'text_post' || type === 'movie_share') return true;
    if (type === 'review') return !!(item.movieTitle || item.movieId || item.moviePoster || item.rating || item.comment);
    if (type === 'list') return !!(item.action && (item.movieTitle || item.movieId || item.moviePoster));
    // For unknown types, show if there's any useful info
    return !!(item.action || item.comment || item.content || item.movieTitle || item.movieId || item.createdAt);
  };

  const getListData = () => {
    switch (activeTab) {
      case 'watchlist':
        return watchlist || [];
      case 'watching':
        return currentlyWatching || [];
      case 'watched':
        return watched || [];
      case 'activity':
        return activity || [];
      default:
        return [];
    }
  };

  const getEmptyStateText = () => {
    switch (activeTab) {
      case 'watchlist':
        return { title: 'No Movies in Watchlist', subtitle: 'Add movies you want to watch' };
      case 'watching':
        return { title: 'Not Currently Watching', subtitle: 'Start watching some movies' };
      case 'watched':
        return { title: 'No Watched Movies', subtitle: 'Mark movies as watched to see them here' };
      case 'activity':
        return { title: 'No Activity Yet', subtitle: 'Your movie activities will appear here' };
      default:
        return { title: 'No Data', subtitle: 'Nothing to show' };
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.userInfo}>
          <View style={styles.userAvatar}>
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <View>
            <Text style={styles.username}>{user?.username || 'User'}</Text>
            <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => signOut()}
        >
          <Ionicons name="log-out-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.tabContainer}>
        {renderTabButton('watchlist', 'Watchlist', 'bookmark', watchlist.length)}
        {renderTabButton('watching', 'Currently Watching', 'play-circle', currentlyWatching.length)}
        {renderTabButton('watched', 'Watched', 'checkmark-circle', watched.length)}
        {renderTabButton('activity', 'Activity', 'time', activity.length)}
      </View>
      
      {activeTab !== 'activity' ? (
        <FlatList
          data={getListData()}
          keyExtractor={(item) => `${activeTab}-${item.id}`}
          renderItem={renderMovieItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshData} />
          }
          ListEmptyComponent={() => {
            const emptyState = getEmptyStateText();
            return (
              <View style={styles.emptyState}>
                <Ionicons 
                  name={
                    activeTab === 'watchlist' ? 'bookmark-outline' :
                    activeTab === 'watching' ? 'play-circle-outline' :
                    activeTab === 'watched' ? 'checkmark-circle-outline' :
                    'time-outline'
                  } 
                  size={64} 
                  color="#D1D5DB" 
                />
                <Text style={styles.emptyTitle}>{emptyState.title}</Text>
                <Text style={styles.emptySubtitle}>{emptyState.subtitle}</Text>
              </View>
            );
          }}
        />
      ) : (
        <>
        {(__DEV__) && (
          <View style={styles.debugPanel}>
            <TouchableOpacity onPress={() => setDebugExpanded(v => !v)}>
              <Text style={styles.debugTitle}>Activity Debug Panel {debugExpanded ? '▾' : '▸'}</Text>
            </TouchableOpacity>
            {debugExpanded && (
              <View style={styles.debugBody}>
                <Text style={styles.debugText}>User ID: {String(user?.id || 'n/a')}</Text>
                <Text style={styles.debugText}>Key (activity): {getPerUserKey('activity')}</Text>
                <View style={styles.debugRow}>
                  <TouchableOpacity style={styles.debugButton} onPress={refreshDebugInfo}>
                    <Text style={styles.debugButtonText}>Refresh Keys</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.debugButton} onPress={forceSaveActivity}>
                    <Text style={styles.debugButtonText}>Force Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.debugButton} onPress={forceLoadActivity}>
                    <Text style={styles.debugButtonText}>Force Load</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.debugText}>Counts: act={debugInfo.counts.activity || 0}, wl={debugInfo.counts.watchlist || 0}, cw={debugInfo.counts.currentlyWatching || 0}, wd={debugInfo.counts.watched || 0}</Text>
              </View>
            )}
          </View>
        )}
        <SectionList
          sections={groupActivitiesByDate((activity || []).filter(isMeaningfulActivity))}
          keyExtractor={(item, index) => item.id || `activity-${index}`}
          renderItem={renderActivityItem}
          renderSectionHeader={renderActivityHeader}
          stickySectionHeadersEnabled={true}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshData} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No Activity Yet</Text>
              <Text style={styles.emptySubtitle}>Your movie activity will appear here</Text>
            </View>
          }
        />
        </>
      )}
      {/* Action Modal */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionModalVisible(false)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Choose an action</Text>

            <TouchableOpacity
              style={styles.actionSheetButton}
              onPress={() => {
                setActionModalVisible(false);
                setShareModalVisible(true);
              }}
            >
              <Ionicons name="share-social-outline" size={20} color="#1F2937" />
              <Text style={styles.actionSheetButtonText}>Share</Text>
            </TouchableOpacity>

            {selectedMovie && watched?.some(m => m.id === selectedMovie.id) && (
              <TouchableOpacity
                style={styles.actionSheetButton}
                onPress={() => {
                  setActionModalVisible(false);
                  navigation.navigate('ReviewWrite', { movie: selectedMovie });
                }}
              >
                <Ionicons name="create-outline" size={20} color="#1F2937" />
                <Text style={styles.actionSheetButtonText}>Review</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetCancel]}
              onPress={() => setActionModalVisible(false)}
            >
              <Text style={[styles.actionSheetButtonText, { color: '#EF4444' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share (Friend Selection) Modal */}
      <FriendSelectionModal
        visible={shareModalVisible}
        onClose={() => {
          setShareModalVisible(false);
          setSelectedMovie(null);
        }}
        movie={selectedMovie}
        onFriendSelect={(friend) => {
          if (friend?.username) {
            showToast(`Shared with ${friend.username}`);
          } else {
            showToast('Movie shared');
          }
          setShareModalVisible(false);
          setSelectedMovie(null);
        }}
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: '#6B7280',
  },
  settingsButton: {
    padding: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 2,
    position: 'relative',
  },
  activeTab: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  countBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  movieItem: {
    flexDirection: 'row',
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  moviePoster: {
    width: 60,
    height: 90,
    borderRadius: 8,
    marginRight: 12,
  },
  movieInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  movieYear: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  movieRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ratingText: {
    fontSize: 14,
    color: '#1F2937',
    marginLeft: 4,
    fontWeight: '500',
  },
  userReviewPreview: {
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  userRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 2,
  },
  userCommentPreview: {
    fontSize: 12,
    color: '#4B5563',
    fontStyle: 'italic',
  },
  addedDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  movieActions: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  quickActionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    marginLeft: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 4,
    lineHeight: 18,
  },
  activityTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  activityComment: {
    fontSize: 13,
    color: '#4B5563',
    fontStyle: 'italic',
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  activityMoviePoster: {
    width: 40,
    height: 60,
    borderRadius: 6,
  },
  activityDateHeader: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  activityDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
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
  // Action modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionSheetButtonText: {
    fontSize: 16,
    color: '#1F2937',
    marginLeft: 10,
  },
  actionSheetCancel: {
    marginTop: 8,
    justifyContent: 'center',
  },
});

export default ProfileScreen;
