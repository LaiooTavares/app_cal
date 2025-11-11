// FILE: backend/routes/integrations.js
const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');

// Wrapper para nossas rotas
const integrationRoutes = (pool, authenticateToken) => {
    
    // Rota de desconexão do Google
    // POST /api/integrations/google/disconnect
    router.post(
        '/google/disconnect', 
        authenticateToken, // Middleware de autenticação
        integrationController.disconnectGoogle(pool) // Lógica do controller
    );

    // ADICIONE AQUI OUTRAS ROTAS DE INTEGRAÇÃO NO FUTURO
    // Ex: router.get('/google/connect', ...)
    // Ex: router.get('/google/callback', ...)

    return router;
};

module.exports = integrationRoutes;