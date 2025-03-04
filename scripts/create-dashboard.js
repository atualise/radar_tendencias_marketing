const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Definir a região da AWS explicitamente
const AWS_REGION = 'us-east-1'; // Substitua pela sua região preferida, como 'us-east-1', 'eu-west-1', etc.

// Configuração da AWS
AWS.config.update({ region: AWS_REGION });
const cloudWatch = new AWS.CloudWatch();

// Nome do dashboard
const DASHBOARD_NAME = 'RadarTendencias-Comunicacao';

// Função principal
async function createDashboard() {
    console.log('Criando dashboard de monitoramento de comunicação...');
    
    // Definir o body do dashboard
    const dashboardBody = {
        widgets: [
            // Título do Dashboard
            {
                type: 'text',
                x: 0,
                y: 0,
                width: 24,
                height: 1,
                properties: {
                    markdown: '# Dashboard de Monitoramento - Radar de Tendências\nMonitoramento dos fluxos de comunicação entre o sistema e os usuários'
                }
            },
            
            // Seção de Mensagens WhatsApp
            {
                type: 'text',
                x: 0,
                y: 1,
                width: 24,
                height: 1,
                properties: {
                    markdown: '## Métricas de Mensagens WhatsApp'
                }
            },
            // Taxa de Sucesso de Envio
            {
                type: 'metric',
                x: 0,
                y: 2,
                width: 8,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/WhatsApp', 'TaxaSucessoEnvio', 'Environment', 'dev', 'Service', 'WhatsAppSender']
                    ],
                    view: 'gauge',
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Taxa de Sucesso de Envio',
                    period: 300,
                    stat: 'Average',
                    yAxis: {
                        left: {
                            min: 0,
                            max: 1
                        }
                    }
                }
            },
            // Mensagens Enviadas e Falhas
            {
                type: 'metric',
                x: 8,
                y: 2,
                width: 8,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/WhatsApp', 'MensagensEnviadas', 'Environment', 'dev', 'Service', 'WhatsAppSender'],
                        ['RadarTendencias/WhatsApp', 'MensagensFalhas', 'Environment', 'dev', 'Service', 'WhatsAppSender']
                    ],
                    view: 'timeSeries',
                    stacked: false,
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Mensagens Enviadas x Falhas',
                    period: 300,
                    stat: 'Sum'
                }
            },
            // Retries
            {
                type: 'metric',
                x: 16,
                y: 2,
                width: 8,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/WhatsApp', 'MensagensRetry', 'Environment', 'dev', 'Service', 'WhatsAppSender'],
                        ['RadarTendencias/WhatsApp', 'MensagensRetryEsgotado', 'Environment', 'dev', 'Service', 'WhatsAppSender']
                    ],
                    view: 'timeSeries',
                    stacked: false,
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Retries de Mensagens',
                    period: 300,
                    stat: 'Sum'
                }
            },
            
            // Seção do Orquestrador
            {
                type: 'text',
                x: 0,
                y: 8,
                width: 24,
                height: 1,
                properties: {
                    markdown: '## Métricas do Orquestrador'
                }
            },
            // Taxa de Sucesso de Processamento
            {
                type: 'metric',
                x: 0,
                y: 9,
                width: 8,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/Orquestrador', 'TaxaSucessoProcessamento', 'Environment', 'dev', 'Service', 'Orquestrador']
                    ],
                    view: 'gauge',
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Taxa de Sucesso de Processamento',
                    period: 300,
                    stat: 'Average',
                    yAxis: {
                        left: {
                            min: 0,
                            max: 1
                        }
                    }
                }
            },
            // Processamento de Comandos
            {
                type: 'metric',
                x: 8,
                y: 9,
                width: 8,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/Orquestrador', 'ComandoTendencia', 'Environment', 'dev', 'Service', 'Orquestrador'],
                        ['RadarTendencias/Orquestrador', 'ComandoFerramenta', 'Environment', 'dev', 'Service', 'Orquestrador'],
                        ['RadarTendencias/Orquestrador', 'ComandoCase', 'Environment', 'dev', 'Service', 'Orquestrador'],
                        ['RadarTendencias/Orquestrador', 'ComandoAjuda', 'Environment', 'dev', 'Service', 'Orquestrador']
                    ],
                    view: 'timeSeries',
                    stacked: true,
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Tipos de Comandos Processados',
                    period: 300,
                    stat: 'Sum'
                }
            },
            // Latência de Processamento
            {
                type: 'metric',
                x: 16,
                y: 9,
                width: 8,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/Orquestrador', 'LatenciaProcessamentoMensagem', 'Environment', 'dev', 'Service', 'Orquestrador']
                    ],
                    view: 'timeSeries',
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Latência de Processamento (ms)',
                    period: 300,
                    stat: 'Average',
                    yAxis: {
                        left: {
                            min: 0
                        }
                    }
                }
            },
            
            // Seção de Fluxo de Usuários
            {
                type: 'text',
                x: 0,
                y: 15,
                width: 24,
                height: 1,
                properties: {
                    markdown: '## Fluxo de Usuários e Interações'
                }
            },
            // Mensagens Recebidas vs Enviadas
            {
                type: 'metric',
                x: 0,
                y: 16,
                width: 12,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/Orquestrador', 'MensagensUsuarioProcessadas', 'Environment', 'dev', 'Service', 'Orquestrador'],
                        ['RadarTendencias/WhatsApp', 'MensagensEnviadas', 'Environment', 'dev', 'Service', 'WhatsAppSender']
                    ],
                    view: 'timeSeries',
                    stacked: false,
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Mensagens Recebidas vs Enviadas',
                    period: 300,
                    stat: 'Sum'
                }
            },
            // Falhas por Etapa
            {
                type: 'metric',
                x: 12,
                y: 16,
                width: 12,
                height: 6,
                properties: {
                    metrics: [
                        ['RadarTendencias/Orquestrador', 'FalhasProcessamento', 'Environment', 'dev', 'Service', 'Orquestrador'],
                        ['RadarTendencias/WhatsApp', 'MensagensFalhas', 'Environment', 'dev', 'Service', 'WhatsAppSender']
                    ],
                    view: 'timeSeries',
                    stacked: false,
                    region: process.env.AWS_REGION || 'us-east-1',
                    title: 'Falhas por Etapa',
                    period: 300,
                    stat: 'Sum'
                }
            }
        ]
    };
    
    // Parâmetros para a criação do dashboard
    const params = {
        DashboardName: DASHBOARD_NAME,
        DashboardBody: JSON.stringify(dashboardBody)
    };
    
    try {
        // Criar ou atualizar o dashboard
        const result = await cloudWatch.putDashboard(params).promise();
        console.log('Dashboard criado com sucesso!');
        console.log(result);
        
        // Salvar localmente a definição do dashboard
        fs.writeFileSync(
            path.join(__dirname, 'dashboard-definition.json'),
            JSON.stringify(dashboardBody, null, 2)
        );
        console.log('Definição do dashboard salva localmente em dashboard-definition.json');
        
        return {
            status: 'success',
            dashboardName: DASHBOARD_NAME,
            region: process.env.AWS_REGION || 'us-east-1',
            url: `https://${process.env.AWS_REGION || 'us-east-1'}.console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || 'us-east-1'}#dashboards:name=${DASHBOARD_NAME}`
        };
    } catch (error) {
        console.error('Erro ao criar dashboard:', error);
        return {
            status: 'error',
            error: error.message
        };
    }
}

// Se executado diretamente (não importado como módulo)
if (require.main === module) {
    createDashboard()
        .then(result => {
            if (result.status === 'success') {
                console.log(`Dashboard criado com sucesso! Acesse: ${result.url}`);
            } else {
                console.error('Falha ao criar dashboard:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Erro não tratado:', error);
            process.exit(1);
        });
}

// Exportar para uso como módulo
module.exports = { createDashboard }; 