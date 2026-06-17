const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache do Banco de Dados Temporário
let listaProcessada = { canais: [], filmes: [], series: [] };

// Interpretador Universal de listas de IPTV
function parseM3U(data, banco) {
    const lines = data.split('\n');
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            currentItem = {};
            
            // Pega o nome após a última vírgula
            const nameMatch = line.match(/,(.*)$/);
            currentItem.name = nameMatch ? nameMatch[1].trim() : "Sem Nome";
            
            // Captura a logo
            const logoMatch = line.match(/tvg-logo="(.*?)"/);
            currentItem.logo = logoMatch ? logoMatch[1] : "https://via.placeholder.com/150/050609/00f0ff?text=NETIVUS";
            
            // Captura a categoria do grupo
            const groupMatch = line.match(/group-title="(.*?)"/);
            currentItem.group = groupMatch ? groupMatch[1].toUpperCase() : "GERAL";
            
        } else if (line.startsWith('http') && currentItem) {
            currentItem.url = line;
            
            const g = currentItem.group;
            // Filtra de forma inteligente se é Canal, Filme ou Série
            if (g.includes('FILME') || g.includes('MOVIES') || g.includes('VOD:F') || g.includes('CINEMA') || g.includes('VOD')) {
                banco.filmes.push(currentItem);
            } else if (g.includes('SERIE') || g.includes('SERIES') || g.includes('VOD:S')) {
                banco.series.push(currentItem);
            } else {
                banco.canais.push(currentItem);
            }
            currentItem = null;
        }
    }
}

// Rota Inteligente que detecta o conteúdo automaticamente
app.get('/api/carregar', async (req, res) => {
    const urlAlvo = req.query.url;
    if (!urlAlvo) return res.status(400).json({ error: 'A URL do arquivo é obrigatória.' });

    let novoBanco = { canais: [], filmes: [], series: [] };

    try {
        console.log(`> Baixando matriz de dados: ${urlAlvo}`);
        const response = await axios.get(urlAlvo, { timeout: 20000 });
        const dadosBrutos = response.data;

        // VERIFICAÇÃO INTELIGENTE: O conteúdo tem marcações de IPTV?
        if (dadosBrutos.includes('#EXTM3U') || dadosBrutos.includes('#EXTINF:')) {
            console.log("=> Sucesso: Conteúdo IPTV/M3U válido detectado (mesmo em arquivo .txt)!");
            parseM3U(dadosBrutos, novoBanco);
        } 
        // CASO SEJA UM TXT INDEX (Contendo apenas links HTTP para outras listas)
        else {
            console.log("=> Detectado arquivo index de texto. Buscando links internos...");
            const linhas = dadosBrutos.split('\n');
            const linksInternos = linhas.map(l => l.trim()).filter(l => l.startsWith('http'));

            for (let subUrl of linksInternos) {
                try {
                    console.log(`   -> Baixando sub-lista: ${subUrl}`);
                    const subRes = await axios.get(subUrl, { timeout: 10000 });
                    if (subRes.data.includes('#EXTM3U') || subRes.data.includes('#EXTINF:')) {
                        parseM3U(subRes.data, novoBanco);
                    }
                } catch (e) {
                    console.error(`   [AVISO] Falha ao ler sub-link: ${subUrl}`);
                }
            }
        }

        // Atualiza a memória global
        listaProcessada = novoBanco;

        console.log(`=> Matriz Sincronizada! Canais: ${listaProcessada.canais.length} | Filmes: ${listaProcessada.filmes.length} | Séries: ${listaProcessada.series.length}`);

        res.json({ 
            success: true, 
            counts: { 
                canais: listaProcessada.canais.length, 
                filmes: listaProcessada.filmes.length, 
                series: listaProcessada.series.length 
            } 
        });

    } catch (error) {
        console.error("Erro crítico ao processar o arquivo:", error.message);
        res.status(500).json({ error: 'Erro ao processar as listas do servidor.' });
    }
});

app.get('/api/conteudo', (req, res) => {
    const tipo = req.query.tipo;
    res.json(listaProcessada[tipo] || []);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 NETIVUS TV MULTI-PARSER online na porta ${PORT}`));
