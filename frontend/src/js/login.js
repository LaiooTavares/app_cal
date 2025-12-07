// frontend/src/js/login.js

// Tenta pegar a URL do Vite, se não existir, usa vazio (o proxy do vite.config resolve)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const submitButton = document.getElementById('submit-button');

    if (!loginForm) {
        console.error('ERRO: Formulário de login não encontrado no HTML.');
        return;
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log('Botão "Entrar" clicado! Iniciando autenticação...');

        // Limpa erros anteriores
        if (errorMessage) {
            errorMessage.textContent = '';
            errorMessage.classList.add('hidden');
        }

        // Bloqueia o botão para evitar duplos cliques
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Entrando...';
        }

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao fazer login.');
            }

            // Sucesso! Salva o token
            console.log('Login realizado com sucesso!');
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redireciona para a home (Dashboard)
            window.location.href = '/';

        } catch (error) {
            console.error('Erro de Login:', error);
            if (errorMessage) {
                errorMessage.textContent = error.message;
                errorMessage.classList.remove('hidden');
            }
        } finally {
            // Libera o botão novamente
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Entrar';
            }
        }
    });
});