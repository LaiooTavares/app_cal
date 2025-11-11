// frontend/src/js/utils/modal.js
import '/src/css/utils/modal.css';

/**
 * [MODIFICADO] Exibe um modal de confirmação moderno e retorna uma Promise.
 * A Promise resolve para `true` se confirmado, ou `false` se cancelado.
 *
 * @param {object} options - O objeto de configuração do modal.
* @param {string} options.title - O título do modal.
 * @param {string} options.message - A mensagem/pergunta a ser exibida.
 * @param {string} [options.confirmText='Confirmar'] - Opcional. Texto do botão de confirmação.
 * @param {string} [options.cancelText='Cancelar'] - Opcional. Texto do botão de cancelamento.
 *
 * @returns {Promise<boolean>} - Resolve com 'true' para confirmar, 'false' para cancelar.
 */
// --- [INÍCIO DA CORREÇÃO] ---
// A assinatura da função agora usa "desestruturação" para aceitar um objeto de opções.
export function showConfirmation({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
// --- [FIM DA CORREÇÃO] ---

    // --- INÍCIO DA MODIFICAÇÃO (Regra 9: Promise-based) ---

    // A função agora retorna uma Promise
    return new Promise((resolve) => {
        document.querySelector('.confirmation-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'confirmation-modal-overlay';

        const modalBox = document.createElement('div');
        modalBox.className = 'confirmation-modal-box';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = title; // Agora 'title' é a string correta

        const modalMessage = document.createElement('p');
        modalMessage.textContent = message; // Agora 'message' é a string correta

        const modalActions = document.createElement('div');
        modalActions.className = 'confirmation-modal-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-submit btn-3d'; 
        confirmBtn.textContent = confirmText;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary btn-3d'; 
        cancelBtn.textContent = cancelText;

        const closeModal = () => {
            overlay.remove();
        };

        // MODIFICADO: O clique agora resolve a Promise
        confirmBtn.onclick = () => {
            closeModal();
            resolve(true); // Retorna 'true' para o 'await'
        };

        // MODIFICADO: O clique agora resolve a Promise
        cancelBtn.onclick = () => {
            closeModal();
            resolve(false); // Retorna 'false' para o 'await'
        };

        // MODIFICADO: O clique fora (overlay) também resolve como 'false'
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closeModal();
                resolve(false); // Retorna 'false' para o 'await'
            }
        });

        // Montagem do modal (sem alterações)
        modalActions.appendChild(cancelBtn);
        modalActions.appendChild(confirmBtn);
        modalBox.appendChild(modalTitle);

        if (message) {
            modalBox.appendChild(modalMessage);
        }
        
        modalBox.appendChild(modalActions);
        overlay.appendChild(modalBox);

        document.body.appendChild(overlay);
    });
    // --- FIM DA MODIFICAÇÃO ---
}