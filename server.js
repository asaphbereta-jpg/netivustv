/**
 * ============================================================
 *  IPTV CYBER WEBAPP - Servidor Node.js
 *  Proxy CORS + Servidor Estático
 *  Autor: Asaph | Tema: Cyberpunk/Futurista
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// URL padrão da playlist M3U
const DEFAULT_PLAYLIST_URL =
  'http://vivotv.site/get.php?username=Cervera2028&password=Cervera2028&type=m3u_plus';

// Middlewares globais
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ============================================================
 *  ENDPOINT: Proxy da Playlist M3U
 *  Evita bloqueios de CORS no navegador
 * ============================================================
 */
app.get('/api/playlist', async (req, res) => {
  try {
    console.log('[PROXY] Buscando playlist M3U...');

    const response = await fetch(DEFAULT_PLAYLIST_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (SmartTV; Tizen) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.31 Safari/537.36',
        Accept: '*/*',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.text();
    console.log('[PROXY] Playlist carregada com sucesso.');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache 5 min
    res.send(data);
  } catch (error) {
    console.error('[PROXY] Erro ao buscar playlist:', error.message);
    res.status(502).json({
      error: 'Falha ao carregar a playlist.',
      details: error.message,
    });
  }
});

/**
 * ============================================================
 *  ENDPOINT: Proxy Genérico para Streams/Imagens
 *  Permite contornar CORS em logos e streams
 * ============================================================
 */
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Parâmetro "url" é obrigatório.' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (SmartTV; Tizen) AppleWebKit/537.36',
        Referer: targetUrl,
      },
      timeout: 20000,
    });

    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }

    // Encaminha headers relevantes
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    res.setHeader('Cache-Control', 'public, max-age=3600');
    response.body.pipe(res);
  } catch (error) {
    console.error('[PROXY] Erro no proxy genérico:', error.message);
    res.status(502).json({ error: 'Falha no proxy.', details: error.message });
  }
});

/**
 * ============================================================
 *  ENDPOINT: Health Check
 * ============================================================
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    playlist: DEFAULT_PLAYLIST_URL,
  });
});

/**
 * ============================================================
 *  FALLBACK: SPA - Redireciona tudo para index.html
 * ============================================================
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * ============================================================
 *  START SERVER
 * ============================================================
 */
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════╗
  ║   🚀 IPTV CYBER WEBAPP - Servidor Online         ║
  ║   🌐 Porta: ${PORT}                                 ║
  ║   📡 URL:   http://localhost:${PORT}                ║
  ║   🎨 Tema:  Cyberpunk/Futurista                  ║
  ╚════════════════════════════════════════════════════╝
  `);
});
