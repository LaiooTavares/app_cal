// frontend/src/js/create-event.js
import { api } from './script.js';
import { showSuccess, showError } from './utils/toaster.js';

// NOTA: Para manter a consistência com o resto do seu projeto,
// esta função foi ajustada para ser exportada e chamada pelo seu roteador principal (script.js).
export function init(container) {
    const eventForm = container.querySelector('#event-form');
    if (!eventForm) {
        console.error("Formulário de evento #event-form não encontrado.");
        return;
    }

    const startDateInput = container.querySelector('#event-start-input');
    const endDateInput = container.querySelector('#event-end-input');
    const cancelBtn = container.querySelector('#cancel-event-btn');

    // Preenche a data se ela foi passada pela navegação
    const selectedDateISO = sessionStorage.getItem('selectedDate');
    if (selectedDateISO) {
        const selectedDate = new Date(selectedDateISO);
        selectedDate.setHours(9, 0, 0, 0);

        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const hours = String(selectedDate.getHours()).padStart(2, '0');
        const minutes = String(selectedDate.getMinutes()).padStart(2, '0');

        startDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;

        selectedDate.setHours(selectedDate.getHours() + 1);
        const endHours = String(selectedDate.getHours()).padStart(2, '0');
        endDateInput.value = `${year}-${month}-${day}T${endHours}:${minutes}`;

        sessionStorage.removeItem('selectedDate');
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            window.location.hash = 'calendar';
        });
    }

    // Listener de submit do formulário
    eventForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitButton = eventForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Salvando...';

        try {
            // CORREÇÃO: Coleta de todos os dados do formulário com os nomes corretos.
            const eventData = {
                // Assumindo que o seu HTML tem um select com este ID
                professional_id: container.querySelector('#event-professional-select')?.value, 
                client_name: container.querySelector('#event-name-input')?.value,
                // ADICIONADO: Leitura do campo CPF (assumindo que o ID do input seja 'event-cpf-input')
                client_cpf: container.querySelector('#event-cpf-input')?.value,
                // CORRIGIDO: O nome da propriedade agora é 'client_telefone'
                client_telefone: container.querySelector('#event-phone-input')?.value,
                start_time: startDateInput.value,
                end_time: endDateInput.value,
                // Assumindo que você tem um campo para notas com este ID
                notes: container.querySelector('#event-notes-input')?.value, 
            };
            
            // Validação simples para garantir que um profissional foi selecionado
            if (!eventData.professional_id) {
                throw new Error('Por favor, selecione um profissional.');
            }

            // CORREÇÃO: Utilizando a função 'api.request' padronizada do projeto
            await api.request('/events', {
                method: 'POST',
                body: JSON.stringify(eventData)
            });

            showSuccess('Evento salvo com sucesso!');
            
            // Redireciona para o calendário após o sucesso
            window.location.hash = 'calendar';

        } catch (error) {
            console.error('Falha ao salvar o evento:', error);
            showError(error.message || 'Falha ao salvar o evento.');
        } finally {
            // Garante que o botão seja reativado mesmo se ocorrer um erro
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Evento';
        }
    });
}