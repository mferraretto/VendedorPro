import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  addDoc,
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
const gerarRelatorioBtn = document.getElementById('gerarRelatorioProblemas');

const pecasStatusMsgEl = document.getElementById('pecasStatusMsg');
const pecasEmptyEl = document.getElementById('pecasEmpty');
const pecasTabelaBody = document.getElementById('pecasTableBody');
const pecasSelecionarTodosEl = document.getElementById('pecasSelecionarTodos');
const pecasSelecaoResumoEl = document.getElementById('pecasSelecaoResumo');
const pecasExportExcelBtn = document.getElementById('pecasExportExcel');
const pecasExportPdfBtn = document.getElementById('pecasExportPdf');
const pecasModeloExcelBtn = document.getElementById('pecasModeloExcel');
const pecasImportInput = document.getElementById('pecasImportarXlsx');

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
const reembolsosModeloExcelBtn = document.getElementById('reembolsosModeloExcel');
const reembolsosImportInput = document.getElementById('reembolsosImportarXlsx');

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
  pecasModeloExcelBtn?.addEventListener('click', baixarModeloPecasExcel);
  pecasImportInput?.addEventListener('change', importarPecasMassa);
  reembolsosExportExcelBtn?.addEventListener('click', exportarReembolsosExcel);
  reembolsosExportPdfBtn?.addEventListener('click', exportarReembolsosPdf);
  reembolsosModeloExcelBtn?.addEventListener('click', baixarModeloReembolsosExcel);
  reembolsosImportInput?.addEventListener('change', importarReembolsosMassa);
  gerarRelatorioBtn?.addEventListener('click', gerarRelatorioCompleto);
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
        <td class="px-4 py-3">${escapeHtml(item.problema || '-')}</td>
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
        <td class="px-4 py-3">${escapeHtml(item.problema || item.motivo || '-')}</td>
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
    'Problema',
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
    item.problema || '',
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
    'Problema',
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
    item.problema || '',
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
    'Problema',
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
    item.problema || item.motivo || '',
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
    'Problema',
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
    item.problema || item.motivo || '',
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

function gerarRelatorioCompleto() {
  const pecas = Array.isArray(pecasFiltradosAtuais)
    ? [...pecasFiltradosAtuais]
    : [];
  const reembolsos = Array.isArray(reembolsosFiltradosAtuais)
    ? [...reembolsosFiltradosAtuais]
    : [];

  if (!pecas.length && !reembolsos.length) {
    alert(
      'Nenhum registro foi encontrado com os filtros atuais para gerar o relatório.',
    );
    return;
  }

  const periodo = obterPeriodoSelecionado();
  const usuarioFiltro = obterDescricaoUsuarioSelecionado();

  const totalGastoPecas = pecas.reduce(
    (acc, item) => acc + (Number(item.valorGasto) || 0),
    0,
  );
  const totalGastoReembolsos = reembolsos.reduce(
    (acc, item) => acc + (Number(item.valor) || 0),
    0,
  );

  const principaisPecas = agruparMetricas(
    pecas,
    (item) => item.peca,
    (item) => Number(item.valorGasto) || 0,
  ).slice(0, 5);

  // Principais problemas (por valor) e problemas mais recorrentes (por quantidade)
  const todosProblemas = [
    ...pecas.map((p) => ({ problema: p.problema || 'Não informado', valor: Number(p.valorGasto) || 0 })),
    ...reembolsos.map((r) => ({ problema: r.problema || r.motivo || 'Não informado', valor: Number(r.valor) || 0 })),
  ];
  const agrupadosProblemas = agruparMetricas(
    todosProblemas,
    (i) => i.problema,
    (i) => i.valor,
  );
  const principaisProblemas = agrupadosProblemas.slice(0, 5);
  const problemasRecorrentes = [...agrupadosProblemas].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);
  const problemasMaiorGasto = [...agrupadosProblemas].sort((a, b) => b.valor - a.valor).slice(0, 5);

  const principaisLojas = agruparMetricas(
    pecas,
    (item) => item.loja,
    (item) => Number(item.valorGasto) || 0,
  ).slice(0, 5);

  const statusReembolsos = agruparMetricas(
    reembolsos,
    (item) => (item.status || '').toString().toUpperCase(),
    (item) => Number(item.valor) || 0,
    (chave) => formatarStatusReembolso(chave),
  ).slice(0, 5);

  const maioresGastos = [
    ...pecas.map((item) => ({
      tipo: 'Peça faltante',
      descricao: item.peca || item.numero || item.nomeCliente || 'Não informado',
      responsavel: item.usuarioNome || '-',
      data: item.data || '',
      loja: item.loja || '-',
      valor: Number(item.valorGasto) || 0,
    })),
    ...reembolsos.map((item) => ({
      tipo: 'Reembolso',
      descricao: item.numero || item.apelido || item.loja || 'Não informado',
      responsavel: item.usuarioNome || '-',
      data: item.data || '',
      loja: item.loja || '-',
      valor: Number(item.valor) || 0,
    })),
  ]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  const evolucaoPecas = agruparPorData(pecas);
  const evolucaoReembolsos = agruparPorData(reembolsos);
  const datasEvolucao = Array.from(
    new Set([
      ...Object.keys(evolucaoPecas),
      ...Object.keys(evolucaoReembolsos),
    ]),
  ).sort();

  const dadosGraficos = {
    evolucao: {
      labels: datasEvolucao.map((data) => formatarData(data)),
      pecas: datasEvolucao.map((data) => evolucaoPecas[data] || 0),
      reembolsos: datasEvolucao.map((data) => evolucaoReembolsos[data] || 0),
    },
    topPecas: {
      labels: principaisPecas.map((item) => item.rotulo),
      valores: principaisPecas.map((item) => item.quantidade),
    },
    topGastos: {
      labels: maioresGastos.map((item) => limitarTexto(`${item.tipo}: ${item.descricao}`, 40)),
      valores: maioresGastos.map((item) => Number(item.valor.toFixed(2))),
    },
  };

  const dadosRelatorio = {
    periodo,
    usuarioFiltro,
    totais: {
      pecas: pecas.length,
      reembolsos: reembolsos.length,
      geral: pecas.length + reembolsos.length,
      gastoPecas: totalGastoPecas,
      gastoReembolsos: totalGastoReembolsos,
      gastoTotal: totalGastoPecas + totalGastoReembolsos,
    },
    principaisPecas,
    principaisProblemas,
    problemasRecorrentes,
    problemasMaiorGasto,
    principaisLojas,
    statusReembolsos,
    maioresGastos,
    graficos: dadosGraficos,
    geradoEm: new Date().toLocaleString('pt-BR'),
  };

  const janela = window.open('', '_blank');
  if (!janela) {
    alert(
      'Não foi possível abrir a janela do relatório. Verifique o bloqueador de pop-ups.',
    );
    return;
  }

  janela.document.write(gerarHtmlRelatorio(dadosRelatorio));
  janela.document.close();
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

function baixarModeloPecasExcel() {
  const headers = [
    'data (AAAA-MM-DD)',
    'responsavel_nome',
    'responsavel_email',
    'cliente',
    'apelido',
    'numero',
    'loja',
    'peca',
    'problema',
    'status (NÃO FEITO|EM ANDAMENTO|RESOLVIDO)',
    'valor_gasto (R$)',
  ];
  const exemplo = [
    '2025-01-15',
    'João Silva',
    'joao@exemplo.com',
    'Cliente Exemplo',
    'MK01',
    '123456',
    'Loja X',
    'Fiação',
    'Fiação com defeito',
    'NÃO FEITO',
    25.5,
  ];
  exportarExcel(gerarNomeArquivo('modelo_pecas_faltantes', 'xlsx'), 'Modelo', headers, [exemplo]);
}

function baixarModeloReembolsosExcel() {
  const headers = [
    'data (AAAA-MM-DD)',
    'responsavel_nome',
    'responsavel_email',
    'numero',
    'apelido',
    'nf',
    'loja',
    'problema',
    'valor (R$)',
    'pix',
    'status (AGUARDANDO|AGUARDANDO PIX|AGUARDANDO MERCADO|FEITO|FEITO PIX|FEITO MERCADO|CANCELADO)',
  ];
  const exemplo = [
    '2025-01-15',
    'João Silva',
    'joao@exemplo.com',
    '987654',
    'MK01',
    '12345',
    'Loja X',
    'Reembolso por defeito',
    50.0,
    'chave-pix-aqui',
    'AGUARDANDO',
  ];
  exportarExcel(gerarNomeArquivo('modelo_reembolsos', 'xlsx'), 'Modelo', headers, [exemplo]);
}

async function importarPecasMassa(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const rows = await lerPlanilha(file);
    if (!rows.length) {
      alert('Nenhuma linha encontrada na planilha.');
      return;
    }
    const itensRef = collection(doc(db, 'uid', currentUser.uid, 'problemas', 'pecasfaltando'), 'itens');
    let inseridos = 0;
    for (const r of rows) {
      const registro = normalizarLinhaPeca(r);
      await addDoc(itensRef, registro);
      inseridos += 1;
    }
    alert(`${inseridos} registro(s) importado(s) com sucesso.`);
    await carregarPecas();
  } catch (err) {
    console.error('Erro ao importar peças:', err);
    alert('Erro ao importar a planilha de peças. Verifique o arquivo.');
  }
}

async function importarReembolsosMassa(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const rows = await lerPlanilha(file);
    if (!rows.length) {
      alert('Nenhuma linha encontrada na planilha.');
      return;
    }
    const itensRef = collection(doc(db, 'uid', currentUser.uid, 'problemas', 'reembolsos'), 'itens');
    let inseridos = 0;
    for (const r of rows) {
      const registro = normalizarLinhaReembolso(r);
      await addDoc(itensRef, registro);
      inseridos += 1;
    }
    alert(`${inseridos} reembolso(s) importado(s) com sucesso.`);
    await carregarReembolsos();
  } catch (err) {
    console.error('Erro ao importar reembolsos:', err);
    alert('Erro ao importar a planilha de reembolsos. Verifique o arquivo.');
  }
}

function lerPlanilha(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha na leitura do arquivo'));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve(json);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function normalizarDataISO(valor) {
  const v = String(valor || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [d, m, a] = v.split('/');
    return `${a}-${m}-${d}`;
  }
  return v;
}

function normalizarLinhaPeca(r) {
  return {
    data: normalizarDataISO(r['data (AAAA-MM-DD)'] || r.data || r['Data']),
    usuarioNome: r.responsavel_nome || r['responsavel_nome'] || '',
    usuarioEmail: r.responsavel_email || r['responsavel_email'] || '',
    nomeCliente: r.cliente || r['cliente'] || '',
    apelido: r.apelido || r['apelido'] || '',
    numero: r.numero || r['numero'] || '',
    loja: r.loja || r['loja'] || '',
    peca: r.peca || r['peca'] || '',
    problema: r.problema || r['problema'] || '',
    status: (r.status || r['status'] || '').toString().toUpperCase(),
    valorGasto: Number(r['valor_gasto (R$)'] || r.valor_gasto || r['valor']) || 0,
  };
}

function normalizarLinhaReembolso(r) {
  return {
    data: normalizarDataISO(r['data (AAAA-MM-DD)'] || r.data || r['Data']),
    usuarioNome: r.responsavel_nome || r['responsavel_nome'] || '',
    usuarioEmail: r.responsavel_email || r['responsavel_email'] || '',
    numero: r.numero || r['numero'] || '',
    apelido: r.apelido || r['apelido'] || '',
    nf: r.nf || r['nf'] || '',
    loja: r.loja || r['loja'] || '',
    problema: r.problema || r['problema'] || r.motivo || '',
    valor: Number(r['valor (R$)'] || r.valor || 0) || 0,
    pix: r.pix || r['pix'] || '',
    status: (r.status || r['status'] || '').toString().toUpperCase(),
  };
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

function obterPeriodoSelecionado() {
  const pecasInicio = document.getElementById('pecasInicio')?.value || '';
  const pecasFim = document.getElementById('pecasFim')?.value || '';
  const reembolsosInicio = document.getElementById('reembolsosInicio')?.value || '';
  const reembolsosFim = document.getElementById('reembolsosFim')?.value || '';

  const datasInicio = [pecasInicio, reembolsosInicio]
    .filter(Boolean)
    .sort();
  const datasFim = [pecasFim, reembolsosFim]
    .filter(Boolean)
    .sort();

  const inicio = datasInicio[0] || '';
  const fim = datasFim.length ? datasFim[datasFim.length - 1] : '';

  let texto = 'Período completo';
  if (inicio && fim) texto = `De ${formatarData(inicio)} até ${formatarData(fim)}`;
  else if (inicio) texto = `A partir de ${formatarData(inicio)}`;
  else if (fim) texto = `Até ${formatarData(fim)}`;

  return { texto, inicio: inicio || null, fim: fim || null };
}

function obterDescricaoUsuarioSelecionado() {
  if (!usuarioSelecionado) return 'Todos os usuários conectados';
  const usuario = usuarios.find((u) => u.uid === usuarioSelecionado);
  if (!usuario) return 'Usuário selecionado';
  const nome = usuario.nome || '';
  const email = usuario.email || '';
  if (nome && email) return `${nome} (${email})`;
  return nome || email || usuario.uid || 'Usuário selecionado';
}

function agruparMetricas(lista, chaveFn, valorFn, rotuloFn) {
  if (!Array.isArray(lista) || !lista.length) return [];
  const mapa = new Map();
  const valorFnNormalizado = typeof valorFn === 'function' ? valorFn : () => 0;

  lista.forEach((item) => {
    const chaveOriginal = typeof chaveFn === 'function' ? chaveFn(item) : undefined;
    const chaveBase = (chaveOriginal ?? 'Não informado').toString().trim();
    const chaveNormalizada = chaveBase || 'Não informado';
    const valor = Number(valorFnNormalizado(item)) || 0;

    if (!mapa.has(chaveNormalizada)) {
      const rotuloCalculado = rotuloFn
        ? rotuloFn(chaveNormalizada, item)
        : chaveNormalizada;
      mapa.set(chaveNormalizada, {
        chave: chaveNormalizada,
        rotulo: rotuloCalculado || 'Não informado',
        quantidade: 0,
        valor: 0,
      });
    }

    const entrada = mapa.get(chaveNormalizada);
    entrada.quantidade += 1;
    entrada.valor += valor;
  });

  return Array.from(mapa.values()).sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return b.valor - a.valor;
  });
}

function agruparPorData(lista) {
  const resultado = {};
  if (!Array.isArray(lista)) return resultado;
  lista.forEach((item) => {
    const data = (item?.data || '').split('T')[0];
    if (!data) return;
    resultado[data] = (resultado[data] || 0) + 1;
  });
  return resultado;
}

function limitarTexto(texto, limite = 50) {
  const valor = (texto || '').toString();
  if (valor.length <= limite) return valor;
  return `${valor.slice(0, Math.max(0, limite - 1))}…`;
}

function gerarHtmlRelatorio(dados) {
  const periodoTexto = dados?.periodo?.texto || 'Período completo';
  const usuarioFiltro = dados?.usuarioFiltro || 'Todos os usuários conectados';
  const totais = dados?.totais || {};
  const principaisPecas = dados?.principaisPecas || [];
  const principaisProblemas = dados?.principaisProblemas || [];
  const problemasRecorrentes = dados?.problemasRecorrentes || [];
  const problemasMaiorGasto = dados?.problemasMaiorGasto || [];
  const principaisLojas = dados?.principaisLojas || [];
  const statusReembolsos = dados?.statusReembolsos || [];
  const maioresGastos = dados?.maioresGastos || [];
  const graficos = dados?.graficos || {};
  const geradoEm = dados?.geradoEm || new Date().toLocaleString('pt-BR');

  const formatarQuantidade = (valor) => Number(valor || 0).toLocaleString('pt-BR');
  const formatarMoedaBRL = (valor) => formatarMoeda(Number(valor) || 0);

  const criarLinhasTabela = (lista, colunasVazias) => {
    if (!lista.length) {
      return `<tr><td colspan="${colunasVazias}" class="tabela-vazia">Nenhum registro disponível para este período.</td></tr>`;
    }
    return lista
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.rotulo || item.descricao || '-')}</td>
            <td>${formatarQuantidade(item.quantidade ?? 0)}</td>
            <td>${formatarMoedaBRL(item.valor ?? 0)}</td>
          </tr>
        `,
      )
      .join('');
  };

  const linhasPecas = criarLinhasTabela(principaisPecas, 3);
  const linhasProblemasValor = criarLinhasTabela(principaisProblemas, 3);
  const linhasProblemasRecorrentes = criarLinhasTabela(problemasRecorrentes, 3);
  const linhasProblemasGasto = criarLinhasTabela(problemasMaiorGasto, 3);
  const linhasLojas = criarLinhasTabela(principaisLojas, 3);
  const linhasStatus = criarLinhasTabela(statusReembolsos, 3);

  const linhasGastos = maioresGastos.length
    ? maioresGastos
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.tipo)}</td>
              <td>${escapeHtml(item.descricao)}</td>
              <td>${escapeHtml(item.loja || '-')}</td>
              <td>${escapeHtml(item.responsavel || '-')}</td>
              <td>${formatarData(item.data)}</td>
              <td>${formatarMoedaBRL(item.valor)}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="6" class="tabela-vazia">Nenhum gasto registrado no período selecionado.</td></tr>';

  const graficosStr = JSON.stringify(graficos).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Relatório completo de problemas</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f8fafc;
        color: #1f2937;
      }
      .relatorio-container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2.5rem 1.5rem 3rem;
      }
      header {
        margin-bottom: 2rem;
      }
      header h1 {
        font-size: 1.75rem;
        margin-bottom: 0.5rem;
      }
      header p {
        margin: 0.25rem 0;
        color: #4b5563;
        font-size: 0.95rem;
      }
      .meta-info {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 0.75rem;
      }
      .meta-pill {
        background: #eef2ff;
        color: #312e81;
        padding: 0.5rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.85rem;
      }
      section {
        margin-bottom: 2.5rem;
      }
      section h2 {
        font-size: 1.35rem;
        margin-bottom: 1rem;
      }
      .resumo-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }
      .resumo-card {
        background: #ffffff;
        border-radius: 1rem;
        padding: 1.25rem 1.5rem;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
        border: 1px solid #e5e7eb;
      }
      .resumo-card span {
        display: block;
        font-size: 0.85rem;
        color: #6b7280;
        margin-bottom: 0.5rem;
      }
      .resumo-card strong {
        font-size: 1.5rem;
      }
      .resumo-card small {
        display: block;
        color: #6b7280;
        margin-top: 0.35rem;
        font-size: 0.8rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #ffffff;
        border-radius: 1rem;
        overflow: hidden;
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
        border: 1px solid #e5e7eb;
      }
      th, td {
        padding: 0.85rem 1rem;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
        font-size: 0.9rem;
      }
      th {
        background: #f9fafb;
        font-weight: 600;
        color: #374151;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .tabela-vazia {
        text-align: center;
        color: #6b7280;
        font-size: 0.9rem;
        padding: 1.5rem 1rem;
      }
      .grid-duas-colunas {
        display: grid;
        gap: 1.75rem;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .chart-wrapper {
        background: #ffffff;
        border-radius: 1rem;
        padding: 1.5rem;
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
        border: 1px solid #e5e7eb;
      }
      .chart-wrapper h3 {
        margin: 0 0 1rem;
        font-size: 1rem;
      }
      .chart-empty {
        display: none;
        text-align: center;
        color: #6b7280;
        font-size: 0.85rem;
        margin-top: 1rem;
      }
      @media print {
        body {
          background: #ffffff;
        }
        .relatorio-container {
          padding: 1.5rem;
        }
        .chart-wrapper {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        header, section {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <div class="relatorio-container">
      <header>
        <h1>Relatório completo de problemas</h1>
        <p>Gerado em ${escapeHtml(geradoEm)}.</p>
        <div class="meta-info">
          <span class="meta-pill"><strong>Período:</strong> ${escapeHtml(periodoTexto)}</span>
          <span class="meta-pill"><strong>Filtro de usuários:</strong> ${escapeHtml(usuarioFiltro)}</span>
          <span class="meta-pill"><strong>Total de problemas:</strong> ${formatarQuantidade(
            totais.geral || 0,
          )}</span>
        </div>
      </header>

      <section>
        <h2>Resumo financeiro</h2>
        <div class="resumo-grid">
          <div class="resumo-card">
            <span>Peças faltantes</span>
            <strong>${formatarQuantidade(totais.pecas || 0)}</strong>
            <small>Valor gasto: ${formatarMoedaBRL(totais.gastoPecas)}</small>
          </div>
          <div class="resumo-card">
            <span>Reembolsos</span>
            <strong>${formatarQuantidade(totais.reembolsos || 0)}</strong>
            <small>Valor gasto: ${formatarMoedaBRL(totais.gastoReembolsos)}</small>
          </div>
          <div class="resumo-card">
            <span>Total consolidado</span>
            <strong>${formatarQuantidade(totais.geral || 0)}</strong>
            <small>Valor total: ${formatarMoedaBRL(totais.gastoTotal)}</small>
          </div>
        </div>
      </section>

      <section>
        <h2>Principais reclamações</h2>
        <div class="grid-duas-colunas">
          <div>
            <h3>Por peça</h3>
            <table>
              <thead>
                <tr>
                  <th>Peça</th>
                  <th>Ocorrências</th>
                  <th>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                ${linhasPecas}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Por loja</h3>
            <table>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Ocorrências</th>
                  <th>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                ${linhasLojas}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Por problema (maior gasto)</h3>
            <table>
              <thead>
                <tr>
                  <th>Problema</th>
                  <th>Ocorrências</th>
                  <th>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                ${linhasProblemasValor}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2>Problemas mais recorrentes e de maior gasto</h2>
        <div class="grid-duas-colunas">
          <div>
            <h3>Mais recorrentes</h3>
            <table>
              <thead>
                <tr>
                  <th>Problema</th>
                  <th>Ocorrências</th>
                  <th>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                ${linhasProblemasRecorrentes}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Maior gasto</h3>
            <table>
              <thead>
                <tr>
                  <th>Problema</th>
                  <th>Ocorrências</th>
                  <th>Total gasto</th>
                </tr>
              </thead>
              <tbody>
                ${linhasProblemasGasto}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2>Situação dos reembolsos</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Ocorrências</th>
              <th>Total gasto</th>
            </tr>
          </thead>
          <tbody>
            ${linhasStatus}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Maiores gastos do período</h2>
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Loja</th>
              <th>Responsável</th>
              <th>Data</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            ${linhasGastos}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Visão gráfica</h2>
        <div class="grid-duas-colunas">
          <div class="chart-wrapper">
            <h3>Evolução diária dos problemas</h3>
            <canvas id="chartEvolucao" height="220"></canvas>
            <p id="chartEvolucaoEmpty" class="chart-empty">Sem dados suficientes para exibir este gráfico.</p>
          </div>
          <div class="chart-wrapper">
            <h3>Principais reclamações (peças)</h3>
            <canvas id="chartTopPecas" height="220"></canvas>
            <p id="chartTopPecasEmpty" class="chart-empty">Sem dados suficientes para exibir este gráfico.</p>
          </div>
          <div class="chart-wrapper">
            <h3>Maiores gastos</h3>
            <canvas id="chartTopGastos" height="220"></canvas>
            <p id="chartTopGastosEmpty" class="chart-empty">Sem dados suficientes para exibir este gráfico.</p>
          </div>
        </div>
      </section>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
    <script>
      const dadosGraficos = ${graficosStr};
      const corIndigo = '#4f46e5';
      const corEmerald = '#10b981';
      const corSlate = '#1e293b';

      function possuiDados(valores) {
        return Array.isArray(valores) && valores.some((valor) => Number(valor) > 0);
      }

      window.addEventListener('load', () => {
        const ctxEvolucao = document.getElementById('chartEvolucao');
        const ctxTopPecas = document.getElementById('chartTopPecas');
        const ctxTopGastos = document.getElementById('chartTopGastos');

        if (
          dadosGraficos?.evolucao?.labels?.length &&
          (possuiDados(dadosGraficos.evolucao.pecas) ||
            possuiDados(dadosGraficos.evolucao.reembolsos))
        ) {
          new window.Chart(ctxEvolucao, {
            type: 'line',
            data: {
              labels: dadosGraficos.evolucao.labels,
              datasets: [
                {
                  label: 'Peças faltantes',
                  data: dadosGraficos.evolucao.pecas,
                  borderColor: corIndigo,
                  backgroundColor: 'rgba(79, 70, 229, 0.15)',
                  tension: 0.35,
                  fill: true,
                },
                {
                  label: 'Reembolsos',
                  data: dadosGraficos.evolucao.reembolsos,
                  borderColor: corEmerald,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  tension: 0.35,
                  fill: true,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: {
                  position: 'top',
                },
                tooltip: {
                  callbacks: {
                    label: (context) =>
                      context.dataset.label +
                      ': ' +
                      context.parsed.y.toLocaleString('pt-BR') +
                      ' ocorrência(s)',
                  },
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    precision: 0,
                  },
                },
              },
            },
          });
        } else {
          ctxEvolucao.style.display = 'none';
          document.getElementById('chartEvolucaoEmpty').style.display = 'block';
        }

        if (
          dadosGraficos?.topPecas?.labels?.length &&
          possuiDados(dadosGraficos.topPecas.valores)
        ) {
          new window.Chart(ctxTopPecas, {
            type: 'bar',
            data: {
              labels: dadosGraficos.topPecas.labels,
              datasets: [
                {
                  label: 'Ocorrências',
                  data: dadosGraficos.topPecas.valores,
                  backgroundColor: 'rgba(79, 70, 229, 0.8)',
                  borderRadius: 6,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { precision: 0 },
                },
              },
            },
          });
        } else {
          ctxTopPecas.style.display = 'none';
          document.getElementById('chartTopPecasEmpty').style.display = 'block';
        }

        if (
          dadosGraficos?.topGastos?.labels?.length &&
          possuiDados(dadosGraficos.topGastos.valores)
        ) {
          new window.Chart(ctxTopGastos, {
            type: 'bar',
            data: {
              labels: dadosGraficos.topGastos.labels,
              datasets: [
                {
                  label: 'Valor gasto (R$)',
                  data: dadosGraficos.topGastos.valores,
                  backgroundColor: 'rgba(30, 41, 59, 0.85)',
                  borderRadius: 6,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (context) =>
                      'Valor gasto: ' +
                      Number(context.parsed.y || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }),
                  },
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    callback: (value) =>
                      Number(value || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        maximumFractionDigits: 0,
                      }),
                  },
                },
              },
            },
          });
        } else {
          ctxTopGastos.style.display = 'none';
          document.getElementById('chartTopGastosEmpty').style.display = 'block';
        }
      });
    </script>
  </body>
</html>`;
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
