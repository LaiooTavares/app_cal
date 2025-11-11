// backend/routes/users.js
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { authorizeRole } = require('../middlewares/auth'); // Assumindo que moveremos os middlewares para uma pasta futuramente

const router = express.Router();

// Função para ser exportada e receber a conexão com o banco (pool)
const userRoutes = (pool) => {

    // POST /api/users - Rota para criar um novo usuário (cliente ou cooperador)
    router.post('/', authorizeRole(['dev', 'developer', 'administrator', 'admin']), async (req, res) => {
        const { name, email, password, role } = req.body;
        const creatorId = (role === 'cooperador') ? req.user.userId : null;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // CORREÇÃO: Geramos a nova chave de API segura aqui
            const apiKey = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;

            // ATUALIZADO: A query de inserção agora inclui a api_key
            const newUserQuery = `
                INSERT INTO users (name, email, password_hash, role, creator_id, api_key) 
                VALUES ($1, $2, $3, $4, $5, $6) 
                RETURNING id, name, email, role, created_at;
            `;
            const values = [name, email, hashedPassword, role, creatorId, apiKey];

            const result = await pool.query(newUserQuery, values);
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            if (error.code === '23505') {
                return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
            }
            res.status(500).json({ message: 'Erro interno do servidor ao tentar criar usuário.' });
        }
    });

    // Adicione outras rotas relacionadas a usuários aqui no futuro (ex: GET /, GET /:id, PUT /:id)

    return router;
};

module.exports = userRoutes;