import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { setDocWithCopy } from './secure-firestore.js';
import { carregarUsuariosPosVendas } from './responsavel-posvendas.js';
import { loadUserProfile } from './login.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const filtroUsuarioEl = document.getElementById('filtroUsuario');
const statusGlobalEl = document.getElementById('statusGlobal');
const resumoMentoradosEl = document.getElementById('resumoMentorados');
const pecasStatusMsgEl = document.getElementById('pecasStatusMsg');
const pecasListContainer = document.getElementById('pecasListContainer');
const pecasEmptyEl = document.getElementById('pecasEmptyState');
const reembolsosStatusMsgEl = document.getElementById('reembolsosStatusMsg');
const reembolsosTableBody = document.getElementById('reembolsosTableBody');
const reembolsosEmptyEl = document.getElementById('reembolsosEmptyState');

let currentUser = null;
let usuariosVinculados = [];
let pecasCache = [];
let reembolsosCache = [];
let usuarioSelecionado = '';
const responsaveisCache = new Map();

const REEMBOLSO_STATUS_OPCOES = [
  { valor: 'AGUARDANDO PIX', texto: 'Aguardando PIX' },
  { valor: 'AGUARDANDO MERCADO', texto: 'Aguardando Mercado' },
  { valor: 'AGUARDANDO', texto: 'Aguardando' },
  { valor: 'FEITO', texto: 'Feito' },
  { valor: 'FEITO PIX', texto: 'Feito PIX' },
  { valor: 'FEITO MERCADO', texto: 'Feito Mercado' },
  { valor: 'CANCELADO', texto: 'Cancelado' },
];

initTabs();
registrarEventos();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }

  currentUser = user;
  atualizarStatusGlobal('Carregando mentorados vinculados...', false);

  try {
    const resposta = await carregarUsuariosPosVendas(db, user);
    usuariosVinculados = resposta.usuarios || [];
  } catch (err) {
    console.error('Erro ao carregar usuários vinculados ao pós-vendas:', err);
    usuariosVinculados = [];
  }

  preencherSelectUsuarios();
  atualizarResumoMentorados();

  if (!usuariosVinculados.length) {
    atualizarStatusGlobal(
      'Nenhum mentorado indicou este pós-vendas até o momento.',
      false,
    );
    pecasCache = [];
    reembolsosCache = [];
    renderPecas();
    renderReembolsos();
    return;
  }

  atualizarStatusGlobal('Sincronizando dados dos problemas...', false);

  await Promise.all([carregarPecas(), carregarReembolsos()]);

  atualizarStatusGlobal('Dados sincronizados com sucesso.', false);
});

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
  if (!tabButtons.length) return;

  const setActive = (targetId) => {
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === targetId;
      btn.classList.toggle('border-violet-600', active);
      btn.classList.toggle('text-violet-600', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-slate-500', !active);
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== targetId);
    });
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.dataset.tab));
  });

  setActive(tabButtons[0]?.dataset.tab || 'tab-pecas');
}

function registrarEventos() {
  filtroUsuarioEl?.addEventListener('change', () => {
    usuarioSelecionado = filtroUsuarioEl.value;
    renderPecas();
    renderReembolsos();
  });

  document
    .getElementById('pecasInicio')
    ?.addEventListener('change', renderPecas);
  document.getElementById('pecasFim')?.addEventListener('change', renderPecas);
  document
    .getElementById('pecasStatus')
    ?.addEventListener('change', renderPecas);
  document.getElementById('pecasBusca')?.addEventListener('input', renderPecas);

  document
    .getElementById('reembolsosInicio')
    ?.addEventListener('change', renderReembolsos);
  document
    .getElementById('reembolsosFim')
    ?.addEventListener('change', renderReembolsos);
  document
    .getElementById('reembolsosStatus')
    ?.addEventListener('change', renderReembolsos);
  document
    .getElementById('reembolsosBusca')
    ?.addEventListener('input', renderReembolsos);
  document
    .getElementById('reembolsosBuscaPix')
    ?.addEventListener('input', renderReembolsos);
}

function atualizarStatusGlobal(texto, isError) {
  if (!statusGlobalEl) return;
  statusGlobalEl.textContent = texto;
  statusGlobalEl.classList.toggle('bg-rose-100', Boolean(isError));
  statusGlobalEl.classList.toggle('text-rose-700', Boolean(isError));
  statusGlobalEl.classList.toggle('bg-slate-100', !isError);
  statusGlobalEl.classList.toggle('text-slate-600', !isError);
  if (isError) {
    statusGlobalEl.classList.add('border', 'border-rose-200');
  } else {
    statusGlobalEl.classList.remove('border', 'border-rose-200');
  }
}

function atualizarResumoMentorados() {
  if (!resumoMentoradosEl) return;
  const total = usuariosVinculados.length;
  resumoMentoradosEl.textContent = total
    ? `${total} mentorado${total > 1 ? 's' : ''}`
    : 'Nenhum mentorado';
}

function preencherSelectUsuarios() {
  if (!filtroUsuarioEl) return;
  const valorAtual = filtroUsuarioEl.value;
  filtroUsuarioEl.innerHTML = '<option value="">Todos os mentorados</option>';
  usuariosVinculados.forEach((usuario) => {
    const option = document.createElement('option');
    option.value = usuario.uid;
    option.textContent = usuario.nome || usuario.email || usuario.uid;
    filtroUsuarioEl.appendChild(option);
  });
  if (valorAtual && usuariosVinculados.some((u) => u.uid === valorAtual)) {
    filtroUsuarioEl.value = valorAtual;
    usuarioSelecionado = valorAtual;
  } else {
    filtroUsuarioEl.value = '';
    usuarioSelecionado = '';
  }
}

async function carregarPecas() {
  try {
    const resultados = await Promise.all(
      usuariosVinculados.map((usuario) => carregarPecasUsuario(usuario)),
    );
    pecasCache = resultados
      .flat()
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    setStatus(
      pecasStatusMsgEl,
      `${pecasCache.length} registro(s) carregados.`,
      false,
    );
  } catch (err) {
    console.error('Erro ao carregar peças faltantes:', err);
    pecasCache = [];
    setStatus(
      pecasStatusMsgEl,
      'Não foi possível carregar os registros de peças faltantes.',
      true,
    );
  }
  renderPecas();
}

async function carregarPecasUsuario(usuario) {
  if (!usuario?.uid) return [];
  try {
    const responsaveis = await obterResponsaveis(usuario.uid);
    const baseDoc = doc(db, 'uid', usuario.uid, 'problemas', 'pecasfaltando');
    const itensRef = collection(baseDoc, 'itens');
    const snap = await getDocs(itensRef);
    return snap.docs.map((docSnap) => {
      const dados = docSnap.data();
      const valorConvertido = Number.isFinite(Number(dados.valorGasto))
        ? Number(dados.valorGasto)
        : Number.parseFloat(dados.valorGasto) || 0;
      return {
        id: docSnap.id,
        ...dados,
        valorGasto: valorConvertido,
        status: dados.status || 'NÃO FEITO',
        endereco: normalizarEndereco(dados.endereco),
        ownerUid: usuario.uid,
        ownerNome: usuario.nome || usuario.email || usuario.uid,
        ownerEmail: usuario.email || '',
        ref: doc(itensRef, docSnap.id),
        responsaveis,
      };
    });
  } catch (err) {
    console.error(`Erro ao carregar peças faltantes de ${usuario.uid}:`, err);
    return [];
  }
}

async function carregarReembolsos() {
  try {
    const resultados = await Promise.all(
      usuariosVinculados.map((usuario) => carregarReembolsosUsuario(usuario)),
    );
    reembolsosCache = resultados
      .flat()
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    setStatus(
      reembolsosStatusMsgEl,
      `${reembolsosCache.length} reembolso(s) carregados.`,
      false,
    );
  } catch (err) {
    console.error('Erro ao carregar reembolsos:', err);
    reembolsosCache = [];
    setStatus(
      reembolsosStatusMsgEl,
      'Não foi possível carregar os registros de reembolso.',
      true,
    );
  }
  renderReembolsos();
}

async function carregarReembolsosUsuario(usuario) {
  if (!usuario?.uid) return [];
  try {
    const responsaveis = await obterResponsaveis(usuario.uid);
    const baseDoc = doc(db, 'uid', usuario.uid, 'problemas', 'reembolsos');
    const itensRef = collection(baseDoc, 'itens');
    const snap = await getDocs(itensRef);
    return snap.docs.map((docSnap) => {
      const dados = docSnap.data();
      const statusValido = REEMBOLSO_STATUS_OPCOES.some(
        (opcao) => opcao.valor === dados.status,
      )
        ? dados.status
        : 'AGUARDANDO';
      return {
        id: docSnap.id,
        ...dados,
        valor: Number.isFinite(Number(dados.valor))
          ? Number(dados.valor)
          : Number.parseFloat(dados.valor) || 0,
        pix: dados.pix || '',
        problema: dados.problema || '',
        status: statusValido,
        ownerUid: usuario.uid,
        ownerNome: usuario.nome || usuario.email || usuario.uid,
        ownerEmail: usuario.email || '',
        ref: doc(itensRef, docSnap.id),
        responsaveis,
      };
    });
  } catch (err) {
    console.error(`Erro ao carregar reembolsos de ${usuario.uid}:`, err);
    return [];
  }
}

async function obterResponsaveis(uid) {
  if (responsaveisCache.has(uid)) return responsaveisCache.get(uid);
  let respFinanceiroEmail = null;
  let posVendasEmail = null;

  try {
    const perfil = await loadUserProfile(uid);
    respFinanceiroEmail =
      perfil?.responsavelFinanceiroEmail ||
      perfil?.perfilMentorado?.responsavelFinanceiroEmail ||
      null;
    posVendasEmail =
      perfil?.responsavelPosVendasEmail ||
      perfil?.perfilMentorado?.responsavelPosVendasEmail ||
      null;
  } catch (err) {
    console.warn('Falha ao carregar perfil do mentorado:', err);
  }

  try {
    if (!respFinanceiroEmail || !posVendasEmail) {
      const auxSnap = await getDoc(doc(db, 'uid', uid));
      if (auxSnap.exists()) {
        const aux = auxSnap.data();
        respFinanceiroEmail =
          respFinanceiroEmail || aux?.responsavelFinanceiroEmail;
        posVendasEmail = posVendasEmail || aux?.responsavelPosVendasEmail;
      }
    }
  } catch (err) {
    console.warn('Falha ao carregar documento auxiliar do mentorado:', err);
  }

  const [financeiroUid, posVendasUid] = await Promise.all([
    buscarUidPorEmail(respFinanceiroEmail),
    buscarUidPorEmail(posVendasEmail),
  ]);

  const resultado = {
    financeiroUid: financeiroUid || null,
    posVendasUid: posVendasUid || null,
  };
  responsaveisCache.set(uid, resultado);
  return resultado;
}

async function buscarUidPorEmail(email) {
  if (!email) return null;
  try {
    const snap = await getDocs(
      query(collection(db, 'usuarios'), where('email', '==', email)),
    );
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  } catch (err) {
    console.warn('Erro ao buscar usuário pelo e-mail:', email, err);
  }
  return null;
}

function renderPecas() {
  if (!pecasListContainer) return;
  pecasListContainer.innerHTML = '';

  const inicio = document.getElementById('pecasInicio')?.value || '';
  const fim = document.getElementById('pecasFim')?.value || '';
  const statusFiltro = document.getElementById('pecasStatus')?.value || '';
  const busca =
    document.getElementById('pecasBusca')?.value.toLowerCase().trim() || '';

  const filtrados = pecasCache
    .filter((item) => {
      if (usuarioSelecionado && item.ownerUid !== usuarioSelecionado)
        return false;
      const data = item.data || '';
      if (inicio && (!data || data < inicio)) return false;
      if (fim && (!data || data > fim)) return false;
      if (
        statusFiltro &&
        normalizarStatus(item.status) !== normalizarStatus(statusFiltro)
      )
        return false;
      if (busca) {
        const campos = [
          item.nomeCliente,
          item.apelido,
          item.numero,
          item.loja,
          item.peca,
          item.nf,
          item.informacoes,
          item.ownerNome,
          item.ownerEmail,
          ...(item.endereco ? Object.values(item.endereco) : []),
        ];
        const encontrou = campos.some((valor) =>
          String(valor || '')
            .toLowerCase()
            .includes(busca),
        );
        if (!encontrou) return false;
      }
      return true;
    })
    .sort((a, b) => ordenarPorDataNumero(b, a));

  if (pecasEmptyEl) {
    pecasEmptyEl.classList.toggle('hidden', Boolean(filtrados.length));
  }

  filtrados.forEach((dado) => {
    const endereco = normalizarEndereco(dado.endereco);
    const card = document.createElement('article');
    card.className =
      'space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-6';

    const resumo = document.createElement('div');
    resumo.className =
      'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between';

    const infoGrid = document.createElement('div');
    infoGrid.className =
      'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-6';

    const camposResumo = [
      { rotulo: 'Mentorado', valor: dado.ownerNome },
      { rotulo: 'Cliente', valor: dado.nomeCliente || '—' },
      { rotulo: 'Apelido', valor: dado.apelido || '—' },
      { rotulo: 'Produto', valor: dado.peca || '—' },
      { rotulo: 'Número do Pedido', valor: dado.numero || '—' },
      { rotulo: 'Loja', valor: dado.loja || '—' },
      {
        rotulo: 'Data',
        valor: dado.data ? formatarData(dado.data) : '—',
      },
    ];

    camposResumo.forEach(({ rotulo, valor }) => {
      const item = document.createElement('div');
      item.className = 'space-y-1';
      const chip = document.createElement('span');
      chip.className =
        'inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600';
      chip.textContent = rotulo;
      const valorTexto = document.createElement('p');
      valorTexto.className = 'text-sm font-medium text-slate-700';
      valorTexto.textContent = valor;
      item.appendChild(chip);
      item.appendChild(valorTexto);
      infoGrid.appendChild(item);
    });

    resumo.appendChild(infoGrid);

    const resumoAcoes = document.createElement('div');
    resumoAcoes.className =
      'flex flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end';

    const responsavelChip = criarChip(
      'fa-solid fa-envelope',
      dado.ownerEmail ? dado.ownerEmail : 'Mentorado sem e-mail',
    );
    resumoAcoes.appendChild(responsavelChip);

    const statusContainer = document.createElement('div');
    statusContainer.className =
      'flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500';
    const statusLabel = document.createElement('span');
    statusLabel.textContent = 'Status';
    statusContainer.appendChild(statusLabel);
    const statusSelect = document.createElement('select');
    statusSelect.className =
      'status-select rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide focus:border-violet-500 focus:ring-violet-500';
    const opcoes = [
      { valor: 'NÃO FEITO', texto: 'Não feito' },
      { valor: 'EM ANDAMENTO', texto: 'Em andamento' },
      { valor: 'RESOLVIDO', texto: 'Resolvido' },
    ];
    opcoes.forEach(({ valor, texto }) => {
      const option = document.createElement('option');
      option.value = valor;
      option.textContent = texto;
      if (dado.status === valor) option.selected = true;
      statusSelect.appendChild(option);
    });
    aplicarCorStatus(statusSelect, dado.status);
    statusSelect.addEventListener('change', async (ev) => {
      const novoStatus = ev.target.value;
      await atualizarPeca(dado, { status: novoStatus });
      aplicarCorStatus(statusSelect, novoStatus);
    });
    statusContainer.appendChild(statusSelect);
    resumoAcoes.appendChild(statusContainer);

    const verMaisBtn = document.createElement('button');
    verMaisBtn.type = 'button';
    verMaisBtn.className =
      'inline-flex items-center justify-center rounded-xl border border-violet-200 px-3 py-1.5 text-sm font-medium text-violet-600 transition hover:bg-violet-50';
    verMaisBtn.textContent = 'Ver mais';
    resumoAcoes.appendChild(verMaisBtn);

    const excluirBtn = document.createElement('button');
    excluirBtn.type = 'button';
    excluirBtn.textContent = 'Excluir';
    excluirBtn.className =
      'inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50';
    excluirBtn.addEventListener('click', async () => {
      const confirma = window.confirm('Deseja excluir este registro?');
      if (!confirma) return;
      await excluirPeca(dado);
    });
    resumoAcoes.appendChild(excluirBtn);

    resumo.appendChild(resumoAcoes);
    card.appendChild(resumo);

    const detalhes = document.createElement('div');
    detalhes.className = 'hidden space-y-5 border-t border-slate-200 pt-4';

    verMaisBtn.addEventListener('click', () => {
      const oculto = detalhes.classList.toggle('hidden');
      verMaisBtn.textContent = oculto ? 'Ver mais' : 'Ver menos';
    });

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

    grid.appendChild(
      criarCampoEditavel('Data', {
        tipo: 'date',
        valor: dado.data || '',
        onChange: (valor) => atualizarPeca(dado, { data: valor }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Nome do Comprador', {
        valor: dado.nomeCliente || '',
        onChange: (valor) =>
          atualizarPeca(dado, {
            nomeCliente: valor.trim(),
          }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Apelido', {
        valor: dado.apelido || '',
        onChange: (valor) => atualizarPeca(dado, { apelido: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Número do Pedido', {
        valor: dado.numero || '',
        onChange: (valor) => atualizarPeca(dado, { numero: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Loja', {
        valor: dado.loja || '',
        onChange: (valor) => atualizarPeca(dado, { loja: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('NF', {
        valor: dado.nf || '',
        onChange: (valor) => atualizarPeca(dado, { nf: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Peça Faltante', {
        valor: dado.peca || '',
        onChange: (valor) => atualizarPeca(dado, { peca: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Valor Gasto', {
        tipo: 'number',
        passo: '0.01',
        valor: formatarNumero(dado.valorGasto),
        prefixo: 'R$',
        onChange: async (valor, input) => {
          const convertido = Number.parseFloat(String(valor).replace(',', '.'));
          const numerico = Number.isFinite(convertido) ? convertido : 0;
          await atualizarPeca(dado, { valorGasto: numerico });
          if (input) input.value = formatarNumero(numerico);
        },
      }),
    );

    detalhes.appendChild(grid);

    const infoField = document.createElement('label');
    infoField.className = 'flex flex-col gap-2 text-sm';
    const infoSpan = document.createElement('span');
    infoSpan.className =
      'text-xs font-semibold uppercase tracking-wide text-slate-500';
    infoSpan.textContent = 'Informações adicionais';
    infoField.appendChild(infoSpan);
    const infoTextarea = document.createElement('textarea');
    infoTextarea.rows = 3;
    infoTextarea.value = dado.informacoes || '';
    infoTextarea.className =
      'rounded-2xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500';
    infoTextarea.addEventListener('change', async (ev) => {
      await atualizarPeca(dado, { informacoes: ev.target.value.trim() });
    });
    infoField.appendChild(infoTextarea);
    detalhes.appendChild(infoField);

    const enderecoWrapper = document.createElement('div');
    enderecoWrapper.className = 'space-y-3';
    const enderecoBtn = document.createElement('button');
    enderecoBtn.type = 'button';
    enderecoBtn.className =
      'inline-flex items-center gap-2 text-sm font-semibold text-violet-600 transition hover:text-violet-700';
    enderecoBtn.innerHTML =
      '<i class="fa-solid fa-location-dot"></i><span>Ver endereço</span>';
    const enderecoTexto = enderecoBtn.querySelector('span');
    const enderecoSection = document.createElement('div');
    enderecoSection.className =
      'hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5';

    const enderecoGrid = document.createElement('div');
    enderecoGrid.className =
      'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4';

    const criarCampoEndereco = (rotulo, chave) => {
      const campo = document.createElement('label');
      campo.className = 'flex flex-col gap-1 text-sm';
      const span = document.createElement('span');
      span.className =
        'text-xs font-semibold uppercase tracking-wide text-slate-500';
      span.textContent = rotulo;
      campo.appendChild(span);
      const input = document.createElement('input');
      input.type = 'text';
      input.value = endereco[chave] || '';
      input.className =
        'rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500';
      input.addEventListener('change', async (ev) => {
        const atualizado = normalizarEndereco({
          ...endereco,
          [chave]: ev.target.value.trim(),
        });
        await atualizarPeca(dado, { endereco: atualizado });
        Object.assign(endereco, atualizado);
      });
      campo.appendChild(input);
      return campo;
    };

    enderecoGrid.appendChild(criarCampoEndereco('CEP', 'cep'));
    enderecoGrid.appendChild(criarCampoEndereco('Rua', 'rua'));
    enderecoGrid.appendChild(criarCampoEndereco('Número', 'numero'));
    enderecoGrid.appendChild(criarCampoEndereco('Bairro', 'bairro'));
    enderecoGrid.appendChild(criarCampoEndereco('Cidade', 'cidade'));
    enderecoGrid.appendChild(criarCampoEndereco('Estado', 'estado'));
    enderecoGrid.appendChild(criarCampoEndereco('Complemento', 'complemento'));
    enderecoGrid.appendChild(
      criarCampoEndereco('Ponto de Referência', 'referencia'),
    );

    enderecoSection.appendChild(enderecoGrid);

    enderecoBtn.addEventListener('click', () => {
      const escondido = enderecoSection.classList.toggle('hidden');
      if (enderecoTexto) {
        enderecoTexto.textContent = escondido
          ? 'Ver endereço'
          : 'Ocultar endereço';
      }
    });

    enderecoWrapper.appendChild(enderecoBtn);
    enderecoWrapper.appendChild(enderecoSection);
    detalhes.appendChild(enderecoWrapper);

    card.appendChild(detalhes);
    pecasListContainer.appendChild(card);
  });
}

function renderReembolsos() {
  if (!reembolsosTableBody) return;
  reembolsosTableBody.innerHTML = '';

  const inicio = document.getElementById('reembolsosInicio')?.value || '';
  const fim = document.getElementById('reembolsosFim')?.value || '';
  const statusFiltro = document.getElementById('reembolsosStatus')?.value || '';
  const busca =
    document.getElementById('reembolsosBusca')?.value.toLowerCase().trim() ||
    '';
  const buscaPix =
    document.getElementById('reembolsosBuscaPix')?.value.toLowerCase().trim() ||
    '';

  const filtrados = reembolsosCache.filter((item) => {
    if (usuarioSelecionado && item.ownerUid !== usuarioSelecionado)
      return false;
    const data = item.data || '';
    if (inicio && (!data || data < inicio)) return false;
    if (fim && (!data || data > fim)) return false;
    if (statusFiltro && item.status !== statusFiltro) return false;
    if (busca) {
      const campos = [
        item.apelido,
        item.loja,
        item.numero,
        item.problema,
        item.ownerNome,
        item.ownerEmail,
      ];
      const encontrou = campos.some((valor) =>
        String(valor || '')
          .toLowerCase()
          .includes(busca),
      );
      if (!encontrou) return false;
    }
    if (buscaPix) {
      const pix = String(item.pix || '').toLowerCase();
      if (!pix.includes(buscaPix)) return false;
    }
    return true;
  });

  if (reembolsosEmptyEl) {
    reembolsosEmptyEl.classList.toggle('hidden', Boolean(filtrados.length));
  }

  const baseInputClass =
    'w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500';

  filtrados.forEach((dado) => {
    const tr = document.createElement('tr');
    tr.className =
      'border-t border-slate-100 hover:bg-slate-50 odd:bg-white even:bg-slate-50';

    const mentoradoTd = document.createElement('td');
    mentoradoTd.className = 'px-4 py-3 text-sm text-slate-600';
    mentoradoTd.innerHTML = `
      <div class="flex flex-col">
        <span class="font-medium text-slate-700">${escapeHtml(
          dado.ownerNome,
        )}</span>
        <span class="text-xs text-slate-500">${escapeHtml(
          dado.ownerEmail || '',
        )}</span>
      </div>
    `;
    tr.appendChild(mentoradoTd);

    tr.appendChild(
      criarCelulaInput({
        tipo: 'date',
        valor: dado.data || '',
        classe: baseInputClass,
        onChange: (valor) => atualizarReembolso(dado, { data: valor }),
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.numero || '',
        classe: baseInputClass,
        onChange: (valor) => atualizarReembolso(dado, { numero: valor.trim() }),
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.loja || '',
        classe: baseInputClass,
        onChange: (valor) => atualizarReembolso(dado, { loja: valor.trim() }),
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.apelido || '',
        classe: baseInputClass,
        onChange: (valor) =>
          atualizarReembolso(dado, { apelido: valor.trim() }),
      }),
    );

    tr.appendChild(
      criarCelulaTextarea({
        valor: dado.problema || '',
        onChange: (valor) =>
          atualizarReembolso(dado, { problema: valor.trim() }),
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.nf || '',
        classe: baseInputClass,
        onChange: (valor) => atualizarReembolso(dado, { nf: valor.trim() }),
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.pix || '',
        classe: baseInputClass,
        onChange: (valor) => atualizarReembolso(dado, { pix: valor.trim() }),
      }),
    );

    tr.appendChild(criarCelulaValor(dado));

    tr.appendChild(
      criarCelulaSelect({
        valor: dado.status,
        classe: baseInputClass,
        opcoes: REEMBOLSO_STATUS_OPCOES,
        onChange: (valor) => atualizarReembolso(dado, { status: valor }),
      }),
    );

    const acoesTd = document.createElement('td');
    acoesTd.className = 'px-4 py-3 text-right';
    const excluirBtn = document.createElement('button');
    excluirBtn.type = 'button';
    excluirBtn.textContent = 'Excluir';
    excluirBtn.className =
      'rounded-xl border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50';
    excluirBtn.addEventListener('click', async () => {
      const confirma = window.confirm('Deseja excluir este reembolso?');
      if (!confirma) return;
      await excluirReembolso(dado);
    });
    acoesTd.appendChild(excluirBtn);
    tr.appendChild(acoesTd);

    reembolsosTableBody.appendChild(tr);
  });
}

async function atualizarPeca(dado, atualizacoes) {
  if (!dado?.ref) return;
  const ref = dado.ref;
  const atualizado = { ...dado, ...atualizacoes };
  const {
    id,
    ref: _ref,
    ownerUid,
    ownerNome,
    ownerEmail,
    responsaveis,
    ...payload
  } = atualizado;
  await setDocWithCopy(ref, payload, ownerUid, responsaveis?.financeiroUid, {
    posVendasUid: responsaveis?.posVendasUid || currentUser?.uid || null,
  });
  Object.assign(dado, atualizacoes);
}

async function atualizarReembolso(dado, atualizacoes) {
  if (!dado?.ref) return;
  const ref = dado.ref;
  const atualizado = { ...dado, ...atualizacoes };
  const {
    id,
    ref: _ref,
    ownerUid,
    ownerNome,
    ownerEmail,
    responsaveis,
    ...payload
  } = atualizado;
  await setDocWithCopy(ref, payload, ownerUid, responsaveis?.financeiroUid, {
    posVendasUid: responsaveis?.posVendasUid || currentUser?.uid || null,
  });
  Object.assign(dado, atualizacoes);
}

async function excluirPeca(dado) {
  if (!dado?.ref) return;
  try {
    await deleteDocWithCopies(dado.ref, dado.ownerUid, dado.responsaveis);
    pecasCache = pecasCache.filter((item) => item !== dado);
    renderPecas();
  } catch (err) {
    console.error('Erro ao excluir peça faltante:', err);
    window.alert('Não foi possível excluir o registro. Tente novamente.');
  }
}

async function excluirReembolso(dado) {
  if (!dado?.ref) return;
  try {
    await deleteDocWithCopies(dado.ref, dado.ownerUid, dado.responsaveis);
    reembolsosCache = reembolsosCache.filter((item) => item !== dado);
    renderReembolsos();
  } catch (err) {
    console.error('Erro ao excluir reembolso:', err);
    window.alert('Não foi possível excluir o registro. Tente novamente.');
  }
}

async function deleteDocWithCopies(ref, ownerUid, responsaveis = {}) {
  await deleteDoc(ref);
  const destinatarios = new Set([
    responsaveis?.financeiroUid,
    responsaveis?.posVendasUid,
    currentUser?.uid,
  ]);
  destinatarios.delete(null);
  destinatarios.delete(undefined);
  destinatarios.delete(ownerUid);
  if (!destinatarios.size) return;

  const segmentos = ref.path.split('/');
  const relativo = segmentos.slice(2).join('/');

  for (const uid of destinatarios) {
    const copiaRef = doc(
      ref.firestore,
      `uid/${uid}/uid/${ownerUid}/${relativo}`,
    );
    try {
      await deleteDoc(copiaRef);
    } catch (err) {
      console.warn('Erro ao remover cópia do registro:', err);
    }
  }
}

function setStatus(elemento, texto, isError) {
  if (!elemento) return;
  if (!texto) {
    elemento.classList.add('hidden');
    elemento.textContent = '';
    return;
  }
  elemento.textContent = texto;
  elemento.classList.remove('hidden');
  elemento.classList.toggle('bg-rose-50', Boolean(isError));
  elemento.classList.toggle('border-rose-200', Boolean(isError));
  elemento.classList.toggle('text-rose-700', Boolean(isError));
  elemento.classList.toggle('bg-slate-50', !isError);
  elemento.classList.toggle('border-slate-200', !isError);
  elemento.classList.toggle('text-slate-600', !isError);
}

function normalizarStatus(status) {
  return (status || '').toUpperCase().trim();
}

function ordenarPorDataNumero(a, b) {
  const dataA = a.data || '';
  const dataB = b.data || '';
  if (dataA === dataB) {
    return String(a.numero || '').localeCompare(String(b.numero || ''));
  }
  return dataA.localeCompare(dataB);
}

function aplicarCorStatus(el, status) {
  el.classList.remove(
    'bg-amber-50',
    'text-amber-700',
    'border-amber-200',
    'bg-blue-50',
    'text-blue-700',
    'border-blue-200',
    'bg-emerald-50',
    'text-emerald-700',
    'border-emerald-200',
  );
  if (status === 'RESOLVIDO') {
    el.classList.add(
      'bg-emerald-50',
      'text-emerald-700',
      'border',
      'border-emerald-200',
    );
  } else if (status === 'EM ANDAMENTO') {
    el.classList.add(
      'bg-blue-50',
      'text-blue-700',
      'border',
      'border-blue-200',
    );
  } else {
    el.classList.add(
      'bg-amber-50',
      'text-amber-700',
      'border',
      'border-amber-200',
    );
  }
}

function formatarData(str) {
  if (!str) return '';
  const [ano, mes, dia] = str.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarNumero(valor) {
  return (Number(valor) || 0).toFixed(2);
}

function criarChip(iconClass, texto) {
  const chip = document.createElement('span');
  chip.className =
    'inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600';
  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = `${iconClass} text-slate-500`;
    chip.appendChild(icon);
  }
  const textoSpan = document.createElement('span');
  textoSpan.textContent = texto;
  chip.appendChild(textoSpan);
  return chip;
}

function criarCampoEditavel(
  rotulo,
  { tipo = 'text', valor = '', onChange, prefixo, passo },
) {
  const wrapper = document.createElement('label');
  wrapper.className = 'flex flex-col gap-1 text-sm';
  const span = document.createElement('span');
  span.className =
    'text-xs font-semibold uppercase tracking-wide text-slate-500';
  span.textContent = rotulo;
  wrapper.appendChild(span);
  const input = document.createElement('input');
  input.type = tipo;
  input.value = valor ?? '';
  input.className =
    'rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500';
  if (passo) input.step = passo;
  if (tipo === 'number') input.inputMode = 'decimal';
  const handleChange = async (ev) => {
    if (!onChange) return;
    const resultado = onChange(ev.target.value, ev.target);
    if (resultado instanceof Promise) {
      await resultado;
    }
  };
  input.addEventListener('change', handleChange);
  if (prefixo) {
    input.classList.add('pl-8');
    const container = document.createElement('div');
    container.className = 'relative';
    const prefixSpan = document.createElement('span');
    prefixSpan.className =
      'pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-400';
    prefixSpan.textContent = prefixo;
    container.appendChild(prefixSpan);
    container.appendChild(input);
    wrapper.appendChild(container);
  } else {
    wrapper.appendChild(input);
  }
  return wrapper;
}

function normalizarEndereco(endereco) {
  const campos = [
    'cep',
    'rua',
    'numero',
    'bairro',
    'cidade',
    'estado',
    'complemento',
    'referencia',
  ];
  const base = {};
  campos.forEach((campo) => {
    base[campo] = '';
  });
  if (!endereco || typeof endereco !== 'object') {
    return base;
  }
  campos.forEach((campo) => {
    base[campo] = endereco[campo] ? String(endereco[campo]) : '';
  });
  return base;
}

function criarCelulaInput({ tipo, valor, onChange, classe }) {
  const td = document.createElement('td');
  td.className = 'px-4 py-3';
  const input = document.createElement('input');
  input.type = tipo;
  input.value = valor ?? '';
  input.className = classe || '';
  input.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(input);
  return td;
}

function criarCelulaSelect({ valor, opcoes, onChange, classe }) {
  const td = document.createElement('td');
  td.className = 'px-4 py-3';
  const select = document.createElement('select');
  select.className = classe || '';
  opcoes.forEach((opcao) => {
    const option = document.createElement('option');
    option.value = opcao.valor;
    option.textContent = opcao.texto;
    if (opcao.valor === valor) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(select);
  return td;
}

function criarCelulaTextarea({ valor, onChange }) {
  const td = document.createElement('td');
  td.className = 'px-4 py-3';
  const textarea = document.createElement('textarea');
  textarea.value = valor ?? '';
  textarea.rows = 2;
  textarea.className =
    'w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500 resize-y min-h-[36px]';
  textarea.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(textarea);
  return td;
}

function criarCelulaValor(dado) {
  const td = document.createElement('td');
  td.className = 'px-4 py-3';
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center justify-end gap-1';
  const span = document.createElement('span');
  span.textContent = 'R$';
  span.className = 'text-slate-500';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = formatarNumero(dado.valor);
  input.className =
    'w-28 rounded-xl border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
  input.addEventListener('change', async (ev) => {
    const novoValor = Number.parseFloat(ev.target.value);
    const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
    await atualizarReembolso(dado, { valor: valorConvertido });
    ev.target.value = formatarNumero(valorConvertido);
  });
  wrapper.appendChild(span);
  wrapper.appendChild(input);
  td.appendChild(wrapper);
  return td;
}

function escapeHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
