const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const RAPID_API_HOST = "tiktok-scraper7.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPID_API_KEY || "2091fb47cdmshc5fb0e860e2bc72p178f18jsn47ecd3f0a6ed";

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const count = Math.min(Math.max(Number(req.query.count) || 12, 1), 30);

  if (!query) {
    return res.status(400).json({ error: "Missing query parameter: q" });
  }

  try {
    const endpoint = new URL("https://tiktok-scraper7.p.rapidapi.com/feed/search");
    endpoint.searchParams.set("keywords", query);
    endpoint.searchParams.set("count", String(count));
    endpoint.searchParams.set("cursor", "0");
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

      return {
        id: videoId || video?.aweme_id || "",
        title: video?.title || "(No title)",
        thumbnail: video?.cover || video?.origin_cover || "",
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

    return res.json({ query, total: normalized.length, results: normalized });
  } catch (error) {
    return res.status(500).json({
      error: "Server error while searching videos",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`TikTok search app running at http://localhost:${PORT}`);
});
