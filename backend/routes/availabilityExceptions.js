// backend/routes/availabilityExceptions.js
console.log('--- [DIAGNÓSTICO] Carregando availabilityExceptions.js V4 (Completo) ---');

const express = require('express');
const router = express.Router();

const availabilityExceptionsRoutes = (pool, { getDataOwnerId }) => {
    
    /**
     * Rota GET: Buscar exceções.
     * - Se (professional_id) for fornecido: Retorna TODAS as exceções do profissional.
     * - Se (professional_id E exception_date) forem fornecidos: Retorna exceções do dia.
     */
    router.get('/', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id, exception_date } = req.query; // exception_date agora é opcional

        // 1. Validar: professional_id é o único obrigatório
        if (!professional_id) {
            return res.status(400).json({ message: 'professional_id é obrigatório na query.' });
        }

        try {
            // 2. Query base segura
            const values = [ownerId, professional_id];
            let query = `
                SELECT ae.* FROM availability_exceptions ae
                JOIN professionals p ON ae.professional_id = p.id
                WHERE p.administrator_id = $1
                  AND ae.professional_id = $2
            `;
            
            // 3. Adicionar filtro de data APENAS se ele for fornecido
            if (exception_date) {
                values.push(exception_date);
                query += ` AND ae.exception_date = $${values.length}`;
            }

            query += ' ORDER BY ae.exception_date, ae.start_time;'; // Ordena os resultados
            
            const result = await pool.query(query, values);
            
            // 4. Retorna os resultados (agora funciona para o fetchExceptions() inicial)
            res.status(200).json(result.rows);

        } catch (error) {
            console.error('Erro ao buscar exceções de disponibilidade:', error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    /**
     * Rota POST: Criar uma nova exceção (dia inteiro ou horário).
     */
    router.post('/', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { professional_id, exception_date, start_time, end_time } = req.body;

        if (!professional_id || !exception_date) {
            return res.status(400).json({ message: 'ID do profissional e data da exceção são obrigatórios.' });
        }

        try {
            const profResult = await pool.query(
                'SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2',
                [professional_id, ownerId]
            );

            if (profResult.rowCount === 0) {
                return res.status(404).json({ message: 'Profissional não encontrado ou não pertence a este usuário.' });
            }

            const insertQuery = `
                INSERT INTO availability_exceptions (professional_id, exception_date, start_time, end_time)
                VALUES ($1, $2, $3, $4)
                RETURNING *;
            `;
            const result = await pool.query(insertQuery, [
                professional_id, 
                exception_date, 
                start_time || null, 
                end_time || null
            ]);

            res.status(201).json(result.rows[0]);

        } catch (error) {
            console.error('Erro ao criar exceção de disponibilidade:', error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    /**
     * Rota PUT: Atualizar um horário de exceção existente.
     * (O frontend já tenta usar isso na função 'saveExceptionInterval')
     */
    router.put('/:id', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { start_time, end_time } = req.body; // Apenas atualiza horários

        if (!start_time || !end_time) {
            return res.status(400).json({ message: 'Start_time e end_time são obrigatórios para atualização.' });
        }

        try {
            // Query segura que atualiza a exceção (ae)
            // E verifica se o dono (p.administrator_id) é o usuário logado
            const query = `
                UPDATE availability_exceptions ae
                SET start_time = $1, end_time = $2
                FROM professionals p
                WHERE ae.id = $3
                  AND ae.professional_id = p.id
                  AND p.administrator_id = $4
                RETURNING ae.*;
            `;
            const result = await pool.query(query, [start_time, end_time, id, ownerId]);
            
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Exceção não encontrada ou você não tem permissão para editá-la.' });
            }

            res.status(200).json(result.rows[0]);

        } catch (error) {
            console.error('Erro ao atualizar exceção:', error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    /**
     * Rota DELETE: Excluir uma exceção (dia inteiro ou horário).
     * (O frontend já tenta usar isso em 'handleBlockDayToggle' e 'deleteExceptionInterval')
     */
    router.delete('/:id', async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;

        try {
            // Query segura que deleta a exceção (ae)
            // E verifica se o dono (p.administrator_id) é o usuário logado
            const query = `
                DELETE FROM availability_exceptions ae
                USING professionals p
                WHERE ae.id = $1
                  AND ae.professional_id = p.id
                  AND p.administrator_id = $2;
            `;
            const result = await pool.query(query, [id, ownerId]);

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Exceção não encontrada ou você não tem permissão para excluí-la.' });
            }

            res.status(204).send(); // Sucesso, sem conteúdo

        } catch (error) {
            console.error('Erro ao excluir exceção:', error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    return router;
};

module.exports = availabilityExceptionsRoutes;