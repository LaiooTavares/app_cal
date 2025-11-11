// src/views/register-cooperator/register-cooperator.js
import { api } from '../../js/script.js';

export async function init(container) {
    // Seleciona os elementos corretos do formulário
    const form = container.querySelector('#register-cooperator-form');
    const messageEl = container.querySelector('#form-message');
    const nameInput = container.querySelector('#cooperator-name');
    const emailInput = container.querySelector('#cooperator-email');
    const passwordInput = container.querySelector('#cooperator-password');

    if (!form) {
        console.error("O formulário #register-cooperator-form não foi encontrado.");
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageEl.textContent = '';
        messageEl.className = 'form-message'; // Reseta as classes de mensagem

        const userData = {
            name: nameInput.value,
            email: emailInput.value,
            password: passwordInput.value,
            role: 'cooperador' // Define a role correta
        };

        try {
            const result = await api.request('/users', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
            messageEl.textContent = `Cooperador '${result.name}' cadastrado com sucesso!`;
            messageEl.classList.add('success');
            form.reset(); // Limpa o formulário após o sucesso
        } catch (error) {
            // Tenta usar a mensagem da API, ou uma mensagem padrão
            messageEl.textContent = error.message || 'Ocorreu um erro ao cadastrar o cooperador.';
            messageEl.classList.add('error');
        }
    });
}