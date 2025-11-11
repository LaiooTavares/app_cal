// frontend/src/views/integrations/api.js
import { showSuccess, showError } from '@/js/utils/toaster.js';
import { showConfirmation } from '@/js/utils/modal.js';

// ALTERADO: A função init agora recebe as 'settings' pré-carregadas.
export async function init(container, api, settings) {
    const apiKeyMaskedInput = container.querySelector('#api-key-masked-input');
    const regenerateBtn = container.querySelector('#regenerate-api-key-btn');
    const newApiKeyContainer = container.querySelector('#new-api-key-container');
    const currentApiKeyContainer = container.querySelector('#current-api-key-container');
    const confirmNewKeyBtn = container.querySelector('#confirm-new-key-btn');

    // ADICIONADO: Função para renderizar o estado da chave de API com base nos dados recebidos.
    const renderApiKey = (apiKeyLast4) => {
        if (apiKeyLast4) {
            apiKeyMaskedInput.value = `prod_sk_........................${apiKeyLast4}`;
        } else {
            apiKeyMaskedInput.value = "Nenhuma chave de API gerada.";
        }
    };

    // REMOVIDO: A função 'fetchApiKey' foi removida, pois os dados agora vêm por parâmetro.

    regenerateBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmation(
            'Gerar Nova Chave?',
            'A sua chave de API antiga será invalidada permanentemente. Tem a certeza que deseja continuar?'
        );

        if (!confirmed) {
            return;
        }

        try {
            // A chamada para regenerar a chave continua aqui, pois é uma ação específica.
            const data = await api.request('/user/regenerate-api-key', { method: 'POST' });
            const newKey = data.newApiKey;

            currentApiKeyContainer.classList.add('hidden');
            const newKeyDisplay = container.querySelector('#new-api-key-display');
            newKeyDisplay.value = newKey;
            newApiKeyContainer.classList.remove('hidden');

            container.querySelector('#copy-new-key-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(newKey).then(() => {
                    showSuccess('Chave copiada para a área de transferência!');
                });
            });
        } catch (error) {
            showError("Ocorreu um erro ao gerar a nova chave.");
        }
    });

    confirmNewKeyBtn.addEventListener('click', async () => {
        newApiKeyContainer.classList.add('hidden');
        currentApiKeyContainer.classList.remove('hidden');
        // Após confirmar, buscamos os dados mais recentes para obter os "últimos 4 dígitos".
        try {
            const updatedSettings = await api.request('/user/settings');
            renderApiKey(updatedSettings.apiKeyLast4);
        } catch (error) {
            showError('Erro ao recarregar a chave de API.');
        }
    });

    // CHAMADA INICIAL: Renderiza a chave de API com os dados que vieram do 'integrations.js'.
    renderApiKey(settings.apiKeyLast4);
}