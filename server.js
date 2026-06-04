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
        
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'Referer': new URL(targetUrl).origin,
                'Origin': new URL(targetUrl).origin
            },
            maxRedirects: 10
        });

        const contentType = response.headers['content-type'] || '';
        const isM3U = contentType.includes('mpegurl') || 
                      contentType.includes('x-mpegurl') ||
                      targetUrl.includes('.m3u') ||
                      targetUrl.includes('type=m3u');

        if (isM3U) {
            let body = '';
            response.data.on('data', chunk => body += chunk);
            response.data.on('end', () => {
                console.log(`📝 Playlist recebida: ${body.length} bytes`);
                
                // Reescreve TODAS as URLs absolutas e relativas
                const baseUrl = new URL(targetUrl).origin;
                const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                
                const rewritten = body
                    // URLs absolutas
                    .replace(/^(https?:\/\/[^\s]+)$/gm, (match) => {
                        return `/proxy?url=${encodeURIComponent(match)}`;
                    })
                    // URLs relativas com caminho
                    .replace(/^([A-Za-z0-9_\-\/]+\.(m3u8|ts|mp4|aac|mp3))$/gm, (match) => {
                        return `/proxy?url=${encodeURIComponent(basePath + match)}`;
                    })
                    // URLs relativas simples
                    .replace(/^([A-Za-z0-9_\-]+\.(m3u8|ts|mp4|aac|mp3))$/gm, (match) => {
                        return `/proxy?url=${encodeURIComponent(baseUrl + '/' + match)}`;
                    });
                
                console.log(`✅ Playlist reescrita enviada`);
                res.set('Content-Type', 'application/vnd.apple.mpegurl');
                res.set('Access-Control-Allow-Origin', '*');
                res.send(rewritten);
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
    console.log(` CyberIPTV Server rodando na porta ${PORT}`);
});
