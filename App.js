import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import TMDBService from './src/services/tmdb';
import BackendService from './src/services/backend';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AppProvider, useApp } from './src/contexts/AppContext';
import SocialFeedScreen from './src/screens/SocialFeedScreen';
import PostCreationModal from './src/components/PostCreationModal';
import AuthScreen from './src/screens/AuthScreen';
import ReviewWriteScreen from './src/screens/ReviewWriteScreen';
import WatchlistScreen from './src/screens/WatchlistScreen';
import MovieDetailScreen from './src/screens/MovieDetailScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import FriendProfileScreen from './src/screens/FriendProfileScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MovieShareScreen from './src/screens/MovieShareScreen';
import PopularMoviesScreen from './src/screens/PopularMoviesScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import { dbToClient, listLabel } from './src/utils/lists';
import { showToast } from './src/utils/toast';
import { showMoveDialog } from './src/utils/moveDialog';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 60) / 2;

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Demo movie data
const demoMovies = [
  {
    id: 1,
    title: "The Shawshank Redemption",
    poster_path: "https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    vote_average: 9.3,
    release_date: "1994-09-23"
  },
  {
    id: 2,
    title: "The Godfather",
    poster_path: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    overview: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    vote_average: 9.2,
    release_date: "1972-03-24"
  },
  {
    id: 3,
    title: "The Dark Knight",
    poster_path: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    overview: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests.",
    vote_average: 9.0,
    release_date: "2008-07-18"
  },
  {
    id: 4,
    title: "Pulp Fiction",
    poster_path: "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    overview: "The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.",
    vote_average: 8.9,
    release_date: "1994-10-14"
  }
];

// Social Review Feed - Main screen for friend reviews and activity
const HomeScreen = () => {
  const { addToList, moveToList, isInList, friends, activity, refreshData } = useApp();
  const { user } = useAuth();
  const [socialFeed, setSocialFeed] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const loadSocialFeed = async () => {
    try {
      setLoading(true);
      
      // Load friend activity and trending movies in parallel
      const [activityData, trendingData] = await Promise.all([
        refreshData(), // Refresh friend activity
        TMDBService.getTrending('movie', 'week').catch(() => ({ results: [] }))
      ]);
      
      // Set trending movies for "Friends Are Watching" section
      setTrendingMovies((trendingData.results || []).slice(0, 6));
      
      // Build social feed from activity data
      const feedItems = (activity || []).map(item => ({
        ...item,
        type: 'activity',
        timestamp: new Date(item.createdAt || Date.now()),
      }));
      
      setSocialFeed(feedItems.sort((a, b) => b.timestamp - a.timestamp));
      
    } catch (error) {
      console.error('Error loading social feed:', error);
      Alert.alert('Error', 'Failed to load activity feed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSocialFeed();
    setRefreshing(false);
  };

  useEffect(() => {
    loadSocialFeed();
  }, [activity]);

  const handleAddWithConflict = async (movie, targetList) => {
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

  const handleMoviePress = (movie) => {
    navigation.navigate('MovieDetail', { movie });
  };

  const handlePostCreated = (newPost) => {
    // Refresh the social feed to show the new post
    loadSocialFeed();
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
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (insets?.top || 0) + 12 }]}>
        <Text style={styles.title}>ShowBuff</Text>
        <Text style={styles.subtitle}>Friends' Reviews & Activity</Text>
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading your social feed...</Text>
        </View>
      ) : (
        <FlatList
          data={[
            // Add "Friends Are Watching" section if we have trending movies
            ...(trendingMovies.length > 0 ? [{ type: 'trending_section', data: trendingMovies }] : []),
            // Add social feed items
            ...socialFeed
          ]}
          renderItem={({ item }) => {
            if (item.type === 'trending_section') {
              return (
                <View style={styles.trendingSection}>
                  <Text style={styles.sectionTitle}>🎬 Popular This Week</Text>
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
          contentContainerStyle={styles.socialFeedContainer}
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
            </View>
          )}
        />
      )}
      
      {/* Create Post Floating Action Button */}
      <TouchableOpacity 
        style={styles.quickReviewFAB}
        onPress={() => {
          console.log('=== FAB PRESSED ===');
          console.log('Current showPostModal state:', showPostModal);
          console.log('Setting showPostModal to true');
          setShowPostModal(true);
          console.log('PostCreationModal should open now');
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Post Creation Modal */}
      <PostCreationModal
        visible={showPostModal}
        onClose={() => setShowPostModal(false)}
        onPostCreated={handlePostCreated}
      />
    </View>
  );
};

// Search screen with movie search functionality
const SearchScreen = () => {
  const { addToList, moveToList, isInList } = useApp();
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const insets = useSafeAreaInsets();



  const searchMovies = async (searchQuery) => {
    if (!searchQuery.trim()) {
      setMovies([]);
      return;
    }

    try {
      setLoading(true);
      const data = await TMDBService.searchMulti(searchQuery);
      setMovies(data.results || []);
    } catch (error) {
      console.error('Error searching movies:', error);
      Alert.alert('Error', 'Failed to search movies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInput = (text) => {
    setQuery(text);
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    const newTimeout = setTimeout(() => {
      searchMovies(text);
    }, 500);
    
    setSearchTimeout(newTimeout);
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
      `${movie.overview || 'No overview available.'}\n\nRating: ${TMDBService.formatVoteAverage(movie.vote_average)}/10\nRelease: ${TMDBService.getYear(movie.release_date || movie.first_air_date)}\nType: ${movie.media_type === 'tv' ? 'TV Show' : 'Movie'}`,
      actions
    );
  };

  const renderMovieItem = ({ item }) => {
    const inWatchlist = isInList(item.id, 'watchlist');
    const inCurrentlyWatching = isInList(item.id, 'currently_watching');
    const inWatched = isInList(item.id, 'watched');

    return (
      <TouchableOpacity 
        style={styles.searchMovieCard}
        onPress={() => handleMoviePress(item)}
      >
        <Image
          source={{ uri: TMDBService.getImageUrl(item.poster_path, 'w342') }}
          style={styles.searchMoviePoster}
          resizeMode="cover"
        />
        <View style={styles.searchMovieInfo}>
          <Text style={styles.searchMovieTitle} numberOfLines={2}>
            {item.title || item.name}
          </Text>
          <View style={styles.searchMovieMetaContainer}>
            <Text style={styles.searchMovieYear}>
              {TMDBService.getYear(item.release_date || item.first_air_date)}
            </Text>
            <Text style={styles.searchMovieType}>
              {item.media_type === 'tv' ? 'TV' : 'Movie'}
            </Text>
            {(inWatchlist || inCurrentlyWatching || inWatched) && (
              <View style={styles.searchStatusIndicator}>
                <Ionicons 
                  name={
                    inWatched ? 'checkmark-circle' :
                    inCurrentlyWatching ? 'play-circle' :
                    'bookmark'
                  }
                  size={14} 
                  color="#3B82F6" 
                />
              </View>
            )}
          </View>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.rating}>{TMDBService.formatVoteAverage(item.vote_average)}</Text>
          </View>
          <Text style={styles.searchMovieOverview} numberOfLines={3}>
            {item.overview || 'No overview available.'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.searchHeader, { paddingTop: (insets?.top || 0) + 12 }]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies and TV shows..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={handleSearchInput}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => searchMovies(query)}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : movies.length > 0 ? (
        <FlatList
          data={movies}
          renderItem={renderMovieItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.searchResults}
          showsVerticalScrollIndicator={false}
        />
      ) : query ? (
        <View style={styles.emptyState}>
          <Ionicons name="film-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No movies found</Text>
          <Text style={styles.emptySubtitle}>Try searching for something else</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Search Movies</Text>
          <Text style={styles.emptySubtitle}>Find your next favorite movie</Text>
        </View>
      )}
    </View>
  );
};





// Main app component with authentication
const MainApp = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading ShowBuff...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Helper: wrap a screen with horizontal swipe to change bottom tab
  const withSwipe = (ScreenComponent, tabOrder, tabName) => (props) => {
    const swipeThreshold = 50;
    const onHandlerStateChange = ({ nativeEvent }) => {
      if (nativeEvent.state === State.END) {
        // Let Watchlist screen handle its own swipe logic for sub-tabs and edge navigation
        if (tabName === 'Watchlist') return;
        const dx = nativeEvent.translationX;
        const currentIdx = tabOrder.indexOf(tabName);
        if (dx <= -swipeThreshold && currentIdx < tabOrder.length - 1) {
          const next = tabOrder[currentIdx + 1];
          if (next === 'Watchlist') {
            props.navigation.navigate('Watchlist', { initialSubTab: 'watchlist' });
          } else {
            props.navigation.navigate(next);
          }
        } else if (dx >= swipeThreshold && currentIdx > 0) {
          const prev = tabOrder[currentIdx - 1];
          if (prev === 'Watchlist') {
            // Coming from Friends -> Watchlist should land on 'watched'
            props.navigation.navigate('Watchlist', { initialSubTab: 'watched' });
          } else {
            props.navigation.navigate(prev);
          }
        }
      }
    };
    return (
      <PanGestureHandler onHandlerStateChange={onHandlerStateChange}>
        <View style={{ flex: 1 }}>
          <ScreenComponent {...props} />
        </View>
      </PanGestureHandler>
    );
  };

  // Tab Navigator Component
  const TabNavigator = () => {
    const insets = useSafeAreaInsets();
    const bottom = insets?.bottom || 0;
    const tabOrder = ['Home', 'Search', 'Watchlist', 'Friends', 'Profile'];
    return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            paddingBottom: Math.max(bottom, 6),
            paddingTop: 6,
            height: 56 + bottom,
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Search') {
              iconName = focused ? 'search' : 'search-outline';
            } else if (route.name === 'Watchlist') {
              iconName = focused ? 'bookmark' : 'bookmark-outline';
            } else if (route.name === 'Friends') {
              iconName = focused ? 'people' : 'people-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person' : 'person-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#6B7280',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={withSwipe(SocialFeedScreen, tabOrder, 'Home')} />
        <Tab.Screen name="Search" component={withSwipe(SearchScreen, tabOrder, 'Search')} />
        <Tab.Screen name="Watchlist" component={withSwipe(WatchlistScreen, tabOrder, 'Watchlist')} />
        <Tab.Screen name="Friends" component={withSwipe(FriendsScreen, tabOrder, 'Friends')} />
        <Tab.Screen name="Profile" component={withSwipe(ProfileScreen, tabOrder, 'Profile')} />
      </Tab.Navigator>
    );
  };

  return (
    <AppProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={TabNavigator} />
          <Stack.Screen 
            name="MovieDetail" 
            component={MovieDetailScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen 
            name="PopularMovies" 
            component={PopularMoviesScreen} 
            options={{ 
              headerShown: false 
            }} 
          />
          <Stack.Screen 
            name="Notifications" 
            component={NotificationsScreen} 
            options={{ 
              headerShown: false 
            }} 
          />
          <Stack.Screen 
            name="FriendProfile" 
            component={FriendProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Chat" 
            component={ChatScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen 
            name="MovieShare" 
            component={MovieShareScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen 
            name="ReviewWrite" 
            component={ReviewWriteScreen}
            options={{ presentation: 'modal' }}
          />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </AppProvider>
  );
};

// Root app component with providers
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

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
    marginTop: 2,
    textAlign: 'center',
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
  searchHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
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
  searchResults: {
    padding: 20,
  },
  searchMovieCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchMoviePoster: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 16,
  },
  searchMovieInfo: {
    flex: 1,
  },
  searchMovieTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
    lineHeight: 20,
  },
  searchMovieMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  searchMovieYear: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
  },
  searchMovieType: {
    fontSize: 12,
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '500',
  },
  searchStatusIndicator: {
    marginLeft: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 2,
  },
  searchMovieOverview: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginTop: 8,
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
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 20,
  },
});
