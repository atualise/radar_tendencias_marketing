const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do corpo dos logs
console.log('==========================================');
console.log('Iniciando servidor admin com conexão à AWS');
console.log('==========================================');

// Verificar arquivos necessários
const htmlPath = path.join(__dirname, 'admin-server.html');
if (!fs.existsSync(htmlPath)) {
  console.error(`❌ ERRO CRÍTICO: Arquivo HTML principal não encontrado em: ${htmlPath}`);
  console.log('Criando arquivo HTML padrão...');
  
  // Criar arquivo HTML básico se não existir
  const htmlContent = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Radar de Tendências - Admin</title>
  
  <!-- jQuery primeiro! -->
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  
  <!-- Bootstrap CSS e JS -->
  <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
  <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js"></script>
  <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
  
  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
</head>
<body>
  <nav class="navbar navbar-dark bg-primary">
    <div class="container">
      <a class="navbar-brand" href="#">
        <i class="fas fa-chart-line"></i> Radar de Tendências - Painel Administrativo
      </a>
    </div>
  </nav>
  
  <div class="container mt-4">
    <div class="alert alert-info">
      <h4><i class="fas fa-cog fa-spin"></i> Carregando painel administrativo...</h4>
      <p>Se esta mensagem persistir, verifique as configurações do servidor.</p>
    </div>
    
    <div id="api-status"></div>
  </div>

  <script>
    $(document).ready(function() {
      // Verificar conexão com API
      $.ajax({
        url: '/api/health',
        method: 'GET',
        success: function(data) {
          $('#api-status').html('<div class="alert alert-success"><h4>API conectada!</h4><pre>' + JSON.stringify(data, null, 2) + '</pre></div>');
        },
        error: function(err) {
          $('#api-status').html('<div class="alert alert-danger"><h4>Erro ao conectar com a API</h4><p>Detalhes: ' + JSON.stringify(err) + '</p></div>');
        }
      });
    });
  </script>
</body>
</html>
  `;
  
  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`✅ Arquivo HTML padrão criado em: ${htmlPath}`);
}

// Configuração AWS
const awsRegion = process.env.AWS_REGION || 'us-east-1';
console.log(`Região AWS configurada: ${awsRegion}`);

// Configuração DynamoDB
const dynamoConfig = {
  region: awsRegion,
  maxRetries: 3,
  httpOptions: { timeout: 5000 }
};

// Inicializar AWS SDK
AWS.config.update(dynamoConfig);
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Nomes das tabelas em produção
const USUARIOS_TABLE = process.env.USUARIOS_TABLE || 'usuarios';
const CONTEUDOS_TABLE = process.env.CONTEUDOS_TABLE || 'conteudos';

console.log(`Tabela de usuários: ${USUARIOS_TABLE}`);
console.log(`Tabela de conteúdos: ${CONTEUDOS_TABLE}`);

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// IMPORTANTE: Rota raiz para servir o HTML principal
app.get('/', (req, res) => {
  console.log('Servindo página principal...');
  res.sendFile(htmlPath);
});

// Endpoint de saúde para testar a API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'admin-server',
    mode: 'production-connection',
    region: dynamoConfig.region,
    tabelas: {
      usuarios: USUARIOS_TABLE,
      conteudos: CONTEUDOS_TABLE
    }
  });
});

// Rotas da API para usuários e conteúdos
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log(`Solicitação recebida para listar usuários da tabela ${USUARIOS_TABLE}`);
    
    // Acesso ao DynamoDB em produção
    const params = {
      TableName: USUARIOS_TABLE,
      Limit: 1000
    };
    
    let result;
    try {
      result = await dynamoDB.scan(params).promise();
    } catch (error) {
      console.error('Erro ao acessar o DynamoDB:', error);
      res.status(500).json({ error: 'Erro ao acessar o DynamoDB' });
      return;
    }

    res.json(result.Items);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
}); 