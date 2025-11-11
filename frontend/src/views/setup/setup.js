// frontend/src/js/setup.js
const API_BASE_URL = 'http://localhost:3000'; // Ajuste se seu backend rodar em outra porta

document.addEventListener('DOMContentLoaded', () => {
    const setupForm = document.getElementById('setup-form');
    const errorMessageDiv = document.getElementById('error-message');
    const submitButton = document.getElementById('submit-button');

    setupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorMessageDiv.textContent = '';
        submitButton.disabled = true;
        submitButton.textContent = 'Criando...';

        const formData = new FormData(setupForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch(`${API_BASE_URL}/api/setup/create-dev-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: data.name,
                    email: data.email,
                    password: data.password,
                    defaultPassword: data.defaultPassword // Este campo deve conter "Cal-2025"
                }),
            });

            if (response.ok) {
                alert('Usuário administrador criado com sucesso! Você será redirecionado para a página de login.');
                // Caminho de redirecionamento corrigido para a raiz do projeto
                window.location.href = '/login.html'; 
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Ocorreu um erro desconhecido.');
            }
        } catch (error) {
            errorMessageDiv.textContent = error.message;
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Criar Administrador';
        }
    });
});