// ARQUIVO: frontend/vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

const CWD = process.cwd();

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
            // --- [MODO DE AUTODESTRUIÇÃO] ---
            // Isso força o navegador a DELETAR qualquer Service Worker antigo imediatamente.
            selfDestroying: true, 
            // -------------------------------
            
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'icon-192.png', 'icon-512.png'],
            manifest: {
                name: 'LaiCal - Agenda Inteligente',
                short_name: 'LaiCal',
                theme_color: '#1A202C',
                icons: [
                    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
            }
        })
    ]
});