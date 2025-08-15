import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AppProvider, useApp } from '../contexts/AppContext';
import { AuthProvider } from '../contexts/AuthContext';
import BackendService from '../services/backend';

// Mock the backend service
jest.mock('../services/backend');

// Mock AuthContext
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' }, isAuthenticated: true }),
  AuthProvider: ({ children }) => <>{children}</>,
}));

const wrapper = ({ children }) => (
  <AuthProvider>
    <AppProvider>{children}</AppProvider>
  </AuthProvider>
);

describe('AppContext List Management', () => {
  const movie = { id: 1, title: 'Test Movie' };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should add a movie to a list successfully', async () => {
    BackendService.addToList.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      await result.current.addToList(movie, 'watchlist');
    });

    expect(result.current.watchlist).toContainEqual(movie);
    expect(BackendService.addToList).toHaveBeenCalledWith(movie, 'watchlist');
  });

  it('should return error details on 409 conflict and rollback', async () => {
    BackendService.addToList.mockResolvedValue({ success: false, status: 409, existingList: 'watched' });

    const { result } = renderHook(() => useApp(), { wrapper });

    let response;
    await act(async () => {
      response = await result.current.addToList(movie, 'watchlist');
    });

    // Verify UI was rolled back
    expect(result.current.watchlist).not.toContainEqual(movie);
    expect(response).toEqual({ success: false, status: 409, existingList: 'watched' });
  });

  it('should rollback optimistic update if addToList API call fails', async () => {
    BackendService.addToList.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      await result.current.addToList(movie, 'watchlist');
    });

    // Verify UI was rolled back
    expect(result.current.watchlist).not.toContainEqual(movie);
  });

  it('should move a movie between lists successfully', async () => {
    BackendService.moveToList.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useApp(), { wrapper });

    // Manually set initial state
    act(() => {
      const { currentlyWatching } = result.current;
      currentlyWatching.push(movie);
    });

    await act(async () => {
      await result.current.moveToList(movie.id, 'currently_watching', 'watched');
    });

    expect(result.current.currentlyWatching).not.toContainEqual(movie);
    expect(result.current.watched).toContainEqual(movie);
    expect(BackendService.moveToList).toHaveBeenCalledWith(movie.id, 'currently_watching', 'watched');
  });

  it('should rollback optimistic update if moveToList API call fails', async () => {
    BackendService.moveToList.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useApp(), { wrapper });

    // Set initial state
    act(() => {
      const { currentlyWatching } = result.current;
      currentlyWatching.push(movie);
    });

    await act(async () => {
      await result.current.moveToList(movie.id, 'currently_watching', 'watched');
    });

    // Verify UI was rolled back to its original state
    expect(result.current.currentlyWatching).toContainEqual(movie);
    expect(result.current.watched).not.toContainEqual(movie);
  });
});
