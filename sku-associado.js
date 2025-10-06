import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let editId = null;
let skuCache = new Map();

function parseAssociados(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizarListaSku(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return parseAssociados(value);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, ativo]) => ativo !== false && ativo != null)
      .map(([sku]) => String(sku || '').trim())
      .filter(Boolean);
  }
  return [];
}

function popularSelectOptions(excluirSku = null, selecionados = []) {
  const select = document.getElementById('skusPrincipaisVinculados');
  select.innerHTML = '';
  const selecionadosSet = new Set(selecionados);
  const opcoes = Array.from(skuCache.keys()).sort((a, b) => a.localeCompare(b));
  opcoes.forEach((id) => {
    if (id === excluirSku) return;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    if (selecionadosSet.has(id)) option.selected = true;
    select.appendChild(option);
  });
}

function renderTabela() {
  const tbody = document.querySelector('#skuTable tbody');
  tbody.innerHTML = '';
  const linhas = Array.from(skuCache.values()).sort((a, b) =>
    a.skuPrincipal.localeCompare(b.skuPrincipal),
  );
  linhas.forEach((data) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-2 py-1">${data.skuPrincipal}</td>
      <td class="px-2 py-1">${(data.associados || []).join(', ')}</td>
      <td class="px-2 py-1">${(data.principaisVinculados || []).join(', ')}</td>
      <td class="px-2 py-1 space-x-2">
        <button class="text-blue-600" data-edit="${data.id}">Editar</button>
        <button class="text-red-600" data-del="${data.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarSkus() {
  const snap = await getDocs(collection(db, 'skuAssociado'));
  skuCache = new Map();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const escopo = String(data?.escopo || '').toLowerCase();
    if (data?.apenasVts === true || escopo === 'vts') {
      return;
    }
    const skuPrincipal = data.skuPrincipal || docSnap.id;
    const associados = normalizarListaSku(data.associados);
    const principaisVinculados = normalizarListaSku(data.principaisVinculados);

    skuCache.set(docSnap.id, {
      ...data,
      id: docSnap.id,
      skuPrincipal,
      associados,
      principaisVinculados,
    });
  });
  renderTabela();

  const principalAtual = document.getElementById('skuPrincipal').value.trim();
  let selecionados = [];
  if (editId) {
    const dadosEdicao = skuCache.get(editId);
    if (dadosEdicao) {
      selecionados = dadosEdicao.principaisVinculados || [];
    }
  } else {
    const select = document.getElementById('skusPrincipaisVinculados');
    selecionados = Array.from(select.selectedOptions).map((opt) => opt.value);
  }
  const excluirSku = principalAtual || editId || null;
  popularSelectOptions(excluirSku, selecionados);
}

function obterPrincipaisSelecionados() {
  const select = document.getElementById('skusPrincipaisVinculados');
  const valores = Array.from(select.selectedOptions)
    .map((opt) => opt.value)
    .filter(Boolean);
  return Array.from(new Set(valores));
}

function limparFormulario() {
  document.getElementById('skuPrincipal').value = '';
  document.getElementById('skuAssociados').value = '';
  editId = null;
  popularSelectOptions(null, []);
}

async function salvarSku() {
  const principalEl = document.getElementById('skuPrincipal');
  const associadosEl = document.getElementById('skuAssociados');
  const principaisSelecionados = obterPrincipaisSelecionados();
  const skuPrincipal = principalEl.value.trim();
  if (!skuPrincipal) {
    alert('Informe o SKU principal');
    return;
  }
  const associados = Array.from(new Set(parseAssociados(associadosEl.value)));
  const id = editId && editId !== skuPrincipal ? editId : skuPrincipal;
  if (editId && editId !== skuPrincipal) {
    await deleteDoc(doc(db, 'skuAssociado', editId));
  }
  await setDoc(doc(db, 'skuAssociado', skuPrincipal), {
    skuPrincipal,
    associados,
    principaisVinculados: principaisSelecionados.filter(
      (sku) => sku !== skuPrincipal,
    ),
  });
  await carregarSkus();
  limparFormulario();
}

function preencherFormulario(id, data) {
  document.getElementById('skuPrincipal').value = data.skuPrincipal || id;
  document.getElementById('skuAssociados').value = normalizarListaSku(
    data.associados,
  ).join(', ');
  popularSelectOptions(
    data.skuPrincipal || id,
    normalizarListaSku(data.principaisVinculados),
  );
  editId = id;
}

function registrarEventos() {
  document.getElementById('skuPrincipal').addEventListener('input', (e) => {
    const selecionados = obterPrincipaisSelecionados();
    const excluirSku = e.target.value.trim() || editId || null;
    popularSelectOptions(excluirSku, selecionados);
  });
  document.getElementById('salvarSku').addEventListener('click', salvarSku);
  document
    .querySelector('#skuTable tbody')
    .addEventListener('click', async (e) => {
      const idEdit = e.target.getAttribute('data-edit');
      const idDel = e.target.getAttribute('data-del');
      if (idEdit) {
        const dados = skuCache.get(idEdit);
        if (dados) preencherFormulario(idEdit, dados);
      } else if (idDel) {
        if (confirm('Excluir este registro?')) {
          await deleteDoc(doc(db, 'skuAssociado', idDel));
          await carregarSkus();
          if (editId === idDel) {
            limparFormulario();
          }
        }
      }
    });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    carregarSkus();
    registrarEventos();
  }
});
