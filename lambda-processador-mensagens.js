// Processador de Mensagens do WhatsApp
// Este Lambda recebe webhooks do WhatsApp, processa e orquestra respostas

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const eventBridge = new AWS.EventBridge();

// Configuração
const SQS_RESPONSE_QUEUE_URL = process.env.SQS_RESPONSE_QUEUE_URL;
const USERS_TABLE = process.env.USERS_TABLE || 'usuarios';
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || 'interacoes';
const CLAUDE_PROCESSING_TOPIC = process.env.CLAUDE_PROCESSING_TOPIC;

exports.handler = async (event) => {
  try {
    console.log('Evento recebido:', JSON.stringify(event));
    
    // Extrair dados da mensagem do WhatsApp
    // Nota: O formato exato depende do provedor específico do WhatsApp Business API
    const whatsappEvent = JSON.parse(event.body);
    
    // Exemplo de extração para uma implementação genérica
    // Adaptar conforme o formato exato do seu provedor
    const message = extractMessage(whatsappEvent);
    
    if (!message) {
      console.log('Evento não contém mensagem válida');
      return { statusCode: 200, body: 'OK' }; // Sucesso mesmo sem mensagem para evitar reenvios
    }
    
    // Extrair dados principais
    const { 
      phoneNumber, 
      messageContent, 
      messageType, 
      timestamp,
      messageId
    } = message;
    
    // Verificar se usuário existe
    const user = await findOrCreateUser(phoneNumber);
    
    // Armazenar interação
    const interactionId = await storeInteraction(
      user.userId, 
      messageContent, 
      messageType, 
      messageId,
      timestamp
    );
    
    // Determinar contexto da conversa
    const conversationContext = await determineConversationContext(user.userId);
    
    // Registrar atividade para análise de engajamento
    await updateUserActivity(user.userId);
    
    // Se mensagem for um comando específico, processar diretamente
    if (isCommand(messageContent)) {
      await processCommand(user.userId, messageContent, interactionId);
      return { statusCode: 200, body: 'Command processed' };
    }
    
    // Caso contrário, enfileirar para processamento normal
    await enqueueForProcessing(
      user.userId, 
      interactionId, 
      messageContent, 
      conversationContext
    );
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Message processed successfully',
        interactionId
      })
    };
    
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    
    // Registrar erro para análise, mas retornar 200 para evitar reenvios
    await logError(error, event);
    
    return {
      statusCode: 200, // Retorno 200 para WhatsApp evitar reenvio
      body: JSON.stringify({ 
        message: 'Message received, but processing failed',
        error: error.message
      })
    };
  }
};

// Determina o tipo de mensagem (texto, imagem, áudio, etc.)
function determineMessageType(message) {
  if (message.text) return 'text';
  if (message.image) return 'image';
  if (message.audio) return 'audio';
  if (message.document) return 'document';
  if (message.button) return 'button';
  if (message.interactive) return 'interactive';
  return 'unknown';
}

// Busca usuário existente ou cria um novo
async function findOrCreateUser(phoneNumber) {
  try {
    // Buscar usuário pelo número de telefone
    const userQuery = await dynamoDB.query({
      TableName: USERS_TABLE,
      IndexName: 'phoneIndex',
      KeyConditionExpression: 'phoneNumber = :phone',
      ExpressionAttributeValues: {
        ':phone': phoneNumber
      }
    }).promise();
    
    // Se usuário existir, retornar
    if (userQuery.Items && userQuery.Items.length > 0) {
      return userQuery.Items[0];
    }
    
    // Caso contrário, criar novo usuário
    const newUser = {
      userId: `u${uuidv4().replace(/-/g, '')}`,
      phoneNumber: phoneNumber,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      onboardingCompleted: false,
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
        role: 'unknown',
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
        totalMessages: 1,
        responseRate: 1.0,
        contentClicks: 0,
        referrals: 0
      },
      segments: ['new_user']
    };
    
    // Salvar novo usuário
    await dynamoDB.put({
      TableName: USERS_TABLE,
      Item: newUser
    }).promise();
    
    // Agendar fluxo de onboarding
    await scheduleOnboarding(newUser.userId);
    
    return newUser;
  } catch (error) {
    console.error('Erro ao buscar/criar usuário:', error);
    throw error;
  }
}

// Armazena a interação do usuário
async function storeInteraction(userId, content, type, messageId, timestamp) {
  const interactionId = `int${uuidv4().replace(/-/g, '')}`;
  
  const interaction = {
    interactionId,
    userId,
    timestamp: timestamp || new Date().toISOString(),
    channel: 'whatsapp',
    direction: 'incoming',
    type: 'message',
    contentType: 'user_message',
    content,
    messageId,
    metrics: {
      deliveryStatus: 'received'
    },
    context: {
      triggerType: 'user_initiated'
    }
  };
  
  await dynamoDB.put({
    TableName: INTERACTIONS_TABLE,
    Item: interaction
  }).promise();
  
  return interactionId;
}

// Determina o contexto atual da conversa
async function determineConversationContext(userId) {
  try {
    // Buscar últimas 5 interações para determinar contexto
    const recentInteractions = await dynamoDB.query({
      TableName: INTERACTIONS_TABLE,
      IndexName: 'userInteractionsIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: 5,
      ScanIndexForward: false // ordem decrescente
    }).promise();
    
    // Também buscar dados do usuário 
    const userData = await dynamoDB.get({
      TableName: USERS_TABLE,
      Key: {
        userId
      }
    }).promise();
    
    const user = userData.Item;
    
    // Verificar se usuário está em onboarding
    if (!user.onboardingCompleted) {
      return {
        stage: 'onboarding',
        step: determineOnboardingStep(recentInteractions.Items || []),
        isNew: recentInteractions.Items?.length <= 1
      };
    }
    
    // Caso contrário, determinar contexto com base nas interações recentes
    const context = {
      stage: 'regular',
      recentTopics: extractRecentTopics(recentInteractions.Items || []),
      lastInteractionType: recentInteractions.Items?.[0]?.contentType || 'none',
      activeCommands: checkForActiveCommands(recentInteractions.Items || []),
      pendingResponses: checkForPendingResponses(recentInteractions.Items || [])
    };
    
    return context;
  } catch (error) {
    console.error('Erro ao determinar contexto:', error);
    // Retornar contexto padrão em caso de erro
    return {
      stage: 'regular',
      recentTopics: [],
      error: true
    };
  }
}

// Atualiza dados de atividade do usuário
async function updateUserActivity(userId) {
  await dynamoDB.update({
    TableName: USERS_TABLE,
    Key: {
      userId
    },
    UpdateExpression: 'set lastActive = :now, engagement.totalMessages = engagement.totalMessages + :one',
    ExpressionAttributeValues: {
      ':now': new Date().toISOString(),
      ':one': 1
    }
  }).promise();
}

// Verifica se a mensagem é um comando específico
function isCommand(message) {
  const trimmed = message.trim().toLowerCase();
  return trimmed.startsWith('/') || 
         trimmed.startsWith('#') || 
         ['ajuda', 'help', 'menu', 'comandos'].includes(trimmed);
}

// Processa comandos específicos
async function processCommand(userId, message, interactionId) {
  const command = message.trim().toLowerCase();
  
  // Mapeamento de comandos
  const commands = {
    '/ferramenta': 'tool_recommendation',
    '/tool': 'tool_recommendation',
    '/case': 'case_study',
    '/caso': 'case_study',
    '/tendencia': 'trend_report',
    '/tendência': 'trend_report',
    '/trend': 'trend_report',
    '/ajuda': 'help_menu',
    '/help': 'help_menu',
    'ajuda': 'help_menu',
    'help': 'help_menu',
    'menu': 'help_menu',
    'comandos': 'help_menu'
  };
  
  // Extrair comando base (para comandos com parâmetros)
  const baseCommand = command.split(' ')[0];
  const commandType = commands[baseCommand] || 'unknown_command';
  
  // Enfileirar para processamento específico de comando
  await sqs.sendMessage({
    QueueUrl: SQS_RESPONSE_QUEUE_URL,
    MessageBody: JSON.stringify({
      userId,
      interactionId,
      type: 'command',
      commandType,
      fullCommand: command,
      timestamp: new Date().toISOString()
    }),
    MessageAttributes: {
      'MessageType': {
        DataType: 'String',
        StringValue: 'command'
      }
    }
  }).promise();
}

// Enfileira mensagem para processamento detalhado 
async function enqueueForProcessing(userId, interactionId, content, context) {
  await sqs.sendMessage({
    QueueUrl: SQS_RESPONSE_QUEUE_URL,
    MessageBody: JSON.stringify({
      userId,
      interactionId,
      content,
      context,
      timestamp: new Date().toISOString()
    }),
    MessageAttributes: {
      'MessageType': {
        DataType: 'String',
        StringValue: 'user_message'
      }
    }
  }).promise();
}

// Determina qual etapa do onboarding o usuário está
function determineOnboardingStep(recentInteractions) {
  // Lógica para determinar etapa do onboarding baseada no histórico
  const messageCount = recentInteractions.length;
  
  // Exemplo simples - na prática, analisaria o conteúdo das mensagens
  if (messageCount <= 1) return 'welcome';
  if (messageCount === 2) return 'profile_question';
  if (messageCount === 3) return 'interests_question';
  if (messageCount === 4) return 'tools_question';
  if (messageCount === 5) return 'challenges_question';
  if (messageCount >= 6) return 'finishing';
  
  return 'unknown';
}

// Extrai tópicos recentes das interações
function extractRecentTopics(interactions) {
  // Na implementação real, usaria NLP ou análise de entidades
  return interactions
    .filter(i => i.entities && i.entities.length > 0)
    .flatMap(i => i.entities)
    .slice(0, 5)
    .map(e => e.text || e.type);
}

// Verifica se há comandos ativos nas interações recentes
function checkForActiveCommands(interactions) {
  // Implementação simplificada
  return interactions
    .filter(i => i.type === 'command' && !i.completed)
    .map(i => i.commandType);
}

// Verifica se há respostas pendentes
function checkForPendingResponses(interactions) {
  return interactions
    .filter(i => i.direction === 'outgoing' && i.expectsResponse && !i.responseReceived)
    .map(i => i.contentType);
}

// Agenda fluxo de onboarding
async function scheduleOnboarding(userId) {
  // Agendar primeiro passo do onboarding para execução imediata
  await eventBridge.putEvents({
    Entries: [{
      Source: 'marketing.radar',
      DetailType: 'onboarding.start',
      Detail: JSON.stringify({
        userId,
        step: 'welcome'
      }),
      EventBusName: 'default'
    }]
  }).promise();
}

// Registra erros para análise posterior
async function logError(error, event) {
  // Na implementação completa, salvaria em CloudWatch Logs ou DynamoDB
  console.error('Erro detalhado:', error);
  console.error('Evento original:', JSON.stringify(event));
}

// Extrai dados da mensagem do formato específico do provedor WhatsApp
function extractMessage(whatsappEvent) {
  // Adaptar essa função para o formato específico do seu provedor de WhatsApp
  // Este é um exemplo genérico
  try {
    // Verificar se é uma notificação de mensagem
    if (whatsappEvent.object === 'whatsapp_business_account') {
      const entry = whatsappEvent.entry && whatsappEvent.entry[0];
      const changes = entry && entry.changes && entry.changes[0];
      const value = changes && changes.value;
      const messages = value && value.messages;
      
      if (messages && messages.length > 0) {
        const message = messages[0];
        
        return {
          messageId: message.id,
          phoneNumber: message.from,
          messageContent: message.text?.body || '',
          messageType: determineMessageType(message),
          timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString()
        };
      }
    }
    
    // Suporte para outros formatos de provedores
    // Meta/Facebook format
    if (whatsappEvent.entry && whatsappEvent.entry[0]?.messaging) {
      const messaging = whatsappEvent.entry[0].messaging[0];
      if (messaging && messaging.message) {
        return {
          messageId: messaging.message.mid,
          phoneNumber: messaging.sender.id,
          messageContent: messaging.message.text || '',
          messageType: 'text',
          timestamp: new Date(messaging.timestamp).toISOString()
        };
      }
    }
    
    // Twilio format
    if (whatsappEvent.SmsMessageSid) {
      return {
        messageId: whatsappEvent.SmsMessageSid,
        phoneNumber: whatsappEvent.From,
        messageContent: whatsappEvent.Body || '',
        messageType: 'text',
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao extrair mensagem:', error);
    return null;
  }
}