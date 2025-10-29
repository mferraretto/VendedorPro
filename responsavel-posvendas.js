import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

async function fetchUsuariosPorEmail(db, email) {
  if (!email) return [];
  const [snapUsuarios, snapUid] = await Promise.all([
    getDocs(
      query(
        collection(db, 'usuarios'),
        where('responsavelPosVendasEmail', '==', email),
      ),
    ),
    getDocs(
      query(
        collection(db, 'uid'),
        where('responsavelPosVendasEmail', '==', email),
      ),
    ),
  ]);
  const ids = new Set();
  const resultado = [];
  for (const docSnap of [...snapUsuarios.docs, ...snapUid.docs]) {
    if (ids.has(docSnap.id)) continue;
    ids.add(docSnap.id);
    const dados = docSnap.data() || {};
    resultado.push({
      uid: docSnap.id,
      nome:
        dados.nome ||
        dados.razaoSocial ||
        dados.apelido ||
        dados.displayName ||
        dados.usuario ||
        dados.email ||
        docSnap.id,
      email: dados.email || dados.login || '',
    });
  }
  return resultado;
}

async function fetchUsuariosDeCopias(db, posUid) {
  if (!posUid) return [];
  const ref = collection(db, 'uid', posUid, 'uid');
  const snap = await getDocs(ref);
  const ids = new Set();
  const resultado = [];
  for (const docSnap of snap.docs) {
    if (ids.has(docSnap.id)) continue;
    ids.add(docSnap.id);
    const dados = docSnap.data() || {};
    resultado.push({
      uid: docSnap.id,
      nome:
        dados.nome ||
        dados.razaoSocial ||
        dados.apelido ||
        dados.usuarioNome ||
        dados.usuarioEmail ||
        docSnap.id,
      email: dados.email || dados.usuarioEmail || '',
    });
  }
  return resultado;
}

async function carregarInformacoesUsuario(db, uid) {
  if (!uid) return null;
  const prioridades = [
    async () => {
      const ref = doc(db, 'usuarios', uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const dados = snap.data() || {};
      return {
        uid,
        nome:
          dados.nome ||
          dados.displayName ||
          dados.razaoSocial ||
          dados.apelido ||
          dados.email ||
          uid,
        email: dados.email || '',
      };
    },
    async () => {
      const ref = doc(db, 'uid', uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const dados = snap.data() || {};
      return {
        uid,
        nome:
          dados.nome ||
          dados.razaoSocial ||
          dados.apelido ||
          dados.usuarioNome ||
          dados.usuarioEmail ||
          dados.email ||
          uid,
        email: dados.email || dados.usuarioEmail || dados.login || '',
      };
    },
  ];

  for (const resolver of prioridades) {
    try {
      const info = await resolver();
      if (info) return info;
    } catch (_) {
      /* ignore */
    }
  }

  return { uid, nome: uid, email: '' };
}

export async function carregarUsuariosPosVendas(db, user) {
  if (!db || !user) {
    return { usuarios: [] };
  }

  const candidatos = new Map();

  const extrasEmail = await fetchUsuariosPorEmail(db, user.email || '');
  extrasEmail.forEach((item) => {
    if (!candidatos.has(item.uid)) candidatos.set(item.uid, item);
  });

  const extrasCopias = await fetchUsuariosDeCopias(db, user.uid);
  extrasCopias.forEach((item) => {
    if (!candidatos.has(item.uid)) candidatos.set(item.uid, item);
  });

  // Inclui o próprio usuário para permitir visualizar registros pessoais
  if (user.uid && !candidatos.has(user.uid)) {
    candidatos.set(user.uid, {
      uid: user.uid,
      nome: user.displayName || user.email || user.uid,
      email: user.email || '',
    });
  }

  const usuarios = await Promise.all(
    Array.from(candidatos.keys()).map((uid) =>
      carregarInformacoesUsuario(db, uid),
    ),
  );

  usuarios.sort((a, b) => a.nome.localeCompare(b.nome));

  return { usuarios };
}
