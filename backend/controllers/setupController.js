// Referência: backend/controllers/setupController.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Verifica se o setup inicial (criação do usuário dev) já foi realizado.
 */
const getSetupStatus = (pool) => async (req, res) => {
    try {
        const devCheckQuery = `SELECT COUNT(*) FROM users WHERE LOWER(role) IN ('dev', 'developer', 'admin', 'administrator')`;
        const { rows } = await pool.query(devCheckQuery);
        
        const needsSetup = parseInt(rows[0].count, 10) === 0;

        res.status(200).json({ needsSetup });

    } catch (error) {
        console.error('Erro ao verificar o status do setup:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao verificar o status.' });
    }
};

/**
 * Cria o primeiro usuário 'dev' da aplicação.
 * VERSÃO DE DIAGNÓSTICO: Retorna os valores recebidos na mensagem de erro.
 */
const createDevUser = (pool) => async (req, res) => {
    console.log('--- [DEBUG] TENTATIVA DE SETUP ---');
    
    // Tenta pegar de qualquer variação possível para garantir
    const { name, email, password, defaultPassword, masterPassword, accessCode } = req.body;
    
    // Prioridade: defaultPassword (que está no seu HTML)
    const passwordReceived = defaultPassword || masterPassword || accessCode;
    const masterPasswordEnv = process.env.SETUP_MASTER_PASSWORD;

    if (!masterPasswordEnv) {
        return res.status(500).json({ message: 'ERRO CRÍTICO: SETUP_MASTER_PASSWORD não definida no servidor.' });
    }

    if (!name || !email || !password || !passwordReceived) {
        return res.status(400).json({ 
            // Mostra exatamente o que chegou no corpo da requisição
            message: `Campos faltando. O backend recebeu: ${JSON.stringify(req.body)}` 
        });
    }

    // Limpeza de espaços (trim) e conversão para string
    const normalizedInput = String(passwordReceived).trim();
    const normalizedMaster = String(masterPasswordEnv).trim();

    // COMPARAÇÃO
    if (normalizedInput !== normalizedMaster) {
        // --- MENSAGEM DE ERRO DETALHADA PARA VOCÊ VER NA TELA ---
        return res.status(403).json({ 
            message: `DEBUG (Não é erro de código, é divergência): Recebi '${normalizedInput}' (tamanho: ${normalizedInput.length}) mas a senha no servidor é '${normalizedMaster}' (tamanho: ${normalizedMaster.length})` 
        });
    }
    
    try {
        const devCheckQuery = `SELECT COUNT(*) FROM users WHERE LOWER(role) IN ('dev', 'developer', 'admin', 'administrator')`;
        const devCheckResult = await pool.query(devCheckQuery);

        if (parseInt(devCheckResult.rows[0].count, 10) > 0) {
            return res.status(409).json({ message: 'O setup já foi concluído anteriormente.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const apiKey = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;
        const devRole = 'dev';

        const newUserQuery = `
            INSERT INTO users (name, email, password_hash, role, api_key) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, name, email, role, created_at;
        `;
        const values = [name, email, hashedPassword, devRole, apiKey];

        const result = await pool.query(newUserQuery, values);
        
        console.log(`[SETUP] Sucesso! Usuário criado: ${email}`);

        res.status(201).json({
            message: 'Usuário desenvolvedor criado com sucesso!',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Erro durante o setup:', error);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
        }
        res.status(500).json({ message: 'Erro interno ao criar usuário.' });
    }
};

module.exports = {
    getSetupStatus,
    createDevUser
};