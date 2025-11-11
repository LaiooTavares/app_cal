// FILE: frontend/src/views/calendar/timeline.js
let timelineTimer = null;

// Limpa o timer do indicador de hora atual para evitar vazamentos de memória.
function cleanupTimeline() {
    if (timelineTimer) {
        clearInterval(timelineTimer);
        timelineTimer = null;
    }
}

// Desenha e atualiza a posição do indicador de hora atual.
function drawCurrentTimeIndicator(gridArea, settings) {
    if (timelineTimer) clearInterval(timelineTimer);
    
    const pixelsPerMinute = settings.hourWidth / 60;
    
    let indicator = gridArea.querySelector('.current-time-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'current-time-indicator';
        gridArea.appendChild(indicator);
    }
    
    const updatePosition = () => {
        const now = new Date();
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const position = totalMinutes * pixelsPerMinute;
        indicator.style.left = `${position}px`;
    };
    
    updatePosition();
    timelineTimer = setInterval(updatePosition, 60000); // Atualiza a cada minuto
}

// Processa a sobreposição de eventos para um ÚNICO profissional.
function processEventOverlapsForProfessional(events, hourWidth) {
    const pixelsPerMinute = hourWidth / 60;
    const laneHeight = 35; // Altura de cada barra de evento
    const laneGap = 4;     // Espaço entre as barras

    const sortedEvents = events.map(event => {
        const startDate = new Date(event.start_time);
        const endDate = new Date(event.end_time);
        const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
        const durationInMinutes = Math.max(15, (endDate.getTime() - startDate.getTime()) / 60000); // Duração mínima de 15 min
        
        return {
            ...event,
            startMinutes,
            endMinutes: startMinutes + durationInMinutes,
            left: startMinutes * pixelsPerMinute,
            width: durationInMinutes * pixelsPerMinute
        };
    }).sort((a, b) => a.startMinutes - b.startMinutes);

    const lanes = []; // Controla o final de cada "pista" de sobreposição
    sortedEvents.forEach(event => {
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] <= event.startMinutes) {
                lanes[i] = event.endMinutes;
                event.laneIndex = i;
                placed = true;
                break;
            }
        }
        if (!placed) {
            event.laneIndex = lanes.length;
            lanes.push(event.endMinutes);
        }
        event.top = event.laneIndex * (laneHeight + laneGap);
    });

    return sortedEvents;
}


// ### FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO - TOTALMENTE REFEITA ###
export function renderTimeline(container, date, events, onBack, onAddEvent) {
    cleanupTimeline();
    container.innerHTML = ''; // Limpa o conteúdo anterior

    const settings = {
        hourWidth: window.innerWidth < 768 ? 100 : 120, // Largura de cada hora no grid
        professionalRowHeight: 80, // Altura da "pista" de cada profissional
    };

    // 1. Cria o cabeçalho da timeline
    const header = document.createElement('header');
    header.className = 'timeline-header';
    const dateTitle = document.createElement('h2');
    dateTitle.textContent = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const backButton = document.createElement('button');
    backButton.className = 'timeline-back-btn';
    backButton.innerHTML = `<i class="fas fa-arrow-left"></i> Voltar`;
    backButton.onclick = onBack;
    header.appendChild(dateTitle);
    header.appendChild(backButton);
    container.appendChild(header);

    // 2. Agrupa eventos por profissional
    const eventsByProfessional = events.reduce((acc, event) => {
        const profId = event.professional_id;
        if (!acc[profId]) {
            acc[profId] = {
                id: profId,
                name: event.professional_name,
                color: event.professional_color,
                events: []
            };
        }
        acc[profId].events.push(event);
        return acc;
    }, {});
    const professionals = Object.values(eventsByProfessional);
    // Ordena os profissionais por nome para uma exibição consistente
    professionals.sort((a, b) => a.name.localeCompare(b.name));

    // 3. Cria a estrutura principal do layout horizontal
    const layout = document.createElement('div');
    layout.className = 'timeline-horizontal-layout';

    // Coluna da Esquerda: Nomes dos Profissionais
    const professionalsColumn = document.createElement('div');
    professionalsColumn.className = 'professionals-column';

    // Coluna da Direita: Grid de Horários e Eventos
    const scheduleColumn = document.createElement('div');
    scheduleColumn.className = 'schedule-column';

    // Cabeçalho dos horários (00:00, 01:00, ...)
    const hoursHeader = document.createElement('div');
    hoursHeader.className = 'timeline-hours-header';
    scheduleColumn.appendChild(hoursHeader);
    
    // Área principal onde as "pistas" dos profissionais e eventos ficarão
    const scheduleGrid = document.createElement('div');
    scheduleGrid.className = 'schedule-grid';
    scheduleColumn.appendChild(scheduleGrid);

    // 4. Desenha o cabeçalho dos horários e as linhas verticais do grid
    for (let i = 0; i < 24; i++) {
        const hourLabel = document.createElement('div');
        hourLabel.className = 'hour-label';
        hourLabel.style.minWidth = `${settings.hourWidth}px`;
        hourLabel.textContent = `${String(i).padStart(2, '0')}:00`;
        hoursHeader.appendChild(hourLabel);

        const gridLine = document.createElement('div');
        gridLine.className = 'timeline-grid-line-vertical';
        gridLine.style.left = `${i * settings.hourWidth}px`;
        scheduleGrid.appendChild(gridLine);
    }
    
    // 5. Renderiza a "pista" para cada profissional
    if (professionals.length > 0) {
        professionals.forEach(prof => {
            // Adiciona o nome do profissional na coluna da esquerda
            const profLabel = document.createElement('div');
            profLabel.className = 'professional-label';
            profLabel.style.height = `${settings.professionalRowHeight}px`;
            profLabel.innerHTML = `<span>${prof.name}</span>`;
            professionalsColumn.appendChild(profLabel);

            // Cria a "pista" (linha) para o profissional no grid da direita
            const professionalRow = document.createElement('div');
            professionalRow.className = 'professional-row';
            professionalRow.style.height = `${settings.professionalRowHeight}px`;

            // Processa e posiciona os eventos deste profissional
            const processedEvents = processEventOverlapsForProfessional(prof.events, settings.hourWidth);
            processedEvents.forEach(event => {
                const eventBlock = document.createElement('div');
                eventBlock.className = 'timeline-event';
                eventBlock.style.left = `${event.left}px`;
                eventBlock.style.width = `${event.width}px`;
                eventBlock.style.top = `${event.top}px`;
                eventBlock.style.backgroundColor = prof.color || 'var(--primary-color)';
                
                const timeFormat = { hour: '2-digit', minute: '2-digit' };
                eventBlock.title = `${event.client_name}\n${new Date(event.start_time).toLocaleTimeString('pt-BR', timeFormat)} - ${new Date(event.end_time).toLocaleTimeString('pt-BR', timeFormat)}`;
                eventBlock.innerHTML = `<strong>${event.client_name}</strong>`;
                eventBlock.addEventListener('click', () => {
                    window.location.hash = `event-details?id=${event.id}`;
                });
                
                professionalRow.appendChild(eventBlock);
            });

            scheduleGrid.appendChild(professionalRow);
        });
    } else {
        scheduleGrid.innerHTML = `<p class="empty-timeline-message">Nenhum evento agendado para este dia.</p>`;
    }

    // 6. Adiciona o indicador de hora atual
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        drawCurrentTimeIndicator(scheduleGrid, settings);
    }

    // Monta o layout final
    layout.appendChild(professionalsColumn);
    layout.appendChild(scheduleColumn);
    container.appendChild(layout);

    // Adiciona o botão flutuante de "Adicionar"
    const addEventButton = document.createElement('button');
    addEventButton.className = 'timeline-fab-add';
    addEventButton.title = 'Criar Novo Evento';
    addEventButton.innerHTML = `<i class="fas fa-plus"></i>`;
    addEventButton.type = 'button';
    addEventButton.addEventListener('click', () => {
        window.location.hash = 'events?action=add';
    });
    container.appendChild(addEventButton);
}