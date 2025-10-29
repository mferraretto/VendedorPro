import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

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
  return p || '';
}

export async function fetchUsuariosPosVendas(db, email) {
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
        // ignora erros de perfil auxiliar
      }
    }

    usuarios.push({
      uid: d.id,
      nome: nome || dados.email || d.id,
      email: dados.email || '',
      perfil: normalizePerfil(dados.perfil),
    });
  }

  return usuarios;
}

export async function carregarUsuariosPosVendas(db, user) {
  const extras = await fetchUsuariosPosVendas(db, user?.email || '');
  return { usuarios: extras };
}
