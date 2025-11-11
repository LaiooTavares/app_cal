// backend/utils/googleHelpers.js
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

// Esta função agora exporta um objeto contendo todas as nossas funções auxiliares
module.exports = (pool) => {

    const getGoogleCalendarClient = async (userId) => {
        try {
            const tokenQuery = 'SELECT google_access_token, google_refresh_token FROM users WHERE id = $1';
            const tokenResult = await pool.query(tokenQuery, [userId]);
            if (tokenResult.rowCount === 0 || !tokenResult.rows[0].google_refresh_token) {
                console.error(`[AUTH] Usuário ${userId} não possui um refresh_token do Google.`);
                return null;
            }
            const { google_access_token, google_refresh_token } = tokenResult.rows[0];
            const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
            oauth2Client.setCredentials({ access_token: google_access_token, refresh_token: google_refresh_token });
            
            await oauth2Client.getAccessToken();

            oauth2Client.on('tokens', async (tokens) => {
                const query = tokens.refresh_token 
                    ? 'UPDATE users SET google_access_token = $1, google_refresh_token = $2 WHERE id = $3'
                    : 'UPDATE users SET google_access_token = $1 WHERE id = $2';
                const params = tokens.refresh_token 
                    ? [tokens.access_token, tokens.refresh_token, userId] 
                    : [tokens.access_token, userId];
                await pool.query(query, params);
            });
            return google.calendar({ version: 'v3', auth: oauth2Client });
        } catch (error) {
            if (error.response && ['invalid_grant', 'unauthorized_client'].includes(error.response.data.error)) {
                console.error(`[AUTH] ERRO: Token de atualização inválido para o usuário ${userId}. O usuário precisa se reconectar.`);
            } else {
                console.error(`[AUTH] Erro ao criar cliente do Google Calendar para o usuário ${userId}:`, error.message);
            }
            return null;
        }
    };

    const stopGoogleWatch = async (calendar, channelId, resourceId) => {
        if (!channelId || !resourceId) return;
        try {
            console.log(`[SYNC] Tentando parar o canal de notificação: ChannelID=${channelId}, ResourceID=${resourceId}`);
            await calendar.channels.stop({ requestBody: { id: channelId, resourceId: resourceId } });
            console.log(`[SYNC] Canal de notificação ${channelId} parado com sucesso.`);
        } catch (error) {
            if (error.code === 404) {
                console.log(`[SYNC] Canal ${channelId} não encontrado no Google. Provavelmente já expirou.`);
            } else {
                console.error(`[SYNC] Erro ao parar o canal ${channelId}:`, error.message);
            }
        }
    };

    const startOrRefreshGoogleWatch = async (userId, professionalId) => {
        console.log(`[SYNC] Iniciando processo de ativação de monitoramento para o profissional ${professionalId}.`);
        const calendar = await getGoogleCalendarClient(userId);
        if (!calendar) {
            console.error(`[SYNC] Falha ao obter cliente do Google para o usuário ${userId}. Abortando ativação.`);
            return { success: false, message: 'Não foi possível autenticar com o Google.' };
        }

        const profResult = await pool.query('SELECT google_calendar_id, google_channel_id, google_resource_id FROM professionals WHERE id = $1 AND administrator_id = $2', [professionalId, userId]);
        const professional = profResult.rows[0];
        if (!professional) return { success: false, message: 'Profissional não encontrado.' };

        const calendarId = professional.google_calendar_id;
        if (!calendarId) return { success: false, message: 'Profissional não está vinculado a um calendário do Google.' };

        await stopGoogleWatch(calendar, professional.google_channel_id, professional.google_resource_id);
        
        const webhookUrl = process.env.WEBHOOK_BASE_URL;
        if (!webhookUrl) {
            console.error("[SYNC] ERRO: A variável de ambiente WEBHOOK_BASE_URL não está definida.");
            return { success: false, message: "Configuração do servidor incompleta." };
        }
        
        const newChannelId = uuidv4();
        
        try {
            console.log(`[SYNC] Criando novo canal de notificação para o profissional ${professionalId}...`);
            const response = await calendar.events.watch({
                calendarId,
                requestBody: { id: newChannelId, type: 'web_hook', address: `${webhookUrl}/api/integrations/google/webhook` },
            });
            const newResourceId = response.data.resourceId;
            
            await pool.query('UPDATE professionals SET google_channel_id = $1, google_resource_id = $2 WHERE id = $3', [newChannelId, newResourceId, professionalId]);
            
            console.log(`[SYNC] Novo canal ${newChannelId} criado com sucesso. Forçando re-sincronização inicial...`);
            // Retornamos o ID do canal para que a rota possa chamar a sincronização
            return { success: true, message: `Monitoramento do calendário ativado!`, channelId: newChannelId };
        } catch (error) {
            console.error(`[SYNC] Erro ao iniciar watch para o profissional ${professionalId}:`, error.response?.data || error.message);
            return { success: false, message: 'Não foi possível iniciar o monitoramento.' };
        }
    };

    // Retorna o objeto com as funções que serão usadas em outros arquivos
    return {
        getGoogleCalendarClient,
        startOrRefreshGoogleWatch,
        syncEventToGoogle,
        deleteEventFromGoogle
    };
};