#!/bin/bash
# Script para preparar o projeto para implantação

echo "Preparando o projeto Radar de Tendências para implantação..."

# 1. Verificar requisitos
echo "Verificando requisitos..."
command -v aws >/dev/null 2>&1 || { echo "AWS CLI não encontrado. Por favor, instale-o primeiro." >&2; exit 1; }
command -v sam >/dev/null 2>&1 || { echo "AWS SAM CLI não encontrado. Por favor, instale-o primeiro." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js não encontrado. Por favor, instale-o primeiro." >&2; exit 1; }

# 2. Verificar se tem as variáveis de ambiente necessárias
if [ ! -f .env ]; then
    echo "Arquivo .env não encontrado. Criando a partir do exemplo..."
    cp .env.example .env
    echo "Por favor, edite o arquivo .env com suas configurações reais antes de prosseguir."
    exit 1
fi

# 3. Instalar dependências
echo "Instalando dependências..."
npm install

# 4. Preparar diretórios para as funções Lambda
mkdir -p src/processador-leads/node_modules
mkdir -p src/whatsapp-webhook/node_modules
mkdir -p src/orquestrador/node_modules
mkdir -p src/gerador-conteudo/node_modules
mkdir -p src/whatsapp-sender/node_modules

# 5. Copiar dependências para as funções Lambda
echo "Copiando dependências para as funções Lambda..."
cp -r node_modules/aws-sdk src/processador-leads/node_modules/
cp -r node_modules/uuid src/processador-leads/node_modules/

cp -r node_modules/aws-sdk src/whatsapp-webhook/node_modules/
cp -r node_modules/uuid src/whatsapp-webhook/node_modules/

cp -r node_modules/aws-sdk src/orquestrador/node_modules/
cp -r node_modules/uuid src/orquestrador/node_modules/

cp -r node_modules/aws-sdk src/gerador-conteudo/node_modules/
cp -r node_modules/axios src/gerador-conteudo/node_modules/
cp -r node_modules/uuid src/gerador-conteudo/node_modules/

cp -r node_modules/aws-sdk src/whatsapp-sender/node_modules/
cp -r node_modules/axios src/whatsapp-sender/node_modules/

# 6. Validar o template SAM
echo "Validando o template SAM..."
sam validate -t template.yaml

if [ $? -ne 0 ]; then
    echo "Erro na validação do template SAM. Corrija os erros antes de continuar."
    exit 1
fi

# 7. Construir o pacote SAM
echo "Construindo o pacote SAM..."
sam build

if [ $? -ne 0 ]; then
    echo "Erro na construção do pacote SAM. Corrija os erros antes de continuar."
    exit 1
fi

echo "Preparação concluída com sucesso!"
echo "Para realizar o deploy, execute: sam deploy --guided" 