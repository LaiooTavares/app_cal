// frontend/vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
// --- [INÍCIO DA MODIFICAÇÃO (PWA)] ---
import { VitePWA } from 'vite-plugin-pwa';
// --- [FIM DA MODIFICAÇÃO (PWA)] ---

// Pega o diretório atual do arquivo
const CWD = process.cwd();

// --- [INÍCIO DA MODIFICAÇÃO (History Mode no Dev Server)] ---
// 1. Definimos um plugin de middleware personalizado
const devServerRewritePlugin = {
    name: 'dev-server-rewrite',
    configureServer(server) {
        // Adiciona um middleware ao servidor do Vite
        server.middlewares.use((req, res, next) => {
            const url = req.url;

            // Rotas de API, assets (ex: .js, .css), e módulos do Vite não são modificados
            if (url.startsWith('/api/') || url.includes('.') || url.startsWith('/@')) {
                return next();
            }

            // --- Nossas Regras (imitando o Nginx) ---

            // 2. Se a URL for /login, sirva /login.html
            if (url === '/login' || url === '/login/') {
                req.url = '/login.html';
            }
            // 3. Se a URL for /setup, sirva /setup.html
            else if (url === '/setup' || url === '/setup/') {
                req.url = '/setup.html';
            }
            // 4. Para todas as outras URLs (ex: /calendar, /events, /)
            else {
                // Sirva o index.html (este é o "SPA Fallback")
                req.url = '/index.html';
            }
            
            // Continua para o próximo middleware
            next();
        });
    }
};
// --- [FIM DA MODIFICAÇÃO] ---


export default defineConfig({
    resolve: {
        alias: {
            // Mantém o seu alias @
            '@': path.resolve(CWD, './src'),
        },
    },
    build: {
        rollupOptions: {
            input: {
                // MODIFICADO: Usamos CWD (Current Working Directory)
                // que, no Docker, será /app.
                // Isso garante que o Vite encontre os arquivos HTML na raiz.
                main: path.resolve(CWD, 'index.html'),
                login: path.resolve(CWD, 'login.html'),
                setup: path.resolve(CWD, 'setup.html'),
            },
        },
        // Opcional: Adiciona um log para vermos o que está a acontecer
        // (Isso não é necessário para o build, mas ajuda a depurar)
        outDir: 'dist', 
        emptyOutDir: true, 
    },
    // Configuração do servidor de desenvolvimento (não afeta a produção)
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    // --- [INÍCIO DA MODIFICAÇÃO (PWA)] ---
    // 5. Adicionamos os nossos plugins ao Vite
    plugins: [
        devServerRewritePlugin,
        VitePWA({
            // registerType: 'autoUpdate' é a opção mais moderna.
            // O app irá atualizar-se automaticamente quando detetar uma nova versão.
            registerType: 'autoUpdate',
            
            // Informa ao plugin para incluir os ícones que já estão na pasta 'public'
            includeAssets: ['faviconapp/favicon.ico'],
            
            // Configuração do 'manifest.json' que será gerado
            manifest: {
                name: 'RecepCal - Agendamentos',
                short_name: 'RecepCal',
                description: 'Aplicativo para gerenciamento de calendário e agendamentos.',
                // Cor da barra de título do app (deve ser a mesma do index.html)
                theme_color: '#1A202C',
                // Cor de fundo da "splash screen" (tela de abertura)
                background_color: '#1A202C',
                // Define que o app deve abrir como uma janela (sem a barra de URL)
                display: 'standalone',
                // A página inicial do app
                start_url: '/',
                // Ícones (ele usará o icon-512.png que você colocou na pasta /public)
                icons: [
                    {
                        src: '/icon-192.png', // O plugin irá gerar este
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/icon-512.png', // Este é o que você forneceu
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: '/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        // "maskable" é importante para ícones adaptativos no Android
                        purpose: 'maskable' 
                    }
                ]
            }
        })
    ]
    // --- [FIM DA MODIFICAÇÃO (PWA)] ---
});