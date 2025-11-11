// FILE: backend/routes/calendar.js
const express = require('express');
const { google } = require('googleapis');
const axios = require('axios'); // IMPORTADO (Regra 9)
const router = express.Router();

async function getGoogleCalendarClient(pool, userId) {
    try {
        const tokenQuery = 'SELECT google_access_token, google_refresh_token FROM users WHERE id = $1';
        const tokenResult = await pool.query(tokenQuery, [userId]);
        if (tokenResult.rowCount === 0 || !tokenResult.rows[0].google_access_token) {
            return null;
        }
        const { google_access_token, google_refresh_token } = tokenResult.rows[0];
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
            access_token: google_access_token,
            refresh_token: google_refresh_token,
        });
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
                await pool.query('UPDATE users SET google_access_token = $1, google_refresh_token = $2 WHERE id = $3', [tokens.access_token, tokens.refresh_token, userId]);
            } else {
                await pool.query('UPDATE users SET google_access_token = $1 WHERE id = $2', [tokens.access_token, userId]);
            }
        });
        return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
        console.error(`Erro ao criar cliente do Google Calendar para o usuário ${userId}:`, error);
        return null;
    }
}

async function syncEventToGoogle(pool, userId, localEvent) {
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return;

    const profResult = await pool.query('SELECT google_calendar_id FROM professionals WHERE id = $1', [localEvent.professional_id]);
    const calendarId = profResult.rows[0]?.google_calendar_id || 'primary';

    const descriptionParts = [];
    if (localEvent.professional_name) {
        descriptionParts.push(`Profissional: ${localEvent.professional_name}`);
    }
    if (localEvent.client_cpf) {
        descriptionParts.push(`CPF: ${localEvent.client_cpf}`);
    }
    if (localEvent.client_telefone) {
        descriptionParts.push(`Telefone: ${localEvent.client_telefone}`);
    }
    descriptionParts.push(`\nNotas: ${localEvent.notes || 'Nenhuma nota.'}`);

    const eventResource = {
        summary: `Consulta: ${localEvent.client_name}`,
        description: descriptionParts.join('\n'),
        start: {
            dateTime: localEvent.start_time,
            timeZone: 'America/Sao_Paulo',
        },
        end: {
            dateTime: localEvent.end_time,
            timeZone: 'America/Sao_Paulo',
        },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: calendarId,
            resource: eventResource,
        });
        const googleEventId = response.data.id;
        await pool.query(
            'UPDATE eventos SET google_event_id = $1 WHERE id = $2',
            [googleEventId, localEvent.id]
        );
        console.log(`Evento ${localEvent.id} sincronizado com sucesso para o calendário ${calendarId}.`);
    } catch (error) {
        console.error(`Erro ao sincronizar evento ${localEvent.id} para o Google Calendar:`, error.message);
    }
}

// NOVA FUNÇÃO: Apaga um evento do Google Calendar
async function deleteEventFromGoogle(pool, userId, eventToDelete) {
    if (!eventToDelete.google_event_id) {
        console.log(`Evento ${eventToDelete.id} não possui google_event_id. Pulando a exclusão do Google Calendar.`);
        return;
    }

    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return;

    const profResult = await pool.query('SELECT google_calendar_id FROM professionals WHERE id = $1', [eventToDelete.professional_id]);
    const calendarId = profResult.rows[0]?.google_calendar_id || 'primary';

    try {
        await calendar.events.delete({
            calendarId: calendarId,
            eventId: eventToDelete.google_event_id,
        });
        console.log(`Evento ${eventToDelete.id} (Google ID: ${eventToDelete.google_event_id}) excluído com sucesso do calendário ${calendarId}.`);
    } catch (error) {
        if (error.code === 410) {
            console.log(`Evento ${eventToDelete.google_event_id} já havia sido excluído do Google Calendar.`);
            return;
        }
        console.error(`Erro ao excluir evento ${eventToDelete.google_event_id} do Google Calendar:`, error.message);
    }
}

/**
 * [NOVA FUNÇÃO MODULAR] (Regra 11)
 * Envia os dados de um evento recém-criado para um webhook customizado 
 * configurado para o usuário (owner).
 * @param {object} pool - O pool de conexões do PostgreSQL.
 * @param {number} userId - O ID do usuário (owner) que está criando o evento.
 * @param {object} eventData - O objeto completo do evento (newEvent).
 */
async function sendEventToWebhook(pool, userId, eventData) {
    console.log(`[WEBHOOK_SENDER] Iniciando envio do evento ${eventData.id} para o webhook do usuário ${userId}.`);
    
    let webhookUrl;
    try {
        // 1. Buscar a URL do webhook para este usuário (assumindo que a coluna se chama 'webhook_url' na tabela 'users')
        const userResult = await pool.query('SELECT webhook_url FROM users WHERE id = $1', [userId]);
        webhookUrl = userResult.rows[0]?.webhook_url;

        // 2. Se não houver URL, apenas registre e saia
        if (!webhookUrl) {
            console.log(`[WEBHOOK_SENDER] Usuário ${userId} não possui URL de webhook configurada. Envio pulado.`);
            return;
        }

        // 3. Enviar os dados para o webhook usando axios (Regra 9)
        await axios.post(webhookUrl, {
            type: 'event.created', // Tipo de evento para o receptor saber o que é
            data: eventData        // O payload do evento
        });

        console.log(`[WEBHOOK_SENDER] SUCESSO: Evento ${eventData.id} enviado para ${webhookUrl}.`);

    } catch (error) {
        // Importante: Não travar a aplicação principal se o webhook falhar.
        console.error(`[WEBHOOK_SENDER] ERRO: Falha ao enviar evento ${eventData.id} para ${webhookUrl || 'URL não definida'}.`, error.response?.data || error.message);
    }
}


const getDataOwnerId = (user) => {
    if (user.role === 'cooperador' && user.creatorId) {
        return user.creatorId;
    }
    return user.userId;
};

const calendarRoutes = (pool, authenticateToken) => {
    // Rota GET /availabilities
    router.get('/availabilities', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id } = req.query;
        if (!professional_id) { return res.status(400).json({ message: 'O ID do profissional é obrigatório.' }); }
        try {
            const profQuery = 'SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2';
            const profResult = await pool.query(profQuery, [professional_id, ownerId]);
            if (profResult.rowCount === 0) { return res.status(404).json({ message: 'Profissional não encontrado.' }); }
            const availQuery = 'SELECT * FROM professional_availability WHERE professional_id = $1 ORDER BY day_of_week, start_time';
            const availResult = await pool.query(availQuery, [professional_id]);
            res.status(200).json(availResult.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota POST /availabilities
    router.post('/availabilities', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id, day_of_week, start_time, end_time } = req.body;
        try {
            const profQuery = 'SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2';
            const profResult = await pool.query(profQuery, [professional_id, ownerId]);
            if (profResult.rowCount === 0) { return res.status(404).json({ message: 'Profissional não encontrado.' }); }
            const query = `INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *;`;
            const values = [professional_id, day_of_week, start_time, end_time];
            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota PUT /availabilities/:id
    router.put('/availabilities/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { start_time, end_time } = req.body;
        if (!start_time || !end_time) { return res.status(400).json({ message: 'Horários obrigatórios.' }); }
        try {
            const checkQuery = `SELECT pa.id FROM professional_availability pa JOIN professionals p ON pa.professional_id = p.id WHERE pa.id = $1 AND p.administrator_id = $2;`;
            const checkResult = await pool.query(checkQuery, [id, ownerId]);
            if (checkResult.rowCount === 0) { return res.status(404).json({ message: 'Disponibilidade não encontrada.' }); }
            const updateQuery = `UPDATE professional_availability SET start_time = $1, end_time = $2 WHERE id = $3 RETURNING *;`;
            const result = await pool.query(updateQuery, [start_time, end_time, id]);
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota DELETE /availabilities/:id
    router.delete('/availabilities/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            const query = `DELETE FROM professional_availability pa USING professionals p WHERE pa.id = $1 AND pa.professional_id = p.id AND p.administrator_id = $2;`;
            const result = await pool.query(query, [id, ownerId]);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Disponibilidade não encontrada.' }); }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota GET /events
    router.get('/events', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id, date } = req.query;
        try {
            let query = `
                SELECT 
                    e.*, 
                    p.name as professional_name, 
                    p.color as professional_color,
                    ks.name as status,
                    ks.color as status_color
                FROM eventos e
                LEFT JOIN professionals p ON e.professional_id = p.id
                LEFT JOIN kanban_statuses ks ON e.status_id = ks.id
                WHERE e.user_id = $1
            `;
            const values = [ownerId];
            if (professional_id) {
                values.push(professional_id);
                query += ` AND e.professional_id = $${values.length}`;
            }
            if (date) {
                values.push(date);
                query += ` AND e.start_time::date = $${values.length}::date`;
            }
            query += ' ORDER BY e.start_time DESC';
            const result = await pool.query(query, values);
            res.status(200).json(result.rows);
        } catch (error) {
            console.error("Erro ao buscar eventos:", error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota GET /events/:id
    router.get('/events/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            const query = `SELECT e.*, p.name as professional_name FROM eventos e LEFT JOIN professionals p ON e.professional_id = p.id WHERE e.id = $1 AND e.user_id = $2`;
            const result = await pool.query(query, [id, ownerId]);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Evento não encontrado.' }); }
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota POST /events
    router.post('/events', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id, client_name, client_cpf, client_telefone, start_time, end_time, notes } = req.body;
        if (!professional_id || !client_name || !start_time || !end_time) { return res.status(400).json({ message: 'Campos obrigatórios em falta.' }); }
        try {
            const startTimeObj = new Date(start_time);
            const dayOfWeek = startTimeObj.getUTCDay();
            const timeOfDay = `${String(startTimeObj.getUTCHours()).padStart(2, '0')}:${String(startTimeObj.getUTCMinutes()).padStart(2, '0')}`;
            const availabilityQuery = `SELECT 1 FROM professional_availability WHERE professional_id = $1 AND day_of_week = $2 AND $3::time >= start_time AND $4::time <= end_time;`;
            const availabilityResult = await pool.query(availabilityQuery, [professional_id, dayOfWeek, timeOfDay, new Date(end_time).toTimeString().slice(0, 5)]);
            if (availabilityResult.rowCount === 0) { return res.status(400).json({ message: 'Horário indisponível ou fora do expediente do profissional.' }); }
            const conflictQuery = `SELECT 1 FROM eventos WHERE professional_id = $1 AND start_time = $2;`;
            const conflictResult = await pool.query(conflictQuery, [professional_id, start_time]);
            if (conflictResult.rowCount > 0) { return res.status(409).json({ message: 'Conflito: Este horário já foi agendado.' }); }
            const defaultStatusQuery = 'SELECT id FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, id ASC LIMIT 1';
            const statusResult = await pool.query(defaultStatusQuery, [ownerId]);
            if (statusResult.rowCount === 0) { return res.status(400).json({ message: "Nenhum status padrão do Kanban configurado. Crie um status antes de agendar." }); }
            const defaultStatusId = statusResult.rows[0].id;
            const insertQuery = `INSERT INTO eventos (professional_id, user_id, client_name, client_cpf, client_telefone, start_time, end_time, status_id, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;`;
            const values = [professional_id, ownerId, client_name, client_cpf, client_telefone, start_time, end_time, defaultStatusId, notes];
            const result = await pool.query(insertQuery, values);
            const newEvent = result.rows[0];
            const profResult = await pool.query('SELECT name FROM professionals WHERE id = $1', [newEvent.professional_id]);
            newEvent.professional_name = profResult.rows[0]?.name || 'N/A';
            
            // Envia a resposta imediatamente
            res.status(201).json(newEvent);
            
            // Dispara sincronizações em segundo plano
            syncEventToGoogle(pool, ownerId, newEvent);
            sendEventToWebhook(pool, ownerId, newEvent); // <-- MODIFICAÇÃO ADICIONADA AQUI

        } catch (error) {
            console.error('Erro ao criar evento:', error);
            res.status(500).json({ message: 'Erro interno do servidor ao criar evento.' });
        }
    });

    // Rota PUT /events/:id
    router.put('/events/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { professional_id, client_name, client_cpf, client_telefone, start_time, end_time, status_id, notes } = req.body;
        if (!professional_id || !client_name || !start_time || !end_time) { return res.status(400).json({ message: 'Campos obrigatórios em falta.' }); }
        try {
            const query = `UPDATE eventos SET professional_id = $1, client_name = $2, client_cpf = $3, client_telefone = $4, start_time = $5, end_time = $6, status_id = $7, notes = $8 WHERE id = $9 AND user_id = $10 RETURNING *;`;
            const values = [professional_id, client_name, client_cpf, client_telefone, start_time, end_time, status_id, notes, id, ownerId];
            const result = await pool.query(query, values);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Evento não encontrado.' }); }
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota PATCH /events/:id/status
    router.patch('/events/:id/status', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { status_id } = req.body;
        if (!status_id) {
            return res.status(400).json({ message: 'O novo status_id é obrigatório.' });
        }
        try {
            const query = `UPDATE eventos SET status_id = $1 WHERE id = $2 AND user_id = $3 RETURNING *;`;
            const result = await pool.query(query, [status_id, id, ownerId]);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Evento não encontrado.' }); }
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // Rota DELETE /events/:id - ATUALIZADA
    router.delete('/events/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            const getEventQuery = `SELECT id, google_event_id, professional_id FROM eventos WHERE id = $1 AND user_id = $2;`;
            const eventResult = await pool.query(getEventQuery, [id, ownerId]);

            if (eventResult.rowCount === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }

            const eventToDelete = eventResult.rows[0];

            await deleteEventFromGoogle(pool, ownerId, eventToDelete);
            
            const deleteQuery = `DELETE FROM eventos WHERE id = $1 AND user_id = $2;`;
            await pool.query(deleteQuery, [id, ownerId]);
            
            res.status(204).send();
        } catch (error) {
            console.error(`Erro no processo de exclusão do evento ${id}:`, error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });
    
    // Rota GET /professionals/:id/public-availability
    router.get('/professionals/:id/public-availability', async (req, res) => {
        const { id } = req.params;
        let { year, month } = req.query; 
        if (!year || !month) {
            const now = new Date();
            year = now.getFullYear();
            month = now.getMonth() + 1;
        }
        try {
            const appointmentDuration = 60; 
            const availQuery = 'SELECT * FROM professional_availability WHERE professional_id = $1';
            const availResult = await pool.query(availQuery, [id]);
            const weeklyAvailability = availResult.rows;
            const startDate = new Date(Date.UTC(year, month - 1, 1));
            const endDate = new Date(Date.UTC(year, month, 1));
            const eventsQuery = 'SELECT start_time FROM eventos WHERE professional_id = $1 AND start_time >= $2 AND start_time < $3';
            const eventsResult = await pool.query(eventsQuery, [id, startDate, endDate]);
            const bookedSlots = new Set(eventsResult.rows.map(event => event.start_time.getTime()));
            const availableDays = {};
            let currentDate = new Date(startDate);
            while (currentDate < endDate) {
                const dayOfWeek = currentDate.getUTCDay();
                const dayTemplates = weeklyAvailability.filter(a => a.day_of_week === dayOfWeek);
                const dateString = currentDate.toISOString().split('T')[0];
                if (dayTemplates.length > 0) {
                    availableDays[dateString] = [];
                    dayTemplates.forEach(template => {
                        const [startH, startM] = template.start_time.split(':').map(Number);
                        const [endH, endM] = template.end_time.split(':').map(Number);
                        let slotTime = new Date(currentDate);
                        slotTime.setUTCHours(startH, startM, 0, 0);
                        let endTime = new Date(currentDate);
                        endTime.setUTCHours(endH, endM, 0, 0);
                        while (slotTime < endTime) {
                            if (!bookedSlots.has(slotTime.getTime())) {
                                const hour = String(slotTime.getUTCHours()).padStart(2, '0');
                                const minute = String(slotTime.getUTCMinutes()).padStart(2, '0');
                                availableDays[dateString].push(`${hour}:${minute}`);
                            }
                            slotTime.setUTCMinutes(slotTime.getUTCMinutes() + appointmentDuration);
                        }
                    });
                }
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
            res.status(200).json(availableDays);
        } catch (error) {
            console.error("Erro ao buscar disponibilidade:", error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    return router;
};

calendarRoutes.getGoogleCalendarClient = getGoogleCalendarClient;
module.exports = calendarRoutes;