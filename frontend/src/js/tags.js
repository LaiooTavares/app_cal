// Referência: src/js/tags.js

document.addEventListener('DOMContentLoaded', () => {
    const createTagForm = document.getElementById('create-tag-form');
    const tagNameInput = document.getElementById('tag-name-input');
    const tagColorInput = document.getElementById('tag-color-input');
    const tagList = document.getElementById('tag-list');

    // Função para buscar tags salvas no localStorage
    const getSavedTags = () => {
        return JSON.parse(localStorage.getItem('calendarTags')) || [];
    };

    // Função para salvar tags no localStorage
    const saveTags = (tags) => {
        localStorage.setItem('calendarTags', JSON.stringify(tags));
    };

    // Função para criar o elemento HTML de uma tag
    const createTagElement = (tag) => {
        const tagElement = document.createElement('div');
        tagElement.classList.add('tag-item');
        tagElement.textContent = tag.name;
        tagElement.style.backgroundColor = tag.color;
        tagElement.draggable = true;
        
        // Adiciona dados ao elemento para serem usados no drag-and-drop
        tagElement.dataset.tagName = tag.name;
        tagElement.dataset.tagColor = tag.color;

        // --- Lógica de Drag-and-Drop ---
        tagElement.addEventListener('dragstart', (event) => {
            tagElement.classList.add('is-dragging');
            // Define os dados que serão transferidos
            const tagData = JSON.stringify({ name: tag.name, color: tag.color });
            event.dataTransfer.setData('application/json', tagData);
            event.dataTransfer.effectAllowed = 'copy';
        });

        tagElement.addEventListener('dragend', () => {
            tagElement.classList.remove('is-dragging');
        });

        return tagElement;
    };

    // Função para renderizar todas as tags na lista
    const renderTags = () => {
        // Verifica se o elemento tagList existe antes de tentar usá-lo
        if (tagList) {
            tagList.innerHTML = '';
            const savedTags = getSavedTags();
            savedTags.forEach(tag => {
                const tagElement = createTagElement(tag);
                tagList.appendChild(tagElement);
            });
        }
    };

    // Event listener para o formulário de criação de tags
    if (createTagForm) {
        createTagForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const newTagName = tagNameInput.value.trim();
            const newTagColor = tagColorInput.value;

            if (newTagName) {
                const savedTags = getSavedTags();
                const newTag = { name: newTagName, color: newTagColor };
                
                savedTags.push(newTag);
                saveTags(savedTags);
                
                renderTags(); // Re-renderiza a lista de tags
                
                tagNameInput.value = ''; // Limpa o input
            }
        });
    }

    // Renderiza as tags existentes ao carregar a página
    renderTags();
    
    // Adiciona uma verificação para garantir que o módulo só anuncie o carregamento se estiver na página certa
    if (document.getElementById('settings-view')) {
         console.log("Módulo de Tags carregado e inicializado.");
    }
});