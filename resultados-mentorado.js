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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarNumero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarPercentual(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function formatarNumeroBr(valor) {
  return normalizarNumero(valor).toLocaleString('pt-BR');
}

function formatarPercentualBr(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return '-';
  return `${Number(valor).toFixed(2)}%`;
}

function criarAcumuladorPercentual() {
  return { sum: 0, count: 0 };
}

function adicionarPercentual(acumulador, valor) {
  if (!acumulador) return;
  const numero = normalizarPercentual(valor);
  if (numero === null) return;
  acumulador.sum += numero;
  acumulador.count += 1;
}

function mediaPercentual(acumulador) {
  if (!acumulador || !acumulador.count) return null;
  return acumulador.sum / acumulador.count;
}

function mapearRegistroDiarioMentorado(dados, contexto = {}) {
  if (!dados) return null;
  const nomeLoja = String(
    dados.nomeLoja || dados.nome || contexto.nomeLoja || '',
  ).trim();
  return {
    data: contexto.data || dados.data || '',
    nomeLoja: nomeLoja || 'Sem loja',
    reclamacoesAbertas: normalizarNumero(
      dados.reclamacoesAbertas ??
        dados.reclamacoesAbertasHoje ??
        dados.reclamacoesAbertasDia,
    ),
    reclamacoesRespondidas: normalizarNumero(
      dados.reclamacoesRespondidas ??
        dados.reclamacoesRecorridas ??
        dados.reclamacoesRespondidasDia,
    ),
    reclamacoesEncerradas: normalizarNumero(
      dados.reclamacoesEncerradas ??
        dados.reclamacoesRecusadas ??
        dados.reclamacoesEncerradasDia,
    ),
    reputacaoReclamacao: normalizarPercentual(
      dados.reputacao?.reclamacao ??
        dados.percentualReclamacao ??
        dados.porcentagemReclamacoes,
    ),
    reputacaoMediacao: normalizarPercentual(
      dados.reputacao?.mediacao ??
        dados.percentualMediacao ??
        dados.porcentagemMediacao,
    ),
    reputacaoAtraso: normalizarPercentual(
      dados.reputacao?.atraso ??
        dados.percentualAtraso ??
        dados.porcentagemAtraso,
    ),
    reputacaoCancelado: normalizarPercentual(
      dados.reputacao?.cancelado ??
        dados.percentualCancelado ??
        dados.porcentagemCancelamento,
    ),
  };
}

function agregarDiarioMentorado(registros) {
  const mapa = new Map();
  const totais = {
    reclamacoesAbertas: 0,
    reclamacoesRespondidas: 0,
    reclamacoesEncerradas: 0,
    percentuais: {
      reclamacao: criarAcumuladorPercentual(),
      mediacao: criarAcumuladorPercentual(),
      atraso: criarAcumuladorPercentual(),
      cancelado: criarAcumuladorPercentual(),
    },
  };

  registros.forEach((registro) => {
    const chave = registro.nomeLoja;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        nome: registro.nomeLoja,
        reclamacoesAbertas: 0,
        reclamacoesRespondidas: 0,
        reclamacoesEncerradas: 0,
        percentuais: {
          reclamacao: criarAcumuladorPercentual(),
          mediacao: criarAcumuladorPercentual(),
          atraso: criarAcumuladorPercentual(),
          cancelado: criarAcumuladorPercentual(),
        },
      });
    }

    const item = mapa.get(chave);
    const abertas = normalizarNumero(registro.reclamacoesAbertas);
    const respondidas = normalizarNumero(registro.reclamacoesRespondidas);
    const encerradas = normalizarNumero(registro.reclamacoesEncerradas);

    item.reclamacoesAbertas += abertas;
    item.reclamacoesRespondidas += respondidas;
    item.reclamacoesEncerradas += encerradas;

    totais.reclamacoesAbertas += abertas;
    totais.reclamacoesRespondidas += respondidas;
    totais.reclamacoesEncerradas += encerradas;

    adicionarPercentual(
      item.percentuais.reclamacao,
      registro.reputacaoReclamacao,
    );
    adicionarPercentual(item.percentuais.mediacao, registro.reputacaoMediacao);
    adicionarPercentual(item.percentuais.atraso, registro.reputacaoAtraso);
    adicionarPercentual(
      item.percentuais.cancelado,
      registro.reputacaoCancelado,
    );

    adicionarPercentual(
      totais.percentuais.reclamacao,
      registro.reputacaoReclamacao,
    );
    adicionarPercentual(
      totais.percentuais.mediacao,
      registro.reputacaoMediacao,
    );
    adicionarPercentual(totais.percentuais.atraso, registro.reputacaoAtraso);
    adicionarPercentual(
      totais.percentuais.cancelado,
      registro.reputacaoCancelado,
    );
  });

  const lojas = Array.from(mapa.values())
    .map((item) => ({
      nome: item.nome,
      reclamacoesAbertas: item.reclamacoesAbertas,
      reclamacoesRespondidas: item.reclamacoesRespondidas,
      reclamacoesEncerradas: item.reclamacoesEncerradas,
      porcentagemReclamacao: mediaPercentual(item.percentuais.reclamacao),
      porcentagemMediacao: mediaPercentual(item.percentuais.mediacao),
      porcentagemAtraso: mediaPercentual(item.percentuais.atraso),
      porcentagemCancelado: mediaPercentual(item.percentuais.cancelado),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    totais: {
      reclamacoesAbertas: totais.reclamacoesAbertas,
      reclamacoesRespondidas: totais.reclamacoesRespondidas,
      reclamacoesEncerradas: totais.reclamacoesEncerradas,
      porcentagemReclamacao: mediaPercentual(totais.percentuais.reclamacao),
      porcentagemMediacao: mediaPercentual(totais.percentuais.mediacao),
      porcentagemAtraso: mediaPercentual(totais.percentuais.atraso),
      porcentagemCancelado: mediaPercentual(totais.percentuais.cancelado),
    },
    lojas,
  };
}

const DIARIO_STATUS_CARDES = Object.freeze([
  {
    chaveTotal: 'reclamacoesAbertas',
    chaveLoja: 'reclamacoesAbertas',
    titulo: 'Reclamações abertas',
    classe: 'bg-rose-500 text-white',
  },
  {
    chaveTotal: 'reclamacoesRespondidas',
    chaveLoja: 'reclamacoesRespondidas',
    titulo: 'Reclamações respondidas',
    classe: 'bg-lime-400 text-gray-900',
  },
  {
    chaveTotal: 'reclamacoesEncerradas',
    chaveLoja: 'reclamacoesEncerradas',
    titulo: 'Reclamações encerradas',
    classe: 'bg-cyan-400 text-gray-900',
  },
]);

const DIARIO_PERCENT_CARDES = Object.freeze([
  {
    chaveTotal: 'porcentagemReclamacao',
    chaveLoja: 'porcentagemReclamacao',
    titulo: '% Reclamação',
    classe: 'bg-fuchsia-500 text-white',
  },
  {
    chaveTotal: 'porcentagemMediacao',
    chaveLoja: 'porcentagemMediacao',
    titulo: '% Mediação',
    classe: 'bg-purple-500 text-white',
  },
  {
    chaveTotal: 'porcentagemAtraso',
    chaveLoja: 'porcentagemAtraso',
    titulo: '% Atraso',
    classe: 'bg-amber-400 text-gray-900',
  },
  {
    chaveTotal: 'porcentagemCancelado',
    chaveLoja: 'porcentagemCancelado',
    titulo: '% Cancelado',
    classe: 'bg-pink-400 text-white',
  },
]);

function montarHtmlResumoDiarioMensal(resumo) {
  const { totais, lojas } = resumo;

  const statusCards = DIARIO_STATUS_CARDES.map((card) => {
    const lista = lojas.length
      ? lojas
          .map(
            (loja) =>
              `<div class="flex items-center justify-between bg-white/20 rounded-lg px-3 py-1 text-sm"><span class="font-medium">${escapeHtml(loja.nome)}</span><span class="font-semibold">${formatarNumeroBr(loja[card.chaveLoja])}</span></div>`,
          )
          .join('')
      : '<p class="text-sm text-white/80">Nenhuma loja registrada.</p>';
    return `
      <div class="rounded-2xl p-4 shadow ${card.classe}">
        <p class="text-sm font-semibold uppercase tracking-wide">${card.titulo}</p>
        <p class="text-2xl font-bold">${formatarNumeroBr(totais[card.chaveTotal])}</p>
        <div class="mt-3 space-y-1">
          ${lista}
        </div>
      </div>
    `;
  }).join('');

  const percentCards = DIARIO_PERCENT_CARDES.map((card) => {
    const lista = lojas.length
      ? lojas
          .map(
            (loja) =>
              `<div class="flex items-center justify-between bg-white/20 rounded-lg px-3 py-1 text-sm"><span class="font-medium">${escapeHtml(loja.nome)}</span><span class="font-semibold">${formatarPercentualBr(loja[card.chaveLoja])}</span></div>`,
          )
          .join('')
      : '<p class="text-sm text-white/80">Nenhuma loja registrada.</p>';
    return `
      <div class="rounded-2xl p-4 shadow ${card.classe}">
        <p class="text-sm font-semibold uppercase tracking-wide">${card.titulo}</p>
        <p class="text-2xl font-bold">${formatarPercentualBr(totais[card.chaveTotal])}</p>
        <div class="mt-3 space-y-1">
          ${lista}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="space-y-4">
      <div class="grid gap-4 md:grid-cols-3">
        ${statusCards}
      </div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        ${percentCards}
      </div>
    </div>
  `;
}

async function carregarResumoDiarioMensal(inicio, fim) {
  const container = document.getElementById('diarioResumoMensal');
  if (!container || !uid) return;
  container.innerHTML =
    '<p class="text-sm text-gray-500">Carregando acompanhamento diário...</p>';

  try {
    const colRef = collection(db, `uid/${uid}/acompanhamentoDiario`);
    const temIntervaloValido = Boolean(
      inicio && fim && typeof inicio === 'string' && typeof fim === 'string',
    );
    const consulta = temIntervaloValido
      ? query(colRef, orderBy('__name__'), startAt(inicio), endAt(fim))
      : query(colRef, orderBy('__name__'));
    const snap = await getDocs(consulta);
    const registros = [];
    snap.forEach((docSnap) => {
      const dados = docSnap.data() || {};
      const dataRegistro = String(dados.data || docSnap.id || '');
      if (temIntervaloValido) {
        if (!dataRegistro) return;
        if (dataRegistro < inicio || dataRegistro > fim) return;
      }
      if (Array.isArray(dados.lojas) && dados.lojas.length) {
        dados.lojas.forEach((loja) => {
          const registro = mapearRegistroDiarioMentorado(loja, {
            data: dataRegistro,
          });
          if (registro) registros.push(registro);
        });
      } else {
        const registro = mapearRegistroDiarioMentorado(dados, {
          data: dataRegistro,
        });
        if (registro) registros.push(registro);
      }
    });

    if (!registros.length) {
      container.innerHTML =
        '<p class="text-sm text-gray-500">Nenhum registro diário no período selecionado.</p>';
      return;
    }

    const resumo = agregarDiarioMentorado(registros);
    container.innerHTML = montarHtmlResumoDiarioMensal(resumo);
  } catch (err) {
    console.error('Erro ao carregar resumo diário mensal', err);
    container.innerHTML =
      '<p class="text-sm text-red-500">Erro ao carregar acompanhamento diário.</p>';
  }
}

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
      carregarResumoDiarioMensal(primeiroDia, hojeStr);
      document.getElementById('filtrarSkus').addEventListener('click', () => {
        carregarResultados(dataInicio.value, dataFim.value);
        carregarListaSkus(dataInicio.value, dataFim.value);
        carregarResumoDiarioMensal(dataInicio.value, dataFim.value);
      });
    }
  });
}

window.initResultadosMentorado = initResultadosMentorado;
