import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

async function fetchUsuariosPorCampo(db, campo, email) {
  if (!email) return [];

  const [snapUsuarios, snapUid] = await Promise.all([
    getDocs(query(collection(db, 'usuarios'), where(campo, '==', email))),
    getDocs(query(collection(db, 'uid'), where(campo, '==', email))),
  ]);

  const vistos = new Set();
  const usuarios = [];
  const docs = [...snapUsuarios.docs, ...snapUid.docs];

  for (const d of docs) {
    if (vistos.has(d.id)) continue;
    vistos.add(d.id);

    const dados = d.data();
    let nome = dados.nome;

    if (!nome) {
      try {
        const perfilDoc = await getDoc(doc(db, 'perfilMentorado', d.id));
        if (perfilDoc.exists()) nome = perfilDoc.data().nome;
      } catch (_) {
        // Ignora erros de leitura do perfil
      }
    }

    const emailUser = dados.email || '';
    const cargo = dados.cargo || dados.perfil || '';
    const responsavelFinanceiroEmail = dados.responsavelFinanceiroEmail || null;
    const responsavelPosVendasEmail = dados.responsavelPosVendasEmail || null;
    const responsavelExpedicaoEmail =
      dados.responsavelExpedicaoEmail ||
      (Array.isArray(dados.gestoresExpedicaoEmails)
        ? dados.gestoresExpedicaoEmails[0]
        : null);

    usuarios.push({
      uid: d.id,
      nome: nome || emailUser || d.id,
      email: emailUser,
      cargo,
      perfil: dados.perfil || '',
      responsavelFinanceiroEmail,
      responsavelPosVendasEmail,
      responsavelExpedicaoEmail,
    });
  }

  return usuarios;
}

export async function fetchResponsavelFinanceiroUsuarios(db, email) {
  return fetchUsuariosPorCampo(db, 'responsavelFinanceiroEmail', email);
}

export async function fetchResponsavelPosVendasUsuarios(db, email) {
  return fetchUsuariosPorCampo(db, 'responsavelPosVendasEmail', email);
}

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

export async function carregarUsuariosFinanceiros(db, user) {
  const docSnap = await getDoc(doc(db, 'usuarios', user.uid));
  const dadosUsuario = docSnap.exists() ? docSnap.data() : {};
  const rawPerfil = docSnap.exists()
    ? String(dadosUsuario.perfil || '')
        .toLowerCase()
        .trim()
    : '';
  const perfil = normalizePerfil(rawPerfil);

  const [extrasFinanceiro, extrasPosVendas] = await Promise.all([
    fetchResponsavelFinanceiroUsuarios(db, user.email),
    fetchResponsavelPosVendasUsuarios(db, user.email),
  ]);

  const isResponsavelFinanceiro =
    extrasFinanceiro.length > 0 || perfil === 'gestor';
  const isResponsavelPosVendas =
    extrasPosVendas.length > 0 || perfil === 'posvendas';
  const isGestor = perfil === 'gestor';

  const mergeMap = new Map();

  const mergeUsuario = (registro = {}) => {
    if (!registro.uid) return;
    const existente = mergeMap.get(registro.uid) || {};
    mergeMap.set(registro.uid, {
      ...existente,
      ...registro,
      nome: registro.nome || existente.nome || registro.email || 'Usuário',
      email: registro.email || existente.email || '',
    });
  };

  const baseUsuario = {
    uid: user.uid,
    nome:
      dadosUsuario.nome ||
      user.displayName ||
      user.email ||
      'Usuário conectado',
    email: dadosUsuario.email || user.email || '',
    cargo: dadosUsuario.cargo || dadosUsuario.perfil || '',
    perfil: dadosUsuario.perfil || '',
    responsavelFinanceiroEmail: dadosUsuario.responsavelFinanceiroEmail || null,
    responsavelPosVendasEmail: dadosUsuario.responsavelPosVendasEmail || null,
    responsavelExpedicaoEmail:
      dadosUsuario.responsavelExpedicaoEmail ||
      (Array.isArray(dadosUsuario.gestoresExpedicaoEmails)
        ? dadosUsuario.gestoresExpedicaoEmails[0]
        : null),
  };

  mergeUsuario(baseUsuario);
  extrasFinanceiro.forEach(mergeUsuario);
  extrasPosVendas.forEach(mergeUsuario);

  const todosUsuarios = Array.from(mergeMap.values());
  const usuarios = [
    mergeMap.get(user.uid),
    ...todosUsuarios.filter((item) => item.uid !== user.uid),
  ].filter(Boolean);

  return {
    usuarios,
    isGestor,
    isResponsavelFinanceiro,
    isResponsavelPosVendas,
    perfil,
  };
}
