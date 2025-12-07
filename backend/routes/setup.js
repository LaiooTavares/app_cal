// Referência: backend/routes/setup.js
const express = require('express');
const router = express.Router();

// IMPORTANTE: Estamos importando o V2 para garantir que o código novo seja usado
const setupController = require('../controllers/setupControllerV2'); 

module.exports = (pool) => {
    
    // Rota que o frontend chama para saber se mostra a tela de Login ou Setup
    router.get('/', setupController.getSetupStatus(pool));
    router.get('/status', setupController.getSetupStatus(pool));

    // Rota que cria o usuário
    router.post('/create-dev-user', setupController.createDevUser(pool));

    return router;
};