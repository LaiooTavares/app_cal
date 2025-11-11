// FILE: frontend/src/js/auth-guard.js

(() => {
    // Agora verificamos a existência do 'authToken' no localStorage
    const token = localStorage.getItem('authToken');

    // Se não houver um token E a página atual não for a de login,
    // redireciona para a página de login.
    if (!token && !window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
    }
})();