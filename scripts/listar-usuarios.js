const AWS = require('aws-sdk');

// Configuração da AWS
const AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

// Inicializar o cliente DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const cloudformation = new AWS.CloudFormation();

async function getTableName() {
    try {
        // Obter o nome da tabela do stack CloudFormation
        const stackData = await cloudformation.describeStacks({
            StackName: 'antena-app'
        }).promise();
        
        // Procurar pelo recurso da tabela de usuários
        const outputs = stackData.Stacks[0].Outputs;
        const tableOutput = outputs.find(output => 
            output.OutputKey === 'UsersTableName' || 
            output.OutputKey.includes('UsersTable')
        );
        
        if (tableOutput) {
            return tableOutput.OutputValue;
        } else {
            // Tentativa alternativa de buscar recursos diretamente
            const resources = await cloudformation.listStackResources({
                StackName: 'antena-app'
            }).promise();
            
            const tableResource = resources.StackResourceSummaries.find(
                resource => resource.LogicalResourceId.includes('UsersTable')
            );
            
            if (tableResource) {
                return tableResource.PhysicalResourceId;
            } else {
                throw new Error('Não foi possível encontrar a tabela de usuários');
            }
        }
    } catch (error) {
        console.error(`Erro ao obter nome da tabela: ${error.message}`);
        // Se falhar, tente outro método ou use um valor padrão
        return prompt('Digite o nome da tabela de usuários (ex: antena-app-UsersTable-XXX): ');
    }
}

function prompt(question) {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        readline.question(question, answer => {
            readline.close();
            resolve(answer);
        });
    });
}

async function listarUsuarios() {
    try {
        console.log('\n\x1b[34m=== LISTAGEM DE USUÁRIOS CADASTRADOS ===\x1b[0m\n');
        
        // Obter o nome da tabela
        const tableName = await getTableName();
        console.log(`\x1b[33mBuscando dados da tabela: ${tableName}\x1b[0m\n`);
        
        // Parâmetros para escanear a tabela
        const params = {
            TableName: tableName
        };
        
        // Executar scan para obter todos os itens
        const result = await dynamoDB.scan(params).promise();
        
        if (result.Items && result.Items.length > 0) {
            console.log(`\x1b[32mTotal de usuários cadastrados: ${result.Items.length}\x1b[0m\n`);
            
            // Exibir cada usuário formatado
            result.Items.forEach((user, index) => {
                console.log(`\x1b[1m[Usuário ${index + 1}]\x1b[0m`);
                console.log(`ID: ${user.id || 'N/A'}`);
                console.log(`Nome: ${user.name || 'N/A'}`);
                console.log(`Telefone: ${user.phone || 'N/A'}`);
                console.log(`Email: ${user.email || 'N/A'}`);
                console.log(`Função: ${user.role || 'N/A'}`);
                console.log(`Status: ${user.status || 'Ativo'}`);
                console.log(`Data de Cadastro: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}`);
                console.log(`Última Atualização: ${user.updatedAt ? new Date(user.updatedAt).toLocaleString() : 'N/A'}`);
                console.log('-'.repeat(40));
            });
        } else {
            console.log('\x1b[33mNenhum usuário cadastrado encontrado.\x1b[0m');
        }
        
    } catch (error) {
        console.error(`\x1b[31mErro ao listar usuários: ${error.message}\x1b[0m`);
        
        if (error.code === 'ResourceNotFoundException') {
            console.log('\x1b[33mA tabela especificada não foi encontrada. Verifique o nome da tabela.\x1b[0m');
        } else if (error.code === 'ValidationException') {
            console.log('\x1b[33mErro de validação. Verifique os parâmetros da consulta.\x1b[0m');
        } else if (error.code === 'AccessDeniedException') {
            console.log('\x1b[33mPermissão negada. Verifique suas credenciais AWS.\x1b[0m');
        }
    }
}

// Executar a função principal
listarUsuarios(); 