// backend/routes/webhook.js
const express = require('express');
const router = express.Router();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = (pool, googleHelpers) => {

    const processWebhookNotification = async (channelId) => {
        console.log(`[WEBHOOK] Notificação recebida para o canal: ${channelId}. Aguardando 3 segundos...`);
        await delay(3000);

        const profResult = await pool.query('SELECT * FROM professionals WHERE google_channel_id = $1', [channelId]);
        if (profResult.rowCount === 0) {
            return console.error(`[WEBHOOK] ERRO: Canal de webhook desconhecido: ${channelId}`);
        }
        
        const professional = profResult.rows[0];
        const userId = professional.administrator_id;
        console.log(`[WEBHOOK] Processando para o profissional: ${professional.name} (ID: ${professional.id})`);

        const calendar = await googleHelpers.getGoogleCalendarClient(userId);
        if (!calendar) return console.error(`[WEBHOOK] ERRO: Não foi possível criar cliente Google para o usuário ${userId}.`);

        try {
            const calendarId = professional.google_calendar_id;
            if (!calendarId) return console.error(`[WEBHOOK] ERRO: Profissional ${professional.id} não possui um google_calendar_id.`);

            const response = await calendar.events.list({
                calendarId,
                singleEvents: true,
                orderBy: 'startTime',
                timeMin: (new Date()).toISOString(),
                showDeleted: true,
            });

            const googleEvents = response.data.items || [];

            for (const gEvent of googleEvents) {
                const googleEventId = gEvent.id;
                if (gEvent.status === 'cancelled') {
                    await pool.query('DELETE FROM eventos WHERE google_event_id = $1', [googleEventId]);
                    console.log(`[WEBHOOK] SUCESSO: Evento cancelado no Google (ID: ${googleEventId}) foi deletado localmente.`);
                    continue;
                }

                const { dateTime: startTime } = gEvent.start || {};
                const { dateTime: endTime } = gEvent.end || {};
                const summary = gEvent.summary || 'Evento do Google';
                if (!startTime || !endTime) continue;

                const existingEventResult = await pool.query('SELECT id, professional_id FROM eventos WHERE google_event_id = $1', [googleEventId]);
                
                if (existingEventResult.rowCount > 0) {
                    const localEvent = existingEventResult.rows[0];
                    const logPrefix = localEvent.professional_id !== professional.id ? 'EVENTO MOVIDO' : 'EVENTO ATUALIZADO';
                    console.log(`[WEBHOOK] ${logPrefix}: Google ID ${googleEventId} para Profissional ${professional.id}. Atualizando...`);

                    await pool.query(
                        'UPDATE eventos SET client_name = $1, start_time = $2, end_time = $3, professional_id = $4 WHERE id = $5',
                        [summary, startTime, endTime, professional.id, localEvent.id]
                    );
                } else {
                    console.log(`[WEBHOOK] NOVO EVENTO: "${summary}" (ID: ${googleEventId}). Criando para Profissional ${professional.id}...`);
                    const statusResult = await pool.query('SELECT id FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, id ASC LIMIT 1', [userId]);
                    const defaultStatusId = statusResult.rows[0]?.id;
                    if (!defaultStatusId) {
                        console.error(`[WEBHOOK] ERRO: Usuário ${userId} não tem status padrão no Kanban.`);
                        continue;
                    }
                    await pool.query(
                        'INSERT INTO eventos (user_id, professional_id, client_name, start_time, end_time, status_id, google_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [userId, professional.id, summary, startTime, endTime, defaultStatusId, googleEventId]
                    );
                }
            }
            console.log(`[WEBHOOK] Sincronização para o profissional ${professional.name} concluída.`);
        } catch (error) {
            console.error(`[WEBHOOK] ERRO CRÍTICO na sincronização para o prof ${professional.id}:`, error.response?.data || error.message);
        }
    };

    router.post('/google/webhook', (req, res) => {
        const channelId = req.headers['x-goog-channel-id'];
        const resourceState = req.headers['x-goog-resource-state'];
        console.log(`[WEBHOOK] Recebida requisição do Google: channelId=${channelId}, resourceState=${resourceState}`);
        if (resourceState === 'exists' && channelId) {
            processWebhookNotification(channelId).catch(err => {
                console.error("[WEBHOOK] Erro não tratado na chamada de processWebhookNotification:", err);
            });
        }
        res.status(200).send();
    });

    return { router, processWebhookNotification };
};