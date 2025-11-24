from __future__ import annotations

import os
import time
from typing import Any

import redis
import requests

from .config import Config


_cfg = Config()
_redis = redis.from_url(_cfg.REDIS_URL) if _cfg.REDIS_URL else None

_TMBD_BASE_URL = "https://api.themoviedb.org/3"
_CACHE_TTL_SECONDS = 24 * 60 * 60


def _cache_key(prefix: str, **parts: Any) -> str:
    items = ",".join(f"{k}={v}" for k, v in sorted(parts.items()))
    return f"showbuff:{prefix}:{items}"


def _rate_limit(bucket: str, limit_per_sec: int = 5) -> None:
    """Very small Redis-based rate limiter.

    We stay well below TMDB's 50 req/sec by default. Per-process limiter,
    combined with Railway's limited replicas, keeps us safe.
    """
    if not _redis:
        return
    key = f"ratelimit:{bucket}:{int(time.time())}"
    count = _redis.incr(key)
    if count == 1:
        _redis.expire(key, 1)
    if count > limit_per_sec:
        time.sleep(0.2)


def search_tmdb_title(title: str, year: int | None = None) -> list[dict[str, Any]]:
    if not _cfg.TMDB_API_KEY:
        return []

    title = title.strip()
    if not title:
        return []

    cache_key = _cache_key("tmdb_search", title=title.lower(), year=year or "*")
    if _redis:
        cached = _redis.get(cache_key)
        if cached:
            import json

            try:
                return json.loads(cached)
            except Exception:
                pass

    _rate_limit("tmdb_search")

    params: dict[str, Any] = {"api_key": _cfg.TMDB_API_KEY, "query": title}
    if year:
        params["year"] = year

    resp = requests.get(f"{_TMBD_BASE_URL}/search/movie", params=params, timeout=10)
    if not resp.ok:
        return []

    data = resp.json()
    results = data.get("results", [])

    if _redis:
        import json

        _redis.setex(cache_key, _CACHE_TTL_SECONDS, json.dumps(results))

    return results
