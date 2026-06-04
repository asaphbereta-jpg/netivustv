const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Rota Proxy Anti-CORS e Anti-Mixed Content
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL ausente');

    try {
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(targetUrl).origin 
            }
        });

        const contentType = response.headers['content-type'] || '';

        // Se for uma playlist M3U8, reescrevemos as URLs internas para passarem pelo nosso proxy
        if (contentType.includes('mpegurl') || targetUrl.endsWith('.m3u8')) {
            let body = '';
            response.data.on('data', chunk => body += chunk);
            response.data.on('end', () => {
                const baseUrl = new URL(targetUrl).origin;
                const rewritten = body.replace(/^(https?:\/\/.*)$/gm, (match) => {
                    return `/proxy?url=${encodeURIComponent(match)}`;
                }).replace(/^([A-Za-z0-9_\-]+\.[a-z]+.*)$/gm, (match) => {
                    // Fallback para URLs relativas
                    return `/proxy?url=${encodeURIComponent(baseUrl + '/' + match)}`;
                });
                
                res.set('Content-Type', 'application/vnd.apple.mpegurl');
                res.set('Access-Control-Allow-Origin', '*');
                res.send(rewritten);
            });
        } else {
            // Se for vídeo (TS, MP4), apenas repassa o stream
            res.set('Content-Type', contentType);
            res.set('Access-Control-Allow-Origin', '*');
            response.data.pipe(res);
        }
    } catch (error) {
        res.status(500).send('Erro no Proxy');
    }
});

app.listen(PORT, () => console.log(` CyberIPTV Server rodando na porta ${PORT}`));