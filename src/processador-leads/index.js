const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();
const lambda = new AWS.Lambda();

const USERS_TABLE = process.env.USERS_TABLE;
const WHATSAPP_SENDER_LAMBDA = process.env.WHATSAPP_SENDER_FUNCTION;

exports.handler = async (event) => {
    console.log('Evento recebido completo:', JSON.stringify(event, null, 2));
    
    // Definindo headers comuns para CORS
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin,X-Requested-With,Accept',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Access-Control-Allow-Credentials': 'true'
    };
    
    try {
        // Se for uma requisição OPTIONS, retornar resposta CORS
        if (event.httpMethod === 'OPTIONS') {
            console.log('Requisição OPTIONS recebida, retornando headers CORS');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({})
            };
        }
        
        // Verificar se é um método POST
        if (event.httpMethod !== 'POST') {
            console.log(`Método HTTP não suportado: ${event.httpMethod}`);
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ message: 'Método não permitido' })
            };
        }
        
        // Registrando headers recebidos
        console.log('Headers recebidos:', JSON.stringify(event.headers, null, 2));
        
        // Parsear o corpo da requisição
        const requestBody = JSON.parse(event.body);
        console.log('Corpo da requisição:', JSON.stringify(requestBody, null, 2));
        
        // Verificar se todos os campos obrigatórios estão presentes
        if (!requestBody.name || !requestBody.phone || !requestBody.email || !requestBody.role) {
            console.log('Campos obrigatórios ausentes:', JSON.stringify(requestBody, null, 2));
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Todos os campos são obrigatórios' })
            };
        }
        
        // Normalizar o número de telefone
        const phoneNumber = normalizePhone(requestBody.phone);
        console.log('Número de telefone normalizado:', phoneNumber);
        
        // Verificar se o usuário já existe pelo número de telefone
        const existingUser = await checkIfUserExists(phoneNumber);
        console.log('Verificação de usuário existente:', JSON.stringify(existingUser, null, 2));
        
        if (existingUser) {
            console.log('Usuário já cadastrado:', JSON.stringify(existingUser, null, 2));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Usuário já cadastrado' })
            };
        }
        
        // Gerar um ID único para o usuário
        const userId = `usr${crypto.randomBytes(16).toString('hex')}`;
        console.log('Novo userId gerado:', userId);
        
        // Criar um novo usuário
        const newUser = {
            userId: userId,
            phoneNumber: phoneNumber,
            name: requestBody.name,
            email: requestBody.email,
            role: requestBody.role,
            createdAt: new Date().toISOString(),
            onboardingCompleted: false,
            profile: {
                onboardingStep: 'welcome'
            },
            preferences: {
                frequency: 'weekly',
                interests: []
            },
            metrics: {
                totalInteractions: 0,
                lastInteraction: new Date().toISOString()
            }
        };
        
        console.log('Novo usuário a ser criado:', JSON.stringify(newUser, null, 2));
        
        // Salvar o novo usuário no DynamoDB
        const dynamodbParams = {
            TableName: process.env.USERS_TABLE,
            Item: newUser
        };
        
        await dynamoDB.put(dynamodbParams).promise();
        console.log('Usuário salvo com sucesso no DynamoDB');
        
        // Enviar mensagem de boas-vindas via WhatsApp
        await sendWelcomeMessage(newUser);
        console.log('Mensagem de boas-vindas enviada com sucesso');
        
        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ message: 'Usuário criado com sucesso', userId })
        };
    } catch (error) {
        console.error('Erro ao processar o cadastro:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                message: 'Erro ao processar o cadastro', 
                error: error.message 
            })
        };
    }
};

// Função para verificar se um usuário já existe pelo número de telefone
async function checkIfUserExists(phoneNumber) {
    console.log('Verificando se usuário existe com o número:', phoneNumber);
    
    try {
        // Usar o índice secundário global PhoneNumberIndex para consultar pelo número de telefone
        const queryParams = {
            TableName: process.env.USERS_TABLE,
            IndexName: 'PhoneNumberIndex',
            KeyConditionExpression: 'phoneNumber = :phoneNumber',
            ExpressionAttributeValues: {
                ':phoneNumber': phoneNumber
            }
        };
        
        console.log('Parâmetros da query:', JSON.stringify(queryParams, null, 2));
        
        const queryResult = await dynamoDB.query(queryParams).promise();
        console.log('Resultado da query:', JSON.stringify(queryResult, null, 2));
        
        if (queryResult.Items && queryResult.Items.length > 0) {
            console.log('Usuário encontrado pela query:', JSON.stringify(queryResult.Items[0], null, 2));
            return queryResult.Items[0];
        }
        
        // Se não encontrou pelo índice, faz um scan (menos eficiente, mas garante)
        const scanParams = {
            TableName: process.env.USERS_TABLE,
            FilterExpression: 'phoneNumber = :phoneNumber',
            ExpressionAttributeValues: {
                ':phoneNumber': phoneNumber
            }
        };
        
        console.log('Parâmetros do scan:', JSON.stringify(scanParams, null, 2));
        
        const scanResult = await dynamoDB.scan(scanParams).promise();
        console.log('Resultado do scan:', JSON.stringify(scanResult, null, 2));
        
        if (scanResult.Items && scanResult.Items.length > 0) {
            console.log('Usuário encontrado pelo scan:', JSON.stringify(scanResult.Items[0], null, 2));
            return scanResult.Items[0];
        }
        
        return null;
    } catch (error) {
        console.error('Erro ao verificar usuário existente:', error);
        throw error;
    }
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
        'entrepreneur': 'entrepreneur',
        'freelancer': 'freelancer',
        'marketing_manager': 'marketing_manager',
        'digital_marketing': 'digital_marketer',
        'content_creator': 'content_creator',
        'seo_specialist': 'seo_specialist',
        'marketing_director': 'marketing_director',
        'other': 'other'
    };
    
    // Loga para debug
    console.log(`Mapeando função: ${role} => ${roleMap[role] || 'unknown'}`);
    
    return roleMap[role] || 'unknown';
}

// Envia mensagem de boas-vindas via WhatsApp
async function sendWelcomeMessage(user) {
    console.log(`Enviando mensagem de boas-vindas para ${user.phoneNumber}`);
    
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber: user.phoneNumber,
            template: {
                name: "boas_vindas_antena",
                language: {
                    code: "pt_BR"
                },
                components: [
                    {
                        type: "body",
                        parameters: [
                            {
                                type: "text",
                                text: user.name || "Usuário"
                            }
                        ]
                    }
                ]
            },
            metadata: {
                messageType: 'welcome',
                userId: user.userId
            }
        })
    }).promise();
}

// Função para enviar mensagem via WhatsApp
async function sendWhatsAppMessage(phoneNumber, message) {
    console.log(`Enviando mensagem para ${phoneNumber}: ${message}`);
    
    try {
        await lambda.invoke({
            FunctionName: WHATSAPP_SENDER_LAMBDA,
            InvocationType: 'Event',
            Payload: JSON.stringify({
                phoneNumber: phoneNumber,
                message: message,
                metadata: {
                    messageType: 'text',
                    source: 'lead_processor'
                }
            })
        }).promise();
        
        console.log('Mensagem enviada com sucesso');
        return true;
    } catch (error) {
        console.error('Erro ao enviar mensagem WhatsApp:', error);
        throw error;
    }
}

// Nova função para iniciar explicitamente o fluxo de onboarding
async function iniciarFluxoOnboarding(usuario) {
    const sqs = new AWS.SQS();
    
    // Mensagem para iniciar o onboarding
    const onboardingMessage = {
        tipo: 'iniciar_onboarding',
        usuario: usuario,
        etapa: 0, // Começar na primeira etapa
        timestamp: new Date().toISOString()
    };
    
    // Verificar se as variáveis de ambiente estão definidas
    const queueUrl = process.env.ONBOARDING_QUEUE_URL || process.env.INCOMING_QUEUE_URL || process.env.SQS_RESPONSE_QUEUE_URL;
    
    if (!queueUrl) {
        console.warn('⚠️ AVISO: URL da fila SQS não configurada. Pulando envio da mensagem de onboarding.');
        console.warn('Configure as variáveis de ambiente ONBOARDING_QUEUE_URL, INCOMING_QUEUE_URL ou SQS_RESPONSE_QUEUE_URL.');
        // Não falhar o processo de cadastro por causa da fila
        return { 
            status: 'skipped',
            reason: 'QueueUrl not configured'
        };
    }
    
    // Colocar na fila para processamento pelo orquestrador
    const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(onboardingMessage),
        MessageAttributes: {
            'MessageType': {
                DataType: 'String',
                StringValue: 'OnboardingStart'
            }
        }
    };
    
    console.log('Enviando mensagem para iniciar onboarding:', JSON.stringify(params));
    return sqs.sendMessage(params).promise();
} 