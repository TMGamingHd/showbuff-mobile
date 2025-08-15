import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import TMDBService from '../services/tmdb';
import { dbToClient, listLabel } from '../utils/lists';
import { showToast } from '../utils/toast';
import { showMoveDialog } from '../utils/moveDialog';

const PopularMoviesScreen = ({ navigation }) => {
  const { addToList, moveToList, isInList } = useApp();
  const [popularMovies, setPopularMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadPopularMovies();
  }, []);

  const loadPopularMovies = async () => {
    try {
      setLoading(true);
      const data = await TMDBService.getTrending('movie', 'week');
      setPopularMovies(data.results || []);
    } catch (error) {
      console.error('Error loading popular movies:', error);
      Alert.alert('Error', 'Failed to load popular movies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMoviePress = (movie) => {
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

  const renderMovieItem = ({ item }) => {
    const inWatchlist = isInList(item.id, 'watchlist');
    const inCurrentlyWatching = isInList(item.id, 'currently_watching');
    const inWatched = isInList(item.id, 'watched');

    return (
      <TouchableOpacity 
        style={styles.movieCard}
        onPress={() => handleMoviePress(item)}
      >
        <Image
          source={{ uri: TMDBService.getImageUrl(item.poster_path, 'w342') }}
          style={styles.moviePoster}
          resizeMode="cover"
        />
        {(inWatchlist || inCurrentlyWatching || inWatched) && (
          <View style={styles.statusIndicator}>
            <Ionicons 
              name={
                inWatched ? 'checkmark-circle' :
                inCurrentlyWatching ? 'play-circle' :
                'bookmark'
              }
              size={16} 
              color="#3B82F6" 
            />
          </View>
        )}
        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {item.title || item.name}
          </Text>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.rating}>{TMDBService.formatVoteAverage(item.vote_average)}</Text>
          </View>
          <Text style={styles.movieYear}>
            {TMDBService.getYear(item.release_date || item.first_air_date)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading popular movies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (insets?.top || 0) + 16 }]}>
        <Text style={styles.headerTitle}>🔥 Popular This Week</Text>
        <Text style={styles.headerSubtitle}>
          Trending movies everyone's watching
        </Text>
      </View>

      <FlatList
        data={popularMovies}
        renderItem={renderMovieItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.moviesList}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
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
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  moviePoster: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  movieInfo: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
    lineHeight: 18,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
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
});

export default PopularMoviesScreen;
