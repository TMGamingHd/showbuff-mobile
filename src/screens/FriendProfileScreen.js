import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../utils/toast';

const FriendProfileScreen = ({ route, navigation }) => {
  const { friend } = route.params;
  const { 
    addToList, 
    isInList, 
    getFriendProfile,
    refreshData 
  } = useApp();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState('watchlist');
  const [friendData, setFriendData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFriendProfile();
  }, []);

  const loadFriendProfile = async () => {
    try {
      setLoading(true);
      console.log('=== LOADING FRIEND PROFILE ===');
      console.log('Friend:', friend);
      console.log('Friend ID:', friend.id);
      
      const data = await getFriendProfile(friend.id);
      console.log('=== FRIEND PROFILE DATA RECEIVED ===');
      console.log('Raw data:', data);
      console.log('Watchlist:', data?.watchlist?.length || 0, 'items');
      console.log('Currently Watching:', data?.currentlyWatching?.length || 0, 'items');
      console.log('Watched:', data?.watched?.length || 0, 'items');
      console.log('Reviews:', data?.reviews?.length || 0, 'items');
      
      setFriendData(data);
    } catch (error) {
      console.error('Error loading friend profile:', error);
      Alert.alert('Error', 'Failed to load friend profile');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFriendProfile();
    setRefreshing(false);
  };

  const handleAddToMyList = async (movie, listType) => {
    const result = await addToList(movie, listType);
    if (result.success) {
      showToast(`Added to your ${listType}!`);
    } else if (result.status === 409) {
      Alert.alert(
        'Movie Already in List',
        `This movie is already in your ${result.existingList}. Would you like to move it to ${listType}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Move', 
            onPress: async () => {
              // Handle move logic here if needed
              showToast(`Moved to your ${listType}!`);
            }
          }
        ]
      );
    } else {
      Alert.alert('Error', result.error || 'Failed to add movie');
    }
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Ionicons key={i} name="star" size={16} color="#F59E0B" />
      );
    }
    
    if (hasHalfStar) {
      stars.push(
        <Ionicons key="half" name="star-half" size={16} color="#F59E0B" />
      );
    }
    
    const emptyStars = 10 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Ionicons key={`empty-${i}`} name="star-outline" size={16} color="#D1D5DB" />
      );
    }
    
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  const renderMovieItem = (movie, showAddButton = true) => {
    const year = movie.release_date ? new Date(movie.release_date).getFullYear() : '';
    const userReview = friendData?.reviews?.find(r => r.movieId === movie.id);
    
    return (
      <View key={movie.id} style={styles.movieItem}>
        <TouchableOpacity 
          style={styles.movieInfo}
          onPress={() => navigation.navigate('MovieDetail', { movie })}
        >
          <View style={styles.movieDetails}>
            <Text style={styles.movieTitle}>{movie.title || movie.name}</Text>
            {year && <Text style={styles.movieYear}>({year})</Text>}
            {userReview && (
              <View style={styles.reviewInfo}>
                {renderStars(userReview.rating)}
                <Text style={styles.ratingText}>{userReview.rating}/10</Text>
                {userReview.comment && (
                  <Text style={styles.reviewComment} numberOfLines={2}>
                    "{userReview.comment}"
                  </Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
        
        {showAddButton && (
          <View style={styles.addActions}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => handleAddToMyList(movie, 'watchlist')}
            >
              <Ionicons name="bookmark-outline" size={16} color="#3B82F6" />
              <Text style={styles.addButtonText}>Watchlist</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => handleAddToMyList(movie, 'watched')}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
              <Text style={styles.addButtonText}>Watched</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderTabButton = (tab, title, icon, count) => (
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
      {count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: (insets?.top || 0) + 12 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  const watchlistCount = friendData?.watchlist?.length || 0;
  const currentlyWatchingCount = friendData?.currentlyWatching?.length || 0;
  const watchedCount = friendData?.watched?.length || 0;
  const reviewsCount = friendData?.reviews?.length || 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets?.top || 0) + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{friend.username}'s Profile</Text>
      </View>

      {/* Profile Info */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(friend.username || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>{friend.username}</Text>
        <Text style={styles.email}>{friend.email}</Text>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{watchlistCount + currentlyWatchingCount + watchedCount}</Text>
            <Text style={styles.statLabel}>Movies</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{reviewsCount}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton('watchlist', 'Watchlist', 'bookmark-outline', watchlistCount)}
        {renderTabButton('currently_watching', 'Watching', 'play-circle-outline', currentlyWatchingCount)}
        {renderTabButton('watched', 'Watched', 'checkmark-circle-outline', watchedCount)}
        {renderTabButton('reviews', 'Reviews', 'star-outline', reviewsCount)}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === 'watchlist' && (
          <View>
            {friendData?.watchlist?.length > 0 ? (
              friendData.watchlist.map(movie => renderMovieItem(movie))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="bookmark-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Movies in Watchlist</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'currently_watching' && (
          <View>
            {friendData?.currentlyWatching?.length > 0 ? (
              friendData.currentlyWatching.map(movie => renderMovieItem(movie))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="play-circle-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>Not Currently Watching</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'watched' && (
          <View>
            {friendData?.watched?.length > 0 ? (
              friendData.watched.map(movie => renderMovieItem(movie))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Watched Movies</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'reviews' && (
          <View>
            {friendData?.reviews?.length > 0 ? (
              friendData.reviews.map(review => {
                const movie = review.movie || { title: 'Unknown Movie', id: review.movieId };
                return (
                  <View key={review.id} style={styles.reviewItem}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('MovieDetail', { movie })}
                    >
                      <Text style={styles.reviewMovieTitle}>{movie.title || movie.name}</Text>
                      <View style={styles.reviewHeader}>
                        {renderStars(review.rating)}
                        <Text style={styles.reviewRating}>{review.rating}/10</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(review.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      {review.comment && (
                        <Text style={styles.reviewText}>{review.comment}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addToListButton}
                      onPress={() => handleAddToMyList(movie, 'watchlist')}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#3B82F6" />
                      <Text style={styles.addToListText}>Add to My List</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="star-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Reviews Yet</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#F9FAFB',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 5,
  },
  email: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
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
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 2,
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
    top: 4,
    right: 4,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  movieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  movieInfo: {
    flex: 1,
    marginRight: 15,
  },
  movieDetails: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  movieYear: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 5,
  },
  reviewInfo: {
    marginTop: 5,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  ratingText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 5,
    marginBottom: 3,
  },
  reviewComment: {
    fontSize: 12,
    color: '#4B5563',
    fontStyle: 'italic',
  },
  addActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    gap: 4,
  },
  addButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  reviewItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reviewMovieTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  reviewRating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  reviewDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reviewText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 10,
  },
  addToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    gap: 6,
  },
  addToListText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 15,
  },
});

export default FriendProfileScreen;
