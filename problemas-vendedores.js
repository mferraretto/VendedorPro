import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { setDocWithCopy } from './secure-firestore.js';
import { carregarUsuariosPosVendas } from './responsavel-posvendas.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const elementos = {
  filtroVendedor: document.getElementById('filtroVendedor'),
  buscaGlobal: document.getElementById('buscaGlobal'),
  buscaReembolsos: document.getElementById('buscaReembolsos'),
  buscaPecas: document.getElementById('buscaPecas'),
  filtroStatusReembolsos: document.getElementById('filtroStatusReembolsos'),
  filtroStatusPecas: document.getElementById('filtroStatusPecas'),
  resumoVendedores: document.getElementById('resumoVendedores'),
  statusReembolsos: document.getElementById('statusReembolsos'),
  statusPecas: document.getElementById('statusPecas'),
  reembolsosTableBody: document.getElementById('reembolsosTableBody'),
  pecasTableBody: document.getElementById('pecasTableBody'),
  reembolsosEmpty: document.getElementById('reembolsosEmpty'),
  pecasEmpty: document.getElementById('pecasEmpty'),
};

const state = {
  currentUser: null,
  vendedores: [],
  reembolsos: [],
  pecas: [],
  filtros: {
    vendedor: '',
    buscaGlobal: '',
    buscaReembolsos: '',
    buscaPecas: '',
    statusReembolsos: '',
    statusPecas: '',
  },
};

const REEMBOLSO_STATUS_OPCOES = [
  { valor: 'AGUARDANDO PIX', texto: 'Aguardando PIX' },
  { valor: 'AGUARDANDO MERCADO', texto: 'Aguardando Mercado' },
  { valor: 'AGUARDANDO', texto: 'Aguardando' },
  { valor: 'FEITO', texto: 'Feito' },
  { valor: 'FEITO PIX', texto: 'Feito PIX' },
  { valor: 'FEITO MERCADO', texto: 'Feito Mercado' },
  { valor: 'CANCELADO', texto: 'Cancelado' },
];

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
  if (!tabButtons.length) return;
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => {
        b.classList.toggle('border-violet-600', b === btn);
        b.classList.toggle('text-violet-600', b === btn);
        b.classList.toggle('border-transparent', b !== btn);
        b.classList.toggle('text-slate-500', b !== btn);
      });
      tabPanels.forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== btn.dataset.tab);
      });
    });
  });
}

initTabs();
registrarEventos();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  state.currentUser = user;
  window.responsavelPosVendas = { uid: user.uid, email: user.email };
  atualizarResumo('Buscando vendedores vinculados...', false);
  try {
    const { usuarios } = await carregarUsuariosPosVendas(db, user);
    state.vendedores = usuarios;
    preencherSelectVendedores();
    atualizarResumo(
      usuarios.length
        ? `Visualizando problemas de ${usuarios.length} vendedor(es).`
        : 'Nenhum vendedor vinculado foi encontrado.',
      !usuarios.length,
    );
  } catch (err) {
    console.error('Erro ao carregar vendedores vinculados:', err);
    atualizarResumo(
      'Não foi possível carregar os vendedores vinculados.',
      true,
    );
    state.vendedores = [];
  }
  await carregarDados();
});

function registrarEventos() {
  elementos.filtroVendedor?.addEventListener('change', () => {
    state.filtros.vendedor = elementos.filtroVendedor.value;
    renderReembolsos();
    renderPecas();
  });

  elementos.buscaGlobal?.addEventListener('input', () => {
    state.filtros.buscaGlobal = elementos.buscaGlobal.value.toLowerCase();
    renderReembolsos();
    renderPecas();
  });

  elementos.buscaReembolsos?.addEventListener('input', () => {
    state.filtros.buscaReembolsos =
      elementos.buscaReembolsos.value.toLowerCase();
    renderReembolsos();
  });

  elementos.buscaPecas?.addEventListener('input', () => {
    state.filtros.buscaPecas = elementos.buscaPecas.value.toLowerCase();
    renderPecas();
  });

  elementos.filtroStatusReembolsos?.addEventListener('change', () => {
    state.filtros.statusReembolsos = elementos.filtroStatusReembolsos.value;
    renderReembolsos();
  });

  elementos.filtroStatusPecas?.addEventListener('change', () => {
    state.filtros.statusPecas = elementos.filtroStatusPecas.value;
    renderPecas();
  });
}

function atualizarResumo(texto, isError) {
  if (!elementos.resumoVendedores) return;
  elementos.resumoVendedores.textContent = texto;
  elementos.resumoVendedores.classList.toggle(
    'text-rose-600',
    Boolean(isError),
  );
}

async function carregarDados() {
  if (!state.currentUser) return;
  await Promise.all([carregarReembolsos(), carregarPecas()]);
}

async function carregarReembolsos() {
  if (!elementos.statusReembolsos) return;
  elementos.statusReembolsos.textContent = 'Carregando dados...';
  try {
    const resultados = (
      await Promise.all(
        state.vendedores.map((v) => carregarColecao(v, 'reembolsos')),
      )
    ).flat();
    state.reembolsos = resultados.sort((a, b) =>
      (a.data || '').localeCompare(b.data || ''),
    );
    elementos.statusReembolsos.textContent = `${resultados.length} registro(s) encontrados.`;
  } catch (err) {
    console.error('Erro ao carregar reembolsos:', err);
    elementos.statusReembolsos.textContent = 'Erro ao carregar reembolsos.';
    state.reembolsos = [];
  }
  renderReembolsos();
}

async function carregarPecas() {
  if (!elementos.statusPecas) return;
  elementos.statusPecas.textContent = 'Carregando dados...';
  try {
    const resultados = (
      await Promise.all(
        state.vendedores.map((v) => carregarColecao(v, 'pecas')),
      )
    ).flat();
    state.pecas = resultados.sort((a, b) =>
      (a.data || '').localeCompare(b.data || ''),
    );
    elementos.statusPecas.textContent = `${resultados.length} registro(s) encontrados.`;
  } catch (err) {
    console.error('Erro ao carregar peças faltantes:', err);
    elementos.statusPecas.textContent = 'Erro ao carregar peças faltantes.';
    state.pecas = [];
  }
  renderPecas();
}

async function carregarColecao(vendedor, tipo) {
  if (!vendedor?.uid || !state.currentUser?.uid) return [];
  const caminhos = [
    doc(
      db,
      'uid',
      state.currentUser.uid,
      'uid',
      vendedor.uid,
      'problemas',
      tipo,
    ),
    doc(db, 'uid', vendedor.uid, 'problemas', tipo),
  ];
  for (const baseDoc of caminhos) {
    try {
      const itensRef = collection(baseDoc, 'itens');
      const snap = await getDocs(itensRef);
      if (!snap.empty) {
        return snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          ownerUid: vendedor.uid,
          ownerNome: vendedor.nome || vendedor.email || vendedor.uid,
          ownerEmail: vendedor.email || '',
          tipo,
        }));
      }
    } catch (err) {
      console.warn(`Falha ao carregar ${tipo} para ${vendedor.uid}:`, err);
    }
  }
  return [];
}

function preencherSelectVendedores() {
  if (!elementos.filtroVendedor) return;
  elementos.filtroVendedor.innerHTML =
    '<option value="">Todos os vendedores vinculados</option>';
  state.vendedores.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.uid;
    opt.textContent = v.nome || v.email || v.uid;
    elementos.filtroVendedor.appendChild(opt);
  });
}

function filtrarDados(lista, tipo) {
  const { vendedor, buscaGlobal } = state.filtros;
  const buscaEspecifica =
    tipo === 'reembolsos'
      ? state.filtros.buscaReembolsos
      : state.filtros.buscaPecas;
  const statusFiltro =
    tipo === 'reembolsos'
      ? state.filtros.statusReembolsos
      : state.filtros.statusPecas;

  return lista.filter((item) => {
    if (vendedor && item.ownerUid !== vendedor) return false;
    if (statusFiltro) {
      const statusItem = normalizarTexto(item.status);
      if (normalizarTexto(statusFiltro) !== statusItem) return false;
    }
    if (buscaGlobal) {
      const campos = Object.values(item).map((valor) =>
        String(valor || '').toLowerCase(),
      );
      if (!campos.some((valor) => valor.includes(buscaGlobal))) return false;
    }
    if (buscaEspecifica) {
      const campos =
        tipo === 'reembolsos'
          ? [
              item.apelido,
              item.numero,
              item.loja,
              item.nf,
              item.pix,
              item.problema,
              item.ownerNome,
              item.ownerEmail,
            ]
          : [
              item.nomeCliente,
              item.apelido,
              item.numero,
              item.loja,
              item.peca,
              item.informacoes,
              item.ownerNome,
              item.ownerEmail,
            ];
      const contem = campos.some((valor) =>
        String(valor || '')
          .toLowerCase()
          .includes(buscaEspecifica),
      );
      if (!contem) return false;
    }
    return true;
  });
}

function renderReembolsos() {
  if (!elementos.reembolsosTableBody) return;
  elementos.reembolsosTableBody.innerHTML = '';
  const dados = filtrarDados(state.reembolsos, 'reembolsos');
  elementos.reembolsosEmpty?.classList.toggle('hidden', Boolean(dados.length));
  if (!dados.length) return;
  dados.forEach((dado) => {
    const tr = document.createElement('tr');
    tr.className = 'odd:bg-white even:bg-slate-50 hover:bg-slate-100';

    tr.appendChild(criarCelulaTextoVendedor(dado));
    tr.appendChild(
      criarCelulaInput({
        tipo: 'date',
        valor: dado.data || '',
        onChange: (valor) => atualizarReembolso(dado, { data: valor }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.numero || '',
        onChange: (valor) => atualizarReembolso(dado, { numero: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.apelido || '',
        onChange: (valor) =>
          atualizarReembolso(dado, { apelido: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.nf || '',
        onChange: (valor) => atualizarReembolso(dado, { nf: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.loja || '',
        onChange: (valor) => atualizarReembolso(dado, { loja: valor.trim() }),
      }),
    );

    const valorTd = document.createElement('td');
    valorTd.className = 'p-2 align-middle';
    const valorWrapper = document.createElement('div');
    valorWrapper.className = 'flex items-center justify-end gap-1';
    const prefixo = document.createElement('span');
    prefixo.textContent = 'R$';
    prefixo.className = 'text-slate-500';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = formatarNumero(dado.valor);
    input.className =
      'w-28 rounded-xl border border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
    input.addEventListener('change', async (ev) => {
      const novoValor = Number.parseFloat(ev.target.value);
      const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
      await atualizarReembolso(dado, { valor: valorConvertido });
      ev.target.value = formatarNumero(valorConvertido);
    });
    valorWrapper.appendChild(prefixo);
    valorWrapper.appendChild(input);
    valorTd.appendChild(valorWrapper);
    tr.appendChild(valorTd);

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.pix || '',
        onChange: (valor) => atualizarReembolso(dado, { pix: valor.trim() }),
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
      criarCelulaSelect({
        valor: dado.status || 'AGUARDANDO',
        opcoes: REEMBOLSO_STATUS_OPCOES,
        onChange: (valor) => atualizarReembolso(dado, { status: valor }),
      }),
    );
    tr.appendChild(criarCelulaAcoes(() => excluirReembolso(dado)));

    elementos.reembolsosTableBody.appendChild(tr);
  });
}

function renderPecas() {
  if (!elementos.pecasTableBody) return;
  elementos.pecasTableBody.innerHTML = '';
  const dados = filtrarDados(state.pecas, 'pecas');
  elementos.pecasEmpty?.classList.toggle('hidden', Boolean(dados.length));
  if (!dados.length) return;
  dados.forEach((dado) => {
    const tr = document.createElement('tr');
    tr.className = 'odd:bg-white even:bg-slate-50 hover:bg-slate-100';

    tr.appendChild(criarCelulaTextoVendedor(dado));
    tr.appendChild(
      criarCelulaInput({
        tipo: 'date',
        valor: dado.data || '',
        onChange: (valor) => atualizarPeca(dado, { data: valor }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.nomeCliente || '',
        onChange: (valor) => atualizarPeca(dado, { nomeCliente: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.apelido || '',
        onChange: (valor) => atualizarPeca(dado, { apelido: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.numero || '',
        onChange: (valor) => atualizarPeca(dado, { numero: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.loja || '',
        onChange: (valor) => atualizarPeca(dado, { loja: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: dado.peca || '',
        onChange: (valor) => atualizarPeca(dado, { peca: valor.trim() }),
      }),
    );
    tr.appendChild(
      criarCelulaTextarea({
        valor: dado.informacoes || '',
        onChange: (valor) => atualizarPeca(dado, { informacoes: valor.trim() }),
      }),
    );

    const valorTd = document.createElement('td');
    valorTd.className = 'p-2 align-middle';
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center justify-end gap-1';
    const prefixo = document.createElement('span');
    prefixo.textContent = 'R$';
    prefixo.className = 'text-slate-500';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = formatarNumero(dado.valorGasto);
    input.className =
      'w-28 rounded-xl border border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
    input.addEventListener('change', async (ev) => {
      const novoValor = Number.parseFloat(ev.target.value);
      const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
      await atualizarPeca(dado, { valorGasto: valorConvertido });
      ev.target.value = formatarNumero(valorConvertido);
    });
    wrapper.appendChild(prefixo);
    wrapper.appendChild(input);
    valorTd.appendChild(wrapper);
    tr.appendChild(valorTd);

    tr.appendChild(
      criarCelulaSelect({
        valor: dado.status || 'NÃO FEITO',
        opcoes: [
          { valor: 'NÃO FEITO', texto: 'Não feito' },
          { valor: 'EM ANDAMENTO', texto: 'Em andamento' },
          { valor: 'RESOLVIDO', texto: 'Resolvido' },
        ],
        onChange: (valor) => atualizarPeca(dado, { status: valor }),
        aplicarClasse: (select, status) => aplicarCorStatus(select, status),
      }),
    );

    tr.appendChild(criarCelulaAcoes(() => excluirPeca(dado)));

    elementos.pecasTableBody.appendChild(tr);
  });
}

function criarCelulaTextoVendedor(dado) {
  const td = document.createElement('td');
  td.className = 'p-2 align-middle';
  const nome = document.createElement('p');
  nome.className = 'font-medium text-slate-700';
  nome.textContent = dado.ownerNome || dado.ownerUid;
  const email = document.createElement('p');
  email.className = 'text-xs text-slate-500';
  email.textContent = dado.ownerEmail || '';
  td.appendChild(nome);
  if (email.textContent) td.appendChild(email);
  return td;
}

function criarCelulaInput({ tipo, valor, onChange }) {
  const td = document.createElement('td');
  td.className = 'p-2 align-middle';
  const input = document.createElement('input');
  input.type = tipo;
  input.value = valor ?? '';
  input.className =
    'w-full rounded-xl border border-slate-300 px-2 py-1 text-sm focus:border-violet-500 focus:ring-violet-500';
  input.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(input);
  return td;
}

function criarCelulaTextarea({ valor, onChange }) {
  const td = document.createElement('td');
  td.className = 'p-2 align-middle';
  const textarea = document.createElement('textarea');
  textarea.value = valor ?? '';
  textarea.rows = 2;
  textarea.className =
    'w-full rounded-xl border border-slate-300 px-2 py-1 text-sm focus:border-violet-500 focus:ring-violet-500 resize-y min-h-[36px]';
  textarea.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(textarea);
  return td;
}

function criarCelulaSelect({ valor, opcoes, onChange, aplicarClasse }) {
  const td = document.createElement('td');
  td.className = 'p-2 align-middle';
  const select = document.createElement('select');
  select.className =
    'w-full rounded-xl border border-slate-300 px-2 py-1 text-sm focus:border-violet-500 focus:ring-violet-500';
  opcoes.forEach((opcao) => {
    const option = document.createElement('option');
    option.value = opcao.valor;
    option.textContent = opcao.texto;
    if (opcao.valor === valor) option.selected = true;
    select.appendChild(option);
  });
  if (aplicarClasse) aplicarClasse(select, valor);
  select.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
    if (aplicarClasse) aplicarClasse(select, ev.target.value);
  });
  td.appendChild(select);
  return td;
}

function criarCelulaAcoes(onDelete) {
  const td = document.createElement('td');
  td.className = 'p-2 align-middle text-right';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = 'Excluir';
  botao.className =
    'inline-flex items-center rounded-xl border border-rose-200 px-3 py-1 text-sm font-medium text-rose-600 hover:bg-rose-50';
  botao.addEventListener('click', onDelete);
  td.appendChild(botao);
  return td;
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
  const baseClasses = ['border'];
  if (status === 'RESOLVIDO') {
    el.classList.add(
      'bg-emerald-50',
      'text-emerald-700',
      'border-emerald-200',
      ...baseClasses,
    );
  } else if (status === 'EM ANDAMENTO') {
    el.classList.add(
      'bg-blue-50',
      'text-blue-700',
      'border-blue-200',
      ...baseClasses,
    );
  } else {
    el.classList.add(
      'bg-amber-50',
      'text-amber-700',
      'border-amber-200',
      ...baseClasses,
    );
  }
}

function formatarNumero(valor) {
  return (Number(valor) || 0).toFixed(2);
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[^\w\s]/g, '')
    .toUpperCase()
    .trim();
}

function extrairPayload(dado) {
  const { id, ownerUid, ownerNome, ownerEmail, tipo, ...restante } = dado;
  return restante;
}

async function atualizarReembolso(dado, atualizacoes) {
  const ref = doc(
    db,
    'uid',
    dado.ownerUid,
    'problemas',
    'reembolsos',
    'itens',
    dado.id,
  );
  const payload = { ...extrairPayload(dado), ...atualizacoes };
  await setDocWithCopy(ref, payload, dado.ownerUid, undefined, {
    posVendasUid: state.currentUser?.uid,
  });
  Object.assign(dado, atualizacoes);
}

async function atualizarPeca(dado, atualizacoes) {
  const ref = doc(
    db,
    'uid',
    dado.ownerUid,
    'problemas',
    'pecas',
    'itens',
    dado.id,
  );
  const payload = { ...extrairPayload(dado), ...atualizacoes };
  await setDocWithCopy(ref, payload, dado.ownerUid, undefined, {
    posVendasUid: state.currentUser?.uid,
  });
  Object.assign(dado, atualizacoes);
}

async function excluirReembolso(dado) {
  if (!window.confirm('Deseja excluir este reembolso?')) return;
  const ref = doc(
    db,
    'uid',
    dado.ownerUid,
    'problemas',
    'reembolsos',
    'itens',
    dado.id,
  );
  await deleteDoc(ref);
  await removerCopias(ref, dado.ownerUid);
  state.reembolsos = state.reembolsos.filter((item) => item.id !== dado.id);
  renderReembolsos();
}

async function excluirPeca(dado) {
  if (!window.confirm('Deseja excluir esta peça faltante?')) return;
  const ref = doc(
    db,
    'uid',
    dado.ownerUid,
    'problemas',
    'pecas',
    'itens',
    dado.id,
  );
  await deleteDoc(ref);
  await removerCopias(ref, dado.ownerUid);
  state.pecas = state.pecas.filter((item) => item.id !== dado.id);
  renderPecas();
}

async function removerCopias(ref, ownerUid) {
  const destinatarios = new Set();
  if (window.responsavelFinanceiro?.uid) {
    destinatarios.add(window.responsavelFinanceiro.uid);
  }
  if (window.responsavelPosVendas?.uid) {
    destinatarios.add(window.responsavelPosVendas.uid);
  }
  destinatarios.delete(ownerUid);
  if (!destinatarios.size) return;
  const segmentos = ref.path.split('/');
  const relativo = segmentos.slice(2).join('/');
  for (const responsavelUid of destinatarios) {
    const copiaRef = doc(
      ref.firestore,
      `uid/${responsavelUid}/uid/${ownerUid}/${relativo}`,
    );
    try {
      await deleteDoc(copiaRef);
    } catch (err) {
      console.warn('Não foi possível remover cópia do documento:', err);
    }
  }
}
