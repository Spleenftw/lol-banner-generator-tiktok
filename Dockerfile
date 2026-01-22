# Utilise une image Node légère
FROM node:18-alpine

WORKDIR /app

# Copie les fichiers de dépendances
COPY package.json .

# Installe tout
RUN npm install

# Copie le reste du code
COPY . .

# Construit l'application React (crée le dossier dist/)
RUN npm run build

# Expose le port
EXPOSE 3002

# Lance le serveur
CMD ["node", "server.js"]
