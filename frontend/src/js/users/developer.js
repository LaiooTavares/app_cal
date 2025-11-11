// FILE: frontend/src/js/users/developer.js

async function initializeDeveloperPanel() {
    const clientListContainer = document.getElementById('client-list');
    if (!clientListContainer) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch('http://localhost:3000/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar clientes.');
        const clients = await response.json();
        clientListContainer.innerHTML = '';
        if (clients.length === 0) {
            clientListContainer.innerHTML = '<p>Nenhum cliente administrador encontrado.</p>';
            return;
        }
        clients.forEach(client => {
            const clientElement = document.createElement('div');
            clientElement.className = 'client-item';
            clientElement.innerHTML = `
                <div class="client-info">
                    <strong>${client.name}</strong>
                    <span>${client.email}</span>
                </div>
                <div class="client-actions">
                    <button class="btn-manage impersonate-btn" data-userid="${client.id}">Acessar Painel</button>
                </div>
            `;
            clientListContainer.appendChild(clientElement);
        });
    } catch (error) {
        console.error("Erro ao inicializar o painel do desenvolvedor:", error);
        clientListContainer.innerHTML = '<p>Erro ao carregar clientes.</p>';
    }
}

document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('impersonate-btn')) {
        const targetUserId = event.target.dataset.userid;
        const devToken = localStorage.getItem('authToken');
        
        // --- INÍCIO DA CORREÇÃO: Salvando a identidade completa ---
        const devName = localStorage.getItem('userName');
        const devRole = localStorage.getItem('userRole');
        // --- FIM DA CORREÇÃO ---

        if (!targetUserId || !devToken) return;

        try {
            const response = await fetch(`http://localhost:3000/api/users/${targetUserId}/impersonate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${devToken}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            // --- INÍCIO DA CORREÇÃO: Salvando o backup completo ---
            localStorage.setItem('originalAuthToken', devToken);
            localStorage.setItem('originalUserName', devName);
            localStorage.setItem('originalUserRole', devRole);
            // --- FIM DA CORREÇÃO ---
            
            localStorage.setItem('authToken', data.token);
            
            // Busca os dados do novo usuário para atualizar a interface
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
            console.error('Erro ao tentar personificar:', error);
            alert('Não foi possível acessar o painel do cliente.');
        }
    }
});