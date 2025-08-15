import { TMDB_API_KEY, TMDB_BASE_URL } from '@env';

class TMDBService {
  constructor() {
    // Use environment variables with fallback for development
    this.apiKey = TMDB_API_KEY || '45eff3de944d9ab75c41d53848cce337';
    this.baseUrl = TMDB_BASE_URL || 'https://api.themoviedb.org/3';
    this.imageBaseUrl = 'https://image.tmdb.org/t/p';
  }

  // Make API request with error handling
  async makeRequest(endpoint, params = {}) {
    try {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      url.searchParams.append('api_key', this.apiKey);
      
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`TMDB API Error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('TMDB API Error:', error);
      // Return demo data as fallback
      return this.getDemoData(endpoint);
    }
  }

  // Demo data fallback for offline/error scenarios
  getDemoData(endpoint) {
    const demoMovies = [
      {
        id: 238,
        title: "The Godfather",
        poster_path: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
        backdrop_path: "/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
        overview: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
        vote_average: 9.2,
        release_date: "1972-03-24",
        genre_ids: [18, 80],
        adult: false,
        original_language: "en",
        popularity: 111.239
      },
      {
        id: 278,
        title: "The Shawshank Redemption",
        poster_path: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
        backdrop_path: "/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg",
        overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
        vote_average: 9.3,
        release_date: "1994-09-23",
        genre_ids: [18, 80],
        adult: false,
        original_language: "en",
        popularity: 88.439
      },
      {
        id: 155,
        title: "The Dark Knight",
        poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
        backdrop_path: "/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg",
        overview: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests.",
        vote_average: 9.0,
        release_date: "2008-07-18",
        genre_ids: [18, 28, 80, 53],
        adult: false,
        original_language: "en",
        popularity: 123.456
      },
      {
        id: 680,
        title: "Pulp Fiction",
        poster_path: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
        backdrop_path: "/4cDFJr4HnXN5AdPw4AKrmLlMWdO.jpg",
        overview: "The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.",
        vote_average: 8.9,
        release_date: "1994-10-14",
        genre_ids: [53, 80],
        adult: false,
        original_language: "en",
        popularity: 98.765
      }
    ];

    return { results: demoMovies, total_pages: 1, total_results: demoMovies.length };
  }

  // Get image URL with different sizes
  getImageUrl(path, size = 'w500') {
    if (!path) return 'https://via.placeholder.com/500x750/E5E7EB/6B7280?text=No+Image';
    return `${this.imageBaseUrl}/${size}${path}`;
  }

  // Get backdrop URL
  getBackdropUrl(path, size = 'w1280') {
    if (!path) return 'https://via.placeholder.com/1280x720/E5E7EB/6B7280?text=No+Image';
    return `${this.imageBaseUrl}/${size}${path}`;
  }

  // Search for movies and TV shows
  async searchMulti(query, page = 1) {
    if (!query || query.trim() === '') {
      return { results: [], total_pages: 0, total_results: 0 };
    }
    
    return await this.makeRequest('/search/multi', {
      query: query.trim(),
      page,
      include_adult: false
    });
  }

  // Search movies only
  async searchMovies(query, page = 1) {
    if (!query || query.trim() === '') {
      return { results: [], total_pages: 0, total_results: 0 };
    }
    
    return await this.makeRequest('/search/movie', {
      query: query.trim(),
      page,
      include_adult: false
    });
  }

  // Search TV shows only
  async searchTV(query, page = 1) {
    if (!query || query.trim() === '') {
      return { results: [], total_pages: 0, total_results: 0 };
    }
    
    return await this.makeRequest('/search/tv', {
      query: query.trim(),
      page,
      include_adult: false
    });
  }

  // Get trending movies and TV shows
  async getTrending(mediaType = 'all', timeWindow = 'week') {
    return await this.makeRequest(`/trending/${mediaType}/${timeWindow}`);
  }

  // Get popular movies
  async getPopularMovies(page = 1) {
    return await this.makeRequest('/movie/popular', { page });
  }

  // Get popular TV shows
  async getPopularTV(page = 1) {
    return await this.makeRequest('/tv/popular', { page });
  }

  // Get top rated movies
  async getTopRatedMovies(page = 1) {
    return await this.makeRequest('/movie/top_rated', { page });
  }

  // Get top rated TV shows
  async getTopRatedTV(page = 1) {
    return await this.makeRequest('/tv/top_rated', { page });
  }

  // Get now playing movies
  async getNowPlayingMovies(page = 1) {
    return await this.makeRequest('/movie/now_playing', { page });
  }

  // Get upcoming movies
  async getUpcomingMovies(page = 1) {
    return await this.makeRequest('/movie/upcoming', { page });
  }

  // Get movie details
  async getMovieDetails(movieId) {
    return await this.makeRequest(`/movie/${movieId}`, {
      append_to_response: 'credits,videos,recommendations,similar'
    });
  }

  // Get TV show details
  async getTVDetails(tvId) {
    return await this.makeRequest(`/tv/${tvId}`, {
      append_to_response: 'credits,videos,recommendations,similar'
    });
  }

  // Get person details
  async getPersonDetails(personId) {
    return await this.makeRequest(`/person/${personId}`, {
      append_to_response: 'movie_credits,tv_credits'
    });
  }

  // Get movie credits
  async getMovieCredits(movieId) {
    return await this.makeRequest(`/movie/${movieId}/credits`);
  }

  // Get TV credits
  async getTVCredits(tvId) {
    return await this.makeRequest(`/tv/${tvId}/credits`);
  }

  // Get movie videos (trailers, teasers, etc.)
  async getMovieVideos(movieId) {
    return await this.makeRequest(`/movie/${movieId}/videos`);
  }

  // Get TV videos
  async getTVVideos(tvId) {
    return await this.makeRequest(`/tv/${tvId}/videos`);
  }

  // Get movie recommendations
  async getMovieRecommendations(movieId, page = 1) {
    return await this.makeRequest(`/movie/${movieId}/recommendations`, { page });
  }

  // Get TV recommendations
  async getTVRecommendations(tvId, page = 1) {
    return await this.makeRequest(`/tv/${tvId}/recommendations`, { page });
  }

  // Get similar movies
  async getSimilarMovies(movieId, page = 1) {
    return await this.makeRequest(`/movie/${movieId}/similar`, { page });
  }

  // Get similar TV shows
  async getSimilarTV(tvId, page = 1) {
    return await this.makeRequest(`/tv/${tvId}/similar`, { page });
  }

  // Get genres for movies
  async getMovieGenres() {
    return await this.makeRequest('/genre/movie/list');
  }

  // Get genres for TV shows
  async getTVGenres() {
    return await this.makeRequest('/genre/tv/list');
  }

  // Discover movies with filters
  async discoverMovies(filters = {}) {
    return await this.makeRequest('/discover/movie', filters);
  }

  // Discover TV shows with filters
  async discoverTV(filters = {}) {
    return await this.makeRequest('/discover/tv', filters);
  }

  // Get configuration (for image sizes, etc.)
  async getConfiguration() {
    return await this.makeRequest('/configuration');
  }

  // Utility function to format runtime
  formatRuntime(minutes) {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  // Utility function to format release date
  formatReleaseDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Utility function to get year from date
  getYear(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).getFullYear();
  }

  // Utility function to format vote average
  formatVoteAverage(voteAverage) {
    if (!voteAverage) return '0.0';
    return parseFloat(voteAverage).toFixed(1);
  }

  // Utility function to get genre names from IDs
  getGenreNames(genreIds, allGenres) {
    if (!genreIds || !allGenres) return [];
    return genreIds
      .map(id => allGenres.find(genre => genre.id === id))
      .filter(Boolean)
      .map(genre => genre.name);
  }
}

export default new TMDBService();
