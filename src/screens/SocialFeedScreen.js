import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import TMDBService from '../services/tmdb';
import BackendService from '../services/backend';
import { dbToClient, listLabel } from '../utils/lists';
import { showToast } from '../utils/toast';
import { showMoveDialog } from '../utils/moveDialog';
import PostCreationModal from '../components/PostCreationModal';

const SocialFeedScreen = ({ navigation }) => {
  const { addToList, moveToList, isInList, unreadMessageCount, loadNotifications } = useApp();
  const { user } = useAuth();
  const [socialFeed, setSocialFeed] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [commentsModal, setCommentsModal] = useState({ visible: false, post: null, comments: [], sort: 'top', loading: false, text: '' });
  const insets = useSafeAreaInsets();

  const currentUserId = user?.id || user?.userId || user?._id || user?.uid;

  const loadSocialFeed = async () => {
    try {
      setLoading(true);
      
      // Load trending movies without calling refreshData to avoid circular dependency
      const trendingData = await TMDBService.getTrending('movie', 'week').catch(() => ({ results: [] }));
      
      // Set trending movies for "Popular This Week" section
      setTrendingMovies((trendingData.results || []).slice(0, 8));
      
      // Fetch real social feed from backend and merge with existing without deleting
      const res = await BackendService.getSocialFeed();
      const incoming = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);

      // Normalize incoming items
      const normalized = (incoming || []).map(it => ({
        ...it,
        type: it.type || 'activity',
        userName: it.userName || it.username || 'User',
        createdAt: it.createdAt || it.at || new Date().toISOString(),
      }));

      // Merge incoming with existing without removing existing entries
      setSocialFeed(prev => {
        const map = new Map();
        const makeKey = (x) => x.id || `${x.userId || 'u'}-${x.createdAt}-${(x.content || '').slice(0, 20)}`;
        // Keep existing
        (prev || []).forEach(p => map.set(makeKey(p), p));
        // Add new ones
        normalized.forEach(n => {
          const key = makeKey(n);
          // Always let incoming override to reflect latest server values
          map.set(key, n);
        });
        const merged = Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return merged;
      });
      
    } catch (error) {
      console.error('Error loading social feed:', error);
      Alert.alert('Error', 'Failed to load social feed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ===== Comments helpers =====
  const getTopComments = (post) => {
    const arr = Array.isArray(post?.comments) ? [...post.comments] : [];
    arr.sort((a, b) => {
      const la = Array.isArray(a.likes) ? a.likes.length : 0;
      const lb = Array.isArray(b.likes) ? b.likes.length : 0;
      if (lb !== la) return lb - la;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return arr.slice(0, 3);
  };

  const renderCommentsPreview = (post) => {
    const top = getTopComments(post);
    if (!top || top.length === 0) return null;
    return (
      <View style={styles.commentsPreview}>
        {top.map((c) => {
          const likes = Array.isArray(c.likes) ? c.likes.length : 0;
          const liked = Array.isArray(c.likes) && c.likes.some(uid => Number(uid) === Number(currentUserId));
          return (
            <View key={c.id} style={styles.commentRow}>
              <View style={styles.commentBubble}>
                <Text style={styles.commentUser}>{c.userName}</Text>
                <Text style={styles.commentText} numberOfLines={2}>{c.text}</Text>
              </View>
              <TouchableOpacity style={styles.commentLikeBtn} onPress={() => handleLikeCommentInline(post, c)}>
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? '#EF4444' : '#6B7280'} />
                <Text style={[styles.commentLikeText, liked && { color: '#EF4444' }]}>{likes}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <TouchableOpacity onPress={() => openCommentsModal(post)}>
          <Text style={styles.viewAllCommentsText}>View all comments</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const handleLikeCommentInline = async (post, comment) => {
    try {
      // Optimistic update in feed preview
      setSocialFeed(prev => prev.map(p => {
        if (p.id !== post.id) return p;
        const comments = Array.isArray(p.comments) ? p.comments.map(c => {
          if (c.id !== comment.id) return c;
          const likes = Array.isArray(c.likes) ? [...c.likes] : [];
          const idx = likes.findIndex(uid => Number(uid) === Number(currentUserId));
          if (idx >= 0) likes.splice(idx, 1); else likes.push(currentUserId);
          return { ...c, likes };
        }) : [];
        return { ...p, comments };
      }));

      const res = await BackendService.likeComment(post.id, comment.id);
      if (res?.success && res?.post) {
        setSocialFeed(prev => prev.map(p => p.id === post.id ? res.post : p));
      }
    } catch (e) {
      // No-op, preview will resync on next refresh
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSocialFeed();
    await loadNotifications(); // Refresh notifications on pull-to-refresh
    setRefreshing(false);
  };

  const handleNotificationPress = () => {
    navigation.navigate('Notifications');
  };

  // ===== Full Comments Modal logic =====
  const openCommentsModal = async (post) => {
    setCommentsModal({ visible: true, post, comments: [], sort: 'top', loading: true, text: '' });
    try {
      const res = await BackendService.getPostComments(post.id, { sort: 'top' });
      const list = Array.isArray(res?.comments) ? res.comments : [];
      setCommentsModal((s) => ({ ...s, loading: false, comments: list }));
    } catch (e) {
      setCommentsModal((s) => ({ ...s, loading: false }));
      console.error('Failed to load comments', e);
      Alert.alert('Error', 'Failed to load comments');
    }
  };

  const closeCommentsModal = () => setCommentsModal({ visible: false, post: null, comments: [], sort: 'top', loading: false, text: '' });

  const changeCommentsSort = async (sort) => {
    if (!commentsModal.post) return;
    setCommentsModal((s) => ({ ...s, sort, loading: true }));
    try {
      const res = await BackendService.getPostComments(commentsModal.post.id, { sort: sort === 'top' ? 'top' : undefined });
      let list = Array.isArray(res?.comments) ? res.comments : [];
      if (sort !== 'top') {
        // Newest
        list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      setCommentsModal((s) => ({ ...s, loading: false, comments: list }));
    } catch (e) {
      setCommentsModal((s) => ({ ...s, loading: false }));
    }
  };

  const handleAddCommentInModal = async () => {
    const text = String(commentsModal.text || '').trim();
    if (!text) {
      showToast('Comment cannot be empty');
      return;
    }
    const postId = commentsModal.post?.id;
    if (!postId) return;
    try {
      const res = await BackendService.addPostComment(postId, text);
      if (res?.success && res?.post) {
        // Sync feed post
        setSocialFeed((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
        // Reload modal comments as order may change
        await changeCommentsSort(commentsModal.sort);
        setCommentsModal((s) => ({ ...s, text: '' }));
      } else {
        showToast('Failed to add comment');
      }
    } catch (e) {
      console.error('Error adding comment:', e);
      Alert.alert('Error', 'Failed to add comment.');
    }
  };

  const handleLikeCommentInModal = async (comment) => {
    const post = commentsModal.post;
    if (!post) return;
    try {
      // Optimistic update in modal
      setCommentsModal((s) => ({
        ...s,
        comments: (s.comments || []).map((c) => {
          if (c.id !== comment.id) return c;
          const likes = Array.isArray(c.likes) ? [...c.likes] : [];
          const idx = likes.findIndex((uid) => Number(uid) === Number(currentUserId));
          if (idx >= 0) likes.splice(idx, 1);
          else likes.push(currentUserId);
          return { ...c, likes };
        }),
      }));

      const res = await BackendService.likeComment(post.id, comment.id);
      if (res?.success && res?.post) {
        // Sync feed post
        setSocialFeed((prev) => prev.map((p) => (p.id === post.id ? res.post : p)));
        // Resync modal comment from response comment if provided
        if (res.comment) {
          setCommentsModal((s) => ({
            ...s,
            comments: (s.comments || []).map((c) => (c.id === comment.id ? res.comment : c)),
          }));
        }
      }
    } catch (e) {
      // No-op; will resync next fetch
    }
  };

  useEffect(() => {
    loadSocialFeed();
    loadNotifications(); // Load notification counts on screen load
  }, []);

  const handleMoviePress = (movie) => {
    navigation.navigate('MovieDetail', { movie });
  };

  const handleTrendingMovieActions = (movie) => {
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

  const handleQuickReview = () => {
    console.log('=== FAB PRESSED ===');
    console.log('Setting showPostModal to true');
    setShowPostModal(true);
  };

  const handlePostCreated = (newPost) => {
    console.log('Post created successfully. Refreshing feed...', newPost?.id);
    loadSocialFeed();
  };

  const renderSocialFeedItem = ({ item }) => {
    const diffMs = Math.max(0, Date.now() - new Date(item.createdAt || Date.now()).getTime());
    const hoursAgo = Math.floor(diffMs / (1000 * 60 * 60));
    const timeText = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo/24)}d ago`;
    const reactionsCount = typeof item.reactions === 'number' ? item.reactions : Array.isArray(item.reactions) ? item.reactions.length : 0;
    const commentsCount = typeof item.comments === 'number' ? item.comments : Array.isArray(item.comments) ? item.comments.length : 0;
    const isLiked = Array.isArray(item.reactions) && item.reactions.some(uid => Number(uid) === Number(currentUserId));
    
    return (
      <View style={styles.socialFeedItem}>
        <View style={styles.feedHeader}>
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{item.userName}</Text>
              <Text style={styles.feedTime}>{timeText}</Text>
            </View>
          </View>
        </View>
        
        <Text style={styles.feedContent}>{item.content}</Text>
        
        {item.movie && (
          <TouchableOpacity style={styles.movieReference} onPress={() => handleMoviePress(item.movie)}>
            <Image 
              source={{ 
                uri: item.movie.poster_path 
                  ? `https://image.tmdb.org/t/p/w200${item.movie.poster_path}`
                  : 'https://via.placeholder.com/60x90?text=No+Image'
              }}
              style={styles.feedMoviePoster}
              resizeMode="cover"
            />
            <View style={styles.movieInfo}>
              <Text style={styles.feedMovieTitle}>{item.movie.title}</Text>
              <View style={styles.movieMetaContainer}>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.rating}>{item.movie.vote_average?.toFixed(1)}</Text>
                </View>
                {item.rating && (
                  <View style={styles.userRating}>
                    <Text style={styles.userRatingText}>★ {item.rating}/10</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
        
        {renderCommentsPreview(item)}
        <View style={styles.feedFooter}>
          <TouchableOpacity style={styles.feedAction} onPress={() => handleToggleLike(item)}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={16} color={isLiked ? '#EF4444' : '#6B7280'} />
            <Text style={[styles.feedActionText, isLiked && { color: '#EF4444' }]}>{reactionsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedAction} onPress={() => openCommentsModal(item)}>
            <Ionicons name="chatbubble-outline" size={16} color="#6B7280" />
            <Text style={styles.feedActionText}>{commentsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedAction} onPress={() => handleSharePost(item)}>
            <Ionicons name="share-outline" size={16} color="#6B7280" />
            <Text style={styles.feedActionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const handleToggleLike = async (post) => {
    try {
      // Optimistic update
      const liked = Array.isArray(post.reactions) && post.reactions.some(uid => Number(uid) === Number(currentUserId));
      const newReactions = Array.isArray(post.reactions) ? [...post.reactions] : [];
      if (liked) {
        const idx = newReactions.findIndex(uid => Number(uid) === Number(currentUserId));
        if (idx >= 0) newReactions.splice(idx, 1);
      } else {
        newReactions.push(currentUserId);
      }
      setSocialFeed(prev => prev.map(p => p.id === post.id ? { ...p, reactions: newReactions } : p));

      const res = await BackendService.likePost(post.id);
      if (!res?.success && !Array.isArray(res?.reactions) && !res?.post) {
        // Revert on failure
        setSocialFeed(prev => prev.map(p => p.id === post.id ? post : p));
        showToast('Failed to update like');
        return;
      }
      // Sync with server response if provided
      const updated = res.post || post;
      setSocialFeed(prev => prev.map(p => p.id === post.id ? updated : p));
    } catch (e) {
      console.error('Error toggling like:', e);
      // Revert on error
      setSocialFeed(prev => prev.map(p => p.id === post.id ? post : p));
      Alert.alert('Error', 'Failed to update like.');
    }
  };

  // Removed legacy single comment modal handlers (replaced by full comments modal above)

  const handleSharePost = async (post) => {
    try {
      const friends = await BackendService.getFriends();
      const list = Array.isArray(friends) ? friends : (friends?.friends || []);
      if (!Array.isArray(list) || list.length === 0) {
        Alert.alert('No Friends', 'Add some friends to share posts with them.');
        return;
      }

      const shareTo = async (friend) => {
        try {
          let result;
          if (post.movie) {
            result = await BackendService.shareMovie(friend.id || friend.userId, post.movie);
          } else {
            const msg = `Shared a post from ${post.userName}: ${post.content}`;
            result = await BackendService.sendMessage(friend.id || friend.userId, msg);
          }
          if (result?.success) {
            showToast(`Shared with ${friend.username || friend.name || 'friend'}`);
          } else {
            Alert.alert('Share Failed', result?.error || 'Could not share post.');
          }
        } catch (e) {
          console.error('Error sharing post:', e);
          Alert.alert('Share Failed', 'Could not share post.');
        }
      };

      const buttons = list.slice(0, 6).map(f => ({
        text: f.username || f.name || `Friend ${f.id}`,
        onPress: () => shareTo(f),
      }));
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Share Post', 'Choose a friend to share with:', buttons);
    } catch (e) {
      console.error('Error loading friends for share:', e);
      Alert.alert('Error', 'Failed to load friends.');
    }
  };

  const renderTrendingMovieItem = ({ item }) => {
    const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
    const isInWatchlist = isInList(item.id, 'watchlist');
    const isInCurrentlyWatching = isInList(item.id, 'currently_watching');
    const isInWatched = isInList(item.id, 'watched');

    return (
      <TouchableOpacity 
        style={styles.trendingMovieCard} 
        onPress={() => handleMoviePress(item)}
        onLongPress={() => handleTrendingMovieActions(item)}
        activeOpacity={0.8}
      >
        <Image 
          source={{ 
            uri: item.poster_path 
              ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
              : 'https://via.placeholder.com/120x180?text=No+Image'
          }}
          style={styles.trendingMoviePoster}
          resizeMode="cover"
        />
        
        {(isInWatchlist || isInCurrentlyWatching || isInWatched) && (
          <View style={styles.statusBadge}>
            <Ionicons 
              name={
                isInWatched ? 'checkmark-circle' :
                isInCurrentlyWatching ? 'play-circle' : 'bookmark'
              }
              size={12} 
              color="#FFFFFF"
            />
          </View>
        )}
        
        <View style={styles.trendingMovieOverlay}>
          <Text style={styles.trendingMovieTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.trendingMovieYear}>{year}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFeedContent = () => {
    const feedData = [];
    
    // Add trending section if we have movies
    if (trendingMovies.length > 0) {
      feedData.push({ type: 'trending_section', data: trendingMovies });
    }
    
    // Add social feed items
    feedData.push(...socialFeed);
    
    return (
      <FlatList
        data={feedData}
        renderItem={({ item }) => {
          if (item.type === 'trending_section') {
            return (
              <View style={styles.trendingSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🔥 Popular This Week</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('PopularMovies')}>
                    <Text style={styles.seeAllText}>See All</Text>
                  </TouchableOpacity>
                </View>
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
        contentContainerStyle={styles.feedContainer}
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
            <TouchableOpacity style={styles.addFriendsBtn} onPress={() => navigation.navigate('Friends')}>
              <Text style={styles.addFriendsBtnText}>Find Friends</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>ShowBuff</Text>
            <Text style={styles.subtitle}>Friends' Reviews & Activity</Text>
          </View>
          <TouchableOpacity style={styles.notificationBtn} onPress={handleNotificationPress}>
            <Ionicons name="notifications-outline" size={24} color="#1F2937" />
            {unreadMessageCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading your social feed...</Text>
        </View>
      ) : (
        renderFeedContent()
      )}
      
      {/* Quick Review Floating Action Button */}
      <TouchableOpacity 
        style={styles.quickReviewFAB}
        onPress={handleQuickReview}
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

      {/* Full Comments Modal */}
      <Modal
        visible={commentsModal.visible}
        animationType="slide"
        transparent
        onRequestClose={closeCommentsModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%', width: '100%' }]}> 
            <View style={styles.commentsHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={closeCommentsModal}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.sortTabs}>
              <TouchableOpacity onPress={() => changeCommentsSort('top')} style={[styles.sortTab, commentsModal.sort === 'top' && styles.sortTabActive]}>
                <Text style={[styles.sortTabText, commentsModal.sort === 'top' && styles.sortTabTextActive]}>Top</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => changeCommentsSort('new')} style={[styles.sortTab, commentsModal.sort !== 'top' && styles.sortTabActive]}>
                <Text style={[styles.sortTabText, commentsModal.sort !== 'top' && styles.sortTabTextActive]}>Newest</Text>
              </TouchableOpacity>
            </View>

            {commentsModal.loading ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color="#3B82F6" />
              </View>
            ) : (
              <FlatList
                data={commentsModal.comments}
                keyExtractor={(c) => c.id}
                style={styles.commentsList}
                renderItem={({ item: c }) => {
                  const likes = Array.isArray(c.likes) ? c.likes.length : 0;
                  const liked = Array.isArray(c.likes) && c.likes.some((uid) => Number(uid) === Number(currentUserId));
                  return (
                    <View style={styles.commentRow}>
                      <View style={styles.commentBubble}>
                        <Text style={styles.commentUser}>{c.userName}</Text>
                        <Text style={styles.commentText}>{c.text}</Text>
                      </View>
                      <TouchableOpacity style={styles.commentLikeBtn} onPress={() => handleLikeCommentInModal(c)}>
                        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? '#EF4444' : '#6B7280'} />
                        <Text style={[styles.commentLikeText, liked && { color: '#EF4444' }]}>{likes}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={() => (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#6B7280' }}>No comments yet. Be the first to comment!</Text>
                  </View>
                )}
              />
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                placeholderTextColor="#9CA3AF"
                value={commentsModal.text}
                onChangeText={(t) => setCommentsModal((s) => ({ ...s, text: t }))}
                multiline
                maxLength={500}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleAddCommentInModal}>
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  notificationBtn: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
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
  feedContainer: {
    padding: 16,
  },
  
  // Trending Section Styles
  trendingSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  seeAllText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  trendingList: {
    paddingLeft: 4,
  },
  trendingMovieCard: {
    width: 120,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  trendingMoviePoster: {
    width: 120,
    height: 180,
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingMovieOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
  },
  trendingMovieTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  trendingMovieYear: {
    fontSize: 10,
    color: '#E5E7EB',
  },
  
  // Social Feed Item Styles
  socialFeedItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  feedTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reactionBtn: {
    padding: 4,
  },
  feedContent: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  
  // Movie Reference Styles
  movieReference: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  feedMoviePoster: {
    width: 50,
    height: 75,
    borderRadius: 6,
    marginRight: 12,
  },
  movieInfo: {
    flex: 1,
  },
  feedMovieTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  movieMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  rating: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 2,
    fontWeight: '500',
  },
  userRating: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userRatingText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
  },
  
  // Feed Footer Styles
  feedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  feedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  feedActionText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
    fontWeight: '500',
  },
  
  // Empty State Styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
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
    marginBottom: 24,
  },
  addFriendsBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFriendsBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Quick Review FAB
  quickReviewFAB: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  modalInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    color: '#111827',
  },
  modalActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalSubmit: {
    backgroundColor: '#3B82F6',
  },
  modalCancelText: {
    color: '#374151',
    fontWeight: '600',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  
  // Comments preview styles
  commentsPreview: {
    marginTop: 8,
    paddingTop: 4,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  commentBubble: {
    flexShrink: 1,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  commentUser: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 13,
    color: '#374151',
  },
  commentLikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  commentLikeText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  viewAllCommentsText: {
    marginTop: 6,
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },

  // Full comments modal styles
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sortTabs: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  sortTab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  sortTabActive: {
    backgroundColor: '#DBEAFE',
  },
  sortTabText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  sortTabTextActive: {
    color: '#1D4ED8',
  },
  commentsList: {
    marginBottom: 8,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#111827',
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default SocialFeedScreen;
