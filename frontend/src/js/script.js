// FILE: frontend/src/js/script.js
import "toastify-js/src/toastify.css";
// ADICIONADO: Importa o CSS principal da aplicação. O Vite irá empacotá-lo.
import "../css/style.css"; 

// MODIFICADO: A URL agora é lida dinamicamente do arquivo .env correspondente
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    console.error('VITE_API_BASE_URL não está definida! Verifique seus arquivos .env');
}

const modules = import.meta.glob('../views/**/*.html', { query: '?raw', eager: true });
const viewsHTML = {};
for (const path in modules) {
    viewsHTML[path] = modules[path].default;
}

// --- [MODIFICAÇÃO] Roteamento "History Mode" ---
/**
 * [MODIFICADO] Lê os parâmetros da URL (ex: ?id=1)
 * em vez de ler do hash (#).
 */
function getAppParams() {
    const params = {};
    const urlParams = new URLSearchParams(window.location.search);
    for (const [key, value] of urlParams.entries()) {
        params[key] = value;
    }
    return params;
}
// --- [FIM DA MODIFICAÇÃO] ---

export const api = {
    async request(endpoint, options = {}) {
        let tokenToUse = localStorage.getItem('authToken');
        if (options.useOriginalToken) {
            const originalToken = localStorage.getItem('originalAuthToken');
            if (originalToken) { tokenToUse = originalToken; }
        }
        
        // --- [INÍCIO DA CORREÇÃO (HTTPS Redirect)] ---
        // Verifica as novas rotas /login e /setup (sem .html)
        if (!tokenToUse && !window.location.pathname.endsWith('/login') && !window.location.pathname.endsWith('/setup')) {
            // [CORRIGIDO] Usa 'window.location.origin' para forçar o HTTPS
            window.location.href = window.location.origin + '/login';
            throw new Error('Sessão expirada.');
        }
        // --- [FIM DA CORREÇÃO] ---

        const defaultHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenToUse}` };
        const config = { ...options, headers: { ...defaultHeaders, ...options.headers } };
        try {
            const response = await fetch(`${API_BASE_URL}/api${endpoint}`, config);
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('originalAuthToken');
                    // --- [INÍCIO DA CORREÇÃO (HTTPS Redirect)] ---
                    // [CORRIGIDO] Usa 'window.location.origin' para forçar o HTTPS
                    window.location.href = window.location.origin + '/login';
                    // --- [FIM DA CORREÇÃO] ---
                    throw new Error('Token inválido ou expirado.');
                }
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.message || `Erro na requisição: ${response.statusText}`);
            }
            if (response.status === 204) { return null; }
            return await response.json();
        } catch (error) {
            console.error(`Erro na chamada da API para o endpoint ${endpoint}:`, error);
            throw error;
        }
    }
};

const routes = {
    'calendar': { title: 'Calendário' },
    'kanban': { title: 'Quadro Kanban' },
    'professionals': { title: 'Profissionais' },
    'availability': { title: 'Disponibilidade' },
    'events': { title: 'Eventos' },
    'event-details': { title: 'Detalhes do Evento' },
    'integrations': { title: 'Integrações' },
    'settings': { title: 'Configurações' },
    'register-client': { title: 'Cadastrar Novo Cliente' },
    'register-cooperator': { title: 'Cadastrar Cooperador' },
    'booking': { title: 'Agendar Horário' }
};

// --- [MODIFICAÇÃO] Roteamento "History Mode" ---
/**
 * [MODIFICADO] Exporta a função para que outros módulos possam chamar a navegação.
 * @param {string} path - O caminho da view (ex: 'calendar' or 'event-details?id=1')
 */
export async function navigateToView(path) {
    // 1. Atualiza a URL na barra do navegador
    // Se o path não começar com '/', adiciona
    const targetPath = path.startsWith('/') ? path : `/${path}`;
    
    // Evita push duplicado
    if (window.location.pathname !== targetPath) {
        history.pushState(null, '', targetPath);
    }
    
    // 2. Chama o roteador para carregar a view
    await router();
}

/**
 * [MODIFICADO] Lê o 'pathname' em vez do 'hash'
 */
async function router() {
    // Ex: /calendar?id=1
    const path = window.location.pathname;
    
    // --- [INÍCIO DA MODIFICAÇÃO] ---
    // Se o path for / ou vazio, usa 'calendar' como padrão
    let viewNameWithParams = path.substring(1) || 'calendar';
    // --- [FIM DA MODIFICAÇÃO] ---
    
    // Ex: calendar
    const cleanViewName = viewNameWithParams.split('?')[0];
    // Ex: { id: 1 }
    const params = getAppParams(); 

    const viewContainer = document.getElementById('view-container');
    const route = routes[cleanViewName];

    if (!viewContainer || !route) {
        console.error(`[Roteador] View "${cleanViewName}" não encontrada.`);
        // [MODIFICADO] Navega para /calendar
        history.replaceState(null, '', '/calendar'); 
        await router(); // Chama o roteador de novo para a página padrão
        return;
    }

    // Atualiza o menu 'active' (agora lendo o pathname)
    document.querySelectorAll('.menu-item').forEach(item => {
        const itemPath = new URL(item.href).pathname.substring(1);
        item.classList.toggle('active', itemPath === cleanViewName);
    });

    try {
        const viewPath = `../views/${cleanViewName}/${cleanViewName}.html`;
        const viewHTML = viewsHTML[viewPath];
        if (viewHTML === undefined) {
            throw new Error(`O template HTML para '${cleanViewName}' não foi encontrado.`);
        }

        // --- (Lógica de import de CSS/JS) ---
        
        // --- [INÍCIO DA CORREÇÃO (Erro de Referência)] ---
        // Corrigido 'cleanViewBuscando' para 'cleanViewName'
        const jsImport = import(`../views/${cleanViewName}/${cleanViewName}.js`);
        // --- [FIM DA CORREÇÃO] ---

        let cssImportPromise; 

        if (cleanViewName === 'register-client' || cleanViewName === 'register-cooperator') {
            cssImportPromise = import('../css/register-client.css');
        } else if (cleanViewName === 'availability') {
            cssImportPromise = Promise.all([
                import('../views/availability/availability.css'),
                import('../views/exceptions/exceptions.css') 
            ]);
        } else {
            cssImportPromise = import(`../views/${cleanViewName}/${cleanViewName}.css`);
        }
        
        const [viewModule] = await Promise.all([
            jsImport,
            cssImportPromise 
        ]);
        // --- (Fim da lógica de import) ---

        viewContainer.innerHTML = viewHTML;

        if (viewModule && typeof viewModule.init === 'function') {
            await viewModule.init(viewContainer, params);
        } else {
            console.warn(`[Roteador] Módulo para a view '${cleanViewName}' não possui 'init'.`);
        }

        const pageTitleElement = document.getElementById('page-title-text');
        if (pageTitleElement) {
            pageTitleElement.textContent = route.title;
        }

        displayHeaderContextName();
    } catch (error) {
        console.error(`Erro ao carregar a view '${cleanViewName}':`, error);
        viewContainer.innerHTML = `<p style="color: red;">Erro ao carregar esta página.</p>`;
    }
}
// --- [FIM DA MODIFICAÇÃO] ---


function main() {
    const token = localStorage.getItem('authToken');

    // --- [INÍCIO DA CORREÇÃO (HTTPS Redirect)] ---
    // Verifica as novas rotas /login e /setup (sem .html)
    if (window.location.pathname.endsWith('/login') || window.location.pathname.endsWith('/setup')) {
        return; 
    }
    
    // Se não está nas páginas públicas e não tem token, redireciona para o login
    if (!token) {
        // [CORRIGIDO] Usa 'window.location.origin' para forçar o HTTPS
        window.location.href = window.location.origin + '/login';
        return;
    }
    // --- [FIM DA CORREÇÃO] ---

    themeManager.init(); // <-- INICIALIZAÇÃO DO TEMA
    setupImpersonationBar();
    setupUserProfile();
    setupImpersonation();

    // --- [INÍCIO DA MODIFICAÇÃO] Roteamento "History Mode" ---
    // Remove o 'hashchange'
    // window.addEventListener('hashchange', router);

    // 1. Ouve os botões de Voltar/Avançar do navegador
    window.addEventListener('popstate', router);

    // 2. Intercepta todos os cliques em links <a>
    document.body.addEventListener('click', e => {
        const link = e.target.closest('a');
        
        // [MODIFICADO] Verifica se o link NÃO é /login ou /setup
        if (link && link.getAttribute('href') && link.getAttribute('href').startsWith('/') && !link.getAttribute('href').startsWith('//') && !link.pathname.endsWith('/login') && !link.pathname.endsWith('/setup')) {
            e.preventDefault(); // Impede o recarregamento da página
            
            // Navega para o href do link usando a API de História
            // (Isso chama o navigateToView, que chama o router)
            navigateToView(link.getAttribute('href'));
        }
    });

    // 3. Carrega a rota inicial baseada no pathname
    router();
    // --- [FIM DA MODIFICAÇÃO] ---
}

// ... (O resto das funções setupUserProfile, decodeJwt, setupImpersonation, etc. continuam aqui) ...

function setupUserProfile() {
    const userName = localStorage.getItem('userName');
    const userRole = localStorage.getItem('userRole');
    const controlsContainer = document.querySelector('.header-right-controls');
    if (!userName || !controlsContainer) return;
    let adminLinks = '';
    const devRoles = ['dev', 'developer'];
    const adminRoles = ['administrator', 'admin'];
    
    // --- [INÍCIO DA MODIFICAÇÃO] Atualiza links para o History Mode ---
    if (devRoles.includes(userRole)) {
        adminLinks = `<a href="/register-client" class="menu-action"><i class="fas fa-user-plus"></i> Cadastrar Cliente</a>`;
    } else if (adminRoles.includes(userRole)) {
        adminLinks = `<a href="/register-cooperator" class="menu-action"><i class="fas fa-users"></i> Cadastrar Cooperador</a>`;
    }
    // --- [FIM DA MODIFICAÇÃO] ---

    const userProfileHTML = `
        <div class="user-profile">
            <span id="user-name-display">${userName}</span>
            <i class="fas fa-user-circle user-icon"></i>
            <div class="dropdown-menu">
                ${adminLinks}
                <a href="#" id="logout-btn"><i class="fas fa-sign-out-alt"></i> Sair</a>
            </div>
        </div>
    `;
    controlsContainer.innerHTML = userProfileHTML;

    // [REMOVIDO] Listener desnecessário, pois o click global já cuida disso.
    // controlsContainer.querySelectorAll('.menu-action').forEach(link => { ... });
    
    const userProfile = controlsContainer.querySelector('.user-profile');
    const dropdownMenu = controlsContainer.querySelector('.dropdown-menu');
    userProfile.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });
    const logoutBtn = controlsContainer.querySelector('#logout-btn');
    logoutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        localStorage.clear();
        // --- [INÍCIO DA CORREÇÃO (HTTPS Redirect)] ---
        // [CORRIGIDO] Usa 'window.location.origin' para forçar o HTTPS
        window.location.href = window.location.origin + '/login';
        // --- [FIM DA CORREÇÃO] ---
    });
    window.addEventListener('click', () => {
        if (dropdownMenu) dropdownMenu.classList.remove('show');
    });
}

function decodeJwt(token) {
    try { return JSON.parse(atob(token.split('.')[1])); }
    catch (e) { return null; }
}

async function setupImpersonation() {
    const originalToken = localStorage.getItem('originalAuthToken');
    let effectiveRole = localStorage.getItem('userRole');
    if (originalToken) {
        const originalDecodedToken = decodeJwt(originalToken);
        if (originalDecodedToken) { effectiveRole = originalDecodedToken.role; }
    }
    const allowedRoles = ['dev', 'developer'];
    if (!allowedRoles.includes(effectiveRole)) { return; }
    const controlsContainer = document.querySelector('.header-right-controls');
    if (!controlsContainer) return;
    const oldSwitcher = controlsContainer.querySelector('.client-switcher');
    if (oldSwitcher) oldSwitcher.remove();
    try {
        const clients = await api.request('/clients', { useOriginalToken: true });
        if (clients && clients.length > 0) {
            const selectHTML = `
                <div class="client-switcher">
                    <select id="client-select-dropdown">
                        <option value="">Alternar para cliente...</option>
                        ${clients.map(client => `<option value="${client.id}">${client.name}</option>`).join('')}
                    </select>
                </div>
            `;
            controlsContainer.insertAdjacentHTML('afterbegin', selectHTML);
            const clientSelect = document.getElementById('client-select-dropdown');
            clientSelect.addEventListener('change', async (event) => {
                const selectedClientId = event.target.value;
                if (!selectedClientId) return;
                const baseToken = localStorage.getItem('originalAuthToken') || localStorage.getItem('authToken');
                localStorage.setItem('originalAuthToken', baseToken);
                const response = await api.request(`/users/${selectedClientId}/impersonate`, { method: 'POST', useOriginalToken: true });
                localStorage.setItem('authToken', response.token);
                const newDecodedToken = decodeJwt(response.token);
                if (newDecodedToken) {
                    localStorage.setItem('userName', newDecodedToken.name);
                    localStorage.setItem('userRole', newDecodedToken.role);
                }
                window.location.reload();
            });
        }
    } catch (error) {
        console.error("Erro ao carregar lista de clientes para personificação:", error);
    }
}

function setupImpersonationBar() {
    const token = localStorage.getItem('authToken');
    const decodedToken = decodeJwt(token);
    if (decodedToken && decodedToken.isImpersonating) {
        const barHTML = `
            <div class="impersonation-bar">
                Você está navegando como <strong>${decodedToken.name}</strong>.
                <button id="stop-impersonation-btn">Voltar à minha conta</button>
            </div>
        `;
        document.body.insertAdjacentHTML('afterbegin', barHTML);
        const stopBtn = document.getElementById('stop-impersonation-btn');
        stopBtn.addEventListener('click', () => {
            const originalToken = localStorage.getItem('originalAuthToken');
            if (originalToken) {
                localStorage.setItem('authToken', originalToken);
                localStorage.removeItem('originalAuthToken');
                const originalDecodedToken = decodeJwt(originalToken);
                if (originalDecodedToken) {
                    localStorage.setItem('userName', originalDecodedToken.name);
                    localStorage.setItem('userRole', originalDecodedToken.role);
                }
                window.location.reload();
            }
        });
    }
}

function displayHeaderContextName() {
    const token = localStorage.getItem('authToken');
    const decodedToken = decodeJwt(token);
    if (!decodedToken) return;
    let contextName = '';
    if (decodedToken.isImpersonating) {
        contextName = decodedToken.name;
    } else if (decodedToken.role === 'cooperador') {
        contextName = decodedToken.creatorName || 'Admin';
    } else if (['dev', 'developer'].includes(decodedToken.role)) {
        contextName = 'DEV';
    } else if (['administrator', 'admin'].includes(decodedToken.role)) {
        contextName = decodedToken.name;
    } else if (decodedToken.role === 'client') {
        contextName = decodedToken.name;
    }
    const headerTitle = document.getElementById('main-header-title');
    if (headerTitle) {
        const oldContext = headerTitle.querySelector('.context-name');
        if (oldContext) oldContext.remove();
        if (contextName) {
            const nameHTML = ` <span class="context-name">${contextName}</span>`;
            const pageTitleSpan = headerTitle.querySelector('#page-title-text');
            if (pageTitleSpan) {
                pageTitleSpan.insertAdjacentHTML('afterend', nameHTML);
            }
        }
    }
}

// --- MÓDULO DE GERENCIAMENTO DE TEMA ---
const themeManager = {
    init() {
        this.applySavedTheme();
    },

    applySavedTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light'; // Padrão é 'light'
        this.setTheme(savedTheme);
    },

    setTheme(themeName) {
        if (themeName === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        localStorage.setItem('theme', themeName);
    },

    setupThemeSwitcher(selectElement) {
        if (!selectElement) return;

        const currentTheme = localStorage.getItem('theme') || 'light';
        selectElement.value = currentTheme;

        selectElement.addEventListener('change', (e) => {
            this.setTheme(e.target.value);
        });
    }
};

// --- INICIALIZAÇÃO PRINCIPAL ---
main();

// Disponibiliza o themeManager globalmente para outros módulos
window.app = window.app || {};
window.app.themeManager = themeManager;