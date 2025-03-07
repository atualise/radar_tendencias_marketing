# Templates do WhatsApp Business API

## Problema

O WhatsApp Business API tem restrições quanto ao envio de mensagens iniciais para usuários. Não é possível enviar mensagens diretamente a usuários que ainda não interagiram com seu número de WhatsApp Business, a menos que:

1. O usuário tenha iniciado a conversa voluntariamente
2. Você utilize templates pré-aprovados pelo WhatsApp/Meta

Para contornar essa limitação e garantir que novos usuários recebam mensagens de boas-vindas e início de onboarding, implementamos um sistema que utiliza templates do WhatsApp Business API.

## O que foi implementado

1. **Scripts para gerenciar templates**:
   - `scripts/whatsapp-templates.js`: Script Node.js para criar e gerenciar templates
   - `scripts/atualizar-templates-whatsapp.sh`: Script shell para facilitar a execução

2. **Modificações nas funções Lambda**:
   - `src/whatsapp-sender/index.js`: Adicionado suporte para envio de mensagens via templates
   - `src/processador-leads/index.js`: Modificada a função de boas-vindas para usar template
   - `src/orquestrador/index.js`: Modificadas as funções de onboarding para usar templates

3. **Templates criados**:
   - `boas_vindas_antena`: Template inicial enviado logo após o cadastro
   - `onboarding_inicio_antena`: Template para iniciar o processo de onboarding
   - `finalizacao_onboarding_antena`: Template para finalizar o onboarding

## Como utilizar

### 1. Configuração inicial

Antes de executar o script, certifique-se de que seu arquivo `.env` contém as seguintes variáveis:

```
WHATSAPP_API_TOKEN=seu_token_aqui
WHATSAPP_API_URL=https://graph.facebook.com/v17.0/
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id
```

### 2. Executar o script de atualização de templates

```bash
./scripts/atualizar-templates-whatsapp.sh
```

Este script irá:
- Verificar as dependências necessárias (Node.js e axios)
- Listar os templates existentes
- Criar novos templates conforme necessário

### 3. Verificar status dos templates

Os templates devem ser aprovados pela Meta/WhatsApp antes de serem utilizados. Você pode verificar o status dos templates no painel do Meta Business ou executando o script com a opção de listar templates.

```bash
node scripts/whatsapp-templates.js list
```

### 4. Utilizar templates em seu código

Para enviar mensagens utilizando templates, use o seguinte formato:

```javascript
// Envio simples (apenas o nome do template)
await lambda.invoke({
    FunctionName: WHATSAPP_SENDER_LAMBDA,
    InvocationType: 'Event',
    Payload: JSON.stringify({
        phoneNumber: "5511999999999",
        template: "nome_do_template",
        metadata: { /* seus metadados */ }
    })
}).promise();

// Envio com parâmetros
await lambda.invoke({
    FunctionName: WHATSAPP_SENDER_LAMBDA,
    InvocationType: 'Event',
    Payload: JSON.stringify({
        phoneNumber: "5511999999999",
        template: {
            name: "nome_do_template",
            language: {
                code: "pt_BR"
            },
            components: [
                {
                    type: "body",
                    parameters: [
                        {
                            type: "text",
                            text: "Texto dinâmico"
                        }
                    ]
                }
            ]
        },
        metadata: { /* seus metadados */ }
    })
}).promise();
```