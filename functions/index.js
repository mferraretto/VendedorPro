// index.js (Firebase Functions) - Versão de Produção

import * as https from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth"; // Importar o serviço de autenticação
import cors from "cors";

// Seus módulos de utilidades
import { storeUserTinyToken, getUserTinyToken, destroyUserTinyToken } from "./secret-utils.js";
import { tinyTestToken, pesquisarPedidos, obterPedido, pesquisarProdutos } from "./tiny-client.js";

// Inicializar os serviços do Firebase Admin
initializeApp();
const db = getFirestore();
const auth = getAuth(); // Instanciar o serviço de autenticação
const corsHandler = cors({ origin: true });

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

export const connectTiny = https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
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
});

export const disconnectTiny = https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
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
});

// --- Funções de Sincronização ---

export const syncTinyProducts = https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
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
});

export const syncTinyOrders = https.onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
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
});