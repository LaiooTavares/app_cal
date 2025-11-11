// frontend/src/views/exceptions/exceptions.js
import { api } from '../../js/script.js';
import { showSuccess, showError } from '../../js/utils/toaster.js';

let contentContainer = null;
let currentProfessional = null;
let onBackCallback = null;
let currentDate = new Date();
let exceptionsData = [];
let weeklyAvailabilityDays = new Set(); // NOVO: Para guardar os dias da semana que o profissional trabalha
let selectedDate = null;

async function fetchWeeklyAvailability() {
    try {
        const weeklySchedule = await api.request(`/availabilities?professional_id=${currentProfessional.id}`);
        // Mapeia os dias da semana (ex: 1 para Seg, 2 para Ter) para o Set
        weeklyAvailabilityDays = new Set(weeklySchedule.map(a => a.day_of_week));
    } catch (error) {
        showError("Não foi possível carregar a agenda semanal padrão.");
        weeklyAvailabilityDays = new Set();
    }
}

export async function init(container, professional, onBack) {
    contentContainer = container;
    currentProfessional = professional;
    onBackCallback = onBack;

    let exceptionsHTML = `
        <div id="exceptions-content">
            <div class="exceptions-header">
                <h3>Gerenciar Exceções de Disponibilidade</h3>
                <button id="back-to-availability-btn" class="btn-secondary"><i class="fas fa-arrow-left"></i> Voltar</button>
            </div>
            <div class="exceptions-body">
                <div class="calendar-container-exceptions">
                    <div class="calendar-header">
                        <button id="exceptions-prev-month"><i class="fas fa-chevron-left"></i></button>
                        <h4 id="exceptions-month-year"></h4>
                        <button id="exceptions-next-month"><i class="fas fa-chevron-right"></i></button>
                    </div>
                    <div class="calendar-grid-header">
                        <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                    </div>
                    <div id="exceptions-calendar-days" class="calendar-grid-days"></div>
                </div>
                <div id="date-details-container" class="date-details-container">
                    <p>Selecione uma data no calendário para gerenciar.</p>
                </div>
            </div>
        </div>
    `;
    contentContainer.innerHTML = exceptionsHTML;

    contentContainer.querySelector('#back-to-availability-btn').addEventListener('click', onBackCallback);
    contentContainer.querySelector('#exceptions-prev-month').addEventListener('click', () => changeMonth(-1));
    contentContainer.querySelector('#exceptions-next-month').addEventListener('click', () => changeMonth(1));

    await fetchExceptions();
    await fetchWeeklyAvailability(); // NOVO: Chamada para buscar a agenda semanal
    renderCalendar();
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

async function fetchExceptions() {
    try {
        exceptionsData = await api.request(`/availability-exceptions?professional_id=${currentProfessional.id}`);
    } catch (error) {
        showError("Não foi possível carregar as exceções existentes.");
        exceptionsData = [];
    }
}

function renderCalendar() {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    
    const monthYearEl = contentContainer.querySelector('#exceptions-month-year');
    monthYearEl.textContent = `${new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(currentDate)} ${year}`;

    const calendarDaysEl = contentContainer.querySelector('#exceptions-calendar-days');
    calendarDaysEl.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        calendarDaysEl.innerHTML += `<div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.textContent = day;
        dayEl.classList.add('calendar-day');

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // --- LÓGICA ATUALIZADA ---
        const dayDate = new Date(year, month, day);
        const dayOfWeekJS = dayDate.getDay(); // JS: 0 (Dom) a 6 (Sáb)
        const dayOfWeekDB = dayOfWeekJS === 0 ? 7 : dayOfWeekJS; // Converte para o padrão do DB: 1 (Seg) a 7 (Dom)

        // Adiciona a marca se for um dia de trabalho padrão
        if (weeklyAvailabilityDays.has(dayOfWeekDB)) {
            dayEl.classList.add('is-workday');
        }
        
        // Adiciona a marca se já existir uma exceção cadastrada para o dia
        if (exceptionsData.some(ex => ex.exception_date.startsWith(dateStr))) {
            dayEl.classList.add('has-exception');
        }
        // --- FIM DA LÓGICA ATUALIZADA ---

        if (selectedDate === dateStr) {
            dayEl.classList.add('selected');
        }
        
        dayEl.addEventListener('click', () => {
            selectedDate = dateStr;
            // Limpa a seleção anterior antes de adicionar a nova
            const previouslySelected = calendarDaysEl.querySelector('.calendar-day.selected');
            if (previouslySelected) {
                previouslySelected.classList.remove('selected');
            }
            dayEl.classList.add('selected');
            renderDateDetails(dateStr);
        });
        calendarDaysEl.appendChild(dayEl);
    }
}

function renderDateDetails(dateStr) {
    const detailsContainer = contentContainer.querySelector('#date-details-container');
    const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    const dateExceptions = exceptionsData.filter(ex => ex.exception_date.startsWith(dateStr));
    const isDayBlocked = dateExceptions.some(ex => ex.start_time === null && ex.end_time === null);

    let detailsHTML = `
        <h4>${formattedDate}</h4>
        <div class="day-block-toggle">
            <label class="toggle-switch">
                <input type="checkbox" id="block-day-toggle" ${isDayBlocked ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
            <span>Bloquear o dia inteiro</span>
        </div>
        <div id="exception-intervals-section" style="${isDayBlocked ? 'display: none;' : 'display: block;'}">
            <p>Horários indisponíveis neste dia:</p>
            <div class="intervals-container"></div>
            <button class="btn-secondary add-exception-interval-btn"><i class="fas fa-plus"></i> Adicionar Horário</button>
        </div>
    `;
    detailsContainer.innerHTML = detailsHTML;

    const intervalsContainer = detailsContainer.querySelector('.intervals-container');
    const timeIntervals = dateExceptions.filter(ex => ex.start_time !== null);

    if (timeIntervals.length > 0) {
        timeIntervals.forEach(ex => addExceptionIntervalRow(intervalsContainer, ex));
    } else {
        intervalsContainer.innerHTML = `<p class="no-intervals-message">Nenhum horário bloqueado.</p>`;
    }

    detailsContainer.querySelector('#block-day-toggle').addEventListener('change', handleBlockDayToggle);
    detailsContainer.querySelector('.add-exception-interval-btn').addEventListener('click', () => {
        addExceptionIntervalRow(intervalsContainer);
    });
}

function addExceptionIntervalRow(container, exception = null) {
    container.querySelector('.no-intervals-message')?.remove();

    const row = document.createElement('div');
    row.className = 'interval-row';
    if (exception) row.dataset.id = exception.id;

    row.innerHTML = `
        <input type="time" class="start-time-input" value="${exception ? exception.start_time.slice(0,5) : '09:00'}">
        <span>-</span>
        <input type="time" class="end-time-input" value="${exception ? exception.end_time.slice(0,5) : '10:00'}">
        <button class="action-btn save-exception-btn" title="Salvar"><i class="fas fa-check"></i></button>
        <button class="action-btn delete-exception-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
    
    row.querySelector('.save-exception-btn').addEventListener('click', () => saveExceptionInterval(row));
    row.querySelector('.delete-exception-btn').addEventListener('click', () => deleteExceptionInterval(row));
}

async function handleBlockDayToggle(event) {
    const isBlocked = event.target.checked;
    const existingBlock = exceptionsData.find(ex => ex.exception_date.startsWith(selectedDate) && ex.start_time === null);

    try {
        if (isBlocked && !existingBlock) {
            const newBlock = await api.request('/availability-exceptions', {
                method: 'POST',
                body: JSON.stringify({
                    professional_id: currentProfessional.id,
                    exception_date: selectedDate,
                    start_time: null,
                    end_time: null,
                    block_day: true // [MODIFICADO] Enviando a flag
                })
            });
            exceptionsData.push(newBlock);
            showSuccess("Dia bloqueado com sucesso!");
        } else if (!isBlocked && existingBlock) {
            await api.request(`/availability-exceptions/${existingBlock.id}`, { method: 'DELETE' });
            exceptionsData = exceptionsData.filter(ex => ex.id !== existingBlock.id);
            showSuccess("Bloqueio do dia removido!");
        }
        await fetchExceptions(); // Re-busca para garantir consistência
        renderCalendar();
        renderDateDetails(selectedDate);
    } catch (error) {
        showError("Não foi possível atualizar o bloqueio do dia.");
        event.target.checked = !isBlocked;
    }
}

async function saveExceptionInterval(row) {
    const id = row.dataset.id;
    const startTime = row.querySelector('.start-time-input').value;
    const endTime = row.querySelector('.end-time-input').value;

    if (!startTime || !endTime || endTime <= startTime) {
        showError("Intervalo de horário inválido.");
        return;
    }

    try {
        if (id) {
             await api.request(`/availability-exceptions/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ start_time: startTime, end_time: endTime })
            });
        } else {
            const newException = await api.request('/availability-exceptions', {
                method: 'POST',
                body: JSON.stringify({
                    professional_id: currentProfessional.id,
                    exception_date: selectedDate,
                    start_time: startTime,
                    end_time: endTime,
                    block_day: false // [MODIFICADO] Enviando a flag
                })
            });
            row.dataset.id = newException.id;
        }
        showSuccess("Horário de exceção salvo!");
        await fetchExceptions();
        renderCalendar();
    } catch (error) {
        showError("Não foi possível salvar o horário de exceção.");
    }
}

async function deleteExceptionInterval(row) {
    const id = row.dataset.id;
    if (!id) {
        row.remove();
        return;
    }

    if (confirm("Tem certeza que deseja remover este bloqueio de horário?")) {
        try {
            await api.request(`/availability-exceptions/${id}`, { method: 'DELETE' });
            showSuccess("Bloqueio de horário removido.");
            row.remove();
            await fetchExceptions();
            renderCalendar();
        } catch (error) {
            showError("Não foi possível remover o bloqueio de horário.");
        }
    }
}