import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';
import { firebaseConfig, storageBucketUrl } from './firebase-config.js';
import { fetchResponsavelFinanceiroUsuarios } from './responsavel-financeiro.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app, storageBucketUrl);

const teamListEl = document.getElementById('teamList');
const selectEls = [
  document.getElementById('fileRecipients'),
  document.getElementById('messageRecipients'),
  document.getElementById('alertRecipients'),
];
const commsListEl = document.getElementById('commsList');

const usersMap = {};
const chatDock = document.getElementById('chatDock');
const chatTemplate = document.getElementById('chatWindowTemplate');
const chatWindows = {};

const PAGE_SIZE = 10;
let lastCommDoc = null;
const pageStack = [];

function normalizePerfil(perfil) {
  const p = (perfil || '').toLowerCase().trim();
  if (['adm', 'admin', 'administrador'].includes(p)) return 'adm';
  if (['usuario completo', 'usuario'].includes(p)) return 'usuario';
  if (['usuario basico', 'cliente'].includes(p)) return 'cliente';
  if (
    [
      'gestor',
      'mentor',
      'responsavel',
      'gestor financeiro',
      'responsavel financeiro',
    ].includes(p)
  )
    return 'gestor';
  return p;
}

function addUserOption(user) {
  const li = document.createElement('li');
  li.textContent = user.nome || user.email || user.id;
  li.className = 'cursor-pointer hover:underline';
  li.addEventListener('click', () => openChat(user));
  teamListEl.appendChild(li);
  usersMap[user.id] = user;
  selectEls.forEach((sel) => {
    const opt = document.createElement('option');
    opt.value = user.id;
    opt.textContent = user.nome || user.email || user.id;
    sel.appendChild(opt);
  });
}

function renderComm(c) {
  if (c.tipo === 'mensagem') return;
  const li = document.createElement('li');
  li.className = 'border p-2 rounded';
  if (c.tipo === 'arquivo') {
    li.innerHTML = `<strong>Arquivo:</strong> <a href="${c.arquivoUrl}" target="_blank" class="text-blue-600 underline">${c.arquivoNome || 'Arquivo'}</a>`;
  } else if (c.tipo === 'alerta') {
    li.innerHTML = `<strong>Alerta:</strong> ${c.texto}`;
  }
  commsListEl.appendChild(li);
}

function getConversationId(a, b) {
  return [a, b].sort().join('_');
}

function renderChatMessage(container, msg) {
  const div = document.createElement('div');
  const isMe = msg.remetente === auth.currentUser.uid;
  div.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;
  const bubble = document.createElement('div');
  bubble.className = `px-3 py-2 rounded-lg ${isMe ? 'bg-green-500 text-white' : 'bg-gray-300'}`;
  bubble.textContent = msg.texto;
  div.appendChild(bubble);
  container.appendChild(div);
}

function openChat(userInfo) {
  const cid = getConversationId(auth.currentUser.uid, userInfo.id);
  if (!chatWindows[cid]) {
    const clone = chatTemplate.content.firstElementChild.cloneNode(true);
    chatDock.appendChild(clone);
    const nameEl = clone.querySelector('.chatUserName');
    const messagesEl = clone.querySelector('.chatMessages');
    const inputEl = clone.querySelector('.chatInput');
    const sendBtn = clone.querySelector('.chatSend');
    const closeBtn = clone.querySelector('.closeChat');
    nameEl.textContent = userInfo.nome || userInfo.email || userInfo.id;
    const q = query(
      collection(db, 'comunicacao'),
      where('tipo', '==', 'mensagem'),
      where('conversa', '==', cid),
      orderBy('timestamp'),
    );
    const unsub = onSnapshot(q, (snap) => {
      messagesEl.innerHTML = '';
      snap.forEach((d) => renderChatMessage(messagesEl, d.data()));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
    sendBtn.addEventListener('click', async () => {
      const texto = inputEl.value.trim();
      if (!texto) return;
      const participantes = [auth.currentUser.uid, userInfo.id];
      await addDoc(collection(db, 'comunicacao'), {
        tipo: 'mensagem',
        texto,
        remetente: auth.currentUser.uid,
        destinatarios: participantes,
        conversa: cid,
        timestamp: serverTimestamp(),
      });
      inputEl.value = '';
    });
    inputEl.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') sendBtn.click();
    });
    closeBtn.addEventListener('click', () => {
      if (chatWindows[cid].unsub) chatWindows[cid].unsub();
      clone.remove();
      delete chatWindows[cid];
    });
    chatWindows[cid] = { element: clone, unsub };
  } else {
    const win = chatWindows[cid];
    const inputEl = win.element.querySelector('.chatInput');
    if (inputEl) inputEl.focus();
  }
}

async function loadTeam(user, perfil, data) {
  perfil = normalizePerfil(perfil);
  let members = [];
  if (['gestor', 'adm'].includes(perfil)) {
    const lista = await fetchResponsavelFinanceiroUsuarios(db, user.email);
    members = lista.map((u) => ({
      id: u.uid,
      email: u.email || '',
      nome: u.nome || u.email || u.uid,
    }));
  } else {
    const emails = [];
    if (data.responsavelFinanceiroEmail)
      emails.push(data.responsavelFinanceiroEmail);
    if (Array.isArray(data.gestoresFinanceirosEmails))
      emails.push(...data.gestoresFinanceirosEmails);
    for (const email of emails) {
      const snap = await getDocs(
        query(collection(db, 'usuarios'), where('email', '==', email)),
      );
      snap.forEach((d) =>
        members.push({ id: d.id, email: email, nome: d.data().nome || email }),
      );
    }
  }
  members.forEach(addUserOption);
}

async function loadComms(uid, direction = 'next') {
  let q = query(
    collection(db, 'comunicacao'),
    where('destinatarios', 'array-contains', uid),
    where('tipo', 'in', ['alerta', 'arquivo']),
    orderBy('timestamp', 'desc'),
    limit(PAGE_SIZE),
  );

  if (direction === 'next' && lastCommDoc) {
    q = query(q, startAfter(lastCommDoc));
  } else if (direction === 'prev' && pageStack.length > 1) {
    const prevStart = pageStack[pageStack.length - 2];
    q = query(
      collection(db, 'comunicacao'),
      where('destinatarios', 'array-contains', uid),
      where('tipo', 'in', ['alerta', 'arquivo']),
      orderBy('timestamp', 'desc'),
      endBefore(prevStart),
      limitToLast(PAGE_SIZE),
    );
    pageStack.pop();
  }

  const snap = await getDocs(q);
  commsListEl.innerHTML = '';
  snap.forEach((docSnap) => renderComm(docSnap.data()));

  if (snap.docs.length) {
    lastCommDoc = snap.docs[snap.docs.length - 1];
    const first = snap.docs[0];
    if (direction === 'next') pageStack.push(first);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
  const data = userSnap.exists() ? userSnap.data() : {};
  const perfil = (data.perfil || '').toLowerCase();
  await loadTeam(user, perfil, data);
  await loadComms(user.uid);

  document
    .getElementById('nextCommsBtn')
    ?.addEventListener('click', () => loadComms(user.uid, 'next'));
  document
    .getElementById('prevCommsBtn')
    ?.addEventListener('click', () => loadComms(user.uid, 'prev'));

  onSnapshot(
    query(
      collection(db, 'comunicacao'),
      where('tipo', '==', 'mensagem'),
      where('destinatarios', 'array-contains', user.uid),
      orderBy('timestamp'),
    ),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const msg = change.doc.data();
        const otherId = msg.remetente;
        const cid = getConversationId(user.uid, otherId);
        if (chatWindows[cid]) return;
        if (usersMap[otherId]) {
          openChat(usersMap[otherId]);
        } else {
          getDoc(doc(db, 'usuarios', otherId)).then((ds) => {
            if (!ds.exists()) return;
            const u = {
              id: otherId,
              nome: ds.data().nome || ds.data().email || otherId,
              email: ds.data().email || '',
            };
            usersMap[otherId] = u;
            openChat(u);
          });
        }
      });
    },
  );

  document.getElementById('sendFileBtn').addEventListener('click', async () => {
    const file = document.getElementById('fileInput').files[0];
    const dest = Array.from(
      document.getElementById('fileRecipients').selectedOptions,
    ).map((o) => o.value);
    if (!file || dest.length === 0) return;
    const storageRef = ref(
      storage,
      `comunicacao/${user.uid}/${Date.now()}_${file.name}`,
    );
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await addDoc(collection(db, 'comunicacao'), {
      tipo: 'arquivo',
      arquivoNome: file.name,
      arquivoUrl: url,
      remetente: user.uid,
      destinatarios: dest,
      timestamp: serverTimestamp(),
    });
    document.getElementById('fileInput').value = '';
  });

  document
    .getElementById('sendMessageBtn')
    .addEventListener('click', async () => {
      const texto = document.getElementById('messageText').value.trim();
      const dest = Array.from(
        document.getElementById('messageRecipients').selectedOptions,
      ).map((o) => o.value);
      if (!texto || dest.length === 0) return;
      for (const d of dest) {
        const conversa = getConversationId(user.uid, d);
        const participantes = [user.uid, d];
        await addDoc(collection(db, 'comunicacao'), {
          tipo: 'mensagem',
          texto,
          remetente: user.uid,
          destinatarios: participantes,
          conversa,
          timestamp: serverTimestamp(),
        });
        if (usersMap[d]) openChat(usersMap[d]);
      }
      document.getElementById('messageText').value = '';
    });

  document
    .getElementById('sendAlertBtn')
    .addEventListener('click', async () => {
      const texto = document.getElementById('alertText').value.trim();
      const dest = Array.from(
        document.getElementById('alertRecipients').selectedOptions,
      ).map((o) => o.value);
      if (!texto || dest.length === 0) return;
      await addDoc(collection(db, 'comunicacao'), {
        tipo: 'alerta',
        texto,
        remetente: user.uid,
        destinatarios: dest,
        timestamp: serverTimestamp(),
      });
      document.getElementById('alertText').value = '';
    });
});
