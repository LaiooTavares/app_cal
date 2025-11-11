// frontend/src/views/availability/availability.js
import { api } from '../../js/script.js';
import { showSuccess, showError } from '../../js/utils/toaster.js';
import { init as initExceptions } from '../exceptions/exceptions.js';
import { timezoneService } from '../settings/settings.js'; // <-- 1. IMPORTAÇÃO DO SERVIÇO

let mainContainer = null;
let allProfessionals = [];
let currentProfessional = null;
let timeFormat = localStorage.getItem('timeFormat') || '24h';
// Mapeamento de dias JS (0-6) para o formato do BD (1-7, Domingo=7)
const dbDayMap = { 0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
// Mapeamento de dias do BD para JS
const jsDayMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };
// Nomes dos dias para exibição
const daysOfWeek = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"];
// Ordem de exibição na tela de edição
const displayDaysOrder = [1, 2, 3, 4, 5, 6, 0]; // (Mon, Tue, Wed, Thu, Fri, Sat, Sun)


// Função para formatar o tempo de 24h para 12h (AM/PM) ou manter 24h
function formatTime(timeString, forceFormat = null) {
    const targetFormat = forceFormat || timeFormat;
    if (!timeString) return '';
    if (targetFormat === '24h') {
        return timeString.slice(0, 5);
    }
    const [hour, minute] = timeString.split(':');
    const hourInt = parseInt(hour, 10);
    const ampm = hourInt >= 12 ? 'PM' : 'AM';
    let formattedHour = hourInt % 12;
    if (formattedHour === 0) { // Meia-noite e meio-dia
        formattedHour = 12;
    }
    // Removido o padStart para um formato mais natural como "1:00 PM" em vez de "01:00 PM"
    return `${formattedHour}:${minute} ${ampm}`;
}


// Função que atualiza a exibição de todos os horários na tela de edição
function updateAllTimeDisplays() {
    if (!mainContainer) return;
    mainContainer.querySelectorAll('.interval-row').forEach(row => {
        const startTimeInput = row.querySelector('.start-time-input');
        const endTimeInput = row.querySelector('.end-time-input');
        
        // Remove displays antigos
        row.querySelectorAll('.time-format-display').forEach(el => el.remove());

        if (timeFormat === '12h') {
            // Adiciona display para o horário de início
            if (startTimeInput.value) {
                const displayStart = document.createElement('span');
                displayStart.className = 'time-format-display';
                displayStart.textContent = formatTime(startTimeInput.value, '12h');
                startTimeInput.after(displayStart);
            }
            // Adiciona display para o horário de fim
            if (endTimeInput.value) {
                const displayEnd = document.createElement('span');
                displayEnd.className = 'time-format-display';
                displayEnd.textContent = formatTime(endTimeInput.value, '12h');
                endTimeInput.after(displayEnd);
            }
        }
    });
}

export async function init(container) {
    mainContainer = container.querySelector('#availability-view-container');
    if (!mainContainer) {
        console.error("Container #availability-view-container não encontrado!");
        return;
    }
    
    mainContainer.innerHTML = `<div class="availability-wrapper"><p>Carregando profissionais...</p></div>`;
    
    try {
        allProfessionals = await api.request('/professionals');
        renderMainShell();
        injectCustomStyles(); // [MODIFICADO] Renomeado de injectModalStyles

        const urlParams = new URLSearchParams(window.location.search);
        const professionalId = urlParams.get('professional_id');
        
        if (professionalId && allProfessionals.some(p => p.id == professionalId)) {
            const professional = allProfessionals.find(p => p.id == professionalId);
            mainContainer.querySelector('#professional-select').value = professionalId;
            currentProfessional = professional;
            renderReadOnlySchedule(professional);
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        } else {
             mainContainer.querySelector('#schedule-content').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Selecione um profissional para começar.</p>';
        }
    } catch(error) {
        showError('Não foi possível carregar os profissionais.');
        mainContainer.innerHTML = `<div class="availability-wrapper"><p>Erro ao carregar.</p></div>`;
    }
}

function renderMainShell() {
    let shellHTML = `
        <div class="availability-wrapper">
            <div class="availability-header">
                <label for="professional-select">Profissional:</label>
                <select id="professional-select">
                    <option value="">-- Selecione --</option>
                </select>
            </div>
            <div id="schedule-content"></div>
        </div>
    `;
    mainContainer.innerHTML = shellHTML;

    const select = mainContainer.querySelector('#professional-select');
    if (allProfessionals.length > 0) {
        allProfessionals.forEach(prof => {
            const option = document.createElement('option');
            option.value = prof.id;
            option.textContent = `${prof.name} (ID: ${prof.id})`;
            select.appendChild(option);
        });
    } else {
        select.disabled = true;
        mainContainer.querySelector('#schedule-content').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Nenhum profissional cadastrado.</p>';
    }

    select.addEventListener('change', () => {
        const selectedId = select.value;
        if (selectedId) {
            currentProfessional = allProfessionals.find(p => p.id == selectedId);
            renderReadOnlySchedule(currentProfessional);
        } else {
            currentProfessional = null;
            mainContainer.querySelector('#schedule-content').innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Selecione um profissional para começar.</p>';
        }
    });
}

async function renderReadOnlySchedule(professional) {
    const contentContainer = mainContainer.querySelector('#schedule-content');
    contentContainer.innerHTML = `<p>Carregando horários...</p>`;

    try {
        const availabilities = await api.request(`/availabilities?professional_id=${professional.id}`);
        const userTimezone = timezoneService.get(); // <-- 2. UTILIZAÇÃO DO SERVIÇO

        let scheduleHTML = `<div class="readonly-schedule">`;
        const displayDaysOrder = [
            { name: "Domingo", dbIndex: 7 }, { name: "Segunda-feira", dbIndex: 1 },
            { name: "Terça-feira", dbIndex: 2 }, { name: "Quarta-feira", dbIndex: 3 },
            { name: "Quinta-feira", dbIndex: 4 }, { name: "Sexta-feira", dbIndex: 5 },
            { name: "Sábado", dbIndex: 6 }
        ];

        displayDaysOrder.forEach(day => {
            const dayAvailabilities = availabilities.filter(a => a.day_of_week === day.dbIndex).sort((a,b) => a.start_time.localeCompare(b.start_time));
            scheduleHTML += `
                <div class="readonly-schedule-row">
                    <span class="readonly-day-name">${day.name}</span>
                    <div class="readonly-day-times ${dayAvailabilities.length === 0 ? 'unavailable' : ''}">
                        ${dayAvailabilities.length > 0
                            ? dayAvailabilities.map(a => `<span>${formatTime(a.start_time)} - ${formatTime(a.end_time)}</span>`).join('')
                            : '<span>Indisponível</span>'
                        }
                    </div>
                </div>
            `;
        });
        
        scheduleHTML += `</div>`;
        
        // --- [INÍCIO DA MODIFICAÇÃO] ---
        // Troquei 'btn-primary' por 'btn-secondary' no botão 'edit'
        // para que ele tenha o mesmo estilo base do outro (sólido).
        scheduleHTML += `
            <div class="availability-footer">
                <div class="timezone-info">
                    <i class="fas fa-globe"></i>
                    <span>${userTimezone.replace(/_/g, ' ')}</span>
                </div>
                <div class="footer-actions">
                    <button id="manage-exceptions-btn" class="btn-secondary">Gerenciar Exceções</button>
                    <button id="edit-availability-btn" class="btn-secondary">Editar Disponibilidade</button>
                </div>
            </div>
        `;
        // --- [FIM DA MODIFICAÇÃO] ---

        contentContainer.innerHTML = scheduleHTML;
        
        contentContainer.querySelector('#edit-availability-btn').addEventListener('click', () => {
            renderEditSchedule(professional);
        });

        // Listener do botão de exceções
        contentContainer.querySelector('#manage-exceptions-btn').addEventListener('click', () => {
            // CORREÇÃO: Passamos o contentContainer, e não o mainContainer
            initExceptions(contentContainer, professional, () => renderReadOnlySchedule(professional));
        });

    } catch (error) {
        showError('Não foi possível carregar os horários.');
        contentContainer.innerHTML = `<p>Erro ao carregar horários.</p>`;
    }
}

function renderEditSchedule(professional) {
    const contentContainer = mainContainer.querySelector('#schedule-content');
    
    let scheduleHTML = `
        <div class="schedule-days-list"></div>
        <div class="availability-footer">
            <div class="time-format-selector">
                <span>Formato de Exibição:</span>
                <label><input type="radio" name="time-format" value="12h" ${timeFormat === '12h' ? 'checked' : ''}> 12h (AM/PM)</label>
                <label><input type="radio" name="time-format" value="24h" ${timeFormat === '24h' ? 'checked' : ''}> 24h</label>
            </div>
            <button id="done-editing-btn" class="btn-submit">Concluir Edição</button>
        </div>
    `;
    contentContainer.innerHTML = scheduleHTML;

    contentContainer.querySelectorAll('input[name="time-format"]').forEach(radio => {
        radio.addEventListener('change', (event) => {
            timeFormat = event.target.value;
            localStorage.setItem('timeFormat', timeFormat);
            updateAllTimeDisplays();
        });
    });

    contentContainer.querySelector('#done-editing-btn').addEventListener('click', () => renderReadOnlySchedule(professional));
    
    const listContainer = contentContainer.querySelector('.schedule-days-list');
    
    // const displayDaysOrder = [1, 2, 3, 4, 5, 6, 0]; // (Movido para o topo)

    displayDaysOrder.forEach(dayIndex => {
        const dayRow = document.createElement('div');
        dayRow.className = 'day-row';
        dayRow.dataset.day = dayIndex;
        
        // --- [INÍCIO DA MODIFICAÇÃO] ---
        // 1. Removida a classe 'action-btn' do botão de cópia
        // 2. Adicionado 'style="display: none;"' para ocultá-lo por padrão
        dayRow.innerHTML = `
            <div class="day-label">
                <label class="toggle-switch">
                    <input type="checkbox" class="day-toggle">
                    <span class="slider"></span>
                </label>
                <span>${daysOfWeek[dayIndex]}</span>
                <button class="copy-day-btn" title="Copiar horários deste dia" style="display: none;">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            <div class="intervals-section" style="display: none;">
                <div class="intervals-container">
                    <div class="no-intervals-message">
                        <span>Indisponível</span>
                        <button class="action-btn add-interval-btn" title="Adicionar horário"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            </div>
        `;
        // --- [FIM DA MODIFICAÇÃO] ---
        
        listContainer.appendChild(dayRow);
    });

    attachDayRowListeners();
    loadAndDisplayIntervalsForEdit(professional.id);
}

function attachDayRowListeners() {
    mainContainer.querySelectorAll('.day-row').forEach(dayRow => {
        const toggle = dayRow.querySelector('.day-toggle');
        const intervalsSection = dayRow.querySelector('.intervals-section');
        const copyBtn = dayRow.querySelector('.copy-day-btn'); // <-- [NOVO] Pega o botão de cópia

        toggle.addEventListener('change', () => {
            const isEnabled = toggle.checked;
            intervalsSection.style.display = isEnabled ? 'flex' : 'none';
            copyBtn.style.display = isEnabled ? 'inline-block' : 'none'; // <-- [NOVO] Mostra/Esconde o botão

            if (isEnabled && intervalsSection.querySelector('.interval-row') === null) {
                addIntervalRow(intervalsSection.querySelector('.intervals-container'));
            } else if (!isEnabled) {
                const intervals = intervalsSection.querySelectorAll('.interval-row[data-id]');
                if (intervals.length > 0 && confirm('Desativar este dia irá remover todos os horários salvos. Deseja continuar?')) {
                    intervals.forEach(row => deleteInterval(row.dataset.id, false));
                }
            }
        });
        
        dayRow.querySelector('.add-interval-btn').addEventListener('click', handleAddIntervalClick);
        
        dayRow.querySelector('.copy-day-btn').addEventListener('click', () => {
            openCopyModal(dayRow);
        });
    });
}

function handleAddIntervalClick(event) {
    const intervalsContainer = event.currentTarget.closest('.intervals-container');
    addIntervalRow(intervalsContainer);
}

async function loadAndDisplayIntervalsForEdit(professionalId) {
    try {
        const availabilities = await api.request(`/availabilities?professional_id=${professionalId}`);
        
        availabilities.forEach(avail => {
            const dayIndex = jsDayMap[avail.day_of_week];
            const dayRow = mainContainer.querySelector(`.day-row[data-day="${dayIndex}"]`);
            if (dayRow) {
                dayRow.querySelector('.day-toggle').checked = true;
                dayRow.querySelector('.intervals-section').style.display = 'flex';
                // --- [NOVO] Mostra o botão de cópia se o dia já vier carregado como "ligado" ---
                dayRow.querySelector('.copy-day-btn').style.display = 'inline-block';
                
                const intervalsContainer = dayRow.querySelector('.intervals-container');
                addIntervalRow(intervalsContainer, avail);
            }
        });
        
        updateAllTimeDisplays();

    } catch (error) {
        showError("Não foi possível carregar as disponibilidades para edição.");
    }
}

function addIntervalRow(intervalsContainer, interval = null) {
    const noIntervalsMsg = intervalsContainer.querySelector('.no-intervals-message');
    if (noIntervalsMsg) noIntervalsMsg.remove();
    
    const intervalRow = document.createElement('div');
    intervalRow.className = 'interval-row';
    
    if(interval) intervalRow.dataset.id = interval.id;

    intervalRow.innerHTML = `
        <input type="time" class="start-time-input" value="${interval ? interval.start_time.slice(0, 5) : '09:00'}">
        <span>-</span>
        <input type="time" class="end-time-input" value="${interval ? interval.end_time.slice(0, 5) : '10:00'}">
        <button class="action-btn add-interval-btn" title="Adicionar outro horário"><i class="fas fa-plus"></i></button>
        <button class="action-btn delete-interval-btn" title="Excluir horário"><i class="fas fa-trash-alt"></i></button>
    `;
    intervalsContainer.appendChild(intervalRow);

    const startTimeInput = intervalRow.querySelector('.start-time-input');
    const endTimeInput = intervalRow.querySelector('.end-time-input');
    
    startTimeInput.addEventListener('input', () => {
        const startTime = startTimeInput.value;
        if (startTime) {
            const [hour, minute] = startTime.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(hour, minute, 0, 0);
            startDate.setHours(startDate.getHours() + 1);

            const newEndHour = String(startDate.getHours()).padStart(2, '0');
            const newEndMinute = String(startDate.getMinutes()).padStart(2, '0');
            
            endTimeInput.value = `${newEndHour}:${newEndMinute}`;
        }
        updateAllTimeDisplays();
    });
    
    endTimeInput.addEventListener('input', updateAllTimeDisplays);

    intervalRow.querySelector('.add-interval-btn').addEventListener('click', handleAddIntervalClick);
    intervalRow.querySelector('.delete-interval-btn').addEventListener('click', () => {
        const intervalId = intervalRow.dataset.id;
        if (intervalId) {
            deleteInterval(intervalId);
        } else {
            intervalRow.remove();
        }
    });

    const inputs = intervalRow.querySelectorAll('input[type="time"]');
    inputs.forEach(input => input.addEventListener('blur', async (e) => {
        const currentRow = e.target.closest('.interval-row');
        let intervalId = currentRow.dataset.id;
        const day = currentRow.closest('.day-row').dataset.day;
        const startTime = currentRow.querySelector('.start-time-input').value;
        const endTime = currentRow.querySelector('.end-time-input').value;
        
        if (!startTime || !endTime || endTime <= startTime) {
            if (intervalId) showError('Intervalo inválido. A alteração não foi salva.');
            return;
        }
        
        try {
            if (intervalId) {
                await api.request(`/availabilities/${intervalId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ start_time: startTime, end_time: endTime })
                });
                showSuccess('Horário atualizado!');
            } else {
                const newInterval = await api.request('/availabilities', {
                    method: 'POST',
                    body: JSON.stringify({
                        professional_id: currentProfessional.id,
                        day_of_week: dbDayMap[day],
                        start_time: startTime,
                        end_time: endTime
                    })
                });
                currentRow.dataset.id = newInterval.id;
                showSuccess('Horário salvo!');
            }
        } catch (error) {
            showError('Não foi possível salvar o horário.');
        }
    }));
    
    if (!interval) {
        startTimeInput.focus();
        startTimeInput.dispatchEvent(new Event('input'));
    }
    
    updateAllTimeDisplays();
}

async function deleteInterval(availabilityId, showConfirm = true) {
    const proceed = showConfirm ? confirm('Tem certeza que deseja remover este horário?') : true;
    if (proceed) {
        try {
            await api.request(`/availabilities/${availabilityId}`, { method: 'DELETE' });
            const rowToDelete = mainContainer.querySelector(`.interval-row[data-id="${availabilityId}"]`);
            if (rowToDelete) {
                const container = rowToDelete.parentElement;
                rowToDelete.remove();
                if (container.children.length === 0) {
                    container.innerHTML = `
                        <div class="no-intervals-message">
                            <span>Indisponível</span>
                            <button class="action-btn add-interval-btn" title="Adicionar horário"><i class="fas fa-plus"></i></button>
                        </div>`;
                    container.querySelector('.add-interval-btn').addEventListener('click', handleAddIntervalClick);
                }
            }
            if(showConfirm) showSuccess("Horário removido!");
        } catch (error) {
            showError("Não foi possível remover o horário.");
        }
    }
}


// --- [INÍCIO DO CÓDIGO RESTAURADO] ---
/**
 * Abre o modal (pop-up) para copiar horários
 * @param {HTMLElement} dayRow - O elemento .day-row do dia de origem
 */
function openCopyModal(dayRow) {
    const sourceDayIndexJS = parseInt(dayRow.dataset.day, 10);
    const sourceDayName = daysOfWeek[sourceDayIndexJS];

    // Cria o fundo do modal
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'copy-modal-overlay';

    // Cria o conteúdo do modal
    const modalContent = document.createElement('div');
    modalContent.className = 'copy-modal-content';

    let checkboxesHTML = '';
    // Itera na ordem de exibição (Seg, Ter, Qua...)
    displayDaysOrder.forEach(dayIndexJS => {
        // Não mostra o dia de origem na lista de alvos
        if (dayIndexJS === sourceDayIndexJS) return; 

        checkboxesHTML += `
            <label class="copy-modal-day-label">
                <input type="checkbox" class="copy-modal-checkbox" data-day-index="${dayIndexJS}">
                <span>${daysOfWeek[dayIndexJS]}</span>
            </label>
        `;
    });

    modalContent.innerHTML = `
        <div class="copy-modal-header">
            <h4>Copiar horários de ${sourceDayName}</h4>
            <button class="copy-modal-close" title="Fechar">&times;</button>
        </div>
        <div class="copy-modal-body">
            <p>Selecione os dias de destino. Os horários existentes nestes dias serão substituídos.</p>
            <div class="copy-modal-checklist">
                ${checkboxesHTML}
            </div>
            <label class="copy-modal-day-label all">
                <input type="checkbox" id="copy-modal-check-all">
                <span>Marcar Todos</span>
            </label>
        </div>
        <div class="copy-modal-footer">
            <button class="btn-secondary" id="copy-modal-cancel">Cancelar</button>
            <button class="btn-submit" id="copy-modal-confirm">Confirmar Cópia</button>
        </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Adiciona listeners (ouvintes de eventos)
    const checkAll = modalContent.querySelector('#copy-modal-check-all');
    const allCheckboxes = modalContent.querySelectorAll('.copy-modal-checkbox');
    
    checkAll.addEventListener('change', () => {
        allCheckboxes.forEach(cb => cb.checked = checkAll.checked);
    });

    modalContent.querySelector('#copy-modal-confirm').addEventListener('click', () => {
        handleConfirmCopy(sourceDayIndexJS, sourceDayName, modalOverlay);
    });

    const closeModal = () => document.body.removeChild(modalOverlay);
    modalContent.querySelector('.copy-modal-close').addEventListener('click', closeModal);
    modalContent.querySelector('#copy-modal-cancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
}

/**
 * Executa a chamada de API para copiar os horários em lote
 * @param {number} sourceDayIndexJS - O dia de origem (formato JS 0-6)
 * @param {string} sourceDayName - O nome do dia de origem
 * @param {HTMLElement} modalElement - O elemento do modal para fechar
 */
async function handleConfirmCopy(sourceDayIndexJS, sourceDayName, modalElement) {
    const confirmButton = modalElement.querySelector('#copy-modal-confirm');
    confirmButton.disabled = true;
    confirmButton.textContent = 'Copiando...';

    // 1. Converte o dia de origem para o formato do BD
    const source_day_of_week = dbDayMap[sourceDayIndexJS];

    // 2. Pega todos os dias de destino selecionados e converte para o formato do BD
    const target_days_of_week = Array.from(modalElement.querySelectorAll('.copy-modal-checkbox:checked'))
        .map(cb => dbDayMap[parseInt(cb.dataset.dayIndex, 10)]);

    if (target_days_of_week.length === 0) {
        showError("Nenhum dia de destino foi selecionado.");
        confirmButton.disabled = false;
        confirmButton.textContent = 'Confirmar Cópia';
        return;
    }

    try {
        // 3. Chama a nova rota do backend (criada no server.js)
        await api.request('/availabilities/batch-copy', {
            method: 'POST',
            body: JSON.stringify({
                professional_id: currentProfessional.id,
                source_day_of_week: source_day_of_week,
                target_days_of_week: target_days_of_week
            })
        });

        showSuccess(`Horários de ${sourceDayName} copiados com sucesso!`);
        document.body.removeChild(modalElement);
        
        // 4. Recarrega a tela de edição para mostrar os novos horários
        renderEditSchedule(currentProfessional);

    } catch (error) {
        showError("Não foi possível copiar os horários.");
        confirmButton.disabled = false;
        confirmButton.textContent = 'Confirmar Cópia';
    }
}
// --- [FIM DO CÓDIGO RESTAURADO] ---


/**
 * [MODIFICADO] Renomeado para 'injectCustomStyles'
 * Injeta o CSS necessário para o modal de cópia E para os botões.
 */
function injectCustomStyles() { // [MODIFICADO] Nome da função
    if (document.getElementById('custom-availability-styles')) return; // [MODIFICADO] ID

    const style = document.createElement('style');
    style.id = 'custom-availability-styles'; // [MODIFICADO] ID
    
    // --- [INÍCIO DA MODIFICAÇÃO] ---
    // Adicionadas regras de CSS para os botões #edit-availability-btn (Azul)
    // e #manage-exceptions-btn (Amarelo).
    style.innerHTML = `
        /* --- [NOVO] Alinhamento dos Dias de Edição --- */
        .schedule-days-list .day-row {
            display: flex;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding: 10px 0;
            min-height: 50px; /* Garante altura mínima mesmo se desabilitado */
        }
        .schedule-days-list .day-label {
            flex: 0 0 220px; /* Largura fixa para a coluna do nome/toggle */
            display: flex;
            align-items: center;
            gap: 10px; /* Espaço entre toggle, nome e botão de cópia */
            padding-left: 5px; /* Pequeno recuo */
        }
        .schedule-days-list .intervals-section {
            flex: 1; /* Ocupa o resto do espaço */
        }

        /* --- [NOVO] Estilo do Botão Copiar (limpo) --- */
        .day-label .copy-day-btn {
            background: none;
            border: none;
            color: var(--text-secondary); /* Cor sutil */
            cursor: pointer;
            padding: 5px;
            border-radius: 4px;
            opacity: 0.6;
            transition: all 0.2s ease;
        }
        .day-label .copy-day-btn:hover {
            opacity: 1;
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        /* --- [NOVO] Cores dos Botões de Disponibilidade --- */
        
        /* Botão Amarelo (Gerenciar Exceções) */
        #manage-exceptions-btn {
            background-color: #ffc107 !important; 
            border-color: #ffc107 !important;
            color: #212529 !important; /* Texto escuro para contraste */
        }
        #manage-exceptions-btn:hover {
            background-color: #e0a800 !important;
            border-color: #e0a800 !important;
        }

        /* Botão Azul Vívido (Editar Disponibilidade) */
        #edit-availability-btn {
            background-color: #007bff !important; 
            border-color: #007bff !important;
            color: #FFFFFF !important; /* Texto branco */
        }
        #edit-availability-btn:hover {
            background-color: #0056b3 !important;
            border-color: #0056b3 !important;
        }

        /* --- Estilos do Modal de Cópia (v5 - Definitiva) --- */
        .copy-modal-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7); 
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        /* TEMA CLARO (Padrão) */
        .copy-modal-content {
            background: #FFFFFF; 
            border: 1px solid #E2E8F0; 
            color: #1A202C; 
            border-radius: 8px;
            padding: 20px;
            width: 90%;
            max-width: 450px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }
        .copy-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 15px; }
        .copy-modal-header h4 { margin: 0; color: #1A202C; }
        .copy-modal-close { background: none; border: none; font-size: 1.5rem; color: #718096; cursor: pointer; }
        .copy-modal-body p { font-size: 0.9rem; color: #4A5568; margin-bottom: 15px; }
        .copy-modal-checklist { display: block; margin-bottom: 15px; }
        .copy-modal-day-label { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border-radius: 4px; color: #2D3748; }
        .copy-modal-day-label:hover { background: #F7FAFC; }
        .copy-modal-day-label.all { border-top: 1px solid #E2E8F0; padding-top: 15px; }
        .copy-modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        
        /* TEMA ESCURO (Baseado na classe .dark-mode do seu script.js) */
        body.dark-mode .copy-modal-content { background: #1A202C; border: 1px solid #4A5568; color: #E2E8F0; }
        body.dark-mode .copy-modal-header { border-bottom: 1px solid #4A5568; }
        body.dark-mode .copy-modal-header h4 { color: #E2E8F0; }
        body.dark-mode .copy-modal-close { color: #A0AEC0; }
        body.dark-mode .copy-modal-body p { color: #A0AEC0; }
        body.dark-mode .copy-modal-day-label { color: #CBD5E0; }
        body.dark-mode .copy-modal-day-label:hover { background: #2D3748; }
        body.dark-mode .copy-modal-day-label.all { border-top: 1px solid #4A5568; }
        
        .day-label .copy-day-btn {
            margin-left: 10px;
            opacity: 0.5;
            transition: opacity 0.2s ease;
        }
        .day-label:hover .copy-day-btn {
            opacity: 1;
        }
    `;
    // --- [FIM DA MODIFICAÇÃO] ---
    
    document.head.appendChild(style);
}