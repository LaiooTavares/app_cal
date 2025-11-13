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
    
    // --- ALTERAÇÃO APLICADA AQUI ---
    // A senha mestre agora é lida das variáveis de ambiente.
    // Ela DEVE ser configurada no .env (local) ou no painel (produção).
    const masterPassword = process.env.SETUP_MASTER_PASSWORD;

    // Verificação de segurança: Se a variável de ambiente não estiver definida no servidor,
    // a aplicação não deve permitir a criação do usuário.
    if (!masterPassword) {
        console.error('[SETUP] ERRO CRÍTICO: A variável de ambiente SETUP_MASTER_PASSWORD não está configurada.');
        // Retorna uma mensagem genérica ao usuário, mas loga o erro real no servidor.
        return res.status(500).json({ message: 'Erro de configuração interna do servidor.' });
    }
    // --- FIM DA ALTERAÇÃO ---

    if (!name || !email || !password || !defaultPassword) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios: nome, e-mail, nova senha e a senha padrão.' });
    }

    // Converte para String (para garantir) e usa .trim() para remover 
    // espaços em branco no início ou no fim da senha digitada.
    const trimmedDefaultPassword = String(defaultPassword).trim();

    if (trimmedDefaultPassword !== masterPassword) {
        // Adiciona um log no servidor para depuração.
        // Se o erro continuar, verifique os logs do backend no Easypanel.
        console.warn(`[SETUP] Tentativa de setup com senha mestre incorreta.`);
        // Nota: Não logamos mais a senha esperada (masterPassword) por razões de segurança.
        console.warn(`[SETUP] Recebido: '${defaultPassword}'`);
        
        return res.status(403).json({ message: 'A senha padrão informada está incorreta.' });
    }
    
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