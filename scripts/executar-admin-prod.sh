#!/bin/bash

# Cores para saída no terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Iniciando Admin Painel (Produção) ===${NC}"

# Verificar se o arquivo principal existe
if [ ! -f "./scripts/admin-resolver.js" ]; then
  echo -e "${RED}Arquivo principal não encontrado: ./scripts/admin-resolver.js${NC}"
  echo "Certifique-se de estar no diretório correto."
  exit 1
fi

# Variáveis de ambiente para o servidor admin
export NODE_ENV=production

# ATENÇÃO! SUBSTITUA ESTES VALORES PELOS CORRETOS DA SUA PRODUÇÃO
export AWS_REGION=us-east-1
export USUARIOS_TABLE=antena-app-Users-prod 
export CONTEUDOS_TABLE=antena-app-Contents-prod

echo -e "${YELLOW}Configurações:${NC}"
echo "  - Região: $AWS_REGION"
echo "  - Tabela de Usuários: $USUARIOS_TABLE"
echo "  - Tabela de Conteúdos: $CONTEUDOS_TABLE"

# Iniciar servidor
echo -e "${GREEN}Iniciando servidor admin...${NC}"
cd scripts
node admin-resolver.js

# Em caso de erro
if [ $? -ne 0 ]; then
    echo -e "${RED}Erro ao iniciar o servidor. Verifique os logs acima.${NC}"
    exit 1
fi 