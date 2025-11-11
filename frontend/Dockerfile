# FILE: frontend/Dockerfile
# FILE: frontend/Dockerfile

# --- Estágio 1: Build ---
# Usa a mesma versão do Node.js para construir o projeto
FROM node:22-alpine AS build

# MODIFICADO: Adiciona um ARG para quebrar o cache
# Esta linha força o Easypanel a ignorar o cache antigo.
ARG CACHE_BUSTER=1

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

# Roda o comando de build do Vite para gerar os arquivos otimizados
RUN npm run build

# --- Estágio 2: Produção ---
# Usa uma imagem super leve do Nginx para servir os arquivos estáticos
FROM nginx:stable-alpine

# Copia os arquivos construídos (da pasta /app/dist) para a pasta padrão do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# --- DEBUG (Regra 1) ---
# Vamos listar todos os arquivos no contexto do build.
# O "nginx.conf" DEVE aparecer nesta lista.
RUN ls -la

# [NOVO] Copia nossa configuração de proxy personalizada para o NGINX
# Isso substitui a configuração padrão do NGINX e ativa o proxy para /api/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expõe a porta 80, que é a porta padrão que o Nginx usa para servir sites
EXPOSE 80

# Comando padrão para iniciar o Nginx
CMD ["nginx", "-g", "daemon off;"]