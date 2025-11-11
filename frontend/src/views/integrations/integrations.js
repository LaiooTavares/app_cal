// FILE: frontend/src/views/integrations/integrations.js
import { api } from '/src/js/script.js';
import Toastify from 'toastify-js';

// Pré-carrega o conteúdo de todos os ficheiros HTML dentro desta pasta.
const tabHTMLModules = import.meta.glob('./*.html', { query: '?raw', eager: true });
const tabHTMLs = {};
for (const path in tabHTMLModules) {
    const tabName = path.match(/\.\/(.*)\.html$/)[1];
    if (tabName !== 'integrations') {
        tabHTMLs[tabName] = tabHTMLModules[path].default;
    }
}

// Variável para guardar a referência da folha de estilo da aba atual (agora não é mais usada, mas mantida caso precise no futuro)
let currentTabStylesheet = null;

// A função agora recebe as configurações para passar para o módulo filho.
async function loadTabContent(tabName, container, settings) {
    try {
        container.innerHTML = `<p>A carregar...</p>`;

        // CORREÇÃO: Bloco de carregamento dinâmico de CSS foi REMOVIDO.
        // O CSS agora é controlado unicamente pelo integrations.css principal.

        const htmlString = tabHTMLs[tabName];
        if (htmlString === undefined) {
            throw new Error(`Template HTML para a aba '${tabName}' não foi encontrado.`);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const tabElement = doc.querySelector('.integration-card');

        if (!tabElement) {
            throw new Error(`Elemento .integration-card não encontrado no HTML da aba '${tabName}'.`);
        }

        container.innerHTML = '';
        container.appendChild(tabElement);

        let module;
        switch (tabName) {
            case 'api':
                module = await import('/src/views/integrations/api.js');
                break;
            case 'webhook':
                module = await import('/src/views/integrations/webhook.js');
                break;
            case 'google-calendar':
                module = await import('/src/views/integrations/google-calendar.js');
                break;
            default:
                throw new Error(`Módulo JS para a aba '${tabName}' não foi encontrado.`);
        }

        if (module && typeof module.init === 'function') {
            // Passamos o objeto de configurações completo para o init do módulo da aba.
            module.init(tabElement, api, settings);
        }

    } catch (error) {
        console.error(`Erro ao carregar a aba '${tabName}':`, error);
        container.innerHTML = `<p style="color: red;">Ocorreu um erro ao carregar esta secção.</p>`;
    }
}

export async function init(container) {
    const tabLinks = container.querySelectorAll('.tab-link');
    const tabContentContainer = container.querySelector('#integrations-tab-content');

    // Bloco para buscar todas as configurações de uma só vez.
    let userSettings;
    try {
        // Faz a chamada única à API para obter todas as configurações.
        userSettings = await api.request('/user/settings');
    } catch (error) {
        Toastify({
            text: "Erro ao carregar as configurações de integração.",
            duration: 3000,
            gravity: "bottom",
            position: "right",
            backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)",
        }).showToast();
        tabContentContainer.innerHTML = `<p style="color: red;">Não foi possível carregar os dados das integrações. Tente novamente mais tarde.</p>`;
        return; // Interrompe a execução se os dados não puderem ser carregados.
    }

    const setActiveTab = (tabLink) => {
        tabLinks.forEach(link => link.classList.remove('active'));
        tabLink.classList.add('active');
        const tabName = tabLink.dataset.tab;
        // Passa as configurações já buscadas para a função que carrega a aba.
        loadTabContent(tabName, tabContentContainer, userSettings);
    };

    tabLinks.forEach(link => {
        link.addEventListener('click', () => setActiveTab(link));
    });

    const initialTab = container.querySelector('.tab-link.active');
    if (initialTab) {
        // Passa as configurações para o carregamento inicial da aba.
        loadTabContent(initialTab.dataset.tab, tabContentContainer, userSettings);
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const removedNode of mutation.removedNodes) {
                // Se o container principal da view for removido, limpamos o CSS que foi injetado dinamicamente (se houver)
                if (removedNode === container && currentTabStylesheet) {
                    currentTabStylesheet.remove();
                    currentTabStylesheet = null;
                    observer.disconnect();
                    return;
                }
            }
        }
    });
    observer.observe(container.parentNode, { childList: true });
}