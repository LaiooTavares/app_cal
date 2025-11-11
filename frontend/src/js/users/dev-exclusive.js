// FILE: frontend/src/js/users/dev-exclusive.js

document.addEventListener('DOMContentLoaded', () => {
    // --- INÍCIO DA CORREÇÃO ---
    // A lógica agora é: o script deve rodar se o perfil atual for 'developer'
    // OU se houver um token original salvo (o que significa que é um dev personificando alguém).
    const isDeveloperSession = localStorage.getItem('userRole') === 'developer' || localStorage.getItem('originalAuthToken');

    if (!isDeveloperSession) {
        return;
    }
    // --- FIM DA CORREÇÃO ---

    const switcherContainer = document.getElementById('dev-client-switcher');
    const clientDropdown = document.getElementById('client-select-dropdown');
    const currentClientLabel = document.getElementById('current-client-label');

    if (!switcherContainer || !clientDropdown || !currentClientLabel) {
        return;
    }

    switcherContainer.classList.remove('hidden');

    // Pega o token de dev, seja o atual ou o original que foi guardado
    const devToken = localStorage.getItem('originalAuthToken') || localStorage.getItem('authToken');

    async function populateClientDropdown() {
        if (!devToken) return;
        try {
            const response = await fetch('http://localhost:3000/api/users', {
                headers: { 'Authorization': `Bearer ${devToken}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar clientes.');
            
            const clients = await response.json();
            
            // Limpa opções antigas, exceto a primeira
            clientDropdown.innerHTML = '<option value="">Minha Conta (Dev)</option>';

            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                clientDropdown.appendChild(option);
            });
            
            updateCurrentClientDisplay(clients);

        } catch (error) {
            console.error("Erro ao popular dropdown de clientes:", error);
        }
    }

    function updateCurrentClientDisplay(clients) {
        const originalToken = localStorage.getItem('originalAuthToken');
        if (originalToken) {
            const currentUserName = localStorage.getItem('userName');
            currentClientLabel.textContent = `Visualizando:`; // Texto ajustado
            
            const currentClient = clients.find(c => c.name === currentUserName);
            if (currentClient) {
                clientDropdown.value = currentClient.id;
            }
        } else {
            currentClientLabel.textContent = '';
            clientDropdown.value = '';
        }
    }
    
    clientDropdown.addEventListener('change', async () => {
        const targetUserId = clientDropdown.value;

        if (!targetUserId) {
            if (localStorage.getItem('originalAuthToken')) {
                document.getElementById('exit-impersonation-btn')?.click();
            }
            return;
        }

        const currentUserName = localStorage.getItem('userName');
        const selectedClientName = clientDropdown.options[clientDropdown.selectedIndex].text;
        if (currentUserName === selectedClientName) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:3000/api/users/${targetUserId}/impersonate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${devToken}` }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            if (!localStorage.getItem('originalAuthToken')) {
                localStorage.setItem('originalAuthToken', devToken);
                localStorage.setItem('originalUserName', localStorage.getItem('userName'));
                localStorage.setItem('originalUserRole', localStorage.getItem('userRole'));
            }
            
            localStorage.setItem('authToken', data.token);
            
            const newIdentityResponse = await fetch('http://localhost:3000/api/user-data', {
                 method: 'GET',
                 headers: { 'Authorization': `Bearer ${data.token}` }
            });
            if (!newIdentityResponse.ok) throw new Error('Não foi possível buscar os dados da nova identidade.');
            
            const newIdentityData = await newIdentityResponse.json();
            localStorage.setItem('userName', newIdentityData.name);
            localStorage.setItem('userRole', newIdentityData.role);

            window.location.reload();

        } catch (error) {
            console.error('Erro ao tentar personificar via dropdown:', error);
            alert('Não foi possível acessar o painel do cliente.');
        }
    });

    populateClientDropdown();
});