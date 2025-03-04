#!/bin/bash

# Definir variáveis de ambiente AWS
export AWS_REGION="us-east-1"

# Cores para mensagens
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Configurando região AWS: ${GREEN}$AWS_REGION${NC}"
echo -e "${BLUE}Executando script de criação do dashboard...${NC}"

# Executar o script
node scripts/create-dashboard.js

# Verificar se o script foi executado com sucesso
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Dashboard criado com sucesso!${NC}"
    echo -e "${BLUE}Acesse o dashboard em:${NC}"
    echo -e "${GREEN}https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#dashboards:name=RadarTendencias-Comunicacao${NC}"
else
    echo -e "\033[0;31mErro ao criar o dashboard. Verifique os logs acima.${NC}"
fi 