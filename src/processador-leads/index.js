const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();
const lambda = new AWS.Lambda();

const USERS_TABLE = process.env.USERS_TABLE;
const WHATSAPP_SENDER_LAMBDA = process.env.WHATSAPP_SENDER_FUNCTION;

exports.handler = async (event) => {
    try {
        console.log('Evento recebido:', JSON.stringify(event));
        
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
        const welcomeResult = await sendWelcomeMessage(newUser);
        console.log('Resultado do envio de boas-vindas:', welcomeResult);
        
        // CORREÇÃO: Iniciar o fluxo de onboarding explicitamente
        // Aguardar um pequeno delay para garantir que a mensagem de boas-vindas seja recebida primeiro
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Adicionar à fila de onboarding
        await iniciarFluxoOnboarding(newUser);
        
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
                language: "pt_BR",
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