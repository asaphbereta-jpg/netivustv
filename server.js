const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para permitir CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Serve os arquivos estáticos (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Rota Proxy Anti-CORS
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'URL ausente' });
    }

    try {
        console.log(`🔄 Proxy request: ${targetUrl}`);
        
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            timeout: 15000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'http://vivotv.site/'
            }
        });

        const contentType = response.headers['content-type'] || '';

        // Se for uma playlist M3U8, reescrevemos as URLs
        if (contentType.includes('mpegurl') || targetUrl.includes('.m3u') || targetUrl.includes('.m3u8')) {
            let body = '';
            response.data.on('data', chunk => body += chunk);
            response.data.on('end', () => {
                try {
                    const baseUrl = new URL(targetUrl).origin;
                    const rewritten = body.replace(/^(https?:\/\/[^\s]+)$/gm, (match) => {
                        return `/proxy?url=${encodeURIComponent(match)}`;
                    }).replace(/^(?!#)([^\s]+\.(m3u8|ts|mp4|aac))$/gm, (match) => {
                        return `/proxy?url=${encodeURIComponent(baseUrl + '/' + match)}`;
                    });
                    
                    res.set('Content-Type', 'application/vnd.apple.mpegurl');
                    res.set('Access-Control-Allow-Origin', '*');
                    res.send(rewritten);
                } catch (e) {
                    res.send(body);
                }
            });
        } else {
            // Se for vídeo ou outro conteúdo, apenas repassa
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

// Rota de teste
app.get('/test', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor rodando!' });
});

app.listen(PORT, () => {
    console.log(`🚀 CyberIPTV Server rodando na porta ${PORT}`);
});
