// FILE: backend/routes/setup.js
const express = require('express'); // Necessário para o router
const bcrypt = require('bcryptjs'); // Necessário para hashear a senha

// As importações 'dotenv', 'pg' (Pool) e 'cors' não são usadas aqui
// e pertencem ao 'server.js' principal.

/**
 * @param {import('pg').Pool} pool - O pool de conexão do PostgreSQL.
 * @returns {import('express').Router}
 */
module.exports = (pool) => {

    // --- [CORREÇÃO] ---
    // O 'router' não estava definido.
    // Esta linha inicializa o router do Express.
    const router = express.Router();
    // --- [FIM DA CORREÇÃO] ---

    /**
     * @route   GET /api/setup/status
     * @desc    Verifica se a configuração inicial (o primeiro usuário) já foi feita.
     * @access  Public
     */
    router.get('/status', async (req, res) => {
        try {
            // Reutilizamos a mesma lógica da rota POST:
            // Verificamos se existe *qualquer* usuário no banco.
            const userCheck = await pool.query('SELECT id FROM users LIMIT 1');

            if (userCheck.rowCount > 0) {
                // Já existem usuários. Setup NÃO é necessário.
                res.json({ needsSetup: false });
            } else {
                // Não há usuários. Setup É necessário.
               res.json({ needsSetup: true });
            }
        } catch (error) {
            console.error('Erro ao verificar status do setup:', error);
            res.status(500).json({ message: 'Erro interno ao verificar o setup.' });
        }
    });


    /**
     * Rota para criar o primeiro usuário "dev" (Administrador Master) do sistema.
     * ... (seu código existente) ...
     */
    router.post('/create-dev-user', async (req, res) => {
        // ... (todo o seu código da rota POST /create-dev-user fica aqui) ...
        // .... (não precisa mudar nada nele) ...
        const { name, email, password, defaultPassword } = req.body;

        // 1. Pega a senha secreta do .env
        const setupSecret = process.env.DEFAULT_PASSWORD;

        // 2. Valida se a senha de setup foi enviada e se está correta
        if (!setupSecret || defaultPassword !== setupSecret) {
            return res.status(403).json({ message: 'Senha de autorização para setup inválida.' });
        }

        // 3. Valida os campos básicos
         if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
        }

        try {
            // 4. Verifica se já existe QUALQUER usuário no banco de dados
            const userCheck = await pool.query('SELECT id FROM users LIMIT 1');
            
            if (userCheck.rowCount > 0) {
                return res.status(409).json({ message: 'O setup já foi realizado. Já existem usuários no sistema.' });
            }

            // 5. Hashear a senha do novo usuário
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

s           // 6. Insere o novo usuário com a role 'dev' (super admin)
            const newUserQuery = `
                INSERT INTO users (name, email, password_hash, role) 
                VALUES ($1, $2, $3, 'dev') 
                RETURNING id, name, email, role;
s           `;
            const newUserResult = await pool.query(newUserQuery, [name, email, passwordHash]);

i           // 7. Retorna sucesso
            res.status(201).json({
                message: 'Usuário administrador criado com sucesso!',
                user: newUserResult.rows[0]
            });

        } catch (error) {
            console.error('Erro crítico durante o setup:', error);
            if (error.code === '23505') { 
                return res.status(409).json({ message: 'Este e-mail já está em uso.' });
s           }
            res.status(500).json({ message: 'Erro interno do servidor durante o setup.' });
        }
    });

    // Retorna o router para ser usado no server.js
    return router;
};