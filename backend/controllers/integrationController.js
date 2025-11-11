// FILE: backend/controllers/integrationController.js
const { google } = require('googleapis');

/**
 * Lida com a desconexão de uma conta Google.
 * Isso envolve duas etapas principais:
 * 1. Revogar o token de atualização (refresh_token) junto à API do Google.
 * 2. Limpar os tokens do banco de dados local.
 */
const disconnectGoogle = (pool) => async (req, res) => {
    // Assumindo que o authenticateToken injeta o ID do usuário em req.user.userId
    // Se for req.user.id, ajuste abaixo.
    const userId = req.user.userId; 

    if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    // 1. Inicializar o cliente OAuth2 (necessário para revogar)
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    let client;
    try {
        // Obter o token de atualização do banco de dados
        const tokenQuery = 'SELECT google_refresh_token FROM users WHERE id = $1';
        const tokenResult = await pool.query(tokenQuery, [userId]);

        const refreshToken = tokenResult.rows[0]?.google_refresh_token;

        // 2. Tentar revogar o token junto ao Google
        if (refreshToken) {
            try {
                // Tenta revogar o token. 
                // Se o Google retornar erro (ex: token já inválido), nós capturamos o erro
                // e continuamos, pois o objetivo final é limpar nosso DB.
                await oauth2Client.revokeToken(refreshToken);
                console.log(`[Google Disconnect] Token revogado com sucesso no Google para o usuário: ${userId}`);
            } catch (googleError) {
                // Logamos o erro do Google, mas NÃO paramos o processo.
                // Isso corrige o erro 500 se o token já estiver expirado.
                console.warn(`[Google Disconnect] Aviso ao revogar token para usuário ${userId}: ${googleError.message}`);
            }
        }

        // 3. Limpar os tokens do nosso banco de dados (ETAPA CRÍTICA)
        // Independentemente de sucesso ou falha na revogação, limpamos nosso DB.
        // Adicionei google_calendar_id = NULL também, caso você use isso.
        const updateQuery = `
            UPDATE users 
            SET 
                google_access_token = NULL, 
                google_refresh_token = NULL
            WHERE id = $1;
        `;
        await pool.query(updateQuery, [userId]);

        console.log(`[Google Disconnect] Tokens locais limpos para o usuário: ${userId}`);
        
        // 4. Sucesso
        res.status(200).json({ message: 'Conta do Google desconectada com sucesso.' });

    } catch (dbError) {
        // Se houver um erro de banco de dados, aí sim é um erro 500
        console.error(`[Google Disconnect] Erro de servidor (DB) ao desconectar usuário ${userId}:`, dbError);
        res.status(500).json({ message: 'Erro interno do servidor ao desconectar a conta.' });
    }
};

module.exports = {
    disconnectGoogle,
};