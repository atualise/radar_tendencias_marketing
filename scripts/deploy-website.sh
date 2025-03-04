#!/bin/bash
set -e

# Cores para melhor legibilidade
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Obter o nome do bucket da stack do CloudFormation
echo -e "${GREEN}Obtendo informações do bucket S3...${NC}"
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='LandingPageURL'].OutputValue" --output text | sed 's/http:\/\///' | sed 's/\.s3.*$//')

if [ -z "$BUCKET_NAME" ]; then
  echo -e "${RED}Não foi possível obter o nome do bucket. Verifique se a stack 'antena-app' existe.${NC}"
  exit 1
fi

echo -e "${GREEN}Bucket encontrado: ${YELLOW}$BUCKET_NAME${NC}"

# Verificar se o diretório website existe
if [ ! -d "website" ]; then
  echo -e "${RED}Diretório 'website' não encontrado!${NC}"
  exit 1
fi

# Sincronizar arquivos
echo -e "${GREEN}Sincronizando arquivos com o bucket S3...${NC}"
aws s3 sync website/ s3://$BUCKET_NAME/ --delete

# Exibir URL do site
WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='LandingPageURL'].OutputValue" --output text)
echo -e "${GREEN}Deploy concluído com sucesso!${NC}"
echo -e "${YELLOW}Seu site está disponível em: ${WEBSITE_URL}${NC}"

# Obter URL da API de leads
LEADS_API_URL=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='LeadsApiUrl'].OutputValue" --output text)
echo -e "${YELLOW}URL da API para captura de leads: ${LEADS_API_URL}${NC}"

echo -e "${GREEN}Não esqueça de atualizar a URL da API no arquivo HTML se necessário.${NC}" 