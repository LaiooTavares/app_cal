// Referência: backend/controllers/setupControllerV2.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Verifica se o setup já foi feito (se existe algum usuário).
 */
const getSetupStatus = (pool) => async (req, res) => {
    try {
        // Verifica se existe pelo menos 1 usuário no banco
        const userCheck = await pool.query('SELECT id FROM users LIMIT 1');
        
        // Se rowCount > 0, significa que JÁ TEM usuário, então needsSetup = false.
        // Se rowCount == 0, o banco está vazio, então needsSetup = true.
        const needsSetup = userCheck.rowCount === 0;
        
        console.log(`[V2] Status do Setup verificado. Precisa de setup? ${needsSetup}`);
        res.status(200).json({ needsSetup });
    } catch (error) {
        console.error('[V2] Erro ao verificar status:', error);
        res.status(500).json({ message: 'Erro interno ao verificar setup.' });
    }
};

/**
 * Cria o administrador inicial.
 */
const createDevUser = (pool) => async (req, res) => {
    console.log('--- [V2] TENTATIVA DE CRIAÇÃO DE ADMIN ---');

    const { name, email, password, defaultPassword } = req.body;

    // 1. Recupera a senha do .env (Tenta os dois nomes comuns para garantir)
    const serverMasterPassword = process.env.SETUP_MASTER_PASSWORD || process.env.DEFAULT_PASSWORD;

    if (!serverMasterPassword) {
        console.error('[V2] ERRO CRÍTICO: Variável de ambiente da senha mestre não encontrada.');
        return res.status(500).json({ message: 'Erro de configuração do servidor (Senha Mestre não definida).' });
    }

    if (!name || !email || !password || !defaultPassword) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    // 2. Normalização e Comparação (Remove espaços para evitar erros bobos)
    const inputPwd = String(defaultPassword).trim();
    const serverPwd = String(serverMasterPassword).trim();

    // LOG DE DEBUG (Dedo-duro): Vai mostrar no console do servidor o que chegou vs o que ele espera
    console.log(`[V2] Comparando: Recebido='${inputPwd}' vs Esperado='${serverPwd}'`);

    if (inputPwd !== serverPwd) {
        // Retorna o erro detalhado para a tela (apenas para debug, remova em produção real depois)
        return res.status(403).json({ 
            message: `Senha de autorização inválida. DEBUG: Recebi '${inputPwd}' mas o servidor espera '${serverPwd}'` 
        });
    }

    try {
        // 3. Verificação de Segurança (Garante que o banco está vazio)
        const checkUsers = await pool.query('SELECT count(*) FROM users');
        if (parseInt(checkUsers.rows[0].count) > 0) {
            return res.status(409).json({ message: 'O setup já foi realizado. Usuários já existem.' });
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

        console.log('[V2] Sucesso! Administrador criado:', email);
        
        return res.status(201).json({
            message: 'Administrador criado com sucesso!',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('[V2] Erro ao salvar no banco:', error);
        if (error.code === '23505') { 
            return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
        }
        return res.status(500).json({ message: 'Erro interno ao criar administrador.' });
    }
};

module.exports = { getSetupStatus, createDevUser };