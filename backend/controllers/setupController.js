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
 * Protegido pela senha padrão que só funciona uma vez.
 */
const createDevUser = (pool) => async (req, res) => {
    const { name, email, password, defaultPassword } = req.body;
    const masterPassword = 'Cal-2025';

    if (!name || !email || !password || !defaultPassword) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios: nome, e-mail, nova senha e a senha padrão.' });
    }

    // --- ALTERAÇÃO APLICADA AQUI ---
    // Converte para String (para garantir) e usa .trim() para remover 
    // espaços em branco no início ou no fim da senha digitada.
    const trimmedDefaultPassword = String(defaultPassword).trim();

    if (trimmedDefaultPassword !== masterPassword) {
        // Adiciona um log no servidor para depuração.
        // Se o erro continuar, verifique os logs do backend no Easypanel.
        console.warn(`[SETUP] Tentativa de setup com senha mestre incorreta.`);
        console.warn(`[SETUP] Esperado: '${masterPassword}' | Recebido: '${defaultPassword}'`);
        
        return res.status(403).json({ message: 'A senha padrão informada está incorreta.' });
    }
    // --- FIM DA ALTERAÇÃO ---
    
    try {
        const devCheckQuery = `SELECT COUNT(*) FROM users WHERE LOWER(role) IN ('dev', 'developer', 'admin', 'administrator')`;
        const devCheckResult = await pool.query(devCheckQuery);

        if (devCheckResult.rows[0].count > 0) {
            return res.status(409).json({ message: 'O setup já foi concluído. A senha padrão não pode mais ser usada.' });
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
        res.status(201).json({
            message: 'Usuário desenvolvedor criado com sucesso!',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Erro durante o setup do usuário dev:', error);
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