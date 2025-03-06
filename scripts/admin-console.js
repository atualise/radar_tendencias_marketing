          border: 2px dashed #007bff;
        }
        
        .kanban-card-dragging {
          opacity: 0.5;
          border: 2px solid #007bff;
        }
        
        .kanban-card {
          transition: all 0.2s ease;
        }
        
        .kanban-card:hover {
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        
        .kanban-card .fa-phone-alt {
          color: #28a745;
        }
      </style>
      `;
      
      // Adicionar estilos extras ao cabeçalho
      $('head').append(extraStyles);
      
      // Verificar servidor ativo
      $.ajax({
        url: '/api/health',
        method: 'GET',
        timeout: 5000,
        success: function(data) {
          console.log('Servidor respondendo:', JSON.stringify(data));
          initializeApp();
        },
        error: function(xhr, status, error) {
          console.error('Servidor não está respondendo corretamente', { xhr: xhr.status, status, error });
          $('body').append(\`
            <div class="container">
              <div class="alert alert-danger mt-4">
                <h4><i class="fas fa-exclamation-triangle"></i> Erro de Comunicação com o Servidor</h4>
                <p>Não foi possível conectar à API. Verifique se o servidor está em execução.</p>
                <p>Detalhes: \${error || status}</p>
                <button class="btn btn-primary" onclick="location.reload()">Tentar Novamente</button>
              </div>
            </div>
          \`);
        }
      });
      
      function initializeApp() {
        // Carregar dados iniciais
        loadUsuarios();
        
        // Registrar eventos para as abas
        $('#conteudos-tab').on('click', function() {
          if (!window.conteudosLoaded) {
            loadConteudos();
            window.conteudosLoaded = true;
          }
        });
        
        $('#dashboards-tab').on('click', function() {
          if (!window.dashboardsLoaded) {
            loadDashboards();
            window.dashboardsLoaded = true;
          }
        });
        
        $('#kanban-tab').on('click', function() {
          if (!window.kanbanLoaded) {
            loadKanban();
            window.kanbanLoaded = true;
          }
        });
        
        // Botões de atualização
        $('#refreshUsuarios').on('click', loadUsuarios);
        $('#refreshConteudos').on('click', loadConteudos);
        $('#refreshDashboards').on('click', loadDashboards);
        $('#refreshKanban').on('click', loadKanban);
        
        // Eventos para ver detalhes de usuários
        $(document).on('click', '.viewUserDetails', function() {
          const index = parseInt($(this).data('index'));
          console.log('Clique em Ver Detalhes do usuário índice: ' + index);
          
          if (!window.usuariosData || !window.usuariosData.usuarios) {
            console.error('Dados de usuários não disponíveis');
            alert('Erro: Dados de usuários não disponíveis. Tente recarregar a página.');
            return;
          }
          
          const usuario = window.usuariosData.usuarios[index];
          if (!usuario) {
            console.error('Usuário não encontrado');
            return;
          }
          
          // Formatar os dados do usuário para exibição
          let detailsHtml = '<div class="container-fluid">';
          detailsHtml += '<h5>Dados do Usuário</h5>';
          detailsHtml += '<div class="table-responsive"><table class="table table-bordered table-striped">';
          
          // Iterar sobre todas as propriedades do usuário
          Object.keys(usuario).forEach(key => {
            let value = usuario[key];
            
            // Formatar datas
            if (key.toLowerCase().includes('data') || key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt') {
              if (value && !isNaN(new Date(value).getTime())) {
                value = new Date(value).toLocaleString('pt-BR');
              }
            }
            
            // Formatar valores booleanos
            if (typeof value === 'boolean') {
              value = value ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-danger">Não</span>';
            }
            
            // Formatar objetos e arrays
            if (typeof value === 'object' && value !== null) {
              value = '<pre class="mb-0" style="max-height: 100px; overflow-y: auto;">' + JSON.stringify(value, null, 2) + '</pre>';
            }
            
            detailsHtml += '<tr><th width="30%">' + key + '</th><td>' + value + '</td></tr>';
          });
          
          detailsHtml += '</table></div>';
          detailsHtml += '</div>';
          
          $('#modalTitle').html('<i class="fas fa-user-circle"></i> Detalhes do Usuário: ' + (usuario.nome || usuario.name || 'Sem nome'));
          $('#modalBody').html(detailsHtml);
          $('#detailsModal').modal('show');
        });
        
        // Eventos para ver detalhes de conteúdos
        $(document).on('click', '.viewConteudoDetails', function() {
          const index = parseInt($(this).data('index'));
          
          if (!window.conteudosData || !window.conteudosData.conteudos) {
            console.error('Dados de conteúdos não disponíveis');
            alert('Erro: Dados de conteúdos não disponíveis. Tente recarregar a página.');
            return;
          }
          
          const conteudo = window.conteudosData.conteudos[index];
          if (!conteudo) {
            console.error('Conteúdo não encontrado');
            return;
          }
          
          // Formatar os dados do conteúdo para exibição
          let detailsHtml = '<div class="container-fluid">';
          detailsHtml += '<h5>Dados do Conteúdo</h5>';
          detailsHtml += '<div class="table-responsive"><table class="table table-bordered table-striped">';
          
          // Iterar sobre todas as propriedades do conteúdo
          Object.keys(conteudo).forEach(key => {
            let value = conteudo[key];
            
            // Formatar datas
            if (key.toLowerCase().includes('data') || key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt' || key === 'timestamp') {
              if (value && !isNaN(new Date(value).getTime())) {
                value = new Date(value).toLocaleString('pt-BR');
              }
            }
            
            // Formatar objetos e arrays
            if (typeof value === 'object' && value !== null) {
              value = '<pre class="mb-0" style="max-height: 150px; overflow-y: auto;">' + JSON.stringify(value, null, 2) + '</pre>';
            }
            
            detailsHtml += '<tr><th width="30%">' + key + '</th><td>' + value + '</td></tr>';
          });
          
          detailsHtml += '</table></div>';
          detailsHtml += '</div>';
          
          $('#modalTitle').html('<i class="fas fa-file-alt"></i> Detalhes do Conteúdo');
          $('#modalBody').html(detailsHtml);
          $('#detailsModal').modal('show');
        });
        
        // Evento para remover usuário
        $(document).on('click', '.removeUser', function() {
          const index = parseInt($(this).data('index'));
          const usuarioId = $(this).data('id');
          const nome = $(this).data('nome');
          
          if (!usuarioId) {
            alert('Erro: ID do usuário não encontrado.');
            return;
          }
          
          if (confirm('Tem certeza que deseja remover o usuário "' + nome + '"?\nEsta ação não pode ser desfeita.')) {
            $.ajax({
              url: '/api/usuarios/' + usuarioId,
              method: 'DELETE',
              success: function(data) {
                alert('Usuário removido com sucesso!');
                loadUsuarios(); // Recarregar tabela
                if (window.kanbanLoaded) {
                  loadKanban(); // Atualizar Kanban se estiver carregado
                }
              },
              error: function(err) {
                alert('Erro ao remover usuário: ' + (err.responseJSON?.error || err.statusText || 'Erro desconhecido'));
              }
            });
          }
        });
      }
    });
 * SERVIDOR ADMIN COMPLETO
 * 
 * Este arquivo contém tudo necessário para executar o painel administrativo
 * localmente, conectando-se ao DynamoDB de produção.
 * 
 * Uso: node admin-console.js [PORTA]
 */

const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const PORT = process.env.PORT || parseInt(process.argv[2]) || 3001;

// ===== VERIFICAÇÃO DE PORTA =====

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
}

// ===== CONFIGURAÇÕES DO SERVIDOR =====

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Configurações para AWS
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const USUARIOS_TABLE = process?.env?.USUARIOS_TABLE || 'antena-app-Users-prod';
const CONTEUDOS_TABLE = process?.env?.CONTEUDOS_TABLE || 'antena-app-Contents-prod';

// Configuração DynamoDB
const dynamoConfig = {
  region: awsRegion,
  maxRetries: 3,
  httpOptions: { timeout: 5000 }
};

// Inicializar AWS SDK
AWS.config.update(dynamoConfig);
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// ===== PÁGINA HTML PRINCIPAL =====

const HTML_CONTEUDO = `<!DOCTYPE html>
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
  
  <style>
    .card-header {
      font-weight: bold;
    }
    .status-ativo {
      color: green;
      font-weight: bold;
    }
    .status-inativo {
      color: red;
    }
    
    /* Estilos para o Kanban */
    .kanban-column {
      margin-bottom: 20px;
    }
    
    .kanban-cards {
      min-height: 300px;
      max-height: 600px;
      overflow-y: auto;
    }
    
    .kanban-card {
      margin-bottom: 10px;
      cursor: pointer;
      border-left: 4px solid #6c757d;
    }
    
    .kanban-card-novo {
      border-left-color: #17a2b8;
    }
    
    .kanban-card-onboarding {
      border-left-color: #ffc107;
    }
    
    .kanban-card-ativo {
      border-left-color: #28a745;
    }
    
    .kanban-card-inativo {
      border-left-color: #6c757d;
    }
    
    .kanban-card-dragging {
      opacity: 0.5;
    }
    
    .kanban-card-header {
      padding: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .kanban-card-body {
      padding: 8px;
      font-size: 12px;
    }
    
    .kanban-card-footer {
      padding: 5px 8px;
      background-color: #f8f9fa;
      font-size: 11px;
      color: #6c757d;
      display: flex;
      justify-content: space-between;
    }
    
    .kanban-card .dropdown-menu {
      min-width: 150px;
    }
  </style>
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
    <!-- Tabs para navegação -->
    <ul class="nav nav-tabs" id="adminTabs" role="tablist">
      <li class="nav-item">
        <a class="nav-link active" id="usuarios-tab" data-toggle="tab" href="#usuarios" role="tab">Usuários</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" id="conteudos-tab" data-toggle="tab" href="#conteudos" role="tab">Conteúdos Gerados</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" id="kanban-tab" data-toggle="tab" href="#kanban" role="tab">Kanban de Jornada</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" id="dashboards-tab" data-toggle="tab" href="#dashboards" role="tab">Dashboards AWS</a>
      </li>
    </ul>
    
    <!-- Conteúdo das tabs -->
    <div class="tab-content" id="adminTabsContent">
      <!-- Tab de Usuários -->
      <div class="tab-pane fade show active" id="usuarios" role="tabpanel">
        <div class="card mt-3">
          <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Usuários Registrados</h5>
            <button class="btn btn-sm btn-light" id="refreshUsuarios">Atualizar Dados</button>
          </div>
          <div class="card-body">
            <div id="userStats" class="mb-3">
              <div class="alert alert-info">Carregando estatísticas...</div>
            </div>
            <div class="table-responsive">
              <table class="table table-striped table-bordered" id="usuariosTable">
                <thead class="thead-dark">
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th>Data Cadastro</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody id="usuariosTableBody">
                  <tr>
                    <td colspan="5" class="text-center">Carregando usuários...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Tab de Conteúdos -->
      <div class="tab-pane fade" id="conteudos" role="tabpanel">
        <div class="card mt-3">
          <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Conteúdos Gerados</h5>
            <button class="btn btn-sm btn-light" id="refreshConteudos">Atualizar Dados</button>
          </div>
          <div class="card-body">
            <div id="conteudosStats" class="mb-3">
              <div class="alert alert-info">Carregando estatísticas...</div>
            </div>
            <div class="table-responsive">
              <table class="table table-striped table-bordered" id="conteudosTable">
                <thead class="thead-dark">
                  <tr>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Usuário</th>
                    <th>Data Criação</th>
                    <th>Conteúdo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody id="conteudosTableBody">
                  <tr>
                    <td colspan="6" class="text-center">Carregando conteúdos...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Tab de Kanban -->
      <div class="tab-pane fade" id="kanban" role="tabpanel">
        <div class="card mt-3">
          <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Kanban de Jornada do Usuário</h5>
            <button class="btn btn-sm btn-light" id="refreshKanban">
              <i class="fas fa-sync-alt"></i> Atualizar
            </button>
          </div>
          <div class="card-body">
            <!-- Filtro e legenda -->
            <div class="row mb-3">
              <div class="col-md-6">
                <div class="input-group">
                  <input type="text" class="form-control" placeholder="Filtrar usuários..." id="kanbanFilter">
                  <div class="input-group-append">
                    <button class="btn btn-outline-secondary" type="button" id="applyFilter">
                      <i class="fas fa-search"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div class="col-md-6 text-right">
                <span class="badge badge-primary">Total: <span id="kanbanTotalUsuarios">0</span></span>
              </div>
            </div>
            
            <!-- Quadro Kanban -->
            <div class="kanban-board">
              <div class="row">
                <!-- Coluna: Novo -->
                <div class="col-md-3 kanban-column">
                  <div class="card">
                    <div class="card-header bg-info text-white">
                      Novos <span class="badge badge-light" id="count-novos">0</span>
                    </div>
                    <div class="card-body kanban-cards" id="kanban-novos">
                      <div class="text-center text-muted">
                        <i class="fas fa-spinner fa-spin"></i> Carregando...
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Coluna: Em Onboarding -->
                <div class="col-md-3 kanban-column">
                  <div class="card">
                    <div class="card-header bg-warning text-white">
                      Em Onboarding <span class="badge badge-light" id="count-onboarding">0</span>
                    </div>
                    <div class="card-body kanban-cards" id="kanban-onboarding">
                      <div class="text-center text-muted">
                        <i class="fas fa-spinner fa-spin"></i> Carregando...
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Coluna: Ativos -->
                <div class="col-md-3 kanban-column">
                  <div class="card">
                    <div class="card-header bg-success text-white">
                      Ativos <span class="badge badge-light" id="count-ativos">0</span>
                    </div>
                    <div class="card-body kanban-cards" id="kanban-ativos">
                      <div class="text-center text-muted">
                        <i class="fas fa-spinner fa-spin"></i> Carregando...
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Coluna: Inativos -->
                <div class="col-md-3 kanban-column">
                  <div class="card">
                    <div class="card-header bg-secondary text-white">
                      Inativos <span class="badge badge-light" id="count-inativos">0</span>
                    </div>
                    <div class="card-body kanban-cards" id="kanban-inativos">
                      <div class="text-center text-muted">
                        <i class="fas fa-spinner fa-spin"></i> Carregando...
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Tab de Dashboards -->
      <div class="tab-pane fade" id="dashboards" role="tabpanel">
        <div class="card mt-3">
          <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Dashboards AWS CloudWatch</h5>
            <button class="btn btn-sm btn-light" id="refreshDashboards">Atualizar Links</button>
          </div>
          <div class="card-body">
            <div class="list-group" id="dashboardsList">
              <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                  <span class="sr-only">Carregando...</span>
                </div>
                <p>Carregando dashboards...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal para detalhes -->
  <div class="modal fade" id="detailsModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="modalTitle">Detalhes</h5>
          <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body" id="modalBody">
          <!-- Conteúdo dinâmico aqui -->
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Script principal -->
  <script>
    $(document).ready(function() {
      console.log('jQuery carregado corretamente! Versão:', $.fn.jquery);
      
      // Funções para carregar dados
      function loadUsuarios() {
        $('#usuariosTableBody').html('<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando usuários...</td></tr>');
        $('#userStats').html('<div class="alert alert-info"><i class="fas fa-spinner fa-spin"></i> Carregando estatísticas...</div>');
        
        $.ajax({
          url: '/api/usuarios',
          method: 'GET',
          timeout: 30000,
          success: function(data) {
            // Armazenar os dados para referência posterior
            window.usuariosData = data;
            
            // Atualizar estatísticas
            $('#userStats').html(\`
              <div class="alert alert-success">
                <div class="row">
                  <div class="col-md-3">
                    <strong>Total de Usuários:</strong> \${data.count || 0}
                  </div>
                  <div class="col-md-3">
                    <strong>Usuários Ativos:</strong> \${data.ativos || 0}
                  </div>
                  <div class="col-md-6">
                    <strong>Tabela DynamoDB:</strong> \${data.table} (\${data.region})
                  </div>
                </div>
              </div>
            \`);
            
            // Limpar tabela
            $('#usuariosTableBody').empty();
            
            // Verificar se temos usuários
            if (!data.usuarios || data.usuarios.length === 0) {
              $('#usuariosTableBody').html('<tr><td colspan="5" class="text-center">Nenhum usuário encontrado</td></tr>');
              return;
            }
            
            // Preencher tabela com usuários
            data.usuarios.forEach(function(usuario, index) {
              const dataFormatada = new Date(usuario.dataCadastro || usuario.createdAt || Date.now()).toLocaleString('pt-BR');
              
              // Determinar o status do usuário
              let status = 'desconhecido';
              let statusClass = '';
              
              // Verificar todas as possíveis propriedades que indicam status
              if (usuario.status === 'ativo' || usuario.status === 'active' || 
                  usuario.situacao === 'ativo' || usuario.situacao === 'active' || 
                  usuario.ativo === true || usuario.active === true) {
                status = 'ativo';
                statusClass = 'status-ativo';
              } else if (usuario.status === 'inativo' || usuario.status === 'inactive' || 
                        usuario.situacao === 'inativo' || usuario.situacao === 'inactive' || 
                        usuario.ativo === false || usuario.active === false) {
                status = 'inativo';
                statusClass = 'status-inativo';
              }
              
              // Obter campos principais
              const nome = usuario.nome || usuario.name || usuario.nomeCompleto || '—';
              const telefone = usuario.telefone || usuario.whatsapp || usuario.phone || usuario.phoneNumber || '—';
              const usuarioId = usuario.id || usuario.usuarioId || '';
              
              $('#usuariosTableBody').append(\`
                <tr>
                  <td>\${nome}</td>
                  <td>\${telefone}</td>
                  <td><span class="\${statusClass}">\${status}</span></td>
                  <td>\${dataFormatada}</td>
                  <td>
                    <div class="btn-group btn-group-sm" role="group">
                      <button class="btn btn-info viewUserDetails" data-index="\${index}">
                        <i class="fas fa-eye"></i> Ver
                      </button>
                      <button class="btn btn-danger removeUser" data-index="\${index}" data-id="\${usuarioId}" data-nome="\${nome}">
                        <i class="fas fa-trash"></i> Remover
                      </button>
                    </div>
                  </td>
                </tr>
              \`);
            });
          },
          error: function(xhr, status, error) {
            const errorMsg = xhr.responseJSON?.error || error || status;
            
            $('#userStats').html(\`<div class="alert alert-danger">
              <h5><i class="fas fa-exclamation-triangle"></i> Erro ao carregar estatísticas</h5>
              <p>\${errorMsg}</p>
              <p>Status: \${status}, Código: \${xhr.status}</p>
            </div>\`);
            
            $('#usuariosTableBody').html(\`
              <tr>
                <td colspan="5" class="text-center text-danger">
                  <p><i class="fas fa-exclamation-circle"></i> Erro ao carregar usuários: \${errorMsg}</p>
                  <button class="btn btn-sm btn-primary retry-load-users">Tentar Novamente</button>
                </td>
              </tr>
            \`);
            
            $('.retry-load-users').on('click', loadUsuarios);
          }
        });
      }
      
      function loadConteudos() {
        $('#conteudosTableBody').html('<tr><td colspan="6" class="text-center">Carregando conteúdos...</td></tr>');
        $('#conteudosStats').html('<div class="alert alert-info">Carregando estatísticas...</div>');
        
        $.ajax({
          url: '/api/conteudos',
          method: 'GET',
          success: function(data) {
            // Armazenar dados para referência
            window.conteudosData = data;
            
            // Atualizar estatísticas
            $('#conteudosStats').html(\`
              <div class="alert alert-success">
                <div class="row">
                  <div class="col-md-4">
                    <strong>Total de Conteúdos:</strong> \${data.count || 0}
                  </div>
                  <div class="col-md-8">
                    <strong>Tabela DynamoDB:</strong> \${data.table} (\${data.region})
                  </div>
                </div>
              </div>
            \`);
            
            // Limpar tabela
            $('#conteudosTableBody').empty();
            
            // Verificar se temos conteúdos
            if (!data.conteudos || data.conteudos.length === 0) {
              $('#conteudosTableBody').html('<tr><td colspan="6" class="text-center">Nenhum conteúdo encontrado</td></tr>');
              return;
            }
            
            // Preencher tabela com conteúdos
            data.conteudos.forEach(function(conteudo, index) {
              const dataFormatada = new Date(conteudo.dataCriacao || conteudo.timestamp || Date.now()).toLocaleString('pt-BR');
              const conteudoTexto = conteudo.texto || conteudo.conteudo || conteudo.mensagem || JSON.stringify(conteudo);
              const previewContent = conteudoTexto.length > 100 ? conteudoTexto.substring(0, 100) + '...' : conteudoTexto;
              
              $('#conteudosTableBody').append(\`
                <tr>
                  <td>\${conteudo.id || conteudo.conteudoId || '—'}</td>
                  <td>\${conteudo.tipo || conteudo.tipoConteudo || '—'}</td>
                  <td>\${conteudo.usuarioId || conteudo.telefone || '—'}</td>
                  <td>\${dataFormatada}</td>
                  <td>\${previewContent}</td>
                  <td>
                    <button class="btn btn-sm btn-info viewConteudoDetails" data-index="\${index}">
                      <i class="fas fa-eye"></i> Ver
                    </button>
                  </td>
                </tr>
              \`);
            });
          },
          error: function(err) {
            $('#conteudosStats').html(\`<div class="alert alert-danger">Erro ao carregar estatísticas: \${err.responseJSON?.error || err.statusText}</div>\`);
            $('#conteudosTableBody').html(\`<tr><td colspan="6" class="text-center text-danger">Erro ao carregar conteúdos: \${err.responseJSON?.error || err.statusText}</td></tr>\`);
          }
        });
      }
      
      function loadDashboards() {
        $('#dashboardsList').html(\`
          <div class="text-center">
            <div class="spinner-border text-primary" role="status">
              <span class="sr-only">Carregando...</span>
            </div>
            <p>Carregando dashboards...</p>
          </div>
        \`);
        
        $.ajax({
          url: '/api/dashboards',
          method: 'GET',
          success: function(data) {
            $('#dashboardsList').empty();
            
            if (!data.dashboards || data.dashboards.length === 0) {
              $('#dashboardsList').html('<div class="alert alert-warning">Nenhum dashboard encontrado no CloudWatch</div>');
              return;
            }
            
            data.dashboards.forEach(function(dashboard) {
              $('#dashboardsList').append(\`
                <a href="\${dashboard.url}" target="_blank" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                  <div>
                    <i class="fas fa-chart-line mr-2"></i>
                    \${dashboard.name}
                  </div>
                  <span class="badge badge-primary badge-pill">Abrir <i class="fas fa-external-link-alt ml-1"></i></span>
                </a>
              \`);
            });
          },
          error: function(err) {
            console.error('Erro ao carregar dashboards:', err);
            $('#dashboardsList').html(\`<div class="alert alert-danger">
              Erro ao carregar dashboards: \${err.responseJSON?.error || err.statusText || 'Erro desconhecido'}
            </div>\`);
          }
        });
      }
      
      function loadKanban() {
        // Limpar e mostrar indicador de carregamento
        ['novos', 'onboarding', 'ativos', 'inativos'].forEach(function(coluna) {
          $(\`#kanban-\${coluna}\`).html('<div class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>');
          $(\`#count-\${coluna}\`).text('0');
        });
        
        // Carregar dados dos usuários
        $.ajax({
          url: '/api/usuarios',
          method: 'GET',
          success: function(data) {
            // Armazenar dados para referência
            window.kanbanData = data;
            
            // Contar total de usuários
            $('#kanbanTotalUsuarios').text(data.count || 0);
            
            if (!data.usuarios || data.usuarios.length === 0) {
              ['novos', 'onboarding', 'ativos', 'inativos'].forEach(function(coluna) {
                $(\`#kanban-\${coluna}\`).html('<div class="text-center text-muted">Nenhum usuário encontrado</div>');
              });
              return;
            }
            
            // Agrupar usuários por estágio
            const novos = [];
            const emOnboarding = [];
            const ativos = [];
            const inativos = [];
            
            data.usuarios.forEach(function(usuario) {
              const estagio = determinarEstagioUsuario(usuario);
              
              switch(estagio) {
                case 'novo':
                  novos.push(usuario);
                  break;
                case 'onboarding':
                  emOnboarding.push(usuario);
                  break;
                case 'ativo':
                  ativos.push(usuario);
                  break;
                case 'inativo':
                  inativos.push(usuario);
                  break;
              }
            });
            
            // Atualizar contadores
            $('#count-novos').text(novos.length);
            $('#count-onboarding').text(emOnboarding.length);
            $('#count-ativos').text(ativos.length);
            $('#count-inativos').text(inativos.length);
            
            // Limpar colunas
            ['novos', 'onboarding', 'ativos', 'inativos'].forEach(function(coluna) {
              $(\`#kanban-\${coluna}\`).empty();
            });
            
            // Preencher colunas
            renderizarColuna('#kanban-novos', novos, 'novo');
            renderizarColuna('#kanban-onboarding', emOnboarding, 'onboarding');
            renderizarColuna('#kanban-ativos', ativos, 'ativo');
            renderizarColuna('#kanban-inativos', inativos, 'inativo');
          },
          error: function(err) {
            ['novos', 'onboarding', 'ativos', 'inativos'].forEach(function(coluna) {
              $(\`#kanban-\${coluna}\`).html(
                \`<div class="alert alert-danger">Erro ao carregar dados: \${err.responseJSON?.error || err.statusText || 'Erro desconhecido'}</div>\`
              );
            });
          }
        });
      }
      
      // Função para determinar o estágio do usuário
      function determinarEstagioUsuario(usuario) {
        // Verificar se tem campo de estágio explícito
        if (usuario.estagio) {
          return usuario.estagio.toLowerCase();
        }
        
        if (usuario.onboardingStatus === 'concluido' && 
            (usuario.status === 'ativo' || usuario.ativo === true)) {
          return 'ativo';
        }
        
        if (usuario.onboardingStatus === 'em_andamento' || 
            usuario.onboardingEtapa > 0) {
          return 'onboarding';
        }
        
        // Se tem data de cadastro recente (últimos 7 dias) e não tem interações, é novo
        const dataAtual = new Date();
        const dataCadastro = new Date(usuario.dataCadastro || usuario.createdAt || 0);
        const diasDesdeRegistro = Math.floor((dataAtual - dataCadastro) / (1000 * 60 * 60 * 24));
        
        if (diasDesdeRegistro <= 7 && !usuario.ultimaInteracao) {
          return 'novo';
        }
        
        // Verificar se está inativo
        if (usuario.status === 'inativo' || usuario.ativo === false) {
          return 'inativo';
        }
        
        // Verificar última interação (se não teve interação nos últimos 30 dias, está inativo)
        if (usuario.ultimaInteracao) {
          const dataUltimaInteracao = new Date(usuario.ultimaInteracao);
          const diasDesdeUltimaInteracao = Math.floor((dataAtual - dataUltimaInteracao) / (1000 * 60 * 60 * 24));
          
          if (diasDesdeUltimaInteracao > 30) {
            return 'inativo';
          }
        }
        
        // Usuário já iniciou a jornada, parece ser ativo
        if (usuario.ultimaInteracao || usuario.onboardingStatus === 'concluido') {
          return 'ativo';
        }
        
        // Se nada corresponde, consideramos como novo
        return 'novo';
      }
      
      // Função para renderizar uma coluna do Kanban
      function renderizarColuna(selector, usuarios, estagio) {
        const $coluna = $(selector);
        
        if (usuarios.length === 0) {
          $coluna.html('<div class="text-center text-muted">Nenhum usuário neste estágio</div>');
          return;
        }
        
        // Ordenar por data de cadastro (mais recente primeiro)
        usuarios.sort(function(a, b) {
          const dataA = new Date(a.dataCadastro || a.createdAt || 0);
          const dataB = new Date(b.dataCadastro || b.createdAt || 0);
          return dataB - dataA;
        });
        
        // Limpar coluna
        $coluna.empty();
        
        // Adicionar cartões para cada usuário
        usuarios.forEach(function(usuario) {
          const nome = usuario.nome || usuario.name || 'Sem nome';
          const telefone = usuario.telefone || usuario.whatsapp || 'Sem telefone';
          const dataCadastro = new Date(usuario.dataCadastro || usuario.createdAt || Date.now()).toLocaleDateString('pt-BR');
          const ultimaInteracao = usuario.ultimaInteracao 
            ? new Date(usuario.ultimaInteracao).toLocaleDateString('pt-BR')
            : 'Nenhuma';
            
          // Informação adicional baseada no estágio
          let infoAdicional = '';
          if (estagio === 'onboarding') {
            const etapa = usuario.onboardingEtapa || 0;
            infoAdicional = '<div><small>Etapa: ' + etapa + '</small></div>';
          } else if (estagio === 'ativo') {
            const numInteracoes = usuario.totalInteracoes || 0;
            infoAdicional = '<div><small>Interações: ' + numInteracoes + '</small></div>';
          }
          
          // Criar o cartão com o telefone destacado
          const card = '<div class="card kanban-card kanban-card-' + estagio + '" data-id="' + (usuario.id || usuario.usuarioId || '') + '" data-estagio="' + estagio + '" draggable="true">' +
              '<div class="kanban-card-header">' +
                '<strong>' + nome + '</strong>' +
              '</div>' +
              '<div class="kanban-card-body">' +
                '<p class="mb-1"><i class="fas fa-phone-alt"></i> <strong>' + telefone + '</strong></p>' +
                infoAdicional +
              '</div>' +
              '<div class="kanban-card-footer">' +
                '<small>Cadastro: ' + dataCadastro + '</small>' +
                '<small>Últ. interação: ' + ultimaInteracao + '</small>' +
              '</div>' +
            '</div>';
          
          $coluna.append(card);
        });
      }
      
      // Verificar servidor ativo
      $.ajax({
        url: '/api/health',
        method: 'GET',
        timeout: 5000,
        success: function(data) {
          console.log('Servidor respondendo:', JSON.stringify(data));
          initializeApp();
        },
        error: function(xhr, status, error) {
          console.error('Servidor não está respondendo corretamente', { xhr: xhr.status, status, error });
          $('body').append(\`
            <div class="container">
              <div class="alert alert-danger mt-4">
                <h4><i class="fas fa-exclamation-triangle"></i> Erro de Comunicação com o Servidor</h4>
                <p>Não foi possível conectar à API. Verifique se o servidor está em execução.</p>
                <p>Detalhes: \${error || status}</p>
                <button class="btn btn-primary" onclick="location.reload()">Tentar Novamente</button>
              </div>
            </div>
          \`);
        }
      });
      
      function initializeApp() {
        // Carregar dados iniciais
        loadUsuarios();
        
        // Registrar eventos para as abas
        $('#conteudos-tab').on('click', function() {
          if (!window.conteudosLoaded) {
            loadConteudos();
            window.conteudosLoaded = true;
          }
        });
        
        $('#dashboards-tab').on('click', function() {
          if (!window.dashboardsLoaded) {
            loadDashboards();
            window.dashboardsLoaded = true;
          }
        });
        
        $('#kanban-tab').on('click', function() {
          if (!window.kanbanLoaded) {
            loadKanban();
            window.kanbanLoaded = true;
          }
        });
        
        // Botões de atualização
        $('#refreshUsuarios').on('click', loadUsuarios);
        $('#refreshConteudos').on('click', loadConteudos);
        $('#refreshDashboards').on('click', loadDashboards);
        $('#refreshKanban').on('click', loadKanban);
        
        // Eventos para ver detalhes de usuários
        $(document).on('click', '.viewUserDetails', function() {
          const index = parseInt($(this).data('index'));
          console.log('Clique em Ver Detalhes do usuário índice: ' + index);
          
          if (!window.usuariosData || !window.usuariosData.usuarios) {
            console.error('Dados de usuários não disponíveis');
            alert('Erro: Dados de usuários não disponíveis. Tente recarregar a página.');
            return;
          }
          
          const usuario = window.usuariosData.usuarios[index];
          if (!usuario) {
            console.error('Usuário não encontrado');
            return;
          }
          
          // Formatar os dados do usuário para exibição
          let detailsHtml = '<div class="container-fluid">';
          detailsHtml += '<h5>Dados do Usuário</h5>';
          detailsHtml += '<div class="table-responsive"><table class="table table-bordered table-striped">';
          
          // Iterar sobre todas as propriedades do usuário
          Object.keys(usuario).forEach(key => {
            let value = usuario[key];
            
            // Formatar datas
            if (key.toLowerCase().includes('data') || key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt') {
              if (value && !isNaN(new Date(value).getTime())) {
                value = new Date(value).toLocaleString('pt-BR');
              }
            }
            
            // Formatar valores booleanos
            if (typeof value === 'boolean') {
              value = value ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-danger">Não</span>';
            }
            
            // Formatar objetos e arrays
            if (typeof value === 'object' && value !== null) {
              value = '<pre class="mb-0" style="max-height: 100px; overflow-y: auto;">' + JSON.stringify(value, null, 2) + '</pre>';
            }
            
            detailsHtml += '<tr><th width="30%">' + key + '</th><td>' + value + '</td></tr>';
          });
          
          detailsHtml += '</table></div>';
          detailsHtml += '</div>';
          
          $('#modalTitle').html('<i class="fas fa-user-circle"></i> Detalhes do Usuário: ' + (usuario.nome || usuario.name || 'Sem nome'));
          $('#modalBody').html(detailsHtml);
          $('#detailsModal').modal('show');
        });
        
        // Eventos para ver detalhes de conteúdos
        $(document).on('click', '.viewConteudoDetails', function() {
          const index = parseInt($(this).data('index'));
          
          if (!window.conteudosData || !window.conteudosData.conteudos) {
            console.error('Dados de conteúdos não disponíveis');
            alert('Erro: Dados de conteúdos não disponíveis. Tente recarregar a página.');
            return;
          }
          
          const conteudo = window.conteudosData.conteudos[index];
          if (!conteudo) {
            console.error('Conteúdo não encontrado');
            return;
          }
          
          // Formatar os dados do conteúdo para exibição
          let detailsHtml = '<div class="container-fluid">';
          detailsHtml += '<h5>Dados do Conteúdo</h5>';
          detailsHtml += '<div class="table-responsive"><table class="table table-bordered table-striped">';
          
          // Iterar sobre todas as propriedades do conteúdo
          Object.keys(conteudo).forEach(key => {
            let value = conteudo[key];
            
            // Formatar datas
            if (key.toLowerCase().includes('data') || key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt' || key === 'timestamp') {
              if (value && !isNaN(new Date(value).getTime())) {
                value = new Date(value).toLocaleString('pt-BR');
              }
            }
            
            // Formatar objetos e arrays
            if (typeof value === 'object' && value !== null) {
              value = '<pre class="mb-0" style="max-height: 150px; overflow-y: auto;">' + JSON.stringify(value, null, 2) + '</pre>';
            }
            
            detailsHtml += '<tr><th width="30%">' + key + '</th><td>' + value + '</td></tr>';
          });
          
          detailsHtml += '</table></div>';
          detailsHtml += '</div>';
          
          $('#modalTitle').html('<i class="fas fa-file-alt"></i> Detalhes do Conteúdo');
          $('#modalBody').html(detailsHtml);
          $('#detailsModal').modal('show');
        });
        
        // Evento para remover usuário
        $(document).on('click', '.removeUser', function() {
          const index = parseInt($(this).data('index'));
          const usuarioId = $(this).data('id');
          const nome = $(this).data('nome');
          
          if (!usuarioId) {
            alert('Erro: ID do usuário não encontrado.');
            return;
          }
          
          if (confirm('Tem certeza que deseja remover o usuário "' + nome + '"?\nEsta ação não pode ser desfeita.')) {
            $.ajax({
              url: '/api/usuarios/' + usuarioId,
              method: 'DELETE',
              success: function(data) {
                alert('Usuário removido com sucesso!');
                loadUsuarios(); // Recarregar tabela
                if (window.kanbanLoaded) {
                  loadKanban(); // Atualizar Kanban se estiver carregado
                }
              },
              error: function(err) {
                alert('Erro ao remover usuário: ' + (err.responseJSON?.error || err.statusText || 'Erro desconhecido'));
              }
            });
          }
        });
        
        // Inicializar drag and drop para o Kanban
        function initDragAndDrop() {
          console.log('Inicializando drag and drop para kanban...');
          
          // Adicionar eventos de drag aos cards
          $('.kanban-card').each(function() {
            this.addEventListener('dragstart', handleDragStart, false);
            this.addEventListener('dragend', handleDragEnd, false);
          });
          
          // Adicionar eventos às colunas para receber os cards
          $('.kanban-cards').each(function() {
            this.addEventListener('dragover', handleDragOver, false);
            this.addEventListener('dragenter', handleDragEnter, false);
            this.addEventListener('dragleave', handleDragLeave, false);
            this.addEventListener('drop', handleDrop, false);
          });
        }
        
        function handleDragStart(e) {
          $(this).addClass('kanban-card-dragging');
          
          // Armazenar dados do card arrastado
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text', JSON.stringify({
            id: $(this).data('id'),
            estagio: $(this).data('estagio')
          }));
        }
        
        function handleDragEnd() {
          $(this).removeClass('kanban-card-dragging');
        }
        
        function handleDragOver(e) {
          if (e.preventDefault) {
            e.preventDefault();
          }
          e.dataTransfer.dropEffect = 'move';
          return false;
        }
        
        function handleDragEnter() {
          $(this).addClass('kanban-column-highlight');
        }
        
        function handleDragLeave() {
          $(this).removeClass('kanban-column-highlight');
        }
        
        function handleDrop(e) {
          if (e.stopPropagation) {
            e.stopPropagation();
          }
          
          // Remover destaques
          $(this).removeClass('kanban-column-highlight');
          
          // Obter dados do card arrastado
          let cardData;
          try {
            cardData = JSON.parse(e.dataTransfer.getData('text'));
          } catch (err) {
            console.error('Erro ao obter dados do card:', err);
            return false;
          }
          
          const usuarioId = cardData.id;
          const estagioOrigem = cardData.estagio;
          
          // Determinar o novo estágio com base na coluna de destino
          const colId = $(this).attr('id');
          let novoEstagio;
          
          if (colId === 'kanban-novos') novoEstagio = 'novo';
          else if (colId === 'kanban-onboarding') novoEstagio = 'onboarding';
          else if (colId === 'kanban-ativos') novoEstagio = 'ativo';
          else if (colId === 'kanban-inativos') novoEstagio = 'inativo';
          else {
            console.error('Coluna desconhecida:', colId);
            return false;
          }
          
          // Não fazer nada se o estágio for o mesmo
          if (estagioOrigem === novoEstagio) {
            console.log('Mesmo estágio, nenhuma alteração necessária');
            return false;
          }
          
          console.log('Movendo usuário', usuarioId, 'para estágio:', novoEstagio);
          
          // Chamar API para atualizar o estágio
          $.ajax({
            url: '/api/usuarios/' + usuarioId + '/estagio',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ estagio: novoEstagio }),
            success: function() {
              console.log('Estágio atualizado com sucesso!');
              // Recarregar o kanban para refletir as mudanças
              loadKanban();
            },
            error: function(xhr, status, error) {
              console.error('Erro ao atualizar estágio:', error);
              alert('Erro ao mover o usuário: ' + (xhr.responseJSON?.error || error));
              // Recarregar o kanban para restaurar estado original
              loadKanban();
            }
          });
          
          return false;
        }
      }
    });
  </script>
</body>
</html>`;

// ===== ENDPOINTS DA API =====

// Verificação de saúde do servidor
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    region: awsRegion,
    endpoints: [
      '/api/health',
      '/api/usuarios',
      '/api/conteudos',
      '/api/dashboards'
    ]
  });
});

// Endpoint para obter dados dos usuários
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log(`Consultando tabela ${USUARIOS_TABLE} no DynamoDB...`);
    
    // Verificar conexão com AWS
    const checkAws = await validateAwsConnection();
    if (!checkAws.success) {
      return res.status(500).json({ 
        error: `Erro de conexão com AWS: ${checkAws.message}` 
      });
    }
    
    // Consultar usuários no DynamoDB
    const params = {
      TableName: USUARIOS_TABLE,
      Limit: 100 // Limitar para evitar problemas de memória
    };
    
    const result = await dynamoDB.scan(params).promise();
    
    // Contar usuários ativos
    const ativos = result.Items.filter(user => 
      user.status === 'ativo' || 
      user.status === 'active' || 
      user.ativo === true || 
      user.active === true
    ).length;
    
    res.json({
      count: result.Count,
      ativos: ativos,
      usuarios: result.Items,
      region: awsRegion,
      table: USUARIOS_TABLE
    });
  } catch (error) {
    console.error('Erro ao consultar usuários:', error);
    
    let mensagemErro = 'Erro ao consultar a tabela de usuários';
    let httpStatus = 500;
    
    if (error.code === 'ResourceNotFoundException') {
      mensagemErro = `A tabela de usuários (${USUARIOS_TABLE}) não foi encontrada na região ${awsRegion}`;
      httpStatus = 404;
    } else if (error.code === 'UnrecognizedClientException') {
      mensagemErro = 'Credenciais AWS inválidas ou não configuradas corretamente';
    } else if (error.code === 'NetworkingError') {
      mensagemErro = 'Erro de conexão com AWS. Verifique sua conectividade de rede';
    }
    
    res.status(httpStatus).json({ 
      error: mensagemErro,
      details: error.message,
      code: error.code
    });
  }
});

// Endpoint para obter conteúdos
app.get('/api/conteudos', async (req, res) => {
  try {
    console.log(`Consultando tabela ${CONTEUDOS_TABLE} no DynamoDB...`);
    
    // Verificar conexão com AWS
    const checkAws = await validateAwsConnection();
    if (!checkAws.success) {
      return res.status(500).json({ 
        error: `Erro de conexão com AWS: ${checkAws.message}` 
      });
    }
    
    // Consultar conteúdos no DynamoDB
    const params = {
      TableName: CONTEUDOS_TABLE,
      Limit: 50 // Limitar para evitar problemas de memória
    };
    
    const result = await dynamoDB.scan(params).promise();
    
    res.json({
      count: result.Count,
      conteudos: result.Items,
      region: awsRegion,
      table: CONTEUDOS_TABLE
    });
  } catch (error) {
    console.error('Erro ao consultar conteúdos:', error);
    
    let mensagemErro = 'Erro ao consultar a tabela de conteúdos';
    let httpStatus = 500;
    
    if (error.code === 'ResourceNotFoundException') {
      mensagemErro = `A tabela de conteúdos (${CONTEUDOS_TABLE}) não foi encontrada na região ${awsRegion}`;
      httpStatus = 404;
    }
    
    res.status(httpStatus).json({ 
      error: mensagemErro,
      details: error.message,
      code: error.code
    });
  }
});

// Endpoint para remover usuário
app.delete('/api/usuarios/:id', async (req, res) => {
  const usuarioId = req.params.id;
  
  if (!usuarioId) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório' });
  }
  
  try {
    // Verificar conexão com AWS
    const checkAws = await validateAwsConnection();
    if (!checkAws.success) {
      return res.status(500).json({ 
        error: `Erro de conexão com AWS: ${checkAws.message}` 
      });
    }
    
    const params = {
      TableName: USUARIOS_TABLE,
      Key: { id: usuarioId }
    };
    
    await dynamoDB.delete(params).promise();
    
    res.json({ success: true, message: 'Usuário removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover usuário:', error);
    
    res.status(500).json({ 
      error: `Erro ao remover usuário: ${error.message}`,
      code: error.code
    });
  }
});

// Endpoint para dashboards
app.get('/api/dashboards', (req, res) => {
  // Exemplos de dashboards (poderia ser dinâmico consultando CloudWatch)
  const dashboards = [
    {
      name: 'Monitoramento - Usuários',
      url: `https://${awsRegion}.console.aws.amazon.com/cloudwatch/home?region=${awsRegion}#dashboards:name=Usuarios`
    },
    {
      name: 'Monitoramento - API Gateway',
      url: `https://${awsRegion}.console.aws.amazon.com/cloudwatch/home?region=${awsRegion}#dashboards:name=APIGateway`
    },
    {
      name: 'Monitoramento - Lambda',
      url: `https://${awsRegion}.console.aws.amazon.com/cloudwatch/home?region=${awsRegion}#dashboards:name=Lambda`
    },
    {
      name: 'DynamoDB - Monitoramento',
      url: `https://${awsRegion}.console.aws.amazon.com/cloudwatch/home?region=${awsRegion}#dashboards:name=DynamoDB`
    }
  ];
  
  res.json({
    dashboards: dashboards,
    region: awsRegion
  });
});

// ===== FUNÇÕES AUXILIARES =====

// Validar conexão AWS e tabelas
async function validateAwsConnection() {
  try {
    // Verificar acesso ao serviço DynamoDB
    const listTables = await dynamoDB.scan({
      TableName: USUARIOS_TABLE,
      Limit: 1
    }).promise();
    
    return { success: true };
  } catch (error) {
    console.error('Erro ao validar conexão AWS:', error);
    
    let message = 'Erro desconhecido ao conectar ao AWS DynamoDB';
    
    if (error.code === 'ResourceNotFoundException') {
      message = `A tabela "${USUARIOS_TABLE}" não existe na região "${awsRegion}`;
    } else if (error.code === 'UnrecognizedClientException') {
      message = 'Credenciais AWS inválidas ou não configuradas';
    } else if (error.code === 'NetworkingError') {
      message = 'Erro de conectividade com os serviços AWS';
    } else {
      message = `${error.code}: ${error.message}`;
    }
    
    return { 
      success: false, 
      message, 
      code: error.code 
    };
  }
}

// Servir a página HTML
app.get('/', (req, res) => {
  res.send(HTML_CONTEUDO);
});

// ===== INICIALIZAÇÃO DO SERVIDOR =====

// Verifica se a porta está disponível e inicia o servidor
async function startServer() {
  try {
    const isPortFree = await checkPort(PORT);
    
    if (!isPortFree) {
      console.error(`\nERRO: A porta ${PORT} já está em uso! Tente uma porta diferente.`);
      console.log('Você pode especificar outra porta: node admin-console.js <PORTA>\n');
      process.exit(1);
    }
    
    app.listen(PORT, () => {
      console.log(`\n=== ADMIN SERVER ===`);
      console.log(`Servidor disponível em: http://localhost:${PORT}`);
      console.log(`Região AWS: ${awsRegion}`);
      console.log(`Tabela Usuários: ${USUARIOS_TABLE}`);
      console.log(`Tabela Conteúdos: ${CONTEUDOS_TABLE}`);
      console.log(`\nPressione CTRL+C para encerrar o servidor.\n`);
    });
  } catch (error) {
    console.error('Erro ao iniciar o servidor:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer(); 