// backend/routes/professionals.js
const express = require('express');
const router = express.Router();

// A função recebe o 'pool' e os middlewares de autenticação
const professionalRoutes = (pool, { authenticateRequest, authorizeRole }) => {

    // Rota pública não usa middleware
    router.get('/:id/public-availability', async (req, res) => {
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
            
            const bookedSlots = new Set(eventsResult.rows.map(event => event.start_time.toISOString()));

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
                            if (!bookedSlots.has(slotTime.toISOString())) {
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

    // Rotas privadas usam o middleware 'authenticateRequest'
    const getDataOwnerId = (user) => user.role === 'cooperador' ? user.creatorId : user.userId;

    router.get('/', authenticateRequest, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        try {
            const query = 'SELECT * FROM professionals WHERE administrator_id = $1 ORDER BY name ASC';
            const result = await pool.query(query, [ownerId]);
            res.status(200).json(result.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor ao buscar profissionais.' });
        }
    });

    router.get('/:id', authenticateRequest, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            const query = 'SELECT * FROM professionals WHERE id = $1 AND administrator_id = $2';
            const result = await pool.query(query, [id, ownerId]);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Profissional não encontrado ou sem permissão.' }); }
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    router.post('/', authenticateRequest, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { name, email, specialties, crm, observations, color } = req.body;
        if (!name || !specialties || !crm) { return res.status(400).json({ message: 'Nome, especialidade e CRM são obrigatórios.' }); }
        try {
            const query = `INSERT INTO professionals (name, email, specialties, crm, observations, color, administrator_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
            const values = [name, email, specialties, crm, observations, color, ownerId];
            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor ao criar profissional.' });
        }
    });

    router.put('/:id', authenticateRequest, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { name, email, specialties, crm, observations, color } = req.body;
        if (!name || !specialties || !crm) { return res.status(400).json({ message: 'Nome, especialidade e CRM são obrigatórios.' }); }
        try {
            const query = `UPDATE professionals SET name = $1, email = $2, specialties = $3, observations = $4, crm = $5, color = $6 WHERE id = $7 AND administrator_id = $8 RETURNING *;`;
            const values = [name, email, specialties, observations, crm, color, id, ownerId];
            const result = await pool.query(query, values);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Profissional não encontrado ou sem permissão.' }); }
            res.status(200).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor ao atualizar profissional.' });
        }
    });

    router.delete('/:id', authenticateRequest, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        try {
            const query = `DELETE FROM professionals WHERE id = $1 AND administrator_id = $2;`;
            const values = [id, ownerId];
            const result = await pool.query(query, values);
            if (result.rowCount === 0) { return res.status(404).json({ message: 'Profissional não encontrado ou sem permissão.' }); }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor ao deletar profissional.' });
        }
    });

    return router;
};

module.exports = professionalRoutes;