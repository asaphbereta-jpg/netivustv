/**
 * ============================================================
 *  IPTV CYBER WEBAPP - Lógica Frontend
 *  Autor: Asaph | Tema: Cyberpunk/Futurista
 *  Funcionalidades: M3U parser, favoritos, busca, player HLS,
 *  categorias, navegação por controle remoto (Smart TV)
 * ============================================================
 */

(() => {
  'use strict';

  // ============ CONFIGURAÇÃO ============
  const CONFIG = {
    API_BASE: '', // Mesma origem (proxy no server.js)
    PLAYLIST_ENDPOINT: '/api/playlist',
    PROXY_ENDPOINT: '/api/proxy',
    STORAGE_KEYS: {
      FAVORITES: 'iptv_cyber_favorites',
      LAST_CATEGORY: 'iptv_cyber_last_category',
    },
    LOADING_DELAY: 2500, // Delay da tela de carregamento
  };

  // ============ ESTADO GLOBAL ============
  const state = {
    channels: [],           // Lista completa de canais
    categories: [],         // Lista de categorias
    filteredChannels: [],   // Canais filtrados (busca/categoria)
    favorites: [],          // IDs dos favoritos
    currentCategory: 'all', // Categoria ativa
    currentChannel: null,   // Canal sendo reproduzido
    searchQuery: '',        // Termo de busca
    hlsInstance: null,      // Instância HLS.js
    isPlayerOpen: false,
    focusIndex: 0,          // Índice de foco para navegação TV
  };

  // ============ ELEMENTOS DOM ============
  const $ = (id) => document.getElementById(id);
  const els = {
    loading: $('loading-screen'),
    app: $('app'),
    searchInput: $('search-input'),
    clearSearch: $('clear-search'),
    categoriesList: $('categories-list'),
    channelsGrid: $('channels-grid'),
    favoritesGrid: $('favorites-grid'),
    channelsEmpty: $('channels-empty'),
    favoritesEmpty: $('favorites-empty'),
    channelCount: $('channel-count'),
    sectionTitle: $('section-title'),
    heroTitle: $('hero-title'),
    heroSubtitle: $('hero-subtitle'),
    heroPlayBtn: $('hero-play-btn'),
    heroSection: $('hero-section'),
    playerModal: $('player-modal'),
    videoPlayer: $('video-player'),
    playerTitle: $('player-title'),
    playerLogo: $('player-logo'),
    playerLoading: $('player-loading'),
    playerError: $('player-error'),
    errorMessage: $('error-message'),
    btnClosePlayer: $('btn-close-player'),
    btnFullscreen: $('btn-fullscreen'),
    btnPip: $('btn-pip'),
    btnMute: $('btn-mute'),
    volumeIcon: $('volume-icon'),
    volumeSlider: $('volume-slider'),
    btnPrevChannel: $('btn-prev-channel'),
    btnNextChannel: $('btn-next-channel'),
    btnFavChannel: $('btn-fav-channel'),
    favIcon: $('fav-icon'),
    btnFavorites: $('btn-favorites'),
    btnUpload: $('btn-upload'),
    fileInput: $('file-input'),
    btnRefresh: $('btn-refresh'),
    btnRetry: $('btn-retry'),
    toast: $('toast'),
  };

  // ============ UTILITÁRIOS ============
  const utils = {
    /** Gera ID único para canal baseado em nome+url */
    generateId(name, url) {
      const str = `${name}|${url}`;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return `ch_${Math.abs(hash).toString(36)}`;
    },

    /** Retorna iniciais do nome para fallback de logo */
    getInitials(name) {
      if (!name) return '?';
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    },

    /** Escapa HTML para evitar XSS */
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    /** Mostra notificação toast */
    showToast(message, duration = 2500) {
      els.toast.textContent = message;
      els.toast.classList.remove('hidden');
      els.toast.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        els.toast.classList.remove('show');
        setTimeout(() => els.toast.classList.add('hidden'), 400);
      }, duration);
    },

    /** Debounce para busca */
    debounce(fn, delay = 300) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },
  };

  // ============ PARSER M3U ============
  const m3uParser = {
    /**
     * Faz o parse de uma playlist M3U/M3U8
     * Retorna array de objetos channel
     */
    parse(content) {
      if (!content || typeof content !== 'string') return [];

      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const channels = [];
      let current = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('#EXTINF')) {
          // Extrai metadados do #EXTINF
          current = this._parseExtInf(line);
        } else if (line.startsWith('#')) {
          // Outras diretivas - ignora
          continue;
        } else if (current && (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('//'))) {
          // URL do stream
          current.url = line;
          current.id = utils.generateId(current.name, current.url);
          channels.push(current);
          current = null;
        }
      }

      console.log(`[M3U] ${channels.length} canais parseados.`);
      return channels;
    },

    /** Parse da linha #EXTINF */
    _parseExtInf(line) {
      const channel = {
        name: '',
        logo: '',
        group: 'Sem Categoria',
        tvgId: '',
        tvgName: '',
      };

      // Extrai atributos tvg-* e group-title
      const attrsRegex = /([a-zA-Z0-9\-]+)="([^"]*)"/g;
      let match;
      while ((match = attrsRegex.exec(line)) !== null) {
        const key = match[1].toLowerCase();
        const value = match[2];
        switch (key) {
          case 'tvg-logo': channel.logo = value; break;
          case 'group-title': channel.group = value || 'Sem Categoria'; break;
          case 'tvg-id': channel.tvgId = value; break;
          case 'tvg-name': channel.tvgName = value; break;
        }
      }

      // Extrai nome do canal (após a última vírgula)
      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) {
        channel.name = nameMatch[1].trim();
      }

      return channel;
    },
  };

  // ============ STORAGE (FAVORITOS) ============
  const storage = {
    loadFavorites() {
      try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEYS.FAVORITES);
        state.favorites = data ? JSON.parse(data) : [];
      } catch (e) {
        console.error('[STORAGE] Erro ao carregar favoritos:', e);
        state.favorites = [];
      }
    },

    saveFavorites() {
      try {
        localStorage.setItem(
          CONFIG.STORAGE_KEYS.FAVORITES,
          JSON.stringify(state.favorites)
        );
      } catch (e) {
        console.error('[STORAGE] Erro ao salvar favoritos:', e);
      }
    },

    toggleFavorite(channelId) {
      const idx = state.favorites.indexOf(channelId);
      if (idx >= 0) {
        state.favorites.splice(idx, 1);
        utils.showToast('Removido dos favoritos');
      } else {
        state.favorites.push(channelId);
        utils.showToast('Adicionado aos favoritos ⭐');
      }
      this.saveFavorites();
      renderFavorites();
      updateFavButtons();
    },

    isFavorite(channelId) {
      return state.favorites.includes(channelId);
    },
  };

  // ============ API / CARREGAMENTO ============
  const api = {
    /** Carrega playlist do servidor (proxy CORS) */
    async loadPlaylist() {
      try {
        utils.showToast('Carregando playlist...');
        const response = await fetch(CONFIG.API_BASE + CONFIG.PLAYLIST_ENDPOINT);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return m3uParser.parse(text);
      } catch (error) {
        console.error('[API] Erro ao carregar playlist:', error);
        utils.showToast('Erro ao carregar playlist');
        return [];
      }
    },

    /** Carrega playlist de arquivo local */
    async loadFromFile(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const channels = m3uParser.parse(e.target.result);
          resolve(channels);
        };
        reader.onerror = () => {
          utils.showToast('Erro ao ler arquivo');
          resolve([]);
        };
        reader.readAsText(file);
      });
    },

    /** Usa proxy para imagens com CORS */
    proxyUrl(url) {
      if (!url) return '';
      // Se já for proxy, retorna direto
      if (url.includes(CONFIG.PROXY_ENDPOINT)) return url;
      return `${CONFIG.API_BASE}${CONFIG.PROXY_ENDPOINT}?url=${encodeURIComponent(url)}`;
    },
  };

  // ============ RENDERIZAÇÃO ============

  /** Renderiza lista de categorias na sidebar */
  function renderCategories() {
    // Conta canais por categoria
    const counts = {};
    state.channels.forEach((ch) => {
      counts[ch.group] = (counts[ch.group] || 0) + 1;
    });

    // Ordena alfabeticamente
    state.categories = Object.keys(counts).sort((a, b) => a.localeCompare(b));

    let html = `
      <div class="category-item ${state.currentCategory === 'all' ? 'active' : ''}"
           data-category="all" tabindex="0">
        <span>TODOS</span>
        <span class="count">${state.channels.length}</span>
      </div>
    `;

    state.categories.forEach((cat) => {
      html += `
        <div class="category-item ${state.currentCategory === cat ? 'active' : ''}"
             data-category="${utils.escapeHtml(cat)}" tabindex="0">
          <span>${utils.escapeHtml(cat)}</span>
          <span class="count">${counts[cat]}</span>
        </div>
      `;
    });

    els.categoriesList.innerHTML = html;

    // Adiciona listeners
    els.categoriesList.querySelectorAll('.category-item').forEach((el) => {
      el.addEventListener('click', () => {
        state.currentCategory = el.dataset.category;
        applyFilters();
        renderCategories();
        els.channelsGrid.scrollTo({ top: 0, behavior: 'smooth' });
      });

      // Navegação por teclado (TV)
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });
  }

  /** Cria HTML de um card de canal */
  function createChannelCard(channel) {
    const isFav = storage.isFavorite(channel.id);
    const logoSrc = channel.logo ? api.proxyUrl(channel.logo) : '';
    const initials = utils.getInitials(channel.name);

    const logoHtml = logoSrc
      ? `<img class="channel-logo" src="${utils.escapeHtml(logoSrc)}"
             alt="${utils.escapeHtml(channel.name)}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
             loading="lazy" />
         <div class="channel-logo-fallback" style="display:none">${initials}</div>`
      : `<div class="channel-logo-fallback">${initials}</div>`;

    return `
      <div class="channel-card" data-id="${channel.id}" tabindex="0">
        <button class="channel-fav-btn ${isFav ? 'active' : ''}"
                data-fav-id="${channel.id}" title="Favoritar">
          <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
        ${logoHtml}
        <div class="channel-name">${utils.escapeHtml(channel.name)}</div>
      </div>
    `;
  }

  /** Renderiza grid de canais filtrados */
  function renderChannels() {
    const channels = state.filteredChannels;
    els.channelCount.textContent = `${channels.length} canal${channels.length !== 1 ? 'is' : ''}`;

    if (channels.length === 0) {
      els.channelsGrid.innerHTML = '';
      els.channelsEmpty.classList.remove('hidden');
      return;
    }

    els.channelsEmpty.classList.add('hidden');
    els.channelsGrid.innerHTML = channels.map(createChannelCard).join('');
    attachChannelCardListeners(els.channelsGrid);
  }

  /** Renderiza grid de favoritos */
  function renderFavorites() {
    const favChannels = state.channels.filter((ch) => storage.isFavorite(ch.id));

    if (favChannels.length === 0) {
      els.favoritesGrid.innerHTML = '';
      els.favoritesEmpty.classList.remove('hidden');
      return;
    }

    els.favoritesEmpty.classList.add('hidden');
    els.favoritesGrid.innerHTML = favChannels.map(createChannelCard).join('');
    attachChannelCardListeners(els.favoritesGrid);
  }

  /** Adiciona listeners aos cards de canal */
  function attachChannelCardListeners(container) {
    container.querySelectorAll('.channel-card').forEach((card) => {
      // Click no card = abrir player
      card.addEventListener('click', (e) => {
        // Se clicou no botão de favorito, não abre player
        if (e.target.closest('.channel-fav-btn')) return;
        const channel = state.channels.find((c) => c.id === card.dataset.id);
        if (channel) openPlayer(channel);
      });

      // Teclado (TV)
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });

    // Botões de favorito
    container.querySelectorAll('.channel-fav-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        storage.toggleFavorite(btn.dataset.favId);
      });
    });
  }

  /** Atualiza estado visual dos botões de favorito */
  function updateFavButtons() {
    document.querySelectorAll('.channel-fav-btn').forEach((btn) => {
      const isFav = storage.isFavorite(btn.dataset.favId);
      btn.classList.toggle('active', isFav);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
    });

    // Atualiza botão do player
    if (state.currentChannel) {
      const isFav = storage.isFavorite(state.currentChannel.id);
      els.btnFavChannel.classList.toggle('active', isFav);
      els.favIcon.setAttribute('fill', isFav ? 'currentColor' : 'none');
    }
  }

  // ============ FILTROS ============

  /** Aplica filtros de categoria + busca */
  function applyFilters() {
    let result = [...state.channels];

    // Filtro por categoria
    if (state.currentCategory !== 'all') {
      result = result.filter((ch) => ch.group === state.currentCategory);
      els.sectionTitle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        ${utils.escapeHtml(state.currentCategory).toUpperCase()}
      `;
    } else {
      els.sectionTitle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        TODOS OS CANAIS
      `;
    }

    // Filtro por busca
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter((ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.group.toLowerCase().includes(q)
      );
    }

    state.filteredChannels = result;
    renderChannels();
  }

  // ============ PLAYER ============

  /** Abre o player com um canal */
  function openPlayer(channel) {
    state.currentChannel = channel;
    state.isPlayerOpen = true;

    // Atualiza UI
    els.playerTitle.textContent = channel.name;
    if (channel.logo) {
      els.playerLogo.src = api.proxyUrl(channel.logo);
      els.playerLogo.style.display = 'block';
    } else {
      els.playerLogo.style.display = 'none';
    }

    // Atualiza favorito
    const isFav = storage.isFavorite(channel.id);
    els.btnFavChannel.classList.toggle('active', isFav);
    els.favIcon.setAttribute('fill', isFav ? 'currentColor' : 'none');

    // Mostra modal
    els.playerModal.classList.remove('hidden');
    els.playerError.classList.add('hidden');
    els.playerLoading.classList.remove('hidden');

    // Inicia reprodução
    playStream(channel.url);

    // Atualiza hero
    els.heroTitle.textContent = channel.name;
    els.heroSubtitle.textContent = `Assistindo: ${channel.group}`;
  }

  /** Fecha o player */
  function closePlayer() {
    stopStream();
    state.isPlayerOpen = false;
    state.currentChannel = null;
    els.playerModal.classList.add('hidden');
  }

  /** Reproduz stream (HLS ou nativo) */
  function playStream(url) {
    stopStream(); // Limpa instância anterior

    const video = els.videoPlayer;
    const isHLS = /\.m3u8($|\?)/i.test(url);

    if (isHLS && Hls.isSupported()) {
      // Usa HLS.js
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((e) => console.warn('Autoplay bloqueado:', e));
        els.playerLoading.classList.add('hidden');
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[HLS] Erro:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              utils.showToast('Erro de rede. Tentando reconectar...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              utils.showToast('Erro de mídia. Recuperando...');
              hls.recoverMediaError();
              break;
            default:
              showPlayerError('Não foi possível reproduzir este canal.');
              stopStream();
              break;
          }
        }
      });

      state.hlsInstance = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS nativo
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch((e) => console.warn('Autoplay bloqueado:', e));
        els.playerLoading.classList.add('hidden');
      });
    } else {
      // Stream direto (MP4, etc)
      video.src = url;
      video.addEventListener('loadeddata', () => {
        video.play().catch((e) => console.warn('Autoplay bloqueado:', e));
        els.playerLoading.classList.add('hidden');
      });
    }

    // Eventos gerais do vídeo
    video.onwaiting = () => els.playerLoading.classList.remove('hidden');
    video.onplaying = () => els.playerLoading.classList.add('hidden');
    video.onerror = () => showPlayerError('Erro ao carregar stream.');
  }

  /** Para o stream atual */
  function stopStream() {
    const video = els.videoPlayer;
    if (state.hlsInstance) {
      state.hlsInstance.destroy();
      state.hlsInstance = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  /** Mostra erro no player */
  function showPlayerError(message) {
    els.playerLoading.classList.add('hidden');
    els.errorMessage.textContent = message;
    els.playerError.classList.remove('hidden');
  }

  /** Troca para canal anterior/próximo */
  function changeChannel(direction) {
    if (!state.currentChannel || state.filteredChannels.length === 0) return;

    const currentIdx = state.filteredChannels.findIndex(
      (c) => c.id === state.currentChannel.id
    );

    let newIdx;
    if (direction === 'next') {
      newIdx = (currentIdx + 1) % state.filteredChannels.length;
    } else {
      newIdx = (currentIdx - 1 + state.filteredChannels.length) % state.filteredChannels.length;
    }

    openPlayer(state.filteredChannels[newIdx]);
    utils.showToast(`Canal ${newIdx + 1} de ${state.filteredChannels.length}`);
  }

  // ============ EVENTOS ============

  /** Configura todos os event listeners */
  function setupEventListeners() {
    // Busca
    els.searchInput.addEventListener('input', utils.debounce((e) => {
      state.searchQuery = e.target.value.trim();
      els.clearSearch.classList.toggle('hidden', !state.searchQuery);
      applyFilters();
    }, 300));

    els.clearSearch.addEventListener('click', () => {
      els.searchInput.value = '';
      state.searchQuery = '';
      els.clearSearch.classList.add('hidden');
      applyFilters();
      els.searchInput.focus();
    });

    // Player - fechar
    els.btnClosePlayer.addEventListener('click', closePlayer);

    // Player - fullscreen
    els.btnFullscreen.addEventListener('click', () => {
      const container = document.querySelector('.player-container');
      if (!document.fullscreenElement) {
        (container.requestFullscreen || container.webkitRequestFullscreen || (() => {})).call(container);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      }
    });

    // Player - Picture-in-Picture
    els.btnPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await els.videoPlayer.requestPictureInPicture();
        }
      } catch (e) {
        utils.showToast('PiP não suportado');
      }
    });

    // Player - volume
    els.btnMute.addEventListener('click', () => {
      els.videoPlayer.muted = !els.videoPlayer.muted;
      updateVolumeIcon();
    });

    els.volumeSlider.addEventListener('input', (e) => {
      els.videoPlayer.volume = e.target.value / 100;
      els.videoPlayer.muted = e.target.value == 0;
      updateVolumeIcon();
    });

    // Player - navegação entre canais
    els.btnPrevChannel.addEventListener('click', () => changeChannel('prev'));
    els.btnNextChannel.addEventListener('click', () => changeChannel('next'));

    // Player - favoritar canal atual
    els.btnFavChannel.addEventListener('click', () => {
      if (state.currentChannel) {
        storage.toggleFavorite(state.currentChannel.id);
      }
    });

    // Player - retry
    els.btnRetry.addEventListener('click', () => {
      if (state.currentChannel) {
        els.playerError.classList.add('hidden');
        els.playerLoading.classList.remove('hidden');
        playStream(state.currentChannel.url);
      }
    });

    // Header - favoritos (scroll para seção)
    els.btnFavorites.addEventListener('click', () => {
      $('favorites-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Header - upload de arquivo
    els.btnUpload.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      utils.showToast('Processando arquivo...');
      const channels = await api.loadFromFile(file);
      if (channels.length > 0) {
        state.channels = channels;
        state.currentCategory = 'all';
        state.searchQuery = '';
        els.searchInput.value = '';
        initializeApp();
        utils.showToast(`${channels.length} canais carregados!`);
      } else {
        utils.showToast('Nenhum canal encontrado no arquivo');
      }
      els.fileInput.value = '';
    });

    // Header - refresh
    els.btnRefresh.addEventListener('click', async () => {
      utils.showToast('Recarregando playlist...');
      const channels = await api.loadPlaylist();
      if (channels.length > 0) {
        state.channels = channels;
        initializeApp();
        utils.showToast('Playlist atualizada!');
      }
    });

    // Hero - play
    els.heroPlayBtn.addEventListener('click', () => {
      if (state.channels.length > 0) {
        // Abre primeiro canal ou aleatório
        const random = state.channels[Math.floor(Math.random() * state.channels.length)];
        openPlayer(random);
      }
    });

    // ESC fecha player
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isPlayerOpen) {
        closePlayer();
      }
    });

    // Navegação por controle remoto (Smart TV)
    setupTVNavigation();
  }

  /** Atualiza ícone de volume */
  function updateVolumeIcon() {
    const muted = els.videoPlayer.muted || els.videoPlayer.volume === 0;
    const iconSvg = muted
      ? `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
         <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"></line>
         <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"></line>`
      : `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
         <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
    els.volumeIcon.innerHTML = iconSvg;
  }

  /** Navegação por teclado para Smart TV (setas, ENTER, CH+/CH-) */
  function setupTVNavigation() {
    document.addEventListener('keydown', (e) => {
      // Player aberto - atalhos
      if (state.isPlayerOpen) {
        switch (e.key) {
          case 'ChannelUp':
          case 'PageUp':
            e.preventDefault();
            changeChannel('next');
            break;
          case 'ChannelDown':
          case 'PageDown':
            e.preventDefault();
            changeChannel('prev');
            break;
          case 'MediaPlayPause':
          case ' ':
            e.preventDefault();
            if (els.videoPlayer.paused) els.videoPlayer.play();
            else els.videoPlayer.pause();
            break;
          case 'ArrowUp':
            e.preventDefault();
            els.videoPlayer.volume = Math.min(1, els.videoPlayer.volume + 0.1);
            els.volumeSlider.value = els.videoPlayer.volume * 100;
            updateVolumeIcon();
            break;
          case 'ArrowDown':
            e.preventDefault();
            els.videoPlayer.volume = Math.max(0, els.videoPlayer.volume - 0.1);
            els.volumeSlider.value = els.videoPlayer.volume * 100;
            updateVolumeIcon();
            break;
          case 'm':
          case 'M':
            els.btnMute.click();
            break;
          case 'f':
          case 'F':
            els.btnFullscreen.click();
            break;
        }
        return;
      }

      // Navegação por setas no grid (TV)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const cards = Array.from(els.channelsGrid.querySelectorAll('.channel-card'));
        if (cards.length === 0) return;

        const currentFocused = document.activeElement;
        let currentIndex = cards.indexOf(currentFocused);
        if (currentIndex < 0) currentIndex = 0;

        // Calcula colunas visíveis
        const gridWidth = els.channelsGrid.clientWidth;
        const cardWidth = cards[0].offsetWidth + 16; // gap
        const cols = Math.max(1, Math.floor(gridWidth / cardWidth));

        let newIndex = currentIndex;
        switch (e.key) {
          case 'ArrowRight': newIndex = Math.min(cards.length - 1, currentIndex + 1); break;
          case 'ArrowLeft': newIndex = Math.max(0, currentIndex - 1); break;
          case 'ArrowDown': newIndex = Math.min(cards.length - 1, currentIndex + cols); break;
          case 'ArrowUp': newIndex = Math.max(0, currentIndex - cols); break;
        }

        if (newIndex !== currentIndex) {
          e.preventDefault();
          cards[newIndex].focus();
          cards[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    });
  }

  // ============ INICIALIZAÇÃO ============

  /** Inicializa o app após carregar canais */
  function initializeApp() {
    renderCategories();
    applyFilters();
    renderFavorites();

    // Atualiza hero com canal aleatório
    if (state.channels.length > 0) {
      const random = state.channels[Math.floor(Math.random() * state.channels.length)];
      els.heroTitle.textContent = random.name;
      els.heroSubtitle.textContent = `Experimente: ${random.group}`;
    }
  }

  /** Boot principal */
  async function boot() {
    console.log('%c🚀 IPTV CYBER WEBAPP', 'color:#00ff88;font-size:20px;font-weight:bold');
    console.log('%cInicializando sistema...', 'color:#00e5ff');

    // Carrega favoritos do storage
    storage.loadFavorites();

    // Configura eventos
    setupEventListeners();

    // Carrega playlist
    const channels = await api.loadPlaylist();

    if (channels.length > 0) {
      state.channels = channels;
      initializeApp();
      console.log(`%c✓ ${channels.length} canais carregados`, 'color:#00ff88');
    } else {
      utils.showToast('Erro ao carregar playlist. Tente o upload manual.');
      console.warn('[BOOT] Nenhum canal carregado.');
    }

    // Esconde loading, mostra app
    setTimeout(() => {
      els.loading.classList.add('fade-out');
      els.app.classList.remove('hidden');
      setTimeout(() => els.loading.classList.add('hidden'), 600);
    }, CONFIG.LOADING_DELAY);
  }

  // Inicia quando DOM pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();