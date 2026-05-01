(() => {
  'use strict';

  const CHANNEL_ID = 'UCFguFFPf673vEVfeNeF5Nuw';
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

  // ===== YouTube RSS fetching =====
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
        if (response.ok) {
          return await response.text();
        }
      } catch (_) {
        continue;
      }
    }
    return null;
  }

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

    const dateStr = formatDate(video.published);

    card.innerHTML = `
      <div class="session-thumb">
        <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
        <div class="play-overlay">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div class="session-info">
        <h3>${video.title}</h3>
        <p>${dateStr}</p>
      </div>
    `;
    return card;
  }

  async function loadSessions() {
    const latestContainer = document.getElementById('latestSessions');
    const allContainer = document.getElementById('allSessions');
    const fallback = document.getElementById('sessionsFallback');

    const xmlText = await fetchWithProxy(RSS_URL, CORS_PROXIES);

    if (!xmlText) {
      if (latestContainer) latestContainer.innerHTML = '';
      if (allContainer) allContainer.innerHTML = '';
      if (fallback) fallback.style.display = 'block';
      return;
    }

    const videos = parseRSSFeed(xmlText);

    if (videos.length === 0) {
      if (latestContainer) latestContainer.innerHTML = '';
      if (allContainer) allContainer.innerHTML = '';
      if (fallback) fallback.style.display = 'block';
      return;
    }

    if (latestContainer) {
      latestContainer.innerHTML = '';
      videos.slice(0, 3).forEach(v => {
        latestContainer.appendChild(createSessionCard(v));
      });
    }

    if (allContainer) {
      allContainer.innerHTML = '';
      videos.forEach(v => {
        allContainer.appendChild(createSessionCard(v));
      });
    }

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput && allContainer) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        allContainer.querySelectorAll('.session-card').forEach(card => {
          const title = card.getAttribute('data-title') || '';
          card.style.display = title.includes(query) ? '' : 'none';
        });
      });
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSessions);
  } else {
    loadSessions();
  }
})();
