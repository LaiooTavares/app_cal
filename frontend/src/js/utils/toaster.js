// FILE: frontend/src/js/utils/toaster.js

import Toastify from 'toastify-js';

/**
 * Exibe uma notificação de sucesso.
 * @param {string} message - A mensagem a ser exibida.
 */
export function showSuccess(message) {
    Toastify({
        text: message,
        duration: 3000, // A notificação sumirá após 3 segundos
        close: true,
        gravity: "bottom", // Posição: "top" ou "bottom"
        position: "right", // Posição: "left", "center" ou "right"
        stopOnFocus: true, // Pausa o tempo ao passar o mouse
        style: {
            background: "linear-gradient(to right, #00b09b, #96c93d)",
        },
    }).showToast();
}

/**
 * Exibe uma notificação de erro.
 * @param {string} message - A mensagem a ser exibida.
 */
export function showError(message) {
    Toastify({
        text: message,
        duration: 5000, // Erros ficam visíveis por mais tempo
        close: true,
        gravity: "bottom",
        position: "right",
        stopOnFocus: true,
        style: {
            background: "linear-gradient(to right, #ff5f6d, #ffc371)",
        },
    }).showToast();
}