/* FILE: frontend/src/js/availability.js */

const API_BASE_URL_AVAILABILITY = 'http://localhost:3000';

// Função auxiliar central para chamadas de API
async function apiFetchAvailability(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    // Adicionada verificação de token para redirecionamento
    if (!token) {
        alert("Sua sessão expirou. Por favor, faça login novamente.");
        window.location.href = 'login.html';
        throw new Error("Token de autenticação não encontrado.");
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    const response = await fetch(`${API_BASE_URL_AVAILABILITY}${endpoint}`, { ...options, headers });
    if (!response.ok) {
        const errorData = await response.json();
        alert(`Erro: ${errorData.message}`);
        throw new Error(errorData.message);
    }
    if (response.status === 204) return;
    return response.json();
}

// Função principal que inicia a view de Disponibilidade
async function initializeAvailabilityView() {
    renderProfessionalSelector();
}

// Renderiza a tela de seleção de profissionais
async function renderProfessionalSelector() {
    const container = document.getElementById('availability-container');
    container.innerHTML = '<h2>Selecione um Profissional</h2><p>Carregando...</p>';

    try {
        const professionals = await apiFetchAvailability('/api/professionals');
        
        let content = `
            <div class="professional-selector-container">
                <h2>Selecione um Profissional</h2>
                <div class="professionals-grid"></div>
            </div>`;
        container.innerHTML = content;

        const grid = container.querySelector('.professionals-grid');
        if (professionals.length === 0) {
            grid.innerHTML = '<p>Nenhum profissional cadastrado. Por favor, cadastre um profissional primeiro.</p>';
            return;
        }

        professionals.forEach(prof => {
            const card = document.createElement('div');
            card.className = 'professional-select-card';
            card.innerHTML = `
                <i class="fas fa-user-tie"></i>
                <h3>${prof.name}</h3>
                <p>${prof.specialties || 'Sem especialidade'}</p>
            `;
            card.addEventListener('click', () => renderAvailabilitySchedule(prof));
            grid.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = '<h2>Erro ao carregar profissionais</h2><p>Verifique se você está logado e se o servidor está online.</p>';
    }
}

// Renderiza a grade de horários para um profissional selecionado
async function renderAvailabilitySchedule(professional) {
    const container = document.getElementById('availability-container');
    const daysOfWeek = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    
    let scheduleHTML = `
        <div class="availability-schedule-container">
            <div class="schedule-header">
                <button class="back-to-professionals-btn" title="Voltar"><i class="fas fa-arrow-left"></i></button>
                <h2>Disponibilidade de ${professional.name}</h2>
            </div>
            <div class="schedule-grid">
    `;

    for (let i = 0; i < 7; i++) {
        scheduleHTML += `
            <div class="day-schedule" data-day="${i}">
                <div class="day-header">
                    <h4>${daysOfWeek[i]}</h4>
                    <button class="add-interval-btn"><i class="fas fa-plus"></i> Adicionar</button>
                </div>
                <div class="time-intervals-list"></div>
                <div class="add-interval-form hidden">
                    <input type="time" class="start-time-input">
                    <span>-</span>
                    <input type="time" class="end-time-input">
                    <button class="save-interval-btn btn-submit">Salvar</button>
                    <button class="cancel-interval-btn btn-secondary">Cancelar</button>
                </div>
            </div>
        `;
    }
    scheduleHTML += '</div></div>';
    container.innerHTML = scheduleHTML;
    
    container.querySelector('.back-to-professionals-btn').addEventListener('click', renderProfessionalSelector);
    document.querySelectorAll('.add-interval-btn').forEach(btn => btn.addEventListener('click', showAddIntervalForm));
    document.querySelectorAll('.cancel-interval-btn').forEach(btn => btn.addEventListener('click', hideAddIntervalForm));
    document.querySelectorAll('.save-interval-btn').forEach(btn => btn.addEventListener('click', (event) => saveNewInterval(professional.id, event)));

    loadAndDisplayIntervals(professional.id);
}

async function loadAndDisplayIntervals(professionalId) {
    try {
        const availabilities = await apiFetchAvailability(`/api/availabilities?professional_id=${professionalId}`);
        document.querySelectorAll('.time-intervals-list').forEach(list => list.innerHTML = '');

        availabilities.forEach(avail => {
            const list = document.querySelector(`.day-schedule[data-day="${avail.day_of_week}"] .time-intervals-list`);
            const intervalDiv = document.createElement('div');
            intervalDiv.className = 'time-interval';
            intervalDiv.innerHTML = `
                <span>${avail.start_time.slice(0, 5)} - ${avail.end_time.slice(0, 5)}</span>
                <button class="delete-interval-btn" data-id="${avail.id}"><i class="fas fa-trash-alt"></i></button>
            `;
            list.appendChild(intervalDiv);
        });
        
        document.querySelectorAll('.delete-interval-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteInterval(btn.dataset.id, professionalId));
        });

    } catch (error) {
        console.error("Erro ao carregar disponibilidades:", error);
    }
}

function showAddIntervalForm(event) {
    const daySchedule = event.target.closest('.day-schedule');
    daySchedule.querySelector('.add-interval-form').classList.remove('hidden');
}

function hideAddIntervalForm(event) {
    const daySchedule = event.target.closest('.day-schedule');
    daySchedule.querySelector('.add-interval-form').classList.add('hidden');
}

async function saveNewInterval(professionalId, event) {
    const daySchedule = event.target.closest('.day-schedule');
    const dayOfWeek = daySchedule.dataset.day;
    const startTime = daySchedule.querySelector('.start-time-input').value;
    const endTime = daySchedule.querySelector('.end-time-input').value;

    if (!startTime || !endTime || endTime <= startTime) {
        alert('Por favor, insira um intervalo de tempo válido.');
        return;
    }

    try {
        await apiFetchAvailability('/api/availabilities', {
            method: 'POST',
            body: JSON.stringify({
                professional_id: professionalId,
                day_of_week: parseInt(dayOfWeek, 10),
                start_time: startTime,
                end_time: endTime
            })
        });
        daySchedule.querySelector('.add-interval-form').classList.add('hidden');
        loadAndDisplayIntervals(professionalId);
    } catch (error) {
        console.error("Erro ao salvar intervalo:", error);
    }
}

async function deleteInterval(availabilityId, professionalId) {
    if (confirm('Tem certeza que deseja remover este horário?')) {
        try {
            await apiFetchAvailability(`/api/availabilities/${availabilityId}`, { method: 'DELETE' });
            loadAndDisplayIntervals(professionalId);
        } catch (error) {
            console.error("Erro ao deletar intervalo:", error);
        }
    }
}