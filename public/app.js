const API_URL = window.location.origin;
let currentFocusArea = 'login'; // login, sidebar, grid, player
let currentType = 'canais';

// Elementos da Interface
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const playerScreen = document.getElementById('player-screen');
const gridConteudo = document.getElementById('grid-conteudo');
const videoPlayer = document.getElementById('video-player');

// 1. AÇÃO DE CONECTAR LISTA
document.getElementById('btn-connect').addEventListener('click', async () => {
    const url = document.getElementById('m3u-input').value;
    if (!url) return alert('Insira uma URL!');
    
    document.getElementById('btn-connect').innerText = "PROCESSANDO MATRIZ...";
    document.getElementById('btn-connect').disabled = true;
    
    try {
        // Envia para o back-end baixar e processar
        const res = await fetch(`${API_URL}/api/carregar?url=${encodeURIComponent(url)}`);
        
        if (!res.ok) {
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }
        
        const data = await res.json();
        
        if (data.success) {
            // SÓ ENTRA AQUI SE O BACK-END JÁ TERMINOU DE PROCESSAR TUDO!
            console.log("Lista carregada com sucesso:", data.counts);
            loginScreen.classList.remove('active');
            mainScreen.classList.add('active');
            currentFocusArea = 'sidebar';
            
            // Aguarda um leve delay para renderizar a interface antes de puxar os canais
            setTimeout(() => {
                document.querySelector('.menu-item').focus();
                carregarConteudo('canais');
            }, 300);
            
        } else {
            alert('O servidor não conseguiu processar esta lista M3U.');
            resetBotaoLogin();
        }
    } catch (err) {
        console.error(err);
        alert('ERRO CRÍTICO: O servidor demorou muito para responder ou o link M3U é inválido/bloqueado.');
        resetBotaoLogin();
    }
});

function resetBotaoLogin() {
    const btn = document.getElementById('btn-connect');
    btn.innerText = "CONECTAR SISTEMA";
    btn.disabled = false;
}

// 2. BUSCAR CONTEÚDO DO BACK-END
async function carregarConteudo(tipo) {
    gridConteudo.innerHTML = '<p style="color: var(--cyber-cyan)">> ACESSANDO BANCO DE DADOS...</p>';
    currentType = tipo;
    
    try {
        const res = await fetch(`${API_URL}/api/conteudo?tipo=${tipo}`);
        if (!res.ok) throw new Error("Erro ao buscar dados organizados");
        
        const itens = await res.json();
        
        gridConteudo.innerHTML = '';
        if (itens.length === 0) {
            gridConteudo.innerHTML = '<p style="color: #4a5568">> NENHUM REGISTRO ENCONTRADO NESSA CATEGORIA.</p>';
            return;
        }

        // Limita a renderização inicial em 300 itens para a TV Box não travar o navegador
        const limiteItens = itens.slice(0, 300);

        limiteItens.forEach((item) => {
            const card = document.createElement('div');
            card.classList.add('media-card');
            card.setAttribute('tabindex', '0');
            card.setAttribute('data-url', item.url);
            card.innerHTML = `
                <img src="${item.logo}" onerror="this.src='https://via.placeholder.com/150/0f141c/00f0ff?text=NETIVUS'">
                <p>${item.name}</p>
            `;
            
            card.addEventListener('click', () => abrirPlayer(item.url));
            gridConteudo.appendChild(card);
        });
        
        if (itens.length > 300) {
            console.log(`Lista muito grande. Mostrando 300 de ${itens.length} para preservar a memória da TV Box.`);
        }
    } catch (e) {
        gridConteudo.innerHTML = '<p style="color: var(--cyber-magenta)">> ERRO CRÍTICO NA LEITURA DA MEMÓRIA.</p>';
    }
}
