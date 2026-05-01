const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const statusText = document.getElementById("status");
const resultsEl = document.getElementById("results");
const searchButton = document.getElementById("search-btn");
const loadMoreWrap = document.getElementById("load-more-wrap");
const loadMoreButton = document.getElementById("load-more-btn");

let activeQuery = "";
let nextCursor = null;
let canLoadMore = false;
let isLoadingMore = false;

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatDate(isoDate) {
  if (!isoDate) return "Unknown";
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function renderEmpty(message) {
  resultsEl.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
}

function renderCards(items) {
  return items
    .map((item) => {
      const title = escapeHtml(item.title || "(No title)");
      const thumbnail = escapeHtml(item.thumbnail || "");
      const url = escapeHtml(item.tiktokVideoUrl || "");

      return `
        <article class="card">
          <img class="thumb" src="${thumbnail}" alt="Video thumbnail" loading="lazy" />
          <div class="card-body">
            <h2 class="title" title="${title}">${title}</h2>
            <div class="meta">
              <span class="chip">Views ${formatNumber(item.stats?.views)}</span>
              <span class="chip">Likes ${formatNumber(item.stats?.likes)}</span>
              <span class="chip">Saves ${formatNumber(item.stats?.saves)}</span>
              <span class="chip">Comments ${formatNumber(item.stats?.comments)}</span>
              <span class="chip">Shares ${formatNumber(item.stats?.shares)}</span>
            </div>
            <p class="posted-at">Posted ${formatDate(item.postedAt)}</p>
            <div class="action-row">
              <a class="open-btn" href="${url}" target="_blank" rel="noopener noreferrer">Open video</a>
              <button class="copy-btn" data-url="${url}">Copy video link</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderResults(items, append = false) {
  if (!items.length && !append) {
    renderEmpty("No videos found for this search.");
    return;
  }

  const cardsHtml = renderCards(items);
  if (append) {
    resultsEl.insertAdjacentHTML("beforeend", cardsHtml);
    return;
  }

  resultsEl.innerHTML = cardsHtml;
}

function setLoadMoreVisibility() {
  if (canLoadMore) {
    loadMoreWrap.classList.remove("hidden");
  } else {
    loadMoreWrap.classList.add("hidden");
  }
}

function setLoadMoreLoadingState(loading) {
  isLoadingMore = loading;
  loadMoreButton.disabled = loading;
  loadMoreButton.textContent = loading ? "Loading..." : "Load more";
}

async function searchVideos(query, cursor = 0) {
  const url = `/api/search?q=${encodeURIComponent(query)}&count=12&cursor=${cursor}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Search request failed.");
  }

  return {
    results: data.results || [],
    hasMore: Boolean(data.hasMore),
    nextCursor: typeof data.nextCursor === "number" ? data.nextCursor : null
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = input.value.trim();
  if (!query) return;

  activeQuery = query;
  searchButton.disabled = true;
  statusText.textContent = "Searching...";
  resultsEl.innerHTML = "";
  canLoadMore = false;
  nextCursor = null;
  setLoadMoreVisibility();

  try {
    const payload = await searchVideos(query, 0);
    const items = payload.results;
    canLoadMore = payload.hasMore;
    nextCursor = payload.nextCursor;
    statusText.textContent = `Found ${items.length} result(s).`;
    renderResults(items);
    setLoadMoreVisibility();
  } catch (error) {
    statusText.textContent = "Search failed. Please try again.";
    renderEmpty(error instanceof Error ? error.message : "Unknown error");
  } finally {
    searchButton.disabled = false;
  }
});

loadMoreButton.addEventListener("click", async () => {
  if (isLoadingMore || !canLoadMore || nextCursor === null || !activeQuery) {
    return;
  }

  try {
    setLoadMoreLoadingState(true);
    const payload = await searchVideos(activeQuery, nextCursor);
    renderResults(payload.results, true);

    const totalCards = resultsEl.querySelectorAll(".card").length;
    statusText.textContent = `Showing ${totalCards} result(s).`;

    canLoadMore = payload.hasMore;
    nextCursor = payload.nextCursor;
    setLoadMoreVisibility();
  } catch (error) {
    statusText.textContent =
      error instanceof Error ? `Load more failed: ${error.message}` : "Load more failed.";
  } finally {
    setLoadMoreLoadingState(false);
  }
});

resultsEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.classList.contains("copy-btn")) {
    return;
  }

  const videoUrl = target.dataset.url || "";
  if (!videoUrl) return;

  try {
    await navigator.clipboard.writeText(videoUrl);
    const original = target.textContent;
    target.textContent = "Copied!";
    setTimeout(() => {
      target.textContent = original;
    }, 1100);
  } catch {
    target.textContent = "Copy failed";
  }
});
