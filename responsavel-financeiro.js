import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

export async function fetchResponsavelFinanceiroUsuarios(db, email) {
  const [snapUsuarios, snapUid, snapPosUsuarios, snapPosUid] =
    await Promise.all([
      getDocs(
        query(
          collection(db, 'usuarios'),
          where('responsavelFinanceiroEmail', '==', email),
        ),
      ),
      getDocs(
        query(
          collection(db, 'uid'),
          where('responsavelFinanceiroEmail', '==', email),
        ),
      ),
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

  const agregados = new Map();
  const anexar = (snap, motivo) => {
    snap?.forEach((docSnap) => {
      const id = docSnap.id;
      const dados = docSnap.data() || {};
      const existente = agregados.get(id) || {
        dados: {},
        vinculos: new Set(),
      };
      existente.dados = { ...existente.dados, ...dados };
      existente.vinculos.add(motivo);
      agregados.set(id, existente);
    });
  };

  anexar(snapUsuarios, 'financeiro');
  anexar(snapUid, 'financeiro');
  anexar(snapPosUsuarios, 'posvendas');
  anexar(snapPosUid, 'posvendas');

  const usuarios = [];
  for (const [id, entry] of agregados.entries()) {
    let dados = entry.dados || {};
    if (!dados.email || !dados.nome) {
      try {
        const usuarioDoc = await getDoc(doc(db, 'usuarios', id));
        if (usuarioDoc.exists()) {
          dados = { ...usuarioDoc.data(), ...dados };
        }
      } catch (_) {}
    }
    let nome = dados.nome;
    if (!nome) {
      try {
        const perfilDoc = await getDoc(doc(db, 'perfilMentorado', id));
        if (perfilDoc.exists()) nome = perfilDoc.data().nome;
      } catch (_) {}
    }
    const emailUser = dados.email || '';
    const cargo = dados.cargo || dados.perfil || '';
    const responsavelFinanceiroEmail = dados.responsavelFinanceiroEmail || null;
    const responsavelExpedicaoEmail =
      dados.responsavelExpedicaoEmail ||
      (Array.isArray(dados.gestoresExpedicaoEmails)
        ? dados.gestoresExpedicaoEmails[0]
        : null);
    const responsavelPosVendasEmail = dados.responsavelPosVendasEmail || null;
    usuarios.push({
      uid: id,
      nome: nome || emailUser || id,
      email: emailUser,
      cargo,
      perfil: dados.perfil || '',
      responsavelFinanceiroEmail,
      responsavelExpedicaoEmail,
      responsavelPosVendasEmail,
      vinculos: Array.from(entry.vinculos),
    });
  }
  return usuarios;
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
  const rawPerfil = docSnap.exists()
    ? String(docSnap.data().perfil || '')
        .toLowerCase()
        .trim()
    : '';
  const perfil = normalizePerfil(rawPerfil);
  const extras = await fetchResponsavelFinanceiroUsuarios(db, user.email);
  const extrasFinanceiro = extras.filter((item) =>
    Array.isArray(item.vinculos)
      ? item.vinculos.includes('financeiro')
      : (item.responsavelFinanceiroEmail || '').toLowerCase() ===
        (user.email || '').toLowerCase(),
  );
  const extrasPosVendas = extras.filter((item) =>
    Array.isArray(item.vinculos)
      ? item.vinculos.includes('posvendas')
      : (item.responsavelPosVendasEmail || '').toLowerCase() ===
        (user.email || '').toLowerCase(),
  );
  const isResponsavelFinanceiro =
    extrasFinanceiro.length > 0 || perfil === 'gestor';
  const isResponsavelPosVendas =
    extrasPosVendas.length > 0 || perfil === 'posvendas';
  const isGestor = perfil === 'gestor';
  const usuarios = [
    { uid: user.uid, nome: user.displayName || user.email, email: user.email },
    ...extras,
  ];
  return {
    usuarios,
    isGestor,
    isResponsavelFinanceiro,
    perfil,
    isResponsavelPosVendas,
    extrasFinanceiro,
    extrasPosVendas,
  };
}
