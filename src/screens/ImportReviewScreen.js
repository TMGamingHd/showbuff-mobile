import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import ImporterService from '../services/importer';
import { showToast } from '../utils/toast';

const LIST_OPTIONS = [
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'currently_watching', label: 'Currently Watching' },
  { key: 'watched', label: 'Watched' },
];

const ImportReviewScreen = ({ route, navigation }) => {
  const { importId: routeImportId } = route.params || {};
  const { user } = useAuth();
  const { refreshData } = useApp();
  const insets = useSafeAreaInsets();

  const [importId] = useState(routeImportId || null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);
  const [selections, setSelections] = useState({}); // { extractedTitleId: { matchId, listType } }
  const [searchStates, setSearchStates] = useState({}); // { extractedTitleId: { query, year, loading } }

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;

    const loadDetails = async () => {
      if (!importId) {
        setError('Missing import id');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await ImporterService.getImportDetails(importId);
        if (!isMounted) return;
        setDetails(data);
      } catch (e) {
        console.error('Failed to load import details', e);
        if (!isMounted) return;
        setError(e?.message || 'Failed to load import');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [importId]);

  const titles = details?.titles || [];

  const unmatched = useMemo(
    () => titles.filter((t) => !t.matches || t.matches.length === 0),
    [titles]
  );

  const matched = useMemo(
    () => titles.filter((t) => t.matches && t.matches.length > 0),
    [titles]
  );

  const handleSelectMatch = (extractedId, matchId) => {
    setSelections((prev) => {
      const existing = prev[extractedId] || {};
      return {
        ...prev,
        [extractedId]: { ...existing, matchId },
      };
    });
  };

  const handleSelectList = (extractedId, listType) => {
    setSelections((prev) => {
      const existing = prev[extractedId] || {};
      return {
        ...prev,
        [extractedId]: { ...existing, listType },
      };
    });
  };

  const handleSearchChange = (extractedId, field, value) => {
    setSearchStates((prev) => ({
      ...prev,
      [extractedId]: {
        ...(prev[extractedId] || {}),
        [field]: value,
      },
    }));
  };

  const runSearch = async (extracted) => {
    const { id: extractedId } = extracted;
    setSearchStates((prev) => ({
      ...prev,
      [extractedId]: {
        ...(prev[extractedId] || {}),
        loading: true,
      },
    }));

    try {
      const state = searchStates[extractedId] || {};
      const payload = {};
      if (state.query && state.query.trim().length > 0) {
        payload.title = state.query.trim();
      }
      if (state.year && Number(state.year)) {
        payload.year = Number(state.year);
      }

      const data = await ImporterService.searchTitle(importId, extractedId, payload);

      setDetails((prev) => {
        if (!prev) return prev;
        const updatedTitles = (prev.titles || []).map((t) =>
          t.id === extractedId
            ? {
                ...t,
                matches: data.matches || [],
                normalizedTitle: data.normalizedTitle,
                year: data.year,
              }
            : t
        );
        return { ...prev, titles: updatedTitles };
      });
    } catch (e) {
      console.error('Search failed', e);
      showToast(e?.message || 'Search failed');
    } finally {
      setSearchStates((prev) => ({
        ...prev,
        [extractedId]: {
          ...(prev[extractedId] || {}),
          loading: false,
        },
      }));
    }
  };

  const handleConfirm = async () => {
    if (!importId) return;
    try {
      setSubmitting(true);

      const choices = [];
      for (const t of matched) {
        const selection = selections[t.id];
        if (!selection || !selection.matchId || !selection.listType) continue;
        choices.push({
          extractedTitleId: t.id,
          matchId: selection.matchId,
          listType: selection.listType,
        });
      }

      if (choices.length === 0) {
        showToast('Select at least one match and list');
        setSubmitting(false);
        return;
      }

      const res = await ImporterService.confirmMatches(importId, choices);
      console.log('[ImportReview] confirm response', res);

      if (res.backendError) {
        console.warn('Backend apply error', res.backendError);
      }

      showToast('Import applied to your lists');

      try {
        await refreshData?.();
      } catch (e) {
        console.warn('Failed to refresh data after import', e);
      }

      navigation.goBack();
    } catch (e) {
      console.error('Failed to confirm import', e);
      showToast(e?.message || 'Failed to confirm import');
    } finally {
      setSubmitting(false);
    }
  };

  const renderMatchOption = (extractedId, match) => {
    const selection = selections[extractedId] || {};
    const isSelected = selection.matchId === match.id;
    const labelTitle = match.title || match.tmdbId || 'Unknown';
    const labelYear = match.year || '';

    return (
      <TouchableOpacity
        key={match.id}
        style={[styles.matchOption, isSelected && styles.matchOptionSelected]}
        onPress={() => handleSelectMatch(extractedId, match.id)}
        activeOpacity={0.8}
      >
        <View style={styles.matchHeaderRow}>
          <Text style={styles.matchTitle} numberOfLines={2}>
            {labelTitle}
            {labelYear ? ` (${labelYear})` : ''}
          </Text>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          )}
        </View>
        <Text style={styles.matchMeta}>
          {match.mediaType === 'tv' ? 'TV' : 'Movie'} · {match.matchMethod || 'match'} ·
          
          {typeof match.confidence === 'number'
            ? ` ${(match.confidence * 100).toFixed(0)}%`
            : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderListOptions = (extractedId) => {
    const selection = selections[extractedId] || {};
    return (
      <View style={styles.listOptionsRow}>
        {LIST_OPTIONS.map((opt) => {
          const isSelected = selection.listType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.listOptionPill, isSelected && styles.listOptionPillSelected]}
              onPress={() => handleSelectList(extractedId, opt.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.listOptionText,
                  isSelected && styles.listOptionTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderMatchedItem = ({ item }) => {
    const { id, rawText, normalizedTitle, year, matches } = item;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {normalizedTitle || rawText}
          {year ? ` (${year})` : ''}
        </Text>
        {normalizedTitle && normalizedTitle !== rawText && (
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            From: {rawText}
          </Text>
        )}

        <ScrollView style={styles.matchesContainer}>
          {matches && matches.length > 0 ? (
            matches.map((m) => renderMatchOption(id, m))
          ) : (
            <Text style={styles.emptyMatchesText}>No matches yet.</Text>
          )}
        </ScrollView>

        {renderListOptions(id)}
      </View>
    );
  };

  const renderUnmatchedItem = ({ item }) => {
    const { id, rawText, normalizedTitle, year } = item;
    const state = searchStates[id] || {};

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {normalizedTitle || rawText}
          {year ? ` (${year})` : ''}
        </Text>
        {normalizedTitle && normalizedTitle !== rawText && (
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            From: {rawText}
          </Text>
        )}

        <View style={styles.searchRow}>
          <Ionicons
            name="search-outline"
            size={18}
            color="#9CA3AF"
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search TMDB..."
            placeholderTextColor="#9CA3AF"
            value={state.query || ''}
            onChangeText={(text) => handleSearchChange(id, 'query', text)}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.yearInput}
            placeholder="Year"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={state.year || ''}
            onChangeText={(text) => handleSearchChange(id, 'year', text)}
            maxLength={4}
          />
          <TouchableOpacity
            style={[styles.searchButton, state.loading && styles.searchButtonDisabled]}
            onPress={() => runSearch(item)}
            disabled={state.loading}
          >
            {state.loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        style={styles.headerIconButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={22} color="#111827" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Import Review</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {details?.originalFilename || 'Imported file'}
        </Text>
      </View>
      <View style={styles.headerRight}>
        {(details?.totalTitles ?? 0) > 0 && (
          <Text style={styles.headerBadge}>
            {details.matchedCount || 0}/{details.totalTitles}
          </Text>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        {header}
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Analyzing your import...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        {header}
        <View style={styles.loadingBody}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      {unmatched.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Unmatched Titles</Text>
          <Text style={styles.sectionSubtitle}>
            Use TMDB search to find the correct movie or show.
          </Text>
          <FlatList
            data={unmatched}
            keyExtractor={(item) => `unmatched-${item.id}`}
            renderItem={renderUnmatchedItem}
            scrollEnabled={false}
          />
        </View>
      )}

      <View style={[styles.section, { flex: 1 }]}>
        <Text style={styles.sectionTitle}>Assign to Lists</Text>
        <Text style={styles.sectionSubtitle}>
          Choose the best match and list for each title you want to import.
        </Text>
        {matched.length === 0 ? (
          <Text style={styles.emptyMatchesText}>
            No matched titles yet. Try resolving unmatched items above.
          </Text>
        ) : (
          <FlatList
            data={matched}
            keyExtractor={(item) => `matched-${item.id}`}
            renderItem={renderMatchedItem}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.confirmButton, submitting && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmButtonText}>Apply to My Lists</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerIconButton: {
    padding: 6,
    borderRadius: 999,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  headerBadge: {
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#4B5563',
  },
  errorText: {
    fontSize: 15,
    color: '#EF4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  matchesContainer: {
    maxHeight: 160,
    marginTop: 8,
  },
  matchOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  matchOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  matchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginRight: 8,
  },
  matchMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  emptyMatchesText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  listOptionsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  listOptionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  listOptionPillSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  listOptionText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  listOptionTextSelected: {
    color: '#FFFFFF',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
    marginRight: 6,
    backgroundColor: '#FFFFFF',
  },
  yearInput: {
    width: 64,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
    marginRight: 6,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  searchButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 999,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  confirmButton: {
    backgroundColor: '#10B981',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ImportReviewScreen;
