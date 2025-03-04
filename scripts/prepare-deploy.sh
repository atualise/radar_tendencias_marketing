#!/bin/bash
set -e

# Cores para melhor legibilidade
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Preparando o projeto Radar de Tendências para implantação...${NC}"

# Verificar se AWS SAM CLI está instalado
if ! command -v sam &> /dev/null; then
    echo -e "${RED}AWS SAM CLI não está instalado!${NC}"
    echo -e "${YELLOW}Por favor, instale o AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html${NC}"
    exit 1
fi

# Verificar versão mínima do SAM CLI
SAM_VERSION=$(sam --version | grep -o '[0-9.]*' | head -1)
if [[ "$(printf '%s\n' "1.0.0" "$SAM_VERSION" | sort -V | head -n1)" = "1.0.0" ]]; then
    echo -e "${GREEN}SAM CLI versão ${SAM_VERSION} encontrada.${NC}"
else
    echo -e "${RED}SAM CLI versão ${SAM_VERSION} é muito antiga. Recomendamos versão 1.0.0 ou superior.${NC}"
    exit 1
fi

# Instalar dependências do projeto
echo -e "${GREEN}Instalando dependências do projeto...${NC}"
npm install

# Criar diretório node_modules em cada diretório do Lambda se não existir
echo -e "${GREEN}Preparando módulos para funções Lambda...${NC}"
mkdir -p src/whatsapp-webhook/node_modules/
mkdir -p src/processador-leads/node_modules/
mkdir -p src/orquestrador/node_modules/
mkdir -p src/gerador-conteudo/node_modules/
mkdir -p src/whatsapp-sender/node_modules/

# Copiar dependências para cada função Lambda
echo -e "${GREEN}Copiando dependências para as funções Lambda...${NC}"
# Dependências comuns
cp -r node_modules/aws-sdk src/whatsapp-webhook/node_modules/ 2>/dev/null || echo -e "${YELLOW}aws-sdk já existe ou não pôde ser copiado para whatsapp-webhook${NC}"
cp -r node_modules/uuid src/whatsapp-webhook/node_modules/ 2>/dev/null || echo -e "${YELLOW}uuid já existe ou não pôde ser copiado para whatsapp-webhook${NC}"

cp -r node_modules/aws-sdk src/processador-leads/node_modules/ 2>/dev/null || echo -e "${YELLOW}aws-sdk já existe ou não pôde ser copiado para processador-leads${NC}"
cp -r node_modules/uuid src/processador-leads/node_modules/ 2>/dev/null || echo -e "${YELLOW}uuid já existe ou não pôde ser copiado para processador-leads${NC}"

cp -r node_modules/aws-sdk src/orquestrador/node_modules/ 2>/dev/null || echo -e "${YELLOW}aws-sdk já existe ou não pôde ser copiado para orquestrador${NC}"
cp -r node_modules/uuid src/orquestrador/node_modules/ 2>/dev/null || echo -e "${YELLOW}uuid já existe ou não pôde ser copiado para orquestrador${NC}"

cp -r node_modules/aws-sdk src/gerador-conteudo/node_modules/ 2>/dev/null || echo -e "${YELLOW}aws-sdk já existe ou não pôde ser copiado para gerador-conteudo${NC}"
cp -r node_modules/uuid src/gerador-conteudo/node_modules/ 2>/dev/null || echo -e "${YELLOW}uuid já existe ou não pôde ser copiado para gerador-conteudo${NC}"
cp -r node_modules/axios src/gerador-conteudo/node_modules/ 2>/dev/null || echo -e "${YELLOW}axios já existe ou não pôde ser copiado para gerador-conteudo${NC}"

cp -r node_modules/aws-sdk src/whatsapp-sender/node_modules/ 2>/dev/null || echo -e "${YELLOW}aws-sdk já existe ou não pôde ser copiado para whatsapp-sender${NC}"
cp -r node_modules/axios src/whatsapp-sender/node_modules/ 2>/dev/null || echo -e "${YELLOW}axios já existe ou não pôde ser copiado para whatsapp-sender${NC}"
cp -r node_modules/uuid src/whatsapp-sender/node_modules/ 2>/dev/null || echo -e "${YELLOW}uuid já existe ou não pôde ser copiado para whatsapp-sender${NC}"

# Validar o template SAM
echo -e "${GREEN}Validando o template SAM...${NC}"
sam validate -t template.yaml || {
    echo -e "${RED}Erro na validação do template SAM. Corrija os erros antes de continuar.${NC}"
    exit 1
}

echo -e "${GREEN}Preparação para deploy concluída com sucesso!${NC}"
echo -e "${YELLOW}Para realizar o deploy, execute: npm run deploy${NC}" 