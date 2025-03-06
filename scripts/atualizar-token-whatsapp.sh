#!/bin/bash

# Cores para a saída
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}Atualização do Token do WhatsApp Business API${NC}"
echo -e "${BLUE}==============================================${NC}"

# Verificar presença do AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI não está instalado. Por favor, instale o AWS CLI para continuar.${NC}"
    exit 1
fi

# Definir ambiente padrão
ENVIRONMENT=${1:-prod}

# Informações sobre o Lambda
STACK_NAME="antena-app"
LAMBDA_NAME="${STACK_NAME}-WhatsAppTokenManager-${ENVIRONMENT}"

# Exibir o nome da função Lambda
echo -e "${BLUE}Função Lambda a ser invocada: ${LAMBDA_NAME}${NC}"

# Solicitar as credenciais do Meta/Facebook
echo -e "${BLUE}Por favor, forneça as informações de autenticação do Meta/Facebook:${NC}"
echo -e "${YELLOW}Nota: Você pode obter essas informações no Portal de Desenvolvedores do Meta:${NC}"
echo -e "${YELLOW}https://developers.facebook.com/apps/${NC}"

# Solicitar App ID do Meta
read -p "App ID do Meta/Facebook: " APP_ID
if [ -z "$APP_ID" ]; then
    echo -e "${RED}❌ App ID é obrigatório.${NC}"
    exit 1
fi

# Solicitar App Secret do Meta
read -p "App Secret do Meta/Facebook: " APP_SECRET
if [ -z "$APP_SECRET" ]; then
    echo -e "${RED}❌ App Secret é obrigatório.${NC}"
    exit 1
fi

# Solicitar token de acesso do usuário (token de curta duração)
read -p "Token de Acesso de Usuário (token de curta duração): " USER_TOKEN
if [ -z "$USER_TOKEN" ]; then
    echo -e "${RED}❌ Token de Acesso é obrigatório.${NC}"
    exit 1
fi

# Solicitar ID do sistema WhatsApp (opcional)
read -p "ID do sistema WhatsApp Business (opcional): " SYSTEM_ID

# Preparar os dados para invocar o Lambda
echo -e "${BLUE}Preparando payload para inicialização do sistema...${NC}"

PAYLOAD="{\"action\":\"initialize\",\"appId\":\"$APP_ID\",\"appSecret\":\"$APP_SECRET\",\"userAccessToken\":\"$USER_TOKEN\""

if [ ! -z "$SYSTEM_ID" ]; then
    PAYLOAD="$PAYLOAD,\"pageOrSystemId\":\"$SYSTEM_ID\""
fi

PAYLOAD="$PAYLOAD}"

# Invocar o Lambda para inicializar o sistema com token de longa duração
echo -e "${BLUE}Invocando Lambda para inicializar o sistema com token de longa duração...${NC}"
echo -e "${BLUE}Nome da função: ${LAMBDA_NAME}${NC}"

OUTPUT_FILE="token_response.json"

aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$PAYLOAD" \
    --cli-binary-format raw-in-base64-out \
    "$OUTPUT_FILE"

# Verificar se a execução foi bem-sucedida
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Falha ao invocar a função Lambda. Verifique as configurações e tente novamente.${NC}"
    exit 1
fi

# Verificar a resposta da função
STATUSCODE=$(jq '.statusCode' $OUTPUT_FILE 2>/dev/null)

if [ "$STATUSCODE" = "200" ]; then
    # Extrair informações sobre o token
    BODY=$(jq -r '.body' $OUTPUT_FILE 2>/dev/null)
    TOKEN_INFO=$(echo $BODY | jq '.' 2>/dev/null)
    
    TOKEN=$(echo $TOKEN_INFO | jq -r '.token' 2>/dev/null)
    EXPIRATION=$(echo $TOKEN_INFO | jq -r '.expiration' 2>/dev/null)
    
    if [ ! -z "$TOKEN" ] && [ ! -z "$EXPIRATION" ]; then
        echo -e "${GREEN}✅ Token de longa duração gerado com sucesso!${NC}"
        echo -e "${BLUE}Informações do Token:${NC}"
        echo -e "  Token: ${YELLOW}${TOKEN:0:15}...${TOKEN: -15}${NC}"
        echo -e "  Expira em: ${YELLOW}$EXPIRATION${NC}"
        
        # Calcular quantos dias faltam para a expiração
        EXPIRATION_SEC=$(date -j -f "%Y-%m-%dT%H:%M:%S.000Z" "$EXPIRATION" +%s 2>/dev/null)
        if [ $? -ne 0 ]; then
            # Tentar outro formato para sistemas como Linux
            EXPIRATION_SEC=$(date -d "$EXPIRATION" +%s 2>/dev/null)
        fi
        
        if [ ! -z "$EXPIRATION_SEC" ]; then
            NOW_SEC=$(date +%s)
            DIFF_SEC=$((EXPIRATION_SEC - NOW_SEC))
            DAYS_LEFT=$((DIFF_SEC / 86400))
            
            echo -e "  Dias restantes: ${YELLOW}$DAYS_LEFT dias${NC}"
        fi
        
        echo -e "${GREEN}✅ O sistema foi configurado para usar token de longa duração.${NC}"
        echo -e "${GREEN}✅ O token será renovado automaticamente a cada 7 dias.${NC}"
    else
        echo -e "${RED}❌ Falha ao extrair informações do token da resposta.${NC}"
    fi
else
    # Exibir mensagem de erro
    ERROR=$(jq -r '.body' $OUTPUT_FILE 2>/dev/null | jq -r '.error // "Erro desconhecido"' 2>/dev/null)
    ERROR_MESSAGE=$(jq -r '.FunctionError' $OUTPUT_FILE 2>/dev/null)
    
    echo -e "${RED}❌ Falha ao inicializar o sistema com token de longa duração.${NC}"
    echo -e "${RED}❌ Detalhes do erro: $ERROR${NC}"
    
    if [ ! -z "$ERROR_MESSAGE" ]; then
        echo -e "${RED}❌ Tipo de erro: $ERROR_MESSAGE${NC}"
    fi
    
    # Mostrar dicas de solução
    echo -e "${YELLOW}Dicas para solucionar o problema:${NC}"
    echo -e "${YELLOW}1. Verifique se o App ID e App Secret estão corretos${NC}"
    echo -e "${YELLOW}2. Confirme se o aplicativo tem as permissões corretas para WhatsApp Business${NC}"
    echo -e "${YELLOW}3. Gere um novo token de usuário com as permissões necessárias${NC}"
    echo -e "${YELLOW}4. Verifique os logs no CloudWatch para detalhes: /aws/lambda/$LAMBDA_NAME${NC}"
fi

# Limpar arquivo temporário
rm -f "$OUTPUT_FILE"

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}Para verificar o status do token a qualquer momento, execute:${NC}"
echo -e "${YELLOW}aws lambda invoke --function-name $LAMBDA_NAME --payload '{\"action\":\"getToken\"}' token_status.json${NC}"
echo -e "${BLUE}==============================================${NC}" 