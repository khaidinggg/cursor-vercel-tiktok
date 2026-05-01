const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const statusText = document.getElementById("status");
const resultsEl = document.getElementById("results");
const searchButton = document.getElementById("search-btn");

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

function renderResults(items) {
  if (!items.length) {
    renderEmpty("No videos found for this search.");
    return;
  }

  resultsEl.innerHTML = items
    .map((item) => {
      const title = escapeHtml(item.title || "(No title)");
      const thumbnail = escapeHtml(item.thumbnail || "");
      const url = escapeHtml(item.tiktokVideoUrl || "");

      return `
        <article class="card">
          <img class="thumb" src="${thumbnail}" alt="Video thumbnail" loading="lazy" />
          <div class="card-body">
            <h2 class="title">${title}</h2>
            <div class="meta">
              <span>Views: ${formatNumber(item.stats?.views)}</span>
              <span>Likes: ${formatNumber(item.stats?.likes)}</span>
              <span>Saves: ${formatNumber(item.stats?.saves)}</span>
              <span>Comments: ${formatNumber(item.stats?.comments)}</span>
              <span>Shares: ${formatNumber(item.stats?.shares)}</span>
              <span>Posted: ${formatDate(item.postedAt)}</span>
            </div>
            <button class="copy-btn" data-url="${url}">Copy video link</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function searchVideos(query) {
  const url = `/api/search?q=${encodeURIComponent(query)}&count=12`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Search request failed.");
  }

  return data.results || [];
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = input.value.trim();
  if (!query) return;

  searchButton.disabled = true;
  statusText.textContent = "Searching...";
  resultsEl.innerHTML = "";

  try {
    const items = await searchVideos(query);
    statusText.textContent = `Found ${items.length} result(s).`;
    renderResults(items);
  } catch (error) {
    statusText.textContent = "Search failed. Please try again.";
    renderEmpty(error instanceof Error ? error.message : "Unknown error");
  } finally {
    searchButton.disabled = false;
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
