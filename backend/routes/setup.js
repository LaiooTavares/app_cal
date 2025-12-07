// ARQUIVO: backend/routes/setup.js
const express = require('express');
const router = express.Router();

// Importamos o controller V2 para garantir que o código novo seja carregado
const setupController = require('../controllers/setupControllerV2'); 

module.exports = (pool) => {

    // GET /api/setup/status (ou /api/setup)
    // O frontend pode chamar /api/setup ou /api/setup/status, garantimos compatibilidade
    router.get('/', setupController.getSetupStatus(pool));
    router.get('/status', setupController.getSetupStatus(pool));

    // POST /api/setup/create-dev-user
    router.post('/create-dev-user', setupController.createDevUser(pool));

    return router;
};