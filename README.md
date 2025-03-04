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

### Solução de Problemas Comuns

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