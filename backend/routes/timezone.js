// backend/routes/timezone.js
const express = require('express');
const router = express.Router();

// Esta função recebe a conexão do banco de dados (pool) do server.js
const timezoneRoutes = (pool) => {
    
    // ROTA GET MELHORADA - Busca o fuso horário atual do usuário logado.
    router.get('/', async (req, res) => {
        const userId = req.user.userId; // ID do usuário vem do token de autenticação

        try {
            const query = 'SELECT timezone FROM users WHERE id = $1';
            const result = await pool.query(query, [userId]);

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            
            // Retorna o timezone salvo ou um padrão se for nulo
            const timezone = result.rows[0].timezone || 'America/Sao_Paulo';
            res.status(200).json({ timezone: timezone });

        } catch (error) {
            console.error('Erro ao buscar fuso horário:', error);
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    });

    // ROTA POST ADICIONADA - Salva o novo fuso horário para o usuário logado.
    router.post('/', async (req, res) => {
        const userId = req.user.userId; // ID do usuário vem do token
        const { timezone } = req.body; // Novo fuso horário vem do corpo da requisição

        // Validação simples para garantir que um fuso horário foi enviado
        if (!timezone) {
            return res.status(400).json({ message: 'O fuso horário é obrigatório.' });
        }

        try {
            const query = 'UPDATE users SET timezone = $1 WHERE id = $2';
            await pool.query(query, [timezone, userId]);

            res.status(200).json({ message: 'Fuso horário atualizado com sucesso.' });

        } catch (error)
        {
            console.error('Erro ao salvar fuso horário:', error);
            res.status(500).json({ message: 'Erro interno do servidor ao salvar fuso horário.' });
        }
    });

    return router;
};

module.exports = timezoneRoutes;