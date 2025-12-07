// Referência: frontend/vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

const CWD = process.cwd();

// Plugin para reescrita de URLs no servidor de desenvolvimento (mantido)
const devServerRewritePlugin = {
    name: 'dev-server-rewrite',
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            const url = req.url;
            // Ignora chamadas de API ou arquivos com extensão
            if (url.startsWith('/api/') || url.includes('.') || url.startsWith('/@')) {
                return next();
            }
            
            // Regras de roteamento manual
            if (url === '/login' || url === '/login/') {
                req.url = '/login.html';
            } else if (url === '/setup' || url === '/setup/') {
                req.url = '/setup.html';
            } else {
                req.url = '/index.html';
            }
            next();
        });
    }
};

export default defineConfig({
    base: './', // Caminhos relativos para maior compatibilidade
    resolve: {
        alias: {
            '@': path.resolve(CWD, './src'),
        },
    },
    build: {
        rollupOptions: {
            input: {
                main: path.resolve(CWD, 'index.html'),
                login: path.resolve(CWD, 'login.html'),
                setup: path.resolve(CWD, 'setup.html'),
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    plugins: [
        devServerRewritePlugin,
        VitePWA({
            registerType: 'autoUpdate',
            // [IMPORTANTE] Listamos explicitamente os ícones para garantir que sejam copiados para a dist
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'icon-192.png', 'icon-512.png'],
            
            workbox: {
                // Limpeza agressiva de caches antigos para resolver o problema do Service Worker travado
                cleanupOutdatedCaches: true,
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                
                // Fallback para SPA
                navigateFallback: '/index.html',
                
                // [CRÍTICO] Impede que o Service Worker tente interceptar essas rotas
                // Isso resolve o Mixed Content no Login e Setup
                navigateFallbackDenylist: [/^\/api/, /^\/setup/, /^\/login/] 
            },

            manifest: {
                name: 'LaiCal - Agenda Inteligente',
                short_name: 'LaiCal',
                description: 'Gerencie seus eventos e agenda com facilidade.',
                theme_color: '#1A202C',
                background_color: '#1A202C',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                icons: [
                    {
                        src: 'icon-192.png', // Caminho relativo (o plugin resolve)
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: 'icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ]
});