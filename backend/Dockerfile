# FILE: backend/Dockerfile

# --- Estágio 1: Build ---
# [MODIFICADO] Trocado 'alpine' por 'bookworm' (Debian 12)
# Motivo: A imagem 'alpine' não possui as ferramentas (python, make, g++)
# necessárias para compilar dependências nativas como 'bcrypt'.
# A imagem 'bookworm' completa (baseada em Debian) já inclui tudo.
FROM node:22-bookworm AS builder

# [MODIFICADO] Adiciona um ARG para quebrar o cache do Docker no deploy
ARG CACHE_BUSTER=1

# Define o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências de produção
# [NOTA] Na imagem 'bookworm', o 'npm install' do 'bcrypt' funcionará.
RUN npm install --only=production

# Copia o resto do código da sua aplicação
COPY . .

# --- Estágio 2: Produção ---
# [MODIFICADO] Trocado 'alpine' por 'bookworm-slim' para produção
# Usamos a imagem 'slim' que é menor que a 'bookworm' completa,
# mas ainda é 100% compatível com os binários compilados no Estágio 1.
FROM node:22-bookworm-slim

WORKDIR /usr/src/app

# Copia as dependências já instaladas do estágio de build
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app ./

# Expõe a porta que sua API usa (o server.js usa 3000)
EXPOSE 3000

# Comando consistente com o package.json
# O package.json define "start": "node server.js"
CMD [ "npm", "start" ]