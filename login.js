import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  firebaseConfig,
  setPassphrase,
  getPassphrase,
} from './firebase-config.js';
import { encryptString, decryptString } from './crypto.js';
import { fetchResponsavelFinanceiroUsuarios } from './responsavel-financeiro.js';
import { showToast } from './utils.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const profileCache = {};

export async function loadUserProfile(uid) {
  if (!uid) return null;
  if (profileCache[uid]) return profileCache[uid];
  const key = `userProfile:${uid}`;
  try {
    const cached =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem(key));
    if (cached) {
      const obj = JSON.parse(cached);
      profileCache[uid] = obj;
      return obj;
    }
  } catch {}

  const usuarioSnap = await getDoc(doc(db, 'usuarios', uid));
  const perfilSnap = await getDoc(doc(db, 'perfil', uid));
  const mentSnap = await getDoc(doc(db, 'perfilMentorado', uid));
  if (!usuarioSnap.exists()) return null;
  const usuario = usuarioSnap.data() || {};
  const perfil = perfilSnap.exists() ? perfilSnap.data() : {};
  const perfilMentorado = mentSnap.exists() ? mentSnap.data() : {};

  const data = {
    uid,
    perfil: usuario.perfil || perfil.perfil || 'usuario',
    nome: usuario.nome || perfil.nome || '',
    email: usuario.email || perfil.email || '',
    isAdm: !!usuario.isAdm,
    lojas: usuario.lojas || perfil.lojas || [],
    ...perfil,
    perfilMentorado,
  };
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, JSON.stringify(data));
    }
  } catch {}
  profileCache[uid] = data;
  return data;
}

export function clearUserProfileCache(uid) {
  const key = `userProfile:${uid}`;
  delete profileCache[uid];
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.loadUserProfile = loadUserProfile;
  window.clearUserProfileCache = clearUserProfileCache;
}
const VISIBILIDADE_GLOBAL_ID = '__todos_conectados__';
let wasLoggedIn = false;
let authListenerRegistered = false;
let explicitLogout = false;
let isExpedicao = false;
const EXPEDICAO_ALLOWED_MENU_IDS = [
  'menu-expedicao',
  'menu-configuracoes',
  'menu-painel-atualizacoes-gerais',
];
const DEFAULT_MEETING_NAVBAR_TITLE = 'Reuniões agendadas';
let notifUnsub = null;
let expNotifUnsub = null;
let expLabelNotifUnsub = null;
let updNotifUnsub = null;
let painelGeralNotifUnsub = null;
let painelMentNotifUnsub = null;
let painelGeralReuniaoNotifUnsub = null;
let navbarMeetingsUnsubs = [];
let navbarMeetingsPersonalDocs = new Map();
let navbarMeetingsGlobalDocs = new Map();
let navbarMeetingsCombinedDocs = [];
let navbarMeetingsTimer = null;
window.isFinanceiroResponsavel = false;
window.responsavelFinanceiro = null;

window.savePassphrase = () => {
  const input = document.getElementById('passphraseInput');
  const pass = input.value.trim();
  if (pass) {
    setPassphrase(pass);

    input.value = '';
    closeModal('passphraseModal');
  } else {
    showToast('Digite uma senha', 'warning');
  }
};

window.saveDisplayName = async () => {
  const input = document.getElementById('displayNameInput');
  const nome = input.value.trim();
  const user = auth.currentUser;
  if (!user || !nome) {
    showToast('Digite um nome', 'warning');
    return;
  }
  try {
    const pass = getPassphrase() || `chave-${user.uid}`;
    let perfil = 'Cliente';
    const uidRef = doc(db, 'uid', user.uid);
    const snap = await getDoc(uidRef);
    if (snap.exists()) {
      const enc = snap.data().encrypted;
      if (enc) {
        try {
          const data = JSON.parse(await decryptString(enc, pass));
          perfil = data.perfil || perfil;
        } catch {}
      }
    }
    await setDoc(
      uidRef,
      {
        uid: user.uid,
        email: user.email,
        nome,
        encrypted: await encryptString(JSON.stringify({ perfil }), pass),
      },
      { merge: true },
    );
    try {
      await updateProfile(user, { displayName: nome });
    } catch {}
    const currentUserEl = document.getElementById('currentUser');
    if (currentUserEl) currentUserEl.textContent = nome;
    input.value = '';
    closeModal('displayNameModal');
    showToast('Nome atualizado!', 'success');
  } catch (e) {
    console.error('Erro ao salvar nome:', e);
    showToast('Erro ao salvar nome', 'error');
  }
};

window.openModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
};

window.closeModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
};

window.openRecoverModal = () => {
  closeModal('loginModal');
  openModal('recoverModal');
};

window.login = () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const passphrase = document.getElementById('loginPassphrase').value;

  setPersistence(auth, browserLocalPersistence)
    .then(() => signInWithEmailAndPassword(auth, email, password))
    .then((cred) => {
      if (passphrase) {
        setPassphrase(passphrase);
      }
      showUserArea(cred.user);
      closeModal('loginModal');
      document.getElementById('loginPassphrase').value = '';
    })
    .catch((err) =>
      showToast('Credenciais inválidas! ' + err.message, 'error'),
    );
};

window.logout = () => {
  explicitLogout = true;
  signOut(auth).catch((err) =>
    showToast('Erro ao sair: ' + err.message, 'error'),
  );
};

window.sendRecovery = () => {
  const email = document.getElementById('recoverEmail').value;
  if (!email.includes('@')) {
    showToast('E-mail inválido!', 'warning');
    return;
  }
  sendPasswordResetEmail(auth, email)
    .then(() => {
      showToast('E-mail de recuperação enviado!', 'success');
      closeModal('recoverModal');
    })
    .catch((err) =>
      showToast('Erro ao enviar recuperação: ' + err.message, 'error'),
    );
};

async function showUserArea(user) {
  const nameEl = document.getElementById('currentUser');
  if (nameEl) {
    nameEl.textContent = user.email;
    nameEl.onclick = () => {
      const input = document.getElementById('displayNameInput');
      if (input) input.value = nameEl.textContent;
      openModal('displayNameModal');
    };
  }
  // Exibe os botões de logout
  document
    .querySelectorAll('#logoutBtn, #logoutSidebarBtn')
    .forEach((btn) => btn.classList.remove('hidden'));

  window.sistema = window.sistema || {};
  window.sistema.uid = user.uid;
  const senha = getPassphrase();
  if (!senha) {
    const jaExibiuModal = localStorage.getItem('passphraseModalShown');
    if (!jaExibiuModal) {
      openModal('passphraseModal');
      localStorage.setItem('passphraseModalShown', 'true');
    }
  }

  let perfilFallback = '';
  try {
    const uidSnap = await getDoc(doc(db, 'uid', user.uid));
    const uidData = uidSnap.data();
    if (nameEl && uidData?.nome) {
      nameEl.textContent = uidData.nome;
    }
    if (uidData?.encrypted) {
      const pass = getPassphrase() || `chave-${user.uid}`;
      try {
        const data = JSON.parse(await decryptString(uidData.encrypted, pass));
        if (nameEl && !uidData?.nome && data.nome) {
          nameEl.textContent = data.nome;
        }
        if (data.perfil) {
          perfilFallback = String(data.perfil).toLowerCase().trim();
        }
      } catch {}
    }
  } catch (e) {
    console.error('Erro ao carregar nome/perfil do usuário:', e);
  }

  try {
    const profile = await loadUserProfile(user.uid);
    if (nameEl && profile?.nome) {
      nameEl.textContent = profile.nome;
    }
    let perfil = normalizePerfil(
      profile?.perfil || perfilFallback || 'usuario',
    );
    window.userPerfil = perfil;
    window.authUser = user;
    window.userProfile = profile;
    window.userPerms = { perfil, isAdm: profile?.isAdm || false };

    if (['gestor', 'adm'].includes(perfil)) {
      const path = window.location.pathname.toLowerCase();
      if (
        path.endsWith('/index.html') ||
        path.endsWith('/login.html') ||
        path.endsWith('/')
      ) {
        window.location.href = 'financeiro.html';
        return;
      }
    }

    // 1) aplica restrições de UI
    applyPerfilRestrictions(perfil);

    // 2) verifica associação com expedição (gestor ou responsável)
    if (perfil !== 'expedicao') {
      await checkExpedicao(user);
    }

    // 3) localiza responsável financeiro do usuário, se houver
    try {
      let respEmail = profile?.responsavelFinanceiroEmail;
      if (!respEmail) {
        const altDoc = await getDoc(doc(db, 'uid', user.uid));
        if (altDoc.exists())
          respEmail = altDoc.data().responsavelFinanceiroEmail;
      }
      if (respEmail) {
        const respQuery = query(
          collection(db, 'usuarios'),
          where('email', '==', respEmail),
        );
        const respDocs = await getDocs(respQuery);
        if (!respDocs.empty) {
          const d = respDocs.docs[0];
          window.responsavelFinanceiro = { uid: d.id, ...d.data() };
        }
      }
    } catch (e) {
      console.error('Erro ao localizar responsável financeiro do usuário:', e);
    }

    // 4) verifica se usuário é responsável financeiro e garante acesso às sobras
    try {
      const respUsuarios = await fetchResponsavelFinanceiroUsuarios(
        db,
        user.email,
      );
      window.isFinanceiroResponsavel = respUsuarios.length > 0;
      ensureFinanceiroMenu();
    } catch (e) {
      console.error('Erro ao verificar responsável financeiro:', e);
    }
  } catch (e) {
    console.error('Erro ao carregar perfil do usuário:', e);
  }
}

function hideUserArea() {
  const nameEl = document.getElementById('currentUser');
  if (nameEl) {
    nameEl.textContent = 'Usuário';
    nameEl.onclick = null;
  }
  // Oculta os botões de logout
  document
    .querySelectorAll('#logoutBtn, #logoutSidebarBtn')
    .forEach((btn) => btn.classList.add('hidden'));
  if (window.sistema) delete window.sistema.uid;

  // ⚠️ Reseta para mostrar o modal novamente no próximo login
  localStorage.removeItem('passphraseModalShown');
  isExpedicao = false;
  restoreSidebar();
}

function applyExpedicaoSidebar(extraAllowedIds = []) {
  const allowedIds = Array.from(
    new Set([...EXPEDICAO_ALLOWED_MENU_IDS, ...extraAllowedIds]),
  );

  const filter = () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const allowedLis = allowedIds
      .map((id) => document.getElementById(id)?.closest('li'))
      .filter(Boolean);

    sidebar.querySelectorAll('li').forEach((li) => {
      if (allowedLis.some((ali) => ali === li || ali.contains(li))) {
        li.classList.remove('hidden');
        li.style.display = '';
      } else {
        li.classList.add('hidden');
      }
    });

    const submenu = document.getElementById('menuExpedicao');
    if (submenu) {
      submenu.style.maxHeight = submenu.scrollHeight + 'px';
    }

    const configMenu = document.getElementById('menuConfiguracoes');
    if (configMenu) {
      configMenu.style.maxHeight = configMenu.scrollHeight + 'px';
    }
  };

  filter();
  document.addEventListener('sidebarLoaded', filter);
}

function restoreSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.querySelectorAll('li, a.sidebar-link').forEach((el) => {
    el.classList.remove('hidden');
    if (el.style) el.style.display = '';
  });
}

function normalizePerfil(perfil) {
  const p = (perfil || '').toLowerCase().trim();
  if (!p) return '';
  const base = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['adm', 'admin', 'administrador'].includes(base)) return 'adm';
  if (['usuario completo', 'usuario'].includes(base)) return 'usuario';
  if (['usuario basico', 'cliente'].includes(base)) return 'cliente';
  if (
    [
      'gestor',
      'mentor',
      'responsavel',
      'gestor financeiro',
      'responsavel financeiro',
    ].includes(base)
  )
    return 'gestor';
  if (['expedicao', 'gestor expedicao', 'gestor de expedicao'].includes(base))
    return 'expedicao';
  return base;
}
function applyPerfilRestrictions(perfil) {
  const currentPerfil = normalizePerfil(perfil);
  if (!currentPerfil) return;
  if (currentPerfil === 'expedicao') {
    applyExpedicaoSidebar();
    return;
  }
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const menuLinks = Array.from(sidebar.querySelectorAll('a[id^="menu-"]'));
  const allIds = menuLinks.map((a) => a.id);

  const nivelMenus = {
    adm: allIds,
    usuario: [
      'menu-vendas',
      'menu-saques',
      'menu-etiquetas',
      'menu-precificacao',
      'menu-marketing',
      'menu-anuncios',
      'menu-expedicao',
      'menu-gestao-contas',
      'menu-acompanhamento',
      'menu-outros',
      'menu-configuracoes',
      'menu-comunicacao',
      'menu-painel-atualizacoes-gerais',
      'menu-painel-atualizacoes-mentorados',
    ],
    cliente: [
      'menu-vendas',
      'menu-saques',
      'menu-etiquetas',
      'menu-precificacao',
      'menu-expedicao',
      'menu-configuracoes',
      'menu-comunicacao',
      'menu-painel-atualizacoes-gerais',
      'menu-painel-atualizacoes-mentorados',
    ],
    gestor: [
      'menu-atualizacoes',
      'menu-painel-atualizacoes-gerais',
      'menu-painel-atualizacoes-mentorados',
      'menu-financeiro',
      'menu-produtos-precos',
      'menu-pedidos-reais',
      'menu-gestao',
      'menu-produtos-vendidos',
      'menu-acompanhamento-problemas',
      'menu-mentoria',
      'menu-produtos',
      'menu-configuracoes',
      'menu-perfil-mentorado',
      'menu-acompanhamento-gestor',
      'menu-sku-associado',
      'menu-desempenho',
    ],
    expedicao: EXPEDICAO_ALLOWED_MENU_IDS,
  };

  const allowed = nivelMenus[currentPerfil];
  if (allowed) {
    menuLinks.forEach((link) => {
      const li = link.closest('li');
      if (allowed.includes(link.id)) {
        li.classList.remove('hidden');
      } else {
        li.classList.add('hidden');
      }
    });
  }

  document.querySelectorAll('[data-perfil]').forEach((el) => {
    const allowedPerfis = (el.getAttribute('data-perfil') || '')
      .toLowerCase()
      .split(',')
      .map((p) => normalizePerfil(p));
    const show =
      currentPerfil === 'adm' || allowedPerfis.includes(currentPerfil);
    if (!show) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });
}

function ensureFinanceiroMenu() {
  const menu = document.getElementById('menu-vendas');
  if (!menu) return;
  if (window.isFinanceiroResponsavel || window.userPerfil === 'gestor') {
    menu.classList.remove('hidden');
  }
}

async function checkExpedicao(user) {
  try {
    let snap = await getDocs(
      query(
        collection(db, 'usuarios'),
        where('responsavelExpedicaoEmail', '==', user.email),
      ),
    );
    if (snap.empty) {
      snap = await getDocs(
        query(
          collection(db, 'usuarios'),
          where('gestoresExpedicaoEmails', 'array-contains', user.email),
        ),
      );
    }
    if (!snap.empty) {
      isExpedicao = true;
      applyExpedicaoSidebar(['menu-comunicacao']);
      const path = window.location.pathname.toLowerCase();
      if (!path.endsWith('/expedicao.html')) {
        window.location.href = 'expedicao.html';
      }
    }
  } catch (e) {
    console.error('Erro ao verificar expedição:', e);
  }
}

window.requireLogin = (event) => {
  if (!auth.currentUser) {
    event.preventDefault();
    openModal('loginModal');
    return false;
  }
  return true;
};

function normalizeMeetingTime(value) {
  if (!value) return '';
  const [hoursStr, minutesStr] = String(value).split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (
    !Number.isInteger(hours) ||
    hours < 0 ||
    hours > 23 ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    return '';
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseISODate(value) {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = String(value).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function computeNavbarMeetingStart(meeting) {
  if (!meeting) return null;
  let inicio = meeting.inicio;
  if (inicio && typeof inicio.toDate === 'function') {
    try {
      inicio = inicio.toDate();
    } catch (e) {
      inicio = null;
    }
  }
  if (inicio instanceof Date && !Number.isNaN(inicio.valueOf())) {
    return inicio;
  }
  const baseDate = parseISODate(meeting.dataIso || meeting.data);
  if (!baseDate) return null;
  const normalized = normalizeMeetingTime(meeting.hora);
  if (normalized) {
    const [hour, minute] = normalized.split(':').map(Number);
    baseDate.setHours(hour, minute, 0, 0);
  }
  return baseDate;
}

function summarizeNavbarMeetingParticipants(meeting) {
  if (!meeting) return '';
  const resumo = (meeting.participantesResumo || '').toString().trim();
  if (resumo) return resumo;
  if (!Array.isArray(meeting.participantesNomes)) return '';
  const nomes = meeting.participantesNomes
    .map((nome) => (typeof nome === 'string' ? nome.trim() : ''))
    .filter(Boolean);
  if (!nomes.length) return '';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  if (nomes.length === 3) return `${nomes[0]}, ${nomes[1]} e ${nomes[2]}`;
  return `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
}

function hideNavbarMeetingsIndicator() {
  const wrapper = document.getElementById('navbarMeetingsWrapper');
  const badge = document.getElementById('navbarMeetingsBadge');
  const btn = document.getElementById('navbarMeetingsBtn');
  if (wrapper) wrapper.classList.add('hidden');
  if (badge) {
    badge.classList.add('hidden');
    badge.textContent = '';
  }
  if (btn) {
    btn.classList.remove('active');
    btn.title = DEFAULT_MEETING_NAVBAR_TITLE;
    btn.setAttribute('aria-label', DEFAULT_MEETING_NAVBAR_TITLE);
  }
}

function clearNavbarMeetingsTimer() {
  if (navbarMeetingsTimer) {
    clearTimeout(navbarMeetingsTimer);
    navbarMeetingsTimer = null;
  }
}

function scheduleNavbarMeetingsUpdate(nextStart) {
  clearNavbarMeetingsTimer();
  if (!(nextStart instanceof Date) || Number.isNaN(nextStart.valueOf())) return;
  const diff = nextStart.getTime() - Date.now();
  const safeDelay = Math.min(Math.max(diff, 0) + 1000, 2147483000);
  navbarMeetingsTimer = window.setTimeout(() => {
    updateNavbarMeetingsIndicator();
  }, safeDelay);
}

function rebuildNavbarMeetingsState() {
  const merged = new Map();
  navbarMeetingsPersonalDocs.forEach((value, key) => merged.set(key, value));
  navbarMeetingsGlobalDocs.forEach((value, key) => merged.set(key, value));
  navbarMeetingsCombinedDocs = Array.from(merged.values());
  updateNavbarMeetingsIndicator();
}

function updateNavbarMeetingsIndicator() {
  const wrapper = document.getElementById('navbarMeetingsWrapper');
  const badge = document.getElementById('navbarMeetingsBadge');
  const btn = document.getElementById('navbarMeetingsBtn');
  if (!wrapper || !badge || !btn) {
    clearNavbarMeetingsTimer();
    return;
  }
  const now = Date.now();
  const upcoming = navbarMeetingsCombinedDocs
    .map((meeting) => ({
      meeting,
      start: computeNavbarMeetingStart(meeting),
    }))
    .filter(
      (item) =>
        item.start instanceof Date &&
        !Number.isNaN(item.start.valueOf()) &&
        item.start.getTime() >= now,
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (!upcoming.length) {
    hideNavbarMeetingsIndicator();
    clearNavbarMeetingsTimer();
    return;
  }

  wrapper.classList.remove('hidden');
  btn.classList.add('active');

  const count = upcoming.length;
  if (count > 1) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }

  const next = upcoming[0];
  const dateText = next.start.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const normalizedTime = normalizeMeetingTime(next.meeting.hora);
  const hasExplicitTime =
    normalizedTime ||
    next.start.getHours() !== 0 ||
    next.start.getMinutes() !== 0;
  const timeText = normalizedTime
    ? normalizedTime
    : hasExplicitTime
      ? next.start.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  const participantesResumo = summarizeNavbarMeetingParticipants(next.meeting);
  const descricao = (next.meeting.descricao || '').toString().trim();
  let tooltip = `Próxima reunião: ${dateText}`;
  if (timeText) {
    tooltip += ` às ${timeText}`;
  }
  if (participantesResumo) {
    tooltip += ` com ${participantesResumo}`;
  }
  if (descricao) {
    tooltip += ` — ${descricao}`;
  }

  btn.title = tooltip;
  btn.setAttribute('aria-label', tooltip);
  scheduleNavbarMeetingsUpdate(next.start);
}

function cleanupNavbarMeetings() {
  navbarMeetingsUnsubs.forEach((unsub) => {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (err) {
      console.error('Erro ao encerrar listener de reuniões do navbar:', err);
    }
  });
  navbarMeetingsUnsubs = [];
  navbarMeetingsPersonalDocs = new Map();
  navbarMeetingsGlobalDocs = new Map();
  navbarMeetingsCombinedDocs = [];
  clearNavbarMeetingsTimer();
  hideNavbarMeetingsIndicator();
}

function initNavbarMeetingsListener(uid) {
  if (!uid) {
    cleanupNavbarMeetings();
    return;
  }

  const wrapper = document.getElementById('navbarMeetingsWrapper');
  const btn = document.getElementById('navbarMeetingsBtn');
  const badge = document.getElementById('navbarMeetingsBadge');
  if (!wrapper || !btn || !badge) {
    document.addEventListener(
      'navbarLoaded',
      function retryInit() {
        document.removeEventListener('navbarLoaded', retryInit);
        initNavbarMeetingsListener(uid);
      },
      { once: true },
    );
    return;
  }

  cleanupNavbarMeetings();

  if (!btn.dataset.meetingsInitialized) {
    btn.addEventListener('click', () => {
      window.location.href = 'painel-atualizacoes-gerais.html';
    });
    btn.dataset.meetingsInitialized = 'true';
  }

  const baseCollection = collection(db, 'painelAtualizacoesGerais');

  const personalQuery = query(
    baseCollection,
    where('categoria', '==', 'reuniao'),
    where('participantes', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(120),
  );

  const globalQuery = query(
    baseCollection,
    where('categoria', '==', 'reuniao'),
    where('participantes', 'array-contains', VISIBILIDADE_GLOBAL_ID),
    orderBy('createdAt', 'desc'),
    limit(120),
  );

  const handleSnapshot = (source) => (snap) => {
    const map =
      source === 'global'
        ? navbarMeetingsGlobalDocs
        : navbarMeetingsPersonalDocs;
    map.clear();
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      map.set(docSnap.id, { id: docSnap.id, ...data });
    });
    rebuildNavbarMeetingsState();
  };

  const handleError = (err) => {
    console.error('Erro ao carregar reuniões do navbar:', err);
  };

  navbarMeetingsUnsubs = [
    onSnapshot(personalQuery, handleSnapshot('personal'), handleError),
    onSnapshot(globalQuery, handleSnapshot('global'), handleError),
  ];
}

function initNotificationListener(uid) {
  const btn = document.getElementById('notificationBtn');
  const badge = document.getElementById('notificationBadge');
  const list = document.getElementById('notificationList');
  if (!btn || !badge || !list) {
    document.addEventListener(
      'navbarLoaded',
      function retryNotif() {
        document.removeEventListener('navbarLoaded', retryNotif);
        initNotificationListener(uid);
      },
      { once: true },
    );
    return;
  }
  initNavbarMeetingsListener(uid);
  if (notifUnsub) notifUnsub();
  if (expNotifUnsub) expNotifUnsub();
  if (expLabelNotifUnsub) expLabelNotifUnsub();
  if (updNotifUnsub) updNotifUnsub();
  if (painelGeralNotifUnsub) painelGeralNotifUnsub();
  if (painelMentNotifUnsub) painelMentNotifUnsub();
  if (painelGeralReuniaoNotifUnsub) painelGeralReuniaoNotifUnsub();

  let finNotifs = [];
  let expNotifs = [];
  let expLabelNotifs = [];
  let updNotifs = [];
  let painelGeralNotifs = [];
  let painelGeralReunioesNotifs = [];
  let painelMentNotifs = [];

  const storageKey = `notificationsRead:${uid}`;
  const loadStoredRead = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
      return new Set();
    } catch (e) {
      console.warn('Não foi possível carregar notificações lidas:', e);
      return new Set();
    }
  };

  let readNotifications = loadStoredRead();

  const persistRead = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(readNotifications)),
      );
    } catch (e) {
      console.warn('Não foi possível salvar notificações lidas:', e);
    }
  };

  const markNotificationAsRead = (id) => {
    if (!id || readNotifications.has(id)) return false;
    readNotifications.add(id);
    persistRead();
    return true;
  };

  const markAllNotificationsAsRead = (ids) => {
    let updated = false;
    ids.forEach((id) => {
      if (!readNotifications.has(id)) {
        readNotifications.add(id);
        updated = true;
      }
    });
    if (updated) persistRead();
    return updated;
  };

  const formatLabelNotification = (data) => {
    if (!data) return 'Novo arquivo de etiquetas disponível.';
    const autor = data.autorNome || data.autorEmail || 'Usuário';
    const origem = data.origem || 'sistema de etiquetas';
    const arquivo = data.arquivoNome || data.fileName || 'arquivo';
    const totalEtiquetas = Number.isFinite(data.totalEtiquetas)
      ? Number(data.totalEtiquetas)
      : null;
    const totalPaginas = Number.isFinite(data.totalPaginas)
      ? Number(data.totalPaginas)
      : null;
    let quantidadeTexto = 'um arquivo de etiquetas';
    if (totalEtiquetas !== null) {
      quantidadeTexto =
        totalEtiquetas === 1 ? '1 etiqueta' : `${totalEtiquetas} etiquetas`;
    } else if (totalPaginas !== null && totalPaginas > 0) {
      quantidadeTexto =
        totalPaginas === 1 ? '1 página' : `${totalPaginas} páginas`;
    }
    const foraHorario = data.foraHorario ? ' (fora do horário padrão)' : '';
    return `${autor} enviou ${quantidadeTexto}${foraHorario} via ${origem}: ${arquivo}`;
  };

  const render = () => {
    list.innerHTML = '';
    const all = [
      ...finNotifs,
      ...expNotifs,
      ...expLabelNotifs,
      ...updNotifs,
      ...painelGeralNotifs,
      ...painelGeralReunioesNotifs,
      ...painelMentNotifs,
    ].sort((a, b) => b.ts - a.ts);

    if (!all.length) {
      const empty = document.createElement('div');
      empty.className = 'px-4 py-3 text-sm text-gray-500';
      empty.textContent = 'Nenhuma notificação disponível.';
      list.appendChild(empty);
      badge.classList.add('hidden');
      return;
    }

    const unread = all.filter((n) => !readNotifications.has(n.id));
    const read = all.filter((n) => readNotifications.has(n.id));
    const recentRead = read.slice(0, 3);
    const unreadCount = unread.length;

    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    const createItem = (notif, isRead) => {
      const wrapper = document.createElement('div');
      wrapper.className =
        'px-4 py-2 border-b last:border-none hover:bg-gray-100 transition-colors';
      if (isRead) {
        wrapper.classList.add('bg-gray-50', 'text-gray-500');
      }

      const mainBtn = document.createElement('button');
      mainBtn.type = 'button';
      mainBtn.className = `text-left w-full text-sm ${
        isRead ? 'opacity-75 cursor-pointer' : 'font-medium text-gray-700'
      }`;
      mainBtn.textContent = notif.text;
      mainBtn.addEventListener('click', () => {
        const hasChanged = markNotificationAsRead(notif.id);
        if (hasChanged) render();
        list.classList.add('hidden');
        if (notif.url) window.location.href = notif.url;
      });
      wrapper.appendChild(mainBtn);

      if (!isRead) {
        const actions = document.createElement('div');
        actions.className = 'mt-1 flex justify-end';
        const markBtn = document.createElement('button');
        markBtn.type = 'button';
        markBtn.className =
          'text-xs text-brand hover:underline focus:outline-none focus:ring-0';
        markBtn.textContent = 'Marcar como lida';
        markBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const hasChanged = markNotificationAsRead(notif.id);
          if (hasChanged) render();
        });
        actions.appendChild(markBtn);
        wrapper.appendChild(actions);
      }

      return wrapper;
    };

    if (unread.length) {
      const title = document.createElement('div');
      title.className = 'px-4 pt-2 pb-1 text-xs font-semibold text-gray-500';
      title.textContent = 'Novas notificações';
      list.appendChild(title);
      unread.forEach((notif) => {
        list.appendChild(createItem(notif, false));
      });

      const markAll = document.createElement('button');
      markAll.type = 'button';
      markAll.className =
        'w-full px-4 py-2 text-xs text-brand font-medium hover:bg-gray-100';
      markAll.textContent = 'Marcar todas como lidas';
      markAll.addEventListener('click', () => {
        const changed = markAllNotificationsAsRead(unread.map((n) => n.id));
        if (changed) render();
      });
      list.appendChild(markAll);
    } else {
      const emptyUnread = document.createElement('div');
      emptyUnread.className = 'px-4 py-3 text-xs text-gray-500';
      emptyUnread.textContent = 'Você não possui notificações novas.';
      list.appendChild(emptyUnread);
    }

    if (recentRead.length) {
      const title = document.createElement('div');
      title.className = 'px-4 pt-3 pb-1 text-xs font-semibold text-gray-400';
      title.textContent =
        recentRead.length < read.length
          ? 'Últimas notificações lidas'
          : 'Notificações lidas';
      list.appendChild(title);
      recentRead.forEach((notif) => {
        list.appendChild(createItem(notif, true));
      });
    }
  };

  render();

  const qFin = query(
    collection(db, 'financeiroAtualizacoes'),
    where('destinatarios', 'array-contains', uid),
    where('tipo', '==', 'faturamento'),
    orderBy('createdAt', 'desc'),
  );
  notifUnsub = onSnapshot(
    qFin,
    (snap) => {
      finNotifs = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.autorUid === uid) return;
        const email = data.autorEmail || data.autorNome || '';
        const dataFat =
          data.dataFaturamento ||
          data.createdAt?.toDate?.().toLocaleDateString('pt-BR') ||
          '';
        finNotifs.push({
          id: `fin:${docSnap.id}`,
          text: `${email} - ${dataFat}`,
          ts: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0,
          url: 'financeiro.html',
        });
      });
      render();
    },
    (err) => {
      console.error('Erro no listener de notificações:', err);
    },
  );

  const qUpd = query(
    collection(db, 'financeiroAtualizacoes'),
    where('destinatarios', 'array-contains', uid),
    where('tipo', '==', 'atualizacao'),
    orderBy('createdAt', 'desc'),
  );
  updNotifUnsub = onSnapshot(
    qUpd,
    (snap) => {
      updNotifs = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.autorUid === uid) return;
        const texto = `${d.autorNome || d.autorEmail || ''}: ${d.descricao || ''}`;
        updNotifs.push({
          id: `upd:${docSnap.id}`,
          text: texto,
          ts: d.createdAt?.toDate ? d.createdAt.toDate().getTime() : 0,
          url: 'atualizacoes.html',
        });
      });
      render();
    },
    (err) => {
      console.error('Erro no listener de notificações de atualizações:', err);
    },
  );

  const painelTexto = (data, origem) => {
    const autor = data.autorNome || data.autorEmail || 'Equipe';
    const mensagem = data.texto || data.descricao || '';
    if (mensagem) {
      return `[${origem}] ${autor}: ${mensagem}`;
    }
    return `[${origem}] ${autor} compartilhou uma atualização.`;
  };

  const normalizarHora = (valor) => {
    if (!valor) return '';
    const partes = String(valor).split(':');
    if (partes.length < 2) return '';
    const horas = Number(partes[0]);
    const minutos = Number(partes[1]);
    if (
      !Number.isFinite(horas) ||
      horas < 0 ||
      horas > 23 ||
      !Number.isFinite(minutos) ||
      minutos < 0 ||
      minutos > 59
    ) {
      return '';
    }
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  };

  const resumirNomes = (nomes) => {
    if (!Array.isArray(nomes) || !nomes.length) return '';
    const filtrados = nomes.filter(
      (nome) => typeof nome === 'string' && nome.trim(),
    );
    if (!filtrados.length) return '';
    if (filtrados.length === 1) return filtrados[0];
    if (filtrados.length === 2) return `${filtrados[0]} e ${filtrados[1]}`;
    if (filtrados.length === 3) {
      return `${filtrados[0]}, ${filtrados[1]} e ${filtrados[2]}`;
    }
    return `${filtrados[0]}, ${filtrados[1]} e mais ${filtrados.length - 2}`;
  };

  const formatMeetingNotification = (data) => {
    if (!data) return '';
    const autor = data.autorNome || data.autorEmail || 'Equipe';
    let inicioData = null;
    if (data.inicio && typeof data.inicio.toDate === 'function') {
      try {
        inicioData = data.inicio.toDate();
      } catch (e) {
        inicioData = null;
      }
    }
    if (!inicioData && data.data) {
      const parsed = new Date(data.data);
      if (!Number.isNaN(parsed.valueOf())) {
        inicioData = parsed;
      }
    }
    const dataTexto = inicioData
      ? inicioData.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';
    const horaTexto = normalizarHora(data.hora);
    const horaFallback =
      !horaTexto && inicioData
        ? inicioData.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
    const participantesResumo =
      data.participantesResumo || resumirNomes(data.participantesNomes);
    const descricao = (data.descricao || '').toString().trim();

    let mensagem = `[Painel Geral] ${autor} agendou reunião`;
    if (dataTexto) {
      mensagem += ` para ${dataTexto}`;
    } else {
      mensagem += ' sem data definida';
    }
    const horaFinal = horaTexto || horaFallback;
    if (horaFinal) {
      mensagem += ` às ${horaFinal}`;
    }
    if (participantesResumo) {
      mensagem += ` com ${participantesResumo}`;
    }
    mensagem += '.';
    if (descricao) {
      mensagem += ` Assunto: ${descricao}.`;
    }
    return mensagem;
  };

  const painelGeralQuery = query(
    collection(db, 'painelAtualizacoesGerais'),
    where('categoria', '==', 'mensagem'),
    where('participantes', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  painelGeralNotifUnsub = onSnapshot(
    painelGeralQuery,
    (snap) => {
      painelGeralNotifs = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.autorUid === uid) return;
        painelGeralNotifs.push({
          id: `pg:${docSnap.id}`,
          text: painelTexto(data, 'Painel Geral'),
          ts: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0,
          url: 'painel-atualizacoes-gerais.html',
        });
      });
      render();
    },
    (err) => {
      console.error('Erro no listener de notificações do painel geral:', err);
    },
  );

  const painelGeralReuniaoQuery = query(
    collection(db, 'painelAtualizacoesGerais'),
    where('categoria', '==', 'reuniao'),
    where('participantes', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  painelGeralReuniaoNotifUnsub = onSnapshot(
    painelGeralReuniaoQuery,
    (snap) => {
      painelGeralReunioesNotifs = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const texto = formatMeetingNotification(data);
        if (!texto) return;
        const ts = data.createdAt?.toDate
          ? data.createdAt.toDate().getTime()
          : data.inicio?.toDate
            ? data.inicio.toDate().getTime()
            : Date.now();
        painelGeralReunioesNotifs.push({
          id: `pgm:${docSnap.id}`,
          text: texto,
          ts,
          url: 'painel-atualizacoes-gerais.html',
        });
      });
      render();
    },
    (err) => {
      console.error(
        'Erro no listener de notificações de reuniões do painel geral:',
        err,
      );
    },
  );

  const painelMentQuery = query(
    collection(db, 'painelAtualizacoesMentorados'),
    where('categoria', '==', 'mensagem'),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  painelMentNotifUnsub = onSnapshot(
    painelMentQuery,
    (snap) => {
      painelMentNotifs = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const participantes = Array.isArray(data.participantes)
          ? data.participantes
          : [];
        const permitido =
          participantes.includes(uid) ||
          participantes.includes(VISIBILIDADE_GLOBAL_ID);
        if (!permitido) return;
        if (data.autorUid === uid) return;
        painelMentNotifs.push({
          id: `pm:${docSnap.id}`,
          text: painelTexto(data, 'Painel Mentorados'),
          ts: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0,
          url: 'painel-atualizacoes-mentorados.html',
        });
      });
      render();
    },
    (err) => {
      console.error(
        'Erro no listener de notificações do painel de mentorados:',
        err,
      );
    },
  );

  const qExp = query(
    collection(db, 'expedicaoMensagens'),
    where('destinatarios', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
  );
  expNotifUnsub = onSnapshot(
    qExp,
    (snap) => {
      expNotifs = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        let texto = '';
        if (d.tipo === 'status_etiqueta') {
          const autor = (d.gestorNome || d.gestorEmail || 'Expedição')
            .toString()
            .trim();
          const arquivo = (d.arquivoNome || 'Etiqueta').toString().trim();
          const statusRaw = (
            d.statusLabel ||
            d.status ||
            'Atualizado'
          ).toString();
          const statusLower = statusRaw.toLowerCase();
          const statusLabel =
            statusLower === 'impresso'
              ? 'Impresso'
              : statusLower === 'concluido'
                ? 'Concluído'
                : statusRaw;
          texto = `${autor} marcou "${arquivo}" como ${statusLabel}.`;
        } else {
          const quantidadeNum =
            typeof d.quantidade === 'number'
              ? d.quantidade
              : Number(d.quantidade || 0);
          const quantidade = Number.isFinite(quantidadeNum) ? quantidadeNum : 0;
          const motivo = (d.motivo || '').toString().trim();
          const autor = (d.gestorEmail || '').toString().trim();
          texto = `${autor} - ${quantidade} etiqueta(s) não enviadas: ${motivo}`;
        }
        texto = texto.trim();
        if (!texto) return;
        expNotifs.push({
          id: `exp:${docSnap.id}`,
          text: texto,
          ts: d.createdAt?.toDate ? d.createdAt.toDate().getTime() : 0,
          url: 'expedicao.html',
        });
      });
      render();
    },
    (err) => {
      console.error('Erro no listener de notificações expedição:', err);
    },
  );

  const qExpLabels = query(
    collection(db, 'expedicaoNotificacoes'),
    where('destinatarios', 'array-contains', uid),
    limit(50),
  );
  expLabelNotifUnsub = onSnapshot(
    qExpLabels,
    (snap) => {
      expLabelNotifs = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        expLabelNotifs.push({
          id: `explabel:${docSnap.id}`,
          text: formatLabelNotification(data),
          ts: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0,
          url: data.targetUrl || data.url || 'expedicao.html',
        });
      });
      render();
    },
    (err) => {
      console.error('Erro no listener de notificações de etiquetas:', err);
    },
  );

  if (!btn.dataset.notifInitialized) {
    btn.addEventListener('click', () => {
      list.classList.toggle('hidden');
    });
    btn.dataset.notifInitialized = 'true';
  }
}

function checkLogin() {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  onAuthStateChanged(auth, (user) => {
    const path = window.location.pathname.toLowerCase();
    const onLoginPage = path.endsWith('login.html');
    if (user) {
      showUserArea(user);
      initNotificationListener(user.uid);
      wasLoggedIn = true;
      if (onLoginPage) window.location.href = 'index.html';
    } else {
      wasLoggedIn = false;
      hideUserArea();
      if (notifUnsub) {
        notifUnsub();
        notifUnsub = null;
      }
      if (expNotifUnsub) {
        expNotifUnsub();
        expNotifUnsub = null;
      }
      if (expLabelNotifUnsub) {
        expLabelNotifUnsub();
        expLabelNotifUnsub = null;
      }
      if (updNotifUnsub) {
        updNotifUnsub();
        updNotifUnsub = null;
      }
      if (painelGeralNotifUnsub) {
        painelGeralNotifUnsub();
        painelGeralNotifUnsub = null;
      }
      if (painelGeralReuniaoNotifUnsub) {
        painelGeralReuniaoNotifUnsub();
        painelGeralReuniaoNotifUnsub = null;
      }
      if (painelMentNotifUnsub) {
        painelMentNotifUnsub();
        painelMentNotifUnsub = null;
      }
      cleanupNavbarMeetings();
      if (!onLoginPage) window.location.href = 'login.html';
    }
  });
}

document.addEventListener('navbarLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');

  loginBtn?.addEventListener('click', () => {
    openModal('loginModal');
  });

  // Garante que o evento de logout seja registrado no navbar
  document.getElementById('logoutBtn')?.addEventListener('click', logout);

  if (window.location.search.includes('login=1')) {
    // Espera o estado do Firebase para decidir se deve abrir
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        openModal('loginModal');
      }
    });
  }
  checkLogin();
});

document.addEventListener('sidebarLoaded', () => {
  if (window.userPerfil) applyPerfilRestrictions(window.userPerfil);
  ensureFinanceiroMenu();

  // Garante o evento de logout no sidebar
  document
    .getElementById('logoutSidebarBtn')
    ?.addEventListener('click', logout);
  if (auth.currentUser) {
    document
      .querySelectorAll('#logoutBtn, #logoutSidebarBtn')
      .forEach((btn) => btn.classList.remove('hidden'));
  }
});

checkLogin();
