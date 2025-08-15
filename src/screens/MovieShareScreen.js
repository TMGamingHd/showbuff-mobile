import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import TMDBService from '../services/tmdb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MovieShareScreen = ({ route, navigation }) => {
  const { friend, onShare } = route.params;
  const { watchlist, currentlyWatching, watched } = useApp();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState('search'); // 'search', 'my_movies'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.length > 2) {
      handleSearch();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleSearch = async () => {
    try {
      setLoading(true);
      const results = await TMDBService.searchMulti(searchQuery);
      setSearchResults(results.results || []);
    } catch (error) {
      console.error('Error searching movies:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleShareMovie = async (movie) => {
    Alert.alert(
      'Share Movie',
      `Share "${movie.title || movie.name}" with ${friend.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            await onShare(movie);
            navigation.goBack();
          }
        }
      ]
    );
  };

  const renderMovieItem = (movie, source = 'search') => (
    <TouchableOpacity
      key={`${source}-${movie.id}`}
      style={styles.movieItem}
      onPress={() => handleShareMovie(movie)}
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
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Text style={styles.ratingText}>
            {TMDBService.formatVoteAverage(movie.vote_average)}
          </Text>
        </View>
        {movie.media_type && (
          <Text style={styles.mediaType}>
            {movie.media_type === 'tv' ? 'TV Show' : 'Movie'}
          </Text>
        )}
      </View>
      <View style={styles.shareButton}>
        <Ionicons name="share-outline" size={20} color="#3B82F6" />
      </View>
    </TouchableOpacity>
  );

  const renderTabButton = (tab, title, icon) => (
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
    </TouchableOpacity>
  );

  const myMovies = [
    ...(watchlist || []).map(movie => ({ ...movie, listType: 'watchlist' })),
    ...(currentlyWatching || []).map(movie => ({ ...movie, listType: 'currently_watching' })),
    ...(watched || []).map(movie => ({ ...movie, listType: 'watched' }))
  ];

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
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Share Movie</Text>
          <Text style={styles.headerSubtitle}>with {friend.username}</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {renderTabButton('search', 'Search Movies', 'search-outline')}
        {renderTabButton('my_movies', 'My Movies', 'library-outline')}
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'search' && (
          <View>
            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for movies or TV shows..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Search Results */}
            {loading ? (
              <ActivityIndicator size="large" color="#3B82F6" style={styles.loader} />
            ) : searchResults.length > 0 ? (
              <View style={styles.moviesList}>
                {searchResults.map(movie => renderMovieItem(movie, 'search'))}
              </View>
            ) : searchQuery.length > 2 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Movies Found</Text>
                <Text style={styles.emptySubtitle}>Try a different search term</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="film-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>Search for Movies</Text>
                <Text style={styles.emptySubtitle}>
                  Find movies and TV shows to share with {friend.username}
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'my_movies' && (
          <View>
            {myMovies.length > 0 ? (
              <View style={styles.moviesList}>
                {myMovies.map(movie => renderMovieItem(movie, 'my_movies'))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="library-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No Movies in Your Lists</Text>
                <Text style={styles.emptySubtitle}>
                  Add movies to your watchlist, currently watching, or watched lists
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 15,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
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
  moviesList: {
    paddingVertical: 10,
  },
  movieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  moviePoster: {
    width: 50,
    height: 75,
    borderRadius: 8,
    marginRight: 15,
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
  movieYear: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  movieRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#1F2937',
    marginLeft: 4,
    fontWeight: '500',
  },
  mediaType: {
    fontSize: 12,
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  shareButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
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
    paddingHorizontal: 20,
  },
  loader: {
    marginVertical: 40,
  },
});

export default MovieShareScreen;
