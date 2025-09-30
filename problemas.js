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
import { setDocWithCopy } from './secure-firestore.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let uidAtual = null;
let pecasCache = [];
let pecasFiltradas = [];
let pecasColRef = null;

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
  };
  if (!registro.data || !registro.numero || !registro.peca) {
    alert('Preencha os campos obrigatórios.');
    return;
  }
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
    tr.innerHTML = `
      <td class="p-2">${formatarData(d.data)}</td>
      <td class="p-2"><input type="text" class="nome-input w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500" data-id="${d.id}" value="${d.nomeCliente || ''}"></td>
      <td class="p-2">${d.apelido || ''}</td>
      <td class="p-2">${d.numero || ''}</td>
      <td class="p-2">${d.loja || ''}</td>
      <td class="p-2">${d.peca || ''}</td>
      <td class="p-2">${d.nf || ''}</td>
      <td class="p-2 text-right">
        <div class="flex items-center justify-end">
          <span class="mr-1">R$</span>
          <input type="number" step="0.01" class="valor-input w-24 rounded-xl border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500" data-id="${d.id}" value="${(Number(d.valorGasto) || 0).toFixed(2)}">
        </div>
      </td>
      <td class="p-2">
        <select class="status-select text-xs font-medium rounded-full px-2 py-1 border" data-id="${d.id}">
          <option value="NÃO FEITO" ${d.status === 'NÃO FEITO' ? 'selected' : ''}>Não feito</option>
          <option value="EM ANDAMENTO" ${d.status === 'EM ANDAMENTO' ? 'selected' : ''}>Em andamento</option>
          <option value="RESOLVIDO" ${d.status === 'RESOLVIDO' ? 'selected' : ''}>Resolvido</option>
        </select>
      </td>`;
    const select = tr.querySelector('.status-select');
    aplicarCorStatus(select, d.status);
    select.addEventListener('change', async (ev) => {
      const newStatus = ev.target.value;
      const { id, ...rest } = d;
      await setDocWithCopy(
        doc(pecasColRef, id),
        { ...rest, status: newStatus },
        uidAtual,
      );
      d.status = newStatus;
      aplicarCorStatus(select, newStatus);
    });

    const nomeInput = tr.querySelector('.nome-input');
    nomeInput.addEventListener('change', async (ev) => {
      const newNome = ev.target.value.trim();
      const { id, ...rest } = d;
      await setDocWithCopy(
        doc(pecasColRef, id),
        { ...rest, nomeCliente: newNome },
        uidAtual,
      );
      d.nomeCliente = newNome;
    });

    const valorInput = tr.querySelector('.valor-input');
    valorInput.addEventListener('change', async (ev) => {
      const newValor = parseFloat(ev.target.value) || 0;
      const { id, ...rest } = d;
      await setDocWithCopy(
        doc(pecasColRef, id),
        { ...rest, valorGasto: newValor },
        uidAtual,
      );
      d.valorGasto = newValor;
      ev.target.value = newValor.toFixed(2);
    });
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
  };
  if (!registro.data || !registro.numero || !registro.problema) {
    alert('Preencha os campos obrigatórios.');
    return;
  }
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
  tbody.innerHTML = '';
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'reembolsos');
  const colRef = collection(baseDoc, 'itens');
  const snap = await getDocs(colRef);
  const dados = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  dados.forEach((d) => {
    const tr = document.createElement('tr');
    tr.className =
      'border-t border-slate-100 hover:bg-slate-50 odd:bg-white even:bg-slate-50';
    tr.innerHTML = `
      <td class="p-2">${formatarData(d.data)}</td>
      <td class="p-2">${d.numero || ''}</td>
      <td class="p-2">${d.apelido || ''}</td>
      <td class="p-2">${d.nf || ''}</td>
      <td class="p-2">${d.loja || ''}</td>
      <td class="p-2">${d.problema || ''}</td>
      <td class="p-2 text-right">R$ ${(Number(d.valor) || 0).toFixed(2)}</td>
    `;
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
