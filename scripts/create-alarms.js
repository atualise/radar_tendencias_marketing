const AWS = require('aws-sdk');

// Configuração da AWS
const cloudWatch = new AWS.CloudWatch();
const sns = new AWS.SNS();

// Nome do tópico SNS para notificações
const TOPIC_NAME = 'RadarTendencias-Alertas';

// Função principal
async function createAlarms(email) {
    console.log('Configurando alarmes de comunicação...');
    
    // 1. Criar tópico SNS para notificações
    let topicArn;
    try {
        const topicResult = await sns.createTopic({ Name: TOPIC_NAME }).promise();
        topicArn = topicResult.TopicArn;
        console.log(`Tópico SNS criado: ${topicArn}`);
        
        // Se um email foi fornecido, inscrever no tópico
        if (email) {
            await sns.subscribe({
                Protocol: 'email',
                TopicArn: topicArn,
                Endpoint: email
            }).promise();
            console.log(`Email ${email} inscrito no tópico de alertas`);
        }
    } catch (error) {
        console.error('Erro ao criar tópico SNS:', error);
        return { status: 'error', error: error.message };
    }
    
    // 2. Criar alarmes
    const alarms = [
        // Alarme para falhas no envio de mensagens
        {
            AlarmName: 'RadarTendencias-FalhaEnvioMensagens',
            AlarmDescription: 'Alerta quando o número de falhas no envio de mensagens excede o limite',
            MetricName: 'MensagensFalhas',
            Namespace: 'RadarTendencias/WhatsApp',
            Dimensions: [
                { Name: 'Service', Value: 'WhatsAppSender' },
                { Name: 'Environment', Value: 'dev' }
            ],
            Statistic: 'Sum',
            Period: 300,
            EvaluationPeriods: 1,
            Threshold: 5,
            ComparisonOperator: 'GreaterThanThreshold',
            TreatMissingData: 'notBreaching',
            ActionsEnabled: true,
            AlarmActions: [topicArn],
            OKActions: [topicArn]
        },
        
        // Alarme para retries esgotados
        {
            AlarmName: 'RadarTendencias-RetryEsgotado',
            AlarmDescription: 'Alerta quando mensagens falham mesmo após todas as tentativas de retry',
            MetricName: 'MensagensRetryEsgotado',
            Namespace: 'RadarTendencias/WhatsApp',
            Dimensions: [
                { Name: 'Service', Value: 'WhatsAppSender' },
                { Name: 'Environment', Value: 'dev' }
            ],
            Statistic: 'Sum',
            Period: 300,
            EvaluationPeriods: 1,
            Threshold: 3,
            ComparisonOperator: 'GreaterThanThreshold',
            TreatMissingData: 'notBreaching',
            ActionsEnabled: true,
            AlarmActions: [topicArn],
            OKActions: [topicArn]
        },
        
        // Alarme para falhas no processamento de mensagens
        {
            AlarmName: 'RadarTendencias-FalhaProcessamento',
            AlarmDescription: 'Alerta quando ocorrem muitas falhas no processamento de mensagens',
            MetricName: 'FalhasProcessamento',
            Namespace: 'RadarTendencias/Orquestrador',
            Dimensions: [
                { Name: 'Service', Value: 'Orquestrador' },
                { Name: 'Environment', Value: 'dev' }
            ],
            Statistic: 'Sum',
            Period: 300,
            EvaluationPeriods: 1,
            Threshold: 5,
            ComparisonOperator: 'GreaterThanThreshold',
            TreatMissingData: 'notBreaching',
            ActionsEnabled: true,
            AlarmActions: [topicArn],
            OKActions: [topicArn]
        },
        
        // Alarme para latência alta no processamento
        {
            AlarmName: 'RadarTendencias-LatenciaProcessamento',
            AlarmDescription: 'Alerta quando a latência de processamento está muito alta',
            MetricName: 'LatenciaProcessamentoMensagem',
            Namespace: 'RadarTendencias/Orquestrador',
            Dimensions: [
                { Name: 'Service', Value: 'Orquestrador' },
                { Name: 'Environment', Value: 'dev' }
            ],
            Statistic: 'Average',
            Period: 300,
            EvaluationPeriods: 1,
            Threshold: 10000, // 10 segundos
            ComparisonOperator: 'GreaterThanThreshold',
            TreatMissingData: 'notBreaching',
            ActionsEnabled: true,
            AlarmActions: [topicArn],
            OKActions: [topicArn]
        },
        
        // Alarme para taxa de sucesso baixa
        {
            AlarmName: 'RadarTendencias-TaxaSucessoBaixa',
            AlarmDescription: 'Alerta quando a taxa de sucesso de processamento está abaixo do esperado',
            MetricName: 'TaxaSucessoProcessamento',
            Namespace: 'RadarTendencias/Orquestrador',
            Dimensions: [
                { Name: 'Service', Value: 'Orquestrador' },
                { Name: 'Environment', Value: 'dev' }
            ],
            Statistic: 'Average',
            Period: 300,
            EvaluationPeriods: 1,
            Threshold: 0.8, // 80%
            ComparisonOperator: 'LessThanThreshold',
            TreatMissingData: 'notBreaching',
            ActionsEnabled: true,
            AlarmActions: [topicArn],
            OKActions: [topicArn]
        }
    ];
    
    // Criar cada alarme
    const results = [];
    for (const alarm of alarms) {
        try {
            await cloudWatch.putMetricAlarm(alarm).promise();
            console.log(`Alarme criado: ${alarm.AlarmName}`);
            results.push({
                alarmName: alarm.AlarmName,
                status: 'success'
            });
        } catch (error) {
            console.error(`Erro ao criar alarme ${alarm.AlarmName}:`, error);
            results.push({
                alarmName: alarm.AlarmName,
                status: 'error',
                error: error.message
            });
        }
    }
    
    return {
        status: 'completed',
        topicArn,
        alarms: results
    };
}

// Se executado diretamente (não importado como módulo)
if (require.main === module) {
    // Verificar se o email foi fornecido como argumento
    const args = process.argv.slice(2);
    const email = args[0];
    
    if (!email) {
        console.log('Uso: node create-alarms.js seu-email@exemplo.com');
        console.log('Nenhum email fornecido. Os alarmes serão criados sem notificações por email.');
    }
    
    createAlarms(email)
        .then(result => {
            console.log('Resultado da criação de alarmes:', JSON.stringify(result, null, 2));
            
            if (result.status === 'completed') {
                console.log('Alarmes configurados com sucesso!');
                if (email) {
                    console.log(`Você receberá um email de confirmação da AWS para ativar as notificações em: ${email}`);
                    console.log('É necessário confirmar a inscrição clicando no link recebido no email.');
                }
            } else {
                console.error('Falha ao configurar alarmes:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Erro não tratado:', error);
            process.exit(1);
        });
}

// Exportar para uso como módulo
module.exports = { createAlarms }; 