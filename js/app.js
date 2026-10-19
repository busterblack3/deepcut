/**
 * Deep Cut — static playlist archive viewer
 * Reads data from playlists/ directory, renders views via hash routing.
 */
(function () {
  'use strict';

  const STATE = {
    playlists: [],
    currentPlaylist: null,
  };

  /* ───── Data ───── */
  async function loadPlaylistIndex() {
    try {
      const resp = await fetch('playlists/index.json');
      if (resp.ok) {
        STATE.playlists = await resp.json();
        return;
      }
    } catch (_) { /* fall through */ }
    STATE.playlists = [];
  }

  /* ───── Router ───── */
  function getRoute() {
    const hash = location.hash.replace(/^#\//, '') || '';
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { view: 'archive' };
    // generate + requests tabs were removed 2026-08-03 (site is public-facing now;
    // playlist ideas arrive by email instead). Old bookmarks land on the archive.
    if (parts[0] === 'playlist' && parts[1]) return { view: 'playlist', id: parts[1] };
    return { view: 'archive' };
  }

  /* ───── Renderers ───── */
  async function renderView() {
    const route = getRoute();
    const app = document.getElementById('app');
    if (!app) return;
    if (route.view === 'archive') renderArchive(app);
    else if (route.view === 'playlist') await renderPlaylist(app, route.id);
    else renderArchive(app);
    highlightNav(route.view);
  }

  function highlightNav(view) {
    document.querySelectorAll('.nav-link').forEach(el => {
      const href = el.getAttribute('href');
      const isMatch = view === 'archive' ? (href === '#/') : href === `#/${view}`;
      el.classList.toggle('active', isMatch);
    });
  }

  /* ── Archive ── */
  function renderArchive(container) {
    const list = STATE.playlists;
    if (list.length === 0) {
      container.innerHTML = '<div class="loading">no playlists yet — check back soon.</div>';
      return;
    }
    container.innerHTML = `
      <h2 class="page-title">archive</h2>
      <p class="page-subtitle">curated playlists, each with a theme and mini writeup. click through for the full tracklist and essay.</p>
      <div class="playlist-grid">
        ${list.map(p => `
          <div class="playlist-card">
            <h3><a href="#/playlist/${encodeURIComponent(p.id)}">${esc(p.title)}</a></h3>
            <div class="meta">${p.date}${p.themes ? ' · ' + p.themes.map(t => `<span class="tag">${esc(t)}</span>`).join('') : ''}</div>
            <div class="excerpt">${esc(p.description || '')}</div>
            <div class="actions">
              <a href="#/playlist/${encodeURIComponent(p.id)}">view →</a>
              <a href="#" class="download-link" data-id="${encodeURIComponent(p.id)}" title="download the tracklist as a text file">download ↓</a>
              ${p.spotifyUrl ? `<a href="${esc(p.spotifyUrl)}" target="_blank" rel="noopener">open in spotify ↗</a>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Download buttons on the cards need the full playlist JSON (tracklist), so
    // fetch it on click rather than baking it into the index summary.
    container.querySelectorAll('.download-link').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        a.textContent = '…';
        const ok = await downloadPlaylist(a.dataset.id);
        a.textContent = ok ? 'download ↓' : 'couldn\'t load — open in spotify';
        if (!ok) setTimeout(() => { a.textContent = 'download ↓'; }, 2500);
      });
    });
  }

  /* ── Playlist Detail ── */
  async function renderPlaylist(container, id) {
    const summary = STATE.playlists.find(p => p.id === id);
    if (!summary) {
      container.innerHTML = `
        <a href="#/" class="back-link">← back to archive</a>
        <div class="loading">playlist not found.</div>
      `;
      return;
    }

    container.innerHTML = '<div class="loading">loading...</div>';
    let playlist = summary;
    try {
      const resp = await fetch(`playlists/${id}.json`);
      if (resp.ok) playlist = await resp.json();
    } catch (_) { /* fall back to summary-only data */ }

    container.innerHTML = `
      <a href="#/" class="back-link">← back to archive</a>
      <div class="detail-header">
        <h2>${esc(playlist.title)}</h2>
        <div class="meta">${playlist.date} · by ${esc(playlist.author || 'Claudette')}</div>
        ${playlist.description ? `<div class="excerpt">${esc(playlist.description)}</div>` : ''}
        <div class="detail-links">
          ${playlist.spotifyUrl ? `<a href="${esc(playlist.spotifyUrl)}" target="_blank" rel="noopener" class="btn btn-primary">open in spotify ↗</a>` : ''}
          <button class="btn" id="download-btn" title="download the tracklist as a text file">download tracklist ↓</button>
          ${playlist.spotifyId ? `<button class="btn" onclick="navigator.clipboard.writeText('${esc(playlist.spotifyId)}');this.textContent='copied!'">copy playlist id</button>` : ''}
        </div>
      </div>
      ${playlist.tracks && playlist.tracks.length ? `
        <ol class="tracklist">
          ${playlist.tracks.map((t, i) => `
            <li>
              <span class="track-num">${i + 1}.</span>
              <span class="track-artist">${esc(t.artist)}</span>
              <span class="track-title">— ${esc(t.title)}</span>
              <span class="track-meta">
                ${t.album ? `<span class="track-album">${esc(t.album)}</span>` : ''}
                ${t.year ? `<span class="track-year">${t.album ? ' &middot; ' : ''}${t.year}</span>` : ''}
              </span>
            </li>
          `).join('')}
        </ol>
      ` : '<p style="color:var(--muted)">tracklist not available yet.</p>'}

      ${playlist.essay ? `
        <div class="essay">
          <h3>about this playlist</h3>
          ${playlist.essay.split('\n').filter(Boolean).map(p => p.trim() ? `<p>${esc(p.trim())}</p>` : '').join('')}
        </div>
      ` : ''}

      ${(playlist.essay || playlist.description) ? `
        <div class="listen-row">
          <button class="btn" id="listen-btn">🔊 listen</button>
          <span class="listen-note" id="listen-note"></span>
        </div>
      ` : ''}

      <div id="family-tree-root"></div>
    `;

    const ftRoot = document.getElementById('family-tree-root');
    if (ftRoot && playlist.familyTree) {
      renderFamilyTree(ftRoot, playlist.familyTree);
    } else if (ftRoot) {
      ftRoot.remove();
    }

    const dlBtn = document.getElementById('download-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', () => downloadPlaylistText(playlist));
    }

    const listenBtn = document.getElementById('listen-btn');
    if (listenBtn) {
      listenBtn.addEventListener('click', async () => {
        const note = document.getElementById('listen-note');
        const text = playlist.essay ? playlist.essay : playlist.description || playlist.title;
        listenBtn.disabled = true;
        listenBtn.textContent = '🔊 generating…';
        note.textContent = '';
        try {
          const mode = await speakText(text);
          note.textContent = mode === 'elevenlabs' ? 'elevenlabs (alice)' : 'browser voice';
        } catch (err) {
          note.textContent = 'couldn\'t play audio here.';
        }
        listenBtn.disabled = false;
        listenBtn.textContent = '🔊 listen';
      });
    }
  }

  /* ── Family Tree ── */
  function renderFamilyTree(container, tree) {
    if (!tree || !tree.nodes || !tree.nodes.length) return;
    const { nodes, edges = [] } = tree;

    // Layer nodes by generation: ancestors at top, descendants at bottom.
    // Node may specify a layer; default: 0 for "source", 1 for "core", 2 for "descendant".
    const LAYER_LABELS = tree.layerLabels || ['ancestors', 'core', 'scene / after'];
    const layers = [[], [], []];
    nodes.forEach(n => {
      const l = Math.max(0, Math.min(2, n.layer ?? (n.role === 'source' ? 0 : n.role === 'core' ? 1 : 2)));
      n._layer = l;
      layers[l].push(n);
    });

    const COL_W = 280, ROW_H = 92, PAD = 40;
    // Layer widths: ancestors may use 2 columns when crowded; later layers shift right.
    const colStarts = [0];
    layers.forEach((layer, li) => {
      const usesTwo = layer.length > 4;
      colStarts[li + 1] = colStarts[li] + (usesTwo ? 2 : 1);
    });
    const totalCols = colStarts[3];
    const W = PAD * 2 + totalCols * COL_W + 60;
    const H = PAD * 2 + Math.max(...layers.map(l => l.length), 1) * ROW_H;
    const pos = {};
    layers.forEach((layer, li) => {
      const n = layer.length;
      const usesTwo = n > 4;
      const perCol = Math.ceil(n / (usesTwo ? 2 : 1));
      layer.forEach((node, i) => {
        const col = usesTwo ? Math.floor(i / perCol) : 0;
        const row = usesTwo ? i % perCol : i;
        pos[node.id] = {
          x: PAD + 30 + (colStarts[li] + col) * COL_W + COL_W / 2,
          y: PAD + (row + 0.5) * ROW_H,
        };
      });
    });

    const color = (l) => ['var(--accent)', 'var(--fg)', 'var(--muted)'][l];
    const nodeEl = (n) => `
      <g class="ft-node" data-id="${esc(n.id)}" data-layer="${n._layer}" transform="translate(${pos[n.id].x},${pos[n.id].y})">
        <circle r="20" fill="${color(n._layer)}" opacity="0.12"/>
        <circle r="8" fill="${color(n._layer)}"/>
        <text y="34" text-anchor="middle" class="ft-name">${esc(n.name)}</text>
        ${n.note ? `<text y="48" text-anchor="middle" class="ft-note">${esc(n.note)}</text>` : ''}
      </g>`;

    const edgeEl = (e) => {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return '';
      const mx = (a.x + b.x) / 2;
      // Label at t=0.35 along the bezier — sits in the gap between columns,
      // away from both endpoint nodes.
      const t = 0.35, u = 1 - t;
      const lx = u * u * a.x + 2 * u * t * mx + t * t * b.x;
      const ly = u * u * a.y + 2 * u * t * a.y + t * t * b.y;
      return `
        <path class="ft-edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}"
          d="M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}" fill="none"/>
        ${e.label ? `<text class="ft-edge-label" x="${lx}" y="${ly - 6}">${esc(e.label)}</text>` : ''}
      `;
    };

    container.innerHTML = `
      <div class="family-tree">
        <h3>the family tree</h3>
        <div class="ft-legend">
          ${LAYER_LABELS.map((l, i) => `<span class="ft-legend-item"><i style="background:${color(i)}"></i>${l}</span>`).join('')}
        </div>
        <div class="ft-scroll">
          <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ft-svg">
            ${edges.map(edgeEl).join('')}
            ${nodes.map(nodeEl).join('')}
          </svg>
        </div>
        <div class="ft-tooltip" id="ft-tooltip"></div>
      </div>
    `;

    // Hover highlight + tooltip
    const tooltip = container.querySelector('#ft-tooltip');
    const clearHighlights = () => {
      container.querySelectorAll('.ft-node.hl, .ft-edge.hl').forEach(el => el.classList.remove('hl'));
      tooltip.classList.remove('visible');
    };
    container.querySelectorAll('.ft-node').forEach(g => {
      g.addEventListener('mouseenter', () => {
        const id = g.dataset.id;
        clearHighlights();
        g.classList.add('hl');
        container.querySelectorAll(`.ft-edge[data-from="${id}"], .ft-edge[data-to="${id}"]`).forEach(e => e.classList.add('hl'));
        const n = nodes.find(x => x.id === id);
        tooltip.innerHTML = `<strong>${esc(n.name)}</strong>${n.note ? ' · ' + esc(n.note) : ''}`;
        tooltip.classList.add('visible');
        tooltip.style.left = pos[id].x + 'px';
        tooltip.style.top = pos[id].y + 'px';
      });
    });
    container.querySelector('.ft-svg').addEventListener('mouseleave', clearHighlights);
  }

  /* ── Listen button (TTS) ── */
  // ElevenLabs webhook — reachable only on the tailnet; off-tailnet browsers
  // fall back to browser speechSynthesis inside speakText.
  const TTS_WEBHOOK_URL = 'https://claudette-2.tail3896b7.ts.net/playlist-idea/tts';
  async function speakText(text) {
    // Try ElevenLabs via webhook first (on-tailnet). Fall back to browser speech.
    try {
      const resp = await fetch(TTS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const { id } = await resp.json();
        const audio = new Audio(`${TTS_WEBHOOK_URL}/${id}`);
        await audio.play();
        return 'elevenlabs';
      }
    } catch (_) { /* fall through */ }
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      return 'browser';
    }
    throw new Error('no TTS available');
  }

  /* ── Helpers ── */
  /* Download: build a plain-text tracklist and trigger a client-side download.
     No backend needed — the data is already in the playlist JSON. */
  function buildTracklistText(p) {
    const lines = [];
    lines.push(p.title || 'Untitled playlist');
    lines.push('');
    const meta = [];
    if (p.date) meta.push(`curated ${p.date}`);
    if (p.author) meta.push(`by ${p.author}`);
    if (meta.length) lines.push(meta.join(' '));
    if (p.description) lines.push(p.description);
    if (p.themes && p.themes.length) lines.push('themes: ' + p.themes.join(', '));
    lines.push('');
    if (p.tracks && p.tracks.length) {
      p.tracks.forEach((t, i) => {
        const bits = [t.album, t.year].filter(Boolean).join(', ');
        lines.push(`${i + 1}. ${t.artist} — ${t.title}${bits ? ` (${bits})` : ''}`);
      });
    } else {
      lines.push('(no tracklist available yet)');
    }
    lines.push('');
    if (p.spotifyUrl) lines.push(`listen on spotify: ${p.spotifyUrl}`);
    return lines.join('\n');
  }

  function triggerDownload(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Fetches the full playlist JSON (cards only have the summary), then downloads.
  // Returns true on success so callers can give feedback.
  async function downloadPlaylist(id) {
    try {
      const resp = await fetch(`playlists/${encodeURIComponent(id)}.json`);
      if (!resp.ok) throw new Error('bad status');
      const p = await resp.json();
      triggerDownload(`${p.id || id}.txt`, buildTracklistText(p));
      return true;
    } catch (err) {
      console.warn('download failed:', err);
      return false;
    }
  }

  function downloadPlaylistText(p) {
    triggerDownload(`${p.id || 'playlist'}.txt`, buildTracklistText(p));
  }

  function esc(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /* ── Init ── */
  async function init() {
    await loadPlaylistIndex();
    renderView();
    window.addEventListener('hashchange', renderView);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
