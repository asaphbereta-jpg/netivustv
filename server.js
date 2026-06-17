const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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

// Rota Inteligente: Lê os arquivos locais do list1 ao list10 ou baixa links externos
app.get('/api/carregar', async (req, res) => {
    let urlAlvo = req.query.url;
    let novoBanco = { canais: [], filmes: [], series: [] };

    try {
        // SE O USUÁRIO DIGITAR "local" OU DEIXAR EM BRANCO, ATIVA A MULTI-MATRIZ LOCAL
        if (!urlAlvo || urlAlvo.toLowerCase() === 'local') {
            console.log("=> Iniciando varredura da Multi-Matriz Local (list1.txt ate list10.txt)...");
            let arquivosEncontrados = 0;

            // Loop de 1 a 10 para tentar ler cada arquivo txt
            for (let i = 1; i <= 10; i++) {
                const nomeArquivo = `list${i}.txt`;
                const caminhoLocal = path.join(__dirname, nomeArquivo);

                if (fs.existsSync(caminhoLocal)) {
                    console.log(`   -> Lendo e processando: ${nomeArquivo}`);
                    const dadosBrutos = fs.readFileSync(caminhoLocal, 'utf-8');
                    
                    if (dadosBrutos.includes('#EXTM3U') || dadosBrutos.includes('#EXTINF:')) {
                        parseM3U(dadosBrutos, novoBanco);
                        arquivosEncontrados++;
                    }
                }
            }

            if (arquivosEncontrados === 0) {
                return res.status(400).json({ error: 'Nenhum arquivo list1.txt ate list10.txt foi encontrado na raiz.' });
            }
        } 
        // CASO CONTRÁRIO, SE O USUÁRIO PASSAR UMA URL DE FORA, ELE BAIXA DA INTERNET
        else {
            console.log(`> Baixando matriz externa: ${urlAlvo}`);
            const response = await axios.get(urlAlvo, { timeout: 20000 });
            const dadosExternos = response.data;

            if (dadosExternos.includes('#EXTM3U') || dadosExternos.includes('#EXTINF:')) {
                parseM3U(dadosExternos, novoBanco);
            } else {
                // Se for um txt de index externo com links
                const linhas = dadosExternos.split('\n');
                const linksInternos = linhas.map(l => l.trim()).filter(l => l.startsWith('http'));

                for (let subUrl of linksInternos) {
                    try {
                        const subRes = await axios.get(subUrl, { timeout: 10000 });
                        if (subRes.data.includes('#EXTM3U') || subRes.data.includes('#EXTINF:')) {
                            parseM3U(subRes.data, novoBanco);
                        }
                    } catch (e) {
                        console.error(`   [AVISO] Falha ao ler sub-link: ${subUrl}`);
                    }
                }
            }
        }

        // Alimenta a memória global com os dados unidos
        listaProcessada = novoBanco;

        console.log(`=> Matriz Sincronizada! Total Unificado -> Canais: ${listaProcessada.canais.length} | Filmes: ${listaProcessada.filmes.length} | Séries: ${listaProcessada.series.length}`);

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

// Rota para o Front-end consumir os dados filtrados
app.get('/api/conteudo', (req, res) => {
    const tipo = req.query.tipo;
    res.json(listaProcessada[tipo] || []);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 NETIVUS TV MULTI-MATRIX (1-10) online na porta ${PORT}`));
