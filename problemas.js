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

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let uidAtual = null;
let pecasCache = [];
let pecasFiltradas = [];
let pecasColRef = null;
let reembolsosCache = [];
let reembolsosColRef = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  uidAtual = user.uid;
  const dataInput = document.getElementById('data');
  if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
  const dataRInput = document.getElementById('dataR');
  if (dataRInput) dataRInput.value = new Date().toISOString().split('T')[0];
  document.getElementById('pecasForm')?.addEventListener('submit', salvarPeca);
  document
    .getElementById('reembolsosForm')
    ?.addEventListener('submit', salvarReembolso);
  document
    .getElementById('filtroDataInicio')
    ?.addEventListener('change', renderPecas);
  document
    .getElementById('filtroDataFim')
    ?.addEventListener('change', renderPecas);
  document
    .getElementById('filtroStatus')
    ?.addEventListener('change', renderPecas);
  document
    .getElementById('searchPecas')
    ?.addEventListener('input', renderPecas);
  document
    .getElementById('limparReembolsos')
    ?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const form = document.getElementById('reembolsosForm');
      form?.reset();
      const di = document.getElementById('dataR');
      if (di) di.value = new Date().toISOString().split('T')[0];
    });
  document.getElementById('limparPecas')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const form = document.getElementById('pecasForm');
    form?.reset();
    const di = document.getElementById('data');
    if (di) di.value = new Date().toISOString().split('T')[0];
  });
  document.getElementById('limparFiltros')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const fs = document.getElementById('filtroStatus');
    const search = document.getElementById('searchPecas');
    const fdInicio = document.getElementById('filtroDataInicio');
    const fdFim = document.getElementById('filtroDataFim');
    if (fdInicio) fdInicio.value = '';
    if (fdFim) fdFim.value = '';
    if (fs) fs.value = '';
    if (search) search.value = '';
    renderPecas();
  });
  document.getElementById('exportCsv')?.addEventListener('click', exportarCsv);
  carregarPecas();
  carregarReembolsos();
});

async function salvarPeca(ev) {
  ev.preventDefault();
  const form = ev.target;
  const registro = {
    data: form.data.value,
    nomeCliente: '',
    numero: form.numero.value.trim(),
    apelido: form.apelido.value.trim(),
    nf: form.nf.value.trim(),
    loja: form.loja.value.trim(),
    peca: form.peca.value.trim(),
    valorGasto: 0,
    status: 'NÃO FEITO',
    informacoes: form.informacoes?.value.trim() || '',
  };
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'pecasfaltando');
  const colRef = collection(baseDoc, 'itens');
  const ref = doc(colRef);
  await setDocWithCopy(ref, registro, uidAtual);
  form.reset();
  const dataInput = document.getElementById('data');
  if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
  carregarPecas();
}

async function carregarPecas() {
  if (!uidAtual) return;
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'pecasfaltando');
  pecasColRef = collection(baseDoc, 'itens');
  const snap = await getDocs(pecasColRef);
  pecasCache = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  renderPecas();
}

function renderPecas() {
  const tbody = document.getElementById('pecasTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const filtroDataInicio = document.getElementById('filtroDataInicio')?.value;
  const filtroDataFim = document.getElementById('filtroDataFim')?.value;
  const filtroStatus = document.getElementById('filtroStatus')?.value;
  const busca =
    document.getElementById('searchPecas')?.value.toLowerCase() || '';
  pecasFiltradas = pecasCache.filter((d) => {
    const data = d.data || '';
    const dataInicioOk = filtroDataInicio ? data >= filtroDataInicio : true;
    const dataFimOk = filtroDataFim ? data <= filtroDataFim : true;
    const dataOk = dataInicioOk && dataFimOk;
    const statusOk = filtroStatus ? d.status === filtroStatus : true;
    const searchOk = busca
      ? Object.values(d).some((v) => String(v).toLowerCase().includes(busca))
      : true;
    return dataOk && statusOk && searchOk;
  });
  pecasFiltradas.forEach((d) => {
    const tr = document.createElement('tr');
    tr.className =
      'border-t border-slate-100 hover:bg-slate-50 odd:bg-white even:bg-slate-50';

    const baseInputClass =
      'w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500';

    tr.appendChild(
      criarCelulaInput({
        tipo: 'date',
        valor: d.data || '',
        onChange: (valor) => atualizarPeca(d, { data: valor }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.nomeCliente || '',
        onChange: (valor) => atualizarPeca(d, { nomeCliente: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.apelido || '',
        onChange: (valor) => atualizarPeca(d, { apelido: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.numero || '',
        onChange: (valor) => atualizarPeca(d, { numero: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.loja || '',
        onChange: (valor) => atualizarPeca(d, { loja: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.peca || '',
        onChange: (valor) => atualizarPeca(d, { peca: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.nf || '',
        onChange: (valor) => atualizarPeca(d, { nf: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaTextarea({
        valor: d.informacoes || '',
        onChange: (valor) => atualizarPeca(d, { informacoes: valor.trim() }),
      }),
    );

    tr.appendChild(criarCelulaValor(d));

    tr.appendChild(criarCelulaStatus(d));

    tr.appendChild(criarCelulaAcoes(d, 'peca'));

    tbody.appendChild(tr);
  });
}

function exportarCsv() {
  if (!pecasFiltradas.length) return;
  const header = [
    'Data',
    'Nome do Comprador',
    'Apelido',
    'Número',
    'Loja',
    'Peça Faltante',
    'NF',
    'Informações',
    'Valor Gasto',
    'Status',
  ];
  const rows = pecasFiltradas.map((d) => [
    formatarData(d.data),
    d.nomeCliente || '',
    d.apelido || '',
    d.numero || '',
    d.loja || '',
    d.peca || '',
    d.nf || '',
    d.informacoes || '',
    (Number(d.valorGasto) || 0).toFixed(2).replace('.', ','),
    d.status || '',
  ]);
  const csv = [header, ...rows].map((r) => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pecas-faltando.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function salvarReembolso(ev) {
  ev.preventDefault();
  const form = ev.target;
  const registro = {
    data: form.data.value,
    numero: form.numero.value.trim(),
    apelido: form.apelido.value.trim(),
    nf: form.nf.value.trim(),
    loja: form.loja.value.trim(),
    problema: form.problema.value.trim(),
    valor: parseFloat(form.valor.value) || 0,
    informacoes: form.informacoes?.value.trim() || '',
  };
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'reembolsos');
  const colRef = collection(baseDoc, 'itens');
  const ref = doc(colRef);
  await setDocWithCopy(ref, registro, uidAtual);
  form.reset();
  const dataRInput = document.getElementById('dataR');
  if (dataRInput) dataRInput.value = new Date().toISOString().split('T')[0];
  carregarReembolsos();
}

async function carregarReembolsos() {
  const tbody = document.getElementById('reembolsosTableBody');
  if (!tbody || !uidAtual) return;
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'reembolsos');
  reembolsosColRef = collection(baseDoc, 'itens');
  const snap = await getDocs(reembolsosColRef);
  reembolsosCache = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  renderReembolsos();
}

function renderReembolsos() {
  const tbody = document.getElementById('reembolsosTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const baseInputClass =
    'w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500';
  reembolsosCache.forEach((d) => {
    const tr = document.createElement('tr');
    tr.className =
      'border-t border-slate-100 hover:bg-slate-50 odd:bg-white even:bg-slate-50';

    tr.appendChild(
      criarCelulaInput({
        tipo: 'date',
        valor: d.data || '',
        onChange: (valor) => atualizarReembolso(d, { data: valor }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.numero || '',
        onChange: (valor) => atualizarReembolso(d, { numero: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.apelido || '',
        onChange: (valor) => atualizarReembolso(d, { apelido: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.nf || '',
        onChange: (valor) => atualizarReembolso(d, { nf: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.loja || '',
        onChange: (valor) => atualizarReembolso(d, { loja: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.problema || '',
        onChange: (valor) => atualizarReembolso(d, { problema: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaTextarea({
        valor: d.informacoes || '',
        onChange: (valor) =>
          atualizarReembolso(d, { informacoes: valor.trim() }),
      }),
    );

    const valorTd = document.createElement('td');
    valorTd.className = 'p-2';
    const valorWrapper = document.createElement('div');
    valorWrapper.className = 'flex items-center justify-end gap-1';
    const valorPrefix = document.createElement('span');
    valorPrefix.textContent = 'R$';
    valorPrefix.className = 'text-slate-500';
    const valorInput = document.createElement('input');
    valorInput.type = 'number';
    valorInput.step = '0.01';
    valorInput.value = formatarNumero(d.valor);
    valorInput.className =
      'w-28 rounded-xl border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
    valorInput.addEventListener('change', async (ev) => {
      const novoValor = Number.parseFloat(ev.target.value);
      const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
      await atualizarReembolso(d, { valor: valorConvertido });
      ev.target.value = formatarNumero(valorConvertido);
    });
    valorWrapper.appendChild(valorPrefix);
    valorWrapper.appendChild(valorInput);
    valorTd.appendChild(valorWrapper);
    tr.appendChild(valorTd);

    const acaoTd = criarCelulaAcoes(d, 'reembolso');
    tr.appendChild(acaoTd);

    tbody.appendChild(tr);
  });
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

function criarCelulaInput({ tipo, valor, onChange, classe }) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const input = document.createElement('input');
  input.type = tipo;
  input.value = valor;
  if (classe) {
    input.className = classe;
  }
  input.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(input);
  return td;
}

function criarCelulaTextarea({ valor, onChange }) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const textarea = document.createElement('textarea');
  textarea.value = valor;
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
  td.className = 'p-2';
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center justify-end gap-1';
  const span = document.createElement('span');
  span.textContent = 'R$';
  span.className = 'text-slate-500';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = formatarNumero(dado.valorGasto);
  input.className =
    'w-28 rounded-xl border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
  input.addEventListener('change', async (ev) => {
    const novoValor = Number.parseFloat(ev.target.value);
    const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
    await atualizarPeca(dado, { valorGasto: valorConvertido });
    ev.target.value = formatarNumero(valorConvertido);
  });
  wrapper.appendChild(span);
  wrapper.appendChild(input);
  td.appendChild(wrapper);
  return td;
}

function criarCelulaStatus(dado) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const select = document.createElement('select');
  select.className =
    'status-select text-xs font-medium rounded-full px-2 py-1 border focus:border-violet-500 focus:ring-violet-500';
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
    select.appendChild(option);
  });
  aplicarCorStatus(select, dado.status);
  select.addEventListener('change', async (ev) => {
    const novoStatus = ev.target.value;
    await atualizarPeca(dado, { status: novoStatus });
    aplicarCorStatus(select, novoStatus);
  });
  td.appendChild(select);
  return td;
}

function criarCelulaAcoes(dado, tipo) {
  const td = document.createElement('td');
  td.className = 'p-2 text-right';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = 'Excluir';
  botao.className =
    'rounded-xl border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50';
  botao.addEventListener('click', async () => {
    const confirma = window.confirm('Deseja excluir este registro?');
    if (!confirma) return;
    if (tipo === 'peca') {
      await excluirPeca(dado.id);
    } else {
      await excluirReembolso(dado.id);
    }
  });
  td.appendChild(botao);
  return td;
}

async function atualizarPeca(dado, atualizacoes) {
  if (!pecasColRef) return;
  const ref = doc(pecasColRef, dado.id);
  const atualizado = { ...dado, ...atualizacoes };
  const { id, ...payload } = atualizado;
  await setDocWithCopy(ref, payload, uidAtual);
  Object.assign(dado, atualizacoes);
  const original = pecasCache.find((item) => item.id === dado.id);
  if (original) Object.assign(original, atualizacoes);
}

async function atualizarReembolso(dado, atualizacoes) {
  if (!reembolsosColRef) return;
  const ref = doc(reembolsosColRef, dado.id);
  const atualizado = { ...dado, ...atualizacoes };
  const { id, ...payload } = atualizado;
  await setDocWithCopy(ref, payload, uidAtual);
  Object.assign(dado, atualizacoes);
  const original = reembolsosCache.find((item) => item.id === dado.id);
  if (original) Object.assign(original, atualizacoes);
}

async function excluirPeca(id) {
  if (!pecasColRef) return;
  const ref = doc(pecasColRef, id);
  await deleteDocWithCopy(ref);
  pecasCache = pecasCache.filter((item) => item.id !== id);
  renderPecas();
}

async function excluirReembolso(id) {
  if (!reembolsosColRef) return;
  const ref = doc(reembolsosColRef, id);
  await deleteDocWithCopy(ref);
  reembolsosCache = reembolsosCache.filter((item) => item.id !== id);
  renderReembolsos();
}

async function deleteDocWithCopy(ref) {
  await deleteDoc(ref);
  const responsavelUid =
    typeof window !== 'undefined' && window.responsavelFinanceiro?.uid;
  if (responsavelUid && responsavelUid !== uidAtual) {
    const segmentos = ref.path.split('/');
    const relativo = segmentos.slice(2).join('/');
    const copiaRef = doc(
      ref.firestore,
      `uid/${responsavelUid}/uid/${uidAtual}/${relativo}`,
    );
    await deleteDoc(copiaRef);
  }
}

// Tabs
for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('border-violet-600', 'text-violet-600');
      b.classList.add('border-transparent', 'text-slate-500');
    });
    document
      .querySelectorAll('.tab-panel')
      .forEach((p) => p.classList.add('hidden'));
    btn.classList.add('border-violet-600', 'text-violet-600');
    btn.classList.remove('border-transparent', 'text-slate-500');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
}
