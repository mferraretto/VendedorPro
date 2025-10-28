// index.js (Firebase Functions) - Versão de Produção

import * as https from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth"; // Importar o serviço de autenticação
import { createHash } from "crypto";

// Seus módulos de utilidades
import { storeUserTinyToken, getUserTinyToken, destroyUserTinyToken } from "./secret-utils.js";
import { tinyTestToken, pesquisarPedidos, obterPedido, pesquisarProdutos } from "./tiny-client.js";

// Inicializar os serviços do Firebase Admin
initializeApp();
const db = getFirestore();
const auth = getAuth(); // Instanciar o serviço de autenticação

const CARGO_CONFIG = {
  vendedor: {
    limit: 10,
    label: "Vendedor",
    perfil: "Usuario Completo",
  },
  gestor_expedicao: {
    limit: 2,
    label: "Gestor de expedição",
    perfil: "Expedicao",
  },
  posvendas: {
    limit: 3,
    label: "Pós-vendas",
    perfil: "Posvendas",
  },
  usuario: {
    limit: 5,
    label: "Usuário",
    perfil: "Usuario Basico",
  },
};

function normalizeString(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeCargo(value) {
  const base = normalizeString(value);
  if (!base) return "";
  if (["vendedor", "seller", "usuario completo", "usuario"].includes(base)) {
    return "vendedor";
  }
  if (["gestor expedicao", "gestor de expedicao", "expedicao"].includes(base)) {
    return "gestor_expedicao";
  }
  if (["posvendas", "pos vendas", "pos-vendas"].includes(base)) {
    return "posvendas";
  }
  if (["usuario basico", "cliente", "basico"].includes(base)) {
    return "usuario";
  }
  return "";
}

function isPerfilFinanceiro(perfil) {
  const base = normalizeString(perfil);
  if (!base) return false;
  if (
    [
      "gestor",
      "responsavel",
      "responsavel financeiro",
      "gestor financeiro",
    ].includes(base)
  ) {
    return true;
  }
  if (["adm", "admin", "administrador"].includes(base)) {
    return true;
  }
  return false;
}

/**
 * Função auxiliar para verificar o token de autenticação e retornar o UID.
 * Lança um erro se a autenticação falhar.
 * @param {string | undefined} authorizationHeader O cabeçalho 'Authorization' da requisição.
 * @returns {Promise<string>} O UID do usuário autenticado.
 */
async function getAuthenticatedUid(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    throw new https.HttpsError('unauthenticated', 'Não autorizado: Nenhum token fornecido.');
  }
  const idToken = authorizationHeader.split('Bearer ')[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error("Falha na verificação do token:", error);
    throw new https.HttpsError('unauthenticated', 'Não autorizado: Token inválido ou expirado.');
  }
}

// --- Funções de Autenticação e Configuração ---

export const connectTiny = https.onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  try {
    const uid = await getAuthenticatedUid(req.headers.authorization);
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: "Token não fornecido." });
    }

    const isTokenValid = await tinyTestToken(token);
    if (!isTokenValid) {
      return res.status(401).json({ ok: false, error: "Token Tiny inválido." });
    }

    await storeUserTinyToken(uid, token);
    res.status(200).json({ ok: true, message: "Token conectado com sucesso." });

  } catch (error) {
    console.error("Erro em connectTiny:", error);
    const status = error.code === 'unauthenticated' ? 401 : 500;
    res.status(status).json({ ok: false, error: error.message });
  }
});

export const disconnectTiny = https.onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  try {
    const uid = await getAuthenticatedUid(req.headers.authorization);
    await destroyUserTinyToken(uid);
    res.status(200).json({ ok: true, message: "Token desconectado." });

  } catch (error) {
    console.error("Erro em disconnectTiny:", error);
    const status = error.code === 'unauthenticated' ? 401 : 500;
    res.status(status).json({ ok: false, error: error.message });
  }
});

export const registerTeamMember = https.onCall(async (request) => {
  const authContext = request.auth;
  if (!authContext?.uid) {
    throw new https.HttpsError('unauthenticated', 'Usuário não autenticado.');
  }

  const data = request.data || {};
  const nome = String(data.nome || '').trim();
  const email = String(data.email || '').trim();
  const senha = String(data.senha || '');
  const cargo = normalizeCargo(data.cargo);
  let responsavelExpedicaoEmail = String(
    data.responsavelExpedicaoEmail || '',
  )
    .trim()
    .toLowerCase();

  if (!nome || !email || !senha || !cargo) {
    throw new https.HttpsError(
      'invalid-argument',
      'Nome, e-mail, senha e cargo são obrigatórios.',
    );
  }
  if (senha.length < 6) {
    throw new https.HttpsError(
      'invalid-argument',
      'A senha deve possuir pelo menos 6 caracteres.',
    );
  }

  const cargoConfig = CARGO_CONFIG[cargo];
  if (!cargoConfig) {
    throw new https.HttpsError('invalid-argument', 'Cargo informado é inválido.');
  }

  const responsavelRecord = await auth.getUser(authContext.uid);
  const responsavelFinanceiroEmail = (responsavelRecord.email || '').trim();
  if (!responsavelFinanceiroEmail) {
    throw new https.HttpsError(
      'failed-precondition',
      'Usuário autenticado não possui e-mail válido.',
    );
  }

  const perfilSnapshot = await db.collection('usuarios').doc(authContext.uid).get();
  const perfilAtual = perfilSnapshot.exists ? perfilSnapshot.data()?.perfil : '';
  if (!isPerfilFinanceiro(perfilAtual)) {
    throw new https.HttpsError(
      'permission-denied',
      'Apenas responsáveis financeiros podem cadastrar integrantes.',
    );
  }

  const equipeSnapshot = await db
    .collection('usuarios')
    .where('responsavelFinanceiroEmail', '==', responsavelFinanceiroEmail)
    .get();
  let utilizados = 0;
  equipeSnapshot.forEach((doc) => {
    const dados = doc.data() || {};
    const cargoDoc = normalizeCargo(dados.cargo || dados.perfil || '');
    if (cargoDoc === cargo) utilizados += 1;
  });
  if (utilizados >= cargoConfig.limit) {
    throw new https.HttpsError(
      'resource-exhausted',
      `Limite de ${cargoConfig.label.toLowerCase()} já atingido.`,
    );
  }

  if (!responsavelExpedicaoEmail && cargo === 'gestor_expedicao') {
    responsavelExpedicaoEmail = email.toLowerCase();
  }

  if (!responsavelExpedicaoEmail && cargo !== 'gestor_expedicao') {
    throw new https.HttpsError(
      'invalid-argument',
      'Informe o responsável de expedição para o integrante cadastrado.',
    );
  }

  try {
    await auth.getUserByEmail(email);
    throw new https.HttpsError(
      'already-exists',
      'Já existe um usuário cadastrado com este e-mail.',
    );
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('Falha ao validar e-mail informado', err);
      throw new https.HttpsError(
        'internal',
        'Não foi possível validar o e-mail informado.',
      );
    }
  }

  let novoUsuario;
  try {
    novoUsuario = await auth.createUser({
      email,
      password: senha,
      displayName: nome,
    });
  } catch (err) {
    console.error('Erro ao criar usuário no Authentication', err);
    if (err.code === 'auth/email-already-exists') {
      throw new https.HttpsError(
        'already-exists',
        'Já existe um usuário cadastrado com este e-mail.',
      );
    }
    throw new https.HttpsError(
      'internal',
      'Não foi possível criar o usuário no Firebase Authentication.',
    );
  }

  const hashSenha = createHash('sha256').update(senha).digest('hex');
  const timestamp = FieldValue.serverTimestamp();
  const gestorExpedicaoArray = responsavelExpedicaoEmail
    ? [responsavelExpedicaoEmail]
    : [];

  const basePayload = {
    nome,
    email,
    perfil: cargoConfig.perfil,
    cargo: cargoConfig.label,
    responsavelFinanceiroEmail,
    responsavelFinanceiroUid: authContext.uid,
    responsavelExpedicaoEmail: responsavelExpedicaoEmail || null,
    gestoresExpedicaoEmails: gestorExpedicaoArray,
    senhaHash: hashSenha,
    criadoPorResponsavelFinanceiro: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await Promise.all([
    db.collection('usuarios').doc(novoUsuario.uid).set(basePayload, { merge: true }),
    db.collection('uid').doc(novoUsuario.uid).set(
      {
        uid: novoUsuario.uid,
        ...basePayload,
      },
      { merge: true },
    ),
  ]);

  utilizados += 1;

  return {
    ok: true,
    user: {
      uid: novoUsuario.uid,
      nome,
      email,
      cargo: cargoConfig.label,
      cargoKey: cargo,
      responsavelExpedicaoEmail: responsavelExpedicaoEmail || null,
    },
    limits: {
      cargo: {
        used: utilizados,
        limit: cargoConfig.limit,
      },
    },
  };
});

// --- Funções de Sincronização ---

export const syncTinyProducts = https.onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await getAuthenticatedUid(req.headers.authorization);
    const token = await getUserTinyToken(uid);
    const userProductsStore = db.collection(`usuarios/${uid}/produtosTiny`);
    let pagina = 1;
    let totalProdutosSincronizados = 0;

    while (true) {
      const retorno = await pesquisarProdutos({ pagina }, token);
      const produtos = retorno.produtos;
      if (!produtos || produtos.length === 0) break;

      const batch = db.batch();
      produtos.forEach(item => {
        const p = item.produto;
        const docRef = userProductsStore.doc(String(p.id));
        batch.set(docRef, { ...p, updatedAt: new Date().toISOString() }, { merge: true });
      });
      await batch.commit();

      totalProdutosSincronizados += produtos.length;
      pagina++;
    }

    res.status(200).json({ ok: true, message: `${totalProdutosSincronizados} produtos sincronizados.` });

  } catch (error) {
    console.error("Erro em syncTinyProducts:", error);
    const status = error.code === 'unauthenticated' ? 401 : 500;
    res.status(status).json({ ok: false, error: error.message });
  }
});

export const syncTinyOrders = https.onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await getAuthenticatedUid(req.headers.authorization);
    const token = await getUserTinyToken(uid);
    const { dataInicial, dataFinal, dataAtualizacao } = req.body;
    const userOrdersStore = db.collection(`usuarios/${uid}/pedidosShopeeTiny`);
    let pagina = 1;
    let totalPedidosSincronizados = 0;

    while (true) {
      const params = { pagina, dataInicial, dataFinal, dataAtualizacao };
      const retorno = await pesquisarPedidos(params, token);
      const pedidos = retorno.pedidos;
      if (!pedidos || pedidos.length === 0) break;

      const batch = db.batch();
      for (const item of pedidos) {
        const p = item.pedido;
        const docRef = userOrdersStore.doc(String(p.id));
        const dadosPedido = {
          id: p.id,
          numero: p.numero,
          numeroEcommerce: p.numero_ecommerce,
          data: p.data_pedido,
          cliente: p.cliente.nome,
          total: parseFloat(p.valor_total),
          status: p.situacao,
          canal: p.nome_ecommerce,
          itens: (p.itens || []).map(it => ({
            sku: it.item.codigo,
            nome: it.item.descricao,
            quantidade: parseFloat(it.item.quantidade),
            preco: parseFloat(it.item.valor_unitario)
          })),
          updatedAt: new Date().toISOString()
        };
        batch.set(docRef, dadosPedido, { merge: true });
      }
      await batch.commit();

      totalPedidosSincronizados += pedidos.length;
      pagina++;
    }

    res.status(200).json({ ok: true, message: `${totalPedidosSincronizados} pedidos sincronizados.` });

  } catch (error) {
    console.error("Erro em syncTinyOrders:", error);
    const status = error.code === 'unauthenticated' ? 401 : 500;
    res.status(status).json({ ok: false, error: error.message });
  }
});
