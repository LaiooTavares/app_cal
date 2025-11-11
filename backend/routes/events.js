// backend/routes/events.js
const express = require('express');
const router = express.Router();

// 1. Receber a instância 'io' do server.js
const eventRoutes = (pool, { io, getDataOwnerId, sendWebhookNotification, syncEventToGoogle, deleteEventFromGoogle }) => {

    // Todas as rotas neste ficheiro já estão protegidas por autenticação
    
    router.get('/', async (req, res) => {
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

    router.get('/:id', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            // [MODIFICADO] Adiciona o JOIN para buscar status
            const query = `
                SELECT e.*, p.name as professional_name, ks.name as status, ks.color as status_color
                FROM eventos e 
                LEFT JOIN professionals p ON e.professional_id = p.id
                LEFT JOIN kanban_statuses ks ON e.status_id = ks.id
                WHERE e.id = $1 AND e.user_id = $2
            `;
            const result = await pool.query(query, [id, ownerId]);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Evento não encontrado.' }); }
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    router.post('/', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id, client_name, client_cpf, client_telefone, start_time, end_time, notes } = req.body;
        if (!professional_id || !client_name || !start_time || !end_time) { return res.status(400).json({ message: 'Campos obrigatórios em falta.' }); }
        
        try {
            // --- [INÍCIO DA CORREÇÃO DE TIMEZONE] ---

            // 1. Buscar o timezone do usuário (dono da conta)
            const userTimezoneResult = await pool.query('SELECT timezone FROM users WHERE id = $1', [ownerId]);
            const userTimezone = userTimezoneResult.rows[0]?.timezone || 'America/Sao_Paulo'; // Fallback

            // 2. Converter o start_time e end_time (que vêm com fuso) para o dia e hora locais corretos *nesse timezone*
            // Usamos o Postgres para garantir a conversão correta e o dia da semana no padrão ISO (1-7)
            const startTimeISO = new Date(start_time).toISOString(); // Converte para UTC (ex: "2025-11-10T13:00:00.000Z")
            const endTimeISO = new Date(end_time).toISOString();     // Converte para UTC (ex: "2025-11-10T14:00:00.000Z")

            const timeCheckQuery = `
                SELECT 
                    EXTRACT(ISODOW FROM $1::timestamptz AT TIME ZONE $3) as local_day_of_week,
                    ($1::timestamptz AT TIME ZONE $3)::time as local_start_time,
                    ($2::timestamptz AT TIME ZONE $3)::time as local_end_time;
            `;
            const timeCheckResult = await pool.query(timeCheckQuery, [startTimeISO, endTimeISO, userTimezone]);

            const dayOfWeek = timeCheckResult.rows[0].local_day_of_week; // Ex: 1 (Segunda-feira)
            const timeOfDay = timeCheckResult.rows[0].local_start_time;       // Ex: "10:00:00"
            const endTimeOfDay = timeCheckResult.rows[0].local_end_time;     // Ex: "11:00:00"
            
            // 3. Validar a disponibilidade usando os valores locais corretos
            const availabilityQuery = `SELECT 1 FROM professional_availability WHERE professional_id = $1 AND day_of_week = $2 AND $3::time >= start_time AND $4::time <= end_time;`;
            const availabilityResult = await pool.query(availabilityQuery, [professional_id, dayOfWeek, timeOfDay, endTimeOfDay]);
            
            if (availabilityResult.rowCount === 0) { 
                return res.status(400).json({ message: 'Horário indisponível ou fora do expediente do profissional.' }); 
            }

            // --- [FIM DA CORREÇÃO DE TIMEZONE] ---

            // A verificação de conflito usa o timestamp completo, então estava correta.
            const conflictQuery = `SELECT 1 FROM eventos WHERE professional_id = $1 AND start_time = $2;`;
            const conflictResult = await pool.query(conflictQuery, [professional_id, start_time]);
            if (conflictResult.rowCount > 0) { return res.status(409).json({ message: 'Conflito: Este horário já foi agendado.' }); }
            
            // --- [INÍCIO DA MODIFICAÇÃO (Payload de Status)] ---
            // 1. Modifica a query para buscar o nome e a cor do status
            const defaultStatusQuery = 'SELECT id, name, color FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, id ASC LIMIT 1';
            const statusResult = await pool.query(defaultStatusQuery, [ownerId]);
            if (statusResult.rowCount === 0) { return res.status(400).json({ message: "Nenhum status padrão do Kanban configurado. Crie um status antes de agendar." }); }
            
            const defaultStatusId = statusResult.rows[0].id;
            // --- [FIM DA MODIFICAÇÃO (Payload de Status)] ---
            
            const insertQuery = `INSERT INTO eventos (professional_id, user_id, client_name, client_cpf, client_telefone, start_time, end_time, status_id, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;`;
            const values = [professional_id, ownerId, client_name, client_cpf, client_telefone, start_time, end_time, defaultStatusId, notes];
            const result = await pool.query(insertQuery, values);
            const newEvent = result.rows[0];
            
            // --- [INÍCIO DA MODIFICAÇÃO (Payload de Status)] ---
            // 2. Adiciona os dados do profissional E do status ao objeto
            const profResult = await pool.query('SELECT name, color FROM professionals WHERE id = $1', [newEvent.professional_id]);
            newEvent.professional_name = profResult.rows[0]?.name || 'N/A';
            newEvent.professional_color = profResult.rows[0]?.color || '#ccc'; // Adiciona a cor do profissional
            newEvent.status = statusResult.rows[0]?.name || 'Sem status';
            newEvent.status_color = statusResult.rows[0]?.color || '#7f8c8d';
            // --- [FIM DA MODIFICAÇÃO (Payload de Status)] ---
            
            // Envia a resposta para o cliente imediatamente
            res.status(201).json(newEvent);

            // Dispara as ações "fire-and-forget" (não bloqueantes)
            syncEventToGoogle(pool, ownerId, newEvent);
            sendWebhookNotification(ownerId, 'event_created', newEvent); 

            // 2. Emitir o evento 'event_created' para todos os clientes conectados
            if (io) {
                console.log('[Socket.IO] Emitindo evento: event_created');
                // O newEvent agora contém nome do profissional E dados do status
                io.emit('event_created', newEvent);
            }

        } catch (error) {
            console.error('Erro ao criar evento:', error);
            res.status(500).json({ message: 'Erro interno do servidor ao criar evento.' });
        }
    });

    router.put('/:id', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { professional_id, client_name, client_cpf, client_telefone, start_time, end_time, status_id, notes } = req.body;
        if (!professional_id || !client_name || !start_time || !end_time) { return res.status(400).json({ message: 'Campos obrigatórios em falta.' }); }
        try {
            const query = `UPDATE eventos SET professional_id = $1, client_name = $2, client_cpf = $3, client_telefone = $4, start_time = $5, end_time = $6, status_id = $7, notes = $8 WHERE id = $9 AND user_id = $10 RETURNING *;`;
            const values = [professional_id, client_name, client_cpf, client_telefone, start_time, end_time, status_id, notes, id, ownerId];
            const result = await pool.query(query, values);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Evento não encontrado.' }); }

            const updatedEvent = result.rows[0];

            // --- [INÍCIO DA MODIFICAÇÃO (Payload de Status)] ---
            // 3. Adiciona dados do profissional e do status antes de enviar
            const profResult = await pool.query('SELECT name, color FROM professionals WHERE id = $1', [updatedEvent.professional_id]);
            updatedEvent.professional_name = profResult.rows[0]?.name || 'N/A';
            updatedEvent.professional_color = profResult.rows[0]?.color || '#ccc';

            const statusResult = await pool.query('SELECT name, color FROM kanban_statuses WHERE id = $1', [updatedEvent.status_id]);
            if (statusResult.rows[0]) {
                updatedEvent.status = statusResult.rows[0].name;
                updatedEvent.status_color = statusResult.rows[0].color;
            } else {
                updatedEvent.status = 'Sem status';
                updatedEvent.status_color = '#7f8c8d';
            }
            // --- [FIM DA MODIFICAÇÃO (Payload de Status)] ---

            res.status(200).json(updatedEvent);

            sendWebhookNotification(ownerId, 'event_updated', updatedEvent);

            // 3. Emitir o evento 'event_updated'
            if (io) {
                console.log('[Socket.IO] Emitindo evento: event_updated');
                io.emit('event_updated', updatedEvent);
            }

        } catch (error) {
            console.error('Erro ao atualizar evento (PUT):', error); 
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    router.patch('/:id/status', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { status_id } = req.body;
        if (!status_id) { return res.status(400).json({ message: 'O novo status_id é obrigatório.' }); }
        try {
            // --- [INÍCIO DA MODIFICAÇÃO (Payload de Status)] ---
            // 4. Query modificada para juntar professionals e kanban_statuses
            const query = `
                UPDATE eventos e SET status_id = $1 
                WHERE e.id = $2 AND e.user_id = $3 
                RETURNING e.*, 
                          (SELECT p.name FROM professionals p WHERE p.id = e.professional_id) as professional_name,
                          (SELECT p.color FROM professionals p WHERE p.id = e.professional_id) as professional_color,
                          (SELECT ks.name FROM kanban_statuses ks WHERE ks.id = e.status_id) as status,
                          (SELECT ks.color FROM kanban_statuses ks WHERE ks.id = e.status_id) as status_color
            `;
            // --- [FIM DA MODIFICAÇÃO (Payload de Status)] ---
            
            const result = await pool.query(query, [status_id, id, ownerId]);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Evento não encontrado.' }); }

            const updatedEvent = result.rows[0];
            
            res.status(200).json(updatedEvent);

            sendWebhookNotification(ownerId, 'event_updated', updatedEvent);

            // 4. Emitir o evento 'event_updated' (mudança de status também é uma atualização)
            if (io) {
                console.log('[Socket.IO] Emitindo evento: event_updated (via status patch)');
                io.emit('event_updated', updatedEvent);
            }

        } catch (error) {
            console.error('Erro ao atualizar status (PATCH):', error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    router.delete('/:id', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            // --- [INÍCIO DA MODIFICAÇÃO (Payload de Status)] ---
            // 5. Query modificada para juntar tudo antes de deletar
            const getEventQuery = `
                SELECT e.*, 
                       p.name as professional_name, 
                       p.color as professional_color,
                       ks.name as status, 
                       ks.color as status_color 
                FROM eventos e 
                LEFT JOIN professionals p ON e.professional_id = p.id 
                LEFT JOIN kanban_statuses ks ON e.status_id = ks.id
                WHERE e.id = $1 AND e.user_id = $2;
            `;
            // --- [FIM DA MODIFICAÇÃO (Payload de Status)] ---

            const eventResult = await pool.query(getEventQuery, [id, ownerId]);
            if (eventResult.rowCount === 0) {
                return res.status(404).json({ message: 'Evento não encontrado.' });
            }
            const eventToDelete = eventResult.rows[0]; // Dados completos para o webhook

            await deleteEventFromGoogle(pool, ownerId, eventToDelete);
            const deleteQuery = `DELETE FROM eventos WHERE id = $1 AND user_id = $2;`;
            await pool.query(deleteQuery, [id, ownerId]);
            
            res.status(204).send();

            sendWebhookNotification(ownerId, 'event_deleted', eventToDelete);

            // 5. Emitir o evento 'event_deleted'
            if (io) {
                console.log('[Socket.IO] Emitindo evento: event_deleted');
                io.emit('event_deleted', eventToDelete);
            }

        } catch (error) {
            console.error(`Erro no processo de exclusão do evento ${id}:`, error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    return router;
};

module.exports = eventRoutes;