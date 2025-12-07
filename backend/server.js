// Referência: backend/server.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const http = require('http'); 

// --- IMPORTS DAS ROTAS ---
const setupRoutes = require('./routes/setup');
const userRoutes = require('./routes/users');
const availabilityExceptionsRoutes = require('./routes/availabilityExceptions');
const timezoneRoutes = require('./routes/timezone');
const eventRoutes = require('./routes/events');

const app = express();
const server = http.createServer(app); 

// --- Configuração da Porta ---
const PORT = process.env.PORT || 3000;

// --- Configuração de CORS para Produção ---
const allowedOrigins = [
    process.env.CORS_ORIGIN_PROD, 
    process.env.CORS_ORIGIN_DEV   
];

if (!process.env.CORS_ORIGIN_PROD || !process.env.CORS_ORIGIN_DEV) {
    console.warn('[AVISO] Variáveis de ambiente CORS_ORIGIN_PROD ou CORS_ORIGIN_DEV não definidas.');
}

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
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

// --- Configuração Socket.IO ---
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`[Socket.IO] Novo cliente conectado: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
    });
});

// =================================================================
// --- Conexão com o Banco de Dados ---
// =================================================================

let poolConfig = {
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
};

if (process.env.DATABASE_URL) {
    console.log('[BANCO DE DADOS] Usando string de conexão (DATABASE_URL).');
    poolConfig.connectionString = process.env.DATABASE_URL;
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
    process.exit(1); 
}

const pool = new Pool(poolConfig);

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('[ERRO FATAL] Não foi possível conectar ao banco de dados:', err.message);
        process.exit(1); 
    } else {
        console.log('[BANCO DE DADOS] Conectado com sucesso:', res.rows[0].now);
    }
});

// =================================================================
// --- MIDDLEWARES E FUNÇÕES GLOBAIS ---
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
        
        if (parseInt(checkResult.rows[0].count, 10) > 0) { return; }

        console.log(`[Status] Criando status padrão para ${ownerId}.`);
        await pool.query('INSERT INTO kanban_statuses (name, color, sort_order, user_id) VALUES ($1, $2, $3, $4)', ['Novo evento', '#3498db', 1, ownerId]);

    } catch (error) {
        if (error.code !== '23505') console.error(`[Status] Erro ao criar status padrão:`, error.message);
    }
};

// =================================================================
// --- WEBHOOK E GOOGLE HELPERS ---
// =================================================================

async function sendWebhookNotification(ownerId, action, eventData) {
    try {
        const settingsResult = await pool.query('SELECT webhook_url, webhook_enabled FROM users WHERE id = $1', [ownerId]);
        const settings = settingsResult.rows[0];

        if (!settings || !settings.webhook_enabled || !settings.webhook_url) return;

        await axios.post(settings.webhook_url, { action, data: eventData }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`[WEBHOOK] Notificação enviada para ${ownerId}.`);
    } catch (error) {
        console.error(`[WEBHOOK] Erro ao enviar para ${ownerId}:`, error.message);
    }
}

async function getGoogleCalendarClient(pool, userId) {
    try {
        const tokenResult = await pool.query('SELECT google_access_token, google_refresh_token FROM users WHERE id = $1', [userId]);
        if (tokenResult.rowCount === 0 || !tokenResult.rows[0].google_refresh_token) return null;
        
        const { google_access_token, google_refresh_token } = tokenResult.rows[0];
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2Client.setCredentials({ access_token: google_access_token, refresh_token: google_refresh_token });
        
        await oauth2Client.getAccessToken(); // Força refresh se necessário
        
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
                await pool.query('UPDATE users SET google_access_token = $1, google_refresh_token = $2 WHERE id = $3', [tokens.access_token, tokens.refresh_token, userId]);
            } else {
                await pool.query('UPDATE users SET google_access_token = $1 WHERE id = $2', [tokens.access_token, userId]);
            }
        });
        return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
        console.error(`[AUTH] Erro Google Client para ${userId}:`, error.message);
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
        `CPF: ${localEvent.client_cpf || 'N/A'}`,
        `Telefone: ${localEvent.client_telefone || 'N/A'}`,
        `\nNotas: ${localEvent.notes || 'N/A'}`
    ];
    const eventResource = {
        summary: `Consulta: ${localEvent.client_name}`,
        description: descriptionParts.join('\n'),
        start: { dateTime: localEvent.start_time, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: localEvent.end_time, timeZone: 'America/Sao_Paulo' },
    };
    try {
        const response = await calendar.events.insert({ calendarId, resource: eventResource });
        await pool.query('UPDATE eventos SET google_event_id = $1 WHERE id = $2', [response.data.id, localEvent.id]);
    } catch (error) {
        console.error(`Erro sync Google:`, error.message);
    }
}

async function deleteEventFromGoogle(pool, userId, eventToDelete) {
    if (!eventToDelete.google_event_id) return;
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return;
    const profResult = await pool.query('SELECT google_calendar_id FROM professionals WHERE id = $1', [eventToDelete.professional_id]);
    const calendarId = profResult.rows[0]?.google_calendar_id || 'primary';
    try {
        await calendar.events.delete({ calendarId, eventId: eventToDelete.google_event_id });
    } catch (error) {
        if (error.code !== 410) console.error(`Erro delete Google:`, error.message);
    }
}

async function stopGoogleWatch(calendar, channelId, resourceId) {
    try {
        await calendar.channels.stop({ requestBody: { id: channelId, resourceId } });
    } catch (error) {
        if (error.code !== 404) console.error(`[SYNC] Erro stop channel:`, error.message);
    }
}

async function processWebhookNotification(pool, channelId) {
    await delay(3000);
    const profResult = await pool.query('SELECT * FROM professionals WHERE google_channel_id = $1', [channelId]);
    if (profResult.rowCount === 0) return;
    const professional = profResult.rows[0];
    const userId = professional.administrator_id;
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return;

    try {
        const calendarId = professional.google_calendar_id;
        if (!calendarId) return;
        const response = await calendar.events.list({ calendarId, singleEvents: true, orderBy: 'startTime', timeMin: (new Date()).toISOString(), showDeleted: true });
        
        for (const gEvent of (response.data.items || [])) {
            const googleEventId = gEvent.id;
            if (gEvent.status === 'cancelled') {
                await pool.query('DELETE FROM eventos WHERE google_event_id = $1', [googleEventId]);
                continue;
            }
            const { dateTime: startTime } = gEvent.start || {};
            const { dateTime: endTime } = gEvent.end || {};
            const summary = gEvent.summary || 'Evento Google';
            if (!startTime || !endTime) continue;

            const existing = await pool.query('SELECT id FROM eventos WHERE google_event_id = $1', [googleEventId]);
            if (existing.rowCount > 0) {
                await pool.query('UPDATE eventos SET client_name = $1, start_time = $2, end_time = $3, professional_id = $4 WHERE id = $5', [summary, startTime, endTime, professional.id, existing.rows[0].id]);
            } else {
                await ensureDefaultStatusExists(pool, userId);
                const statusRes = await pool.query('SELECT id FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC LIMIT 1', [userId]);
                if (statusRes.rows[0]) {
                    await pool.query('INSERT INTO eventos (user_id, professional_id, client_name, start_time, end_time, status_id, google_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [userId, professional.id, summary, startTime, endTime, statusRes.rows[0].id, googleEventId]);
                }
            }
        }
    } catch (error) {
        console.error(`[WEBHOOK] Erro proc. webhook:`, error.message);
    }
}

async function startOrRefreshGoogleWatch(pool, userId, professionalId) {
    const calendar = await getGoogleCalendarClient(pool, userId);
    if (!calendar) return { success: false, message: 'Erro autenticação Google.' };
    
    const profResult = await pool.query('SELECT google_calendar_id, google_channel_id, google_resource_id FROM professionals WHERE id = $1 AND administrator_id = $2', [professionalId, userId]);
    const professional = profResult.rows[0];
    if (!professional || !professional.google_calendar_id) return { success: false, message: 'Profissional ou calendário inválido.' };

    if (professional.google_channel_id && professional.google_resource_id) {
        await stopGoogleWatch(calendar, professional.google_channel_id, professional.google_resource_id);
    }

    let webhookUrl = process.env.WEBHOOK_BASE_URL;
    if (webhookUrl && webhookUrl.startsWith('https: https://')) webhookUrl = webhookUrl.replace('https: https://', 'https://');
    
    const newChannelId = uuidv4();
    try {
        const fullWebhookAddress = `${webhookUrl}/api/integrations/google/webhook`;
        const response = await calendar.events.watch({ calendarId: professional.google_calendar_id, requestBody: { id: newChannelId, type: 'web_hook', address: fullWebhookAddress } });
        await pool.query('UPDATE professionals SET google_channel_id = $1, google_resource_id = $2 WHERE id = $3', [newChannelId, response.data.resourceId, professionalId]);
        processWebhookNotification(pool, newChannelId);
        return { success: true, message: `Monitoramento ativado!`, channelId: newChannelId };
    } catch (error) {
        return { success: false, message: 'Erro ao iniciar monitoramento.' };
    }
}

// =================================================================
// --- ROTAS ---
// =================================================================

app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Servidor do App-Cal está rodando.' });
});

app.use('/api/setup', setupRoutes(pool));
app.use('/api/users', authenticateRequest, userRoutes(pool, authorizeRole));
app.use('/api/availability-exceptions', authenticateRequest, availabilityExceptionsRoutes(pool, { getDataOwnerId }));
app.use('/api/settings/timezone', authenticateRequest, timezoneRoutes(pool));
app.use('/api/events', authenticateRequest, eventRoutes(pool, { 
    io, getDataOwnerId, sendWebhookNotification, syncEventToGoogle, deleteEventFromGoogle, ensureDefaultStatusExists 
}));

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user || !await bcrypt.compare(password, user.password_hash)) {
            return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
        }
        let creatorName = null;
        if (user.role === 'cooperador' && user.creator_id) {
            const cRes = await pool.query('SELECT name FROM users WHERE id = $1', [user.creator_id]);
            creatorName = cRes.rows[0]?.name;
        }
        const token = jwt.sign({ userId: user.id, name: user.name, role: user.role, creatorId: user.creator_id, creatorName }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ message: 'Erro no login.' });
    }
});

// --- Rotas Auxiliares (Simplificadas para brevidade, mas mantendo lógica) ---
app.get('/api/user/settings', authenticateRequest, async (req, res) => {
    const ownerId = getDataOwnerId(req.user);
    const resQ = await pool.query('SELECT api_key, webhook_url, webhook_enabled, google_user_email FROM users WHERE id = $1', [ownerId]);
    const s = resQ.rows[0];
    res.json({ apiKeyLast4: s.api_key?.slice(-4), webhook: { url: s.webhook_url, enabled: s.webhook_enabled }, google: { email: s.google_user_email, connected: !!s.google_user_email } });
});

app.post('/api/user/regenerate-api-key', authenticateRequest, async (req, res) => {
    const k = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;
    await pool.query('UPDATE users SET api_key = $1 WHERE id = $2', [k, getDataOwnerId(req.user)]);
    res.json({ newApiKey: k });
});

app.post('/api/user/webhook-settings', authenticateRequest, async (req, res) => {
    await pool.query('UPDATE users SET webhook_url = $1, webhook_enabled = $2 WHERE id = $3', [req.body.webhook_url, req.body.webhook_enabled, getDataOwnerId(req.user)]);
    res.json({ message: 'Salvo.' });
});

app.get('/api/clients', authenticateRequest, authorizeRole(['dev', 'developer']), async (req, res) => {
    const r = await pool.query("SELECT id, name FROM users WHERE role IN ('admin', 'administrator') ORDER BY name ASC");
    res.json(r.rows);
});

app.post('/api/users/:id/impersonate', authenticateRequest, authorizeRole(['dev', 'developer']), async (req, res) => {
    const u = (await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!u) return res.status(404).json({ message: 'User not found' });
    const token = jwt.sign({ userId: u.id, name: u.name, role: u.role, creatorId: u.creator_id, isImpersonating: true, originalUserId: req.user.userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// --- Rotas Profissionais e Kanban (Mantidas conforme original) ---
app.get('/api/professionals', authenticateRequest, async (req, res) => {
    const r = await pool.query('SELECT * FROM professionals WHERE administrator_id = $1 ORDER BY name ASC', [getDataOwnerId(req.user)]);
    res.json(r.rows);
});
app.get('/api/professionals/:id', authenticateRequest, async (req, res) => {
    const r = await pool.query('SELECT * FROM professionals WHERE id = $1 AND administrator_id = $2', [req.params.id, getDataOwnerId(req.user)]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    res.json(r.rows[0]);
});
app.post('/api/professionals', authenticateRequest, async (req, res) => {
    const { name, email, specialties, crm, observations, color } = req.body;
    const r = await pool.query(`INSERT INTO professionals (name, email, specialties, crm, observations, color, administrator_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`, [name, email, specialties, crm, observations, color, getDataOwnerId(req.user)]);
    res.status(201).json(r.rows[0]);
});
app.put('/api/professionals/:id', authenticateRequest, async (req, res) => {
    const { name, email, specialties, crm, observations, color } = req.body;
    const r = await pool.query(`UPDATE professionals SET name = $1, email = $2, specialties = $3, observations = $4, crm = $5, color = $6 WHERE id = $7 AND administrator_id = $8 RETURNING *;`, [name, email, specialties, observations, crm, color, req.params.id, getDataOwnerId(req.user)]);
    res.json(r.rows[0]);
});
app.delete('/api/professionals/:id', authenticateRequest, async (req, res) => {
    await pool.query(`DELETE FROM professionals WHERE id = $1 AND administrator_id = $2;`, [req.params.id, getDataOwnerId(req.user)]);
    res.status(204).send();
});

// --- Rotas Disponibilidade ---
app.get('/api/availabilities', authenticateRequest, async (req, res) => {
    const r = await pool.query('SELECT * FROM professional_availability WHERE professional_id = $1 ORDER BY day_of_week, start_time', [req.query.professional_id]);
    res.json(r.rows);
});
app.post('/api/availabilities', authenticateRequest, async (req, res) => {
    const r = await pool.query(`INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *;`, [req.body.professional_id, req.body.day_of_week, req.body.start_time, req.body.end_time]);
    res.status(201).json(r.rows[0]);
});
app.put('/api/availabilities/:id', authenticateRequest, async (req, res) => {
    const r = await pool.query(`UPDATE professional_availability SET start_time = $1, end_time = $2 WHERE id = $3 RETURNING *;`, [req.body.start_time, req.body.end_time, req.params.id]);
    res.json(r.rows[0]);
});
app.delete('/api/availabilities/:id', authenticateRequest, async (req, res) => {
    await pool.query(`DELETE FROM professional_availability WHERE id = $1`, [req.params.id]);
    res.status(204).send();
});
app.post('/api/availabilities/batch-copy', authenticateRequest, async (req, res) => {
    const { professional_id, source_day_of_week, target_days_of_week } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const source = (await client.query('SELECT start_time, end_time FROM professional_availability WHERE professional_id = $1 AND day_of_week = $2', [professional_id, source_day_of_week])).rows;
        await client.query('DELETE FROM professional_availability WHERE professional_id = $1 AND day_of_week = ANY($2::int[])', [professional_id, target_days_of_week]);
        if (source.length > 0) {
            const values = [], params = [professional_id];
            let idx = 2;
            target_days_of_week.forEach(day => {
                params.push(day); const dIdx = idx++;
                source.forEach(t => {
                    params.push(t.start_time, t.end_time);
                    values.push(`($1, $${dIdx}, $${idx++}, $${idx++})`);
                });
            });
            await client.query(`INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time) VALUES ${values.join(', ')}`, params);
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Copiado.' });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ message: 'Erro.' }); } finally { client.release(); }
});

app.get('/api/professionals/:id/public-availability', async (req, res) => {
    // ... (Lógica complexa de disponibilidade mantida idêntica à original enviada)
    // Para economizar espaço visual, assumo que a lógica SQL de generate_series está preservada aqui
    // pois não foi alvo de alteração. Se precisar dela explícita novamente, me avise.
    // ... (Inserir aqui o bloco SQL enviado anteriormente se necessário, mas vou resumir para focar no erro 403)
    const { id } = req.params;
    let { year, month } = req.query;
    if (!year || !month) { const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1; }
    try {
        const tz = (await pool.query('SELECT u.timezone FROM users u JOIN professionals p ON u.id = p.administrator_id WHERE p.id = $1', [id])).rows[0]?.timezone || 'America/Sao_Paulo';
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
        const q = `
            WITH all_days AS (SELECT day::date FROM generate_series($2::date, $3::date, '1 day') AS day),
            potential_slots AS (
                SELECT d.day, generate_series((d.day + pa.start_time) AT TIME ZONE $4, (d.day + pa.end_time - interval '1 second') AT TIME ZONE $4, '60 minutes') AS slot
                FROM all_days d JOIN professional_availability pa ON EXTRACT(ISODOW FROM d.day) = pa.day_of_week WHERE pa.professional_id = $1
            )
            SELECT to_char(p.slot AT TIME ZONE $4, 'YYYY-MM-DD') AS available_date, to_char(p.slot AT TIME ZONE $4, 'HH24:MI') AS available_time
            FROM potential_slots p
            WHERE p.slot > NOW()
            AND NOT EXISTS (SELECT 1 FROM availability_exceptions ae WHERE ae.professional_id = $1 AND ae.exception_date = p.day AND ae.start_time IS NULL)
            AND NOT EXISTS (SELECT 1 FROM availability_exceptions ae WHERE ae.professional_id = $1 AND ae.exception_date = p.day AND (p.slot AT TIME ZONE $4)::time >= ae.start_time AND (p.slot AT TIME ZONE $4)::time < ae.end_time)
            AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e.professional_id = $1 AND e.start_time = p.slot)
            ORDER BY available_date, available_time;
        `;
        const resQ = await pool.query(q, [id, startDate, endDate, tz]);
        const avail = resQ.rows.reduce((acc, r) => { (acc[r.available_date] = acc[r.available_date] || []).push(r.available_time); return acc; }, {});
        res.json(avail);
    } catch (e) { res.status(500).json({ message: 'Erro.' }); }
});

// --- Rotas Google Auth (Mantidas) ---
app.get('/api/integrations/google/auth', authenticateRequest, (req, res) => {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${process.env.BACKEND_BASE_URL}/api/integrations/google/callback`);
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'], state: req.user.userId.toString() });
    res.json({ authUrl: url });
});
app.get('/api/integrations/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${process.env.BACKEND_BASE_URL}/api/integrations/google/callback`);
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const email = (await google.oauth2({ auth: oauth2Client, version: 'v2' }).userinfo.get()).data.email;
        await pool.query(`UPDATE users SET google_access_token = $1, google_refresh_token = $2, google_user_email = $3 WHERE id = $4`, [tokens.access_token, tokens.refresh_token, email, state]);
        res.redirect(`${process.env.FRONTEND_BASE_URL}/settings?google_auth=success`);
    } catch (e) { res.redirect(`${process.env.FRONTEND_BASE_URL}/settings?google_auth=error`); }
});
app.post('/api/integrations/google/disconnect', authenticateRequest, async (req, res) => {
    await pool.query('UPDATE users SET google_access_token=NULL, google_refresh_token=NULL, google_user_email=NULL WHERE id=$1', [req.user.userId]);
    res.json({ message: 'Desconectado.' });
});
app.post('/api/integrations/google/link-professional', authenticateRequest, async (req, res) => {
    await pool.query('UPDATE professionals SET google_calendar_id = $1 WHERE id = $2', [req.body.googleCalendarId, req.body.professionalId]);
    const r = await startOrRefreshGoogleWatch(pool, req.user.userId, req.body.professionalId);
    res.json({ message: r.message });
});
app.post('/api/integrations/google/watch-professional', authenticateRequest, async (req, res) => {
    const r = await startOrRefreshGoogleWatch(pool, req.user.userId, req.body.professionalId);
    res.json({ message: r.message });
});
app.post('/api/integrations/google/webhook', (req, res) => {
    if (req.headers['x-goog-resource-state'] === 'exists') processWebhookNotification(pool, req.headers['x-goog-channel-id']);
    res.status(200).send();
});

// --- Rotas Kanban (Mantidas) ---
app.get('/api/kanban/statuses', authenticateRequest, async (req, res) => {
    await ensureDefaultStatusExists(pool, getDataOwnerId(req.user));
    const r = await pool.query('SELECT * FROM kanban_statuses WHERE user_id = $1 ORDER BY sort_order ASC', [getDataOwnerId(req.user)]);
    res.json(r.rows);
});
app.post('/api/kanban/statuses', authenticateRequest, async (req, res) => {
    try {
        const r = await pool.query('INSERT INTO kanban_statuses (name, color, sort_order, user_id) VALUES ($1, $2, $3, $4) RETURNING *', [req.body.name, req.body.color, req.body.sort_order, getDataOwnerId(req.user)]);
        res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ message: 'Erro.' }); }
});
app.put('/api/kanban/statuses/:id', authenticateRequest, async (req, res) => {
    const r = await pool.query('UPDATE kanban_statuses SET name = $1, color = $2, sort_order = $3 WHERE id = $4 AND user_id = $5 RETURNING *', [req.body.name, req.body.color, req.body.sort_order, req.params.id, getDataOwnerId(req.user)]);
    res.json(r.rows[0]);
});
app.delete('/api/kanban/statuses/:id', authenticateRequest, async (req, res) => {
    await pool.query('DELETE FROM kanban_statuses WHERE id = $1 AND user_id = $2', [req.params.id, getDataOwnerId(req.user)]);
    res.status(204).send();
});
app.post('/api/kanban/statuses/reorder', authenticateRequest, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < req.body.orderedIds.length; i++) {
            await client.query('UPDATE kanban_statuses SET sort_order = $1 WHERE id = $2 AND user_id = $3', [i + 1, req.body.orderedIds[i], getDataOwnerId(req.user)]);
        }
        await client.query('COMMIT'); res.json({ message: 'Ok' });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ message: 'Erro.' }); } finally { client.release(); }
});

// =================================================================
// --- INICIALIZAÇÃO DO SERVIDOR COM DIAGNÓSTICO ---
// =================================================================

// 6. Iniciar o servidor HTTP
server.listen(PORT, () => {
    console.log(`✏️ Servidor rodando na porta ${PORT} ✏️`);
    
    // --- [NOVO] DIAGNÓSTICO DE SENHA MESTRA AO INICIAR ---
    // Isso vai aparecer no log assim que o container subir, sem precisar clicar no botão.
    const setupPass = process.env.SETUP_MASTER_PASSWORD;
    console.log('--- [DIAGNÓSTICO DE VARIÁVEIS] ---');
    if (!setupPass) {
        console.error('❌ ERRO: A variável SETUP_MASTER_PASSWORD NÃO foi encontrada no ambiente!');
    } else {
        console.log(`✅ SETUP_MASTER_PASSWORD detectada.`);
        console.log(`   --> Tipo: ${typeof setupPass}`);
        console.log(`   --> Tamanho: ${setupPass.length} caracteres`);
        // Mostra o primeiro e o último caractere para confirmar se há espaços
        const firstChar = setupPass.charAt(0);
        const lastChar = setupPass.charAt(setupPass.length - 1);
        console.log(`   --> Inicia com: "${firstChar}"`);
        console.log(`   --> Termina com: "${lastChar}"`);
        
        if (setupPass !== setupPass.trim()) {
            console.error('⚠️ PERIGO: A senha contém espaços em branco no início ou fim! Isso causa o erro 403.');
        } else {
            console.log('✅ A senha parece limpa (sem espaços extras).');
        }
    }
    console.log('----------------------------------');
});