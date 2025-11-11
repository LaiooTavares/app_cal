// frontend/src/views/calendar/calendar.js

// ADICIONADO: Importa o CSS específico desta view. (Esta é a correção do 404)
import './calendar.css';

// MODIFICADO: Imports agora usam caminhos relativos (../../)
// --- [MODIFICAÇÃO] Importa 'navigateToView' do roteador principal ---
import { api, navigateToView } from '../../js/script.js';
import { init as initEventModal, show as showEventModal } from '../../js/components/EventModal.js';

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
import { io } from 'socket.io-client'; // 1. Importar o cliente socket.io
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; // 2. Obter a URL da API
let socket = null; // 3. Variável para guardar a conexão
// --- [FIM DA MODIFICAÇÃO] ---


let currentDate = new Date();
let allEvents = [];
let elements = {};

// [REMOVIDO] A função getUrlParams agora está centralizada no script.js
// function getUrlParams() { ... }

async function refreshAfterSave() {
    try {
        allEvents = await api.request('/events');
        renderCalendar(); 
    } catch (error) {
        console.error("Erro ao atualizar os eventos após salvar.", error);
    }
}

function handleAddEvent(date) {
    showEventModal({
        prefill: { date },
        onSave: refreshAfterSave
    });
}

function renderCalendar() {
    const { currentMonthEl, currentYearEl, calendarDaysEl } = elements;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    currentMonthEl.textContent = currentDate.toLocaleDateString('pt-BR', { month: 'long' });
    currentYearEl.textContent = year;
    calendarDaysEl.innerHTML = '';
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const lastDateOfLastMonth = new Date(year, month, 0).getDate();

    for (let i = firstDayOfMonth; i > 0; i--) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('day', 'prev-month');
        dayElement.textContent = lastDateOfLastMonth - i + 1;
        calendarDaysEl.appendChild(dayElement);
    }

    for (let i = 1; i <= lastDateOfMonth; i++) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('day', 'current-month');
        const dateForDay = new Date(year, month, i);
        dayElement.dataset.date = dateForDay.toISOString();
        const dayNumber = document.createElement('span');
        dayNumber.className = 'day-number';
        dayNumber.textContent = i;
        dayElement.appendChild(dayNumber);
        const today = new Date();
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dayNumber.classList.add('today');
        }

        const eventsForDay = allEvents.filter(event => {
            const eventDate = new Date(event.start_time);
            return eventDate.getFullYear() === year && eventDate.getMonth() === month && eventDate.getDate() === i;
        });

        if (eventsForDay.length > 0) {
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'events-list';
            eventsForDay.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            
            const maxEventsToShow = 2; 
            eventsForDay.slice(0, maxEventsToShow).forEach(event => {
                const eventBar = document.createElement('div');
                eventBar.className = 'event-bar';
                eventBar.style.backgroundColor = event.professional_color || 'var(--primary-color)';
                eventBar.title = `${event.client_name} - ${event.professional_name || 'N/A'}`;
                const startTime = new Date(event.start_time);
                const timeString = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                eventBar.innerHTML = `<span class="event-time">${timeString}</span> ${event.client_name}`;
                
                // --- [MODIFICAÇÃO] Roteamento "History Mode" ---
                eventBar.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    // [MODIFICADO] Usa a função de navegação
                    navigateToView(`event-details?id=${event.id}`);
                });
                // --- [FIM DA MODIFICAÇÃO] ---

                eventsContainer.appendChild(eventBar);
            });

            if (eventsForDay.length > maxEventsToShow) {
                const moreEventsIndicator = document.createElement('div');
                moreEventsIndicator.className = 'more-events-indicator';
                moreEventsIndicator.textContent = `+${eventsForDay.length - maxEventsToShow} mais`;
                eventsContainer.appendChild(moreEventsIndicator);
            }

            dayElement.appendChild(eventsContainer);
        }

        // --- [MODIFICAÇÃO] Roteamento "History Mode" ---
        dayElement.addEventListener('click', (e) => {
            // [MODIFICADO] Usa a função de navegação
            navigateToView('events');
        });
        // --- [FIM DA MODIFICAÇÃO] ---

        calendarDaysEl.appendChild(dayElement);
    }
}

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
/**
 * 4. Configura os "ouvintes" do WebSocket para atualizar o calendário em tempo real.
 */
function setupWebSocketListeners() {
    // Se já existe uma conexão, desconecta antes de criar uma nova
    if (socket) {
        socket.disconnect();
    }
    
    // Conecta ao servidor (definido no server.js)
    socket = io(API_BASE_URL);

    socket.on('connect', () => {
        console.log('[Socket.IO] Conectado ao servidor de real-time.');
    });

    // Ouvinte para NOVOS eventos (criados pela API)
    socket.on('event_created', (newEvent) => {
        console.log('[Socket.IO] Novo evento recebido:', newEvent);
        // Adiciona o novo evento à lista e redesenha o calendário
        allEvents.push(newEvent);
        renderCalendar();
    });

    // Ouvinte para eventos ATUALIZADOS
    socket.on('event_updated', (updatedEvent) => {
        console.log('[Socket.IO] Evento atualizado:', updatedEvent);
        // Encontra e substitui o evento na lista
        const index = allEvents.findIndex(e => e.id === updatedEvent.id);
        if (index !== -1) {
            allEvents[index] = updatedEvent;
        } else {
            // Se não encontrou (improvável), apenas adiciona
            allEvents.push(updatedEvent);
        }
        renderCalendar();
    });

    // Ouvinte para eventos DELETADOS
    socket.on('event_deleted', (deletedEvent) => {
        console.log('[Socket.IO] Evento deletado:', deletedEvent);
        // Remove o evento da lista
        allEvents = allEvents.filter(e => e.id !== deletedEvent.id);
        renderCalendar();
    });

    // --- [NOVO] Ouvinte para a exclusão em massa ---
    socket.on('events_cleared', (data) => {
        console.log('[Socket.IO] Todos os eventos foram limpos:', data);
        // Limpa a lista de eventos e redesenha o calendário
        allEvents = [];
        renderCalendar();
    });
    // --- [FIM DO NOVO OUVINTE] ---

    socket.on('disconnect', () => {
        console.log('[Socket.IO] Desconectado do servidor.');
    });
}
// --- [FIM DA MODIFICAÇÃO] ---


export async function init(container, params) {
    elements = {
        container,
        calendarWrapper: container.querySelector('.calendar-wrapper'),
        currentMonthEl: container.querySelector('#current-month'),
        currentYearEl: container.querySelector('#current-year'),
        calendarDaysEl: container.querySelector('#calendar-days'),
        prevMonthBtn: container.querySelector('#prev-month-btn'),
        nextMonthBtn: container.querySelector('#next-month-btn'),
    };
    initEventModal();
    try {
        allEvents = await api.request('/events');
    } catch (error) {
        console.error("Não foi possível carregar os eventos do calendário.", error.message);
        container.innerHTML = `<p style="color: red; padding: 20px;">Não foi possível carregar os dados.</p>`;
        return;
    }
    
    renderCalendar();

    // --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
    // 5. Inicia os ouvintes do WebSocket
    setupWebSocketListeners();
    // --- [FIM DA MODIFICAÇÃO] ---

    elements.prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    elements.nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
}