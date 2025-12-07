// ARQUIVO: backend/controllers/setupControllerV2.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Verifica se o setup já foi feito (se existe algum usuário).
 */
const getSetupStatus = (pool) => async (req, res) => {
    try {
        // Verifica se existe pelo menos 1 usuário no banco
        const userCheck = await pool.query('SELECT id FROM users LIMIT 1');
        
        // Se rowCount > 0, setup JÁ FOI FEITO (needsSetup = false)
        const needsSetup = userCheck.rowCount === 0;
        
        res.json({ needsSetup });
    } catch (error) {
        console.error('Erro status setup:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

/**
 * Cria o administrador inicial.
 * Lógica baseada no seu "meu-app-chamados-backend" + Debug.
 */
const createDevUser = (pool) => async (req, res) => {
    console.log('--- [V2] SETUP INICIADO ---');

    const { name, email, password, defaultPassword } = req.body;

    // 1. Tenta pegar a senha de ambas as variáveis possíveis (para garantir)
    const envPassword = process.env.SETUP_MASTER_PASSWORD || process.env.DEFAULT_PASSWORD;

    if (!envPassword) {
        return res.status(500).json({ message: 'ERRO: A senha mestre não está configurada no servidor (.env).' });
    }

    if (!name || !email || !password || !defaultPassword) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    // 2. COMPARAÇÃO (Trim para evitar erros de espaço)
    const inputPwd = String(defaultPassword).trim();
    const serverPwd = String(envPassword).trim();

    if (inputPwd !== serverPwd) {
        // --- MENSAGEM DE ERRO REVELADORA (DEBUG) ---
        return res.status(403).json({ 
            message: `Senha Inválida. DEBUG -> Recebido: '${inputPwd}' | Servidor espera: '${serverPwd}'` 
        });
    }

    try {
        // 3. Verifica duplicidade (Segurança extra)
        const userCheck = await pool.query('SELECT id FROM users LIMIT 1');
        if (userCheck.rowCount > 0) {
            return res.status(409).json({ message: 'O setup já foi realizado anteriormente.' });
        }

        // 4. Criação do Usuário
        const hashedPassword = await bcrypt.hash(password, 10);
        const apiKey = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;
        
        const insertQuery = `
            INSERT INTO users (name, email, password_hash, role, api_key) 
            VALUES ($1, $2, $3, 'dev', $4) 
            RETURNING id, name, email, role;
        `;
        
        const result = await pool.query(insertQuery, [name, email, hashedPassword, apiKey]);

        console.log('[V2] Sucesso! Admin criado.');
        
        res.status(201).json({
            message: 'Usuário administrador criado com sucesso!',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Erro no setup:', error);
        if (error.code === '23505') { 
            return res.status(409).json({ message: 'Este e-mail já está em uso.' });
        }
        res.status(500).json({ message: 'Erro interno ao criar administrador.' });
    }
};

module.exports = { getSetupStatus, createDevUser };