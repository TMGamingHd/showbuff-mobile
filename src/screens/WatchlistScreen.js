import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  Dimensions,
  Modal,
  TextInput,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import TMDBService from '../services/tmdb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../utils/toast';
import { listLabel } from '../utils/lists';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 60) / 2;

const WatchlistScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { 
    watchlist, 
    currentlyWatching, 
    watched, 
    refreshing, 
    refreshData,
    addToList,
    removeFromList,
    moveToList,
    addReview,
    getUserReview,
    stats
  } = useApp();

  const [activeTab, setActiveTab] = useState('watchlist');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData] = useState({ rating: 5, comment: '' });

  const getCurrentList = () => {
    switch (activeTab) {
      case 'watchlist':
        return watchlist;
      case 'currently_watching':
        return currentlyWatching;
      case 'watched':
        return watched;
      default:
        return [];
    }
  };

  const getTabTitle = (tab) => {
    switch (tab) {
      case 'watchlist':
        return `Watchlist (${stats.watchlistCount})`;
      case 'currently_watching':
        return `Currently Watching (${stats.currentlyWatchingCount})`;
      case 'watched':
        return `Watched (${stats.watchedCount})`;
      default:
        return tab;
    }
  };

  const handleMoviePress = (movie) => {
    setSelectedMovie(movie);
    
    const actions = [];
    
    // Add different actions based on current tab
    if (activeTab === 'watchlist') {
      actions.push(
        { text: 'Move to Currently Watching', onPress: async () => {
            const res = await moveToList(movie.id, 'watchlist', 'currently_watching');
            if (res.success) showToast(`Moved to ${listLabel('currently_watching')}`);
            else Alert.alert('Error', res.error || 'Failed to move movie');
          } },
        { text: 'Mark as Watched', onPress: async () => {
            const res = await moveToList(movie.id, 'watchlist', 'watched');
            if (res.success) showToast(`Moved to ${listLabel('watched')}`);
            else Alert.alert('Error', res.error || 'Failed to move movie');
          } }
      );
    } else if (activeTab === 'currently_watching') {
      actions.push(
        { text: 'Move to Watchlist', onPress: async () => {
            const res = await moveToList(movie.id, 'currently_watching', 'watchlist');
            if (res.success) showToast(`Moved to ${listLabel('watchlist')}`);
            else Alert.alert('Error', res.error || 'Failed to move movie');
          } },
        { text: 'Mark as Watched', onPress: async () => {
            const res = await moveToList(movie.id, 'currently_watching', 'watched');
            if (res.success) showToast(`Moved to ${listLabel('watched')}`);
            else Alert.alert('Error', res.error || 'Failed to move movie');
          } }
      );
    } else if (activeTab === 'watched') {
      const existingReview = getUserReview(movie.id);
      actions.push(
        { text: existingReview ? 'Edit Review' : 'Add Review', onPress: () => openReviewModal(movie) },
        { text: 'Move to Currently Watching', onPress: async () => {
            const res = await moveToList(movie.id, 'watched', 'currently_watching');
            if (res.success) showToast(`Moved to ${listLabel('currently_watching')}`);
            else Alert.alert('Error', res.error || 'Failed to move movie');
          } },
        { text: 'Move to Watchlist', onPress: async () => {
            const res = await moveToList(movie.id, 'watched', 'watchlist');
            if (res.success) showToast(`Moved to ${listLabel('watchlist')}`);
            else Alert.alert('Error', res.error || 'Failed to move movie');
          } }
      );
    }

    actions.push(
      { text: 'Remove from List', onPress: () => handleRemoveMovie(movie), style: 'destructive' },
      { text: 'Cancel', style: 'cancel' }
    );

    Alert.alert(movie.title || movie.name, movie.overview, actions);
  };

  const handleRemoveMovie = (movie) => {
    Alert.alert(
      'Remove Movie',
      `Are you sure you want to remove "${movie.title || movie.name}" from your ${activeTab.replace('_', ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            const result = await removeFromList(movie.id, activeTab);
            if (result.success) {
              showToast(`Removed from ${listLabel(activeTab)}`);
            } else {
              Alert.alert('Error', result.error || 'Failed to remove movie');
            }
          }
        }
      ]
    );
  };

  const openReviewModal = (movie) => {
    const existingReview = getUserReview(movie.id);
    setReviewData({
      rating: existingReview?.rating || 5,
      comment: existingReview?.comment || ''
    });
    setSelectedMovie(movie);
    setShowReviewModal(true);
  };

  const handleAddReview = async () => {
    if (!selectedMovie) return;

    const result = await addReview(selectedMovie.id, reviewData.rating, reviewData.comment);
    
    if (result.success) {
      setShowReviewModal(false);
      setReviewData({ rating: 5, comment: '' });
      showToast('Review saved');
    } else {
      Alert.alert('Error', result.error || 'Failed to add review');
    }
  };

  const renderMovieItem = ({ item }) => {
    const userReview = getUserReview(item.id);
    const year = item.release_date ? new Date(item.release_date).getFullYear() : '';

    return (
      <TouchableOpacity 
        style={styles.movieCard} 
        onPress={() => handleMoviePress(item)}
        onLongPress={() => handleRemoveMovie(item)}
        activeOpacity={0.7}
      >
        <Image 
          source={{ 
            uri: item.poster_path 
              ? TMDBService.getImageUrl(item.poster_path, 'w342')
              : 'https://via.placeholder.com/200x300?text=No+Image'
          }}
          style={styles.moviePoster}
          resizeMode="cover"
        />
        
        {userReview && (
          <View style={styles.userReviewContainer}>
            <View style={styles.userRating}>
              <Ionicons name="star" size={10} color="#FFFFFF" />
              <Text style={styles.userRatingText}>{userReview.rating}</Text>
            </View>
          </View>
        )}
        
        <Text style={styles.movieTitle} numberOfLines={2}>{item.title || item.name}</Text>
        
        {/* User's Review Preview */}
        {userReview && userReview.comment && (
          <View style={styles.reviewPreview}>
            <Text style={styles.reviewPreviewText} numberOfLines={2}>
              "{userReview.comment}"
            </Text>
          </View>
        )}
        
        <View style={styles.movieMeta}>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.rating}>{TMDBService.formatVoteAverage(item.vote_average)}</Text>
          </View>
          {year && <Text style={styles.movieYear}>{year}</Text>}
        </View>
        
        {item.media_type === 'tv' && (
          <View style={styles.mediaTypeBadge}>
            <Text style={styles.mediaTypeText}>TV</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons 
        name={
          activeTab === 'watchlist' ? 'bookmark-outline' :
          activeTab === 'currently_watching' ? 'play-circle-outline' :
          'checkmark-circle-outline'
        } 
        size={64} 
        color="#D1D5DB" 
      />
      <Text style={styles.emptyTitle}>
        {activeTab === 'watchlist' ? 'No movies in your watchlist' :
         activeTab === 'currently_watching' ? 'Not currently watching anything' :
         'No watched movies yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'watchlist' ? 'Add movies you want to watch later' :
         activeTab === 'currently_watching' ? 'Add movies you\'re currently watching' :
         'Mark movies as watched to see them here'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: (insets?.bottom || 0) }]}>
      <View style={[styles.header, { paddingTop: (insets?.top || 0) + 12 }]}>
        <Text style={styles.title}>My Lists</Text>
        <Text style={styles.subtitle}>
          {`Welcome back, ${user?.username || 'User'}!`}
        </Text>
      </View>

      <View style={styles.tabContainer}>
        {['watchlist', 'currently_watching', 'watched'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {getTabTitle(tab)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {getCurrentList().length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={getCurrentList()}
          renderItem={renderMovieItem}
          keyExtractor={(item) => `${item.id}-${activeTab}`}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.moviesList, { paddingBottom: (insets?.bottom || 0) + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshData}
              colors={['#3B82F6']}
              tintColor="#3B82F6"
            />
          }
        />
      )}

      {/* Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowReviewModal(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {getUserReview(selectedMovie?.id) ? 'Edit Review' : 'Add Review'}
            </Text>
            <TouchableOpacity onPress={handleAddReview}>
              <Text style={styles.saveButton}>Save</Text>
            </TouchableOpacity>
          </View>

          {selectedMovie && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.movieInfo}>
                <Image
                  source={{ uri: TMDBService.getImageUrl(selectedMovie.poster_path, 'w342') }}
                  style={styles.modalMoviePoster}
                  resizeMode="cover"
                />
                <View style={styles.movieDetails}>
                  <Text style={styles.modalMovieTitle}>{selectedMovie.title || selectedMovie.name}</Text>
                  <Text style={styles.modalMovieYear}>
                    {TMDBService.getYear(selectedMovie.release_date || selectedMovie.first_air_date)}
                  </Text>
                </View>
              </View>

              <View style={styles.ratingSection}>
                <Text style={styles.sectionTitle}>Your Rating</Text>
                <View style={styles.starRating}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setReviewData(prev => ({ ...prev, rating: star }))}
                      style={styles.starButton}
                    >
                      <Ionicons
                        name={star <= reviewData.rating ? 'star' : 'star-outline'}
                        size={24}
                        color={star <= reviewData.rating ? '#F59E0B' : '#D1D5DB'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.ratingText}>{reviewData.rating}/10</Text>
              </View>

              <View style={styles.commentSection}>
                <Text style={styles.sectionTitle}>Your Review (Optional)</Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="What did you think about this movie?"
                  placeholderTextColor="#9CA3AF"
                  value={reviewData.comment}
                  onChangeText={(text) => setReviewData(prev => ({ ...prev, comment: text }))}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
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
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  activeTabText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  moviesList: {
    padding: 20,
  },
  row: {
    justifyContent: 'space-between',
  },
  movieCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    width: ITEM_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  moviePoster: {
    width: '100%',
    height: ITEM_WIDTH * 1.5,
    borderRadius: 8,
    marginBottom: 8,
  },
  movieTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
    lineHeight: 18,
  },
  movieMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
    fontWeight: '500',
  },
  movieYear: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  userReviewContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  userRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userRatingText: {
    fontSize: 10,
    color: '#FFFFFF',
    marginLeft: 2,
    fontWeight: '600',
  },
  reviewPreview: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  reviewPreviewText: {
    fontSize: 12,
    color: '#4B5563',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  mediaTypeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#10B981',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  mediaTypeText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  movieInfo: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  modalMoviePoster: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 16,
  },
  movieDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  modalMovieTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  modalMovieYear: {
    fontSize: 14,
    color: '#6B7280',
  },
  ratingSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  starRating: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3B82F6',
    textAlign: 'center',
  },
  commentSection: {
    marginBottom: 24,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
    minHeight: 100,
  },
});

export default WatchlistScreen;
