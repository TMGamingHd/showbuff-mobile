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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import ImporterService from '../services/importer';
import TMDBService from '../services/tmdb';
import { showToast } from '../utils/toast';

const LIST_OPTIONS = [
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'currently_watching', label: 'Currently Watching' },
  { key: 'watched', label: 'Watched' },
];

const ImportReviewScreen = ({ route, navigation }) => {
  const { importId: routeImportId } = route.params || {};

  const prefetchDetailsForMatches = (titlesArray) => {
    if (!Array.isArray(titlesArray) || titlesArray.length === 0) return;

    titlesArray.forEach((t) => {
      const matches = Array.isArray(t?.matches) ? t.matches : [];
      matches.forEach((m) => {
        const mediaType = m.mediaType || 'movie';
        const tmdbId = m.tmdbId;
        if (!tmdbId) return;
        const key = `${mediaType}-${tmdbId}`;

        setMatchDetails((prev) => {
          if (prev[key]) return prev;
          return {
            ...prev,
            [key]: { loading: true, data: null, error: null },
          };
        });

        (async () => {
          try {
            let data;
            if (mediaType === 'tv') {
              data = await TMDBService.getTVDetails(tmdbId);
            } else {
              data = await TMDBService.getMovieDetails(tmdbId);
            }
            setMatchDetails((prev) => ({
              ...prev,
              [key]: { loading: false, data, error: null },
            }));
          } catch (e) {
            setMatchDetails((prev) => ({
              ...prev,
              [key]: {
                loading: false,
                data: null,
                error: e?.message || 'Failed to load details',
              },
            }));
          }
        })();
      });
    });
  };

  const { user } = useAuth();
  const { refreshData } = useApp();
  const insets = useSafeAreaInsets();

  const [importId] = useState(routeImportId || null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);
  const [phase, setPhase] = useState('resolve'); // 'resolve' unmatched first, then 'assign' lists
  const [selections, setSelections] = useState({}); // { extractedTitleId: { matchId, listType } }
  const [searchStates, setSearchStates] = useState({}); // { extractedTitleId: { query, year, loading } }
  const [matchDetails, setMatchDetails] = useState({}); // { key: { loading, data, error } }

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  // Load import details and poll until the importer session has populated titles
  // or reached a completed status. This guards against the race where we
  // navigate into this screen before the Celery task has finished.
  useEffect(() => {
    let isMounted = true;
    let pollTimeout = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 15; // ~30s if interval is 2s

    const fetchDetails = async (isInitial = false) => {
      if (!importId) {
        setError('Missing import id');
        setLoading(false);
        return;
      }

      try {
        if (isInitial) {
          setLoading(true);
        }

        const data = await ImporterService.getImportDetails(importId);
        if (!isMounted) return;

        console.log('[ImportReview] details for', importId, data);
        setDetails(data);

        const titles = Array.isArray(data?.titles) ? data.titles : [];
        const status = data?.status || '';

        prefetchDetailsForMatches(titles);

        const shouldPoll =
          attempts < MAX_ATTEMPTS &&
          titles.length === 0 &&
          status && status.toLowerCase() !== 'completed';

        if (shouldPoll) {
          attempts += 1;
          pollTimeout = setTimeout(() => {
            fetchDetails(false);
          }, 2000);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to load import details', e);
        if (!isMounted) return;
        // Only surface the error on the initial load; later polls can fail
        // silently and the user can retry by restarting the flow.
        if (attempts === 0) {
          setError(e?.message || 'Failed to load import');
          setLoading(false);
        }
      }
    };

    fetchDetails(true);

    return () => {
      isMounted = false;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
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

  const unresolvedUnmatched = useMemo(
    () =>
      unmatched.filter((t) => {
        const sel = selections[t.id];
        return !sel || !sel.skipped;
      }),
    [unmatched, selections]
  );

  const assignable = useMemo(
    () =>
      matched.filter((t) => {
        const sel = selections[t.id];
        if (sel && sel.skipped) return false;
        if (!sel) return true;
        return !sel.matchId || !sel.listType;
      }),
    [matched, selections]
  );

	const allHandled = useMemo(
		() =>
			matched.every((t) => {
				const sel = selections[t.id];
				if (sel && sel.skipped) return true;
				return !!(sel && sel.matchId && sel.listType);
			}),
		[matched, selections]
	);

	const hasAnyAssigned = useMemo(
		() =>
			matched.some((t) => {
				const sel = selections[t.id];
				return !!(sel && sel.matchId && sel.listType && !sel.skipped);
			}),
		[matched, selections]
	);

	const readyToApply = allHandled && hasAnyAssigned;

  const handleSelectMatch = (extractedId, matchId) => {
    setSelections((prev) => {
      const existing = prev[extractedId] || {};
      return {
        ...prev,
        [extractedId]: { ...existing, matchId },
      };
    });
  };

  const handleToggleMatch = (extractedId, matchId) => {
    setSelections((prev) => {
      const existing = prev[extractedId] || {};
      const isSelected = existing.matchId === matchId;
      const next = { ...existing };
      if (isSelected) {
        delete next.matchId;
      } else {
        next.matchId = matchId;
      }
      return {
        ...prev,
        [extractedId]: next,
      };
    });
  };

  const handleSkipTitle = (extractedId) => {
    setSelections((prev) => ({
      ...prev,
      [extractedId]: { ...(prev[extractedId] || {}), skipped: true },
    }));
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

      const matchesForTitle = Array.isArray(data?.matches) ? data.matches : [];
      prefetchDetailsForMatches([
        {
          ...extracted,
          matches: matchesForTitle,
        },
      ]);
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
    const mediaType = match.mediaType || 'movie';
    const key = `${mediaType}-${match.tmdbId}`;
    const info = matchDetails[key];
    const data = info && info.data ? info.data : null;
    const titleFromDetails = data ? data.title || data.name || data.original_title || data.original_name : null;
    const labelTitle = titleFromDetails || match.title || (match.tmdbId ? `TMDB #${match.tmdbId}` : 'Unknown');
    const yearFromDetails = data
      ? TMDBService.getYear(data.release_date || data.first_air_date || '')
      : null;
    const baseYear = match.year || '';
    const displayYear = baseYear || (yearFromDetails && yearFromDetails !== 'N/A' ? yearFromDetails : '');
    const posterPath = data ? data.poster_path : null;
    const posterUrl = posterPath ? TMDBService.getImageUrl(posterPath, 'w185') : null;
    const voteAverage = data && typeof data.vote_average === 'number' ? TMDBService.formatVoteAverage(data.vote_average) : null;
    const overview = data && data.overview ? data.overview : '';
    const mediaLabel = mediaType === 'tv' ? 'TV Show' : 'Movie';

    return (
      <TouchableOpacity
        key={match.id}
        style={[styles.matchOption, isSelected && styles.matchOptionSelected]}
        onPress={() => handleToggleMatch(extractedId, match.id)}
        activeOpacity={0.8}
      >
        <View style={styles.matchRow}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.matchPoster} />
          ) : (
            <View style={[styles.matchPoster, styles.matchPosterPlaceholder]}>
              <Ionicons
                name={mediaType === 'tv' ? 'tv-outline' : 'film-outline'}
                size={20}
                color="#9CA3AF"
              />
            </View>
          )}
          <View style={styles.matchContent}>
            <View style={styles.matchHeaderRow}>
              <Text style={styles.matchTitle} numberOfLines={2}>
                {labelTitle}
                {displayYear ? ` (${displayYear})` : ''}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              )}
            </View>
            <Text style={styles.matchMeta} numberOfLines={1}>
              {mediaLabel}
              {voteAverage ? ` · TMDB ${voteAverage}/10` : ''}
              {typeof match.confidence === 'number'
                ? ` · ${(match.confidence * 100).toFixed(0)}% match`
                : ''}
              {match.matchMethod ? ` · ${match.matchMethod}` : ''}
            </Text>
            {overview ? (
              <Text style={styles.matchOverview} numberOfLines={3}>
                {overview}
              </Text>
            ) : null}
          </View>
        </View>
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
      <View style={[styles.card, styles.cardFullHeight]}>
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

        <View style={styles.skipRow}>
          <TouchableOpacity onPress={() => handleSkipTitle(id)} activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip this title</Text>
          </TouchableOpacity>
        </View>
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

			<View style={styles.skipRow}>
				<TouchableOpacity onPress={() => handleSkipTitle(id)} activeOpacity={0.7}>
					<Text style={styles.skipText}>Skip this title</Text>
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

      {phase === 'resolve' ? (
        <View style={[styles.section, { flex: 1 }]}>
          <Text style={styles.sectionTitle}>Step 1 of 2 · Resolve Unmatched Titles</Text>
          <Text style={styles.sectionSubtitle}>
            Review titles we could not automatically match. Search TMDB or skip them.
          </Text>

          {unresolvedUnmatched.length === 0 ? (
            <View style={styles.resolveDoneContainer}>
              <Text style={styles.emptyMatchesText}>
                All unmatched titles have been handled.
              </Text>
              <TouchableOpacity
                style={[styles.confirmButton, styles.resolveContinueButton]}
                onPress={() => setPhase('assign')}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmButtonText}>Continue to Assign Lists</Text>
              </TouchableOpacity>
            </View>
          ) : (
            renderUnmatchedItem({ item: unresolvedUnmatched[0] })
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.assignScroll}
          contentContainerStyle={styles.assignScrollContent}
          bounces={false}
        >
          <View style={[styles.section, { flex: 1, paddingBottom: 120 }]}>
            <Text style={styles.sectionTitle}>Step 2 of 2 · Assign to Lists</Text>
            <Text style={styles.sectionSubtitle}>
              Choose the best match and list for each title you want to import.
            </Text>
            {assignable.length === 0 ? (
              <Text style={styles.emptyMatchesText}>
                No titles left to assign. You can apply your selections below.
              </Text>
            ) : (
              renderMatchedItem({ item: assignable[0] })
            )}
          </View>
        </ScrollView>
      )}

      {readyToApply && (
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
      )}
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
  cardFullHeight: {
    flex: 1,
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
    maxHeight: 260,
    marginTop: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  matchPoster: {
    width: 96,
    height: 144,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    marginRight: 10,
  },
  matchPosterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchContent: {
    flex: 1,
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
  matchOverview: {
    marginTop: 4,
    fontSize: 12,
    color: '#4B5563',
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
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 13,
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
  skipRow: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  skipText: {
    fontSize: 12,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  assignScroll: {
    flex: 1,
  },
  assignScrollContent: {
    flexGrow: 1,
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
