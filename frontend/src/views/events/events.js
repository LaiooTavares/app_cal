// frontend/src/views/events/events.js
// --- [MODIFICAÇÃO] Importa 'navigateToView' ---
import { api, navigateToView } from '/src/js/script.js';
import { showSuccess, showError } from '/src/js/utils/toaster.js';
import { showConfirmation } from '/src/js/utils/modal.js';

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
import { io } from 'socket.io-client'; // 1. Importar o cliente socket.io
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; // 2. Obter a URL da API
let socket = null; // 3. Variável para guardar a conexão
// --- [FIM DA MODIFICAÇÃO] ---

let allProfessionals = [];
let allEvents = [];
let containerEl = null;
let selectedSlot = null;

const openModal = (eventToEdit = null) => {
    const modal = containerEl.querySelector('#event-modal');
    const form = containerEl.querySelector('#event-form');
    const modalTitle = containerEl.querySelector('#modal-title');
    const saveBtn = containerEl.querySelector('#save-event-btn');
    
    form.reset();
    selectedSlot = null;
    
    const timeDisplay = containerEl.querySelector('#selected-time-display');
    timeDisplay.textContent = 'Nenhum horário selecionado';
    
    const professionalSelect = containerEl.querySelector('#event-professional');
    professionalSelect.innerHTML = '<option value="">-- Selecione --</option>' + allProfessionals.map(prof => 
        `<option value="${prof.id}">${prof.name}</option>`
    ).join('');
    
    if (eventToEdit) {
        modalTitle.textContent = 'Editar Evento';
        saveBtn.textContent = 'Salvar Alterações';

        form.querySelector('#event-id').value = eventToEdit.id;
        form.querySelector('#event-client-name').value = eventToEdit.client_name;
        form.querySelector('#event-client-cpf').value = eventToEdit.client_cpf || '';
        form.querySelector('#event-client-telefone').value = eventToEdit.client_telefone || '';
        form.querySelector('#event-notes').value = eventToEdit.notes || '';
        professionalSelect.value = eventToEdit.professional_id;

        const startTime = new Date(eventToEdit.start_time);
        selectedSlot = {
            date: startTime.toISOString().split('T')[0],
            time: startTime.toTimeString().split(' ')[0].substring(0, 5)
        };
        const displayFormat = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        timeDisplay.innerHTML = `<strong>${startTime.toLocaleDateString('pt-BR', displayFormat)}</strong>`;

    } else {
        modalTitle.textContent = 'Adicionar Novo Evento';
        saveBtn.textContent = 'Salvar Evento';
        form.querySelector('#event-id').value = '';
    }

    const bookingBtn = containerEl.querySelector('#open-booking-tool-btn');
    bookingBtn.disabled = !professionalSelect.value;
    
    modal.classList.remove('hidden');
};

const closeModal = () => {
    const modal = containerEl.querySelector('#event-modal');
    if (modal) modal.classList.add('hidden');
};

const restoreBookingState = () => {
    const pendingEventData = JSON.parse(sessionStorage.getItem('pendingEventData'));
    const selectedSlotData = JSON.parse(sessionStorage.getItem('selectedSlot'));

    if (!pendingEventData) return;

    const eventBeingEdited = pendingEventData.eventId ? allEvents.find(e => e.id == pendingEventData.eventId) : null;
    
    openModal(eventBeingEdited);

    const form = containerEl.querySelector('#event-form');
    form.querySelector('#event-client-name').value = pendingEventData.clientName || '';
    form.querySelector('#event-client-cpf').value = pendingEventData.clientCpf || '';
    form.querySelector('#event-client-telefone').value = pendingEventData.clientTelefone || '';
    form.querySelector('#event-notes').value = pendingEventData.notes || '';
    form.querySelector('#event-professional').value = pendingEventData.professionalId || '';

    if (selectedSlotData) {
        selectedSlot = selectedSlotData;
        const timeDisplay = containerEl.querySelector('#selected-time-display');
        const date = new Date(`${selectedSlot.date}T${selectedSlot.time}`);
        const displayFormat = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        timeDisplay.innerHTML = `<strong>${date.toLocaleDateString('pt-BR', displayFormat)}</strong>`;
    }

    sessionStorage.removeItem('pendingEventData');
    sessionStorage.removeItem('selectedSlot');
};

const renderEvents = () => {
    const listContainer = containerEl.querySelector('#events-list-container');
    if (!listContainer) return;

    if (allEvents.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">Nenhum evento agendado.</p>';
        return;
    }
    // Ordena por data (mais recente primeiro)
    allEvents.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    listContainer.innerHTML = allEvents.map(createEventCardHTML).join('');
};

const createEventCardHTML = (event) => {
    const startTime = new Date(event.start_time);
    const eventDate = startTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const timeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const eventTime = `${startTime.toLocaleTimeString('pt-BR', timeFormatOptions)} - ${new Date(event.end_time).toLocaleTimeString('pt-BR', timeFormatOptions)}`;
    
    // [MODIFICADO] Garante que o status vindo do backend (ou do submit) seja usado
    const statusText = event.status || 'Sem status';
    
    return `
        <div class="event-card" data-event-id="${event.id}" style="border-left-color: ${event.professional_color || '#cccccc'};">
            <div class="event-card-header">
                <h3>${event.client_name}</h3>
                <div class="event-card-header-right">
                    <span class="event-status" style="background-color: ${event.status_color || '#7f8c8d'};">${statusText}</span>
                    <button class="edit-event-btn action-btn" data-event-id="${event.id}" title="Editar Evento">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="delete-event-btn action-btn" data-event-id="${event.id}" title="Apagar Evento">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <div class="event-card-body">
                <div class="info-row"><i class="fas fa-user-md"></i> <span>${event.professional_name || 'N/A'}</span></div>
                <div class="info-row"><i class="fas fa-calendar-alt"></i> <span>${eventDate}</span></div>
                <div class="info-row"><i class="fas fa-clock"></i> <span>${eventTime}</span></div>
            </div>
        </div>
    `;
};

const handleFormSubmit = async (event) => {
    event.preventDefault();
    
    const form = event.target;
    const eventId = form.querySelector('#event-id').value;
    
    const clientName = form.querySelector('#event-client-name').value;
    const clientCpf = form.querySelector('#event-client-cpf').value;
    const clientTelefone = form.querySelector('#event-client-telefone').value;
    const notes = form.querySelector('#event-notes').value;
    const professionalId = form.querySelector('#event-professional').value;
    
    if (!clientName.trim() || !professionalId || !selectedSlot) {
        showError('Cliente, profissional e horário são obrigatórios.');
        return;
    }

    const startTime = new Date(`${selectedSlot.date}T${selectedSlot.time}`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const eventData = {
        client_name: clientName,
        client_cpf: clientCpf,
        client_telefone: clientTelefone,
        notes: notes,
        professional_id: professionalId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
    };
    
    const isEditing = !!eventId;
    const method = isEditing ? 'PUT' : 'POST';
    const endpoint = isEditing ? `/events/${eventId}` : '/events';

    try {
        // [MODIFICADO] O 'savedEvent' agora já vem com professional_name, status, etc., do backend.
        await api.request(endpoint, {
            method: method,
            body: JSON.stringify(eventData)
        });
        
        // --- [INÍCIO DA CORREÇÃO (Remoção da Duplicidade)] ---
        //
        // As linhas abaixo foram REMOVIDAS.
        // O WebSocket agora é a única fonte da verdade.
        // O WebSocket (event_created ou event_updated) irá atualizar
        // a lista 'allEvents' e chamar 'renderEvents()'.
        //
        // REMOVIDO: if (isEditing) { ... } else { ... }
        // REMOVIDO: renderEvents();
        //
        // --- [FIM DA CORREÇÃO] ---
        
        closeModal();
        showSuccess(`Evento ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);

    } catch (error) {
        showError(`Não foi possível ${isEditing ? 'atualizar' : 'criar'} o evento.`);
        console.error('Erro ao salvar evento:', error);
    }
};

const handleDeleteEvent = async (eventId) => {
    
    const confirmed = await showConfirmation({
        title: 'Confirmar Exclusão',
        message: 'Tem certeza de que deseja apagar este evento? Esta ação não pode ser desfeita.'
    });

    if (confirmed) {
        try {
            await api.request(`/events/${eventId}`, { method: 'DELETE' });
            showSuccess('Evento apagado com sucesso!');

            // --- [INÍCIO DA CORREÇÃO (Remoção da Duplicidade)] ---
            //
            // As linhas abaixo foram REMOVIDAS.
            // O WebSocket ('event_deleted') irá atualizar
            // a lista 'allEvents' e chamar 'renderEvents()'.
            //
            // REMOVIDO: const numericEventId = parseInt(eventId, 10);
            // REMOVIDO: allEvents = allEvents.filter(event => event.id !== numericEventId);
            // REMOVIDO: renderEvents();
            //
            // --- [FIM DA CORREÇÃO] ---

        } catch (error) {
            showError('Não foi possível apagar o evento.');
            console.error('Erro ao apagar evento:', error);
        }
    }
};

const handleEditEvent = (eventId) => {
    const numericEventId = parseInt(eventId, 10);
    const eventToEdit = allEvents.find(event => event.id === numericEventId);
    if (eventToEdit) {
        openModal(eventToEdit);
    } else {
        showError('Não foi possível encontrar os dados do evento para edição.');
    }
};

const handleViewDetails = (eventId) => {
    // --- [MODIFICAÇÃO] Roteamento "History Mode" ---
    navigateToView(`event-details?id=${eventId}`);
};

const handleEventsListClick = (event) => {
    const target = event.target;

    const deleteButton = target.closest('.delete-event-btn');
    if (deleteButton) {
        const eventId = deleteButton.dataset.eventId;
        handleDeleteEvent(eventId);
        return;
    }

    const editButton = target.closest('.edit-event-btn');
    if (editButton) {
        const eventId = editButton.dataset.eventId;
        handleEditEvent(eventId);
        return;
    }

    const card = target.closest('.event-card');
    if (card) {
        const eventId = card.dataset.eventId;
        handleViewDetails(eventId);
    }
};

const fetchAndRenderData = async () => {
    try {
        const listContainer = containerEl.querySelector('#events-list-container');
        if(listContainer) listContainer.innerHTML = '<p class="loading-message">Carregando eventos...</p>';
        
        [allProfessionals, allEvents] = await Promise.all([
            api.request('/professionals'),
            api.request('/events')
        ]);
        renderEvents();
    } catch (error) {
        showError('Falha ao carregar dados da página.');
        const listContainer = containerEl.querySelector('#events-list-container');
        if (listContainer) listContainer.innerHTML = '<p class="error-message">Ocorreu um erro ao buscar os eventos.</p>';
    }
};

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
/**
 * 4. Configura os "ouvintes" do WebSocket para atualizar a lista de eventos em tempo real.
 */
function setupWebSocketListeners() {
    // Se já existe uma conexão, desconecta antes de criar uma nova
    if (socket) {
        socket.disconnect();
    }
    
    // Conecta ao servidor (definido no server.js)
    socket = io(API_BASE_URL);

    socket.on('connect', () => {
        console.log('[Socket.IO] Conectado ao servidor (View: Eventos).');
    });

    // Ouvinte para NOVOS eventos (criados pela API)
    socket.on('event_created', (newEvent) => {
        console.log('[Socket.IO] Novo evento recebido (View: Eventos):', newEvent);
        
        // --- [INÍCIO DA CORREÇÃO (Prevenção de Duplicidade)] ---
        // Verifica se o evento JÁ existe na lista antes de adicionar
        if (!allEvents.some(e => e.id === newEvent.id)) {
            allEvents.push(newEvent);
            renderEvents(); // Redesenha a lista (que irá re-ordenar)
        }
        // --- [FIM DA CORREÇÃO] ---
    });

    // Ouvinte para eventos ATUALIZADOS
    socket.on('event_updated', (updatedEvent) => {
        console.log('[Socket.IO] Evento atualizado (View: Eventos):', updatedEvent);
        // Encontra e substitui o evento na lista
        const index = allEvents.findIndex(e => e.id === updatedEvent.id);
        if (index !== -1) {
            allEvents[index] = updatedEvent;
        } else {
            allEvents.push(updatedEvent);
        }
        renderEvents();
    });

    // Ouvinte para eventos DELETADOS
    socket.on('event_deleted', (deletedEvent) => {
        console.log('[Socket.IO] Evento deletado (View: Eventos):', deletedEvent);
        // Remove o evento da lista
        allEvents = allEvents.filter(e => e.id !== deletedEvent.id);
        renderEvents();
    });

    // --- [NOVO] Ouvinte para a exclusão em massa ---
    socket.on('events_cleared', (data) => {
        console.log('[Socket.IO] Todos os eventos foram limpos (View: Eventos):', data);
        allEvents = [];
        renderEvents(); // Mostra a mensagem "Nenhum evento agendado."
    });
    // --- [FIM DO NOVO OUVINTE] ---

    socket.on('disconnect', () => {
        console.log('[Socket.IO] Desconectado do servidor (View: Eventos).');
    });
}
// --- [FIM DA MODIFICAÇÃO] ---

export function init(container, params) {
    // Usamos setTimeout(..., 0) para garantir que o DOM está pronto e evitar condições de corrida
    setTimeout(async () => {
        containerEl = container;
        
        await fetchAndRenderData();

        // --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
        // 5. Inicia os ouvintes do WebSocket
        setupWebSocketListeners();
        // --- [FIM DA MODIFICAÇÃO] ---

        const addButton = containerEl.querySelector('#add-event-btn');
        if (addButton) addButton.addEventListener('click', () => openModal());
        
        const closeModalButton = containerEl.querySelector('#close-modal-btn');
        if (closeModalButton) closeModalButton.addEventListener('click', closeModal);

        const cancelButton = containerEl.querySelector('#cancel-event-btn');
        if (cancelButton) cancelButton.addEventListener('click', closeModal);
        
        const professionalSelect = containerEl.querySelector('#event-professional');
        const openBookingBtn = containerEl.querySelector('#open-booking-tool-btn');

        if (professionalSelect) {
            professionalSelect.addEventListener('change', () => {
                openBookingBtn.disabled = !professionalSelect.value;
            });
        }

        if (openBookingBtn) {
            openBookingBtn.addEventListener('click', () => {
                const form = containerEl.querySelector('#event-form');
                const pendingEventData = {
                    eventId: form.querySelector('#event-id').value,
                    clientName: form.querySelector('#event-client-name').value,
                    clientCpf: form.querySelector('#event-client-cpf').value,
                    clientTelefone: form.querySelector('#event-client-telefone').value,
                    notes: form.querySelector('#event-notes').value,
                    professionalId: form.querySelector('#event-professional').value,
                };

                sessionStorage.setItem('pendingEventData', JSON.stringify(pendingEventData));
                
                // --- [MODIFICAÇÃO] Roteamento "History Mode" ---
                navigateToView(`booking?professionalId=${pendingEventData.professionalId}&returnTo=events`);
            });
        }
        
        const eventForm = containerEl.querySelector('#event-form');
        if (eventForm) {
            eventForm.addEventListener('submit', handleFormSubmit);
        }
        
        const eventsListContainer = containerEl.querySelector('#events-list-container');
        if (eventsListContainer) {
            eventsListContainer.addEventListener('click', handleEventsListClick);
        }

        restoreBookingState();

        // ### CORREÇÃO PRINCIPAL AQUI ###
        // Verifica se a ação é 'edit' e se há um ID
        if (params && params.action === 'edit' && params.id) {
            const numericEventId = parseInt(params.id, 10);
            // Espera um pouco para garantir que allEvents está populado
            setTimeout(() => {
                const eventToEdit = allEvents.find(event => event.id === numericEventId);
                if (eventToEdit) {
                    openModal(eventToEdit);
                    // [MODIFICADO] Limpa a URL para o History Mode
                    history.replaceState(null, '', '/events');
                } else {
                    showError('Evento para edição não encontrado.');
                }
            }, 100); // Um pequeno delay para segurança
        }
        
        else if (params && params.action === 'add') {
            openModal();
            // [MODIFICADO] Limpa a URL para o History Mode
            history.replaceState(null, '', '/events');
        }

    }, 0);
}