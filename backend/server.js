// Referência: backend/server.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs'); //
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
const http = require('http'); // 1. Importar o módulo HTTP nativo
// --- [FIM DA MODIFICAÇÃO] ---

// --- IMPORTS DAS ROTAS ---
const setupRoutes = require('./routes/setup');
const userRoutes = require('./routes/users');
const availabilityExceptionsRoutes = require('./routes/availabilityExceptions');
const timezoneRoutes = require('./routes/timezone');
const eventRoutes = require('./routes/events');

const app = express();

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
// 2. Criar um servidor HTTP nativo usando o app do Express
const server = http.createServer(app); 
// --- [FIM DA MODIFICAÇÃO] ---

// --- [INÍCIO DA CORREÇÃO (PORTA DINÂMICA)] ---
// A plataforma de hospedagem (Easypanel) define a porta via process.env.PORT.
// O app DEVE escutar nessa porta. Usamos 3000 apenas como padrão.
const PORT = process.env.PORT || 3000;
// --- [FIM DA CORREÇÃO] ---

// --- Configuração de CORS para Produção ---
const allowedOrigins = [
    process.env.CORS_ORIGIN_PROD, // Ex: 'https://cal.laink.com.br'
    process.env.CORS_ORIGIN_DEV   // Ex: 'http://localhost:5173'
];

if (!process.env.CORS_ORIGIN_PROD || !process.env.CORS_ORIGIN_DEV) {
    console.warn('[AVISO] Variáveis de ambiente CORS_ORIGIN_PROD ou CORS_ORIGIN_DEV não definidas.');
}

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir requisições sem 'origin' (ex: mobile apps, Postman, testes de servidor)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            // Origem está na lista de permissões
            callback(null, true);
        } else {
            // Origem bloqueada
            console.warn(`[CORS] Requisição bloqueada para a origem: ${origin}`);
            callback(new Error('Origem não permitida pelo CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());


// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
// 3. Importar e configurar o Socket.IO
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: allowedOrigins, // Reutiliza as origens permitidas do CORS
        methods: ["GET", "POST"]
    }
});

// 4. Lógica de conexão do Socket.IO
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Novo cliente conectado: ${socket.id}`);
    
    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
    });
});
// --- [FIM DA MODIFICAÇÃO] ---


// =================================================================
// --- Conexão com o Banco de Dados (Configuração Híbrida: Prod/Dev) ---
// =================================================================

// Define o objeto de configuração base do pool
let poolConfig = {
    // Configurações de pool (boas práticas)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
};

// (Validação de Ambiente de BD - Mantida da Ação 1)
if (process.env.DATABASE_URL) {
    console.log('[BANCO DE DADOS] Usando string de conexão (DATABASE_URL).');
    poolConfig.connectionString = process.env.DATABASE_URL;
    // Em produção no Easypanel, o SSL pode ser necessário
    // se o banco de dados for externo ou exigir.
    // poolConfig.ssl = { rejectUnauthorized: false };
} else if (process.env.DB_HOST) {
    console.log('[BANCO DE DADOS] Usando variáveis locais (DB_USER, DB_HOST...).');
    poolConfig = {
        ...poolConfig,
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    };
} else {
    console.error('[ERRO FATAL] Variáveis de ambiente do banco de dados não configuradas.');
    console.error('O servidor não pode iniciar sem DATABASE_URL (para produção) ou DB_HOST/DB_USER (para desenvolvimento).');
    console.error('Verifique a configuração de "Environment" na sua plataforma de hospedagem (Easypanel).');
    process.exit(1); 
}

// Cria o pool com a configuração definida
const pool = new Pool(poolConfig);

// Teste de conexão (Garante que o app só inicie se o BD estiver OK)
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('[ERRO FATAL] Não foi possível conectar ao banco de dados:', err.message);
        process.exit(1); 
    } else {
        console.log('[BANCO DE DADOS] Conectado com sucesso:', res.rows[0].now);
    }
});

// =================================================================
// --- MIDDLEWARES E FUNÇÕES DE AJUDA GLOBAIS ---
// =================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const authenticateRequest = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ message: 'Token de autenticação não fornecido.' });
    if (token.startsWith('prod_sk_')) {
        try {
            const result = await pool.query('SELECT * FROM users WHERE api_key = $1', [token]);
            if (result.rowCount === 0) { return res.status(403).json({ message: 'Token inválido.' }); }
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
    if (!roles.includes(req.user.role)) { return res.status(403).json({ message: 'Acesso negado.' }); }
    next();
};

const getDataOwnerId = (user) => {
    if (!user) return null;
    if (user.role === 'cooperador' && user.creatorId) { return user.creatorId; }
    return user.userId;
};

const ensureDefaultStatusExists = async (pool, ownerId) => {
    try {
        const checkQuery = 'SELECT COUNT(*) as count FROM kanban_statuses WHERE user_id = $1';
        const checkResult = await pool.query(checkQuery, [ownerId]);
        
        if (parseInt(checkResult.rows[0].count, 10) > 0) {
            return; 
        }

        console.log(`[Status] Nenhum status encontrado para o usuário ${ownerId}. Criando "Novo evento".`);
        const defaultStatusName = 'Novo evento';
        const defaultColor = '#3498db';
        const defaultSortOrder = 1; 
        
        const insertQuery = 'INSERT INTO kanban_statuses (name, color, sort_order, user_id) VALUES ($1, $2, $3, $4)';
        
        await pool.query(insertQuery, [defaultStatusName, defaultColor, defaultSortOrder, ownerId]);

    } catch (error) {
        if (error.code === '23505') { 
            console.warn(`[Status] Race condition na criação do status padrão para ${ownerId}.`);
        } else {
            console.error(`[Status] ERRO CRÍTICO ao criar status padrão para ${ownerId}:`, error.message);
        }
    }
};


// =================================================================
// --- FUNÇÃO DE ENVIO DE WEBHOOK ---
// =================================================================

async function sendWebhookNotification(ownerId, action, eventData) {
    try {
        const settingsResult = await pool.query('SELECT webhook_url, webhook_enabled FROM users WHERE id = $1', [ownerId]);
        const settings = settingsResult.rows[0];

        if (!settings || !settings.webhook_enabled || !settings.webhook_url) {
            console.log(`[WEBHOOK] Webhook desativado ou sem URL para o usuário ${ownerId}.`);
            return;
        }

        const payload = {
            action: action,
            data: eventData
        };

        console.log(`[WEBHOOK] Enviando notificação '${action}' para ${settings.webhook_url}`);
        
        // --- [CORRIGIDO] Erro de Sintaxe 1 ---
        await axios.post(settings.webhook_url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        // --- FIM DA CORREÇÃO ---

        console.log(`[WEBHOOK] Notificação enviada com sucesso para o usuário ${ownerId}.`);

    } catch (error) {
        console.error(`[WEBHOOK] ERRO ao enviar webhook para o usuário ${ownerId}:`, error.message);
    }
}

// =================================================================
// --- FUNÇÕES DE AJUDA - GOOGLE CALENDAR ---
// =================================================================

async function getGoogleCalendarClient(pool, userId) {
    try {
        const tokenQuery = 'SELECT google_access_token, google_refresh_token FROM users WHERE id = $1';
        const tokenResult = await pool.query(tokenQuery, [userId]);
        if (tokenResult.rowCount === 0 || !tokenResult.rows[0].google_refresh_token) {
            console.error(`[AUTH] Usuário ${userId} não possui um refresh_token do Google.`);
            return null;
        }
        const { google_access_token, google_refresh_token } = tokenResult.rows[0];
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2Client.setCredentials({ access_token: google_access_token, refresh_token: google_refresh_token });
        await oauth2Client.getAccessToken();
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
                await pool.query('UPDATE users SET google_access_token = $1, google_refresh_token = $2 WHERE id = $3', [tokens.access_token, tokens.refresh_token, userId]);
            } else {
                await pool.query('UPDATE users SET google_access_token = $1 WHERE id = $2', [tokens.access_token, userId]);
            }
        });
        return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
        if (error.response && ['invalid_grant', 'unauthorized_client'].includes(error.response.data.error)) {
             console.error(`[AUTH] ERRO: Token de atualização inválido para o usuário ${userId}.`);
        } else {
            console.error(`[AUTH] Erro ao criar cliente do Google Calendar para o usuário ${userId}:`, error.message);
        }
        return null;
    }
}

async function syncEventToGoogle(pool, userId, localEvent) {
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return;
    const profResult = await pool.query('SELECT google_calendar_id FROM professionals WHERE id = $1', [localEvent.professional_id]);
    const calendarId = profResult.rows[0]?.google_calendar_id || 'primary';
    const descriptionParts = [
        `Profissional: ${localEvent.professional_name || 'N/A'}`,
        `CPF: ${localEvent.client_cpf || 'Não informado'}`,
        `Telefone: ${localEvent.client_telefone || 'Não informado'}`,
        `\nNotas: ${localEvent.notes || 'Nenhuma nota.'}`
    ];
    const eventResource = {
        summary: `Consulta: ${localEvent.client_name}`,
        description: descriptionParts.join('\n'),
        start: { dateTime: localEvent.start_time, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: localEvent.end_time, timeZone: 'America/Sao_Paulo' },
    };
    try {
        const response = await calendar.events.insert({ calendarId: calendarId, resource: eventResource });
        await pool.query('UPDATE eventos SET google_event_id = $1 WHERE id = $2', [response.data.id, localEvent.id]);
        console.log(`Evento ${localEvent.id} sincronizado com sucesso para o calendário ${calendarId}.`);
    } catch (error) {
        console.error(`Erro ao sincronizar evento ${localEvent.id} para o Google Calendar:`, error.message);
    }
}

async function deleteEventFromGoogle(pool, userId, eventToDelete) {
    if (!eventToDelete.google_event_id) {
        console.log(`Evento ${eventToDelete.id} não possui google_event_id. Pulando a exclusão do Google Calendar.`);
        return;
    }
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return;
    const profResult = await pool.query('SELECT google_calendar_id FROM professionals WHERE id = $1', [eventToDelete.professional_id]);
    const calendarId = profResult.rows[0]?.google_calendar_id || 'primary';
    try {
        await calendar.events.delete({ calendarId: calendarId, eventId: eventToDelete.google_event_id });
        console.log(`Evento ${eventToDelete.id} (Google ID: ${eventToDelete.google_event_id}) excluído com sucesso do calendário ${calendarId}.`);
    } catch (error) {
        if (error.code === 410) {
            console.log(`Evento ${eventToDelete.google_event_id} já havia sido excluído do Google Calendar.`);
            return;
        }
        console.error(`Erro ao excluir evento ${eventToDelete.google_event_id} do Google Calendar:`, error.message);
    }
}

async function stopGoogleWatch(calendar, channelId, resourceId) {
    try {
        console.log(`[SYNC] Tentando parar o canal de notificação: ChannelID=${channelId}, ResourceID=${resourceId}`);
        await calendar.channels.stop({ requestBody: { id: channelId, resourceId: resourceId } });
        console.log(`[SYNC] Canal de notificação ${channelId} parado com sucesso.`);
    } catch (error) {
        if (error.code === 404) {
            console.log(`[SYNC] Canal ${channelId} não encontrado no Google. Provavelmente já expirou.`);
        } else {
            console.error(`[SYNC] Erro ao parar o canal ${channelId}:`, error.message);
        }
    }
}

async function processWebhookNotification(pool, channelId) {
    console.log(`[WEBHOOK] Notificação recebida para o canal: ${channelId}. Aguardando 3 segundos...`);
    await delay(3000);
    const profResult = await pool.query('SELECT * FROM professionals WHERE google_channel_id = $1', [channelId]);
    if (profResult.rowCount === 0) return console.error(`[WEBHOOK] ERRO: Canal de webhook desconhecido: ${channelId}`);
    const professional = profResult.rows[0];
    const userId = professional.administrator_id;
    console.log(`[WEBHOOK] Processando para o profissional: ${professional.name} (ID: ${professional.id})`);
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return console.error(`[WEBHOOK] ERRO: Não foi possível criar cliente Google para o usuário ${userId}.`);
    try {
        const calendarId = professional.google_calendar_id;
        if (!calendarId) return console.error(`[WEBHOOK] ERRO: Profissional ${professional.id} não possui um google_calendar_id.`);
        const response = await calendar.events.list({ calendarId, singleEvents: true, orderBy: 'startTime', timeMin: (new Date()).toISOString(), showDeleted: true });
        const googleEvents = response.data.items || [];
        for (const gEvent of googleEvents) {
            const googleEventId = gEvent.id;
            if (gEvent.status === 'cancelled') {
                const deleteResult = await pool.query('DELETE FROM eventos WHERE google_event_id = $1 RETURNING id', [googleEventId]);
                if (deleteResult.rowCount > 0) console.log(`[WEBHOOK] SUCESSO: Evento cancelado no Google (ID: ${googleEventId}) foi deletado localmente.`);
                continue;
            }
            const { dateTime: startTime } = gEvent.start || {};
            const { dateTime: endTime } = gEvent.end || {};
            const summary = gEvent.summary || 'Evento do Google';
            if (!startTime || !endTime) continue;
            const existingEventResult = await pool.query('SELECT id, professional_id FROM eventos WHERE google_event_id = $1', [googleEventId]);
            if (existingEventResult.rowCount > 0) {
                const localEvent = existingEventResult.rows[0];
                const logPrefix = localEvent.professional_id !== professional.id ? 'EVENTO MOVIDO' : 'EVENTO ATUALIZADO';
                console.log(`[WEBHOOK] ${logPrefix}: Google ID ${googleEventId} para Profissional ${professional.id}. Atualizando...`);
                await pool.query('UPDATE eventos SET client_name = $1, start_time = $2, end_time = $3, professional_id = $4 WHERE id = $5', [summary, startTime, endTime, professional.id, localEvent.id]);
            } else {
                console.log(`[WEBHOOK] NOVO EVENTO: "${summary}" (ID: ${googleEventId}). Criando para Profissional ${professional.id}...`);
                await ensureDefaultStatusExists(pool, userId);
                const statusResult = await pool.query('SELECT id FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, id ASC LIMIT 1', [userId]);
                const defaultStatusId = statusResult.rows[0]?.id;
                if (!defaultStatusId) { console.error(`[WEBHOOK] ERRO: Usuário ${userId} não tem status padrão no Kanban.`); continue; }
                await pool.query('INSERT INTO eventos (user_id, professional_id, client_name, start_time, end_time, status_id, google_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [userId, professional.id, summary, startTime, endTime, defaultStatusId, googleEventId]);
            }
        }
        console.log(`[WEBHOOK] Sincronização para o profissional ${professional.name} concluída.`);
    } catch (error) {
        console.error(`[WEBHOOK] ERRO CRÍTICO na sincronização para o prof ${professional.id}:`, error.response?.data || error.message);
    }
}

async function startOrRefreshGoogleWatch(pool, userId, professionalId) {
    console.log(`[SYNC] Iniciando processo de ativação de monitoramento para o profissional ${professionalId}.`);
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) {
        console.error(`[SYNC] Falha ao obter cliente do Google para o usuário ${userId}. Abortando ativação.`);
        return { success: false, message: 'Não foi possível autenticar com o Google.' };
    }
    const profResult = await pool.query('SELECT google_calendar_id, google_channel_id, google_resource_id FROM professionals WHERE id = $1 AND administrator_id = $2', [professionalId, userId]);
    const professional = profResult.rows[0];
    if (!professional) return { success: false, message: 'Profissional não encontrado.' };
    const calendarId = professional.google_calendar_id;
    if (!calendarId) return { success: false, message: 'Profissional não está vinculado a um calendário do Google.' };
    if (professional.google_channel_id && professional.google_resource_id) {
        await stopGoogleWatch(calendar, professional.google_channel_id, professional.google_resource_id);
    }
    let webhookUrl = process.env.WEBHOOK_BASE_URL;
    if (!webhookUrl) {
        console.error("[SYNC] ERRO: A variável de ambiente WEBHOOK_BASE_URL não está definida.");
        return { success: false, message: "Configuração do servidor incompleta." };
    }
    
    if (webhookUrl.startsWith('https: https://')) {
        webhookUrl = webhookUrl.replace('https: https://', 'https://');
    }

    const newChannelId = uuidv4();
    try {
        console.log(`[SYNC] Criando novo canal de notificação para o profissional ${professionalId}...`);
        const fullWebhookAddress = `${webhookUrl}/api/integrations/google/webhook`;
        console.log(`[SYNC] Usando URL de webhook: ${fullWebhookAddress}`);
        const response = await calendar.events.watch({ calendarId, requestBody: { id: newChannelId, type: 'web_hook', address: fullWebhookAddress } });
        const newResourceId = response.data.resourceId;
        await pool.query('UPDATE professionals SET google_channel_id = $1, google_resource_id = $2 WHERE id = $3', [newChannelId, newResourceId, professionalId]);
        console.log(`[SYNC] Novo canal ${newChannelId} criado com sucesso. Forçando re-sincronização inicial...`);
        processWebhookNotification(pool, newChannelId);
        return { success: true, message: `Monitoramento do calendário ativado!`, channelId: newChannelId };
    } catch (error) {
        console.error(`[SYNC] Erro ao iniciar watch para o profissional ${professionalId}:`, error.response?.data || error.message);
        return { success: false, message: 'Não foi possível iniciar o monitoramento.' };
    }
}


// =================================================================
// --- ROTAS DA APLICAÇÃO ---
// =================================================================

// --- INÍCIO DA MODIFICAÇÃO (Ação 7: Rota de Health Check) ---
// Adiciona uma rota raiz (GET /) para responder à verificação de saúde do Easypanel.
// Isso impede que a plataforma pense que o app está falho (erro 404) e
// envie um SIGTERM.
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        message: 'Servidor do App-Cal está rodando.' 
    });
});
// --- FIM DA MODIFICAÇÃO ---

// Rota pública para setup inicial.
app.use('/api/setup', setupRoutes(pool));

// Rotas autenticadas
app.use('/api/users', authenticateRequest, userRoutes(pool, authorizeRole));
app.use('/api/availability-exceptions', authenticateRequest, availabilityExceptionsRoutes(pool, { getDataOwnerId }));
app.use('/api/settings/timezone', authenticateRequest, timezoneRoutes(pool));

// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
// 5. Passar a instância 'io' para as rotas de eventos
app.use('/api/events', authenticateRequest, eventRoutes(pool, { 
    io, // <-- [NOVO] Passando o 'io' para o módulo de rotas
    getDataOwnerId, 
    sendWebhookNotification, 
    syncEventToGoogle, 
    deleteEventFromGoogle,
    ensureDefaultStatusExists
}));
// --- [FIM DA MODIFICAÇÃO] ---

// Rota pública de Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) { return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' }); }
    try {
        const userQuery = 'SELECT * FROM users WHERE email = $1';
        const result = await pool.query(userQuery, [email]);
        const user = result.rows[0];
        if (!user || !await bcrypt.compare(password, user.password_hash)) {
            return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
        }
        let creatorName = null;
        if (user.role === 'cooperador' && user.creator_id) {
            const creatorResult = await pool.query('SELECT name FROM users WHERE id = $1', [user.creator_id]);
            creatorName = creatorResult.rows[0]?.name || null;
        }
        const payload = { userId: user.id, name: user.name, role: user.role, creatorId: user.creator_id, creatorName };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        console.error('Erro no processo de login:', error);
        res.status(500).json({ message: 'Erro interno do servidor durante o login.' });
    }
});

// --- Outras Rotas (Settings, Professionals, Kanban, etc.) ---

app.get('/api/user/settings', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    try {
        const query = 'SELECT api_key, webhook_url, webhook_enabled, google_user_email FROM users WHERE id = $1';
        const result = await pool.query(query, [ownerId]);
        if (result.rowCount === 0) { return res.status(404).json({ message: 'Usuário não encontrado.' }); }
        const settings = result.rows[0];
        res.status(200).json({
            apiKeyLast4: settings.api_key ? settings.api_key.slice(-4) : null,
            webhook: { url: settings.webhook_url, enabled: settings.webhook_enabled },
            google: { email: settings.google_user_email, connected: !!settings.google_user_email },
        });
    } catch (error) {
        console.error('Erro ao buscar as configurações do usuário:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/user/regenerate-api-key', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    try {
        const newApiKey = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;
        await pool.query('UPDATE users SET api_key = $1 WHERE id = $2', [newApiKey, ownerId]);
        res.status(200).json({ message: 'Chave de API gerada com sucesso!', newApiKey: newApiKey });
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/user/webhook-settings', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { webhook_url, webhook_enabled } = req.body;
    try {
        await pool.query('UPDATE users SET webhook_url = $1, webhook_enabled = $2 WHERE id = $3', [webhook_url, webhook_enabled, ownerId]);
	res.status(200).json({ message: 'Configurações de Webhook salvas com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.get('/api/clients', authenticateRequest, authorizeRole(['dev', 'developer']), async (req, res) => {
    try {
        const result = await pool.query("SELECT id, name FROM users WHERE role IN ('admin', 'administrator') ORDER BY name ASC");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/users/:id/impersonate', authenticateRequest, authorizeRole(['dev', 'developer']), async (req, res) => {
    const originalUserId = req.user.userId;
    const targetUserId = req.params.id;
    try {
        const targetUserResult = await pool.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
        const targetUser = targetUserResult.rows[0];
        if (!targetUser) return res.status(404).json({ message: 'Usuário cliente não encontrado.' });
        const payload = { userId: targetUser.id, name: targetUser.name, role: targetUser.role, creatorId: targetUser.creator_id, isImpersonating: true, originalUserId };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.get('/api/professionals', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    try {
        const result = await pool.query('SELECT * FROM professionals WHERE administrator_id = $1 ORDER BY name ASC', [ownerId]);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.get('/api/professionals/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM professionals WHERE id = $1 AND administrator_id = $2', [id, ownerId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Profissional não encontrado.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/professionals', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { name, email, specialties, crm, observations, color } = req.body;
    if (!name || !specialties || !crm) return res.status(400).json({ message: 'Nome, especialidade e CRM são obrigatórios.' });
    try {
        const result = await pool.query(`INSERT INTO professionals (name, email, specialties, crm, observations, color, administrator_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`, [name, email, specialties, crm, observations, color, ownerId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.put('/api/professionals/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    const { name, email, specialties, crm, observations, color } = req.body;
    if (!name || !specialties || !crm) return res.status(400).json({ message: 'Nome, especialidade e CRM são obrigatórios.' });
    try {
        const result = await pool.query(`UPDATE professionals SET name = $1, email = $2, specialties = $3, observations = $4, crm = $5, color = $6 WHERE id = $7 AND administrator_id = $8 RETURNING *;`, [name, email, specialties, observations, crm, color, id, ownerId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Profissional não encontrado.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.delete('/api/professionals/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    try {
        const result = await pool.query(`DELETE FROM professionals WHERE id = $1 AND administrator_id = $2;`, [id, ownerId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Profissional não encontrado.' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.get('/api/availabilities', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { professional_id } = req.query;
    if (!professional_id) return res.status(400).json({ message: 'O ID do profissional é obrigatório.' });
    try {
        const profResult = await pool.query('SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2', [professional_id, ownerId]);
        if (profResult.rowCount === 0) return res.status(404).json({ message: 'Profissional não encontrado.' });
        const availResult = await pool.query('SELECT * FROM professional_availability WHERE professional_id = $1 ORDER BY day_of_week, start_time', [professional_id]);
        res.status(200).json(availResult.rows);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/availabilities', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { professional_id, day_of_week, start_time, end_time } = req.body;
    try {
        const profResult = await pool.query('SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2', [professional_id, ownerId]);
        if (profResult.rowCount === 0) return res.status(404).json({ message: 'Profissional não encontrado.' });
        const result = await pool.query(`INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *;`, [professional_id, day_of_week, start_time, end_time]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.put('/api/availabilities/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    const { start_time, end_time } = req.body;
    if (!start_time || !end_time) return res.status(400).json({ message: 'Horários obrigatórios.' });
    try {
        const checkResult = await pool.query(`SELECT pa.id FROM professional_availability pa JOIN professionals p ON pa.professional_id = p.id WHERE pa.id = $1 AND p.administrator_id = $2;`, [id, ownerId]);
        if (checkResult.rowCount === 0) return res.status(404).json({ message: 'Disponibilidade não encontrada.' });
        const result = await pool.query(`UPDATE professional_availability SET start_time = $1, end_time = $2 WHERE id = $3 RETURNING *;`, [start_time, end_time, id]);
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.delete('/api/availabilities/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    try {
        const result = await pool.query(`DELETE FROM professional_availability pa USING professionals p WHERE pa.id = $1 AND pa.professional_id = p.id AND p.administrator_id = $2;`, [id, ownerId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Disponibilidade não encontrada.' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/availabilities/batch-copy', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { professional_id, source_day_of_week, target_days_of_week } = req.body;

    // 1. Validação básica
    if (!professional_id || !source_day_of_week || !Array.isArray(target_days_of_week) || target_days_of_week.length === 0) {
        return res.status(400).json({ message: 'Dados inválidos para a cópia em lote.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 2. Verificação de Segurança: O profissional pertence ao usuário logado?
        const profResult = await client.query(
            'SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2',
            [professional_id, ownerId]
        );
        if (profResult.rowCount === 0) {
            throw new Error('Profissional não encontrado ou não pertence a este usuário.');
        }

        // 3. Buscar os horários de origem (o dia que será copiado)
        const sourceTimesResult = await client.query(
            'SELECT start_time, end_time FROM professional_availability WHERE professional_id = $1 AND day_of_week = $2',
            [professional_id, source_day_of_week]
        );
        const sourceTimes = sourceTimesResult.rows; // Array de { start_time, end_time }

        // 4. Limpar TODOS os horários antigos dos dias de destino
        // Usamos ANY($2::int[]) para deletar de todos os dias no array de uma vez
        await client.query(
            'DELETE FROM professional_availability WHERE professional_id = $1 AND day_of_week = ANY($2::int[])',
            [professional_id, target_days_of_week]
        );

        // 5. Inserir os novos horários (copiados) para cada dia de destino
        // Se o dia de origem estava vazio (sourceTimes.length === 0), ele apenas limpa os dias de destino (passo 4),
        // o que é o comportamento correto (copiar um dia "desativado").
        if (sourceTimes.length > 0) {
            // Prepara uma query de inserção múltipla (mais moderno e rápido - Regra 9)
            // Isso é mais eficiente do que fazer loops de inserts no Node.js
            const insertValues = [];
            const queryParams = [];
            let paramIndex = 1; // Começa o índice dos parâmetros

            queryParams.push(professional_id); // $1

            for (const targetDay of target_days_of_week) {
                queryParams.push(targetDay); // $2, $4, $6...
                const targetDayIndex = paramIndex + 1;
                
                for (const time of sourceTimes) {
                    queryParams.push(time.start_time); // $3, $7...
                    queryParams.push(time.end_time); // $4, $8...
                    
                    const startIndex = paramIndex + 2;
                    const endIndex = paramIndex + 3;

                    // (professional_id, day_of_week, start_time, end_time)
                    insertValues.push(`($1, $${targetDayIndex}, $${startIndex}, $${endIndex})`);
                    
                    paramIndex += 2; // Avança 2 posições (start_time, end_time)
                }
                paramIndex += 1; // Avança 1 posição (day_of_week)
            }
            
            const insertQuery = `
                INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time)
                VALUES ${insertValues.join(', ')};
            `;
            
            await client.query(insertQuery, queryParams);
        }

        // 6. Finalizar a transação
        await client.query('COMMIT');
        res.status(201).json({ message: 'Horários copiados com sucesso!' });

    } catch (error) {
        // 7. Desfazer tudo em caso de erro
        await client.query('ROLLBACK');
        console.error('Erro na cópia em lote de disponibilidade:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao copiar horários.' });
    } finally {
        // 8. Liberar a conexão
        client.release();
    }
});
// --- FIM DA NOVA ROTA ---

app.get('/api/professionals/:id/public-availability', async (req, res) => {
    const { id } = req.params;
    let { year, month } = req.query;
    
    if (!year || !month) {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
    }

    try {
        const profOwnerResult = await pool.query('SELECT u.timezone FROM users u JOIN professionals p ON u.id = p.administrator_id WHERE p.id = $1', [id]);
        const userTimezone = profOwnerResult.rows[0]?.timezone || 'America/Sao_Paulo';

        const appointmentDuration = 60; 
        const intervalString = `${appointmentDuration} minutes`;
        
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

        const query = `
            WITH all_days AS (
                SELECT day::date
                FROM generate_series($2::date, $3::date, '1 day') AS day
            ),
            potential_slots AS (
                SELECT
                    d.day,
                    generate_series(
                        (d.day + pa.start_time) AT TIME ZONE $4,
                        (d.day + pa.end_time - interval '1 second') AT TIME ZONE $4,
                        '${intervalString}'
                    ) AS slot
                FROM all_days d
                JOIN professional_availability pa ON EXTRACT(ISODOW FROM d.day) = pa.day_of_week
                WHERE pa.professional_id = $1
            )
            SELECT
                to_char(p.slot AT TIME ZONE $4, 'YYYY-MM-DD') AS available_date,
                to_char(p.slot AT TIME ZONE $4, 'HH24:MI') AS available_time
            FROM potential_slots p
            WHERE 
                p.slot > NOW()
                
                AND NOT EXISTS (
                    SELECT 1 FROM availability_exceptions ae
                    WHERE ae.professional_id = $1 AND ae.exception_date = p.day AND ae.start_time IS NULL
                )
                
                AND NOT EXISTS (
                    SELECT 1 FROM availability_exceptions ae
                    WHERE ae.professional_id = $1 AND ae.exception_date = p.day
                    /* --- [INÍCIO DA CORREÇÃO (Timezone Exceptions)] --- */
                    /* Compara o tempo local do slot ($4) com o tempo local salvo (ae.start_time) */
                        AND (p.slot AT TIME ZONE $4)::time >= ae.start_time
                        AND (p.slot AT TIME ZONE $4)::time < ae.end_time
                    /* --- [FIM DA CORREÇÃO (Timezone Exceptions)] --- */
                )

                AND NOT EXISTS (
                    SELECT 1 FROM eventos e
                    WHERE e.professional_id = $1 AND e.start_time = p.slot
                )
            ORDER BY available_date, available_time;
        `;

        const result = await pool.query(query, [id, startDate, endDate, userTimezone]);

        const availableDays = result.rows.reduce((acc, row) => {
            const { available_date, available_time } = row;
            if (!acc[available_date]) {
                acc[available_date] = [];
            }
            acc[available_date].push(available_time);
            return acc;
        }, {});

        res.status(200).json(availableDays);
    } catch (error) {
        console.error("Erro ao buscar disponibilidade:", error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

// =================================================================
// --- ROTAS DO GOOGLE (MODIFICADAS PARA PRODUÇÃO) ---
// =================================================================

app.get('/api/integrations/google/auth', authenticateRequest, (req, res) => {
    const backendCallbackUrl = `${process.env.BACKEND_BASE_URL}/api/integrations/google/callback`;
    if (!process.env.BACKEND_BASE_URL) {
        console.error("[AUTH] ERRO: BACKEND_BASE_URL não definida!");
        return res.status(500).json({ message: "Erro de configuração do servidor." });
    }
    
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, backendCallbackUrl);
    const scopes = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];
    const state = req.user.userId.toString();
    const authorizationUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes, include_granted_scopes: true, state });
    res.json({ authUrl: authorizationUrl });
});

app.get('/api/integrations/google/callback', async (req, res) => {
    const backendCallbackUrl = `${process.env.BACKEND_BASE_URL}/api/integrations/google/callback`;
    const frontendRedirectBase = `${process.env.FRONTEND_BASE_URL}/settings`;

    if (!process.env.BACKEND_BASE_URL || !process.env.FRONTEND_BASE_URL) {
        console.error("[AUTH] ERRO: BACKEND_BASE_URL ou FRONTEND_BASE_URL não definidas!");
        return res.status(500).send("Erro de configuração do servidor.");
    }

    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, backendCallbackUrl);
    const { code, state } = req.query;
    const userId = parseInt(state, 10);

    if (!code || !userId) { 
        console.error('[AUTH] Google callback sem código ou ID de usuário (state).');
        return res.redirect(`${frontendRedirectBase}?google_auth=error`); 
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const userInfo = await oauth2.userinfo.get();
        await pool.query(`UPDATE users SET google_access_token = $1, google_refresh_token = $2, google_user_email = $3 WHERE id = $4`, [tokens.access_token, tokens.refresh_token, userInfo.data.email, userId]);
        
        res.redirect(`${frontendRedirectBase}?google_auth=success`);
    
    } catch (error) {
        console.error('[AUTH] Erro no processamento do callback do Google:', error.message);
        res.redirect(`${frontendRedirectBase}?google_auth=error`);
    }
});

app.post('/api/integrations/google/disconnect', authenticateRequest, async (req, res) => {
    const userId = req.user.userId;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    try {
        const tokenQuery = 'SELECT google_refresh_token FROM users WHERE id = $1';
        const tokenResult = await pool.query(tokenQuery, [userId]);
        const refreshToken = tokenResult.rows[0]?.google_refresh_token;

        if (refreshToken) {
            try {
                await oauth2Client.revokeToken(refreshToken);
                console.log(`[Google Disconnect] Token revogado com sucesso no Google para o usuário: ${userId}`);
            } catch (googleError) {
                console.warn(`[Google Disconnect] Aviso ao revogar token para usuário ${userId}: ${googleError.message}`);
            }
        }

        await pool.query(
            'UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, google_user_email = NULL WHERE id = $1', 
            [userId]
        );
        
        await pool.query(
            'UPDATE professionals SET google_calendar_id = NULL, google_channel_id = NULL, google_resource_id = NULL WHERE administrator_id = $1', 
            [userId]
        );
        
        console.log(`[Google Disconnect] Tokens locais limpos para o usuário: ${userId}`);
        res.status(200).json({ message: 'Conta do Google desconectada com sucesso.' });

    } catch (dbError) {
        console.error(`[Google Disconnect] Erro de servidor (DB) ao desconectar usuário ${userId}:`, dbError);
        res.status(500).json({ message: 'Erro interno do servidor ao desconectar a conta.' });
    }
});

app.post('/api/integrations/google/link-professional', authenticateRequest, async (req, res) => {
    const userId = req.user.userId;
    const { professionalId, googleCalendarId } = req.body;
    if (!professionalId || !googleCalendarId) return res.status(400).json({ message: 'IDs do profissional e do calendário são obrigatórios.' });
    try {
        const profResult = await pool.query('SELECT id FROM professionals WHERE id = $1 AND administrator_id = $2', [professionalId, userId]);
        if (profResult.rowCount === 0) return res.status(404).json({ message: 'Profissional não encontrado.' });
        await pool.query('UPDATE professionals SET google_calendar_id = $1 WHERE id = $2', [googleCalendarId, professionalId]);
        const watchResult = await startOrRefreshGoogleWatch(pool, userId, professionalId);
        if (watchResult.success) {
            res.status(200).json({ message: 'Profissional vinculado e sincronização ativada!' });
        } else {
            res.status(500).json({ message: `Profissional vinculado, mas falha ao ativar a sincronização: ${watchResult.message}` });
        }
    } catch (error) {
        res.status(500).json({ message: 'Não foi possível vincular o profissional.' });
    }
});

app.post('/api/integrations/google/watch-professional', authenticateRequest, async (req, res) => {
    const userId = req.user.userId;
    const { professionalId } = req.body;

    if (!professionalId) {
        return res.status(400).json({ message: 'O ID do profissional (professionalId) é obrigatório.' });
    }

    try {
        const result = await startOrRefreshGoogleWatch(pool, userId, professionalId);
        
        if (result.success) {
            res.status(200).json({ message: result.message });
        } else {
            res.status(500).json({ message: result.message || 'Falha ao iniciar o monitoramento do calendário.' });
        }
    } catch (error) {
        console.error('Erro na rota /watch-professional:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});


app.post('/api/integrations/google/webhook', (req, res) => {
    const channelId = req.headers['x-goog-channel-id'];
    const resourceState = req.headers['x-goog-resource-state'];
    console.log(`[WEBHOOK] Recebida requisição do Google: channelId=${channelId}, resourceState=${resourceState}`);
    if (resourceState === 'exists' && channelId) {
        processWebhookNotification(pool, channelId).catch(err => {
            console.error("[WEBHOOK] Erro não tratado na chamada de processWebhookNotification:", err);
        });
    }
    res.status(200).send();
});

// =================================================================
// --- ROTAS DO KANBAN ---
// =================================================================

app.get('/api/kanban/statuses', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    try {
        await ensureDefaultStatusExists(pool, ownerId); 

        const result = await pool.query(
            'SELECT * FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC, name ASC',
            [ownerId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});

app.post('/api/kanban/statuses', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { name, color, sort_order } = req.body;
    if (!name) { return res.status(400).json({ message: "O nome do status é obrigatório." }); }
    try {
        // --- [CORRIGIDO] Erro de Sintaxe 2 ---
        const result = await pool.query(
            'INSERT INTO kanban_statuses (name, color, sort_order, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, color || '#8e44ad', sort_order, ownerId]
        );
        // --- FIM DA CORREÇÃO ---
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { return res.status(409).json({ message: 'Já existe um status com este nome.' }); }
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});

app.put('/api/kanban/statuses/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    const { name, color, sort_order } = req.body;
    if (!name) { return res.status(400).json({ message: "O nome do status é obrigatório." }); }
    try {
        const result = await pool.query(
            'UPDATE kanban_statuses SET name = $1, color = $2, sort_order = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
            [name, color, sort_order, id, ownerId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Status não encontrado ou você não tem permissão." });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});

app.delete('/api/kanban/statuses/:id', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const { id } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM kanban_statuses WHERE id = $1 AND user_id = $2',
            [id, ownerId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Status não encontrado ou você não tem permissão." });
        }
        res.status(204).send();
    }
    catch (error) {
        if (error.code === '23503') {
            return res.status(409).json({ message: 'Não é possível excluir este status pois ele está a ser usado por um ou mais eventos.' });
        }
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});

app.post('/api/kanban/statuses/reorder', authenticateRequest, async (req, res) => {
   const ownerId = getDataOwnerId(req.user);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) { return res.status(400).json({ message: "Um array de IDs ordenados é obrigatório." }); }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            const statusId = orderedIds[i];
            const sortOrder = i + 1;
            await client.query(
                'UPDATE kanban_statuses SET sort_order = $1 WHERE id = $2 AND user_id = $3',
                [sortOrder, statusId, ownerId]
            );
        }
        await client.query('COMMIT');
        res.status(200).json({ message: "Ordem atualizada com sucesso." });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: "Erro interno do servidor ao reordenar." });
    } finally {
        client.release();
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
// --- [INÍCIO DA MODIFICAÇÃO (Socket.IO)] ---
// 6. Iniciar o servidor HTTP (que contém o app Express e o Socket.IO)
server.listen(PORT, () => {
    console.log(`✏️ Servidor rodando na porta ${PORT}✏️`);
});
