// Referência: src/js/users/administrator.js

document.addEventListener('DOMContentLoaded', () => {
    const userRole = sessionStorage.getItem('loggedInUserRole');
    const panel = document.getElementById('administrator-panel');

    // Se o usuário logado for 'administrator' e o painel existir, ele será exibido.
    if (userRole === 'administrator' && panel) {
        panel.classList.remove('hidden');
        console.log("Módulo de Administrador carregado.");
        // A lógica específica para gerenciar colaboradores é carregada pelo 'collaborators.js'
    }
});