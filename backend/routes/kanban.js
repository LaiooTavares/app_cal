// FILE: backend/routes/kanban.js
const express = require('express');
const router = express.Router();

const getDataOwnerId = (user) => {
    if (user.role === 'cooperador' && user.creatorId) {
        return user.creatorId;
    }
    return user.userId;
};

module.exports = (pool, authenticateToken) => {

    // --- ALTERADO ---
    // Rota de leitura agora cria o status padrão "Novo Evento" se ele não existir.
    router.get('/kanban/statuses', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        try {
            let statusesResult = await pool.query(
                'SELECT * FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, name ASC',
                [ownerId]
            );

            // --- NOVO: Verificação Just-in-Time (JIT) do status do sistema ---
            const systemStatusExists = statusesResult.rows.some(status => status.is_system === true);

            if (!systemStatusExists) {
                // Se o status padrão "Novo Evento" não existe para este usuário, crie-o agora.
                const defaultStatusQuery = `
                    INSERT INTO kanban_statuses (name, color, sort_order, user_id, is_system) 
                    VALUES ($1, $2, $3, $4, $5) 
                    RETURNING *
                `;
                await pool.query(defaultStatusQuery, [
                    'Novo Evento', // name
                    '#8e44ad',     // color (sua cor padrão)
                    0,             // sort_order (sempre o primeiro por padrão)
                    ownerId,       // user_id
                    true           // is_system
                ]);

                // Re-busca os status para incluir o recém-criado na ordem correta
                statusesResult = await pool.query(
                    'SELECT * FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, name ASC',
                    [ownerId]
                );
            }
            // --- FIM DA VERIFICAÇÃO ---

            res.json(statusesResult.rows);
        } catch (error) {
            console.error("Erro ao buscar status do Kanban:", error);
            res.status(500).json({ message: "Erro interno do servidor." });
        }
    });

    // --- ALTERADO ---
    // Rota de criação agora calcula o sort_order e define is_system = false
    router.post('/kanban/statuses', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        // Não pegamos mais 'sort_order' do body, ele será calculado.
        const { name, color } = req.body; 
        if (!name) {
            return res.status(400).json({ message: "O nome do status é obrigatório." });
        }
        try {
            // --- NOVO: Calcular a próxima sort_order ---
            // O status "Novo Evento" é 0. Os novos começarão em 1, 2, 3...
            const maxOrderResult = await pool.query(
                'SELECT MAX(sort_order) as max_order FROM kanban_statuses WHERE user_id = $1',
                [ownerId]
            );
            const newSortOrder = (maxOrderResult.rows[0].max_order || 0) + 1;
            // --- FIM DO CÁLCULO ---

            const result = await pool.query(
                // Define explicitamente is_system = FALSE
                'INSERT INTO kanban_statuses (name, color, sort_order, user_id, is_system) VALUES ($1, $2, $3, $4, FALSE) RETURNING *',
                [name, color || '#8e44ad', newSortOrder, ownerId]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error("Erro ao criar status do Kanban:", error);
            if (error.code === '23505') {
                return res.status(409).json({ message: 'Já existe um status com este nome.' });
            }
            res.status(500).json({ message: "Erro interno do servidor." });
        }
    });

    // --- ALTERADO ---
    // Rota de atualização agora protege o status do sistema de ser renomeado.
    // 'sort_order' foi removido, pois deve ser atualizado apenas por /reorder.
    router.put('/kanban/statuses/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        const { name, color } = req.body; // 'sort_order' removido
        if (!name) {
            return res.status(400).json({ message: "O nome do status é obrigatório." });
        }
        try {
            // --- NOVO: Verificação de status do sistema ---
            const checkResult = await pool.query(
                'SELECT is_system FROM kanban_statuses WHERE id = $1 AND user_id = $2',
                [id, ownerId]
            );

            if (checkResult.rowCount === 0) {
                return res.status(404).json({ message: "Status não encontrado ou você não tem permissão." });
            }

            let query;
            let values;

            if (checkResult.rows[0].is_system) {
                // Se for do sistema, SÓ PERMITE atualizar a cor.
                // O nome "Novo Evento" é protegido.
                query = 'UPDATE kanban_statuses SET color = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
                values = [color, id, ownerId];
            } else {
                // Se for um status normal, permite atualizar nome e cor.
                query = 'UPDATE kanban_statuses SET name = $1, color = $2 WHERE id = $3 AND user_id = $4 RETURNING *';
                values = [name, color, id, ownerId];
            }
            // --- FIM DA VERIFICAÇÃO ---

            const result = await pool.query(query, values);
            res.json(result.rows[0]);

        } catch (error) {
            console.error("Erro ao atualizar status do Kanban:", error);
            res.status(500).json({ message: "Erro interno do servidor." });
        }
    });

    // --- ALTERADO ---
    // Rota de exclusão agora protege o status do sistema
    router.delete('/kanban/statuses/:id', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { id } = req.params;
        
        // --- NOVO: Usar transação para checar antes de deletar ---
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 1. Verifica se o status é do sistema
            const checkResult = await client.query(
                'SELECT is_system FROM kanban_statuses WHERE id = $1 AND user_id = $2',
                [id, ownerId]
            );

            if (checkResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: "Status não encontrado ou você não tem permissão." });
            }

            if (checkResult.rows[0].is_system) {
                // 2. Bloqueia a exclusão se for do sistema
                await client.query('ROLLBACK');
                return res.status(403).json({ message: 'Não é possível excluir o status padrão "Novo Evento".' });
            }

            // 3. Se não for, prossiga com a exclusão
            await client.query(
                'DELETE FROM kanban_statuses WHERE id = $1 AND user_id = $2',
                [id, ownerId]
            );
            
            await client.query('COMMIT');
            res.status(204).send();
        
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Erro ao excluir status do Kanban:", error);
            if (error.code === '23503') {
                // Sua verificação original (muito boa!) é mantida.
                return res.status(409).json({ message: 'Não é possível excluir este status pois ele está a ser usado por um ou mais eventos.' });
            }
            res.status(500).json({ message: "Erro interno do servidor." });
        } finally {
            client.release();
        }
    });

    // --- SEM ALTERAÇÕES ---
    // Esta rota está correta. Ela permitirá que o usuário reordene
    // inclusive o status "Novo Evento", o que é um comportamento desejado.
    router.post('/kanban/statuses/reorder', authenticateToken, async (req, res) => {
        const ownerId = getDataOwnerId(req.user);
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds)) {
            return res.status(400).json({ message: "Um array de IDs ordenados é obrigatório." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (let i = 0; i < orderedIds.length; i++) {
                const statusId = orderedIds[i];
                const sortOrder = i; // --- ALTERAÇÃO SUTIL: Ordem baseada em 0 ---
                // Começar em 0 (i) é mais consistente com o sort_order = 0 do "Novo Evento"
                await client.query(
                    'UPDATE kanban_statuses SET sort_order = $1 WHERE id = $2 AND user_id = $3',
                    [sortOrder, statusId, ownerId]
                );
            }
            await client.query('COMMIT');
            res.status(200).json({ message: "Ordem atualizada com sucesso." });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Erro ao reordenar status do Kanban:", error);
            res.status(500).json({ message: "Erro interno do servidor ao reordenar." });
        } finally {
            client.release();
        }
    });

    return router;
};