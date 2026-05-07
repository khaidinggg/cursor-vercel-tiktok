import express from "express";

const app = express();

const RAPID_API_HOST = "tiktok-scraper7.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPID_API_KEY || "2091fb47cdmshc5fb0e860e2bc72p178f18jsn47ecd3f0a6ed";
const THUMBNAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_THUMBNAIL_CACHE_ITEMS = 200;
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const thumbnailCache = new Map();

function buildThumbnailProxyUrl(thumbnailUrl) {
  if (!thumbnailUrl) return "";
  return `/api/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`;
}

function readCachedThumbnail(cacheKey) {
  const cached = thumbnailCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    thumbnailCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function writeCachedThumbnail(cacheKey, contentType, bodyBuffer) {
  if (thumbnailCache.size >= MAX_THUMBNAIL_CACHE_ITEMS) {
    const oldestKey = thumbnailCache.keys().next().value;
    if (oldestKey) {
      thumbnailCache.delete(oldestKey);
    }
  }
  thumbnailCache.set(cacheKey, {
    contentType,
    bodyBuffer,
    expiresAt: Date.now() + THUMBNAIL_CACHE_TTL_MS
  });
}

app.get("/api/thumbnail", async (req, res) => {
  const rawUrl = String(req.query.url || "").trim();
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing thumbnail URL." });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid thumbnail URL." });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Unsupported URL protocol." });
  }

  const cacheKey = parsed.toString();
  const cached = readCachedThumbnail(cacheKey);

  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(cached.bodyBuffer);
  }

  try {
    const upstreamResponse = await fetch(parsed, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TikTokSearchProxy/1.0)"
      }
    });

    if (!upstreamResponse.ok) {
      return res.status(502).json({
        error: "Thumbnail fetch failed.",
        details: `Upstream status ${upstreamResponse.status}`
      });
    }

    const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return res.status(415).json({ error: "Thumbnail URL did not return an image." });
    }

    const contentLength = Number(upstreamResponse.headers.get("content-length") || 0);
    if (contentLength > MAX_THUMBNAIL_BYTES) {
      return res.status(413).json({ error: "Thumbnail image is too large." });
    }

    const bodyBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    if (bodyBuffer.length > MAX_THUMBNAIL_BYTES) {
      return res.status(413).json({ error: "Thumbnail image is too large." });
    }

    writeCachedThumbnail(cacheKey, contentType, bodyBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(bodyBuffer);
  } catch (error) {
    return res.status(502).json({
      error: "Failed to proxy thumbnail.",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const count = Math.min(Math.max(Number(req.query.count) || 12, 1), 30);
  const cursor = Math.max(Number(req.query.cursor) || 0, 0);

  if (!query) {
    return res.status(400).json({ error: "Missing query parameter: q" });
  }

  try {
    const endpoint = new URL("https://tiktok-scraper7.p.rapidapi.com/feed/search");
    endpoint.searchParams.set("keywords", query);
    endpoint.searchParams.set("count", String(count));
    endpoint.searchParams.set("cursor", String(cursor));
    endpoint.searchParams.set("publish_time", "0");
    endpoint.searchParams.set("sort_type", "0");

    const apiResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": RAPID_API_HOST,
        "x-rapidapi-key": RAPID_API_KEY
      }
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return res.status(apiResponse.status).json({
        error: "RapidAPI request failed",
        details: errorText
      });
    }

    const payload = await apiResponse.json();
    const videos = Array.isArray(payload?.data?.videos) ? payload.data.videos : [];

    const normalized = videos.map((video) => {
      const authorId = video?.author?.unique_id || "";
      const videoId = video?.video_id || "";
      const directTikTokUrl =
        authorId && videoId ? `https://www.tiktok.com/@${authorId}/video/${videoId}` : "";
      const normalizedTitle = String(video?.title || "(No title)")
        .replace(/\s+/g, " ")
        .trim();
      const sourceThumbnail = video?.cover || video?.origin_cover || "";

      return {
        id: videoId || video?.aweme_id || "",
        title: normalizedTitle || "(No title)",
        thumbnail: buildThumbnailProxyUrl(sourceThumbnail),
        postedAt: video?.create_time ? new Date(video.create_time * 1000).toISOString() : null,
        stats: {
          views: Number(video?.play_count || 0),
          likes: Number(video?.digg_count || 0),
          saves: Number(video?.download_count || 0),
          comments: Number(video?.comment_count || 0),
          shares: Number(video?.share_count || 0)
        },
        author: {
          username: authorId,
          displayName: video?.author?.nickname || authorId
        },
        tiktokVideoUrl: directTikTokUrl
      };
    });

    const hasMore = Boolean(payload?.data?.hasMore);
    const nextCursor = hasMore ? Number(payload?.data?.cursor ?? cursor) : null;

    return res.json({
      query,
      total: normalized.length,
      cursor,
      hasMore,
      nextCursor,
      results: normalized
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error while searching videos",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// No app.listen() — EdgeOne handles this
export default app;
