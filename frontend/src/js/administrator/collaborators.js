// FILE: src/js/administrator/collaborators.js
document.addEventListener('DOMContentLoaded', () => {
    // Este script só deve rodar se o painel do administrador estiver visível
    const userRole = sessionStorage.getItem('loggedInUserRole');
    if (userRole !== 'administrator') {
        return;
    }

    const collaboratorLimit = 5;
    const showFormBtn = document.getElementById('show-add-collaborator-form-btn');
    const collaboratorForm = document.getElementById('add-collaborator-form');
    const cancelFormBtn = document.getElementById('cancel-add-collaborator-btn');
    const collaboratorList = document.getElementById('collaborator-list');
    const collaboratorCounter = document.getElementById('collaborator-counter');
    
    // Garante que todos os elementos necessários para este módulo existem
    if (!showFormBtn || !collaboratorForm || !cancelFormBtn || !collaboratorList || !collaboratorCounter) {
        return;
    }

    const storageKey = 'myCollaborators'; 
    
    const getCollaborators = () => JSON.parse(localStorage.getItem(storageKey)) || [];
    const saveCollaborators = (collaborators) => localStorage.setItem(storageKey, JSON.stringify(collaborators));

    const renderCollaborators = () => {
        const collaborators = getCollaborators();
        collaboratorList.innerHTML = '';

        collaborators.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'collaborator-item';
            userElement.innerHTML = `
                <div class="collaborator-info">
                    <strong>${user.name}</strong>
                    <span>${user.email}</span>
                </div>
                <button class="btn-remove" data-id="${user.id}" title="Remover Colaborador">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            collaboratorList.appendChild(userElement);
        });

        collaboratorCounter.textContent = `${collaborators.length} de ${collaboratorLimit}`;

        if (collaborators.length >= collaboratorLimit) {
            showFormBtn.disabled = true;
            showFormBtn.style.opacity = '0.5';
            showFormBtn.style.cursor = 'not-allowed';
        } else {
            showFormBtn.disabled = false;
            showFormBtn.style.opacity = '1';
            showFormBtn.style.cursor = 'pointer';
        }
    };

    showFormBtn.addEventListener('click', () => {
        collaboratorForm.classList.remove('hidden');
        showFormBtn.classList.add('hidden');
    });

    cancelFormBtn.addEventListener('click', () => {
        collaboratorForm.classList.add('hidden');
        showFormBtn.classList.remove('hidden');
        collaboratorForm.reset();
    });

    collaboratorForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const collaborators = getCollaborators();
        
        if (collaborators.length >= collaboratorLimit) {
            alert('Você atingiu o limite de 5 colaboradores.');
            return;
        }

        const nameInput = document.getElementById('collaborator-name');
        const emailInput = document.getElementById('collaborator-email');
        // --- INÍCIO DA ALTERAÇÃO: Captura do campo de senha ---
        const passwordInput = document.getElementById('collaborator-password');
        // --- FIM DA ALTERAÇÃO ---

        const newUser = {
            id: Date.now(),
            name: nameInput.value,
            email: emailInput.value,
            // --- INÍCIO DA ALTERAÇÃO: Adiciona a senha ao objeto do usuário ---
            password: passwordInput.value
            // --- FIM DA ALTERAÇÃO ---
        };

        collaborators.push(newUser);
        saveCollaborators(collaborators);
        renderCollaborators();

        collaboratorForm.reset();
        collaboratorForm.classList.add('hidden');
        showFormBtn.classList.remove('hidden');
    });

    collaboratorList.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.btn-remove');
        if (removeButton) {
            const userId = Number(removeButton.dataset.id);
            let collaborators = getCollaborators();
            collaborators = collaborators.filter(user => user.id !== userId);
            saveCollaborators(collaborators);
            renderCollaborators();
        }
    });

    renderCollaborators();
    console.log("Submódulo de Colaboradores (Admin) inicializado.");
});