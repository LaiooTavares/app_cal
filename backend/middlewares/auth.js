// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');

// A função é exportada para receber o 'pool'
const authMiddleware = (pool) => {
    const authenticateRequest = async (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token == null) {
            return res.status(401).json({ message: 'Token de autenticação não fornecido.' });
        }

        if (token.startsWith('prod_sk_')) {
            try {
                const result = await pool.query('SELECT * FROM users WHERE api_key = $1', [token]);
                if (result.rowCount === 0) {
                    return res.status(403).json({ message: 'Token inválido.' });
                }
                const user = result.rows[0];
                req.user = { userId: user.id, name: user.name, role: user.role, creatorId: user.creator_id };
                return next();
            } catch (error) {
                console.error("Erro ao autenticar com chave de API:", error);
                return res.status(500).json({ message: 'Erro interno do servidor.' });
            }
        } else {
            jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
                if (err) {
                    return res.status(403).json({ message: 'Token inválido.' });
                }
                req.user = user;
                next();
            });
        }
    };

    const authorizeRole = (roles) => (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Acesso negado.' });
        }
        next();
    };

    return { authenticateRequest, authorizeRole };
};

module.exports = authMiddleware;