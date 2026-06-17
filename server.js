const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache do Banco de Dados Temporário em Memória
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
            // Classificação inteligente automática
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

// Rota acionada pelo botão "CONECTAR LISTA"
app.get('/api/carregar', (req, res) => {
    let urlAlvo = req.query.url;
    let novoBanco = { canais: [], filmes: [], series: [] };

    try {
        if (!urlAlvo || urlAlvo.toLowerCase() === 'local') {
            console.log("=> Processando Multi-Matriz Local de list1.txt ate list10.txt...");
            let arquivosEncontrados = 0;

            for (let i = 1; i <= 10; i++) {
                const nomeArquivo = `list${i}.txt`;
                const caminhoLocal = path.join(__dirname, nomeArquivo);

                if (fs.existsSync(caminhoLocal)) {
                    const dadosBrutos = fs.readFileSync(caminhoLocal, 'utf-8');
                    parseM3U(dadosBrutos, novoBanco);
                    arquivosEncontrados++;
                }
            }

            if (arquivosEncontrados === 0) {
                return res.status(400).json({ error: 'Nenhum arquivo local localizado na raiz.' });
            }
        }

        listaProcessada = novoBanco;
        res.json({ success: true, counts: { canais: listaProcessada.canais.length } });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota para puxar dados das categorias
app.get('/api/conteudo', (req, res) => {
    const tipo = req.query.tipo || 'canais';
    res.json(listaProcessada[tipo] || []);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 NETIVUS API ATIVA NA PORTA ${PORT}`));
