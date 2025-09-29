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

function parseLista(value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function carregarSkus() {
  const tbody = document.querySelector('#skuTable tbody');
  tbody.innerHTML = '';
  const snap = await getDocs(collection(db, 'skuAssociado'));
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-2 py-1">${data.skuPrincipal || docSnap.id}</td>
      <td class="px-2 py-1">${(data.principaisLinkados || []).join(', ')}</td>
      <td class="px-2 py-1">${(data.associados || []).join(', ')}</td>
      <td class="px-2 py-1 space-x-2">
        <button class="text-blue-600" data-edit="${docSnap.id}">Editar</button>
        <button class="text-red-600" data-del="${docSnap.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function salvarSku() {
  const principalEl = document.getElementById('skuPrincipal');
  const associadosEl = document.getElementById('skuAssociados');
  const principaisLinkadosEl = document.getElementById(
    'skusPrincipaisLinkados',
  );
  const skuPrincipal = principalEl.value.trim();
  if (!skuPrincipal) {
    alert('Informe o SKU principal');
    return;
  }
  const associados = parseLista(associadosEl.value);
  const principaisLinkados = parseLista(principaisLinkadosEl.value);
  const id = editId && editId !== skuPrincipal ? editId : skuPrincipal;
  if (editId && editId !== skuPrincipal) {
    await deleteDoc(doc(db, 'skuAssociado', editId));
  }
  await setDoc(doc(db, 'skuAssociado', skuPrincipal), {
    skuPrincipal,
    associados,
    principaisLinkados,
  });
  principalEl.value = '';
  associadosEl.value = '';
  principaisLinkadosEl.value = '';
  editId = null;
  await carregarSkus();
}

function preencherFormulario(id, data) {
  document.getElementById('skuPrincipal').value = data.skuPrincipal || id;
  document.getElementById('skuAssociados').value = (data.associados || []).join(
    ', ',
  );
  document.getElementById('skusPrincipaisLinkados').value = (
    data.principaisLinkados || []
  ).join(', ');
  editId = id;
}

function registrarEventos() {
  document.getElementById('salvarSku').addEventListener('click', salvarSku);
  document
    .querySelector('#skuTable tbody')
    .addEventListener('click', async (e) => {
      const idEdit = e.target.getAttribute('data-edit');
      const idDel = e.target.getAttribute('data-del');
      if (idEdit) {
        const snap = await getDocs(collection(db, 'skuAssociado'));
        const docSnap = snap.docs.find((d) => d.id === idEdit);
        if (docSnap) preencherFormulario(docSnap.id, docSnap.data());
      } else if (idDel) {
        if (confirm('Excluir este registro?')) {
          await deleteDoc(doc(db, 'skuAssociado', idDel));
          await carregarSkus();
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
