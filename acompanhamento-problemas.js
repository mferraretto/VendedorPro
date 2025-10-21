import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { carregarUsuariosFinanceiros } from './responsavel-financeiro.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const filtroUsuarioEl = document.getElementById('filtroUsuario');
const infoUsuariosEl = document.getElementById('infoUsuarios');
const resumoUsuariosEl = document.getElementById('resumoUsuarios');
const globalStatusEl = document.getElementById('globalStatus');

const pecasStatusMsgEl = document.getElementById('pecasStatusMsg');
const pecasEmptyEl = document.getElementById('pecasEmpty');
const pecasTabelaBody = document.getElementById('pecasTableBody');
const pecasSelecionarTodosEl = document.getElementById('pecasSelecionarTodos');
const pecasSelecaoResumoEl = document.getElementById('pecasSelecaoResumo');
const pecasExportExcelBtn = document.getElementById('pecasExportExcel');
const pecasExportPdfBtn = document.getElementById('pecasExportPdf');

const reembolsosStatusMsgEl = document.getElementById('reembolsosStatusMsg');
const reembolsosEmptyEl = document.getElementById('reembolsosEmpty');
const reembolsosTabelaBody = document.getElementById('reembolsosTableBody');
const reembolsosSelecionarTodosEl = document.getElementById(
  'reembolsosSelecionarTodos',
);
const reembolsosSelecaoResumoEl = document.getElementById(
  'reembolsosSelecaoResumo',
);
const reembolsosExportExcelBtn = document.getElementById(
  'reembolsosExportExcel',
);
const reembolsosExportPdfBtn = document.getElementById('reembolsosExportPdf');
const reembolsosStatusFiltroEl = document.getElementById('reembolsosStatus');

const REEMBOLSO_STATUS_MAPA = {
  'AGUARDANDO PIX': {
    texto: 'Aguardando PIX',
    classe: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  'AGUARDANDO MERCADO': {
    texto: 'Aguardando Mercado',
    classe: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  AGUARDANDO: {
    texto: 'Aguardando',
    classe: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  FEITO: {
    texto: 'Feito',
    classe: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  'FEITO PIX': {
    texto: 'Feito PIX',
    classe: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  'FEITO MERCADO': {
    texto: 'Feito Mercado',
    classe: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  CANCELADO: {
    texto: 'Cancelado',
    classe: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
};

let usuarios = [];
let pecasCache = [];
let reembolsosCache = [];
let usuarioSelecionado = '';
let currentUser = null;

const pecasSelecionados = new Set();
const reembolsosSelecionados = new Set();
let pecasFiltradosAtuais = [];
let reembolsosFiltradosAtuais = [];

initTabs();
registrarEventos();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  currentUser = user;
  atualizarStatusGlobal('Carregando usuários vinculados...', false);
  try {
    const resposta = await carregarUsuariosFinanceiros(db, user);
    usuarios = resposta.usuarios || [];
  } catch (err) {
    console.error('Erro ao carregar usuários financeiros:', err);
    usuarios = [
      {
        uid: user.uid,
        nome: user.displayName || user.email || 'Usuário',
        email: user.email || '',
      },
    ];
  }
  preencherSelectUsuarios();
  atualizarMensagensUsuarios();
  await carregarDados();
});

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
  if (!tabButtons.length) return;

  function setActiveTab(targetId) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === targetId;
      btn.classList.toggle('border-indigo-600', isActive);
      btn.classList.toggle('text-indigo-600', isActive);
      btn.classList.toggle('font-medium', isActive);
      btn.classList.toggle('border-transparent', !isActive);
      btn.classList.toggle('text-gray-500', !isActive);
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== targetId);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  const defaultTab = tabButtons[0]?.dataset.tab || 'tab-pecas';
  setActiveTab(defaultTab);
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
    .getElementById('reembolsosBusca')
    ?.addEventListener('input', renderReembolsos);
  reembolsosStatusFiltroEl?.addEventListener('change', renderReembolsos);

  pecasSelecionarTodosEl?.addEventListener('change', (event) => {
    const selecionar = event.target.checked;
    if (event.target.indeterminate) event.target.indeterminate = false;
    pecasFiltradosAtuais.forEach((item) => {
      const chave = obterChavePeca(item);
      if (selecionar) pecasSelecionados.add(chave);
      else pecasSelecionados.delete(chave);
    });
    renderPecas();
  });

  reembolsosSelecionarTodosEl?.addEventListener('change', (event) => {
    const selecionar = event.target.checked;
    if (event.target.indeterminate) event.target.indeterminate = false;
    reembolsosFiltradosAtuais.forEach((item) => {
      const chave = obterChaveReembolso(item);
      if (selecionar) reembolsosSelecionados.add(chave);
      else reembolsosSelecionados.delete(chave);
    });
    renderReembolsos();
  });

  pecasExportExcelBtn?.addEventListener('click', exportarPecasExcel);
  pecasExportPdfBtn?.addEventListener('click', exportarPecasPdf);
  reembolsosExportExcelBtn?.addEventListener('click', exportarReembolsosExcel);
  reembolsosExportPdfBtn?.addEventListener('click', exportarReembolsosPdf);
}

async function carregarDados() {
  atualizarStatusGlobal('Sincronizando dados dos problemas...', false);
  await Promise.all([carregarPecas(), carregarReembolsos()]);
  atualizarStatusGlobal(
    `Atualizado em ${new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    false,
  );
}

async function carregarPecas() {
  if (!usuarios.length) {
    pecasCache = [];
    renderPecas();
    return;
  }
  setStatus(pecasStatusMsgEl, 'Carregando peças faltantes...', false);
  try {
    const resultados = (
      await Promise.all(
        usuarios.map((usuario) =>
          carregarColecaoProblemas(usuario, 'pecasfaltando'),
        ),
      )
    ).flat();
    pecasCache = resultados;
    sincronizarSelecaoComCache(pecasCache, pecasSelecionados, obterChavePeca);
    setStatus(
      pecasStatusMsgEl,
      resultados.length
        ? `${resultados.length.toLocaleString('pt-BR')} registro(s) carregados.`
        : 'Nenhum registro encontrado para os usuários selecionados.',
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

async function carregarReembolsos() {
  if (!usuarios.length) {
    reembolsosCache = [];
    renderReembolsos();
    return;
  }
  setStatus(reembolsosStatusMsgEl, 'Carregando reembolsos...', false);
  try {
    const resultados = (
      await Promise.all(
        usuarios.map((usuario) =>
          carregarColecaoProblemas(usuario, 'reembolsos'),
        ),
      )
    ).flat();
    reembolsosCache = resultados;
    sincronizarSelecaoComCache(
      reembolsosCache,
      reembolsosSelecionados,
      obterChaveReembolso,
    );
    setStatus(
      reembolsosStatusMsgEl,
      resultados.length
        ? `${resultados.length.toLocaleString('pt-BR')} reembolso(s) carregados.`
        : 'Nenhum reembolso encontrado para os usuários selecionados.',
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

async function carregarColecaoProblemas(usuario, tipo) {
  if (!usuario?.uid) return [];
  try {
    const itensRef = collection(
      doc(db, 'uid', usuario.uid, 'problemas', tipo),
      'itens',
    );
    const snap = await getDocs(itensRef);
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      usuarioUid: usuario.uid,
      usuarioNome: usuario.nome || usuario.email || usuario.uid,
      usuarioEmail: usuario.email || '',
    }));
  } catch (err) {
    console.error(`Erro ao carregar ${tipo} para ${usuario.uid}:`, err);
    return [];
  }
}

function renderPecas() {
  if (!pecasTabelaBody) return;

  const inicio = document.getElementById('pecasInicio')?.value || '';
  const fim = document.getElementById('pecasFim')?.value || '';
  const statusFiltro = (
    document.getElementById('pecasStatus')?.value || ''
  ).trim();
  const busca = (
    document.getElementById('pecasBusca')?.value || ''
  ).toLowerCase();

  const filtrados = pecasCache
    .filter((item) => {
      if (usuarioSelecionado && item.usuarioUid !== usuarioSelecionado)
        return false;
      const data = item.data || '';
      if (inicio && (!data || data < inicio)) return false;
      if (fim && (!data || data > fim)) return false;
      if (statusFiltro) {
        const statusItem = normalizarStatus(item.status);
        const statusComparacao = normalizarStatus(statusFiltro);
        if (statusItem !== statusComparacao) return false;
      }
      if (busca) {
        const campos = [
          item.nomeCliente,
          item.apelido,
          item.numero,
          item.loja,
          item.peca,
          item.usuarioNome,
          item.usuarioEmail,
        ];
        const contemBusca = campos.some((valor) =>
          String(valor || '')
            .toLowerCase()
            .includes(busca),
        );
        if (!contemBusca) return false;
      }
      return true;
    })
    .sort((a, b) => ordenarPorDataNumero(b, a));

  pecasFiltradosAtuais = filtrados;
  pecasTabelaBody.innerHTML = '';
  filtrados.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';

    const chave = obterChavePeca(item);
    const checkboxTd = document.createElement('td');
    checkboxTd.className = 'px-4 py-3';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className =
      'form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500';
    checkbox.checked = pecasSelecionados.has(chave);
    checkbox.dataset.chave = chave;
    checkbox.addEventListener('change', (event) => {
      if (event.target.checked) pecasSelecionados.add(chave);
      else pecasSelecionados.delete(chave);
      atualizarSelecaoPecasUI();
    });
    checkboxTd.appendChild(checkbox);
    tr.appendChild(checkboxTd);

    const status = normalizarStatus(item.status);
    const statusTexto = formatarStatus(status);
    const statusClasses = obterClasseStatus(status);

    const clienteHtml = item.nomeCliente
      ? `<div class="flex flex-col"><span class="font-medium text-gray-700">${escapeHtml(
          item.nomeCliente,
        )}</span>${item.apelido ? `<span class="text-xs text-gray-500">${escapeHtml(item.apelido)}</span>` : ''}</div>`
      : escapeHtml(item.apelido || '-');

    const responsavelEmail = item.usuarioEmail
      ? `<span class="text-xs text-gray-500">${escapeHtml(item.usuarioEmail)}</span>`
      : '';

    const dataFormatada = formatarData(item.data);
    const valorFormatado = formatarMoeda(Number(item.valorGasto) || 0);

    tr.insertAdjacentHTML(
      'beforeend',
      `
        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${dataFormatada}</td>
        <td class="px-4 py-3">
          <div class="flex flex-col">
            <span class="font-medium text-gray-700">${escapeHtml(item.usuarioNome)}</span>
            ${responsavelEmail}
          </div>
        </td>
        <td class="px-4 py-3">${clienteHtml}</td>
        <td class="px-4 py-3">${escapeHtml(item.numero || '-')}</td>
        <td class="px-4 py-3">${escapeHtml(item.loja || '-')}</td>
        <td class="px-4 py-3">${escapeHtml(item.peca || '-')}</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses}">
            ${statusTexto}
          </span>
        </td>
        <td class="px-4 py-3 text-right font-medium text-gray-700">${valorFormatado}</td>
      `,
    );

    pecasTabelaBody.appendChild(tr);
  });

  pecasEmptyEl?.classList.toggle('hidden', filtrados.length > 0);
  atualizarResumoPecas(filtrados);
  atualizarSelecaoPecasUI();
}

function renderReembolsos() {
  if (!reembolsosTabelaBody) return;

  const inicio = document.getElementById('reembolsosInicio')?.value || '';
  const fim = document.getElementById('reembolsosFim')?.value || '';
  const busca = (
    document.getElementById('reembolsosBusca')?.value || ''
  ).toLowerCase();
  const statusFiltro = (reembolsosStatusFiltroEl?.value || '').toUpperCase();

  const filtrados = reembolsosCache
    .filter((item) => {
      if (usuarioSelecionado && item.usuarioUid !== usuarioSelecionado)
        return false;
      const data = item.data || '';
      if (inicio && (!data || data < inicio)) return false;
      if (fim && (!data || data > fim)) return false;
      if (statusFiltro) {
        const statusItem = (item.status || '').toString().toUpperCase();
        if (statusItem !== statusFiltro) return false;
      }
      if (busca) {
        const campos = [
          item.numero,
          item.apelido,
          item.nf,
          item.loja,
          item.pix,
          item.usuarioNome,
          item.usuarioEmail,
        ];
        const contemBusca = campos.some((valor) =>
          String(valor || '')
            .toLowerCase()
            .includes(busca),
        );
        if (!contemBusca) return false;
      }
      return true;
    })
    .sort((a, b) => ordenarPorDataNumero(b, a));

  reembolsosFiltradosAtuais = filtrados;
  reembolsosTabelaBody.innerHTML = '';
  filtrados.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';

    const chave = obterChaveReembolso(item);
    const checkboxTd = document.createElement('td');
    checkboxTd.className = 'px-4 py-3';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className =
      'form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500';
    checkbox.checked = reembolsosSelecionados.has(chave);
    checkbox.dataset.chave = chave;
    checkbox.addEventListener('change', (event) => {
      if (event.target.checked) reembolsosSelecionados.add(chave);
      else reembolsosSelecionados.delete(chave);
      atualizarSelecaoReembolsosUI();
    });
    checkboxTd.appendChild(checkbox);
    tr.appendChild(checkboxTd);

    const responsavelEmail = item.usuarioEmail
      ? `<span class="text-xs text-gray-500">${escapeHtml(item.usuarioEmail)}</span>`
      : '';

    const dataFormatada = formatarData(item.data);
    const valorFormatado = formatarMoeda(Number(item.valor) || 0);
    const statusReembolso = (item.status || '').toString().toUpperCase();
    const statusTexto = formatarStatusReembolso(statusReembolso);
    const statusClasse = obterClasseStatusReembolso(statusReembolso);

    tr.insertAdjacentHTML(
      'beforeend',
      `
        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${dataFormatada}</td>
        <td class="px-4 py-3">
          <div class="flex flex-col">
            <span class="font-medium text-gray-700">${escapeHtml(item.usuarioNome)}</span>
            ${responsavelEmail}
          </div>
        </td>
        <td class="px-4 py-3">${escapeHtml(item.numero || '-')}</td>
        <td class="px-4 py-3">${escapeHtml(item.apelido || '-')}</td>
        <td class="px-4 py-3">${escapeHtml(item.nf || '-')}</td>
        <td class="px-4 py-3">${escapeHtml(item.loja || '-')}</td>
        <td class="px-4 py-3 text-right font-medium text-gray-700">${valorFormatado}</td>
        <td class="px-4 py-3">${escapeHtml(item.pix || '-')}</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasse}">
            ${statusTexto}
          </span>
        </td>
      `,
    );

    reembolsosTabelaBody.appendChild(tr);
  });

  reembolsosEmptyEl?.classList.toggle('hidden', filtrados.length > 0);
  atualizarResumoReembolsos(filtrados);
  atualizarSelecaoReembolsosUI();
}

function atualizarSelecaoPecasUI() {
  atualizarResumoSelecao(pecasSelecaoResumoEl, pecasSelecionados.size);
  atualizarBotoesExportacao(
    pecasExportExcelBtn,
    pecasExportPdfBtn,
    pecasSelecionados.size,
  );
  atualizarSelectAllCheckbox(
    pecasSelecionarTodosEl,
    pecasFiltradosAtuais,
    pecasSelecionados,
    obterChavePeca,
  );
}

function atualizarSelecaoReembolsosUI() {
  atualizarResumoSelecao(
    reembolsosSelecaoResumoEl,
    reembolsosSelecionados.size,
  );
  atualizarBotoesExportacao(
    reembolsosExportExcelBtn,
    reembolsosExportPdfBtn,
    reembolsosSelecionados.size,
  );
  atualizarSelectAllCheckbox(
    reembolsosSelecionarTodosEl,
    reembolsosFiltradosAtuais,
    reembolsosSelecionados,
    obterChaveReembolso,
  );
}

function atualizarResumoSelecao(elemento, quantidade) {
  if (!elemento) return;
  if (quantidade > 0) {
    const texto =
      quantidade === 1
        ? '1 registro selecionado'
        : `${quantidade.toLocaleString('pt-BR')} registros selecionados`;
    elemento.textContent = texto;
    elemento.classList.remove('hidden');
  } else {
    elemento.textContent = '';
    elemento.classList.add('hidden');
  }
}

function atualizarBotoesExportacao(botaoExcel, botaoPdf, quantidade) {
  const disabled = quantidade === 0;
  if (botaoExcel) botaoExcel.disabled = disabled;
  if (botaoPdf) botaoPdf.disabled = disabled;
}

function atualizarSelectAllCheckbox(
  checkboxEl,
  filtrados,
  selecionadosSet,
  chaveFn,
) {
  if (!checkboxEl) return;
  const lista = Array.isArray(filtrados) ? filtrados : [];
  const total = lista.length;
  checkboxEl.disabled = total === 0;
  if (total === 0) {
    checkboxEl.checked = false;
    checkboxEl.indeterminate = false;
    return;
  }

  const selecionados = lista.reduce((acc, item) => {
    const chave = chaveFn(item);
    return acc + (selecionadosSet.has(chave) ? 1 : 0);
  }, 0);

  checkboxEl.checked = selecionados === total && total > 0;
  checkboxEl.indeterminate =
    selecionados > 0 && selecionados < total && !checkboxEl.checked;
}

function sincronizarSelecaoComCache(cache, selecionadosSet, chaveFn) {
  if (!Array.isArray(cache)) return;
  const chavesValidas = new Set(cache.map((item) => chaveFn(item)));
  selecionadosSet.forEach((chave) => {
    if (!chavesValidas.has(chave)) selecionadosSet.delete(chave);
  });
}

function obterChavePeca(item) {
  if (!item) return 'peca';
  return [
    'peca',
    item.usuarioUid || '',
    item.id || '',
    item.numero || '',
    item.data || '',
    item.loja || '',
    item.peca || '',
  ].join('::');
}

function obterChaveReembolso(item) {
  if (!item) return 'reembolso';
  return [
    'reembolso',
    item.usuarioUid || '',
    item.id || '',
    item.numero || '',
    item.nf || '',
    item.data || '',
    item.loja || '',
  ].join('::');
}

function obterRegistrosSelecionados(cache, selecionadosSet, chaveFn) {
  if (!Array.isArray(cache) || selecionadosSet.size === 0) return [];
  const mapa = new Map();
  cache.forEach((item) => {
    mapa.set(chaveFn(item), item);
  });
  return Array.from(selecionadosSet)
    .map((chave) => mapa.get(chave))
    .filter(Boolean)
    .sort((a, b) => ordenarPorDataNumero(b, a));
}

function gerarNomeArquivo(base, extensao) {
  const data = new Date().toISOString().slice(0, 10);
  return `${base}_${data}.${extensao}`;
}

function exportarPecasExcel() {
  const registros = obterRegistrosSelecionados(
    pecasCache,
    pecasSelecionados,
    obterChavePeca,
  );
  if (!registros.length) {
    alert('Selecione ao menos um registro de peça faltante para exportar.');
    return;
  }

  const headers = [
    'Data',
    'Responsável',
    'E-mail',
    'Cliente',
    'Apelido',
    'Número',
    'Loja',
    'Peça',
    'Status',
    'Valor gasto (R$)',
  ];
  const linhas = registros.map((item) => [
    formatarData(item.data),
    item.usuarioNome || '',
    item.usuarioEmail || '',
    item.nomeCliente || '',
    item.apelido || '',
    item.numero || '',
    item.loja || '',
    item.peca || '',
    formatarStatus(normalizarStatus(item.status)),
    Number(item.valorGasto) || 0,
  ]);

  exportarExcel(
    gerarNomeArquivo('pecas_faltantes', 'xlsx'),
    'Peças faltantes',
    headers,
    linhas,
  );
}

function exportarPecasPdf() {
  const registros = obterRegistrosSelecionados(
    pecasCache,
    pecasSelecionados,
    obterChavePeca,
  );
  if (!registros.length) {
    alert('Selecione ao menos um registro de peça faltante para exportar.');
    return;
  }

  const headers = [
    'Data',
    'Responsável',
    'E-mail',
    'Cliente',
    'Número',
    'Loja',
    'Peça',
    'Status',
    'Valor gasto',
  ];
  const linhas = registros.map((item) => [
    formatarData(item.data),
    item.usuarioNome || '',
    item.usuarioEmail || '',
    item.nomeCliente || item.apelido || '',
    item.numero || '',
    item.loja || '',
    item.peca || '',
    formatarStatus(normalizarStatus(item.status)),
    formatarMoeda(Number(item.valorGasto) || 0),
  ]);

  exportarPDF(
    'Peças faltantes selecionadas',
    headers,
    linhas,
    gerarNomeArquivo('pecas_faltantes', 'pdf'),
  );
}

function exportarReembolsosExcel() {
  const registros = obterRegistrosSelecionados(
    reembolsosCache,
    reembolsosSelecionados,
    obterChaveReembolso,
  );
  if (!registros.length) {
    alert('Selecione ao menos um reembolso para exportar.');
    return;
  }

  const headers = [
    'Data',
    'Responsável',
    'E-mail',
    'Número do pedido',
    'Apelido',
    'NF',
    'Loja',
    'Valor (R$)',
    'PIX',
    'Status',
  ];
  const linhas = registros.map((item) => [
    formatarData(item.data),
    item.usuarioNome || '',
    item.usuarioEmail || '',
    item.numero || '',
    item.apelido || '',
    item.nf || '',
    item.loja || '',
    Number(item.valor) || 0,
    item.pix || '',
    formatarStatusReembolso((item.status || '').toString().toUpperCase()),
  ]);

  exportarExcel(
    gerarNomeArquivo('reembolsos', 'xlsx'),
    'Reembolsos',
    headers,
    linhas,
  );
}

function exportarReembolsosPdf() {
  const registros = obterRegistrosSelecionados(
    reembolsosCache,
    reembolsosSelecionados,
    obterChaveReembolso,
  );
  if (!registros.length) {
    alert('Selecione ao menos um reembolso para exportar.');
    return;
  }

  const headers = [
    'Data',
    'Responsável',
    'E-mail',
    'Número do pedido',
    'Apelido',
    'NF',
    'Loja',
    'Valor',
    'PIX',
    'Status',
  ];
  const linhas = registros.map((item) => [
    formatarData(item.data),
    item.usuarioNome || '',
    item.usuarioEmail || '',
    item.numero || '',
    item.apelido || '',
    item.nf || '',
    item.loja || '',
    formatarMoeda(Number(item.valor) || 0),
    item.pix || '',
    formatarStatusReembolso((item.status || '').toString().toUpperCase()),
  ]);

  exportarPDF(
    'Reembolsos selecionados',
    headers,
    linhas,
    gerarNomeArquivo('reembolsos', 'pdf'),
  );
}

function exportarExcel(nomeArquivo, nomeAba, headers, linhas) {
  if (typeof XLSX === 'undefined') {
    alert(
      'Biblioteca de planilhas não foi carregada. Recarregue a página e tente novamente.',
    );
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...linhas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeAba);
  XLSX.writeFile(wb, nomeArquivo);
}

function exportarPDF(titulo, headers, linhas, nomeArquivo) {
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    alert(
      'Biblioteca de PDF não foi carregada. Recarregue a página e tente novamente.',
    );
    return;
  }
  const doc = new window.jspdf.jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  if (typeof doc.autoTable !== 'function') {
    alert(
      'Extensão de tabelas para PDF não foi carregada. Recarregue a página.',
    );
    return;
  }

  doc.setFontSize(12);
  doc.text(titulo, 14, 15);
  doc.autoTable({
    head: [headers],
    body: linhas,
    startY: 20,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
  });
  doc.save(nomeArquivo);
}

function atualizarResumoPecas(lista) {
  document.getElementById('pecasResumoTotal').textContent =
    lista.length.toLocaleString('pt-BR');

  const contagem = {
    naoFeito: 0,
    emAndamento: 0,
    resolvido: 0,
  };
  let totalValor = 0;

  lista.forEach((item) => {
    const status = normalizarStatus(item.status);
    if (status === 'RESOLVIDO') contagem.resolvido += 1;
    else if (status === 'EM ANDAMENTO') contagem.emAndamento += 1;
    else contagem.naoFeito += 1;
    totalValor += Number(item.valorGasto) || 0;
  });

  document.getElementById('pecasResumoNaoFeito').textContent =
    contagem.naoFeito.toLocaleString('pt-BR');
  document.getElementById('pecasResumoEmAndamento').textContent =
    contagem.emAndamento.toLocaleString('pt-BR');
  document.getElementById('pecasResumoResolvido').textContent =
    contagem.resolvido.toLocaleString('pt-BR');
  document.getElementById('pecasResumoValor').textContent =
    formatarMoeda(totalValor);
}

function atualizarResumoReembolsos(lista) {
  document.getElementById('reembolsosResumoTotal').textContent =
    lista.length.toLocaleString('pt-BR');
  const totalValor = lista.reduce(
    (acc, item) => acc + (Number(item.valor) || 0),
    0,
  );
  document.getElementById('reembolsosResumoValor').textContent =
    formatarMoeda(totalValor);
  const ticket = lista.length ? totalValor / lista.length : 0;
  document.getElementById('reembolsosResumoMedio').textContent =
    formatarMoeda(ticket);
  const ultimo = lista.reduce((maior, item) => {
    if (!item.data) return maior;
    if (!maior || item.data > maior) return item.data;
    return maior;
  }, '');
  document.getElementById('reembolsosResumoRecente').textContent = ultimo
    ? formatarData(ultimo)
    : '-';
}

function preencherSelectUsuarios() {
  if (!filtroUsuarioEl) return;
  filtroUsuarioEl.innerHTML = '';
  const optionTodos = document.createElement('option');
  optionTodos.value = '';
  optionTodos.textContent = 'Todos os usuários conectados';
  filtroUsuarioEl.appendChild(optionTodos);

  usuarios.forEach((usuario) => {
    const option = document.createElement('option');
    option.value = usuario.uid;
    const nome = usuario.nome || usuario.email || usuario.uid;
    option.textContent = usuario.email ? `${nome} (${usuario.email})` : nome;
    filtroUsuarioEl.appendChild(option);
  });

  filtroUsuarioEl.value = '';
  usuarioSelecionado = '';
}

function atualizarMensagensUsuarios() {
  if (infoUsuariosEl) {
    if (usuarios.length > 1) {
      infoUsuariosEl.textContent = `Visualize os problemas cadastrados por ${usuarios.length} usuários vinculados ao seu e-mail de responsável financeiro.`;
    } else {
      infoUsuariosEl.textContent =
        'Visualize os problemas cadastrados na aba Problemas com o seu usuário.';
    }
  }
  if (resumoUsuariosEl) {
    const extras = usuarios.filter((u) => u.uid !== currentUser?.uid);
    if (extras.length) {
      resumoUsuariosEl.textContent = `Consolidando registros do seu usuário e de ${extras.length} mentorado(s)/vendedor(es) conectados.`;
    } else {
      resumoUsuariosEl.textContent =
        'Nenhum outro usuário está vinculado ao seu e-mail de responsável financeiro.';
    }
  }
}

function setStatus(elemento, texto, isError) {
  if (!elemento) return;
  elemento.textContent = texto || '';
  elemento.classList.toggle('text-red-600', Boolean(isError));
  elemento.classList.toggle('text-gray-500', !isError);
}

function atualizarStatusGlobal(texto, isError) {
  if (!globalStatusEl) return;
  globalStatusEl.textContent = texto || '';
  globalStatusEl.classList.toggle('text-red-600', Boolean(isError));
  globalStatusEl.classList.toggle('text-gray-500', !isError);
}

function normalizarStatus(status) {
  const valor = (status || '').toString().toUpperCase();
  if (valor === 'NAO FEITO' || valor === 'NÃO FEITO') return 'NÃO FEITO';
  if (valor === 'EM ANDAMENTO') return 'EM ANDAMENTO';
  if (valor === 'RESOLVIDO') return 'RESOLVIDO';
  return valor || 'NÃO INFORMADO';
}

function formatarStatus(status) {
  switch (status) {
    case 'RESOLVIDO':
      return 'Resolvido';
    case 'EM ANDAMENTO':
      return 'Em andamento';
    case 'NÃO FEITO':
    case 'NAO FEITO':
      return 'Não feito';
    default:
      return status && status !== 'NÃO INFORMADO' ? status : 'Não informado';
  }
}

function formatarStatusReembolso(status) {
  const statusNormalizado = status?.toString().toUpperCase() || '';
  if (REEMBOLSO_STATUS_MAPA[statusNormalizado])
    return REEMBOLSO_STATUS_MAPA[statusNormalizado].texto;
  if (!statusNormalizado) return 'Não informado';
  const texto = statusNormalizado
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letra) => letra.toUpperCase());
  return texto;
}

function obterClasseStatusReembolso(status) {
  const statusNormalizado = status?.toString().toUpperCase() || '';
  if (REEMBOLSO_STATUS_MAPA[statusNormalizado])
    return REEMBOLSO_STATUS_MAPA[statusNormalizado].classe;
  return 'bg-gray-100 text-gray-600 border border-gray-200';
}

function obterClasseStatus(status) {
  if (status === 'RESOLVIDO')
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (status === 'EM ANDAMENTO')
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  return 'bg-amber-50 text-amber-700 border border-amber-200';
}

function ordenarPorDataNumero(a, b) {
  const dataA = a?.data || '';
  const dataB = b?.data || '';
  if (dataA && dataB && dataA !== dataB) return dataA.localeCompare(dataB);
  const numeroA = (a?.numero || '').toString();
  const numeroB = (b?.numero || '').toString();
  return numeroA.localeCompare(numeroB);
}

function formatarData(valor) {
  if (!valor) return '-';
  const dataStr = valor.split('T')[0];
  const [ano, mes, dia] = dataStr.split('-');
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function escapeHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
