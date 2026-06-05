/**
 * ============================================================
 *  IPTV CYBER WEBAPP - Servidor Node.js
 *  Proxy CORS + Ignora SSL (igual VLC)
 *  Autor: Asaph | Tema: Cyberpunk/Futurista
 * ============================================================
 */

// ⚠️ IMPORTANTE: Ignorar certificados SSL inválidos (igual VLC)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const compression = require('compression');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// URL padrão da playlist M3U
const DEFAULT_PLAYLIST_URL = process.env.PLAYLIST_URL || 
  'http://vivotv.site/get.php?username=Cervera2028&password=Cervera2028&type=m3u_plus';

// Agente HTTPS que ignora certificados inválidos (igual VLC)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 50,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
});

// Middlewares globais
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

/**
 * ============================================================
 *  ENDPOINT: Configurações
 * ============================================================
 */
app.get('/api/config', (req, res) => {
  res.json({
    playlistUrl: DEFAULT_PLAYLIST_URL,
    version: '1.1.0',
    sslIgnore: true,
    features: {
      upload: true,
      customUrl: true,
    }
  });
});

/**
 * ============================================================
 *  ENDPOINT: Proxy da Playlist M3U (IGNORA SSL)
 * ============================================================
 */
app.get('/api/playlist', async (req, res) => {
  const playlistUrl = req.query.url || DEFAULT_PLAYLIST_URL;
  
  console.log(`[PROXY] Requisição: ${playlistUrl.substring(0, 60)}...`);

  try {
    // Seleciona agente baseado no protocolo
    const agent = playlistUrl.startsWith('https') ? httpsAgent : httpAgent;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(playlistUrl, {
      agent: agent,
      headers: {
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
      timeout: 30000,
      redirect: 'follow',
      follow: 5,
    });

    clearTimeout(timeout);

    console.log(`[PROXY] Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.text();
    
    if (!data || data.length < 10) {
      throw new Error('Playlist vazia ou inválida');
    }

    if (!data.includes('#EXTM3U')) {
      console.warn('[PROXY] Aviso: Playlist pode não ser válida (sem #EXTM3U)');
    }

    console.log(`[PROXY] Sucesso! ${data.length} bytes, ${data.split('\n').length} linhas`);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Playlist-Source', playlistUrl.substring(0, 100));
    res.send(data);
    
  } catch (error) {
    console.error('[PROXY] Erro detalhado:', {
      message: error.message,
      code: error.code,
      type: error.type,
      name: error.name,
    });

    let statusCode = 502;
    let errorMessage = 'Falha ao carregar playlist';
    let errorDetails = error.message;

    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Servidor recusou conexão';
      errorDetails = 'O servidor IPTV está offline ou inacessível';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      errorMessage = 'Tempo esgotado';
      errorDetails = 'Servidor demorou muito para responder (>30s)';
    } else if (error.name === 'AbortError') {
      errorMessage = 'Timeout da requisição';
      errorDetails = 'A requisição excedeu 30 segundos';
    } else if (error.message.includes('CERT')) {
      errorMessage = 'Erro de certificado SSL';
      errorDetails = 'Certificado inválido ou expirado (já configurado para ignorar)';
    } else if (error.message.includes('ENOTFOUND')) {
      errorMessage = 'DNS não encontrado';
      errorDetails = 'O domínio do servidor não existe ou está inacessível';
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: errorDetails,
      code: error.code || 'UNKNOWN',
      url: playlistUrl,
      timestamp: new Date().toISOString(),
      suggestion: 'Use upload de arquivo M3U ou verifique a URL',
      vlcWorks: 'Se funciona no VLC, tente usar upload manual do arquivo'
    });
  }
});

/**
 * ============================================================
 *  ENDPOINT: Teste de Conexão
 * ============================================================
 */
app.get('/api/test-url', async (req, res) => {
  const testUrl = req.query.url;
  
  if (!testUrl) {
    return res.status(400).json({ error: 'URL obrigatória' });
  }

  console.log(`[TEST] Testando URL: ${testUrl}`);

  try {
    const agent = testUrl.startsWith('https') ? httpsAgent : httpAgent;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(testUrl, {
      method: 'HEAD',
      agent: agent,
      headers: {
        'User-Agent': 'VLC/3.0.20',
      },
      signal: controller.signal,
      timeout: 10000,
    });

    clearTimeout(timeout);

    const result = {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      url: testUrl,
      sslIgnored: testUrl.startsWith('https'),
    };

    console.log('[TEST] Resultado:', result);
    res.json(result);

  } catch (error) {
    const result = {
      success: false,
      error: error.message,
      code: error.code,
      url: testUrl,
    };
    
    console.error('[TEST] Erro:', result);
    res.status(500).json(result);
  }
});

/**
 * ============================================================
 *  ENDPOINT: Proxy para Streams/Imagens (IGNORA SSL)
 * ============================================================
 */
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL obrigatória' });
  }

  try {
    const agent = targetUrl.startsWith('https') ? httpsAgent : httpAgent;

    const response = await fetch(targetUrl, {
      agent: agent,
      headers: {
        'User-Agent': 'VLC/3.0.20',
        'Referer': targetUrl,
      },
      timeout: 20000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    response.body.pipe(res);
    
  } catch (error) {
    console.error('[PROXY] Erro:', error.message);
    res.status(502).json({ 
      error: 'Falha no proxy', 
      details: error.message,
      url: targetUrl 
    });
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
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    playlist: DEFAULT_PLAYLIST_URL,
    sslIgnore: true,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

/**
 * ============================================================
 *  FALLBACK: SPA
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║    IPTV CYBER WEBAPP - Servidor Online           ║
  ║   🌐 Porta: ${PORT}                                   ║
  ║   📡 URL:   http://localhost:${PORT}                  ║
  ║   🎨 Tema:  Cyberpunk/Futurista                    ║
  ║   🔓 SSL:   IGNORADO (igual VLC)                   ║
  ║   📺 Playlist: ${DEFAULT_PLAYLIST_URL.substring(0, 35)}... ║
  ╚══════════════════════════════════════════════════════╝
  `);
});
