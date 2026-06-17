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
    
    try {
        const res = await fetch(`${API_URL}/api/carregar?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.success) {
            loginScreen.classList.remove('active');
            mainScreen.classList.add('active');
            currentFocusArea = 'sidebar';
            document.querySelector('.menu-item').focus();
            carregarConteudo('canais');
        } else {
            alert('Erro ao processar lista.');
        }
    } catch (err) {
        alert('Erro de conexão com o servidor back-end.');
    } finally {
        document.getElementById('btn-connect').innerText = "CONECTAR SISTEMA";
    }
});

// 2. BUSCAR CONTEÚDO DO BACK-END
async function carregarConteudo(tipo) {
    gridConteudo.innerHTML = '<p style="color: var(--cyber-cyan)">> ACESSANDO BANCO DE DADOS...</p>';
    currentType = tipo;
    
    try {
        const res = await fetch(`${API_URL}/api/conteudo?tipo=${tipo}`);
        const itens = await res.json();
        
        gridConteudo.innerHTML = '';
        if (itens.length === 0) {
            gridConteudo.innerHTML = '<p>> NENHUM REGISTRO ENCONTRADO NESSA CATEGORIA.</p>';
            return;
        }

        itens.forEach((item, index) => {
            const card = document.createElement('div');
            card.classList.add('media-card');
            card.setAttribute('tabindex', '0');
            card.setAttribute('data-url', item.url);
            card.innerHTML = `
                <img src="${item.logo}" onerror="this.src='https://via.placeholder.com/150/0f141c/00f0ff?text=NETIVUS'">
                <p>${item.name}</p>
            `;
            
            // Ao clicar/pressionar OK, abre o player
            card.addEventListener('click', () => abrirPlayer(item.url));
            gridConteudo.appendChild(card);
        });
    } catch (e) {
        gridConteudo.innerHTML = '<p style="color: var(--cyber-magenta)">> ERRO CRÍTICO DE DOWNLOAD.</p>';
    }
}

// Mudar de categoria na sidebar
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        document.querySelector('.menu-item.active').classList.remove('active');
        e.target.classList.add('active');
        document.getElementById('category-title').innerText = e.target.innerText;
        carregarConteudo(e.target.getAttribute('data-type'));
    });
});

// 3. PLAYER DE VÍDEO HLS
function abrirPlayer(streamUrl) {
    mainScreen.classList.remove('active');
    playerScreen.classList.add('active');
    currentFocusArea = 'player';
    
    if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, () => videoPlayer.play());
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = streamUrl;
        videoPlayer.addEventListener('loadedmetadata', () => videoPlayer.play());
    }
}

function fecharPlayer() {
    videoPlayer.pause();
    videoPlayer.src = "";
    playerScreen.classList.remove('active');
    mainScreen.classList.add('active');
    currentFocusArea = 'grid';
    const primeiroCard = gridConteudo.querySelector('.media-card');
    if (primeiroCard) primeiroCard.focus();
}

// 4. CONTROLE REMOTO POR TECLADO (D-PAD DA TV BOX)
window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    
    if (currentFocusArea === 'player') {
        // Botão voltar ou ESC fecha o player
        if (e.key === 'Escape' || e.key === 'Backspace') {
            e.preventDefault();
            fecharPlayer();
        }
        return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (currentFocusArea === 'sidebar') {
            const items = Array.from(document.querySelectorAll('.menu-item'));
            let idx = items.indexOf(active);
            if (e.key === 'ArrowDown' && idx < items.length - 1) items[idx+1].focus();
            if (e.key === 'ArrowUp' && idx > 0) items[idx-1].focus();
        }
    }
    
    if (e.key === 'ArrowRight' && currentFocusArea === 'sidebar') {
        // Vai da Sidebar para o Grid de canais
        const primeiroCard = gridConteudo.querySelector('.media-card');
        if (primeiroCard) {
            currentFocusArea = 'grid';
            primeiroCard.focus();
        }
    }
    
    if (e.key === 'ArrowLeft' && currentFocusArea === 'grid') {
        // Volta do Grid para a Sidebar
        currentFocusArea = 'sidebar';
        document.querySelector('.menu-item.active').focus();
    }
    
    // Simula clique com a tecla Enter/OK da TV Box
    if (e.key === 'Enter' && active) {
        active.click();
    }
});