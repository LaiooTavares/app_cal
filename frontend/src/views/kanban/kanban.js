// FILE: frontend/src/views/kanban/kanban.js
import { api } from '@/js/script.js';
import { showError, showSuccess } from '@/js/utils/toaster.js';

let allStatuses = [];
let allEvents = [];
let containerEl = null;

const renderBoard = () => {
    const boardContainer = containerEl.querySelector('#kanban-board');
    boardContainer.innerHTML = '';

    allStatuses.sort((a, b) => a.sort_order - b.sort_order);

    // ATUALIZADO: Removemos a coluna "Sem Status" que era adicionada manualmente.
    // Agora, apenas os status que vêm da API serão exibidos.
    const displayStatuses = allStatuses;

    displayStatuses.forEach(status => {
        const column = document.createElement('div');
        column.className = 'kanban-column';
        column.dataset.statusId = status.id;
        column.draggable = status.id !== null; 
        column.innerHTML = `
            <div class="kanban-column-header" style="border-color: ${status.color};">
                <h3 style="color: ${status.color};">${status.name}</h3>
                <span class="card-count">0</span>
            </div>
            <div class="kanban-cards"></div>
        `;
        boardContainer.appendChild(column);
    });

    allEvents.forEach(event => {
        const column = boardContainer.querySelector(`.kanban-column[data-status-id="${event.status_id}"]`);
        
        // ATUALIZADO: Apenas adicionamos o card se a sua coluna de status correspondente existir no quadro.
        // Isso efetivamente oculta os eventos que estão "Sem Status" (status_id = null).
        if (column) {
            const card = createEventCard(event);
            column.querySelector('.kanban-cards').appendChild(card);
        }
    });

    boardContainer.querySelectorAll('.kanban-column').forEach(column => {
        const count = column.querySelectorAll('.event-card').length;
        column.querySelector('.card-count').textContent = count;
    });

    addDragAndDropListeners();
};

const createEventCard = (event) => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.draggable = true;
    card.dataset.eventId = event.id;

    const startTime = new Date(event.start_time);
    const eventDate = startTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const timeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const eventTime = `${startTime.toLocaleTimeString('pt-BR', timeFormatOptions)}`;

    card.innerHTML = `
        <div class="event-card-header">
            <h3>${event.client_name}</h3>
        </div>
        <div class="event-card-body">
            <div class="info-row"><i class="fas fa-user-md"></i> <span>${event.professional_name || 'N/A'}</span></div>
            <div class="info-row"><i class="fas fa-calendar-alt"></i> <span>${eventDate}</span></div>
            <div class="info-row"><i class="fas fa-clock"></i> <span>${eventTime}</span></div>
        </div>
    `;
    
    card.addEventListener('click', () => {
        window.location.hash = `event-details?id=${event.id}`;
    });

    return card;
};

const handleCardDrop = async (e) => {
    e.preventDefault();
    const columnCardsContainer = e.currentTarget;
    columnCardsContainer.classList.remove('drag-over');
    const draggingCard = document.querySelector('.event-card.is-dragging');
    if (!draggingCard) return;

    const eventId = draggingCard.dataset.eventId;
    const newStatusId = columnCardsContainer.closest('.kanban-column').dataset.statusId;

    if (newStatusId === 'null') {
        showError("Não é possível mover um evento para 'Sem Status'.");
        fetchBoardData(); 
        return;
    }

    columnCardsContainer.appendChild(draggingCard);
    
    containerEl.querySelectorAll('.kanban-column').forEach(col => {
        col.querySelector('.card-count').textContent = col.querySelectorAll('.event-card').length;
    });

    try {
        await api.request(`/events/${eventId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status_id: newStatusId })
        });
        showSuccess('Status do evento atualizado!');
        const eventIndex = allEvents.findIndex(ev => ev.id == eventId);
        if(eventIndex > -1) allEvents[eventIndex].status_id = newStatusId;
    } catch (error) {
        showError('Não foi possível atualizar o status.');
        fetchBoardData();
    }
};

const handleColumnDrop = async (e) => {
    e.preventDefault();
    const draggingColumn = document.querySelector('.kanban-column.is-dragging');
    if (!draggingColumn) return;
    
    draggingColumn.classList.remove('is-dragging');

    const orderedColumnIds = [...containerEl.querySelectorAll('.kanban-column')]
        .map(col => col.dataset.statusId)
        .filter(id => id !== 'null'); 

    try {
        await api.request('/kanban/statuses/reorder', {
            method: 'POST',
            body: JSON.stringify({ orderedIds: orderedColumnIds })
        });
        showSuccess('Ordem das colunas atualizada!');
        fetchBoardData();
    } catch (error) {
        showError('Não foi possível reordenar as colunas.');
    }
};

const addDragAndDropListeners = () => {
    const cards = containerEl.querySelectorAll('.event-card');
    const cardContainers = containerEl.querySelectorAll('.kanban-cards');
    const columns = containerEl.querySelectorAll('.kanban-column');
    const board = containerEl.querySelector('#kanban-board');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.stopPropagation(); 
            card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', (e) => {
            e.stopPropagation();
            card.classList.remove('is-dragging');
        });
    });

    cardContainers.forEach(container => {
        container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('drag-over'); });
        container.addEventListener('dragleave', (e) => { container.classList.remove('drag-over'); });
        container.addEventListener('drop', handleCardDrop);
    });
    
    columns.forEach(column => {
        if (column.draggable) {
            column.addEventListener('dragstart', (e) => {
                if (e.target.closest('.kanban-column-header') || e.target.classList.contains('kanban-column')) {
                    column.classList.add('is-dragging');
                } else {
                    e.preventDefault(); 
                }
            });
            column.addEventListener('dragend', () => {
                column.classList.remove('is-dragging');
            });
        }
    });

    board.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingColumn = document.querySelector('.kanban-column.is-dragging');
        if (!draggingColumn) return;

        const afterElement = getDragAfterColumn(board, e.clientX);
        if (afterElement == null) {
            board.appendChild(draggingColumn);
        } else {
            board.insertBefore(draggingColumn, afterElement);
        }
    });

    board.addEventListener('drop', handleColumnDrop);
};

const getDragAfterColumn = (container, x) => {
    const draggableColumns = [...container.querySelectorAll('.kanban-column:not(.is-dragging)')];
    return draggableColumns.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
};


const fetchBoardData = async () => {
    try {
        const [statuses, events] = await Promise.all([
            api.request('/kanban/statuses'),
            api.request('/events') 
        ]);
        
        allStatuses = statuses;
        allEvents = events;

        renderBoard();
    } catch (error) {
        showError('Não foi possível carregar os dados do Kanban.');
        containerEl.querySelector('#kanban-board').innerHTML = '<p style="color: red;">Erro ao carregar.</p>';
    }
}

export async function init(container) {
    containerEl = container;
    containerEl.querySelector('#kanban-board').innerHTML = '<p>A carregar quadro...</p>';
    await fetchBoardData();
}