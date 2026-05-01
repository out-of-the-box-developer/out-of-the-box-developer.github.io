(() => {
  'use strict';

  const CHANNEL_ID = 'UCFguFFPf673vEVfeNeF5Nuw';
  const UPLOADS_PLAYLIST_ID = 'UUFguFFPf673vEVfeNeF5Nuw';
  const YT_API_KEY = 'AIzaSyD9ztv_ec8kV9XKA-Gtk6gZ2j5V8nxCFnM';
  const BATCH_SIZE = 6;
  const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const CORS_PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  ];

  // ===== Navbar scroll & toggle =====
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');

  if (navbar && !navbar.classList.contains('navbar-solid')) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 60);
    });
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ===== Shared utilities =====
  function formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  function createSessionCard(video) {
    const card = document.createElement('a');
    card.href = video.url;
    card.target = '_blank';
    card.rel = 'noopener';
    card.className = 'session-card';
    card.setAttribute('data-title', video.title.toLowerCase());

    card.innerHTML = `
      <div class="session-thumb">
        <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
        <div class="play-overlay">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div class="session-info">
        <h3>${video.title}</h3>
        <p>${formatDate(video.published)}</p>
      </div>
    `;
    return card;
  }

  // ===== YouTube Data API v3 =====
  async function fetchFromAPI(maxResults, pageToken) {
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${UPLOADS_PLAYLIST_ID}&maxResults=${maxResults}&key=${YT_API_KEY}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    const videos = (data.items || []).map(item => {
      const s = item.snippet;
      const videoId = s.resourceId?.videoId || '';
      return {
        videoId,
        title: s.title || '',
        published: s.publishedAt || '',
        description: (s.description || '').substring(0, 200),
        thumbnail: s.thumbnails?.high?.url || s.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }).filter(v => v.videoId && v.title !== 'Private video' && v.title !== 'Deleted video');

    return { videos, nextPageToken: data.nextPageToken || null };
  }

  // ===== RSS fallback =====
  function parseRSSFeed(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'application/xml');
    const entries = xml.querySelectorAll('entry');
    const videos = [];

    entries.forEach(entry => {
      const videoId = entry.querySelector('videoId')?.textContent || '';
      const title = entry.querySelector('title')?.textContent || '';
      const published = entry.querySelector('published')?.textContent || '';
      const description = (entry.querySelector('group description') ||
                           entry.querySelector('media\\:description'))?.textContent || '';
      const thumbnail = (entry.querySelector('group thumbnail') ||
                         entry.querySelector('media\\:thumbnail'))?.getAttribute('url') || '';

      if (videoId) {
        videos.push({
          videoId,
          title,
          published,
          description: description.substring(0, 200),
          thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });
      }
    });
    return videos;
  }

  async function fetchWithProxy(url, proxyFns) {
    for (const proxyFn of proxyFns) {
      try {
        const proxyUrl = proxyFn(url);
        const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (response.ok) return await response.text();
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  async function fetchAllFromRSS() {
    const xmlText = await fetchWithProxy(RSS_URL, CORS_PROXIES);
    return xmlText ? parseRSSFeed(xmlText) : [];
  }

  // ===== Home page: latest sessions =====
  async function loadLatestSessions(container) {
    try {
      const { videos } = await fetchFromAPI(3);
      if (videos.length > 0) {
        container.innerHTML = '';
        videos.forEach(v => container.appendChild(createSessionCard(v)));
        return;
      }
    } catch (_) { /* fall through to RSS */ }

    const videos = await fetchAllFromRSS();
    container.innerHTML = '';
    if (videos.length > 0) {
      videos.slice(0, 3).forEach(v => container.appendChild(createSessionCard(v)));
    }
  }

  // ===== Sessions page: infinite scroll with API pagination =====
  async function loadAllSessions(container) {
    const sentinel = document.getElementById('loadMoreSentinel');
    const endMsg = document.getElementById('sessionsEnd');
    const fallback = document.getElementById('sessionsFallback');
    let allVideos = [];
    let useAPI = true;
    let nextPageToken = null;
    let loading = false;

    container.innerHTML = '';

    // Try loading the first batch from the API
    try {
      const result = await fetchFromAPI(BATCH_SIZE);
      result.videos.forEach(v => container.appendChild(createSessionCard(v)));
      allVideos = result.videos;
      nextPageToken = result.nextPageToken;
    } catch (_) {
      // API failed — fall back to RSS for everything
      useAPI = false;
      const rssVideos = await fetchAllFromRSS();
      if (rssVideos.length === 0) {
        if (fallback) fallback.style.display = 'block';
        return;
      }
      allVideos = rssVideos;
      rssVideos.slice(0, BATCH_SIZE).forEach(v => container.appendChild(createSessionCard(v)));
    }

    let rssShown = useAPI ? 0 : BATCH_SIZE;

    function updateEndState() {
      if (sentinel) sentinel.style.display = 'none';
      if (endMsg) endMsg.style.display = 'block';
    }

    // If no more pages from the start
    if (useAPI && !nextPageToken) {
      updateEndState();
    } else if (!useAPI && rssShown >= allVideos.length) {
      updateEndState();
    } else if (sentinel) {
      sentinel.style.display = 'block';
    }

    async function loadMore() {
      if (loading) return;
      loading = true;

      if (useAPI && nextPageToken) {
        try {
          const result = await fetchFromAPI(BATCH_SIZE, nextPageToken);
          result.videos.forEach(v => {
            container.appendChild(createSessionCard(v));
            allVideos.push(v);
          });
          nextPageToken = result.nextPageToken;
          if (!nextPageToken) updateEndState();
        } catch (_) {
          // Quota exceeded mid-scroll — stop pagination, show end
          useAPI = false;
          updateEndState();
        }
      } else if (!useAPI && rssShown < allVideos.length) {
        const batch = allVideos.slice(rssShown, rssShown + BATCH_SIZE);
        batch.forEach(v => container.appendChild(createSessionCard(v)));
        rssShown += batch.length;
        if (rssShown >= allVideos.length) updateEndState();
      }

      loading = false;
    }

    // IntersectionObserver for infinite scroll
    if (sentinel) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          const hasMore = (useAPI && nextPageToken) || (!useAPI && rssShown < allVideos.length);
          if (hasMore) {
            loadMore();
          } else {
            observer.disconnect();
          }
        }
      }, { rootMargin: '200px' });
      observer.observe(sentinel);
    }

    // Search — searches through all loaded videos
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        if (query) {
          container.innerHTML = '';
          allVideos.forEach(v => {
            if (v.title.toLowerCase().includes(query)) {
              container.appendChild(createSessionCard(v));
            }
          });
          if (sentinel) sentinel.style.display = 'none';
          if (endMsg) endMsg.style.display = 'none';
        } else {
          // Reset — re-render all loaded videos and re-enable scroll
          container.innerHTML = '';
          allVideos.forEach(v => container.appendChild(createSessionCard(v)));
          const hasMore = (useAPI && nextPageToken) || (!useAPI && rssShown < allVideos.length);
          if (hasMore && sentinel) {
            sentinel.style.display = 'block';
          } else {
            if (endMsg) endMsg.style.display = 'block';
          }
        }
      });
    }
  }

  // ===== Initialize =====
  async function init() {
    const latestContainer = document.getElementById('latestSessions');
    const allContainer = document.getElementById('allSessions');

    if (latestContainer) loadLatestSessions(latestContainer);
    if (allContainer) loadAllSessions(allContainer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
