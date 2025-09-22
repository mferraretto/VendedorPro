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

const reembolsosStatusMsgEl = document.getElementById('reembolsosStatusMsg');
const reembolsosEmptyEl = document.getElementById('reembolsosEmpty');
const reembolsosTabelaBody = document.getElementById('reembolsosTableBody');

let usuarios = [];
let pecasCache = [];
let reembolsosCache = [];
let usuarioSelecionado = '';
let currentUser = null;

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

  pecasTabelaBody.innerHTML = '';
  filtrados.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';

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

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${formatarData(
        item.data,
      )}</td>
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
      <td class="px-4 py-3 text-right font-medium text-gray-700">${formatarMoeda(
        Number(item.valorGasto) || 0,
      )}</td>
    `;

    pecasTabelaBody.appendChild(tr);
  });

  pecasEmptyEl?.classList.toggle('hidden', filtrados.length > 0);
  atualizarResumoPecas(filtrados);
}

function renderReembolsos() {
  if (!reembolsosTabelaBody) return;

  const inicio = document.getElementById('reembolsosInicio')?.value || '';
  const fim = document.getElementById('reembolsosFim')?.value || '';
  const busca = (
    document.getElementById('reembolsosBusca')?.value || ''
  ).toLowerCase();

  const filtrados = reembolsosCache
    .filter((item) => {
      if (usuarioSelecionado && item.usuarioUid !== usuarioSelecionado)
        return false;
      const data = item.data || '';
      if (inicio && (!data || data < inicio)) return false;
      if (fim && (!data || data > fim)) return false;
      if (busca) {
        const campos = [
          item.numero,
          item.apelido,
          item.nf,
          item.loja,
          item.problema,
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

  reembolsosTabelaBody.innerHTML = '';
  filtrados.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';

    const responsavelEmail = item.usuarioEmail
      ? `<span class="text-xs text-gray-500">${escapeHtml(item.usuarioEmail)}</span>`
      : '';

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${formatarData(
        item.data,
      )}</td>
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
      <td class="px-4 py-3">${escapeHtml(item.problema || '-')}</td>
      <td class="px-4 py-3 text-right font-medium text-gray-700">${formatarMoeda(
        Number(item.valor) || 0,
      )}</td>
    `;

    reembolsosTabelaBody.appendChild(tr);
  });

  reembolsosEmptyEl?.classList.toggle('hidden', filtrados.length > 0);
  atualizarResumoReembolsos(filtrados);
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
