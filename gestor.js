import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';
import { firebaseConfig, storageBucketUrl } from './firebase-config.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app, storageBucketUrl);

let currentUser = null;

function carregarGestoresDropdown() {
  const select = document.getElementById('relGestores');
  if (!select || !currentUser) return;

  let docEmails = [];
  let teamEmails = [];

  const render = () => {
    const set = new Set([...docEmails, ...teamEmails]);
    select.innerHTML = '';
    Array.from(set).forEach((email) => {
      const opt = document.createElement('option');
      opt.value = email;
      opt.textContent = email;
      select.appendChild(opt);
    });
  };

  onSnapshot(doc(db, 'uid', currentUser.uid), (snap) => {
    const data = snap.data() || {};
    if (Array.isArray(data.gestoresExpedicaoEmails)) {
      docEmails = data.gestoresExpedicaoEmails.filter((e) => e);
    } else if (data.responsavelExpedicaoEmail) {
      docEmails = [data.responsavelExpedicaoEmail];
    } else {
      docEmails = [];
    }
    render();
  });

  const colRef = collection(db, 'uid', currentUser.uid, 'expedicaoTeam');
  onSnapshot(colRef, (snap) => {
    teamEmails = [];
    snap.forEach((docu) => {
      const d = docu.data();
      if ((d.cargo || '').toLowerCase() === 'gestor' && d.email) {
        teamEmails.push(d.email);
      }
    });
    render();
  });
}

async function enviarRelatorio(e) {
  e.preventDefault();
  const statusEl = document.getElementById('relStatus');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'text-sm mt-2';
  }
  if (!currentUser) {
    if (statusEl) {
      statusEl.textContent = 'Usuário não autenticado.';
      statusEl.classList.add('text-red-500');
    }
    return;
  }
  const titulo = document.getElementById('relTitulo').value.trim();
  const tipo = document.getElementById('relTipo').value.trim();
  const inicio = document.getElementById('relInicio').value;
  const fim = document.getElementById('relFim').value;
  const gestores = Array.from(
    document.getElementById('relGestores').selectedOptions,
  ).map((o) => o.value);
  if (!gestores.includes(currentUser.email)) {
    gestores.push(currentUser.email);
  }
  const mensagem = document.getElementById('relMensagem').value.trim();
  const arquivos = document.getElementById('relArquivos').files;

  if (!titulo || !tipo || !inicio || !fim || !mensagem) {
    if (statusEl) {
      statusEl.textContent = 'Preencha todos os campos obrigatórios.';
      statusEl.classList.add('text-red-500');
    }
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'relatorios'), {
      titulo,
      tipo,
      inicio,
      fim,
      gestores,
      mensagem,
      status: 'enviado',
      autorUid: currentUser.uid,
      autorNome: currentUser.displayName || currentUser.email,
      createdAt: serverTimestamp(),
      anexos: [],
    });

    const anexos = [];
    for (const file of arquivos) {
      const path = `reports/${currentUser.uid}/${docRef.id}/${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      anexos.push({ nome: file.name, url });
    }
    if (anexos.length) {
      await updateDoc(docRef, { anexos });
    }

    document.getElementById('relTitulo').value = '';
    document.getElementById('relTipo').value = '';
    document.getElementById('relInicio').value = '';
    document.getElementById('relFim').value = '';
    document.getElementById('relMensagem').value = '';
    document.getElementById('relArquivos').value = '';
    Array.from(document.getElementById('relGestores').options).forEach(
      (o) => (o.selected = false),
    );
    if (statusEl) {
      statusEl.textContent = 'Relatório enviado com sucesso!';
      statusEl.classList.add('text-green-500');
    }
  } catch (err) {
    console.error('Erro ao enviar relatório:', err);
    if (statusEl) {
      statusEl.textContent = 'Erro ao enviar relatório.';
      statusEl.classList.add('text-red-500');
    }
  }
}

function renderRelatorioCard(id, data, isGestor) {
  const statusColors = {
    enviado: 'bg-gray-400',
    'em-analise': 'bg-yellow-500',
    aprovado: 'bg-green-500',
    reprovado: 'bg-red-500',
    ajustes: 'bg-purple-500',
  };
  const card = document.createElement('div');
  card.className = 'card';
  const anexosHtml = (data.anexos || [])
    .map(
      (a) =>
        `<a href="${a.url}" target="_blank" class="text-blue-500 underline block">${a.nome}</a>`,
    )
    .join('');
  card.innerHTML = `
    <div class="card-header flex justify-between items-center">
      <h3 class="font-bold">${data.titulo || 'Sem título'}</h3>
      <span class="text-white text-xs px-2 py-1 rounded ${statusColors[data.status] || 'bg-gray-300'}">${data.status}</span>
    </div>
    <div class="card-body space-y-2">
      <p class="text-sm">Tipo: ${data.tipo || '-'}</p>
      <p class="text-sm">Período: ${data.inicio || ''} - ${data.fim || ''}</p>
      <p class="text-sm">${data.mensagem || ''}</p>
      <div class="space-y-1">${anexosHtml}</div>
      ${
        isGestor
          ? `
      <div class="flex flex-wrap gap-2 mt-2">
        <button class="btnStatus btn btn-secondary" data-id="${id}" data-s="em-analise">Em análise</button>
        <button class="btnStatus btn btn-secondary" data-id="${id}" data-s="aprovado">Aprovado</button>
        <button class="btnStatus btn btn-secondary" data-id="${id}" data-s="reprovado">Reprovado</button>
        <button class="btnStatus btn btn-secondary" data-id="${id}" data-s="ajustes">Ajustes</button>
      </div>
      <div class="mt-2">
        <textarea class="form-control mb-2" data-coment="${id}" placeholder="Comentário"></textarea>
        <button class="enviarComent btn btn-primary" data-id="${id}">Enviar comentário</button>
      </div>`
          : ''
      }
    </div>
  `;
  return card;
}

function listenMinhasSubmissoes() {
  const q = query(
    collection(db, 'relatorios'),
    where('autorUid', '==', currentUser.uid),
  );
  onSnapshot(q, (snap) => {
    const list = document.getElementById('listaMeusRelatorios');
    list.innerHTML = '';
    snap.forEach((docSnap) => {
      list.appendChild(renderRelatorioCard(docSnap.id, docSnap.data(), false));
    });
  });
}

function listenCaixaGestor() {
  const wrap = document.getElementById('caixaGestor');
  wrap.classList.remove('hidden');
  const isGestor = ['gestor', 'adm'].includes(
    (window.userPerfil || '').toLowerCase(),
  );
  const q = query(
    collection(db, 'relatorios'),
    where('gestores', 'array-contains', currentUser.email),
  );
  onSnapshot(q, (snap) => {
    const list = document.getElementById('listaCaixaGestor');
    list.innerHTML = '';
    snap.forEach((docSnap) => {
      list.appendChild(
        renderRelatorioCard(docSnap.id, docSnap.data(), isGestor),
      );
    });
  });
}

async function atualizarStatus(id, status) {
  await updateDoc(doc(db, 'relatorios', id), { status });
}

async function enviarComentario(id, texto) {
  await addDoc(collection(db, 'relatorios', id, 'comentarios'), {
    autorUid: currentUser.uid,
    texto,
    createdAt: serverTimestamp(),
  });
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btnStatus');
  if (btn) {
    await atualizarStatus(btn.dataset.id, btn.dataset.s);
  }
  const btnC = e.target.closest('.enviarComent');
  if (btnC) {
    const id = btnC.dataset.id;
    const textarea = document.querySelector(`textarea[data-coment="${id}"]`);
    const texto = textarea.value.trim();
    if (texto) {
      await enviarComentario(id, texto);
      textarea.value = '';
    }
  }
});

function initAbaGestor() {
  document
    .getElementById('btnEnviarRelatorio')
    .addEventListener('click', enviarRelatorio);
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await carregarGestoresDropdown();
      listenMinhasSubmissoes();
      listenCaixaGestor();
    }
  });
}

window.initAbaGestor = initAbaGestor;
