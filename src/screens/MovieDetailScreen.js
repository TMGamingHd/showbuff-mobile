import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import TMDBService from '../services/tmdb';
import { dbToClient, listLabel } from '../utils/lists';
import { showMoveDialog } from '../utils/moveDialog';
import { showToast } from '../utils/toast';
import FriendSelectionModal from '../components/FriendSelectionModal';

const { width, height } = Dimensions.get('window');

const MovieDetailScreen = ({ route, navigation }) => {
  const { movie: initialMovie } = route.params;
  const { addToList, removeFromList, moveToList, isInList, getUserReview, addReview } = useApp();
  const { user } = useAuth();
  
  const [movie, setMovie] = useState(initialMovie);
  const [loading, setLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => {
    loadMovieDetails();
  }, []);

  // Pre-populate form when editing existing review
  useEffect(() => {
    if (showReviewModal) {
      const existingReview = getUserReview(movie.id);
      if (existingReview) {
        setRating(existingReview.rating);
        setReviewComment(existingReview.comment || '');
      } else {
        setRating(0);
        setReviewComment('');
      }
    }
  }, [showReviewModal, movie.id]);

  const loadMovieDetails = async () => {
    try {
      setLoading(true);
      const details = await TMDBService.getMovieDetails(movie.id);
      setMovie({ ...movie, ...details });
    } catch (error) {
      console.error('Error loading movie details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleList = async (listType) => {
    const movieInList = isInList(movie.id, listType);
    
    if (movieInList) {
      // Remove from list if already in it
      const result = await removeFromList(movie.id, listType);
      if (result.success) {
        showToast(`Removed from ${listLabel(listType)}!`);
      } else {
        Alert.alert('Error', result.error || 'Failed to remove from list');
      }
      return;
    }
    
    // Add to list if not in it
    const result = await addToList(movie, listType);
    if (result.success) {
      showToast(`Added to ${listLabel(listType)}!`);
      return;
    }

    // If backend enforced uniqueness (409), offer to move
    if (result.status === 409 && result.existingList) {
      const existingClientList = dbToClient(result.existingList);

      if (existingClientList === listType) {
        showToast(`Already in ${listLabel(listType)}`);
        return;
      }

      showMoveDialog({
        movie,
        existingList: existingClientList,
        targetList: listType,
        onMove: async () => {
          const moveRes = await moveToList(movie.id, existingClientList, listType);
          if (moveRes.success) {
            showToast(`Moved to ${listLabel(listType)}.`);
          } else {
            Alert.alert('Error', moveRes.error || 'Failed to move movie');
          }
        },
      });
      return;
    }

    // Generic error fallback
    Alert.alert('Error', result.error || 'Failed to add to list');
  };

  const handleAddReview = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }

    const reviewData = {
      movieId: movie.id,
      movie: movie,
      rating: rating,
      comment: reviewComment
    };
    const result = await addReview(reviewData);
    if (result.success) {
      showToast(result.isEditing ? 'Review updated!' : 'Review added!');
      setShowReviewModal(false);
      setRating(0);
      setReviewComment('');
    } else {
      Alert.alert('Error', result.error || 'Failed to save review');
    }
  };

  const handleShareMovie = () => {
    console.log('=== MOVIE DETAIL SCREEN SHARE BUTTON PRESSED ===');
    console.log('Movie data:', movie);
    console.log('Movie ID:', movie?.id);
    console.log('Movie title:', movie?.title || movie?.name);
    setShowShareModal(true);
  };

  const handleFriendSelect = (friend, sharedMovie) => {
    console.log('=== MOVIE DETAIL SCREEN FRIEND SELECTED ===');
    console.log('Friend:', friend);
    console.log('Shared movie:', sharedMovie);
    showToast(`Shared ${sharedMovie.title || sharedMovie.name} with ${friend.username}!`);
    setShowShareModal(false);
  };

  const userReview = getUserReview(movie.id);
  const inWatchlist = isInList(movie.id, 'watchlist');
  const inCurrentlyWatching = isInList(movie.id, 'currently_watching');
  const inWatched = isInList(movie.id, 'watched');

  const renderStars = (currentRating, onPress) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onPress && onPress(star)}
            disabled={!onPress}
          >
            <Ionicons
              name={star <= currentRating ? 'star' : 'star-outline'}
              size={24}
              color="#F59E0B"
              style={styles.star}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header with backdrop */}
      <View style={styles.header}>
        <Image
          source={{ uri: TMDBService.getImageUrl(movie.backdrop_path, 'w780') }}
          style={styles.backdrop}
          resizeMode="cover"
        />
        <View style={styles.headerOverlay}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Movie Info */}
      <View style={styles.movieInfo}>
        <View style={styles.posterSection}>
          <Image
            source={{ uri: TMDBService.getImageUrl(movie.poster_path, 'w342') }}
            style={styles.poster}
            resizeMode="cover"
          />
          <View style={styles.basicInfo}>
            <Text style={styles.title}>{movie.title || movie.name}</Text>
            <Text style={styles.year}>
              {TMDBService.getYear(movie.release_date || movie.first_air_date)}
            </Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={styles.rating}>
                {TMDBService.formatVoteAverage(movie.vote_average)}/10
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons - 2x2 Grid Layout */}
        <View style={styles.actionButtonsContainer}>
          {/* Top Row */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.actionButton, inWatchlist && styles.activeButton]}
              onPress={() => handleToggleList('watchlist')}
            >
              <Ionicons 
                name={inWatchlist ? 'bookmark' : 'bookmark-outline'} 
                size={20} 
                color={inWatchlist ? '#FFFFFF' : '#3B82F6'} 
              />
              <Text style={[styles.buttonText, inWatchlist && styles.activeButtonText]}>
                {inWatchlist ? 'In Watchlist' : 'Watchlist'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, inCurrentlyWatching && styles.activeButton]}
              onPress={() => handleToggleList('currently_watching')}
            >
              <Ionicons 
                name={inCurrentlyWatching ? 'play-circle' : 'play-circle-outline'} 
                size={20} 
                color={inCurrentlyWatching ? '#FFFFFF' : '#3B82F6'} 
              />
              <Text style={[styles.buttonText, inCurrentlyWatching && styles.activeButtonText]}>
                {inCurrentlyWatching ? 'Now Watching' : 'Watching'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Row */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.actionButton, inWatched && styles.activeButton]}
              onPress={() => handleToggleList('watched')}
            >
              <Ionicons 
                name={inWatched ? 'checkmark-circle' : 'checkmark-circle-outline'} 
                size={20} 
                color={inWatched ? '#FFFFFF' : '#3B82F6'} 
              />
              <Text style={[styles.buttonText, inWatched && styles.activeButtonText]}>
                {inWatched ? 'Watched' : 'Mark Watched'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShareMovie}
            >
              <Ionicons 
                name="share-outline" 
                size={20} 
                color="#3B82F6" 
              />
              <Text style={styles.buttonText}>
                Share
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.overview}>{movie.overview || 'No overview available.'}</Text>
        </View>

        {/* Additional Details */}
        {loading ? (
          <ActivityIndicator size="small" color="#3B82F6" style={styles.loader} />
        ) : (
          <>
            {movie.genres && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Genres</Text>
                <View style={styles.genresContainer}>
                  {movie.genres.map((genre) => (
                    <View key={genre.id} style={styles.genreTag}>
                      <Text style={styles.genreText}>{genre.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {movie.runtime && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Runtime</Text>
                <Text style={styles.detailText}>{movie.runtime} minutes</Text>
              </View>
            )}
          </>
        )}

        {/* User Review Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Review</Text>
          {userReview ? (
            <View style={styles.reviewContainer}>
              {renderStars(userReview.rating)}
              <Text style={styles.reviewComment}>{userReview.comment}</Text>
              <Text style={styles.reviewDate}>
                {new Date(userReview.createdAt).toLocaleDateString()}
              </Text>
            </View>
          ) : (
            <></>
          )}
          {isInList(movie.id, 'watched') && (
            <TouchableOpacity
              style={styles.addReviewButton}
              onPress={() => setShowReviewModal(true)}
            >
              <Ionicons name={getUserReview(movie.id) ? "create-outline" : "add-circle-outline"} size={20} color="#3B82F6" />
              <Text style={styles.addReviewText}>{getUserReview(movie.id) ? 'Edit Review' : 'Add Review'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Review Modal */}
      {showReviewModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.reviewModal}>
            <Text style={styles.modalTitle}>{getUserReview(movie.id) ? 'Edit Review' : 'Rate & Review'}</Text>
            <Text style={styles.modalSubtitle}>{movie.title || movie.name}</Text>
            
            <Text style={styles.ratingLabel}>Rating (1-10)</Text>
            {renderStars(rating, setRating)}
            
            <Text style={styles.commentLabel}>Review (Optional)</Text>
            <TextInput
              style={styles.commentInput}
              multiline
              numberOfLines={4}
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Write your review..."
              placeholderTextColor="#9CA3AF"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowReviewModal(false);
                  setRating(0);
                  setReviewComment('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddReview}
              >
                <Text style={styles.saveButtonText}>Save Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Friend Selection Modal for Sharing */}
      <FriendSelectionModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        movie={movie}
        onFriendSelect={handleFriendSelect}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: height * 0.3,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieInfo: {
    padding: 20,
    marginTop: -50,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  posterSection: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 10,
    marginRight: 15,
  },
  basicInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 5,
  },
  year: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 5,
  },
  actionButtonsContainer: {
    marginBottom: 30,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: '#FFFFFF',
  },
  activeButton: {
    backgroundColor: '#3B82F6',
  },
  buttonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  activeButtonText: {
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.6,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 10,
  },
  overview: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4B5563',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  genreTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  detailText: {
    fontSize: 16,
    color: '#4B5563',
  },
  reviewContainer: {
    padding: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  star: {
    marginRight: 4,
  },
  reviewComment: {
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 8,
    lineHeight: 22,
  },
  reviewDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  addReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  addReviewText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 25,
    margin: 20,
    width: width - 40,
    maxHeight: height * 0.8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 10,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 10,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loader: {
    marginVertical: 20,
  },
});

export default MovieDetailScreen;
