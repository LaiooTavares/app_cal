// Referência: src/js/settings.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("Módulo de Configurações carregado.");

    // O seu layout carrega o conteúdo dinamicamente no '#view-container'.
    // Por isso, não podemos adicionar um listener direto, pois o botão
    // ainda não existe quando este script carrega.
    // Usamos "delegação de evento" no container pai.
    
    const viewContainer = document.getElementById('view-container');

    if (viewContainer) {
        viewContainer.addEventListener('click', async (event) => {
            // Verifica se o clique foi no botão de conectar
            // **IMPORTANTE**: Você precisa dar este ID 'connect-google-btn' 
            // ao seu botão "Conectar com Google Calendar" no seu arquivo HTML
            // (provavelmente em src/views/integrations/...)
            
            const connectButton = event.target.closest('#connect-google-btn');
            
            if (connectButton) {
                try {
                    // 1. Chamar o backend para obter a URL de autorização
                    const response = await fetch('/api/integrations/google/connect', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });

                    if (!response.ok) {
                        throw new Error('Falha ao obter URL de autenticação.');
                    }

                    const data = await response.json();

                    // 2. Redirecionar o usuário para a página de login do Google
                    if (data.url) {
                        window.location.href = data.url;
                    }

                } catch (error) {
                    console.error("Erro ao tentar conectar com o Google:", error);
                    // Você pode exibir uma mensagem de erro para o usuário aqui
                }
            }

            // Você pode adicionar a lógica do botão 'disconnect' aqui também, se desejar.
            // Ex: const disconnectButton = event.target.closest('#disconnect-google-btn');
            // if (disconnectButton) { ... lógica de disconnect ... }
        });
    }
});