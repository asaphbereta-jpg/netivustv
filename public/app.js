// Substitua a função dispararStream antiga do seu app.js por esta:
function dispararStream(nome, url) {
    console.log(`Enviando stream para o APK nativo: ${url}`);
    
    // Altera o título da página do WebViewer temporariamente com o link do vídeo
    // O Kodular consegue "escutar" quando o título do site muda e pega a URL!
    document.title = "PLAY_STREAM:" + url;
    
    // Código alternativo caso use JavaScript Interface padrão
    try {
        window.AppInvetor.setWebViewString(url);
    } catch(e) {
        // Ignora se estiver testando direto no navegador do computador
    }
}
