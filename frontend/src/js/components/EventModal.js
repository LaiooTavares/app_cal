// frontend/src/js/components/EventModal.js

// MODIFICADO: Imports agora usam caminhos relativos (../)
// (Sobe um nível de 'components/' para a pasta 'js/')
import { api } from '../script.js'; 
import { showSuccess, showError } from '../utils/toaster.js';

// MODIFICADO: Importa o CSS relativo (da mesma pasta)
import './event-modal.css';

let modalEl = null;
let formEl = null;
let onSaveCallback = null;
let selectedSlot = null;
let allProfessionals = [];

// --- (O resto do ficheiro permanece exatamente como na minha última mensagem) ---

const handleFormSubmit = async (event) => {
    event.preventDefault();
    
    const clientName = formEl.querySelector('#event-client-name').value;
    const clientCpf = formEl.querySelector('#event-client-cpf').value;
    const clientTelefone = formEl.querySelector('#event-client-telefone').value;
    const clientNotes = formEl.querySelector('#event-notes').value;
    const professionalId = formEl.querySelector('#event-professional').value;

    if (!clientName.trim()) {
        showError('Por favor, informe o nome do cliente.');
        return;
    }
    if (!professionalId) {
        showError('Por favor, selecione um profissional.');
        return;
    }
    if (!selectedSlot) {
        showError('Por favor, escolha um horário.');
        return;
    }

    const startTime = new Date(`${selectedSlot.date}T${selectedSlot.time}`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const eventData = {
        client_name: clientName,
        client_cpf: clientCpf,
        client_telefone: clientTelefone,
        notes: clientNotes,
        professional_id: professionalId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
    };

    try {
        await api.request('/events', {
            method: 'POST',
            body: JSON.stringify(eventData)
        });
        showSuccess('Evento agendado com sucesso!');
        close();
        if (typeof onSaveCallback === 'function') {
            onSaveCallback();
        }
    } catch (error) {
        showError('Não foi possível agendar o evento. Tente novamente.');
        console.error('Erro ao salvar evento:', error);
    }
};

export const close = () => {
    if (modalEl) {
        modalEl.classList.remove('is-visible');
    }
};

export const show = async (options = {}) => {
    if (!modalEl) {
        console.error('[EventModal] ERRO CRÍTICO: O elemento do modal (modalEl) é nulo. A função init() não foi chamada ou falhou.');
        try {
            await init(); 
            if (!modalEl) throw new Error("Falha na inicialização do Modal.");
        } catch (error) {
            showError("Erro ao carregar o modal de evento.");
            return;
        }
    }

    onSaveCallback = options.onSave || null;
    formEl.reset();
    selectedSlot = null;

    const pendingDataJSON = sessionStorage.getItem('pendingEventData');
    const selectedSlotJSON = sessionStorage.getItem('selectedSlot');

    if (pendingDataJSON) {
        const pendingData = JSON.parse(pendingDataJSON);
        formEl.querySelector('#event-client-name').value = pendingData.clientName || '';
        formEl.querySelector('#event-client-cpf').value = pendingData.clientCpf || '';
        formEl.querySelector('#event-client-telefone').value = pendingData.clientTelefone || '';
        formEl.querySelector('#event-notes').value = pendingData.notes || '';
    }
    
    if (selectedSlotJSON) {
        selectedSlot = JSON.parse(selectedSlotJSON);
    }

    if (allProfessionals.length === 0) {
        try {
            allProfessionals = await api.request('/professionals');
        } catch {
            showError("Não foi possível carregar a lista de profissionais.");
            return;
        }
    }

    const professionalSelect = formEl.querySelector('#event-professional');
    professionalSelect.innerHTML = '<option value="">-- Selecione --</option>' + allProfessionals.map(prof => 
        `<option value="${prof.id}">${prof.name}</option>`
    ).join('');

    if (pendingDataJSON) {
        const pendingData = JSON.parse(pendingDataJSON);
        if (pendingData.professionalId) {
            professionalSelect.value = pendingData.professionalId;
        }
    }

    const timeDisplay = formEl.querySelector('#selected-time-display');
    timeDisplay.textContent = 'Nenhum horário selecionado';

    if (selectedSlot) {
        const date = new Date(`${selectedSlot.date}T${selectedSlot.time}`);
        const displayFormat = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        timeDisplay.innerHTML = `<strong>${date.toLocaleDateString('pt-BR', displayFormat)}</strong>`;
    }
    else if (options.prefill && options.prefill.date) {
        const date = new Date(options.prefill.date);
        const time = options.prefill.time || `${new Date().getHours().toString().padStart(2, '0')}:00`;
        date.setHours(parseInt(time.split(':')[0]), parseInt(time.split(':')[1]));

        selectedSlot = {
            date: date.toISOString().split('T')[0],
            time: time
        };

        const displayFormat = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        timeDisplay.innerHTML = `<strong>${date.toLocaleDateString('pt-BR', displayFormat)}</strong>`;
    }
    
    const bookingBtn = formEl.querySelector('#open-booking-tool-btn');
    professionalSelect.addEventListener('change', () => {
        bookingBtn.disabled = !professionalSelect.value;
    });
    bookingBtn.disabled = !professionalSelect.value;
    
    bookingBtn.onclick = () => {
        const formData = {
            clientName: formEl.querySelector('#event-client-name').value,
            clientCpf: formEl.querySelector('#event-client-cpf').value,
            clientTelefone: formEl.querySelector('#event-client-telefone').value,
            notes: formEl.querySelector('#event-notes').value,
            professionalId: professionalSelect.value
        };
        sessionStorage.setItem('pendingEventData', JSON.stringify(formData));
        window.location.hash = `booking?professionalId=${formData.professionalId}&returnTo=${window.location.hash.substring(1).split('?')[0]}`;
    };

    modalEl.classList.add('is-visible');

    sessionStorage.removeItem('pendingEventData');
    sessionStorage.removeItem('selectedSlot');
};

export const init = () => {
    if (document.getElementById('global-event-modal')) {
        if (!modalEl) {
            modalEl = document.getElementById('global-event-modal');
            formEl = document.getElementById('global-event-form');
        }
        if (formEl) {
            document.getElementById('global-close-modal-btn').addEventListener('click', close);
            formEl.querySelector('#cancel-event-btn').addEventListener('click', close);
            formEl.addEventListener('submit', handleFormSubmit);
        } else {
            console.error("[EventModal] init: 'global-event-form' não encontrado no DOM existente.");
        }
        return; 
    }
    
    // O CSS é importado no topo do ficheiro
    
    const modalHTML = `
        <div id="global-event-modal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modal-title">Adicionar Novo Evento</h2>
                    <button id="global-close-modal-btn" class="action-btn">&times;</button>
                </div>
                <form id="global-event-form">${getFormHTML()}</form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    modalEl = document.getElementById('global-event-modal');
    formEl = document.getElementById('global-event-form');

    document.getElementById('global-close-modal-btn').addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) {
            close();
        }
    });
    formEl.querySelector('#cancel-event-btn').addEventListener('click', close);
    formEl.addEventListener('submit', handleFormSubmit);
};

function getFormHTML() {
    return `
        <input type="hidden" id="event-id">
        <div class="form-group">
            <label for="event-client-name">Nome do Cliente</label>
            <input type="text" id="event-client-name" required>
        </div>
        <div class="form-row">
            <div class="form-group"><label for="event-client-cpf">CPF</label><input type="text" id="event-client-cpf"></div>
            <div class="form-group"><label for="event-client-telefone">Telefone</label><input type="text" id="event-client-telefone"></div>
        </div>
        <div class="form-group">
            <label for="event-notes">Observações</label>
            <textarea id="event-notes" rows="3" placeholder="Adicione notas ou observações sobre o agendamento..."></textarea>
        </div>
        <hr style="margin: 20px 0; border-color: #eee;">
        <div class="form-group">
            <label for="event-professional">Profissional</label>
            <select id="event-professional" required></select>
        </div>
        <div class="form-group" style="margin-top: 25px;">
            <button type="button" id="open-booking-tool-btn" class="btn-submit" disabled>Escolher/Alterar Horário</button>
        </div>
        <div class="form-group">
            <label>Data e Horário Selecionado</label>
            <div id="selected-time-display" class="time-display-box">Nenhum horário selecionado</div>
        </div>
        <div class="form-actions">
            <button type="button" id="cancel-event-btn" class="btn-secondary">Cancelar</button>
            <button type="submit" class="btn-submit">Salvar Evento</button>
        </div>
    `;
}