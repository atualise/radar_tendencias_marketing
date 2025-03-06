#!/bin/bash

# Cores para a saída
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}Atualização do Sistema de WhatsApp Antena${NC}"
echo -e "${BLUE}==============================================${NC}"

# Verificar se o arquivo de configuração existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️ Arquivo .env não encontrado. Criando um arquivo de exemplo...${NC}"
    
    cat > .env.template << EOL
# Configurações do WhatsApp Business API (obrigatórias)
WHATSAPP_API_TOKEN=seu_token_aqui
WHATSAPP_API_URL=https://graph.facebook.com/v17.0/
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id

# Outras configurações do ambiente (já existentes)
DYNAMODB_TABLE_NAME=antena-users-table
INTERACTIONS_TABLE=antena-interactions-table
CONTENTS_TABLE=antena-contents-table
SQS_CONTENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/seu-id/antena-content-queue
EOL
    
    echo -e "${YELLOW}⚠️ Arquivo .env.template criado. Por favor, renomeie para .env e preencha com suas informações.${NC}"
    echo -e "${YELLOW}⚠️ As variáveis WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_BUSINESS_ACCOUNT_ID são obrigatórias.${NC}"
    read -p "Deseja continuar mesmo assim? (s/n): " response
    if [[ "$response" != "s" && "$response" != "S" ]]; then
        echo -e "${YELLOW}Operação cancelada pelo usuário.${NC}"
        exit 0
    fi
fi

# Verificar e criar o diretório docs se não existir
if [ ! -d "docs" ]; then
    echo -e "${YELLOW}⚠️ Diretório docs não encontrado. Criando...${NC}"
    mkdir -p docs
fi

# Executar o script de atualização de templates
echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}Passo 1: Atualizando templates do WhatsApp...${NC}"
echo -e "${BLUE}==============================================${NC}"

# Tornar o script executável se não estiver
if [ ! -x "scripts/atualizar-templates-whatsapp.sh" ]; then
    chmod +x scripts/atualizar-templates-whatsapp.sh
fi

./scripts/atualizar-templates-whatsapp.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Falha ao atualizar templates. Verifique os logs acima.${NC}"
    exit 1
fi

# Empacotar e implantar as funções Lambda
echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}Passo 2: Empacotando e implantando funções Lambda...${NC}"
echo -e "${BLUE}==============================================${NC}"

# Verificar se o script prepare-deploy.sh existe
if [ ! -f "scripts/prepare-deploy.sh" ]; then
    echo -e "${RED}❌ Script prepare-deploy.sh não encontrado. Verifique se você está no diretório raiz do projeto.${NC}"
    exit 1
fi

# Tornar o script executável se não estiver
if [ ! -x "scripts/prepare-deploy.sh" ]; then
    chmod +x scripts/prepare-deploy.sh
fi

# Executar o script de preparação de deploy
./scripts/prepare-deploy.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Falha ao preparar o deploy. Verifique os logs acima.${NC}"
    exit 1
fi

# Verificar se o AWS CLI está instalado
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI não está instalado. Por favor, instale o AWS CLI para continuar.${NC}"
    exit 1
fi

# Verificar se o usuário está logado no AWS CLI
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ Você não está autenticado no AWS CLI. Execute 'aws configure' para configurar suas credenciais.${NC}"
    exit 1
fi

echo -e "${YELLOW}⚠️ Atenção: A próxima etapa irá implantar as alterações na AWS.${NC}"
read -p "Deseja continuar com o deploy? (s/n): " deploy_response
if [[ "$deploy_response" != "s" && "$deploy_response" != "S" ]]; then
    echo -e "${YELLOW}Deploy cancelado pelo usuário.${NC}"
    echo -e "${GREEN}✅ Os templates foram atualizados e o código foi preparado, mas não foi implantado.${NC}"
    echo -e "${GREEN}✅ Para implantar manualmente, execute 'aws cloudformation deploy ...' ou use o console da AWS.${NC}"
    exit 0
fi

# Executar o deploy com AWS CLI
echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}Passo 3: Implantando na AWS...${NC}"
echo -e "${BLUE}==============================================${NC}"

# Nome do bucket S3 para upload do código (pode ser obtido de uma variável de ambiente ou configuração)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name antena-app --query "Stacks[0].Outputs[?OutputKey=='DeploymentBucket'].OutputValue" --output text)

if [ -z "$S3_BUCKET" ]; then
    echo -e "${YELLOW}⚠️ Não foi possível determinar o bucket S3 para deploy. Por favor, informe:${NC}"
    read -p "Nome do bucket S3: " S3_BUCKET
fi

# Verificar a existência do diretório dist/
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠️ Diretório dist/ não encontrado. Criando...${NC}"
    mkdir -p dist
    
    # Copiar os arquivos necessários para o diretório dist/
    echo -e "${YELLOW}ℹ️ Copiando arquivos necessários para o diretório dist/...${NC}"
    cp -r src/* dist/
fi

# Upload dos artefatos para o S3
echo -e "${GREEN}Fazendo upload dos artefatos para o S3...${NC}"
aws s3 cp dist/ s3://$S3_BUCKET/code/ --recursive

# Carregar parâmetros do arquivo .env
if [ -f .env ]; then
    echo -e "${GREEN}Carregando parâmetros do arquivo .env...${NC}"
    
    # Extrair valores das variáveis necessárias
    CLAUDE_API_KEY=$(grep "CLAUDE_API_KEY" .env | cut -d'=' -f2)
    WEBHOOK_VERIFY_TOKEN=$(grep "WEBHOOK_VERIFY_TOKEN" .env | cut -d'=' -f2)
    WHATSAPP_PHONE_NUMBER_ID=$(grep "WHATSAPP_PHONE_NUMBER_ID" .env | cut -d'=' -f2)
    WHATSAPP_API_TOKEN=$(grep "WHATSAPP_API_TOKEN" .env | cut -d'=' -f2)
    
    # Verificar se todos os parâmetros obrigatórios estão disponíveis
    MISSING_PARAMS=""
    if [ -z "$CLAUDE_API_KEY" ]; then MISSING_PARAMS="$MISSING_PARAMS ClaudeAPIKey"; fi
    if [ -z "$WEBHOOK_VERIFY_TOKEN" ]; then MISSING_PARAMS="$MISSING_PARAMS WebhookVerifyToken"; fi
    if [ -z "$WHATSAPP_PHONE_NUMBER_ID" ]; then MISSING_PARAMS="$MISSING_PARAMS WhatsAppPhoneNumberId"; fi
    if [ -z "$WHATSAPP_API_TOKEN" ]; then MISSING_PARAMS="$MISSING_PARAMS WhatsAppAPIToken"; fi
    
    if [ ! -z "$MISSING_PARAMS" ]; then
        echo -e "${RED}❌ Os seguintes parâmetros obrigatórios estão faltando no arquivo .env: $MISSING_PARAMS${NC}"
        echo -e "${YELLOW}⚠️ Adicione esses parâmetros ao arquivo .env e tente novamente.${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Arquivo .env não encontrado. Ele é necessário para obter os parâmetros do CloudFormation.${NC}"
    exit 1
fi

# Atualizar as funções Lambda com os parâmetros do .env
echo -e "${GREEN}Atualizando funções Lambda...${NC}"
aws cloudformation update-stack \
    --stack-name antena-app \
    --template-body file://template.yaml \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameters \
        ParameterKey=ClaudeAPIKey,ParameterValue=$CLAUDE_API_KEY \
        ParameterKey=WebhookVerifyToken,ParameterValue=$WEBHOOK_VERIFY_TOKEN \
        ParameterKey=WhatsAppPhoneNumberId,ParameterValue=$WHATSAPP_PHONE_NUMBER_ID \
        ParameterKey=WhatsAppAPIToken,ParameterValue=$WHATSAPP_API_TOKEN

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Falha ao atualizar o stack. Verifique os logs acima.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Solicitação de atualização enviada com sucesso!${NC}"
echo -e "${YELLOW}ℹ️ A atualização do CloudFormation pode levar alguns minutos.${NC}"
echo -e "${YELLOW}ℹ️ Você pode acompanhar o progresso no console da AWS.${NC}"

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}✅ Atualização do sistema WhatsApp concluída!${NC}"
echo -e "${BLUE}==============================================${NC}"

echo -e "${YELLOW}ℹ️ Próximos passos:${NC}"
echo -e "${YELLOW}1. Verifique se os templates foram aprovados no painel do Facebook Business.${NC}"
echo -e "${YELLOW}2. Teste o sistema com um novo cadastro para confirmar que as mensagens de template são enviadas.${NC}"
echo -e "${YELLOW}3. Consulte a documentação em docs/whatsapp-templates.md para mais informações.${NC}" 