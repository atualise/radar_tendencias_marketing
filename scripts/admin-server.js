const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const path = require('path');
const bodyParser = require('body-parser');

// Inicializar o express
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Configuração da AWS
const AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

// Inicializar o cliente DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const cloudformation = new AWS.CloudFormation();

// Rota para obter o nome da tabela do stack CloudFormation
app.get('/api/table-name', async (req, res) => {
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
            res.json({ tableName: tableOutput.OutputValue });
        } else {
            // Tentativa alternativa de buscar recursos diretamente
            const resources = await cloudformation.listStackResources({
                StackName: 'antena-app'
            }).promise();
            
            const tableResource = resources.StackResourceSummaries.find(
                resource => resource.LogicalResourceId.includes('UsersTable')
            );
            
            if (tableResource) {
                res.json({ tableName: tableResource.PhysicalResourceId });
            } else {
                res.status(404).json({ error: 'Não foi possível encontrar a tabela de usuários' });
            }
        }
    } catch (error) {
        console.error(`Erro ao obter nome da tabela: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Rota para buscar usuários
app.get('/api/users', async (req, res) => {
    try {
        const tableName = req.query.tableName;
        
        if (!tableName) {
            return res.status(400).json({ error: 'Nome da tabela não informado' });
        }
        
        // Parâmetros para escanear a tabela
        const params = {
            TableName: tableName
        };
        
        // Executar scan para obter todos os itens
        const result = await dynamoDB.scan(params).promise();
        
        if (result.Items && result.Items.length > 0) {
            res.json({
                total: result.Items.length,
                active: result.Items.filter(user => user.status !== 'inactive').length,
                users: result.Items
            });
        } else {
            res.json({
                total: 0,
                active: 0,
                users: []
            });
        }
    } catch (error) {
        console.error(`Erro ao listar usuários: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-server.html'));
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`\n\x1b[32m=== SERVIDOR ADMIN INICIADO ===\x1b[0m\n`);
    console.log(`\x1b[33mAcesse a página admin em:\x1b[0m \x1b[36mhttp://localhost:${PORT}\x1b[0m\n`);
    console.log('Pressione Ctrl+C para encerrar o servidor');
}); 