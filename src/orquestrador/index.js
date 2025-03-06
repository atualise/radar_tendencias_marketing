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
                console.log('Processando mensagem:', JSON.stringify(body));
                
                let result;
                
                // Identificar tipo de mensagem baseado em suas propriedades
                // Mensagens de onboarding têm campo 'tipo'
                if (body.tipo) {
                    console.log(`Detectada mensagem de tipo especial: ${body.tipo}`);
                    
                    if (body.tipo === 'iniciar_onboarding') {
                        console.log('Processando início de onboarding:', 
                            body.usuario ? `userId=${body.usuario.userId}, name=${body.usuario.name}` : 'dados incompletos');
                        result = await processarInicioOnboarding(body);
                        await publishMetric('OnboardingIniciados', 1);
                    } 
                    else if (body.tipo === 'resposta_onboarding') {
                        console.log(`Processando resposta de onboarding (etapa ${body.etapa})`);
                        result = await processarRespostaOnboarding(body);
                        await publishMetric('RespostasOnboardingProcessadas', 1);
                    }
                    else {
                        console.warn(`Tipo de mensagem desconhecido: ${body.tipo}`);
                        result = { status: 'ignored', message: `Tipo de mensagem não suportado: ${body.tipo}` };
                    }
                }
                // Mensagens normais têm campo 'type'
                else if (body.type === 'command') {
                    console.log(`Processando comando: ${body.commandType}`);
                    result = await processCommand(body);
                    await publishMetric('ComandosProcessados', 1);
                } 
                else {
                    console.log('Processando mensagem de usuário padrão');
                    result = await processUserMessage(body);
                    await publishMetric('MensagensUsuarioProcessadas', 1);
                }
                
                // Registrar latência de processamento
                const processingTime = new Date().getTime() - startTime;
                await publishMetric('LatenciaProcessamentoMensagem', processingTime, 'Milliseconds');
                
                console.log('Processamento concluído com resultado:', JSON.stringify(result));
                return { status: 'success', result };
            } catch (error) {
                console.error('Erro ao processar registro:', error);
                await publishMetric('ErrosProcessamento', 1);
                
                return {
                    status: 'error',
                    error: error.message,
                    record: {
                        id: record.messageId,
                        body: record.body
                    }
                };
            }
        })
    );
    
    // Calcular taxa de sucesso
    const sucessos = processResults.filter(r => r.status === 'success').length;
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
    
    // Verificar se data existe
    if (!data) {
        console.error('Dados do comando são nulos ou indefinidos');
        return {
            status: 'error',
            message: 'Dados do comando inválidos'
        };
    }
    
    // Extrair propriedades com valores padrão seguros
    const { 
        userId = 'unknown', 
        interactionId = uuidv4(), 
        commandType = 'unknown', 
        fullCommand = '' 
    } = data;
    
    // Verificar se userId existe
    if (!userId || userId === 'unknown') {
        console.error('ID do usuário não fornecido no comando');
        return {
            status: 'error',
            message: 'ID do usuário não fornecido'
        };
    }
    
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
    // Verificar se data existe e extrair propriedades com valores padrão seguros
    if (!data) {
        console.error('Dados da mensagem são nulos ou indefinidos');
        return {
            status: 'error',
            message: 'Dados da mensagem inválidos'
        };
    }
    
    const { 
        userId = 'unknown', 
        interactionId = uuidv4(), 
        content = '', 
        context = {} 
    } = data;
    
    // Verificar se userId existe
    if (!userId || userId === 'unknown') {
        console.error('ID do usuário não fornecido na mensagem');
        return {
            status: 'error',
            message: 'ID do usuário não fornecido'
        };
    }
    
    // Verificar se content existe e é uma string antes de usar substring
    const contentPreview = typeof content === 'string' && content ? 
        `"${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"` : 
        '[Sem conteúdo de texto]';
    
    console.log(`Processando mensagem para usuário ${userId}: ${contentPreview}`);
    
    // Buscar informações do usuário
    const user = await getUser(userId);
    
    if (!user) {
        console.error(`Usuário ${userId} não encontrado`);
        return {
            status: 'error',
            message: 'Usuário não encontrado'
        };
    }
    
    // Verificar se context e context.stage existem
    if (context && context.stage === 'onboarding') {
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
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        user.userId, 
        'Mensagem de boas-vindas do onboarding', 
        'onboarding_welcome', 
        interactionId
    );
    
    // Atualizar a etapa de onboarding
    await updateUserOnboardingStep(user.userId, 'profile_question');
    
    // Enviar mensagem de boas-vindas usando template
    await sendWhatsAppMessage(
        user.phoneNumber,
        null,
        { interactionId: outputInteractionId, userId: user.userId },
        {
            name: "onboarding_inicio_antena",
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
        }
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
    // Atualizar status de onboarding
    await dynamoDB.update({
        TableName: USERS_TABLE,
        Key: { userId: user.userId },
        UpdateExpression: 'set onboardingCompleted = :completed',
        ExpressionAttributeValues: {
            ':completed': true
        }
    }).promise();
    
    // Enviar mensagem final de onboarding usando template
    await sendWhatsAppMessage(
        user.phoneNumber,
        null,
        { interactionId, userId: user.userId },
        {
            name: "finalizacao_onboarding_antena",
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
        }
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
async function sendWhatsAppMessage(phoneNumber, message, metadata, template) {
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber,
            message,
            metadata,
            template
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

// Ajuste na função que processa mensagens
async function processarMensagem(mensagem) {
    console.log('Processando mensagem:', JSON.stringify(mensagem));
    
    // Verificar se é uma mensagem de início de onboarding
    if (mensagem.tipo === 'iniciar_onboarding') {
        console.log('Iniciando fluxo de onboarding para usuário:', mensagem.usuario.telefone);
        return await processarInicioOnboarding(mensagem);
    }
    
    // Verificar se é uma resposta a uma pergunta de onboarding
    if (mensagem.tipo === 'resposta_onboarding') {
        console.log('Processando resposta de onboarding, etapa:', mensagem.etapa);
        return await processarRespostaOnboarding(mensagem);
    }
    
    // Outros tipos de mensagens...
    // ... existing code ...
}

// Nova função para processar início de onboarding
async function processarInicioOnboarding(mensagem) {
    if (!mensagem || !mensagem.usuario) {
        console.error('Mensagem de onboarding inválida ou sem dados de usuário');
        return {
            status: 'error',
            message: 'Dados de onboarding inválidos'
        };
    }
    
    const usuario = mensagem.usuario;
    
    // Verificar se userId está presente
    if (!usuario.userId) {
        console.error('ID do usuário não fornecido na mensagem de onboarding');
        return {
            status: 'error',
            message: 'ID do usuário não fornecido'
        };
    }
    
    console.log(`Processando início de onboarding para usuário ${usuario.userId}`);
    
    try {
        // Obter a primeira pergunta do onboarding
        const pergunta = obterPerguntaOnboarding(0);
        
        // Atualizar estado do usuário no DynamoDB
        await atualizarEstadoOnboarding(usuario.userId, 0);
        
        // Enviar mensagem de boas-vindas via WhatsApp (se o número estiver disponível)
        if (usuario.phoneNumber) {
            await sendWhatsAppMessage(
                usuario.phoneNumber,
                `Olá ${usuario.name || 'visitante'}, bem-vindo ao Radar de Tendências! Vamos personalizar sua experiência. ${pergunta}`,
                { userId: usuario.userId }
            );
            
            console.log(`Mensagem de onboarding enviada para ${usuario.phoneNumber}`);
            return {
                status: 'success',
                message: 'Onboarding iniciado com sucesso'
            };
        } else {
            console.warn('Usuário sem número de telefone, não foi possível iniciar onboarding via WhatsApp');
            return {
                status: 'warning',
                message: 'Usuário sem telefone para enviar mensagem'
            };
        }
    } catch (error) {
        console.error('Erro ao processar início de onboarding:', error);
        return {
            status: 'error',
            message: `Erro: ${error.message}`
        };
    }
}

// Função para obter perguntas de onboarding
function obterPerguntaOnboarding(etapa) {
    const perguntas = [
        "Qual é sua área de atuação em marketing digital? (ex: Conteúdo, SEO, Mídia Paga, Redes Sociais)",
        "Quais são seus principais objetivos profissionais para os próximos meses?",
        "Quais ferramentas de marketing digital você já utiliza?",
        "Que tipo de informações e tendências mais te interessam?",
        "Prefere receber conteúdos mais técnicos ou mais estratégicos?",
        "Com que frequência gostaria de receber nossas dicas e recomendações?"
    ];
    
    return perguntas[etapa] || "Obrigado por compartilhar suas informações!";
}

// Atualizar estado do usuário no DynamoDB
async function atualizarEstadoOnboarding(userId, etapa) {
    console.log(`Atualizando estado de onboarding para usuário ${userId}, etapa ${etapa}`);
    
    try {
        const params = {
            TableName: USERS_TABLE,
            Key: { userId: userId },
            UpdateExpression: "set profile.onboardingStep = :etapa, profile.onboardingStatus = :status, lastActive = :data",
            ExpressionAttributeValues: {
                ":etapa": etapa,
                ":status": "in_progress",
                ":data": new Date().toISOString()
            },
            ReturnValues: "UPDATED_NEW"
        };
        
        const result = await dynamoDB.update(params).promise();
        console.log('Atualização de estado concluída:', result);
        return result;
    } catch (error) {
        console.error('Erro ao atualizar estado de onboarding:', error);
        throw error; // Propagar o erro para tratamento adequado
    }
}

// ... existing code ... 