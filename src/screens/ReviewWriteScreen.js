import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { showToast } from '../utils/toast';

const ReviewWriteScreen = ({ route, navigation }) => {
  const { movie } = route.params || {};
  const { addReview } = useApp();
  const insets = useSafeAreaInsets();

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isRewatched, setIsRewatched] = useState(false);
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [visibility, setVisibility] = useState('friends'); // 'public', 'friends', 'private'
  const [selectedTags, setSelectedTags] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reviewTags = [
    '🎬 Cinematography', '🎭 Acting', '📖 Story', '🎵 Soundtrack', 
    '😱 Thriller', '😂 Comedy', '💔 Drama', '🚀 Action',
    '🧠 Mind-bending', '❤️ Romance', '🔍 Mystery', '👨‍👩‍👧‍👦 Family'
  ];

  const visibilityOptions = [
    { key: 'public', label: 'Public', icon: 'globe-outline', description: 'Everyone can see' },
    { key: 'friends', label: 'Friends', icon: 'people-outline', description: 'Only friends can see' },
    { key: 'private', label: 'Private', icon: 'lock-closed-outline', description: 'Only you can see' }
  ];

  const handleRatingPress = (selectedRating) => {
    setRating(selectedRating);
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleSubmitReview = async () => {
    if (!movie) {
      Alert.alert('Error', 'No movie selected for review.');
      return;
    }

    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating for this movie.');
      return;
    }

    if (!reviewText.trim()) {
      Alert.alert('Review Required', 'Please write a review for this movie.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Debug the state values first
      console.log('Raw state values:', {
        rating: rating,
        reviewText: reviewText,
        movie: movie,
        visibility: visibility
      });

      // Ensure values are properly extracted and not functions
      const cleanRating = typeof rating === 'number' ? rating : parseInt(rating) || 0;
      const cleanComment = typeof reviewText === 'string' ? reviewText.trim() : '';
      const cleanVisibility = typeof visibility === 'string' ? visibility : 'friends';
      
      const reviewData = {
        movieId: Number(movie.id),
        movie: {
          id: movie.id,
          title: movie.title || movie.name,
          poster_path: movie.poster_path,
          release_date: movie.release_date || movie.first_air_date
        },
        rating: cleanRating,
        comment: cleanComment,
        tags: Array.isArray(selectedTags) ? selectedTags : [],
        isRewatched: Boolean(isRewatched),
        containsSpoilers: Boolean(containsSpoilers),
        visibility: cleanVisibility,
        createdAt: new Date().toISOString(),
      };

      console.log('Clean review data:', reviewData);

      // Add review via AppContext (this will call the backend)
      const result = await addReview(reviewData);
      
      if (result.success) {
        showToast('Review posted successfully! 🎉');
        navigation.goBack();
      } else {
        Alert.alert('Error', result.error || 'Failed to post review. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      Alert.alert('Error', 'Failed to post review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRatingSelector = () => (
    <View style={styles.ratingSection}>
      <Text style={styles.sectionTitle}>Rate this movie</Text>
      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
          <TouchableOpacity 
            key={star} 
            style={styles.starButton}
            onPress={() => handleRatingPress(star)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={32}
              color={star <= rating ? '#F59E0B' : '#D1D5DB'}
            />
          </TouchableOpacity>
        ))}
      </View>
      {rating > 0 && (
        <Text style={styles.ratingText}>
          {rating}/10 - {
            rating >= 9 ? 'Masterpiece!' :
            rating >= 8 ? 'Excellent!' :
            rating >= 7 ? 'Very Good' :
            rating >= 6 ? 'Good' :
            rating >= 5 ? 'Okay' :
            rating >= 4 ? 'Fair' :
            rating >= 3 ? 'Poor' :
            rating >= 2 ? 'Bad' : 'Terrible'
          }
        </Text>
      )}
    </View>
  );

  const renderTagSelector = () => (
    <View style={styles.tagsSection}>
      <Text style={styles.sectionTitle}>What stood out? (Optional)</Text>
      <View style={styles.tagsContainer}>
        {reviewTags.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[
              styles.tagButton,
              selectedTags.includes(tag) && styles.tagButtonSelected
            ]}
            onPress={() => toggleTag(tag)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tagText,
              selectedTags.includes(tag) && styles.tagTextSelected
            ]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderVisibilitySelector = () => (
    <View style={styles.visibilitySection}>
      <Text style={styles.sectionTitle}>Who can see this review?</Text>
      <View style={styles.visibilityOptions}>
        {visibilityOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.visibilityOption,
              visibility === option.key && styles.visibilityOptionSelected
            ]}
            onPress={() => setVisibility(option.key)}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={option.icon} 
              size={20} 
              color={visibility === option.key ? '#3B82F6' : '#6B7280'} 
            />
            <View style={styles.visibilityContent}>
              <Text style={[
                styles.visibilityLabel,
                visibility === option.key && styles.visibilityLabelSelected
              ]}>
                {option.label}
              </Text>
              <Text style={styles.visibilityDescription}>{option.description}</Text>
            </View>
            <Ionicons 
              name={visibility === option.key ? 'radio-button-on' : 'radio-button-off'} 
              size={20} 
              color={visibility === option.key ? '#3B82F6' : '#D1D5DB'} 
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Write Review</Text>
        <TouchableOpacity 
          style={[styles.submitButton, (!rating || !reviewText.trim()) && styles.submitButtonDisabled]}
          onPress={handleSubmitReview}
          disabled={!rating || !reviewText.trim() || isSubmitting}
        >
          <Text style={[styles.submitButtonText, (!rating || !reviewText.trim()) && styles.submitButtonTextDisabled]}>
            {isSubmitting ? 'Posting...' : 'Post'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Movie Info */}
        {movie && (
          <View style={styles.movieInfo}>
            <Text style={styles.movieTitle}>{movie.title}</Text>
            <Text style={styles.movieYear}>
              {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
            </Text>
          </View>
        )}

        {/* Rating Section */}
        {renderRatingSelector()}

        {/* Review Text */}
        <View style={styles.reviewSection}>
          <Text style={styles.sectionTitle}>Your thoughts</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder="What did you think about this movie? Share your thoughts, favorite moments, or what made it special..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={6}
            maxLength={1000}
            value={reviewText}
            onChangeText={setReviewText}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>
            {reviewText.length}/1000 characters
          </Text>
        </View>

        {/* Tags */}
        {renderTagSelector()}

        {/* Options */}
        <View style={styles.optionsSection}>
          <Text style={styles.sectionTitle}>Options</Text>
          
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setIsRewatched(!isRewatched)}
            activeOpacity={0.7}
          >
            <View style={styles.optionInfo}>
              <Ionicons name="refresh" size={20} color="#6B7280" />
              <Text style={styles.optionLabel}>This is a rewatch</Text>
            </View>
            <Ionicons 
              name={isRewatched ? 'checkbox' : 'square-outline'} 
              size={20} 
              color={isRewatched ? '#3B82F6' : '#D1D5DB'} 
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setContainsSpoilers(!containsSpoilers)}
            activeOpacity={0.7}
          >
            <View style={styles.optionInfo}>
              <Ionicons name="warning" size={20} color="#6B7280" />
              <Text style={styles.optionLabel}>Contains spoilers</Text>
            </View>
            <Ionicons 
              name={containsSpoilers ? 'checkbox' : 'square-outline'} 
              size={20} 
              color={containsSpoilers ? '#3B82F6' : '#D1D5DB'} 
            />
          </TouchableOpacity>
        </View>

        {/* Visibility */}
        {renderVisibilitySelector()}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#9CA3AF',
  },
  content: {
    flex: 1,
  },
  movieInfo: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  movieTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  movieYear: {
    fontSize: 16,
    color: '#6B7280',
  },
  
  // Rating Section
  ratingSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    fontSize: 16,
    color: '#3B82F6',
    textAlign: 'center',
    fontWeight: '600',
  },
  
  // Review Section
  reviewSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    minHeight: 120,
    marginBottom: 8,
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
  },
  
  // Tags Section
  tagsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tagButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  tagButtonSelected: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  tagText: {
    fontSize: 14,
    color: '#6B7280',
  },
  tagTextSelected: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  
  // Options Section
  optionsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  optionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    color: '#1F2937',
    marginLeft: 12,
  },
  
  // Visibility Section
  visibilitySection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  visibilityOptions: {
    marginTop: 4,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  visibilityOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#F8FAFC',
  },
  visibilityContent: {
    flex: 1,
    marginLeft: 12,
  },
  visibilityLabel: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  visibilityLabelSelected: {
    color: '#3B82F6',
  },
  visibilityDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  bottomPadding: {
    height: 40,
  },
});

export default ReviewWriteScreen;
