import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import TMDBService from '../services/tmdb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ChatScreen = ({ route, navigation }) => {
  const { friend } = route.params;
  const { 
    getConversation, 
    sendMessage, 
    shareMovie,
    refreshData 
  } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    loadConversation();
    // Set up real-time message updates (in a real app, this would be WebSocket)
    const interval = setInterval(loadConversation, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadConversation = async () => {
    try {
      const conversation = await getConversation(friend.id);
      setMessages(conversation.messages || []);
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      setLoading(true);
      const result = await sendMessage(friend.id, messageText);
      if (result.success) {
        // Add message to local state immediately for better UX
        const newMsg = {
          id: Date.now(),
          senderId: user.id,
          senderUsername: user.username,
          message: messageText,
          messageType: 'text',
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, newMsg]);
        
        // Scroll to bottom
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        Alert.alert('Error', result.error || 'Failed to send message');
        setNewMessage(messageText); // Restore message on error
      }
    } catch (error) {
      console.error('Error sending message, rolling back:', error);
      Alert.alert('Error', 'Failed to send message');
      setNewMessage(messageText);
    } finally {
      setLoading(false);
    }
  };

  const handleShareMovie = () => {
    navigation.navigate('MovieShare', { 
      friend,
      onShare: async (movie) => {
        try {
          const result = await shareMovie(friend.id, movie);
          if (result.success) {
            // Add movie share to local messages
            const shareMsg = {
              id: Date.now(),
              senderId: user.id,
              senderUsername: user.username,
              message: `Recommended: ${movie.title || movie.name}`,
              messageType: 'movie_share',
              movieData: movie,
              createdAt: new Date().toISOString(),
            };
            setMessages(prev => [...prev, shareMsg]);
            
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
          } else {
            Alert.alert('Error', result.error || 'Failed to share movie');
          }
        } catch (error) {
          console.error('Error sharing movie:', error);
          Alert.alert('Error', 'Failed to share movie');
        }
      }
    });
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderMessage = (message, index) => {
    const isOwnMessage = message.senderId === user.id;
    const isMovieShare = message.messageType === 'movie_share';
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
    const showAvatar = !nextMessage || nextMessage.senderId !== message.senderId;
    const showTail = !nextMessage || nextMessage.senderId !== message.senderId;
    const isConsecutive = previousMessage && previousMessage.senderId === message.senderId;

    const messageTime = new Date(message.createdAt);
    const timeString = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View key={message.id || index} style={[
        styles.messageContainer,
        isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer,
        isConsecutive && styles.consecutiveMessage
      ]}>
        {/* Message Bubble */}
        <View style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble,
          showTail && (isOwnMessage ? styles.ownMessageTail : styles.otherMessageTail),
          isMovieShare && styles.movieShareBubble
        ]}>
          {isMovieShare ? (
            <View style={styles.movieShareContent}>
              <View style={styles.movieShareHeader}>
                <Ionicons name="film" size={16} color={isOwnMessage ? "#FFFFFF" : "#007AFF"} />
                <Text style={[styles.movieShareLabel, { color: isOwnMessage ? "#FFFFFF" : "#007AFF" }]}>
                  Movie Recommendation
                </Text>
              </View>
              
              <TouchableOpacity 
                style={styles.movieInfo}
                onPress={() => navigation.navigate('MovieDetail', { movie: message.movieData })}
              >
                {message.movieData?.poster_path && (
                  <Image
                    source={{ 
                      uri: `https://image.tmdb.org/t/p/w92${message.movieData.poster_path}` 
                    }}
                    style={styles.moviePoster}
                  />
                )}
                <View style={styles.movieDetails}>
                  <Text style={[styles.movieTitle, { color: isOwnMessage ? "#FFFFFF" : "#1F2937" }]}>
                    {message.movieData?.title || message.movieData?.name || 'Unknown Movie'}
                  </Text>
                  {(message.movieData?.release_date || message.movieData?.first_air_date) && (
                    <Text style={[styles.movieYear, { color: isOwnMessage ? "#E5E7EB" : "#6B7280" }]}>
                      {message.movieData?.release_date?.split('-')[0] || 
                       message.movieData?.first_air_date?.split('-')[0]}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <Text style={[styles.movieShareMessage, { color: isOwnMessage ? "#FFFFFF" : "#1F2937" }]}>
                {message.message}
              </Text>
            </View>
          ) : (
            <Text style={[
              styles.messageText,
              isOwnMessage ? styles.ownMessageText : styles.otherMessageText
            ]}>
              {message.message}
            </Text>
          )}
        </View>

        {/* Avatar and timestamp */}
        <View style={styles.messageFooter}>
          {!isOwnMessage && showAvatar && (
            <View style={styles.messageAvatar}>
              <Text style={styles.messageAvatarText}>
                {friend.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          
          {showAvatar && (
            <Text style={[
              styles.messageTime,
              isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime
            ]}>
              {timeString}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 25 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets?.top || 0) + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        
        <View style={styles.friendInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {friend.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.friendName}>{friend.username}</Text>
        </View>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareMovie}
        >
          <Ionicons name="film-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length > 0 ? (
          messages.map((message, index) => renderMessage(message, index))
        ) : (
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyChatTitle}>Start the conversation</Text>
            <Text style={styles.emptyChatSubtitle}>
              Send a message or share a movie recommendation
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Message Input */}
      <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : (insets?.bottom || 0) + 12 }]}>
        <TextInput
          style={styles.messageInput}
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
          placeholderTextColor="#9CA3AF"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!newMessage.trim() || loading) && styles.disabledButton]}
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || loading}
        >
          <Ionicons 
            name="send" 
            size={20} 
            color={(!newMessage.trim() || loading) ? '#9CA3AF' : '#FFFFFF'} 
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  friendName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  shareButton: {
    padding: 8,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
  },
  // New Professional Message Container Styles
  messageContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignItems: 'flex-start',
  },
  consecutiveMessage: {
    marginBottom: 4,
  },
  // Professional Message Bubble Styles
  messageBubble: {
    maxWidth: '80%',
    minWidth: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownMessageBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 8,
  },
  otherMessageBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E9',
    borderBottomLeftRadius: 8,
  },
  // Message Tails
  ownMessageTail: {
    borderBottomRightRadius: 4,
  },
  otherMessageTail: {
    borderBottomLeftRadius: 4,
  },
  movieShareBubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  // Professional Text Styles
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#1F2937',
  },
  // Message Footer with Avatar and Time
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  messageAvatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  messageTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  ownMessageTime: {
    color: '#6B7280',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: '#9CA3AF',
  },
  // Movie Share Enhanced Styles
  movieShareContent: {
    gap: 10,
  },
  movieShareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  movieShareLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  movieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  moviePoster: {
    width: 44,
    height: 66,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  movieDetails: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
    lineHeight: 20,
  },
  movieYear: {
    fontSize: 13,
    fontWeight: '500',
  },
  movieShareMessage: {
    fontSize: 15,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  // Empty State
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyChatTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyChatSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  // Professional Input Container
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E1E5E9',
    gap: 12,
  },
  messageInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E1E5E9',
    borderRadius: 22,
    backgroundColor: '#F8F9FA',
    fontSize: 16,
    textAlignVertical: 'top',
    color: '#1F2937',
    fontWeight: '400',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  disabledButton: {
    backgroundColor: '#E1E5E9',
    shadowOpacity: 0,
    elevation: 0,
  },
  shareButton: {
    padding: 8,
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 15,
    marginBottom: 5,
  },
  emptyChatSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
    minHeight: 65,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  messageInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 36,
    borderWidth: 0,
    backgroundColor: '#F2F2F7',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    color: '#000000',
    marginRight: 12,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#C7C7CC',
    shadowOpacity: 0,
    elevation: 0,
  },
});

export default ChatScreen;
