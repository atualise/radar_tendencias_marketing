# Radar de Tendências em Marketing Digital

Sistema de inteligência para profissionais de marketing que fornece insights, tendências e recomendações de ferramentas via WhatsApp.

## Visão Geral

O Radar de Tendências em Marketing Digital é uma plataforma serverless baseada em AWS que conecta profissionais de marketing a informações relevantes e atualizadas sobre o mercado. O sistema utiliza a API do WhatsApp Business para comunicação e o Claude da Anthropic para geração de conteúdo inteligente.

## Arquitetura

O sistema foi construído seguindo uma arquitetura serverless utilizando os seguintes serviços AWS:

- **API Gateway**: Recebe webhooks do WhatsApp e chamadas da Landing Page
- **Lambda**: Processa mensagens e gera conteúdo
- **SQS**: Gerencia filas de mensagens para processamento assíncrono
- **DynamoDB**: Armazena dados de usuários, interações e conteúdos
- **S3**: Hospeda a landing page estática
- **CloudWatch**: Monitoramento de métricas e alarmes

## Funcionalidades Principais

1. **Captura de Leads**: Formulário na landing page para capturar novos usuários
2. **Webhook WhatsApp**: Recebe e processa mensagens do WhatsApp
3. **Comandos Especiais**: Processamento de comandos como `/tendencia`, `/ferramenta`, `/case` e `/ajuda`
4. **Geração de Conteúdo**: Utiliza Claude API para gerar respostas personalizadas
5. **Onboarding**: Fluxo de boas-vindas para novos usuários
6. **Envio de Mensagens**: Integração com WhatsApp Business API
7. **Mecanismo de Retry**: Sistema robusto com retentativas para garantir a entrega de mensagens
8. **Monitoramento Avançado**: Dashboard e alarmes para acompanhar a saúde do sistema

## Pré-requisitos

Para executar este projeto, você precisa:

- Conta AWS
- Node.js 14.x ou superior
- AWS CLI configurado
- AWS SAM CLI
- Conta no WhatsApp Business API
- Chave de API da Claude (Anthropic)

## Configuração e Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd radar-tendencias-marketing
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente em um arquivo `.env` ou via parâmetros de deploy.

4. Prepare o ambiente para deploy:
```bash
./prepare-deploy.sh
```

5. Deploy da aplicação:
```bash
npm run deploy
```

6. Durante o deploy guiado, você será solicitado a fornecer:
   - Chave da API Claude
   - Token da API WhatsApp
   - ID do número de telefone do WhatsApp
   - Token de verificação do webhook

7. Configure o monitoramento e alarmes:
```bash
node scripts/create-dashboard.js
node scripts/create-alarms.js seu-email@exemplo.com
```

## Estrutura de Diretórios

```
/
├── src/                        # Código fonte das funções Lambda
│   ├── processador-leads/      # Processa leads da landing page
│   ├── whatsapp-webhook/       # Recebe webhooks do WhatsApp
│   ├── orquestrador/           # Coordena respostas 
│   ├── gerador-conteudo/       # Gera conteúdo via Claude API
│   └── whatsapp-sender/        # Envia mensagens via WhatsApp
├── website/                    # Arquivos da landing page
├── scripts/                    # Scripts utilitários
│   ├── create-dashboard.js     # Cria dashboard no CloudWatch
│   ├── create-alarms.js        # Configura alarmes no CloudWatch
│   ├── run-dashboard.sh        # Script auxiliar para executar dashboard com região
│   ├── executar-admin.sh       # Inicia servidor administrativo local
│   ├── admin-server.js         # Servidor Node.js para interface administrativa
│   ├── admin-server.html       # Interface web para o servidor administrativo
│   ├── admin-usuarios-local.html # Interface web com credenciais temporárias
│   ├── listar-usuarios.js      # Script para listar usuários no terminal
│   └── deploy-website.sh       # Script para implantar landing page no S3
├── template.yaml               # Template SAM (infraestrutura)
├── package.json                # Dependências do projeto
└── README.md                   # Documentação
```

## Comandos Disponíveis

Os usuários podem interagir com o sistema via WhatsApp usando os seguintes comandos:

- `/tendencia [tópico]` - Recebe informações sobre tendências em marketing
- `/ferramenta [tópico]` - Recebe recomendações de ferramentas
- `/case [tópico]` - Recebe estudos de caso relacionados
- `/ajuda` - Lista os comandos disponíveis

## Fluxo de Dados

1. O usuário envia uma mensagem via WhatsApp
2. O webhook é acionado e a mensagem é enviada para a fila SQS
3. O orquestrador processa a mensagem da fila
4. Se necessário, solicita geração de conteúdo ao gerador
5. A resposta é enviada de volta ao usuário via WhatsApp

## Mecanismo de Retry

O sistema implementa um mecanismo robusto de retry para o envio de mensagens:

1. Se uma mensagem falha no envio, o sistema tenta novamente até 3 vezes
2. Cada nova tentativa tem um atraso progressivo para evitar sobrecarga da API
3. As métricas de tentativas são monitoradas no CloudWatch
4. Alarmes são acionados quando muitas mensagens falham mesmo após retries

## Monitoramento

O sistema conta com um painel de monitoramento completo no CloudWatch, com as seguintes métricas:

- **Taxa de sucesso**: Porcentagem de mensagens processadas com sucesso
- **Mensagens enviadas vs. falhas**: Acompanhamento de mensagens bem-sucedidas e falhas
- **Retries**: Monitoramento de retentativas de envio
- **Latência**: Tempo médio de processamento de mensagens
- **Comandos processados**: Distribuição de comandos por tipo

Além disso, alarmes são configurados para notificar sobre problemas como:
- Falhas excessivas no envio de mensagens
- Retries esgotados para mensagens
- Latência alta no processamento
- Taxa de sucesso abaixo do esperado

### Acesso ao Dashboard CloudWatch

Existem três maneiras de acessar o dashboard de métricas:

#### 1. Via Console AWS
1. Acesse o [Console AWS CloudWatch](https://console.aws.amazon.com/cloudwatch/)
2. Navegue até "Dashboards" no menu lateral
3. Selecione o dashboard "RadarTendenciasDashboard"

#### 2. Via Script
Execute o script para criar/atualizar o dashboard:
```bash
# Configure a região AWS se necessário
export AWS_REGION=us-east-1

# Execute o script do dashboard
node scripts/create-dashboard.js
```

Se encontrar erro de região, você pode utilizar o script auxiliar:
```bash
./scripts/run-dashboard.sh
```

#### 3. Via URL Direta
Acesse o dashboard diretamente através da URL:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=RadarTendenciasDashboard
```
Substitua `us-east-1` pela sua região AWS se diferente.

### Configuração de Alarmes

Para configurar alarmes que enviam notificações por email:
```bash
node scripts/create-alarms.js seu-email@exemplo.com
```

Isso configurará alertas para as métricas críticas com notificações via SNS.

## Páginas Administrativas

Para visualizar e gerenciar os dados do sistema, temos várias opções de interfaces administrativas:

### 1. Servidor Administrativo Local

Esta é a maneira mais simples e recomendada para acessar os dados de usuários.

```bash
# Instalar dependências necessárias (se ainda não instaladas)
npm install express cors body-parser aws-sdk

# Executar o servidor administrativo
./scripts/executar-admin.sh
```

Após iniciar o servidor, acesse `http://localhost:3000` no seu navegador para visualizar:
- Total de usuários registrados
- Quantidade de usuários ativos
- Lista completa de usuários com detalhes

O servidor detecta automaticamente o nome da tabela DynamoDB pelo CloudFormation Stack e carrega os dados. Use o botão "Atualizar Dados" para recarregar as informações.

### 2. Script de Linha de Comando

Para uma visualização rápida dos usuários via terminal:

```bash
node scripts/listar-usuarios.js
```

Este script lista os usuários registrados diretamente no terminal, mostrando informações básicas como nome, telefone e status.

### 3. Interface Web com Credenciais Temporárias

Se preferir uma solução sem servidor local:

1. Obtenha credenciais temporárias da AWS:
```bash
aws sts get-session-token | jq
```

2. Abra o arquivo `scripts/admin-usuarios-local.html` em um navegador
3. Insira as credenciais temporárias obtidas
4. Configure a região e o nome da tabela
5. Clique em "Carregar Usuários"

### 4. Console AWS

Para acesso direto via AWS Console:

1. Acesse o console DynamoDB em https://console.aws.amazon.com/dynamodb/
2. Selecione a região correta
3. Navegue até "Tabelas" e selecione a tabela de usuários
4. Use "Explorar itens da tabela" para visualizar e filtrar registros

## Templates WhatsApp e API v21.0

O sistema utiliza templates para enviar mensagens pelo WhatsApp Business Platform. Foram implementadas as seguintes modificações para compatibilidade com a API v21.0:

### Estrutura de Templates Atualizada

A estrutura dos templates foi atualizada para seguir o formato atual da API v21.0 do WhatsApp:

- Remoção do campo `parameters` dos componentes BODY
- Adição do campo `example` com `body_text` contendo exemplos de valores para variáveis
- Redução do tamanho dos footers para respeitar o limite de 60 caracteres

### Comandos para Gerenciar Templates

#### Atualização completa do sistema
```bash
# Atualiza templates e faz deploy dos recursos
./scripts/atualizar-sistema-whatsapp.sh
```

#### Apenas atualizar templates
```bash
# Lista todos os templates existentes
./scripts/atualizar-templates-whatsapp.sh list

# Cria um template específico
./scripts/atualizar-templates-whatsapp.sh create <nome_do_template>

# Depura um template para verificar problemas
./scripts/atualizar-templates-whatsapp.sh debug <nome_do_template>

# Cria todos os templates
./scripts/atualizar-templates-whatsapp.sh all
```

### Arquivo .env para Templates WhatsApp

O arquivo `.env` deve conter as seguintes configurações para os templates do WhatsApp:

```
# WhatsApp Business API
WHATSAPP_API_TOKEN=seu_token_aqui
WHATSAPP_API_URL=https://graph.facebook.com/v21.0/
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id

# Webhook
WEBHOOK_VERIFY_TOKEN=seu_token_de_verificacao
```

### CloudFormation Capabilities

Durante o deploy, o sistema usa as seguintes capacidades do CloudFormation:
- `CAPABILITY_IAM`: Para criar/modificar recursos IAM
- `CAPABILITY_AUTO_EXPAND`: Para expandir transformações na pilha

## Verificação de Logs e Solução de Problemas

### Verificação de Logs no CloudWatch

#### Acesso via Console AWS
1. Acesse o [Console AWS CloudWatch](https://console.aws.amazon.com/cloudwatch/)
2. Navegue até "Grupos de logs" (Log Groups) no menu lateral
3. Procure pelos grupos de logs que começam com `/aws/lambda/antena-app-`
4. Clique no grupo de logs correspondente à função (ex: WhatsAppSender)
5. Visualize os logs mais recentes para encontrar erros

#### Comandos AWS CLI

Lista os grupos de logs disponíveis:
```bash
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/antena-app
```

Visualiza os logs mais recentes de uma função específica:
```bash
# Obter o stream de logs mais recente
LATEST_STREAM=$(aws logs describe-log-streams \
  --log-group-name /aws/lambda/antena-app-WhatsAppSender \
  --order-by LastEventTime \
  --descending \
  --limit 1 \
  --query 'logStreams[0].logStreamName' \
  --output text)

# Visualizar os eventos do stream
aws logs get-log-events \
  --log-group-name /aws/lambda/antena-app-WhatsAppSender \
  --log-stream-name "$LATEST_STREAM"
```

Filtra logs por termo específico (ex: "error"):
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/antena-app-WhatsAppSender \
  --filter-pattern "error" \
  --query "events[*].message"
```

### Erros Comuns da API do WhatsApp

Ao verificar os logs, procure por mensagens como:

1. **Erro de autenticação**:
   ```
   Authentication failed with code 401: Bearer token invalid
   ```
   *Solução*: Gere um novo token de acesso no Facebook Developer Portal.

2. **Erro de número de telefone**:
   ```
   Error: Phone number not found or not authorized
   ```
   *Solução*: Verifique se o número está corretamente configurado na plataforma.

3. **Erro de template**:
   ```
   Error: Template not found or Template parameters invalid
   ```
   *Solução*: Confirme se o template foi aprovado e está sendo chamado corretamente.

4. **Limite de mensagens**:
   ```
   Error: Message limit reached
   ```
   *Solução*: Aguarde o limite ser reestabelecido ou solicite aumento.

5. **Erro de permissão**:
   ```
   Error: User has not opted in to receive messages
   ```
   *Solução*: O usuário precisa iniciar a conversa ou aceitar receber mensagens.

### CloudFormation Erros Comuns

1. **InsufficientCapabilitiesException**:
   ```
   An error occurred (InsufficientCapabilitiesException) when calling the UpdateStack operation: Requires capabilities : [CAPABILITY_AUTO_EXPAND]
   ```
   *Solução*: Adicione `CAPABILITY_AUTO_EXPAND` ao comando de atualização de stack.

2. **ValidationError**:
   ```
   An error occurred (ValidationError) during the UpdateStack operation: Parameters must have values
   ```
   *Solução*: Verifique se todos os parâmetros necessários estão presentes no arquivo `.env` e sendo passados corretamente.

### Solução de Problemas Comuns

- **Template não aprovado**: Acesse o Facebook Business Manager e verifique o status dos templates
- **Mensagens não entregues**: Confirme se o número de destino é válido e está no formato correto
- **Falha na criação de templates**: Use o modo debug para verificar a estrutura do template
- **Erros na API**: Verifique se a versão da API está atualizada no arquivo `.env` (atual: v21.0)
- **Erro de região**: Verifique se a região está configurada corretamente no AWS CLI (`aws configure`)
- **Erro de credenciais**: Certifique-se de que suas credenciais AWS estão atualizadas
- **Tabela não encontrada**: Verifique se o nome da tabela está correto e se a stack foi implantada
- **Módulos não encontrados**: Execute `npm install express cors body-parser aws-sdk` para instalar dependências

## Contribuições

Para contribuir com o projeto:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Faça commit das alterações (`git commit -m 'Adiciona nova funcionalidade'`)
4. Faça push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a licença ISC.

## Contato

Para mais informações, entre em contato através do email: [seu-email@exemplo.com]

## Gerenciamento de Token do WhatsApp

O sistema agora inclui um gerenciador de token de longa duração para a API do WhatsApp Business. 
Este sistema cuida automaticamente da renovação de token e gerenciamento da autenticação com o WhatsApp.

### Características do Gerenciador de Token

- **Tokens de Longa Duração**: Conversão automática de tokens de curta duração em tokens de longa duração (até 60 dias).
- **Renovação Automática**: O token é renovado automaticamente a cada 7 dias para evitar expiração.
- **Armazenamento Seguro**: Os tokens são armazenados de forma segura no AWS Systems Manager Parameter Store e Secrets Manager.
- **Alta Disponibilidade**: O sistema é desenhado para funcionar mesmo em casos de falha temporária do gerenciador de token.

### Como Configurar o Token do WhatsApp

1. Obtenha as credenciais necessárias no [Portal de Desenvolvedores do Meta](https://developers.facebook.com/):
   - App ID
   - App Secret
   - Token de acesso de usuário (token de curta duração)
   - ID do Sistema WhatsApp Business (opcional)

2. Execute o script de configuração:
   ```bash
   ./scripts/atualizar-token-whatsapp.sh
   ```

3. Forneça as credenciais quando solicitado.

4. O sistema irá:
   - Converter o token de curta duração em token de longa duração
   - Armazenar o token e credenciais de forma segura
   - Configurar a renovação automática

### Verificando o Status do Token

Para verificar o status atual do token do WhatsApp:

```bash
aws lambda invoke --function-name antena-app-WhatsAppTokenManager-dev --payload '{"action":"getToken"}' token_status.json
cat token_status.json
```

### Resolução de Problemas

Se você enfrentar problemas com o token do WhatsApp:

1. Verifique se o token está válido executando o comando de verificação acima.
2. Se o token estiver expirado ou inválido, execute o script de atualização novamente.
3. Verifique os logs do Lambda WhatsAppTokenManager no CloudWatch para mais detalhes sobre erros. 