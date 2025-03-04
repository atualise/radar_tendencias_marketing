const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();
const lambda = new AWS.Lambda();

const USERS_TABLE = process.env.USERS_TABLE;
const WHATSAPP_SENDER_LAMBDA = process.env.WHATSAPP_SENDER_FUNCTION;

exports.handler = async (event) => {
    try {
        // Parse da requisição
        const body = JSON.parse(event.body);
        const { name, phone, email, role, source = 'landing_page' } = body;
        
        console.log('Novo lead recebido:', { name, phone, email, role, source });
        
        // Validação básica
        if (!name || !phone || !email || !role) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Campos obrigatórios ausentes' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            };
        }
        
        // Verificar se usuário já existe
        const userExists = await checkIfUserExists(phone);
        
        if (userExists) {
            console.log('Usuário já registrado:', userExists);
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'Usuário já registrado',
                    userId: userExists
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
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
        
        console.log('Criando novo usuário:', userId);
        
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
                message: 'Usuário criado com sucesso',
                userId
            }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
        
    } catch (error) {
        console.error('Erro ao processar lead:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Falha ao processar lead',
                error: error.message
            }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
    }
};

// Verifica se usuário já existe pelo número de telefone
async function checkIfUserExists(phone) {
    const normalizedPhone = normalizePhone(phone);
    
    const result = await dynamoDB.query({
        TableName: USERS_TABLE,
        IndexName: 'PhoneNumberIndex',
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
    
    console.log(`Enviando mensagem de boas-vindas para ${user.phoneNumber}`);
    
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber: user.phoneNumber,
            message: welcomeMessage,
            metadata: {
                messageType: 'welcome',
                userId: user.userId
            }
        })
    }).promise();
}

// Agenda fluxo de onboarding
async function scheduleOnboarding(userId) {
    // Delay de 2 minutos para iniciar onboarding
    const onboardingDelay = 2 * 60; // 2 minutos em segundos
    
    console.log(`Agendando onboarding para ${userId} em ${onboardingDelay} segundos`);
    
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