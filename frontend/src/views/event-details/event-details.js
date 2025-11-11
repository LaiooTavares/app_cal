// FILE: frontend/src/views/event-details/event-details.js
import { api } from '../../js/script.js';
import { showError, showSuccess } from '../../js/utils/toaster.js';

export async function init(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const eventId = params.get('id');

    const contentEl = container.querySelector('#event-details-content');
    const statusBadgeEl = container.querySelector('#event-status-badge');
    const backBtn = container.querySelector('#back-to-previous-btn');
    const deleteBtn = container.querySelector('#delete-event-btn');
    const editBtn = container.querySelector('#edit-event-btn');
    
    editBtn.addEventListener('click', () => {
        // Navega para a página de eventos para abrir o modal de edição
        window.location.hash = `events?action=edit&id=${eventId}`;
    });
    
    backBtn.addEventListener('click', () => {
        history.back();
    });

    if (!eventId) {
        contentEl.innerHTML = `<p style="color: red;">ID do evento não fornecido.</p>`;
        return;
    }

    try {
        const event = await api.request(`/events/${eventId}`);
        
        const statusText = (event.status || 'a-fazer').replace('-', ' ');
        statusBadgeEl.textContent = statusText;
        statusBadgeEl.dataset.status = event.status || 'a-fazer';

        const startTime = new Date(event.start_time);
        const endTime = new Date(event.end_time);
        const timeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

        contentEl.innerHTML = `
            <div class="details-grid">
                <div class="detail-item">
                    <span class="label">Cliente</span>
                    <span class="value"><i class="fas fa-user"></i> ${event.client_name}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Profissional</span>
                    <span class="value"><i class="fas fa-user-md"></i> ${event.professional_name || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Data</span>
                    <span class="value"><i class="fas fa-calendar-alt"></i> ${startTime.toLocaleDateString('pt-BR')}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Horário</span>
                    <span class="value"><i class="fas fa-clock"></i> ${startTime.toLocaleTimeString('pt-BR', timeFormatOptions)} - ${endTime.toLocaleTimeString('pt-BR', timeFormatOptions)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">CPF</span>
                    <span class="value">${event.client_cpf || 'Não informado'}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Telefone</span>
                    <span class="value">${event.client_telefone || 'Não informado'}</span>
                </div>
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <span class="label">Observações</span>
                    <span class="value notes">${event.notes || 'Nenhuma observação.'}</span>
                </div>
            </div>
        `;

        deleteBtn.addEventListener('click', async () => {
            if (confirm('Tem a certeza que deseja excluir este evento?')) {
                try {
                    await api.request(`/events/${eventId}`, { method: 'DELETE' });
                    showSuccess('Evento excluído com sucesso!');
                    window.location.hash = 'events';
                } catch (error) {
                    showError('Não foi possível excluir o evento.');
                }
            }
        });

    } catch (error) {
        showError('Não foi possível carregar os detalhes do evento.');
        contentEl.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}