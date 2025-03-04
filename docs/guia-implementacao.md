# Guia de Implementação - Radar de Tendências em Marketing Digital

Este documento apresenta um guia passo a passo para implementar o MVP do Radar de Tendências em Marketing Digital, baseado na arquitetura serverless que definimos.

## Índice
1. [Pré-requisitos](#pré-requisitos)
2. [Configuração inicial do ambiente](#configuração-inicial-do-ambiente)
3. [Estrutura do projeto](#estrutura-do-projeto)
4. [Implementação da infraestrutura](#implementação-da-infraestrutura)
5. [Desenvolvimento dos componentes principais](#desenvolvimento-dos-componentes-principais)
6. [Testes](#testes)
7. [Deployment](#deployment)
8. [Monitoramento e manutenção](#monitoramento-e-manutenção)
9. [Próximos passos](#próximos-passos)

## Pré-requisitos

Antes de iniciar a implementação, certifique-se de ter:

1. **Conta AWS** com permissões de administrador
2. **Conta WhatsApp Business API** ativa e configurada
3. **Chave de API do Claude** (Anthropic)
4. **Ferramentas de desenvolvimento**:
   - AWS CLI instalado e configurado
   - AWS SAM CLI instalado
   - Node.js (v16+)
   - Git

## Configuração inicial do ambiente

### 1. Clone o repositório inicial

```bash
# Criar diretório do projeto
mkdir -p radar-tendencias && cd radar-tendencias

# Inicializar git
git init

# Inicializar projeto npm
npm init -y
```

### 2. Configurar credenciais locais

Crie um arquivo `.env` local para desenvolvimento (não comite este arquivo):

```
# AWS
AWS_REGION=us-east-1
AWS_PROFILE=seu-profile

# Claude API
CLAUDE_API_KEY=sua-chave-api

# WhatsApp
WHATSAPP_API_TOKEN=seu-token
```

### 3. Instalar dependências comuns (em um layer compartilhado)

```bash
mkdir -p layers/common/nodejs
cd layers/common/nodejs
npm init -y
npm install uuid axios aws-sdk
cd ../../..
```

## Estrutura do projeto

Organize o projeto conforme a estrutura abaixo:

```
radar-tendencias/
├── template.yaml                # Template SAM principal
├── package.json                 # Dependências do projeto
├── .gitignore                   # Ignore .env e node_modules
├── README.md                    # Documentação do projeto
├── src/                         # Código-fonte das funções Lambda
│   ├── processador-mensagens/   # Lambda de processamento de webhooks
│   ├── processador-leads/       # Lambda de processamento de leads
│   ├── orquestrador/            # Lambda de orquestração de respostas
│   ├── gerador-conteudo/        # Lambda de geração de conteúdo
│   ├── whatsapp-sender/         # Lambda de envio de mensagens WhatsApp
│   └── etl/                     # Lambda ETL para análise
├── layers/                      # Camadas Lambda compartilhadas
│   └── common/                  # Camada com dependências comuns
├── website/                     # Arquivos da landing page
│   ├── index.html               # Página principal
│   ├── css/                     # Estilos
│   ├── js/                      # Scripts
│   └── assets/                  # Imagens e recursos
└── tests/                       # Testes unitários e de integração
```

## Implementação da infraestrutura

### 1. Configurar o template SAM

Use o arquivo `template.yaml` que criamos anteriormente para definir toda a infraestrutura. Execute:

```bash
# Validar o template
sam validate

# Construir o projeto
sam build
```

### 2. Implantar configuração inicial

```bash
# Deploy inicial para criar recursos
sam deploy --guided

# Nas próximas vezes
sam deploy
```

Durante a implantação guiada, você será solicitado a fornecer:
- Nome da stack
- Região da AWS
- Parâmetros (ClaudeApiKey, WhatsAppApiToken)
- Confirmação de capacidades

## Desenvolvimento dos componentes principais

Desenvolva cada componente na seguinte ordem:

### 1. Função WhatsApp Sender

Esta função é responsável por enviar mensagens para o WhatsApp usando a API do WhatsApp Business:

```javascript
// src/whatsapp-sender/index.js
const axios = require('axios');
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE;

exports.handler = async (event) => {
    try {
        const { phoneNumber, message, metadata } = event;
        
        // Enviar mensagem para o WhatsApp
        const response = await axios.post(
            WHATSAPP_API_URL,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phoneNumber,
                type: "text",
                text: {
                    body: message
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Atualizar status de entrega na interação
        if (metadata && metadata.interactionId) {
            await dynamoDB.update({
                TableName: INTERACTIONS_TABLE,
                Key: { interactionId: metadata.interactionId },
                UpdateExpression: 'set metrics.deliveryStatus = :status, metrics.sentAt = :time',
                ExpressionAttributeValues: {
                    ':status': 'sent',
                    ':time': new Date().toISOString()
                }
            }).promise();
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Message sent successfully',
                messageId: response.data.messages[0].id
            })
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to send message',
                error: error.message
            })
        };
    }
};
```

### 2. Função Processador de Leads

Esta função recebe os leads capturados na landing page:

```javascript
// src/processador-leads/index.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();
const lambda = new AWS.Lambda();

const USERS_TABLE = process.env.USERS_TABLE;
const WHATSAPP_SENDER_LAMBDA = process.env.WHATSAPP_SENDER_LAMBDA;

exports.handler = async (event) => {
    try {
        // Parse da requisição
        const body = JSON.parse(event.body);
        const { name, phone, email, role, source = 'landing_page' } = body;
        
        // Validação básica
        if (!name || !phone || !email || !role) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing required fields' })
            };
        }
        
        // Verificar se usuário já existe
        const userExists = await checkIfUserExists(phone);
        
        if (userExists) {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'User already registered',
                    userId: userExists
                })
            };
        }
        
        // Criar novo usuário
        const userId = `u${uuidv4().replace(/-/g, '')}`;
        
        const newUser = {
            userId,
            phoneNumber: normalizePhone(phone),
            email,
            name,
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            onboardingCompleted: false,
            source,
            preferences: {
                messageFrequency: 'medium',
                contentTypes: ['news', 'tools', 'tips'],
                primaryInterest: 'general_marketing',
                interests: [
                    { category: 'general_marketing', score: 1.0 }
                ],
                preferredTime: { start: '08:00', end: '20:00' },
                preferredContentFormat: 'detailed',
                optIns: {
                    marketing: true,
                    thirdParty: false,
                    analytics: true
                }
            },
            profile: {
                role: mapRoleToSystem(role),
                companySize: 'unknown',
                industry: 'unknown',
                experience: 'unknown',
                location: {
                    country: 'Brasil'
                },
                toolsUsed: [],
                challenges: []
            },
            engagement: {
                engagementScore: 50,
                totalMessages: 0,
                responseRate: 0,
                contentClicks: 0,
                referrals: 0
            },
            segments: ['new_user']
        };
        
        // Salvar no DynamoDB
        await dynamoDB.put({
            TableName: USERS_TABLE,
            Item: newUser
        }).promise();
        
        // Enviar mensagem de boas-vindas via WhatsApp
        await sendWelcomeMessage(newUser);
        
        // Agendar fluxo de onboarding
        await scheduleOnboarding(userId);
        
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'User created successfully',
                userId
            })
        };
        
    } catch (error) {
        console.error('Error processing lead:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to process lead',
                error: error.message
            })
        };
    }
};

// Verifica se usuário já existe pelo número de telefone
async function checkIfUserExists(phone) {
    const normalizedPhone = normalizePhone(phone);
    
    const result = await dynamoDB.query({
        TableName: USERS_TABLE,
        IndexName: 'phoneIndex',
        KeyConditionExpression: 'phoneNumber = :phone',
        ExpressionAttributeValues: {
            ':phone': normalizedPhone
        }
    }).promise();
    
    if (result.Items && result.Items.length > 0) {
        return result.Items[0].userId;
    }
    
    return null;
}

// Normaliza número de telefone para formato internacional
function normalizePhone(phone) {
    // Remover caracteres não numéricos
    let normalized = phone.replace(/\D/g, '');
    
    // Garantir formato com código do país
    if (normalized.length === 11 || normalized.length === 10) {
        normalized = `+55${normalized}`;
    } else if (!normalized.startsWith('+')) {
        normalized = `+${normalized}`;
    }
    
    return normalized;
}

// Mapeia papel selecionado para valor do sistema
function mapRoleToSystem(role) {
    const roleMap = {
        'marketeiro': 'marketer',
        'social_media': 'social_media_manager',
        'gestor': 'marketing_manager',
        'empreendedor': 'entrepreneur',
        'freelancer': 'freelancer'
    };
    
    return roleMap[role] || 'unknown';
}

// Envia mensagem de boas-vindas via WhatsApp
async function sendWelcomeMessage(user) {
    const welcomeMessage = `Olá ${user.name || ''}! 👋 Bem-vindo ao Radar de Tendências em Marketing Digital. Em breve iniciaremos nosso processo de onboarding para personalizar sua experiência. Aguarde alguns instantes para nossa primeira mensagem.`;
    
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber: user.phoneNumber,
            message: welcomeMessage
        })
    }).promise();
}

// Agenda fluxo de onboarding
async function scheduleOnboarding(userId) {
    // Delay de 2 minutos para iniciar onboarding
    const onboardingDelay = 2 * 60; // 2 minutos em segundos
    
    await eventBridge.putEvents({
        Entries: [{
            Source: 'marketing.radar',
            DetailType: 'onboarding.start',
            Detail: JSON.stringify({
                userId,
                step: 'welcome'
            }),
            EventBusName: 'default',
            Time: new Date(Date.now() + onboardingDelay * 1000)
        }]
    }).promise();
}
```

### 3. Implementar as funções restantes

Siga um padrão semelhante para implementar as demais funções conforme os códigos que já compartilhamos:

- **Processador de Mensagens**: Para processar webhooks do WhatsApp
- **Orquestrador**: Para coordenar a geração de respostas
- **Gerador de Conteúdo**: Para criar conteúdo personalizado
- **ETL**: Para processar dados para análise

### 4. Desenvolver integrações com IA

Adicione na função geradora de conteúdo os prompts específicos para cada tipo de conteúdo:

```javascript
// src/gerador-conteudo/prompts.js
exports.createToolRecommendationPrompt = (userProfile) => {
    return {
        system: `Você é um especialista em ferramentas de marketing digital e IA em 2025.
                Seu trabalho é recomendar as melhores ferramentas para ${userProfile.role || 'profissionais de marketing'}.
                Foque em ferramentas atuais, com ênfase em soluções de IA e automação.
                Para cada ferramenta, mencione:
                1. Nome e link (use placeholder [LINK])
                2. Principais funcionalidades
                3. Pontos fortes e limitações
                4. Faixa de preço (incluindo opções gratuitas quando disponíveis)
                5. Casos de uso ideais
                
                Mantenha o tom profissional, direto e prático. Não tente vender as ferramentas, mas avalie-as objetivamente.
                Personalize para o perfil: ${JSON.stringify(userProfile)}`,
        messages: [
            { role: "user", content: "Preciso de recomendações de ferramentas de IA para marketing de conteúdo em 2025." }
        ]
    };
};

// Adicione prompts semelhantes