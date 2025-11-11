// frontend/src/views/booking/booking.js
import { api } from '../../js/script.js';
import { showError } from '../../js/utils/toaster.js';

let containerEl = null;
let currentProfessional = null;
let currentDate = new Date();
let monthlyAvailability = {};

const getHashParams = () => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    return Object.fromEntries(params.entries());
};

const renderCalendar = async () => {
    if (!currentProfessional || !containerEl) return;

    const monthYearEl = containerEl.querySelector('#booking-month-year');
    const calendarDaysEl = containerEl.querySelector('#booking-calendar-days');
    const slotsContainer = containerEl.querySelector('#booking-slots-container');

    calendarDaysEl.innerHTML = '<p style="text-align: center; grid-column: span 7;">Carregando...</p>';
    slotsContainer.innerHTML = '<p>Selecione um dia com horários disponíveis.</p>';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthYearEl.textContent = `${currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`;

    try {
        monthlyAvailability = await api.request(`/professionals/${currentProfessional.id}/public-availability?year=${year}&month=${month + 1}`);
    
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        calendarDaysEl.innerHTML = '';

        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarDaysEl.innerHTML += `<div class="day-cell"></div>`;
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const dateString = date.toISOString().split('T')[0];
            const hasAvailability = monthlyAvailability[dateString] && monthlyAvailability[dateString].length > 0;

            const dayCell = document.createElement('div');
            dayCell.className = 'day-cell';
            dayCell.innerHTML = `<span class="day-number ${!hasAvailability ? 'other-month' : ''}">${i}</span>`;
            
            if (hasAvailability) {
                const dayNumberEl = dayCell.querySelector('.day-number');
                dayNumberEl.classList.add('has-availability');
                dayCell.addEventListener('click', () => {
                    document.querySelectorAll('.day-number.selected').forEach(el => el.classList.remove('selected'));
                    dayNumberEl.classList.add('selected');
                    renderSlots(dateString);
                });
            }
            
            calendarDaysEl.appendChild(dayCell);
        }

    } catch (error) {
        showError('Não foi possível carregar o calendário.');
        calendarDaysEl.innerHTML = '<p style="color: red; text-align: center; grid-column: span 7;">Erro ao carregar.</p>';
    }
};

const renderSlots = (dateString) => {
    const slotsContainer = containerEl.querySelector('#booking-slots-container');
    const slots = monthlyAvailability[dateString] || [];
    const date = new Date(`${dateString}T12:00:00`);

    let slotsHTML = `
        <div class="slots-header">
            <h3>${date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit' })}</h3>
        </div>
        <div class="slots-list">
    `;

    if (slots.length > 0) {
        slots.sort();
        slots.forEach(slot => {
            slotsHTML += `<button class="slot-btn" data-time="${slot}" data-date="${dateString}">${slot}</button>`;
        });
    } else {
        slotsHTML += `<p>Nenhum horário disponível.</p>`;
    }

    slotsHTML += `</div>`;
    slotsContainer.innerHTML = slotsHTML;

    slotsContainer.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedSlot = {
                date: btn.dataset.date,
                time: btn.dataset.time
            };
            sessionStorage.setItem('selectedSlot', JSON.stringify(selectedSlot));

            const params = getHashParams();
            const returnUrl = params.returnTo || 'calendar';

            window.location.hash = returnUrl;
        });
    });
};

export async function init(container, params) {
    containerEl = container;
    currentDate = new Date();

    const professionalId = params.professionalId;
    if (!professionalId) {
        showError('Profissional não especificado.');
        window.location.hash = 'calendar';
        return;
    }

    try {
        currentProfessional = await api.request(`/professionals/${professionalId}`);
        containerEl.querySelector('#booking-tool-title').textContent = `Escolha um horário para ${currentProfessional.name}`;

        containerEl.querySelector('#booking-prev-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });

        containerEl.querySelector('#booking-next-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
        
        await renderCalendar();

    } catch (error) {
        showError('Não foi possível carregar os dados do profissional.');
    }
}