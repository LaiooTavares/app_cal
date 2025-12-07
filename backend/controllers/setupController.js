// Referência: backend/controllers/setupController.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Verifica se o setup inicial (criação do usuário dev) já foi realizado.
 * Esta função é pública e informa ao frontend se ele deve redirecionar para a página de setup.
 */
const getSetupStatus = (pool) => async (req, res) => {
    try {
        // A consulta agora verifica por múltiplos nomes de roles em minúsculas para ser mais robusta.
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
    const { name, email, password, defaultPassword } = req.body;
    
    // Recupera a senha mestre e garante que espaços em branco extras sejam removidos
    const masterPasswordEnv = process.env.SETUP_MASTER_PASSWORD;

    if (!masterPasswordEnv) {
        console.error('[SETUP] ERRO CRÍTICO: A variável de ambiente SETUP_MASTER_PASSWORD não está configurada.');
        return res.status(500).json({ message: 'Erro de configuração interna do servidor.' });
    }

    if (!name || !email || !password || !defaultPassword) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios: nome, e-mail, nova senha e a senha padrão.' });
    }

    // Normalização para comparação segura: converte para string e remove espaços das pontas de AMBOS os lados
    const normalizedInputPassword = String(defaultPassword).trim();
    const normalizedMasterPassword = String(masterPasswordEnv).trim();

    if (normalizedInputPassword !== normalizedMasterPassword) {
        console.warn(`[SETUP] Tentativa de setup falhou: Senha mestre incorreta.`);
        return res.status(403).json({ message: 'Senha de autorização para setup inválida.' });
    }
    
    try {
        // Verifica novamente se já existe usuário para evitar condições de corrida
        const devCheckQuery = `SELECT COUNT(*) FROM users WHERE LOWER(role) IN ('dev', 'developer', 'admin', 'administrator')`;
        const devCheckResult = await pool.query(devCheckQuery);

        if (parseInt(devCheckResult.rows[0].count, 10) > 0) {
            return res.status(409).json({ message: 'O setup já foi concluído. A senha padrão não pode mais ser usada.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        // Gera uma API Key segura para uso futuro
        const apiKey = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;
        const devRole = 'dev';

        const newUserQuery = `
            INSERT INTO users (name, email, password_hash, role, api_key) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, name, email, role, created_at;
        `;
        const values = [name, email, hashedPassword, devRole, apiKey];

        const result = await pool.query(newUserQuery, values);
        
        console.log(`[SETUP] Administrador inicial criado com sucesso: ${email}`);

        res.status(201).json({
            message: 'Usuário desenvolvedor criado com sucesso!',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Erro durante o setup do usuário dev:', error);
        
        // Código de erro do PostgreSQL para violação de chave única (Unique Constraint)
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
        }
        
        res.status(500).json({ message: 'Erro interno do servidor ao tentar criar usuário dev.' });
    }
};

module.exports = {
    getSetupStatus,
    createDevUser
};