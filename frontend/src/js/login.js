// frontend/src/js/login.js
// MODIFICADO: A URL agora é lida dinamicamente do arquivo .env correspondente
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; 

// --- VERIFICAÇÃO DE SETUP INICIAL ---
// Este bloco é executado imediatamente para decidir se a página de login deve ser exibida
// ou se o usuário deve ser redirecionado para a configuração inicial.
(async () => {
    try {
        if (!API_BASE_URL) {
            throw new Error('VITE_API_BASE_URL não está definida. Verifique seus arquivos .env');
        }

        const response = await fetch(`${API_BASE_URL}/api/setup/status`);
        
        // Verifica se a resposta da API foi bem-sucedida
        if (!response.ok) {
            throw new Error('Não foi possível conectar ao servidor para verificar o status da aplicação.');
        }

        const data = await response.json();

        // Se a propriedade 'needsSetup' for verdadeira, redireciona para a página de configuração.
        if (data.needsSetup) {
            console.log('Setup necessário. Redirecionando para a página de configuração...');
            window.location.href = '/setup.html';
        }
        // Se 'needsSetup' for falso, o script simplesmente termina e permite que a página de login seja carregada.

    } catch (error) {
        // Em caso de falha na comunicação com o backend, exibe uma mensagem de erro na tela.
        console.error('ERRO CRÍTICO na verificação de setup:', error);
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: sans-serif;">
                <h1>Erro de Conexão</h1>
                <p>Não foi possível conectar ao servidor. Por favor, verifique se o backend está em execução e tente recarregar a página.</p>
                <p style="color: red; font-family: monospace;">Detalhe: ${error.message}</p>
            </div>
        `;
    }
})();


// --- LÓGICA DO FORMULÁRIO DE LOGIN (SEU CÓDIGO ORIGINAL) ---
// Esta parte do código só será relevante se a verificação de setup acima permitir.
document.addEventListener('DOMContentLoaded', () => {
    // Tenta encontrar o formulário no HTML
    const loginForm = document.getElementById('login-form');
    
    // Testa se o formulário foi encontrado
    if (!loginForm) {
        console.error('ERRO CRÍTICO: O formulário com id="login-form" não foi encontrado no HTML.');
        return; // Interrompe a execução se o formulário não existir
    }

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // [NOVO TESTE] Esta mensagem é a mais importante.
        // Se ela não aparecer no console, o evento de submit não está funcionando.
        console.log('Botão "Entrar" clicado! O evento de submit foi capturado com sucesso.');

        errorMessage.classList.add('hidden');

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            // 1. Faz a chamada para a API do backend
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            console.log('Resposta recebida do backend:', data);

            // 2. Verifica se a resposta do backend indica um erro de HTTP
            if (!response.ok) {
                throw new Error(data.message || 'E-mail ou senha inválidos.');
            }

            // Verificação de robustez para garantir que a resposta tem o formato esperado
            if (!data.token || !data.user || !data.user.name || !data.user.role) {
                throw new Error('Formato de resposta do servidor é inválido ou incompleto.');
            }

            // 3. Se o login foi bem-sucedido, salva os dados no localStorage
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('userName', data.user.name);
            localStorage.setItem('userRole', data.user.role);
            
            // 4. Redireciona para a página principal
            window.location.href = 'index.html';

        } catch (error) {
            console.error('Ocorreu um erro na tentativa de login:', error);
            
            // 5. Exibe a mensagem de erro para o usuário
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
        }
    });
});