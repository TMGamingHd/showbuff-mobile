// Dynamic Expo config to expose .env values to the app at runtime
// This merges the existing app.json config and injects variables into `extra`.
require('dotenv').config();

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    APP_ENV: process.env.APP_ENV || 'development',
    LOCAL_BACKEND_URL_ANDROID: process.env.LOCAL_BACKEND_URL_ANDROID,
    LOCAL_BACKEND_URL_IOS: process.env.LOCAL_BACKEND_URL_IOS,
    LOCAL_BACKEND_PORT: process.env.LOCAL_BACKEND_PORT,
    API_TIMEOUT: process.env.API_TIMEOUT,
    ENABLE_DEMO_MODE: process.env.ENABLE_DEMO_MODE,
    TMDB_API_KEY: process.env.TMDB_API_KEY,
    TMDB_BASE_URL: process.env.TMDB_BASE_URL,
  },
});
