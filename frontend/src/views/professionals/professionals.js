// FILE: src/views/professionals/professionals.js
import { api } from '../../js/script.js';
import { showSuccess, showError } from '../../js/utils/toaster.js';

export async function init(container) {
    const listContainer = container.querySelector('#professionals-list');
    const formWrapper = container.querySelector('#form-wrapper');
    const addBtn = container.querySelector('#add-professional-btn');
    const cancelBtn = container.querySelector('#cancel-btn');
    const professionalForm = container.querySelector('#professional-form');
    const formTitle = container.querySelector('#form-title');
    const professionalIdInput = container.querySelector('#professional-id');
    const availabilityCheckbox = container.querySelector('#add-availability');
    const colorInput = container.querySelector('#professional-color');
    const colorTextInput = container.querySelector('#professional-color-text');

    // --- NOVOS ELEMENTOS PARA A INTEGRAÇÃO ---
    const googleSection = container.querySelector('#google-integration-section');
    const googleIdInput = container.querySelector('#google-calendar-id-input');
    const currentGoogleIdSpan = container.querySelector('#current-google-calendar-id');
    const linkCalendarBtn = container.querySelector('#link-calendar-btn');

    colorInput.addEventListener('input', (e) => {
        colorTextInput.value = e.target.value;
    });

    colorTextInput.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
            colorInput.value = e.target.value;
        }
    });

    const renderList = async () => {
        try {
            const professionals = await api.request('/professionals');
            renderProfessionals(professionals, listContainer, handleEdit, handleDelete);
        } catch (error) {
            showError('Não foi possível carregar a lista de profissionais.');
        }
    };

    const toggleForm = (show = true, isEditMode = false, professional = null) => {
        formWrapper.classList.toggle('hidden', !show);
        googleSection.classList.toggle('hidden', !isEditMode); // Mostra a seção do Google apenas no modo de edição

        if (show) {
             window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        if (isEditMode && professional) {
            formTitle.textContent = 'Editar Profissional';
            professionalIdInput.value = professional.id;
            professionalForm.querySelector('#professional-name').value = professional.name;
            professionalForm.querySelector('#professional-email').value = professional.email || '';
            professionalForm.querySelector('#professional-specialties').value = professional.specialties || '';
            professionalForm.querySelector('#professional-crm').value = professional.crm || '';
            professionalForm.querySelector('#professional-notes').value = professional.observations || '';
            const professionalColor = professional.color || '#007bff';
            colorInput.value = professionalColor;
            colorTextInput.value = professionalColor;
            
            // --- LÓGICA PARA POPULAR A SEÇÃO DO GOOGLE ---
            googleIdInput.value = professional.google_calendar_id || '';
            currentGoogleIdSpan.textContent = professional.google_calendar_id || 'Nenhuma';
            
            availabilityCheckbox.parentElement.style.display = 'none';
        } else {
            formTitle.textContent = 'Adicionar Novo Profissional';
            professionalForm.reset();
            professionalIdInput.value = '';
            const defaultColor = '#007bff';
            colorInput.value = defaultColor;
            colorTextInput.value = defaultColor;
            availabilityCheckbox.parentElement.style.display = 'flex';
        }
    };

    const handleEdit = (professional) => {
        toggleForm(true, true, professional);
    };

    const handleDelete = async (id) => {
        if (confirm('Tem certeza que deseja excluir este profissional?')) {
            try {
                await api.request(`/professionals/${id}`, { method: 'DELETE' });
                showSuccess('Profissional excluído com sucesso!');
                await renderList();
            } catch (error) {
                showError('Não foi possível excluir o profissional.');
            }
        }
    };
    
    // --- NOVA FUNÇÃO PARA VINCULAR O CALENDÁRIO ---
    const handleLinkCalendar = async () => {
        const professionalId = professionalIdInput.value;
        const googleCalendarId = googleIdInput.value.trim();

        if (!googleCalendarId) {
            showError('Por favor, insira o ID da Agenda do Google.');
            return;
        }

        try {
            await api.request('/integrations/google/link-professional', {
                method: 'POST',
                body: JSON.stringify({ professionalId, googleCalendarId }),
            });
            showSuccess('Agenda do Google vinculada com sucesso!');
            currentGoogleIdSpan.textContent = googleCalendarId; // Atualiza o texto na tela
            await renderList(); // Atualiza a lista para refletir a mudança
        } catch(error) {
            showError(error.message || 'Não foi possível vincular a agenda.');
        }
    };

    addBtn.addEventListener('click', () => toggleForm(true, false, null));
    cancelBtn.addEventListener('click', () => toggleForm(false));
    linkCalendarBtn.addEventListener('click', handleLinkCalendar); // Adiciona o listener ao novo botão

    professionalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = professionalIdInput.value;
        const isEditing = !!id;

        const professionalData = {
            name: professionalForm.querySelector('#professional-name').value,
            email: professionalForm.querySelector('#professional-email').value,
            specialties: professionalForm.querySelector('#professional-specialties').value,
            crm: professionalForm.querySelector('#professional-crm').value,
            observations: professionalForm.querySelector('#professional-notes').value,
            color: colorInput.value,
        };

        try {
            let savedProfessional;
            const url = isEditing ? `/professionals/${id}` : '/professionals';
            const method = isEditing ? 'PUT' : 'POST';

            savedProfessional = await api.request(url, {
                method: method,
                body: JSON.stringify(professionalData),
            });

            showSuccess(`Profissional ${isEditing ? 'atualizado' : 'salvo'} com sucesso!`);
            
            toggleForm(false);
            await renderList();

            if (!isEditing && availabilityCheckbox.checked && window.navigateToView) {
                window.location.hash = `availability?professional_id=${savedProfessional.id}`;
            }

        } catch (error) {
            showError(error.message || 'Não foi possível salvar o profissional.');
        }
    });

    await renderList();
}

function renderProfessionals(professionals, container, onEdit, onDelete) {
    container.innerHTML = '';

    if (!professionals || professionals.length === 0) {
        container.innerHTML = `<p id="no-professionals-message">Nenhum profissional cadastrado.</p>`;
        return;
    }

    professionals.forEach(prof => {
        const card = document.createElement('div');
        card.className = 'professional-card';

        // --- ADICIONA UM INDICADOR VISUAL SE O CALENDÁRIO ESTIVER VINCULADO ---
        const googleIcon = prof.google_calendar_id 
            ? '<i class="fab fa-google google-linked-icon" title="Agenda do Google vinculada"></i>' 
            : '';

        card.innerHTML = `
            <div class="professional-card-info">
                <strong>Nome</strong>
                <div class="name-with-swatch">
                    <span class="color-swatch" style="background-color: ${prof.color || '#cccccc'};"></span>
                    <span>${prof.name || 'N/A'}</span>
                    ${googleIcon}
                </div>
            </div>
            <div class="professional-card-info"><strong>E-mail</strong><span>${prof.email || 'N/A'}</span></div>
            <div class="professional-card-info"><strong>Especialidades</strong><span>${prof.specialties || 'Nenhuma'}</span></div>
            <div class="professional-card-actions">
                <button class="action-btn edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" title="Excluir"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;

        card.querySelector('.edit').addEventListener('click', () => onEdit(prof));
        card.querySelector('.delete').addEventListener('click', () => onDelete(prof.id));

        container.appendChild(card);
    });
}