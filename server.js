const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'URL ausente' });
    }

    try {
        console.log(`🔄 Proxy: ${targetUrl}`);
        
        // Headers mais realistas para evitar bloqueio
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/vnd.apple.mpegurl, application/octet-stream, */*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'DNT': '1',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            maxRedirects: 5,
            validateStatus: (status) => status < 500
        });

        // Verifica se é realmente uma playlist M3U
        const contentType = response.headers['content-type'] || '';
        const isM3U = contentType.includes('mpegurl') || 
                      contentType.includes('x-mpegurl') ||
                      targetUrl.includes('.m3u') ||
                      targetUrl.includes('type=m3u');

        if (isM3U) {
            let body = '';
            response.data.on('data', chunk => body += chunk);
            response.data.on('end', () => {
                // Verifica se é uma playlist válida
                if (body.includes('#EXTM3U') || body.includes('#EXTINF')) {
                    console.log(`✅ Playlist válida carregada (${body.length} bytes)`);
                    
                    // Reescreve URLs para passar pelo proxy
                    const baseUrl = new URL(targetUrl).origin;
                    const rewritten = body.replace(/^(https?:\/\/[^\s]+)$/gm, (match) => {
                        if (match.includes('get.php') || match.includes('.m3u8') || match.includes('.ts')) {
                            return `/proxy?url=${encodeURIComponent(match)}`;
                        }
                        return match;
                    });
                    
                    res.set('Content-Type', 'application/vnd.apple.mpegurl');
                    res.set('Access-Control-Allow-Origin', '*');
                    res.send(rewritten);
                } else {
                    console.error('❌ Resposta inválida - não é uma playlist M3U');
                    console.error('Primeiros 500 chars:', body.substring(0, 500));
                    res.status(500).json({ 
                        error: 'Resposta inválida do servidor',
                        message: 'O provedor bloqueou a requisição ou retornou conteúdo inválido'
                    });
                }
            });
        } else {
            console.log(`📹 Stream direto: ${contentType}`);
            res.set('Content-Type', contentType);
            res.set('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
        }
        
    } catch (error) {
        console.error('❌ Proxy error:', error.message);
        res.status(500).json({ 
            error: 'Falha ao carregar',
            message: error.message 
        });
    }
});

app.get('/test', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor rodando!' });
});

app.listen(PORT, () => {
    console.log(`🚀 CyberIPTV Server rodando na porta ${PORT}`);
});
