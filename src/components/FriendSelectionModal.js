import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';

const FriendSelectionModal = ({ 
  visible, 
  onClose, 
  movie, 
  onFriendSelect 
}) => {
  const { friends, shareMovie } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFriends, setFilteredFriends] = useState([]);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = friends.filter(friend =>
        friend.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        friend.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFriends(filtered);
    } else {
      setFilteredFriends(friends || []);
    }
  }, [searchQuery, friends]);

  const handleShareWithFriend = async (friend) => {
    try {
      setSharing(true);
      const result = await shareMovie(friend.id, movie);
      
      if (result.success) {
        onFriendSelect(friend, movie);
        onClose();
      } else {
        console.error('Failed to share movie:', result.error);
      }
    } catch (error) {
      console.error('Error sharing movie:', error);
    } finally {
      setSharing(false);
    }
  };

  const renderFriendItem = (friend) => (
    <TouchableOpacity
      key={friend.id}
      style={styles.friendItem}
      onPress={() => handleShareWithFriend(friend)}
      disabled={sharing}
    >
      <View style={styles.friendAvatar}>
        <Text style={styles.friendAvatarText}>
          {friend.username?.charAt(0).toUpperCase() || 'U'}
        </Text>
      </View>
      
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{friend.username}</Text>
        <Text style={styles.friendEmail}>{friend.email}</Text>
      </View>
      
      <Ionicons name="send" size={20} color="#007AFF" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#1F2937" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Share Movie</Text>
            <Text style={styles.headerSubtitle}>
              Select a friend to share "{movie?.title || movie?.name}"
            </Text>
          </View>
        </View>

        {/* Movie Preview */}
        <View style={styles.moviePreview}>
          {movie?.poster_path && (
            <Image
              source={{ uri: `https://image.tmdb.org/t/p/w92${movie.poster_path}` }}
              style={styles.moviePoster}
            />
          )}
          <View style={styles.movieInfo}>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movie?.title || movie?.name}
            </Text>
            <Text style={styles.movieYear}>
              {movie?.release_date?.split('-')[0] || movie?.first_air_date?.split('-')[0]}
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Friends List */}
        <ScrollView style={styles.friendsList} showsVerticalScrollIndicator={false}>
          {sharing && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Sharing movie...</Text>
            </View>
          )}
          
          {filteredFriends.length > 0 ? (
            filteredFriends.map(renderFriendItem)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No friends found' : 'No friends yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Add some friends to start sharing movies!'
                }
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 8,
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  moviePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8F9FA',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 12,
  },
  moviePoster: {
    width: 40,
    height: 60,
    borderRadius: 6,
    marginRight: 12,
  },
  movieInfo: {
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
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  friendsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#007AFF',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default FriendSelectionModal;
