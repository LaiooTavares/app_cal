// FILE: src/js/users.js
document.addEventListener('DOMContentLoaded', () => {
    // A função deste script é apenas ATIVAR o painel correto com base na função do usuário.
    // A lógica de cada painel está em seu próprio arquivo (ex: administrator/collaborators.js).

    const userRole = sessionStorage.getItem('loggedInUserRole');
    const usersView = document.getElementById('users-view');
    
    // Se a view de usuários não existe na página, não faz nada.
    if (!usersView) {
        return;
    }

    // A função do script de navegação (script.js) é mostrar a 'users-view'.
    // Mas, como uma garantia, se ela estiver visível, este script direciona para o painel certo.
    // Esta verificação pode ser útil se o usuário recarregar a página enquanto estiver nesta view.

    if (userRole === 'developer') {
        const developerPanel = document.getElementById('developer-panel');
        if (developerPanel) {
            developerPanel.classList.remove('hidden');
            // A lógica específica do painel do dev seria inicializada por seu próprio script.
        }
    } else if (userRole === 'administrator') {
        const administratorPanel = document.getElementById('administrator-panel');
        if (administratorPanel) {
            administratorPanel.classList.remove('hidden');
            // A lógica do painel do admin é controlada por 'administrator/collaborators.js'
        }
    }
});