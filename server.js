const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache simples para não sobrecarregar o servidor
let listaProcessada = { canais: [], filmes: [], series: [] };

function parseM3U(data) {
    const lines = data.split('\n');
    const canais = [];
    const filmes = [];
    const series = [];
    
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            currentItem = {};
            
            // Extrai o nome do canal
            const nameMatch = line.match(/,(.*)$/);
            currentItem.name = nameMatch ? nameMatch[1].trim() : "Canal Sem Nome";
            
            // Extrai a logo
            const logoMatch = line.match(/tvg-logo="(.*?)"/);
            currentItem.logo = logoMatch ? logoMatch[1] : "https://via.placeholder.com/150/0f141c/00f0ff?text=Netivus";
            
            // Extrai o grupo/categoria
            const groupMatch = line.match(/group-title="(.*?)"/);
            currentItem.group = groupMatch ? groupMatch[1].toUpperCase() : "GERAL";
            
        } else if (line.startsWith('http') && currentItem) {
            currentItem.url = line;
            
            // Lógica inteligente de separação
            const g = currentItem.group;
            if (g.includes('FILME') || g.includes('MOVIES') || g.includes('VOD:F')) {
                filmes.push(currentItem);
            } else if (g.includes('SERIE') || g.includes('SERIES') || g.includes('VOD:S')) {
                series.push(currentItem);
            } else {
                canais.push(currentItem);
            }
            currentItem = null;
        }
    }
    return { canais, filmes, series };
}

// Rota para carregar e processar a lista
app.get('/api/carregar', async (req, res) => {
    const m3uUrl = req.query.url;
    if (!m3uUrl) return res.status(400).json({ error: 'URL da lista M3U é obrigatória.' });

    try {
        const response = await axios.get(m3uUrl, { timeout: 15000 });
        listaProcessada = parseM3U(response.data);
        res.json({ success: true, counts: { canais: listaProcessada.canais.length, filmes: listaProcessada.filmes.length, series: listaProcessada.series.length } });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao baixar ou processar a lista.' });
    }
});

// Rotas para pegar os dados filtrados
app.get('/api/conteudo', (req, res) => {
    const tipo = req.query.tipo; // canais, filmes ou series
    res.json(listaProcessada[tipo] || []);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Netivus TV rodando na porta ${PORT}`));