// FILE: frontend/src/views/settings/settings.js
import { api } from '/src/js/script.js';
import { showSuccess, showError } from '/src/js/utils/toaster.js';
import { showConfirmation } from '/src/js/utils/modal.js';
import timezoneHTML from '/src/views/settings/timezone/timezone.html?raw';

let statuses = [];
let containerEl = null;

// =================================================================
// SERVIÇO DE FUSO HORÁRIO (TIMEZONE)
// =================================================================

export const timezoneService = {
    KEY: 'user_timezone',

    get() {
        const savedTimezone = localStorage.getItem(this.KEY);
        if (savedTimezone) {
            return savedTimezone;
        }
        // Detecção automática como fallback
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return browserTimezone || 'UTC'; // UTC como último recurso
    },

    set(timezone) {
        if (timezone) {
            localStorage.setItem(this.KEY, timezone);
        }
    }
};

// =================================================================
// FUNÇÕES DE NAVEGAÇÃO
// =================================================================

function showMainMenu() {
    const mainMenu = containerEl.querySelector('#settings-main-content');
    const subpageContainer = containerEl.querySelector('#settings-subpage-container');
    if (mainMenu) mainMenu.classList.remove('hidden');
    if (subpageContainer) subpageContainer.classList.add('hidden');
}

function showSubpage(renderFunction) {
    const mainMenu = containerEl.querySelector('#settings-main-content');
    const subpageContainer = containerEl.querySelector('#settings-subpage-container');
    if (mainMenu) mainMenu.classList.add('hidden');
    if (subpageContainer) {
        subpageContainer.classList.remove('hidden');
        subpageContainer.innerHTML = '';
        renderFunction(subpageContainer);
    }
}

// =================================================================
// LÓGICA DA SUB-PÁGINA DE FUSO HORÁRIO (TIMEZONE)
// =================================================================

const timezones = [
    { group: "América do Sul", zones: [ "America/Sao_Paulo", "America/Noronha", "America/Manaus", "America/Rio_Branco", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Caracas", "America/Lima", "America/Santiago" ]},
    { group: "América do Norte", zones: [ "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Mexico_City", "America/Toronto" ]},
    { group: "Europa", zones: [ "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Europe/Dublin" ]},
    { group: "África", zones: [ "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos" ]},
    { group: "Ásia", zones: [ "Asia/Dubai", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore" ]},
    { group: "Oceania", zones: [ "Australia/Sydney", "Australia/Perth", "Pacific/Auckland" ]},
    { group: "Outros", zones: [ "UTC" ]}
];

function populateTimezoneSelect(selectElement, selectedValue) {
    selectElement.innerHTML = '';
    timezones.forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.group;
        group.zones.forEach(zone => {
            const option = document.createElement('option');
            option.value = zone;
            option.textContent = zone.replace(/_/g, ' ');
            if (zone === selectedValue) {
                option.selected = true;
            }
            optgroup.appendChild(option);
        });
        selectElement.appendChild(optgroup);
    });
}

function updateTimezoneDisplay() {
    const displayElement = containerEl.querySelector('#current-timezone-value');
    if (displayElement) {
        const currentTimezone = timezoneService.get();
        displayElement.textContent = currentTimezone.replace(/_/g, ' ');
    }
}

async function handleSaveTimezone() {
    const selectElement = containerEl.querySelector('#timezone-select');
    const newTimezone = selectElement.value;
    try {
        await api.request('/settings/timezone', {
            method: 'POST',
            body: JSON.stringify({ timezone: newTimezone })
        });
        timezoneService.set(newTimezone); // Salva no localStorage
        updateTimezoneDisplay(); // Atualiza a exibição na página principal
        showSuccess('Fuso horário salvo com sucesso!');
        showMainMenu(); // Volta para o menu principal
    } catch (error) {
        showError('Não foi possível salvar o fuso horário.');
    }
}

function renderTimezonePage(subpageContainer) {
    subpageContainer.innerHTML = timezoneHTML;

    subpageContainer.querySelector('#back-to-settings-btn').addEventListener('click', showMainMenu);
    subpageContainer.querySelector('#save-timezone-btn').addEventListener('click', handleSaveTimezone);

    const selectElement = subpageContainer.querySelector('#timezone-select');
    const currentTimezone = timezoneService.get(); // Pega do serviço
    populateTimezoneSelect(selectElement, currentTimezone);
}


// =================================================================
// LÓGICA DO KANBAN (SEU CÓDIGO ORIGINAL - SEM ALTERAÇÕES)
// =================================================================

const renderStatuses = () => {
    const listContainer = containerEl.querySelector('#statuses-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    statuses.sort((a, b) => a.sort_order - b.sort_order);

    statuses.forEach((status) => {
        const item = document.createElement('div');
        item.className = 'status-item';
        item.dataset.id = status.id;
        item.draggable = true;
        item.innerHTML = `
            <i class="fas fa-grip-vertical drag-handle"></i>
            <span class="status-color-swatch" style="background-color: ${status.color};"></span>
            <span class="status-name-display">${status.name}</span>
            <div class="status-actions">
                <button class="edit-status-btn" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="delete-status-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        listContainer.appendChild(item);
    });
    addEventListenersToKanban();
};

const openStatusModal = (status = null) => {
    const modal = document.querySelector('#status-modal-overlay');
    const form = document.querySelector('#status-form');
    const title = document.querySelector('#modal-title');
    const idInput = document.querySelector('#status-id');
    form.reset();
    if (status) {
        title.textContent = 'Editar Status';
        idInput.value = status.id;
        document.querySelector('#status-name').value = status.name;
        document.querySelector('#status-color').value = status.color;
    } else {
        title.textContent = 'Adicionar Novo Status';
        idInput.value = '';
        document.querySelector('#status-color').value = '#3498db';
    }
    modal.classList.remove('hidden');
};

const closeStatusModal = () => {
    document.querySelector('#status-modal-overlay').classList.add('hidden');
};

const addEventListenersToKanban = () => {
    containerEl.querySelectorAll('.edit-status-btn').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.closest('.status-item').dataset.id;
            const status = statuses.find(s => s.id == id);
            openStatusModal(status);
        };
    });
    containerEl.querySelectorAll('.delete-status-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.closest('.status-item').dataset.id;
            const status = statuses.find(s => s.id == id);
            // [MODIFICADO] Corrigido para usar o formato de objeto do modal
            const confirmed = await showConfirmation({
                title: 'Excluir Status?', 
                message: `Tem a certeza que deseja excluir o status "${status.name}"?`
            });
            if (confirmed) {
                try {
                    await api.request(`/kanban/statuses/${id}`, { method: 'DELETE' });
                    showSuccess('Status excluído com sucesso!');
                    fetchStatuses();
                } catch (error) {
                    showError(error.message || 'Não foi possível excluir o status.');
                }
            }
        };
    });
    const listContainer = containerEl.querySelector('#statuses-list-container');
    if (!listContainer) return;
    
    let draggedItem = null;
    listContainer.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.status-item');
        if (item) {
            draggedItem = item;
            setTimeout(() => { if (draggedItem) draggedItem.classList.add('dragging'); }, 0);
        }
    });
    listContainer.addEventListener('dragend', () => {
        if (draggedItem) { draggedItem.classList.remove('dragging'); }
    });
    listContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem) return;
        const afterElement = getDragAfterElement(listContainer, e.clientY);
        if (afterElement == null) {
            listContainer.appendChild(draggedItem);
        } else {
            listContainer.insertBefore(draggedItem, afterElement);
        }
    });
    listContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        const newOrderIds = [...listContainer.querySelectorAll('.status-item')].map(item => item.dataset.id);
        try {
            await api.request('/kanban/statuses/reorder', {
                method: 'POST',
                body: JSON.stringify({ orderedIds: newOrderIds })
            });
            showSuccess('Ordem dos status atualizada!');
            fetchStatuses(); 
        } catch (error) {
            showError('Não foi possível reordenar os status.');
            renderStatuses();
        } finally {
            draggedItem = null;
        }
    });
};

const getDragAfterElement = (container, y) => {
    const draggableElements = [...container.querySelectorAll('.status-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
};

const fetchStatuses = async () => {
    try {
        statuses = await api.request('/kanban/statuses');
        renderStatuses();
    } catch (error) {
        showError('Não foi possível carregar os status do Kanban.');
    }
};

async function initializeKanban() {
    const addStatusBtn = document.querySelector('#add-status-btn');
    const cancelStatusBtn = document.querySelector('#cancel-status-btn');
    const statusForm = document.querySelector('#status-form');

    if (addStatusBtn) addStatusBtn.addEventListener('click', () => openStatusModal());
    if (cancelStatusBtn) cancelStatusBtn.addEventListener('click', closeStatusModal);
    
    if (statusForm) {
        statusForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.querySelector('#status-id').value;
            const isEditing = !!id;
            const data = {
                name: document.querySelector('#status-name').value,
                color: document.querySelector('#status-color').value,
            };
            try {
                if (isEditing) {
                    await api.request(`/kanban/statuses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
                    showSuccess('Status atualizado com sucesso!');
                } else {
                    const maxSortOrder = statuses.reduce((max, s) => Math.max(max, s.sort_order || 0), 0);
                    data.sort_order = maxSortOrder + 1;
                    await api.request('/kanban/statuses', { method: 'POST', body: JSON.stringify(data) });
                    showSuccess('Status criado com sucesso!');
                }
                closeStatusModal();
                fetchStatuses();
            } catch (error) {
                showError(error.message || 'Não foi possível salvar o status.');
            }
        });
    }
    
    await fetchStatuses();
}

// --- [REMOVIDO] Bloco da função handleDeleteAllEvents ---

// =================================================================
// FUNÇÃO DE INICIALIZAÇÃO PRINCIPAL
// =================================================================

export async function init(container) {
    if (!container) return;

    containerEl = container;

    // Inicializa o Kanban e o Tema
    await initializeKanban();
    const themeSelect = containerEl.querySelector('#theme-select');
    if (window.app && window.app.themeManager) {
        window.app.themeManager.setupThemeSwitcher(themeSelect);
    }

    // Inicializa a lógica de Fuso Horário
    const timezoneCard = containerEl.querySelector('#timezone-settings-card');
    if (timezoneCard) {
        timezoneCard.addEventListener('click', () => {
            showSubpage(renderTimezonePage);
        });
    }
    
    updateTimezoneDisplay();

    
}