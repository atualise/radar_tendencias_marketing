// Funções para o admin-server

// Função para carregar usuários
function loadUsuarios() {
  $('#userStats').html(`
    <div class="alert alert-info">
      <i class="fas fa-spinner fa-spin"></i> Carregando estatísticas de usuários...
    </div>
  `);
  
  $('#usuariosTableBody').html(`
    <tr>
      <td colspan="5" class="text-center">
        <i class="fas fa-spinner fa-spin"></i> Carregando usuários...
      </td>
    </tr>
  `);
  
  $.ajax({
    url: '/api/usuarios',
    method: 'GET',
    success: function(response) {
      // Atualizar estatísticas
      const total = response.count || 0;
      const ativos = response.ativos || 0;
      const percentAtivos = total > 0 ? ((ativos / total) * 100).toFixed(1) : 0;
      
      $('#userStats').html(`
        <div class="row">
          <div class="col-md-4">
            <div class="card bg-primary text-white">
              <div class="card-body text-center">
                <h3>${total}</h3>
                <p class="mb-0">Total de Usuários</p>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card bg-success text-white">
              <div class="card-body text-center">
                <h3>${ativos}</h3>
                <p class="mb-0">Usuários Ativos</p>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card bg-info text-white">
              <div class="card-body text-center">
                <h3>${percentAtivos}%</h3>
                <p class="mb-0">Taxa de Ativação</p>
              </div>
            </div>
          </div>
        </div>
      `);
      
      // Limpar e preencher tabela
      $('#usuariosTableBody').empty();
      
      if (response.usuarios && response.usuarios.length > 0) {
        response.usuarios.forEach(function(usuario) {
          const nome = usuario.name || 'Sem nome';
          const telefone = usuario.phoneNumber || usuario.telefone || 'Não informado';
          const status = determinarStatus(usuario);
          const dataCadastro = formatarData(usuario.createdAt || usuario.dataCadastro || new Date().toISOString());
          
          $('#usuariosTableBody').append(`
            <tr>
              <td>${nome}</td>
              <td>${telefone}</td>
              <td class="${status === 'Ativo' ? 'status-ativo' : 'status-inativo'}">${status}</td>
              <td>${dataCadastro}</td>
              <td>
                <button class="btn btn-sm btn-info ver-detalhes" data-id="${usuario.userId || usuario.id}">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-danger remover-usuario" data-id="${usuario.userId || usuario.id}">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
          `);
        });
        
        // Adicionar event listeners para botões
        $('.ver-detalhes').click(function() {
          const userId = $(this).data('id');
          mostrarDetalhesUsuario(userId, response.usuarios);
        });
        
        $('.remover-usuario').click(function() {
          const userId = $(this).data('id');
          confirmarRemocaoUsuario(userId);
        });
      } else {
        $('#usuariosTableBody').html(`
          <tr>
            <td colspan="5" class="text-center">Nenhum usuário encontrado</td>
          </tr>
        `);
      }
    },
    error: function(xhr, status, error) {
      $('#userStats').html(`
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> 
          Erro ao carregar estatísticas: ${error}
        </div>
      `);
      
      $('#usuariosTableBody').html(`
        <tr>
          <td colspan="5" class="text-center text-danger">
            Erro ao carregar usuários: ${error}
          </td>
        </tr>
      `);
      console.error('Erro ao carregar usuários:', error);
    }
  });
}

// Função para carregar conteúdos
function loadConteudos() {
  $('#conteudosStats').html(`
    <div class="alert alert-info">
      <i class="fas fa-spinner fa-spin"></i> Carregando estatísticas de conteúdos...
    </div>
  `);
  
  $('#conteudosTableBody').html(`
    <tr>
      <td colspan="6" class="text-center">
        <i class="fas fa-spinner fa-spin"></i> Carregando conteúdos...
      </td>
    </tr>
  `);
  
  $.ajax({
    url: '/api/conteudos',
    method: 'GET',
    success: function(response) {
      // Atualizar estatísticas
      const total = response.count || 0;
      const categorias = response.categorias || {};
      
      let categoriasHTML = '';
      for (const [categoria, count] of Object.entries(categorias)) {
        categoriasHTML += `<span class="badge badge-primary mr-2">${categoria}: ${count}</span>`;
      }
      
      $('#conteudosStats').html(`
        <div class="row">
          <div class="col-md-4">
            <div class="card bg-primary text-white">
              <div class="card-body text-center">
                <h3>${total}</h3>
                <p class="mb-0">Total de Conteúdos</p>
              </div>
            </div>
          </div>
          <div class="col-md-8">
            <div class="card">
              <div class="card-body">
                <h5>Categorias:</h5>
                <p>${categoriasHTML || 'Nenhuma categoria encontrada'}</p>
              </div>
            </div>
          </div>
        </div>
      `);
      
      // Limpar e preencher tabela
      $('#conteudosTableBody').empty();
      
      if (response.conteudos && response.conteudos.length > 0) {
        response.conteudos.forEach(function(conteudo) {
          const id = conteudo.contentId || conteudo.id || 'ID não disponível';
          const tipo = conteudo.contentType || conteudo.tipo || 'Não especificado';
          const usuario = conteudo.userId || conteudo.usuarioId || 'Sistema';
          const dataCriacao = formatarData(conteudo.createdAt || conteudo.dataCriacao || new Date().toISOString());
          
          // Preparar preview do conteúdo
          let previewConteudo = '';
          if (conteudo.versions && conteudo.versions.brief) {
            previewConteudo = conteudo.versions.brief.substring(0, 100) + '...';
          } else if (conteudo.conteudo) {
            previewConteudo = conteudo.conteudo.substring(0, 100) + '...';
          } else {
            previewConteudo = 'Conteúdo não disponível';
          }
          
          $('#conteudosTableBody').append(`
            <tr>
              <td>${id}</td>
              <td>${tipo}</td>
              <td>${usuario}</td>
              <td>${dataCriacao}</td>
              <td>${previewConteudo}</td>
              <td>
                <button class="btn btn-sm btn-info ver-conteudo" data-id="${id}">
                  <i class="fas fa-eye"></i>
                </button>
              </td>
            </tr>
          `);
        });
        
        // Adicionar event listeners para botões
        $('.ver-conteudo').click(function() {
          const contentId = $(this).data('id');
          mostrarDetalhesConteudo(contentId, response.conteudos);
        });
      } else {
        $('#conteudosTableBody').html(`
          <tr>
            <td colspan="6" class="text-center">Nenhum conteúdo encontrado</td>
          </tr>
        `);
      }
    },
    error: function(xhr, status, error) {
      $('#conteudosStats').html(`
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> 
          Erro ao carregar estatísticas: ${error}
        </div>
      `);
      
      $('#conteudosTableBody').html(`
        <tr>
          <td colspan="6" class="text-center text-danger">
            Erro ao carregar conteúdos: ${error}
          </td>
        </tr>
      `);
      console.error('Erro ao carregar conteúdos:', error);
    }
  });
}

// Função para carregar dados do Kanban
function loadKanbanData() {
  // Limpar quadros kanban e adicionar indicadores de carregamento
  ['novos', 'onboarding', 'em-progresso', 'concluido'].forEach(coluna => {
    $(`#kanban-${coluna}`).html(`
      <div class="text-center text-muted">
        <i class="fas fa-spinner fa-spin"></i> Carregando...
      </div>
    `);
    $(`#count-${coluna}`).text('0');
  });
  
  // Carregar usuários para o kanban
  $.ajax({
    url: '/api/usuarios',
    method: 'GET',
    success: function(response) {
      // Mapa para distribuir usuários nas colunas do kanban
      const kanbanMap = {
        'novos': [],
        'onboarding': [],
        'em-progresso': [],
        'concluido': []
      };
      
      // Classificar usuários por coluna
      if (response.usuarios && response.usuarios.length > 0) {
        $('#kanbanTotalUsuarios').text(response.usuarios.length);
        
        response.usuarios.forEach(usuario => {
          // Determinar a coluna com base no status e comportamento
          let coluna = 'novos';
          
          if (usuario.onboardingCompleted) {
            coluna = 'em-progresso';
            
            // Se tiver alto engajamento, mover para completado
            if (usuario.engagement && usuario.engagement.engagementScore > 70) {
              coluna = 'concluido';
            }
          } else if (usuario.lastActive) {
            // Se não completou onboarding mas tem atividade, está em onboarding
            coluna = 'onboarding';
          }
          
          // Adicionar à coluna correspondente
          kanbanMap[coluna].push(usuario);
        });
        
        // Preencher cada coluna do kanban
        for (const [coluna, usuarios] of Object.entries(kanbanMap)) {
          $(`#count-${coluna}`).text(usuarios.length);
          
          if (usuarios.length === 0) {
            $(`#kanban-${coluna}`).html(`
              <div class="text-center text-muted">
                <i class="fas fa-inbox"></i> Nenhum usuário nesta coluna
              </div>
            `);
            continue;
          }
          
          $(`#kanban-${coluna}`).empty();
          
          // Adicionar cartões para cada usuário
          usuarios.forEach(usuario => {
            const nome = usuario.name || 'Usuário sem nome';
            const telefone = usuario.phoneNumber || usuario.telefone || 'Sem telefone';
            const dataCadastro = formatarData(usuario.createdAt || usuario.dataCadastro || new Date().toISOString());
            
            let statusClass = '';
            switch (coluna) {
              case 'novos': statusClass = 'kanban-card-novo'; break;
              case 'onboarding': statusClass = 'kanban-card-onboarding'; break;
              case 'em-progresso': statusClass = 'kanban-card-ativo'; break;
              case 'concluido': statusClass = 'kanban-card-inativo'; break;
            }
            
            $(`#kanban-${coluna}`).append(`
              <div class="card kanban-card ${statusClass}" data-id="${usuario.userId || usuario.id}">
                <div class="kanban-card-header">
                  <strong>${nome}</strong>
                  <div class="dropdown">
                    <button class="btn btn-sm py-0 px-1" type="button" data-toggle="dropdown">
                      <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="dropdown-menu dropdown-menu-right">
                      <a class="dropdown-item ver-usuario" href="#" data-id="${usuario.userId || usuario.id}">
                        <i class="fas fa-eye"></i> Ver detalhes
                      </a>
                      <a class="dropdown-item mover-usuario" href="#" data-coluna="novos">
                        <i class="fas fa-arrow-right"></i> Mover para Novos
                      </a>
                      <a class="dropdown-item mover-usuario" href="#" data-coluna="onboarding">
                        <i class="fas fa-arrow-right"></i> Mover para Onboarding
                      </a>
                      <a class="dropdown-item mover-usuario" href="#" data-coluna="em-progresso">
                        <i class="fas fa-arrow-right"></i> Mover para Em Progresso
                      </a>
                      <a class="dropdown-item mover-usuario" href="#" data-coluna="concluido">
                        <i class="fas fa-arrow-right"></i> Mover para Concluído
                      </a>
                    </div>
                  </div>
                </div>
                <div class="kanban-card-body">
                  <div><i class="fas fa-phone-alt"></i> ${telefone}</div>
                  <div class="mt-1">
                    ${usuario.profile && usuario.profile.role ? 
                      `<span class="badge badge-secondary">${usuario.profile.role}</span>` : ''}
                    ${usuario.profile && usuario.profile.industry ? 
                      `<span class="badge badge-info">${usuario.profile.industry}</span>` : ''}
                  </div>
                </div>
                <div class="kanban-card-footer">
                  <span><i class="far fa-calendar-alt"></i> ${dataCadastro}</span>
                  <span>
                    ${usuario.engagement && usuario.engagement.engagementScore ? 
                      `<i class="fas fa-chart-line"></i> ${usuario.engagement.engagementScore}` : 
                      '<i class="fas fa-circle"></i> Novo'}
                  </span>
                </div>
              </div>
            `);
          });
          
          // Adicionar listeners para os botões de ação
          $(`#kanban-${coluna} .ver-usuario`).click(function(e) {
            e.preventDefault();
            const id = $(this).data('id');
            mostrarDetalhesUsuario(id, response.usuarios);
          });
          
          $(`#kanban-${coluna} .mover-usuario`).click(function(e) {
            e.preventDefault();
            const id = $(this).closest('.kanban-card').data('id');
            const colunaDestino = $(this).data('coluna');
            // Aqui você pode implementar o código para mover o usuário
            // entre as colunas (via API) ou apenas visualmente
            alert(`Movendo usuário ${id} para ${colunaDestino}`);
          });
        }
      } else {
        ['novos', 'onboarding', 'em-progresso', 'concluido'].forEach(coluna => {
          $(`#kanban-${coluna}`).html(`
            <div class="text-center text-muted">
              <i class="fas fa-exclamation-circle"></i> Sem dados disponíveis
            </div>
          `);
        });
        
        $('#kanbanTotalUsuarios').text('0');
      }
    },
    error: function(xhr, status, error) {
      ['novos', 'onboarding', 'em-progresso', 'concluido'].forEach(coluna => {
        $(`#kanban-${coluna}`).html(`
          <div class="text-center text-danger">
            <i class="fas fa-exclamation-triangle"></i>
            Erro ao carregar dados: ${error}
          </div>
        `);
      });
      
      console.error('Erro ao carregar dados do kanban:', error);
    }
  });
}

// Funções utilitárias
function determinarStatus(usuario) {
  if (usuario.status === 'ativo' || 
      usuario.ativo === true || 
      usuario.situacao === 'ativo' || 
      usuario.active === true ||
      (typeof usuario.status === 'number' && usuario.status === 1)) {
    return 'Ativo';
  } else {
    return 'Inativo';
  }
}

function formatarData(dataStr) {
  try {
    const data = new Date(dataStr);
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return 'Data inválida';
  }
}

function mostrarDetalhesUsuario(userId, usuarios) {
  const usuario = usuarios.find(u => (u.userId || u.id) === userId);
  
  if (!usuario) {
    alert('Usuário não encontrado!');
    return;
  }
  
  let detalhesHTML = `
    <div class="row">
      <div class="col-md-6">
        <h5>Informações Básicas</h5>
        <table class="table table-sm">
          <tr>
            <th>ID:</th>
            <td>${usuario.userId || usuario.id || 'N/A'}</td>
          </tr>
          <tr>
            <th>Nome:</th>
            <td>${usuario.name || 'Não informado'}</td>
          </tr>
          <tr>
            <th>Telefone:</th>
            <td>${usuario.phoneNumber || usuario.telefone || 'Não informado'}</td>
          </tr>
          <tr>
            <th>Email:</th>
            <td>${usuario.email || 'Não informado'}</td>
          </tr>
          <tr>
            <th>Status:</th>
            <td class="${determinarStatus(usuario) === 'Ativo' ? 'status-ativo' : 'status-inativo'}">
              ${determinarStatus(usuario)}
            </td>
          </tr>
          <tr>
            <th>Data Cadastro:</th>
            <td>${formatarData(usuario.createdAt || usuario.dataCadastro || '')}</td>
          </tr>
          <tr>
            <th>Última Atividade:</th>
            <td>${formatarData(usuario.lastActive || usuario.ultimaAtividade || '')}</td>
          </tr>
        </table>
      </div>
      <div class="col-md-6">
        <h5>Perfil e Preferências</h5>
        <div class="card mb-3">
          <div class="card-body">
            ${usuario.profile ? `
              <p><strong>Cargo:</strong> ${usuario.profile.role || 'Não informado'}</p>
              <p><strong>Empresa:</strong> ${usuario.profile.companySize || 'Não informado'}</p>
              <p><strong>Indústria:</strong> ${usuario.profile.industry || 'Não informado'}</p>
              <p><strong>Localização:</strong> ${
                usuario.profile.location ? 
                `${usuario.profile.location.city || ''}, ${usuario.profile.location.state || ''}` :
                'Não informada'
              }</p>
            ` : '<p>Perfil não disponível</p>'}
            
            ${usuario.preferences ? `
              <hr>
              <p><strong>Interesse Principal:</strong> ${usuario.preferences.primaryInterest || 'Não informado'}</p>
              <p><strong>Frequência de Mensagens:</strong> ${usuario.preferences.messageFrequency || 'Não informado'}</p>
              <p><strong>Formato Preferido:</strong> ${usuario.preferences.preferredContentFormat || 'Não informado'}</p>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
  
  $('#modalTitle').text(`Detalhes do Usuário: ${usuario.name || 'Sem nome'}`);
  $('#modalBody').html(detalhesHTML);
  $('#detailsModal').modal('show');
}

function mostrarDetalhesConteudo(contentId, conteudos) {
  const conteudo = conteudos.find(c => (c.contentId || c.id) === contentId);
  
  if (!conteudo) {
    alert('Conteúdo não encontrado!');
    return;
  }
  
  let detalhesHTML = `
    <div class="row">
      <div class="col-md-5">
        <h5>Informações Básicas</h5>
        <table class="table table-sm">
          <tr>
            <th>ID:</th>
            <td>${conteudo.contentId || conteudo.id || 'N/A'}</td>
          </tr>
          <tr>
            <th>Tipo:</th>
            <td>${conteudo.contentType || conteudo.tipo || 'Não especificado'}</td>
          </tr>
          <tr>
            <th>Usuário:</th>
            <td>${conteudo.userId || conteudo.usuarioId || 'Sistema'}</td>
          </tr>
          <tr>
            <th>Data Criação:</th>
            <td>${formatarData(conteudo.createdAt || conteudo.dataCriacao || '')}</td>
          </tr>
          <tr>
            <th>Categorias:</th>
            <td>${
              conteudo.categories ? 
              conteudo.categories.map(cat => `<span class="badge badge-info mr-1">${cat}</span>`).join('') :
              (conteudo.categoria ? `<span class="badge badge-info">${conteudo.categoria}</span>` : 'Não especificado')
            }</td>
          </tr>
        </table>
      </div>
      <div class="col-md-7">
        <h5>Conteúdo</h5>
        <div class="card">
          <div class="card-body">
            ${conteudo.versions ? `
              <ul class="nav nav-tabs" id="contentTabs" role="tablist">
                <li class="nav-item">
                  <a class="nav-link active" id="brief-tab" data-toggle="tab" href="#brief" role="tab">Resumido</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link" id="detailed-tab" data-toggle="tab" href="#detailed" role="tab">Detalhado</a>
                </li>
              </ul>
              <div class="tab-content mt-2" id="contentTabsContent">
                <div class="tab-pane fade show active" id="brief" role="tabpanel">
                  <p>${conteudo.versions.brief || 'Não disponível'}</p>
                </div>
                <div class="tab-pane fade" id="detailed" role="tabpanel">
                  <p>${conteudo.versions.detailed || 'Não disponível'}</p>
                </div>
              </div>
            ` : (conteudo.conteudo ? `<p>${conteudo.conteudo}</p>` : '<p>Conteúdo não disponível</p>')}
          </div>
        </div>
        
        ${conteudo.metrics ? `
          <div class="card mt-3">
            <div class="card-header">Métricas</div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-4 text-center">
                  <h4>${conteudo.metrics.impressions || 0}</h4>
                  <small>Impressões</small>
                </div>
                <div class="col-md-4 text-center">
                  <h4>${conteudo.metrics.clicks || 0}</h4>
                  <small>Cliques</small>
                </div>
                <div class="col-md-4 text-center">
                  <h4>${conteudo.metrics.feedbackScore || 0}</h4>
                  <small>Avaliação</small>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  $('#modalTitle').text(`Detalhes do Conteúdo: ${conteudo.title || conteudo.contentId || ''}`);
  $('#modalBody').html(detalhesHTML);
  $('#detailsModal').modal('show');
}

function confirmarRemocaoUsuario(userId) {
  if (confirm(`Tem certeza que deseja remover o usuário ${userId}?`)) {
    // Aqui você pode implementar a chamada à API para remover o usuário
    alert(`Solicitação para remover o usuário ${userId} enviada.`);
  }
} 