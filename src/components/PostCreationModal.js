import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';

const PostCreationModal = ({ visible, onClose, onPostCreated }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [currentStep, setCurrentStep] = useState('movieSelection'); // 'movieSelection' or 'writePost'
  const [userMovies, setUserMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();
  const { createPost, watchlist, currentlyWatching, watched, refreshData } = useApp();
  const insets = useSafeAreaInsets();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      // Reset all state when modal opens
      setSelectedMovie(null);
      setContent('');
      setSearchQuery('');
      setLoading(false);
      setCurrentStep('movieSelection'); // Always start with movie selection
      
      // Load user's movies
      const allMovies = [
        ...(watchlist || []).map(m => ({ ...m, listType: 'watchlist' })),
        ...(currentlyWatching || []).map(m => ({ ...m, listType: 'currently_watching' })),
        ...(watched || []).map(m => ({ ...m, listType: 'watched' }))
      ];
      
      setUserMovies(allMovies);
    }
  }, [visible, watchlist, currentlyWatching, watched]);

  const filteredMovies = userMovies.filter(movie =>
    movie.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    movie.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreatePost = async () => {
    if (!content.trim()) {
      Alert.alert('Error', 'Please enter some content for your post.');
      return;
    }

    try {
      setLoading(true);
      
      const postData = {
        content: content.trim(),
        userId: user.id,
        userName: user.username,
        userEmail: user.email,
        type: selectedMovie ? 'movie_post' : 'text_post',
        timestamp: new Date().toISOString(),
        movie: selectedMovie ? {
          id: selectedMovie.id,
          title: selectedMovie.title || selectedMovie.name,
          poster_path: selectedMovie.poster_path,
          vote_average: selectedMovie.vote_average,
          listType: selectedMovie.listType
        } : null,
      };

      const result = await createPost(postData);
      
      if (result.success) {
        setContent('');
        onClose();
        
        // Refresh activity data to show the new post without duplicates
        await refreshData();
        
        if (onPostCreated) {
          onPostCreated(result.post);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to create post. Please try again.');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setContent('');
      setSelectedMovie(null);
      setCurrentStep('movieSelection');
      setSearchQuery('');
      setLoading(false);
      onClose();
    }
  };

  const handleMovieSelect = (movie) => {
    setSelectedMovie(movie);
    setCurrentStep('writePost');
  };

  const handleSkipMovieSelection = () => {
    setSelectedMovie(null);
    setCurrentStep('writePost');
  };

  const handleBackToMovieSelection = () => {
    setCurrentStep('movieSelection');
    setSelectedMovie(null);
  };

  const renderMovieItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.movieItem}
      onPress={() => handleMovieSelect(item)}
    >
      <Image
        source={{
          uri: item.poster_path 
            ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
            : 'https://via.placeholder.com/60x90?text=No+Image'
        }}
        style={styles.moviePoster}
        resizeMode="cover"
      />
      <View style={styles.movieInfo}>
        <Text style={styles.movieTitle} numberOfLines={2}>
          {item.title || item.name}
        </Text>
        <View style={styles.movieMeta}>
          <Text style={styles.listType}>
            {item.listType === 'watchlist' ? 'Watchlist' : 
             item.listType === 'currently_watching' ? 'Currently Watching' : 'Watched'}
          </Text>
          {item.vote_average > 0 && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.rating}>{item.vote_average.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );


  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={handleClose}
            disabled={loading}
          >
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {currentStep === 'movieSelection' ? 'Select Movie' : 'Create Post'}
          </Text>
          {currentStep === 'movieSelection' ? (
            <View style={styles.headerSpacer} />
          ) : (
            <TouchableOpacity 
              style={[styles.postButton, (!content.trim() || loading) && styles.postButtonDisabled]}
              onPress={handleCreatePost}
              disabled={!content.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {currentStep === 'movieSelection' ? (
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Choose a movie from your lists:</Text>
            
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search your movies..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {filteredMovies.length > 0 ? (
              <FlatList
                data={filteredMovies}
                renderItem={renderMovieItem}
                keyExtractor={(item) => `${item.id}-${item.listType}`}
                style={styles.moviesList}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="film-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyStateText}>
                  {searchQuery ? 'No movies found' : 'No movies in your lists'}
                </Text>
                <Text style={styles.emptyStateSubtext}>
                  {searchQuery ? 'Try a different search term' : 'Add movies to your watchlist, currently watching, or watched lists first'}
                </Text>
                {!searchQuery && userMovies.length === 0 && (
                  <TouchableOpacity 
                    style={styles.skipButton}
                    onPress={handleSkipMovieSelection}
                  >
                    <Text style={styles.skipButtonText}>Skip Movie Selection</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity 
              style={styles.skipButton}
              onPress={handleSkipMovieSelection}
            >
              <Text style={styles.skipButtonText}>Skip - Create Text Post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleBackToMovieSelection}
            >
              <Ionicons name="chevron-back" size={20} color="#3B82F6" />
              <Text style={styles.backButtonText}>Back to Movie Selection</Text>
            </TouchableOpacity>

            {selectedMovie && (
              <View style={styles.selectedMovieContainer}>
                <View style={styles.selectedMovie}>
                  <Image
                    source={{
                      uri: selectedMovie.poster_path 
                        ? `https://image.tmdb.org/t/p/w200${selectedMovie.poster_path}`
                        : 'https://via.placeholder.com/60x90?text=No+Image'
                    }}
                    style={styles.selectedMoviePoster}
                    resizeMode="cover"
                  />
                  <View style={styles.selectedMovieInfo}>
                    <Text style={styles.selectedMovieTitle}>{selectedMovie.title || selectedMovie.name}</Text>
                    <Text style={styles.selectedMovieList}>
                      From your {selectedMovie.listType === 'watchlist' ? 'Watchlist' : 
                                 selectedMovie.listType === 'currently_watching' ? 'Currently Watching' : 'Watched'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color="#6B7280" />
              </View>
              <Text style={styles.userName}>{user?.username || 'User'}</Text>
            </View>

            <TextInput
              style={styles.textInput}
              placeholder={selectedMovie 
                ? `What did you think about ${selectedMovie.title || selectedMovie.name}?`
                : "What's on your mind about movies?"
              }
              placeholderTextColor="#9CA3AF"
              value={content}
              onChangeText={setContent}
              multiline
              autoFocus={currentStep === 'writePost'}
              maxLength={500}
              editable={!loading}
            />

            <View style={styles.footer}>
              <Text style={styles.characterCount}>
                {content.length}/500
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  postButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  postButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  postButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  footer: {
    alignItems: 'flex-end',
    paddingTop: 16,
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  headerSpacer: {
    width: 60,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  moviesList: {
    flex: 1,
  },
  movieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  moviePoster: {
    width: 50,
    height: 75,
    borderRadius: 8,
    marginRight: 12,
  },
  movieInfo: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  movieMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listType: {
    fontSize: 12,
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  skipButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  selectedMovieContainer: {
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: '#3B82F6',
    marginLeft: 4,
  },
  selectedMovie: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedMoviePoster: {
    width: 40,
    height: 60,
    borderRadius: 6,
    marginRight: 12,
  },
  selectedMovieInfo: {
    flex: 1,
  },
  selectedMovieTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  selectedMovieList: {
    fontSize: 12,
    color: '#6B7280',
  },
});

export default PostCreationModal;
