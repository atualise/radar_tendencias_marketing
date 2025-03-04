#!/bin/bash

# Cores para mensagens
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js não está instalado. Por favor, instale o Node.js para continuar.${NC}"
    exit 1
fi

# Verifica se o diretório node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Dependências não encontradas. Instalando...${NC}"
    
    # Verifica se o package.json existe
    if [ ! -f "package.json" ]; then
        echo -e "${BLUE}Criando package.json...${NC}"
        
        # Cria o package.json
        cat > package.json << EOL
{
  "name": "radar-tendencias-admin",
  "version": "1.0.0",
  "description": "Painel administrativo para o Radar de Tendências",
  "main": "scripts/admin-server.js",
  "scripts": {
    "admin": "node scripts/admin-server.js"
  },
  "author": "",
  "license": "ISC",
  "dependencies": {
    "aws-sdk": "^2.1013.0",
    "body-parser": "^1.19.0",
    "cors": "^2.8.5",
    "express": "^4.17.1"
  }
}
EOL
    fi
    
    echo -e "${BLUE}Instalando dependências...${NC}"
    npm install
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Falha ao instalar dependências. Verifique os erros acima.${NC}"
        exit 1
    fi
fi

# Verifica se o script do servidor existe
if [ ! -f "scripts/admin-server.js" ]; then
    echo -e "${RED}Arquivo 'scripts/admin-server.js' não encontrado.${NC}"
    exit 1
fi

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}= INICIANDO SERVIDOR DE ADMINISTRAÇÃO =${NC}"
echo -e "${GREEN}=========================================${NC}"
echo
echo -e "${BLUE}Este servidor permitirá visualizar os usuários cadastrados no DynamoDB.${NC}"
echo -e "${BLUE}Acesse o painel em:${NC} ${YELLOW}http://localhost:3000${NC}"
echo
echo -e "${BLUE}Pressione Ctrl+C para encerrar o servidor quando terminar.${NC}"
echo

# Executa o servidor
node scripts/admin-server.js 