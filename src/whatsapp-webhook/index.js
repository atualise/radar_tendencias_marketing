const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const { v4: uuidv4 } = require('uuid');

// Variáveis de ambiente
const USERS_TABLE = process.env.USERS_TABLE;
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE;
const SQS_RESPONSE_QUEUE_URL = process.env.SQS_RESPONSE_QUEUE_URL;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

exports.handler = async (event) => {
    console.log('Evento recebido:', JSON.stringify(event));
    
    // Verificar se é uma requisição de verificação do webhook
    if (event.httpMethod === 'GET') {
        return handleWebhookVerification(event);
    }
    
    // Processar notificação do webhook (mensagem recebida)
    if (event.httpMethod === 'POST') {
        return await handleWebhookNotification(event);
    }
    
    // Método não suportado
    return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Método não permitido' })
    };
};

// Manipula verificação do webhook (GET)
function handleWebhookVerification(event) {
    const queryParams = event.queryStringParameters || {};
    
    // Verificar os parâmetros necessários
    const mode = queryParams['hub.mode'];
    const token = queryParams['hub.verify_token'];
    const challenge = queryParams['hub.challenge'];
    
    if (!mode || !token || !challenge) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Parâmetros de verificação ausentes' })
        };
    }
    
    // Verificar se o token corresponde ao nosso token de verificação
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('Verificação do webhook bem-sucedida');
        return {
            statusCode: 200,
            body: challenge
        };
    } else {
        console.error('Falha na verificação do webhook. Token inválido.');
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Token de verificação inválido' })
        };
    }
}

// Manipula notificação do webhook (POST - mensagem recebida)
async function handleWebhookNotification(event) {
    try {
        const body = JSON.parse(event.body);
        
        // Verificar se é uma notificação do WhatsApp
        if (!body.object || body.object !== 'whatsapp_business_account') {
            console.log('Notificação não relacionada ao WhatsApp, ignorando');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Ignorado' })
            };
        }
        
        // Processar cada entrada (pode haver múltiplas notificações)
        const processPromises = body.entry.map(async (entry) => {
            return await processEntry(entry);
        });
        
        await Promise.all(processPromises);
        
        // Responder com sucesso (importante para o WhatsApp saber que recebemos a notificação)
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Evento processado com sucesso' })
        };
    } catch (error) {
        console.error('Erro ao processar notificação do webhook:', error);
        
        // Ainda retornamos 200 para o WhatsApp não reenviar a mesma notificação
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'Erro ao processar o evento', 
                error: error.message 
            })
        };
    }
}

// Processa cada entrada do webhook
async function processEntry(entry) {
    // Verificar se há mensagens
    if (!entry.changes || !entry.changes.length) {
        console.log('Entrada sem alterações, ignorando');
        return;
    }
    
    // Processar cada alteração
    const processPromises = entry.changes.map(async (change) => {
        // Verificar se é uma mensagem recebida
        if (change.field !== 'messages' || !change.value || !change.value.messages) {
            console.log('Alteração não relacionada a mensagens, ignorando');
            return;
        }
        
        // Processar cada mensagem recebida
        return await Promise.all(change.value.messages.map(async (message) => {
            return await processMessage(message, change.value);
        }));
    });
    
    await Promise.all(processPromises);
}

// Processa uma mensagem individual
async function processMessage(message, metadata) {
    // Verificar se é uma mensagem de texto
    if (message.type !== 'text') {
        console.log(`Mensagem do tipo ${message.type} recebida, ainda não suportada`);
        return;
    }
    
    // Extrair dados relevantes
    const phoneNumber = metadata.contacts[0].wa_id;
    const contactName = metadata.contacts[0].profile.name;
    const text = message.text.body;
    const timestamp = new Date(parseInt(message.timestamp) * 1000).toISOString();
    
    console.log(`Mensagem recebida de ${contactName} (${phoneNumber}): ${text}`);
    
    // Verificar se o usuário já existe ou criar novo
    const user = await getOrCreateUser(phoneNumber, contactName);
    
    // Criar registro da interação
    const interactionId = await createInteraction(user.userId, text, timestamp);
    
    // Verificar se é um comando
    const isCommand = text.startsWith('/');
    const commandType = isCommand ? identifyCommand(text) : null;
    
    // Preparar a mensagem para a fila SQS
    const sqsMessage = {
        type: isCommand ? 'command' : 'message',
        userId: user.userId,
        interactionId,
        content: text,
        timestamp,
        context: {
            stage: user.onboardingCompleted ? 'normal' : 'onboarding',
            step: user.profile?.onboardingStep || 'welcome'
        }
    };
    
    // Se for um comando, adicionar informações adicionais
    if (isCommand) {
        sqsMessage.commandType = commandType;
        sqsMessage.fullCommand = text;
    }
    
    // Enviar para a fila SQS para processamento
    await sqs.sendMessage({
        QueueUrl: SQS_RESPONSE_QUEUE_URL,
        MessageBody: JSON.stringify(sqsMessage),
        MessageAttributes: {
            'MessageType': {
                DataType: 'String',
                StringValue: isCommand ? 'command' : 'message'
            }
        }
    }).promise();
    
    console.log(`Mensagem enviada para fila SQS com ID de interação ${interactionId}`);
}

// Obtém usuário existente ou cria um novo
async function getOrCreateUser(phoneNumber, name) {
    // Buscar por número de telefone
    try {
        const result = await dynamoDB.query({
            TableName: USERS_TABLE,
            IndexName: 'PhoneNumberIndex',
            KeyConditionExpression: 'phoneNumber = :phone',
            ExpressionAttributeValues: {
                ':phone': phoneNumber
            }
        }).promise();
        
        // Se usuário existir, retornar
        if (result.Items && result.Items.length > 0) {
            return result.Items[0];
        }
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
    }
    
    // Criar novo usuário
    const userId = `usr${uuidv4().replace(/-/g, '')}`;
    const newUser = {
        userId,
        phoneNumber,
        name,
        createdAt: new Date().toISOString(),
        onboardingCompleted: false,
        profile: {
            onboardingStep: 'welcome'
        },
        preferences: {
            interests: [],
            frequency: 'weekly'
        },
        metrics: {
            totalInteractions: 0,
            lastInteraction: new Date().toISOString()
        }
    };
    
    await dynamoDB.put({
        TableName: USERS_TABLE,
        Item: newUser
    }).promise();
    
    console.log(`Novo usuário criado: ${userId} (${name})`);
    return newUser;
}

// Cria um registro de interação
async function createInteraction(userId, content, timestamp) {
    const interactionId = `int${uuidv4().replace(/-/g, '')}`;
    
    const interaction = {
        interactionId,
        userId,
        timestamp: timestamp || new Date().toISOString(),
        channel: 'whatsapp',
        direction: 'incoming',
        type: 'message',
        contentType: 'text',
        content,
        metrics: {
            processedAt: new Date().toISOString(),
            processingStatus: 'queued'
        }
    };
    
    await dynamoDB.put({
        TableName: INTERACTIONS_TABLE,
        Item: interaction
    }).promise();
    
    // Atualizar métricas do usuário
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'SET metrics.totalInteractions = metrics.totalInteractions + :inc, metrics.lastInteraction = :time',
        ExpressionAttributeValues: {
            ':inc': 1,
            ':time': timestamp || new Date().toISOString()
        }
    }).promise();
    
    return interactionId;
}

// Identifica o tipo de comando
function identifyCommand(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.startsWith('/ajuda') || lowerText.startsWith('/help')) {
        return 'help_menu';
    } else if (lowerText.startsWith('/ferramenta') || lowerText.startsWith('/tool')) {
        return 'tool_recommendation';
    } else if (lowerText.startsWith('/case') || lowerText.startsWith('/caso')) {
        return 'case_study';
    } else if (lowerText.startsWith('/tendencia') || lowerText.startsWith('/trend')) {
        return 'trend_report';
    } else {
        return 'unknown_command';
    }
} 