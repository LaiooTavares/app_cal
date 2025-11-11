// frontend/src/views/integrations/google-calendar.js
import { showSuccess, showError } from '@/js/utils/toaster.js';
import { showConfirmation } from '@/js/utils/modal.js';

// A função init agora recebe as 'settings' pré-carregadas.
export async function init(container, api, settings) {
    const statusContainer = container.querySelector('#google-auth-status');

    const connect = async () => {
        try {
            const { authUrl } = await api.request('/integrations/google/auth');
            window.location.href = authUrl;
        } catch (error) {
            showError("Não foi possível iniciar a conexão com o Google.");
        }
    };

    const disconnect = async () => {
        const confirmed = await showConfirmation(
            'Desconectar Google Calendar?',
            'Tem a certeza que deseja desconectar a sua conta do Google Calendar?'
        );
        if (!confirmed) return;

        try {
            await api.request('/integrations/google/disconnect', { method: 'POST' });
            showSuccess("Conta desconectada com sucesso.");
            // Após desconectar, renderiza o estado de "desconectado" imediatamente.
            renderStatus({ connected: false, email: null });
        } catch (error) {
            showError("Não foi possível desconectar a conta.");
        }
    };

    // Função reutilizável para renderizar o status da conexão.
    const renderStatus = (googleSettings) => {
        if (googleSettings.connected) {
            statusContainer.innerHTML = `
                <p>✅ Conectado como <strong>${googleSettings.email}</strong>.</p>
                <button id="google-disconnect-btn" class="btn-secondary btn-3d">Desconectar</button>
            `;
            container.querySelector('#google-disconnect-btn').addEventListener('click', disconnect);
        } else {
            statusContainer.innerHTML = `
                <p>A sua conta não está conectada ao Google Calendar.</p>
                <button id="google-connect-btn" class="btn-submit btn-3d">Conectar com Google Calendar</button>
            `;
            container.querySelector('#google-connect-btn').addEventListener('click', connect);
        }
    };

    // CHAMADA INICIAL: Renderiza o status com os dados que vieram do 'integrations.js'.
    renderStatus(settings.google);
}