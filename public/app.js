const API_URL = window.location.origin;
let currentFocusArea = 'login'; // login, sidebar, search, grid, player
let currentType = 'canais';
let bancoDeDadosLocal = []; // Salva a categoria atual inteira para pesquisa instantânea
let playerMpegTs = null;

// Elementos da Interface
const loginScreen = document.getElementById('login-screen');
const loaderScreen = document.getElementById('loader-screen');
const mainScreen = document.getElementById('main-screen');
const playerScreen = document.getElementById('player-screen');
const gridConteudo = document.getElementById('grid-conteudo');
const videoPlayer = document.getElementById('video-player');
const searchInput = document.getElementById('search-input');
const m3uInput = document.getElementById('m3u-input');

// Inicializa o Aplicativo
document.addEventListener('DOMContentLoaded', () => {
    renderizarListasSalvas();
    m3uInput.focus();
});

// 1. GERENCIAMENTO DE HISTÓRICO DE LISTAS
function salvarListaNoHistorico(url) {
    let listas = JSON.parse(localStorage.getItem('netivus_listas')) || [];
    if (!listas.includes(url)) {
        listas.push(url);
        localStorage.setItem('netivus_listas', JSON.stringify(listas));
        renderizarListasSalvas();
    }
}

function renderizarListasSalvas() {
    const container = document.getElementById('saved-lists');
    let listas = JSON.parse(localStorage.getItem('netivus_listas')) || [];
    container.innerHTML = '';

    if (listas.length === 0) {
        container.innerHTML = '<p style="color: #4a5568; font-size: 0.8rem;">NENHUM TERMINAL SALVO.</p>';
        return;
    }

    listas.forEach((url, index) => {
        const btn = document.createElement('button');
        btn.classList.add('list-item-btn');
        btn.setAttribute('tabindex', '0');
        btn.innerText = `[M3U #${index + 1}] ${url}`;
        btn.addEventListener('click', () => conectarListaIPTV(url));
        container.appendChild(btn);
    });
}

// 2. CONEXÃO COM O SERVIDOR (RENDER) E ACIONAMENTO DO LOADER
document.getElementById('btn-connect').addEventListener('click', () => {
    const url = m3uInput.value;
    if (!url) return alert('Insira uma URL válida!');
    conectarListaIPTV(url);
});

async function conectarListaIPTV(url) {
    // Muda para a tela de Loader imediatamente
    loginScreen.classList.remove('active');
    loaderScreen.classList.add('active');
    currentFocusArea = 'loader';

    try {
        const res = await fetch(`${API_URL}/api/carregar?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error("Erro no processamento do servidor");

        const data = await res.json();

        if (data.success) {
            salvarListaNoHistorico(url);
            
            // Entra na Interface Principal
            loaderScreen.classList.remove('active');
            mainScreen.classList.add('active');
            currentFocusArea = 'sidebar';
            document.querySelector('.menu-item').focus();
            
            carregarConteudo('canais');
        } else {
            alert('Falha ao processar arquivo M3U.');
            voltarParaLogin();
        }
    } catch (err) {
        alert('ERRO CRÍTICO DE SINCRONIZAÇÃO DA MATRIZ.');
        voltarParaLogin();
    }
}

function voltarParaLogin() {
    loaderScreen.classList.remove('active');
    mainScreen.classList.remove('active');
    loginScreen.classList.add('active');
    currentFocusArea = 'login';
    m3uInput.focus();
}

document.getElementById('btn-disconnect').addEventListener('click', () => {
    voltarParaLogin();
});

// 3. CARREGAR E RENDERIZAR CONTEÚDOS
async function carregarConteudo(tipo) {
    gridConteudo.innerHTML = '<p style="color: var(--cyber-cyan)">> EXPANDINDO DADOS DA CATEGORIA...</p>';
    currentType = tipo;
    searchInput.value = ''; // Limpa a pesquisa ao mudar de aba

    try {
        const res = await fetch(`${API_URL}/api/conteudo?tipo=${tipo}`);
        bancoDeDadosLocal = await res.json();
        
        renderizarGrid(bancoDeDadosLocal);
    } catch (e) {
        gridConteudo.innerHTML = '<p style="color: var(--cyber-magenta)">> ERRO NA EXTRAÇÃO DOS CANAIS.</p>';
    }
}

function renderizarGrid(listaItens) {
    gridConteudo.innerHTML = '';
    
    if (listaItens.length === 0) {
        gridConteudo.innerHTML = '<p style="color: #4a5568">> NENHUM REGISTRO RETORNADO.</p>';
        return;
    }

    // Carrega até 400 itens para não pesar o processamento da TV Box
    const limitados = listaItens.slice(0, 400);

    limitados.forEach((item) => {
        const card = document.createElement('div');
        card.classList.add('media-card');
        card.setAttribute('tabindex', '0');
        card.innerHTML = `
            <img src="${item.logo}" onerror="this.src='https://via.placeholder.com/150/050609/00f0ff?text=NETIVUS'">
            <p>${item.name}</p>
        `;
        card.addEventListener('click', () => abrirPlayer(item.url));
        gridConteudo.appendChild(card);
    });
}

// 4. SISTEMA DE FILTRO DA BARRA DE PESQUISA
searchInput.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    if (!termo) {
        renderizarGrid(bancoDeDadosLocal);
        return;
    }
    const filtrados = bancoDeDadosLocal.filter(item => item.name.toLowerCase().includes(termo));
    renderizarGrid(filtrados);
});

// 5. PLAYER REVOLUCIONÁRIO: SUPORTE COMPLETO A CANAIS .TS E .M3U8
function abrirPlayer(streamUrl) {
    mainScreen.classList.remove('active');
    playerScreen.classList.add('active');
    currentFocusArea = 'player';

    // Se for um link de canal .ts ou contiver /ts/
    if (streamUrl.includes('.ts') || streamUrl.includes('type=ts') || streamUrl.includes(':ts')) {
        if (mpegts.getFeatureList().supportedTypes.live) {
            playerMpegTs = mpegts.createPlayer({
                type: 'mse',
                isLive: true,
                url: streamUrl
            });
            playerMpegTs.attachMediaElement(videoPlayer);
            playerMpegTs.load();
            playerMpegTs.play();
        }
    } 
    // Se for lista padrão .m3u8 (HLS)
    else if (Hls.isSupported()) {
        playerMpegTs = new Hls();
        playerMpegTs.loadSource(streamUrl);
        playerMpegTs.attachMedia(videoPlayer);
        playerMpegTs.on(Hls.Events.MANIFEST_PARSED, () => videoPlayer.play());
    } 
    // Suporte nativo fallback (Ex: Apple / Androids específicos)
    else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = streamUrl;
        videoPlayer.play();
    }
}

function fecharPlayer() {
    if (playerMpegTs) {
        if (typeof playerMpegTs.destroy === 'function') playerMpegTs.destroy(); // Se for mpegts
        else if (typeof playerMpegTs.detachMedia === 'function') playerMpegTs.detachMedia(); // Se for Hls
        playerMpegTs = null;
    }
    videoPlayer.pause();
    videoPlayer.src = "";
    
    playerScreen.classList.remove('active');
    mainScreen.classList.add('active');
    currentFocusArea = 'grid';
    
    const primeiroCard = gridConteudo.querySelector('.media-card');
    if (primeiroCard) primeiroCard.focus();
}

// 6. EVENTOS DE TECLADO / CONTROLE REMOTO DA TV BOX
window.addEventListener('keydown', (e) => {
    const active = document.activeElement;

    if (currentFocusArea === 'player') {
        if (e.key === 'Escape' || e.key === 'Backspace') {
            e.preventDefault();
            fecharPlayer();
        }
        return;
    }

    // Atalhos do Grid / Sidebar / Pesquisa
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (currentFocusArea === 'sidebar') {
            const items = Array.from(document.querySelectorAll('.menu-item'));
            let idx = items.indexOf(active);
            if (e.key === 'ArrowDown' && idx < items.length - 1) items[idx+1].focus();
            if (e.key === 'ArrowUp' && idx > 0) items[idx-1].focus();
        }
    }

    if (e.key === 'ArrowRight') {
        if (currentFocusArea === 'sidebar') {
            searchInput.focus();
            currentFocusArea = 'search';
        } else if (currentFocusArea === 'search') {
            const primeiroCard = gridConteudo.querySelector('.media-card');
            if (primeiroCard) {
                currentFocusArea = 'grid';
                primeiroCard.focus();
            }
        }
    }

    if (e.key === 'ArrowLeft') {
        if (currentFocusArea === 'grid') {
            searchInput.focus();
            currentFocusArea = 'search';
        } else if (currentFocusArea === 'search') {
            currentFocusArea = 'sidebar';
            document.querySelector('.menu-item.active').focus();
        }
    }

    if (e.key === 'Enter' && active) {
        active.click();
    }
});
