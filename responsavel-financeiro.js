import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

export async function fetchResponsavelFinanceiroUsuarios(db, email) {
  const [snapUsuarios, snapUid] = await Promise.all([
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
    usuarios.push({
      uid: d.id,
      nome: nome || emailUser || d.id,
      email: emailUser,
      cargo,
      perfil: dados.perfil || '',
      responsavelFinanceiroEmail,
      responsavelExpedicaoEmail,
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
  const isResponsavelFinanceiro = extras.length > 0 || perfil === 'gestor';
  const isGestor = perfil === 'gestor';
  const usuarios = [
    { uid: user.uid, nome: user.displayName || user.email, email: user.email },
    ...extras,
  ];
  return { usuarios, isGestor, isResponsavelFinanceiro, perfil };
}
