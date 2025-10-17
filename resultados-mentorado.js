import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig, getPassphrase } from './firebase-config.js';
import { decryptString } from './crypto.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get('uid');

async function calcularResumo(uid, inicio, fim) {
  let bruto = 0;
  let liquido = 0;
  let vendas = 0;
  try {
    const colFat = collection(db, `uid/${uid}/faturamento`);
    const q = query(colFat, orderBy('__name__'), startAt(inicio), endAt(fim));
    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
      const lojasSnap = await getDocs(
        collection(db, `uid/${uid}/faturamento/${docSnap.id}/lojas`),
      );
      for (const lojaDoc of lojasSnap.docs) {
        let dados = lojaDoc.data();
        if (dados.encrypted) {
          const pass = getPassphrase() || `chave-${uid}`;
          let txt;
          try {
            txt = await decryptString(dados.encrypted, pass);
          } catch (e) {
            try {
              txt = await decryptString(dados.encrypted, uid);
            } catch (_) {}
          }
          if (txt) dados = JSON.parse(txt);
        }
        bruto += Number(dados.valorBruto) || 0;
        liquido += Number(dados.valorLiquido) || 0;
        vendas += Number(dados.vendas || dados.quantidade || 0);
      }
    }
  } catch (err) {
    console.error('Erro ao calcular faturamento', err);
  }

  let skusVendidos = 0;
  try {
    const qSkus = query(
      collection(db, `uid/${uid}/skusVendidos`),
      orderBy('__name__'),
      startAt(inicio),
      endAt(fim),
    );
    const skusSnap = await getDocs(qSkus);
    const setSkus = new Set();
    for (const docSnap of skusSnap.docs) {
      const listaSnap = await getDocs(
        collection(db, `uid/${uid}/skusVendidos/${docSnap.id}/lista`),
      );
      listaSnap.forEach((item) => {
        const d = item.data();
        if (d.sku) setSkus.add(d.sku);
      });
    }
    skusVendidos = setSkus.size;
  } catch (err) {
    console.error('Erro ao calcular SKUs vendidos', err);
  }

  return { bruto, liquido, vendas, skusVendidos };
}

async function carregarResultados(inicio, fim) {
  if (!uid) return;
  const container = document.getElementById('resumoMentorado');
  container.innerHTML = '<p class="text-sm text-gray-500">Carregando...</p>';
  const { bruto, liquido, vendas, skusVendidos } = await calcularResumo(
    uid,
    inicio,
    fim,
  );
  const mesMeta = inicio.slice(0, 7);
  let meta = 0;
  try {
    const metaDoc = await getDoc(
      doc(db, `uid/${uid}/metasFaturamento`, mesMeta),
    );
    if (metaDoc.exists()) {
      meta = Number(metaDoc.data().valor) || 0;
    }
  } catch (_) {}
  const progresso = meta ? (liquido / meta) * 100 : 0;
  container.innerHTML = `
    <p><span class="font-medium">Faturamento bruto:</span> R$ ${bruto.toLocaleString('pt-BR')}</p>
    <p><span class="font-medium">Faturamento líquido:</span> R$ ${liquido.toLocaleString('pt-BR')}</p>
    <p><span class="font-medium">Quantidade de vendas:</span> ${vendas}</p>
    <p><span class="font-medium">SKUs vendidos no período:</span> ${skusVendidos}</p>
    <p><span class="font-medium">Meta do mês:</span> R$ ${meta.toLocaleString('pt-BR')}</p>
    <p><span class="font-medium">Progresso:</span> ${progresso.toFixed(2)}%</p>
  `;
}

async function carregarListaSkus(inicio, fim) {
  if (!uid) return;
  const container = document.getElementById('listaSkus');
  container.innerHTML = '<p class="text-sm text-gray-500">Carregando...</p>';
  try {
    const q = query(
      collection(db, `uid/${uid}/skusVendidos`),
      orderBy('__name__'),
      startAt(inicio),
      endAt(fim),
    );
    const snap = await getDocs(q);
    const mapa = {};
    for (const docSnap of snap.docs) {
      const listaSnap = await getDocs(
        collection(db, `uid/${uid}/skusVendidos/${docSnap.id}/lista`),
      );
      listaSnap.forEach((item) => {
        const d = item.data();
        const sku = d.sku || item.id;
        const qtd = Number(d.total || d.quantidade || 0);
        if (!mapa[sku]) mapa[sku] = 0;
        mapa[sku] += qtd;
      });
    }
    const linhas = Object.entries(mapa)
      .map(([sku, qtd]) => ({ sku, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
    if (linhas.length === 0) {
      container.innerHTML =
        '<p class="text-sm text-gray-500">Nenhum SKU encontrado.</p>';
      return;
    }
    container.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr><th class="p-2 text-left">SKU</th><th class="p-2 text-right">Quantidade</th></tr>
        </thead>
        <tbody>
          ${linhas
            .map(
              (l) =>
                `<tr><td class="p-2">${l.sku}</td><td class="p-2 text-right">${l.qtd}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Erro ao carregar SKUs vendidos', err);
    container.innerHTML =
      '<p class="text-sm text-red-500">Erro ao carregar SKUs.</p>';
  }
}

function initResultadosMentorado() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const hoje = new Date();
      const dataFim = document.getElementById('dataFim');
      const dataInicio = document.getElementById('dataInicio');
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const hojeStr = hoje.toISOString().slice(0, 10);
      dataInicio.value = primeiroDia;
      dataFim.value = hojeStr;
      carregarResultados(primeiroDia, hojeStr);
      carregarListaSkus(primeiroDia, hojeStr);
      document.getElementById('filtrarSkus').addEventListener('click', () => {
        carregarResultados(dataInicio.value, dataFim.value);
        carregarListaSkus(dataInicio.value, dataFim.value);
      });
    }
  });
}

window.initResultadosMentorado = initResultadosMentorado;
