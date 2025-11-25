// Importer service for ShowBuff mobile app
// Talks directly to the Flask/Celery importer backend on Railway

import Constants from 'expo-constants';

class ImporterService {
  constructor() {
    const env = (Constants.expoConfig?.extra) || (Constants.manifest?.extra) || {};

    // Dedicated importer backend URL; fall back to hard-coded production importer
    this.baseURL = env.IMPORTER_BASE_URL || 'https://showbuff-mobile-production.up.railway.app';
    this.timeout = env.API_TIMEOUT ? parseInt(env.API_TIMEOUT, 10) : 15000;

    console.log('[ImporterService] baseURL =', this.baseURL);
  }

  async _fetchJson(path, options = {}) {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = null;
      }
      if (!res.ok) {
        const message = (json && (json.error || json.message)) || `HTTP ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Upload a file and start an import session.
   * @param {{ uri: string, name?: string, mimeType?: string }} file
   * @param {string|number} userId
   */
  async uploadFile(file, userId) {
    if (!file || !file.uri) {
      throw new Error('File with uri is required');
    }

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'import.txt',
      type: file.mimeType || 'text/plain',
    });
    if (userId) {
      formData.append('userId', String(userId));
    }

    const res = await this._fetchJson('/api/import/file', {
      method: 'POST',
      body: formData,
    });

    return res; // { importId, status }
  }

  async getMatches(importId) {
    if (!importId) throw new Error('importId is required');
    return await this._fetchJson(`/api/import/${importId}/matches`);
  }

  /**
   * Confirm which matches were chosen and desired list types.
   * choices: [{ extractedTitleId, matchId, listType }]
   */
  async confirmMatches(importId, choices) {
    if (!importId) throw new Error('importId is required');
    const payload = { importId, choices: Array.isArray(choices) ? choices : [] };
    return await this._fetchJson('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Convenience alias for matches endpoint
  async getImportDetails(importId) {
    return this.getMatches(importId);
  }

  /**
   * Run TMDB-backed search for a specific extracted title.
   * body: { title?: string, year?: number }
   */
  async searchTitle(importId, extractedTitleId, params = {}) {
    if (!importId) throw new Error('importId is required');
    if (!extractedTitleId) throw new Error('extractedTitleId is required');
    return await this._fetchJson(`/api/import/${importId}/titles/${extractedTitleId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
  }

  /**
   * List pending (non-completed) import sessions for an optional user.
   */
  async getPendingImports(userId) {
    const query = userId ? `?userId=${encodeURIComponent(String(userId))}` : '';
    return await this._fetchJson(`/api/import/matches/pending${query}`);
  }
}

export default new ImporterService();
