#!/bin/bash
set -e

# Cores para melhor legibilidade
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se há um ID de distribuição CloudFront passado como parâmetro
if [ "$1" == "--cloudfront-id" ] && [ -n "$2" ]; then
  CLOUDFRONT_ID="$2"
  echo -e "${GREEN}Usando ID do CloudFront fornecido: ${YELLOW}$CLOUDFRONT_ID${NC}"
fi

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

# Obter ID da distribuição CloudFront se não foi fornecido como parâmetro
if [ -z "$CLOUDFRONT_ID" ]; then
  echo -e "${GREEN}Procurando distribuição CloudFront...${NC}"
  
  # Tentar várias possíveis chaves de saída
  CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)
  
  # Se não encontrou, tente outros nomes possíveis
  if [ -z "$CLOUDFRONT_ID" ] || [ "$CLOUDFRONT_ID" == "None" ]; then
    CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='CloudFrontId'].OutputValue" --output text)
  fi
  
  if [ -z "$CLOUDFRONT_ID" ] || [ "$CLOUDFRONT_ID" == "None" ]; then
    CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
  fi
  
  # Se ainda não encontrou, procure nas distribuições existentes associadas ao bucket
  if [ -z "$CLOUDFRONT_ID" ] || [ "$CLOUDFRONT_ID" == "None" ]; then
    echo -e "${YELLOW}Procurando distribuições CloudFront associadas ao bucket ${BUCKET_NAME}...${NC}"
    
    # Obter todas as distribuições do CloudFront
    DISTRIBUTIONS=$(aws cloudfront list-distributions --query "DistributionList.Items[*].{Id:Id, Domain:DomainName, Origin:Origins.Items[0].DomainName}" --output json)
    
    # Procurar distribuição que tem o bucket como origem
    CLOUDFRONT_ID=$(echo $DISTRIBUTIONS | jq -r ".[] | select(.Origin | contains(\"$BUCKET_NAME\")) | .Id" | head -1)
  fi
fi

# Verificar se temos um ID de distribuição válido
if [ -z "$CLOUDFRONT_ID" ] || [ "$CLOUDFRONT_ID" == "None" ]; then
  echo -e "${RED}Nenhuma distribuição CloudFront encontrada automaticamente.${NC}"
  echo -e "${YELLOW}Se você sabe o ID da distribuição, execute novamente com:${NC}"
  echo -e "${GREEN}./scripts/deploy-website.sh --cloudfront-id SEU_ID_AQUI${NC}"
  
  # Perguntar ao usuário se deseja continuar sem invalidar o cache
  read -p "Deseja continuar sem invalidar o cache do CloudFront? (s/n): " CONTINUE
  if [ "$CONTINUE" != "s" ]; then
    exit 1
  fi
else
  # Realizar a invalidação de cache
  echo -e "${GREEN}Invalidando cache do CloudFront para a distribuição ${YELLOW}$CLOUDFRONT_ID${NC}..."
  INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*" --query "Invalidation.Id" --output text)
  
  echo -e "${GREEN}Invalidação iniciada. ID: ${YELLOW}$INVALIDATION_ID${NC}"
  echo -e "${GREEN}Aguardando a conclusão da invalidação...${NC}"
  
  # Aguardar a conclusão da invalidação
  aws cloudfront wait invalidation-completed --distribution-id $CLOUDFRONT_ID --id $INVALIDATION_ID
  echo -e "${GREEN}Invalidação de cache concluída com sucesso!${NC}"
fi

# Exibir URL do site
WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='LandingPageURL'].OutputValue" --output text)
echo -e "${GREEN}Deploy concluído com sucesso!${NC}"
echo -e "${YELLOW}Seu site está disponível em: ${WEBSITE_URL}${NC}"

# Obter URL da API de leads
LEADS_API_URL=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='LeadsApiUrl'].OutputValue" --output text)
echo -e "${YELLOW}URL da API para captura de leads: ${LEADS_API_URL}${NC}"

# Obter URL da distribuição CloudFront (se existir)
if [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
  # Tentar obter da stack do CloudFormation primeiro
  CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" --output text)
  
  # Se não encontrou na stack, obter diretamente da distribuição
  if [ -z "$CLOUDFRONT_URL" ] || [ "$CLOUDFRONT_URL" == "None" ]; then
    CLOUDFRONT_URL=$(aws cloudfront get-distribution --id $CLOUDFRONT_ID --query "Distribution.DomainName" --output text)
  fi
  
  if [ -n "$CLOUDFRONT_URL" ] && [ "$CLOUDFRONT_URL" != "None" ]; then
    echo -e "${YELLOW}Seu site também está disponível via CloudFront: https://${CLOUDFRONT_URL}${NC}"
  fi
fi

echo -e "${GREEN}Não esqueça de atualizar a URL da API no arquivo HTML se necessário.${NC}" 