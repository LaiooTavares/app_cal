// frontend/src/js/setup.js

// 1. Pega a URL da API das variáveis de ambiente .env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    console.error('ERRO CRÍTICO: VITE_API_BASE_URL não está definida.');
    document.body.innerHTML = "<h1>Erro de Configuração</h1><p>A URL da API não foi definida.</p>";
}

// 2. Adiciona o listener quando o HTML estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    const setupForm = document.getElementById('setup-form');
    const errorMessage = document.getElementById('error-message');
    const submitButton = document.getElementById('submit-button');

    if (!setupForm) {
        console.error('Formulário de setup (id="setup-form") não encontrado.');
        return;
    }

    setupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        if (submitButton) submitButton.disabled = true;
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';

        // 3. Pega os valores do formulário
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const defaultPassword = document.getElementById('defaultPassword').value;

        try {
            // 4. Envia os dados para a API de setup do backend
            // MODIFICADO: A URL agora é '/api/setup/create-dev-user' para bater com a sua rota do backend
            const response = await fetch(`${API_BASE_URL}/api/setup/create-dev-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    defaultPassword // A senha de autorização
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Se a API retornar um erro (ex: senha padrão errada)
                throw new Error(data.message || 'Ocorreu um erro desconhecido.');
            }

            // 5. Se foi um sucesso, redireciona para o login
            alert('Administrador criado com sucesso! Você será redirecionado para a página de login.');
            window.location.href = '/login.html';

        } catch (error) {
            console.error('Erro ao criar administrador:', error);
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
            if (submitButton) submitButton.disabled = false;
        }
    });
});