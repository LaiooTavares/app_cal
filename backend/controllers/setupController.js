// Referência: backend/controllers/setupController.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Verifica se o setup inicial (criação do usuário dev) já foi realizado.
 * Esta função é pública e informa ao frontend se ele deve redirecionar para a página de setup.
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
 * Protegido pela senha padrão definida nas variáveis de ambiente.
 */
const createDevUser = (pool) => async (req, res) => {
    console.log('--- INÍCIO DA TENTATIVA DE SETUP ---');
    
    const { name, email, password, defaultPassword } = req.body;
    
    // Recupera a variável de ambiente
    const masterPasswordEnv = process.env.SETUP_MASTER_PASSWORD;

    // --- LOGS DE DEBUG (REMOVER EM PRODUÇÃO DEPOIS DE VALIDAR) ---
    // Isso vai nos mostrar exatamente o que o servidor tem guardado e o que ele recebeu
    // Usamos JSON.stringify para ver se existem espaços invisíveis ou caracteres estranhos
    console.log('[DEBUG COMPARAÇÃO] Variável ENV bruta:', JSON.stringify(masterPasswordEnv));
    console.log('[DEBUG COMPARAÇÃO] Input do Usuário bruto:', JSON.stringify(defaultPassword));
    // -------------------------------------------------------------

    if (!masterPasswordEnv) {
        console.error('[SETUP] ERRO CRÍTICO: SETUP_MASTER_PASSWORD não está definida no .env ou Environment Variables.');
        return res.status(500).json({ message: 'Erro de configuração interna: Senha Mestre não definida.' });
    }

    if (!name || !email || !password || !defaultPassword) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    // Normalização agressiva para garantir comparação justa
    const normalizedInput = String(defaultPassword).trim();
    const normalizedMaster = String(masterPasswordEnv).trim();

    console.log(`[DEBUG COMPARAÇÃO] Após trim() -> ENV: "${normalizedMaster}" vs INPUT: "${normalizedInput}"`);

    if (normalizedInput !== normalizedMaster) {
        console.warn(`[SETUP] Falha na autenticação. As senhas não coincidem.`);
        return res.status(403).json({ 
            message: 'Senha de autorização para setup inválida.',
            debug_info: 'Verifique os logs do servidor para detalhe da comparação.' 
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