// ARQUIVO: frontend/vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

const CWD = process.cwd();

// Mantivemos seu plugin de rewrite para desenvolvimento
const devServerRewritePlugin = {
    name: 'dev-server-rewrite',
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            const url = req.url;
            if (url.startsWith('/api/') || url.includes('.') || url.startsWith('/@')) {
                return next();
            }
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
    // 'base: ./' ajuda a evitar erros de caminho absoluto em alguns servidores
    base: './', 
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
            // Isso diz ao plugin para incluir arquivos estáticos da pasta public no cache
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', '**/*.png'],
            
            // --- CORREÇÃO DO ERRO DE MIXED CONTENT E CACHE ---
            workbox: {
                // 1. Força a limpeza de caches antigos que podem estar bugados
                cleanupOutdatedCaches: true,
                // 2. Define quais arquivos guardar em cache
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                // 3. Fallback de navegação para SPA (Single Page Application)
                navigateFallback: '/index.html',
                // 4. Evita cachear rotas de API ou imagens externas que possam dar erro
                navigateFallbackDenylist: [/^\/api/, /^\/setup/, /^\/login/] 
            },

            // O Manifesto será GERADO automaticamente aqui
            manifest: {
                name: 'LaiCal - Agenda Inteligente', // Use o nome final do seu app
                short_name: 'LaiCal',
                description: 'Gerencie seus eventos e agenda com facilidade.',
                theme_color: '#1A202C',
                background_color: '#1A202C',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                icons: [
                    {
                        src: 'icon-192.png', // O sistema vai procurar isso em /public/icon-192.png
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