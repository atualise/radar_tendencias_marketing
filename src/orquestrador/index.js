const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const lambda = new AWS.Lambda();
const cloudWatch = new AWS.CloudWatch();
const { v4: uuidv4 } = require('uuid');

const USERS_TABLE = process.env.USERS_TABLE;
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE;
const CONTENTS_TABLE = process.env.CONTENTS_TABLE;
const SQS_CONTENT_QUEUE_URL = process.env.SQS_CONTENT_QUEUE_URL;
const WHATSAPP_SENDER_LAMBDA = process.env.WHATSAPP_SENDER_FUNCTION;

exports.handler = async (event) => {
    console.log('Evento recebido:', JSON.stringify(event));
    
    // Registrar número de mensagens recebidas
    await publishMetric('MensagensRecebidasFila', event.Records.length);
    
    // Processa cada registro da fila SQS
    const processResults = await Promise.all(
        event.Records.map(async (record) => {
            const startTime = new Date().getTime();
            try {
                const body = JSON.parse(record.body);
                console.log('Processando mensagem:', body);
                
                // Identificar tipo de mensagem
                let result;
                if (body.type === 'command') {
                    result = await processCommand(body);
                    await publishMetric('ComandosProcessados', 1);
                } else {
                    result = await processUserMessage(body);
                    await publishMetric('MensagensUsuarioProcessadas', 1);
                }
                
                // Registrar latência de processamento
                const processingTime = new Date().getTime() - startTime;
                await publishMetric('LatenciaProcessamentoMensagem', processingTime, 'Milliseconds');
                
                return result;
            } catch (error) {
                console.error('Erro ao processar registro:', error);
                
                // Registrar falha
                await publishMetric('FalhasProcessamento', 1);
                const processingTime = new Date().getTime() - startTime;
                await publishMetric('LatenciaProcessamentoFalha', processingTime, 'Milliseconds');
                
                return {
                    status: 'error',
                    error: error.message,
                    record: record.body
                };
            }
        })
    );
    
    // Calcular taxa de sucesso
    const sucessos = processResults.filter(r => r.status !== 'error').length;
    const taxaSucesso = sucessos / processResults.length;
    await publishMetric('TaxaSucessoProcessamento', taxaSucesso, 'None');
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            results: processResults
        })
    };
};

// Função para publicar métricas no CloudWatch
async function publishMetric(metricName, value, unit = 'Count') {
    try {
        const params = {
            MetricData: [
                {
                    MetricName: metricName,
                    Dimensions: [
                        {
                            Name: 'Environment',
                            Value: process.env.Environment || 'dev'
                        },
                        {
                            Name: 'Service',
                            Value: 'Orquestrador'
                        }
                    ],
                    Unit: unit,
                    Value: value
                }
            ],
            Namespace: 'RadarTendencias/Orquestrador'
        };
        
        await cloudWatch.putMetricData(params).promise();
    } catch (error) {
        console.error(`Erro ao publicar métrica ${metricName}:`, error);
        // Não lançamos o erro aqui para não interromper o fluxo principal
    }
}

// Processa comandos específicos
async function processCommand(data) {
    const startTime = new Date().getTime();
    const { userId, interactionId, commandType, fullCommand } = data;
    
    // Registrar o tipo de comando recebido
    await publishMetric(`Comando${commandType}`, 1);
    
    console.log(`Processando comando ${commandType} para usuário ${userId}`);
    
    // Buscar informações do usuário
    const user = await getUser(userId);
    
    if (!user) {
        console.error(`Usuário ${userId} não encontrado`);
        return {
            status: 'error',
            message: 'Usuário não encontrado'
        };
    }
    
    // Armazenar interação de saída para registro do comando
    const outputInteractionId = await createOutputInteraction(
        userId, 
        `Processando seu comando: ${fullCommand}`, 
        'processing_message', 
        interactionId
    );
    
    // Enviar mensagem de processamento para o usuário
    await sendWhatsAppMessage(
        user.phoneNumber,
        `Estou processando seu comando "${fullCommand}". Aguarde um momento...`,
        {
            interactionId: outputInteractionId,
            userId,
            commandType
        }
    );
    
    // Roteamento baseado no tipo de comando
    switch (commandType) {
        case 'tool_recommendation':
            return await handleToolRecommendation(user, interactionId, fullCommand);
        
        case 'case_study':
            return await handleCaseStudy(user, interactionId, fullCommand);
        
        case 'trend_report':
            return await handleTrendReport(user, interactionId, fullCommand);
        
        case 'help_menu':
            return await handleHelpMenu(user, interactionId);
        
        default:
            // Comando desconhecido
            const unknownCommandInteractionId = await createOutputInteraction(
                userId, 
                `Comando não reconhecido: ${fullCommand}`, 
                'unknown_command', 
                interactionId
            );
            
            await sendWhatsAppMessage(
                user.phoneNumber,
                `Desculpe, não reconheço o comando "${fullCommand}". Digite /ajuda para ver a lista de comandos disponíveis.`,
                { interactionId: unknownCommandInteractionId, userId }
            );
            
            return {
                status: 'completed',
                message: 'Comando não reconhecido',
                commandType: 'unknown'
            };
    }
}

// Processa mensagens de usuário (não comandos)
async function processUserMessage(data) {
    const { userId, interactionId, content, context } = data;
    
    console.log(`Processando mensagem para usuário ${userId}: "${content.substring(0, 50)}..."`);
    
    // Buscar informações do usuário
    const user = await getUser(userId);
    
    if (!user) {
        console.error(`Usuário ${userId} não encontrado`);
        return {
            status: 'error',
            message: 'Usuário não encontrado'
        };
    }
    
    // Verificar se está em onboarding
    if (context.stage === 'onboarding') {
        return await processOnboardingMessage(user, interactionId, content, context);
    }
    
    // Caso contrário, processar como conversa padrão
    const processingInteractionId = await createOutputInteraction(
        userId, 
        'Analisando sua mensagem...', 
        'processing_message', 
        interactionId
    );
    
    await sendWhatsAppMessage(
        user.phoneNumber,
        'Estou analisando sua mensagem, um momento...',
        { interactionId: processingInteractionId, userId }
    );
    
    // Encaminhar para geração de conteúdo via IA
    await sqs.sendMessage({
        QueueUrl: SQS_CONTENT_QUEUE_URL,
        MessageBody: JSON.stringify({
            type: 'user_query',
            userId,
            interactionId,
            content,
            context
        }),
        MessageAttributes: {
            'MessageType': {
                DataType: 'String',
                StringValue: 'ai_generation'
            }
        }
    }).promise();
    
    return {
        status: 'forwarded_to_ai',
        message: 'Mensagem encaminhada para processamento por IA'
    };
}

// Manipulador de comando de recomendação de ferramentas
async function handleToolRecommendation(user, interactionId, fullCommand) {
    // Extrair parâmetros - exemplo: "/ferramenta marketing de conteúdo"
    const params = fullCommand.split(/\s+/).slice(1).join(' ');
    const topic = params.trim() || 'marketing digital';
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        `Buscando recomendações de ferramentas para: ${topic}`, 
        'tool_recommendation', 
        interactionId
    );
    
    // Solicitar geração de conteúdo via IA
    await sqs.sendMessage({
        QueueUrl: SQS_CONTENT_QUEUE_URL,
        MessageBody: JSON.stringify({
            type: 'tool_recommendation',
            userId: user.userId,
            interactionId: outputInteractionId,
            topic,
            userProfile: user.profile
        }),
        MessageAttributes: {
            'MessageType': {
                DataType: 'String',
                StringValue: 'ai_generation'
            }
        }
    }).promise();
    
    return {
        status: 'forwarded_to_ai',
        message: 'Solicitação de recomendação de ferramentas enviada',
        topic
    };
}

// Manipulador de comando de estudo de caso
async function handleCaseStudy(user, interactionId, fullCommand) {
    // Extrair parâmetros - exemplo: "/case redes sociais"
    const params = fullCommand.split(/\s+/).slice(1).join(' ');
    const topic = params.trim() || 'marketing digital';
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        `Buscando casos de sucesso em: ${topic}`, 
        'case_study', 
        interactionId
    );
    
    // Solicitar geração de conteúdo via IA
    await sqs.sendMessage({
        QueueUrl: SQS_CONTENT_QUEUE_URL,
        MessageBody: JSON.stringify({
            type: 'case_study',
            userId: user.userId,
            interactionId: outputInteractionId,
            topic,
            userProfile: user.profile
        }),
        MessageAttributes: {
            'MessageType': {
                DataType: 'String',
                StringValue: 'ai_generation'
            }
        }
    }).promise();
    
    return {
        status: 'forwarded_to_ai',
        message: 'Solicitação de caso de estudo enviada',
        topic
    };
}

// Manipulador de comando de relatório de tendências
async function handleTrendReport(user, interactionId, fullCommand) {
    // Extrair parâmetros - exemplo: "/tendencia inteligência artificial"
    const params = fullCommand.split(/\s+/).slice(1).join(' ');
    const topic = params.trim() || 'marketing digital';
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        `Buscando tendências em: ${topic}`, 
        'trend_report', 
        interactionId
    );
    
    // Solicitar geração de conteúdo via IA
    await sqs.sendMessage({
        QueueUrl: SQS_CONTENT_QUEUE_URL,
        MessageBody: JSON.stringify({
            type: 'trend_report',
            userId: user.userId,
            interactionId: outputInteractionId,
            topic,
            userProfile: user.profile
        }),
        MessageAttributes: {
            'MessageType': {
                DataType: 'String',
                StringValue: 'ai_generation'
            }
        }
    }).promise();
    
    return {
        status: 'forwarded_to_ai',
        message: 'Solicitação de relatório de tendências enviada',
        topic
    };
}

// Manipulador de menu de ajuda
async function handleHelpMenu(user, interactionId) {
    const helpMessage = `*Comandos Disponíveis:*

📊 */tendencia [tópico]* - Receba as últimas tendências em marketing digital (ex: "/tendencia email marketing")

🛠️ */ferramenta [tópico]* - Descubra ferramentas para otimizar seu trabalho (ex: "/ferramenta automação")

📈 */case [tópico]* - Veja casos de sucesso na área (ex: "/case e-commerce")

❓ */ajuda* - Exibe esta mensagem de ajuda

Para qualquer outra pergunta, basta enviar normalmente e farei o possível para responder!

🔍 *Dica:* Seja específico em suas solicitações para obter respostas mais precisas.`;

    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Menu de ajuda', 
        'help_menu', 
        interactionId
    );
    
    // Enviar mensagem de ajuda
    await sendWhatsAppMessage(
        user.phoneNumber,
        helpMessage,
        { interactionId: outputInteractionId, userId: user.userId }
    );
    
    return {
        status: 'completed',
        message: 'Menu de ajuda enviado'
    };
}

// Processa mensagens durante o fluxo de onboarding
async function processOnboardingMessage(user, interactionId, content, context) {
    const onboardingStep = context.step;
    
    console.log(`Processando mensagem de onboarding para ${user.userId} na etapa ${onboardingStep}`);
    
    // Baseado na etapa de onboarding, determinar próxima ação
    switch (onboardingStep) {
        case 'welcome':
            return await handleOnboardingWelcome(user, interactionId);
            
        case 'profile_question':
            return await handleOnboardingProfile(user, interactionId, content);
            
        case 'interests_question':
            return await handleOnboardingInterests(user, interactionId, content);
            
        case 'tools_question':
            return await handleOnboardingTools(user, interactionId, content);
            
        case 'challenges_question':
            return await handleOnboardingChallenges(user, interactionId, content);
            
        case 'finishing':
            return await finalizeOnboarding(user, interactionId);
            
        default:
            // Se não sabemos a etapa, reiniciar onboarding
            return await handleOnboardingWelcome(user, interactionId);
    }
}

// Manipula etapa inicial do onboarding
async function handleOnboardingWelcome(user, interactionId) {
    const welcomeMessage = `Olá novamente, ${user.name}! 👋
    
Estou muito feliz em ter você no *Radar de Tendências em Marketing Digital*.
    
Vamos personalizar sua experiência com algumas perguntas rápidas.

*Primeira pergunta:* Qual é o principal objetivo da sua estratégia de marketing digital atualmente?
    
a) Aumentar tráfego para o site
b) Gerar mais leads qualificados
c) Melhorar engajamento nas redes sociais
d) Aumentar conversões e vendas
e) Aperfeiçoar o branding e posicionamento
f) Outro (descreva brevemente)`;
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Mensagem de boas-vindas do onboarding', 
        'onboarding_welcome', 
        interactionId
    );
    
    // Atualizar a etapa de onboarding
    await updateUserOnboardingStep(user.userId, 'profile_question');
    
    // Enviar mensagem de boas-vindas
    await sendWhatsAppMessage(
        user.phoneNumber,
        welcomeMessage,
        { interactionId: outputInteractionId, userId: user.userId }
    );
    
    return {
        status: 'completed',
        message: 'Mensagem de boas-vindas de onboarding enviada'
    };
}

// Manipula resposta sobre o perfil
async function handleOnboardingProfile(user, interactionId, content) {
    // Armazenar a resposta
    await updateUserProfile(user.userId, 'objective', content);
    
    const interestsMessage = `Ótimo! Agora, quais áreas de marketing digital mais interessam a você? Selecione todas que se aplicam:
    
1) Marketing de conteúdo
2) SEO e visibilidade em buscas
3) Mídia paga e tráfego pago
4) Email marketing
5) Social media e redes sociais
6) Automação de marketing
7) Inteligência artificial aplicada
8) Analytics e dados
9) Outra (por favor, especifique)
    
Exemplo: Se te interessam marketing de conteúdo, SEO e social media, responda com "1, 2, 5"`;
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Pergunta sobre interesses', 
        'onboarding_interests_question', 
        interactionId
    );
    
    // Atualizar a etapa de onboarding
    await updateUserOnboardingStep(user.userId, 'interests_question');
    
    // Enviar mensagem sobre interesses
    await sendWhatsAppMessage(
        user.phoneNumber,
        interestsMessage,
        { interactionId: outputInteractionId, userId: user.userId }
    );
    
    return {
        status: 'completed',
        message: 'Pergunta sobre interesses enviada'
    };
}

// Manipula resposta sobre interesses
async function handleOnboardingInterests(user, interactionId, content) {
    // Armazenar a resposta
    await updateUserInterests(user.userId, content);
    
    const toolsMessage = `Excelente escolha! Quais ferramentas de marketing você já utiliza no seu dia a dia?
    
Por exemplo: Google Analytics, Meta Ads, Mailchimp, SEMrush, etc.
    
Por favor, liste as principais ferramentas separadas por vírgula.`;
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Pergunta sobre ferramentas', 
        'onboarding_tools_question', 
        interactionId
    );
    
    // Atualizar a etapa de onboarding
    await updateUserOnboardingStep(user.userId, 'tools_question');
    
    // Enviar mensagem sobre ferramentas
    await sendWhatsAppMessage(
        user.phoneNumber,
        toolsMessage,
        { interactionId: outputInteractionId, userId: user.userId }
    );
    
    return {
        status: 'completed',
        message: 'Pergunta sobre ferramentas enviada'
    };
}

// Manipula resposta sobre ferramentas
async function handleOnboardingTools(user, interactionId, content) {
    // Armazenar a resposta
    await updateUserTools(user.userId, content);
    
    const challengesMessage = `Já estamos quase terminando! Qual é o seu maior desafio atual em marketing digital?
    
Por favor, descreva brevemente para que possamos enviar conteúdos relevantes para ajudá-lo.`;
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Pergunta sobre desafios', 
        'onboarding_challenges_question', 
        interactionId
    );
    
    // Atualizar a etapa de onboarding
    await updateUserOnboardingStep(user.userId, 'challenges_question');
    
    // Enviar mensagem sobre desafios
    await sendWhatsAppMessage(
        user.phoneNumber,
        challengesMessage,
        { interactionId: outputInteractionId, userId: user.userId }
    );
    
    return {
        status: 'completed',
        message: 'Pergunta sobre desafios enviada'
    };
}

// Manipula resposta sobre desafios
async function handleOnboardingChallenges(user, interactionId, content) {
    // Armazenar a resposta
    await updateUserChallenges(user.userId, content);
    
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Finalizando onboarding', 
        'onboarding_finishing', 
        interactionId
    );
    
    // Atualizar a etapa de onboarding
    await updateUserOnboardingStep(user.userId, 'finishing');
    
    // Agendar finalização do onboarding
    await finalizeOnboarding(user, outputInteractionId);
    
    return {
        status: 'completed',
        message: 'Onboarding finalizado com sucesso'
    };
}

// Finaliza o processo de onboarding
async function finalizeOnboarding(user, interactionId) {
    const completeMessage = `🎉 *Prontinho, ${user.name}!*
    
Seu perfil está configurado e começaremos a enviar conteúdos personalizados em breve.
    
*Comandos que você pode usar:*
    
📊 */tendencia [tópico]* - Receba tendências específicas
🛠️ */ferramenta [tópico]* - Descubra ferramentas úteis
📈 */case [tópico]* - Veja casos de sucesso
❓ */ajuda* - Para mais informações

Estamos muito felizes em tê-lo(a) conosco! Se tiver dúvidas, é só perguntar.`;
    
    // Atualizar status de onboarding
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId: user.userId },
        UpdateExpression: 'set onboardingCompleted = :completed',
        ExpressionAttributeValues: {
            ':completed': true
        }
    }).promise();
    
    // Enviar mensagem final de onboarding
    await sendWhatsAppMessage(
        user.phoneNumber,
        completeMessage,
        { interactionId, userId: user.userId }
    );
    
    return {
        status: 'completed',
        message: 'Onboarding concluído'
    };
}

// Funções auxiliares

// Busca informações do usuário
async function getUser(userId) {
    const result = await dynamoDB.get({
        TableName: USERS_TABLE,
        Key: { userId }
    }).promise();
    
    return result.Item;
}

// Cria uma interação de saída (resposta do sistema)
async function createOutputInteraction(userId, content, contentType, replyTo) {
    const interactionId = `int${uuidv4().replace(/-/g, '')}`;
    
    const interaction = {
        interactionId,
        userId,
        timestamp: new Date().toISOString(),
        channel: 'whatsapp',
        direction: 'outgoing',
        type: 'message',
        contentType,
        content,
        replyTo,
        metrics: {
            deliveryStatus: 'pending'
        },
        context: {
            triggerType: 'system_generated'
        }
    };
    
    await dynamoDB.put({
        TableName: INTERACTIONS_TABLE,
        Item: interaction
    }).promise();
    
    return interactionId;
}

// Envia mensagem via WhatsApp
async function sendWhatsAppMessage(phoneNumber, message, metadata) {
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber,
            message,
            metadata
        })
    }).promise();
}

// Atualiza a etapa de onboarding do usuário
async function updateUserOnboardingStep(userId, step) {
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set profile.onboardingStep = :step',
        ExpressionAttributeValues: {
            ':step': step
        }
    }).promise();
}

// Atualiza o perfil do usuário com o objetivo
async function updateUserProfile(userId, field, value) {
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set profile.objective = :value',
        ExpressionAttributeValues: {
            ':value': value
        }
    }).promise();
}

// Atualiza os interesses do usuário
async function updateUserInterests(userId, interestsInput) {
    // Mapeamento de categorias
    const interestCategories = {
        '1': 'content_marketing',
        '2': 'seo',
        '3': 'paid_media',
        '4': 'email_marketing',
        '5': 'social_media',
        '6': 'marketing_automation',
        '7': 'ai_marketing',
        '8': 'analytics',
        '9': 'other'
    };
    
    // Processar entrada do usuário (ex: "1, 2, 5")
    const selectedNumbers = interestsInput.split(/\s*,\s*/).map(n => n.trim());
    const interests = selectedNumbers.map(num => {
        const category = interestCategories[num] || 'other';
        return { category, score: 1.0 };
    });
    
    // Atualizar os interesses no perfil
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set preferences.interests = :interests',
        ExpressionAttributeValues: {
            ':interests': interests
        }
    }).promise();
}

// Atualiza as ferramentas usadas pelo usuário
async function updateUserTools(userId, toolsInput) {
    // Processar entrada (ex: "Google Analytics, Meta Ads, Mailchimp")
    const tools = toolsInput.split(/\s*,\s*/).map(tool => tool.trim());
    
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set profile.toolsUsed = :tools',
        ExpressionAttributeValues: {
            ':tools': tools
        }
    }).promise();
}

// Atualiza os desafios do usuário
async function updateUserChallenges(userId, challengesInput) {
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'set profile.challenges = :challenges',
        ExpressionAttributeValues: {
            ':challenges': [challengesInput]
        }
    }).promise();
} 