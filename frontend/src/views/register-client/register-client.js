// src/views/register-client/register-client.js
import { api } from '../../js/script.js';

export async function init(container) {
    const form = container.querySelector('#register-client-form');
    const messageEl = container.querySelector('#form-message');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageEl.textContent = '';
        messageEl.className = 'form-message';

        const name = container.querySelector('#client-name').value;
        const email = container.querySelector('#client-email').value;
        const password = container.querySelector('#client-password').value;

        const userData = {
            name,
            email,
            password,
            role: 'admin' // <-- CORREÇÃO PRINCIPAL AQUI
        };

        try {
            const result = await api.request('/users', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
            messageEl.textContent = `Administrador '${result.name}' cadastrado com sucesso!`;
            messageEl.classList.add('success');
            form.reset();
        } catch (error) {
            messageEl.textContent = error.message;
            messageEl.classList.add('error');
        }
    });
}