#!/bin/bash

# Cores para a saída
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Processar argumentos de linha de comando
COMMAND=${1:-"all"}
TEMPLATE_NAME=$2

# Exibir ajuda se solicitado
if [ "$COMMAND" == "help" ] || [ "$COMMAND" == "--help" ] || [ "$COMMAND" == "-h" ]; then
    echo -e "${BLUE}==============================================${NC}"
    echo -e "${GREEN}Script de Atualização de Templates do WhatsApp${NC}"
    echo -e "${BLUE}==============================================${NC}"
    echo -e "Uso: $0 [comando] [nome_do_template]"
    echo -e ""
    echo -e "Comandos disponíveis:"
    echo -e "  all          Criar ou atualizar todos os templates (padrão)"
    echo -e "  list         Listar templates existentes"
    echo -e "  create       Criar um template específico"
    echo -e "  debug        Depurar um template específico"
    echo -e "  help         Exibir esta ajuda"
    echo -e ""
    echo -e "Exemplos:"
    echo -e "  $0                              # Criar todos os templates"
    echo -e "  $0 list                         # Listar templates existentes"
    echo -e "  $0 create boas_vindas_antena    # Criar apenas o template de boas-vindas"
    echo -e "  $0 debug onboarding_inicio_antena # Depurar o template de onboarding"
    echo -e "${BLUE}==============================================${NC}"
    exit 0
fi

# Exibir cabeçalho
echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}Script de Atualização de Templates do WhatsApp${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Comando: ${YELLOW}$COMMAND${NC}"
if [ ! -z "$TEMPLATE_NAME" ]; then
    echo -e "Template: ${YELLOW}$TEMPLATE_NAME${NC}"
fi
echo -e "${BLUE}==============================================${NC}"

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não está instalado. Por favor, instale o Node.js para continuar.${NC}"
    exit 1
fi

# Definir URL do Meta Developers para debugging
META_DEVELOPERS_URL="https://developers.facebook.com/apps/"
META_TEMPLATES_URL="https://business.facebook.com/wa/manage/message-templates/"

# Verificar se o arquivo .env existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️ Arquivo .env não encontrado. Criando um arquivo de exemplo...${NC}"
    
    cat > .env.template << EOL
# Configurações do WhatsApp Business API (obrigatórias)
WHATSAPP_API_TOKEN=seu_token_aqui
WHATSAPP_API_URL=https://graph.facebook.com/v21.0/
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id

# Outras configurações do ambiente (já existentes)
DYNAMODB_TABLE_NAME=antena-users-table
INTERACTIONS_TABLE=antena-interactions-table
CONTENTS_TABLE=antena-contents-table
SQS_CONTENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/seu-id/antena-content-queue
EOL
    
    echo -e "${YELLOW}⚠️ Arquivo .env.template criado. Por favor, renomeie para .env e preencha com suas informações.${NC}"
    echo -e "${YELLOW}⚠️ Pelo menos uma das variáveis WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_BUSINESS_ACCOUNT_ID precisa estar corretamente configurada.${NC}"
    
    # Perguntar se deseja continuar
    read -p "Deseja continuar mesmo assim? (s/n): " response
    if [[ "$response" != "s" && "$response" != "S" ]]; then
        echo -e "${YELLOW}Operação cancelada pelo usuário.${NC}"
        exit 0
    fi
else
    # Verificar se as variáveis necessárias estão no .env
    if ! grep -q "WHATSAPP_API_TOKEN" .env; then
        echo -e "${YELLOW}⚠️ Arquivo .env encontrado, mas WHATSAPP_API_TOKEN não está definido.${NC}"
        echo -e "${YELLOW}⚠️ Adicione WHATSAPP_API_TOKEN ao arquivo .env.${NC}"
        
        # Perguntar se deseja continuar
        read -p "Deseja continuar mesmo assim? (s/n): " response
        if [[ "$response" != "s" && "$response" != "S" ]]; then
            echo -e "${YELLOW}Operação cancelada pelo usuário.${NC}"
            exit 0
        fi
    fi
    
    # Verificar se pelo menos um dos IDs está presente
    if ! grep -q "WHATSAPP_PHONE_NUMBER_ID" .env && ! grep -q "WHATSAPP_BUSINESS_ACCOUNT_ID" .env; then
        echo -e "${YELLOW}⚠️ Arquivo .env encontrado, mas faltam identificadores da conta WhatsApp Business.${NC}"
        echo -e "${YELLOW}⚠️ Adicione WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_BUSINESS_ACCOUNT_ID ao arquivo .env.${NC}"
        
        # Perguntar se deseja continuar
        read -p "Deseja continuar mesmo assim? (s/n): " response
        if [[ "$response" != "s" && "$response" != "S" ]]; then
            echo -e "${YELLOW}Operação cancelada pelo usuário.${NC}"
            exit 0
        fi
    fi
fi

# Verificar se os módulos necessários estão instalados
echo -e "${BLUE}Verificando dependências...${NC}"
if ! npm list axios dotenv --depth=0 2>/dev/null | grep -q "axios" || ! npm list axios dotenv --depth=0 2>/dev/null | grep -q "dotenv"; then
    echo -e "${YELLOW}⚠️ Alguns módulos não estão instalados. Instalando...${NC}"
    npm install axios dotenv --save
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Falha ao instalar dependências. Verifique sua conexão com a internet e tente novamente.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Dependências verificadas. Executando script de atualização de templates...${NC}"
echo -e "${BLUE}==============================================${NC}"

# Preparar o comando a ser executado
NODE_COMMAND="node scripts/whatsapp-templates.js $COMMAND"
if [ ! -z "$TEMPLATE_NAME" ]; then
    NODE_COMMAND="$NODE_COMMAND $TEMPLATE_NAME"
fi

# Executar o script Node.js e capturar a saída
OUTPUT=$(eval $NODE_COMMAND 2>&1)
SCRIPT_RESULT=$?

echo "$OUTPUT"

if [ $SCRIPT_RESULT -eq 0 ]; then
    echo -e "${BLUE}==============================================${NC}"
    echo -e "${GREEN}✅ Operação concluída com sucesso!${NC}"
    echo -e "${BLUE}==============================================${NC}"
    
    if [ "$COMMAND" == "all" ]; then
        echo -e "${YELLOW}ℹ️ Agora é necessário atualizar o código das funções Lambda para utilizar os templates.${NC}"
        echo -e "${YELLOW}ℹ️ Consulte a documentação em docs/whatsapp-templates.md para mais informações.${NC}"
    fi
    
    # Exibir próximos passos com base no comando executado
    if [ "$COMMAND" == "list" ]; then
        echo -e "${YELLOW}ℹ️ Para criar um template específico, use:${NC}"
        echo -e "${YELLOW}ℹ️ $0 create <nome_do_template>${NC}"
    elif [ "$COMMAND" == "debug" ]; then
        echo -e "${YELLOW}ℹ️ Depois de corrigir os problemas, tente criar o template usando:${NC}"
        echo -e "${YELLOW}ℹ️ $0 create $TEMPLATE_NAME${NC}"
    fi
else
    echo -e "${BLUE}==============================================${NC}"
    echo -e "${RED}❌ Falha ao executar o comando '$COMMAND'. Verificando causas possíveis:${NC}"
    
    # Verificar possíveis causas e sugerir soluções
    if echo "$OUTPUT" | grep -q "ENOTFOUND"; then
        echo -e "${YELLOW}⚠️ Problema de conectividade: Não foi possível conectar-se à API do WhatsApp.${NC}"
        echo -e "${YELLOW}⚠️ Verifique sua conexão com a internet.${NC}"
    elif echo "$OUTPUT" | grep -q "access_token" || echo "$OUTPUT" | grep -q "Authentication required"; then
        echo -e "${YELLOW}⚠️ Problema de autenticação: Token inválido ou expirado.${NC}"
        echo -e "${YELLOW}⚠️ Verifique se o token do WhatsApp está correto e tem as permissões necessárias.${NC}"
        echo -e "${YELLOW}⚠️ Permissões necessárias: whatsapp_business_messaging${NC}"
        echo -e "${YELLOW}⚠️ Você pode gerar um novo token em: ${META_DEVELOPERS_URL}${NC}"
    elif echo "$OUTPUT" | grep -q "Unexpected key"; then
        echo -e "${YELLOW}⚠️ Problema com o formato dos templates: Estrutura incompatível com a API atual.${NC}"
        echo -e "${YELLOW}⚠️ A estrutura dos templates foi atualizada, mas a API está rejeitando algum parâmetro.${NC}"
        echo -e "${YELLOW}⚠️ Principais causas:${NC}"
        echo -e "${YELLOW}   1. A versão da API mudou e requer uma estrutura diferente${NC}"
        echo -e "${YELLOW}   2. O formato específico dos componentes está incorreto${NC}"
        echo -e "${YELLOW}⚠️ Tente modificar a estrutura dos templates no arquivo scripts/whatsapp-templates.js${NC}"
        echo -e "${YELLOW}⚠️ Consulte a documentação mais recente em: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages${NC}"
        echo -e "${YELLOW}⚠️ Para depurar um template específico, execute:${NC}"
        echo -e "${YELLOW}   $0 debug <nome_do_template>${NC}"
    elif echo "$OUTPUT" | grep -q "nonexisting field"; then
        echo -e "${YELLOW}⚠️ Problema com o formato do endpoint: Endpoint inválido detectado.${NC}"
        echo -e "${YELLOW}⚠️ O script tentará encontrar automaticamente o endpoint correto.${NC}"
        echo -e "${YELLOW}⚠️ Verifique na saída acima se algum endpoint válido foi encontrado.${NC}"
    elif echo "$OUTPUT" | grep -q "Não foi possível encontrar um endpoint válido"; then
        echo -e "${YELLOW}⚠️ Nenhum endpoint válido para templates encontrado.${NC}"
        echo -e "${YELLOW}⚠️ Verifique se:${NC}"
        echo -e "${YELLOW}   1. Seu token tem permissões whatsapp_business_messaging${NC}"
        echo -e "${YELLOW}   2. O PHONE_NUMBER_ID e BUSINESS_ACCOUNT_ID estão corretos${NC}"
        echo -e "${YELLOW}   3. Sua conta está configurada para usar templates${NC}"
        echo -e "${YELLOW}⚠️ Você pode ver seus templates existentes em: ${META_TEMPLATES_URL}${NC}"
    elif echo "$OUTPUT" | grep -q "Object with ID.* does not exist"; then
        echo -e "${YELLOW}⚠️ ID de objeto inválido. O ID fornecido não existe ou não está acessível.${NC}"
        echo -e "${YELLOW}⚠️ Verifique se:${NC}"
        echo -e "${YELLOW}   1. WHATSAPP_PHONE_NUMBER_ID está correto${NC}"
        echo -e "${YELLOW}   2. WHATSAPP_BUSINESS_ACCOUNT_ID está correto${NC}"
        echo -e "${YELLOW}   3. Você tem permissões para acessar esses recursos${NC}"
    else
        echo -e "${YELLOW}⚠️ Erro desconhecido. Verifique os logs acima para mais detalhes.${NC}"
        echo -e "${YELLOW}⚠️ Tente executar apenas a listagem de templates:${NC}"
        echo -e "${YELLOW}   $0 list${NC}"
    fi
    
    echo -e "${BLUE}==============================================${NC}"
    echo -e "${YELLOW}ℹ️ Para obter mais informações sobre a configuração do WhatsApp Business API, acesse:${NC}"
    echo -e "${YELLOW}ℹ️ https://developers.facebook.com/docs/whatsapp/cloud-api/get-started${NC}"
    exit 1
fi 