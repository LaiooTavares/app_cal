// frontend/src/views/integrations/webhook.js
import { showSuccess, showError } from '@/js/utils/toaster.js';

// ALTERADO: A função init agora recebe as 'settings' pré-carregadas.
export async function init(container, api, settings) {
    const webhookForm = container.querySelector('#webhook-form');
    const webhookUrlInput = container.querySelector('#webhook-url');
    const webhookEnabledCheckbox = container.querySelector('#webhook-enabled');

    // REMOVIDO: A função 'fetchWebhookSettings' foi removida.

    // ADICIONADO: Preenchemos o formulário com os dados recebidos.
    webhookUrlInput.value = settings.webhook?.url || '';
    webhookEnabledCheckbox.checked = settings.webhook?.enabled || false;

    webhookForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            // A chamada para salvar continua aqui, pois é uma ação do formulário.
            await api.request('/user/webhook-settings', {
                method: 'POST',
                body: JSON.stringify({
                    webhook_url: webhookUrlInput.value,
                    webhook_enabled: webhookEnabledCheckbox.checked
                })
            });
            showSuccess('Configurações de Webhook salvas com sucesso!');
        } catch (error) {
            showError("Ocorreu um erro ao salvar as configurações.");
        }
    });
}