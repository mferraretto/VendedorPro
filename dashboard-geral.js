import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { db, auth, getPassphrase } from './firebase-config.js';
import { decryptString } from './crypto.js';
const opts = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'top',
      labels: { boxWidth: 12, color: '#0f172a', font: { size: 12 } },
    },
    tooltip: {
      callbacks: {
        label: (ctx) =>
          `${ctx.dataset.label}: R$ ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#334155', font: { size: 12 } },
    },
    y: {
      grid: { color: 'rgba(148,163,184,0.2)' },
      ticks: { color: '#334155', font: { size: 12 } },
    },
  },
  elements: { line: { tension: 0.35 }, point: { radius: 0, hoverRadius: 4 } },
};
let dashboardData = {};

// Helper to safely (re)initialize charts without leaving orphaned instances
function initChart(ctx, config) {
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();
  return new Chart(ctx, config);
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = v
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    return parseFloat(n) || 0;
  }
  return 0;
}
async function carregarDashboard(user, mesSelecionado) {
  const uid = user.uid;
  const baseDate = mesSelecionado
    ? new Date(mesSelecionado + '-01')
    : new Date();
  const mesAtual = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
  const totalDiasMes = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth() + 1,
    0,
  ).getDate();

  let totalBruto = 0;
  let totalLiquido = 0;
  let totalUnidades = 0;
  const diarioBruto = {};
  const diarioLiquido = {};
  const cancelamentosDiario = {};
  const porLoja = {};
  const mesesComparativos = [];
  for (let i = 0; i < 3; i++) {
    const dt = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    mesesComparativos.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    );
  }
  const comparativo = {};
  mesesComparativos.forEach((m) => (comparativo[m] = 0));

  const snap = await getDocs(collection(db, `uid/${uid}/faturamento`));
  for (const docSnap of snap.docs) {
    const mesDoc = docSnap.id.slice(0, 7);
    if (!mesesComparativos.includes(mesDoc)) continue;
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
      const bruto = toNumber(dados.valorBruto);
      const liquido = toNumber(dados.valorLiquido);
      const qtd = toNumber(dados.qtdVendas || dados.quantidade);
      comparativo[mesDoc] = (comparativo[mesDoc] || 0) + liquido;
      if (mesDoc === mesAtual) {
        totalBruto += bruto;
        totalLiquido += liquido;
        totalUnidades += qtd;
        diarioBruto[docSnap.id] = (diarioBruto[docSnap.id] || 0) + bruto;
        diarioLiquido[docSnap.id] = (diarioLiquido[docSnap.id] || 0) + liquido;
        porLoja[lojaDoc.id] = (porLoja[lojaDoc.id] || 0) + liquido;
        const cancel = toNumber(dados.valorCancelado);
        const cancelAlt = toNumber(dados.cancelado);
        cancelamentosDiario[docSnap.id] =
          (cancelamentosDiario[docSnap.id] || 0) + (cancel || cancelAlt);
      }
    }
  }

  const ticketMedio = totalUnidades ? totalLiquido / totalUnidades : 0;

  let meta = 0;
  try {
    const metaDoc = await getDoc(
      doc(db, `uid/${uid}/metasFaturamento`, mesAtual),
    );
    if (metaDoc.exists()) meta = toNumber(metaDoc.data().valor);
  } catch (err) {
    console.error('Erro ao buscar meta:', err);
  }

  const metaDiaria = meta / totalDiasMes;
  let diasAcima = 0;
  let diasAbaixo = 0;
  Object.keys(diarioLiquido).forEach((dia) => {
    if (diarioLiquido[dia] >= metaDiaria) diasAcima++;
    else diasAbaixo++;
  });

  let totalSaques = 0;
  try {
    const resumoDoc = await getDoc(
      doc(db, 'usuarios', uid, 'comissoes', mesAtual),
    );
    if (resumoDoc.exists()) {
      totalSaques = toNumber(resumoDoc.data().totalSacado);
    }
  } catch (err) {
    console.error('Erro ao carregar saques', err);
  }

  let nomeEmpresa = '';
  let responsavel = user.email || '';
  try {
    const perfilDoc = await getDoc(doc(db, 'perfil', uid));
    if (perfilDoc.exists()) {
      const pdata = perfilDoc.data();
      nomeEmpresa = pdata.empresa || '';
      responsavel = pdata.nomeCompleto || responsavel;
    }
  } catch (err) {
    console.error('Erro ao carregar perfil', err);
  }

  let topProdutos = [];
  let produtosCriticos = [];
  let topSkus = [];
  try {
    const prodSnap = await getDocs(collection(db, `uid/${uid}/produtos`));
    const arr = [];
    for (const p of prodSnap.docs) {
      let d = p.data();
      if (d.encrypted) {
        const pass = getPassphrase() || `chave-${uid}`;
        let txt;
        try {
          txt = await decryptString(d.encrypted, pass);
        } catch (e) {
          try {
            txt = await decryptString(d.encrypted, uid);
          } catch (_) {}
        }
        if (txt) d = JSON.parse(txt);
      }
      arr.push({
        nome: d.nome || p.id,
        sku: d.sku || p.id,
        vendas: toNumber(d.vendas),
        estoque: toNumber(d.estoque),
      });
    }
    topProdutos = arr
      .filter((p) => p.vendas > 0)
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 10);
    produtosCriticos = arr.filter((p) => p.estoque > 0 && p.vendas === 0);
  } catch (err) {
    console.error('Erro ao carregar produtos', err);
  }

  let rentabilidade = [];
  let topRentaveis = [];
  try {
    const skusSnap = await getDocs(collection(db, `uid/${uid}/skusVendidos`));
    const mapa = {};
    for (const docSnap of skusSnap.docs) {
      if (!docSnap.id.includes(mesAtual)) continue;
      const listaRef = collection(
        db,
        `uid/${uid}/skusVendidos/${docSnap.id}/lista`,
      );
      const listaSnap = await getDocs(listaRef);
      listaSnap.forEach((item) => {
        const d = item.data();
        const sku = d.sku || item.id;
        const qtd = toNumber(d.total || d.quantidade);
        const valor = toNumber(d.valorLiquido);
        if (!mapa[sku]) mapa[sku] = { qtd: 0, valor: 0 };
        mapa[sku].qtd += qtd;
        mapa[sku].valor += valor;
      });
    }

    topSkus = Object.entries(mapa)
      .map(([sku, dados]) => ({ sku, vendas: dados.qtd }))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 5);

    const { precos } = await carregarProdutosEMetas(uid);
    rentabilidade = Object.entries(mapa)
      .map(([sku, dados]) => {
        const custo = (precos[sku] || 0) * dados.qtd;
        const lucro = dados.valor - custo;
        const margem = dados.valor ? (lucro / dados.valor) * 100 : 0;
        return { sku, receita: dados.valor, custo, lucro, margem };
      })
      .sort((a, b) => b.lucro - a.lucro);
    topRentaveis = rentabilidade.slice(0, 5);
  } catch (err) {
    console.error('Erro ao carregar skus vendidos', err);
  }

  dashboardData = {
    nomeEmpresa,
    responsavel,
    mesAtual,
    totalBruto,
    totalLiquido,
    totalUnidades,
    ticketMedio,
    meta,
    diasAcima,
    diasAbaixo,
    totalSaques,
    diarioBruto,
    diarioLiquido,
    porLoja,
    cancelamentosDiario,
    comparativo,
    topProdutos,
    produtosCriticos,
    topSkus,
    rentabilidade,
    topRentaveis,
  };
  window.dashboardData = dashboardData;

  renderKpis(
    totalBruto,
    totalLiquido,
    totalUnidades,
    ticketMedio,
    meta,
    diasAcima,
    diasAbaixo,
    totalSaques,
  );
  renderCharts(diarioBruto, diarioLiquido, diasAcima, diasAbaixo, porLoja);
  renderTopSkus(topSkus);
  renderRentabilidade(rentabilidade, topRentaveis);
  renderTopSkusComparativo(topSkus, rentabilidade);
  renderComparativoMeta(
    totalLiquido,
    meta,
    diarioLiquido,
    totalDiasMes,
    mesAtual,
  );
  await carregarPrevisaoDashboard(uid, baseDate);
  setupTabs();
  setupSubTabs();
}

function renderKpis(
  bruto,
  liquido,
  unidades,
  ticket,
  meta,
  diasAcima,
  diasAbaixo,
  saques,
) {
  const pctBruto = meta ? (bruto / meta) * 100 : 0;
  const pctLiquido = meta ? (liquido / meta) * 100 : 0;
  const kpis = document.getElementById('kpis');
  if (!kpis) return;
  const card = (titulo, valor, subt = '') => `
    <div class="card">
      <div class="text-slate-600 text-sm font-medium tracking-wide uppercase">${titulo}</div>
      <div class="mt-2 flex items-end gap-2">
        <div class="text-2xl md:text-3xl font-semibold text-slate-900">${valor}</div>
      </div>
      ${subt ? `<div class="mt-1 text-xs text-slate-500">${subt}</div>` : ''}
    </div>`;
  kpis.innerHTML =
    card('Faturamento Bruto', `R$ ${bruto.toLocaleString('pt-BR')}`) +
    card('Faturamento Líquido', `R$ ${liquido.toLocaleString('pt-BR')}`) +
    card('Unidades Vendidas', `${unidades}`) +
    card(
      'Ticket Médio',
      `R$ ${ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ) +
    card(
      '% Meta Atingida Bruto',
      `${pctBruto.toFixed(1)}%`,
      'Meta atingida (bruto)',
    ) +
    card(
      '% Meta Atingida Líquido',
      `${pctLiquido.toFixed(1)}%`,
      'Meta atingida (líquido)',
    ) +
    card('Dias Acima da Meta', `${diasAcima}`) +
    card('Dias Abaixo da Meta', `${diasAbaixo}`) +
    card(
      'Total Saques',
      `R$ ${saques.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
}

function renderCharts(
  diarioBruto,
  diarioLiquido,
  diasAcima,
  diasAbaixo,
  porLoja,
) {
  const dias = Object.keys(diarioBruto).sort();
  const ctxLinhas = document.getElementById('evolucaoChart');
  if (ctxLinhas) {
    initChart(ctxLinhas, {
      type: 'line',
      data: {
        labels: dias.map((d) => new Date(d).toLocaleDateString('pt-BR')),
        datasets: [
          {
            label: 'Bruto',
            data: dias.map((d) => diarioBruto[d]),
            borderColor: 'var(--primary)',
            backgroundColor: 'rgba(99,102,241,0.2)',
            tension: 0.3,
          },
          {
            label: 'Líquido',
            data: dias.map((d) => diarioLiquido[d]),
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.2)',
            tension: 0.3,
          },
        ],
      },
      options: opts,
    });
  }

  const ctxBar = document.getElementById('diasMetaChart');
  if (ctxBar) {
    initChart(ctxBar, {
      type: 'bar',
      data: {
        labels: ['Acima da Meta', 'Abaixo da Meta'],
        datasets: [
          {
            data: [diasAcima, diasAbaixo],
            backgroundColor: ['#86efac', '#fca5a5'],
          },
        ],
      },
      options: opts,
    });
  }

  const ctxPie = document.getElementById('lojasPieChart');
  if (ctxPie) {
    const lojas = Object.keys(porLoja);
    initChart(ctxPie, {
      type: 'pie',
      data: {
        labels: lojas,
        datasets: [
          {
            data: lojas.map((l) => porLoja[l]),
            backgroundColor: [
              'var(--primary-light)',
              'var(--highlight)',
              'var(--primary)',
              'var(--success)',
              '#f59e0b',
              '#ef4444',
            ],
          },
        ],
      },
      options: opts,
    });
  }

  const ctxMargem = document.getElementById('margemChart');
  if (ctxMargem) {
    const margens = dias.map((d) => {
      const bruto = diarioBruto[d] || 0;
      const liquido = diarioLiquido[d] || 0;
      return bruto ? (liquido / bruto) * 100 : 0;
    });
    initChart(ctxMargem, {
      type: 'line',
      data: {
        labels: dias.map((d) => new Date(d).toLocaleDateString('pt-BR')),
        datasets: [
          {
            label: 'Margem (%)',
            data: margens,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.2)',
            tension: 0.3,
          },
        ],
      },
      options: opts,
    });
  }
}

function renderTopSkus(lista, root = document) {
  const el = root.querySelector('#topSkusList');
  if (!el) return;
  el.innerHTML = lista
    .map(
      (p) =>
        `<li style="display:flex;justify-content:space-between;">
          <span>${p.sku}</span>
          <span>${p.vendas.toLocaleString('pt-BR')}</span>
        </li>`,
    )
    .join('');
}

function renderTopSkusComparativo(lista, rentabilidade, root = document) {
  const ctx = root.querySelector('#topSkusMargemChart');
  if (!ctx) return;
  const labels = lista.map((p) => p.sku);
  const vendas = lista.map((p) => p.vendas);
  const margens = lista.map((p) => {
    const r = rentabilidade.find((x) => x.sku === p.sku);
    if (!r) return 0;
    return r.margem > 1 ? r.margem : r.margem * 100;
  });
  initChart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Vendas',
          data: vendas,
          backgroundColor: 'var(--primary)',
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Margem (%)',
          data: margens,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.2)',
          yAxisID: 'y1',
          tension: 0.3,
        },
      ],
    },
    options: {
      ...opts,
      scales: {
        ...opts.scales,
        y: {
          beginAtZero: true,
          position: 'left',
          ticks: { font: { size: 10 } },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { callback: (v) => v + '%', font: { size: 10 } },
          suggestedMax: 100,
        },
      },
    },
  });
}

function renderRentabilidade(lista, top5, root = document) {
  const tbody = root.querySelector('#tabelaRentabilidade');
  if (tbody) {
    tbody.innerHTML = lista
      .map(
        (p) => `
        <tr>
          <td>${p.sku}</td>
          <td style="text-align:right">R$ ${p.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">R$ ${p.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">R$ ${p.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">${p.margem.toFixed(1)}%</td>
      </tr>
      `,
      )
      .join('');
  }
  const topEl = root.querySelector('#topRentaveis');
  if (topEl) {
    topEl.innerHTML = top5
      .map(
        (p) =>
          `<li style="display:flex;justify-content:space-between;">
            <span>${p.sku}</span>
            <span>R$ ${p.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </li>`,
      )
      .join('');
  }
}

function renderComparativoMeta(
  liquido,
  meta,
  diarioLiquido,
  totalDiasMes,
  mesAtual,
) {
  const barCtx = document.getElementById('metaComparativoChart');
  if (barCtx) {
    initChart(barCtx, {
      type: 'bar',
      data: {
        labels: ['Meta', 'Realizado'],
        datasets: [
          {
            label: 'Valor (R$)',
            data: [meta, liquido],
            backgroundColor: ['#9ca3af', 'var(--primary)'],
          },
        ],
      },
      options: opts,
    });
  }

  const semanaCtx = document.getElementById('progressoSemanalChart');
  if (semanaCtx) {
    const metaDiaria = meta / totalDiasMes;
    const totalSemanas = Math.ceil(totalDiasMes / 7);
    const labels = [];
    const metaAcum = [];
    const realAcum = [];
    let acumulado = 0;
    for (let s = 1; s <= totalSemanas; s++) {
      const inicio = (s - 1) * 7 + 1;
      const fim = Math.min(s * 7, totalDiasMes);
      for (let dia = inicio; dia <= fim; dia++) {
        const chave = `${mesAtual}-${String(dia).padStart(2, '0')}`;
        acumulado += diarioLiquido[chave] || 0;
      }
      labels.push(`Semana ${s}`);
      realAcum.push(acumulado);
      metaAcum.push(metaDiaria * fim);
    }
    initChart(semanaCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Realizado',
            data: realAcum,
            borderColor: 'var(--primary)',
            backgroundColor: 'rgba(99,102,241,0.2)',
            tension: 0.3,
          },
          {
            label: 'Meta',
            data: metaAcum,
            borderColor: '#9ca3af',
            backgroundColor: 'rgba(156,163,175,0.2)',
            tension: 0.3,
          },
        ],
      },
      options: opts,
    });
  }
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const tabs = {
    overview: document.getElementById('tab-overview'),
    meta: document.getElementById('tab-meta'),
    estrategica: document.getElementById('tab-estrategica'),
  };
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.remove('bg-slate-900', 'text-white', 'border-slate-900');
        b.classList.add('bg-white', 'text-slate-700', 'border-slate-300');
      });
      btn.classList.add('bg-slate-900', 'text-white', 'border-slate-900');
      btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300');
      Object.values(tabs).forEach((t) => t.classList.add('hidden'));
      const alvo = tabs[btn.dataset.tab];
      if (alvo) alvo.classList.remove('hidden');
    });
  });
}

function setupSubTabs() {
  const buttons = document.querySelectorAll('.subtab-btn');
  const tabs = {
    resumo: document.getElementById('subtab-resumo'),
    desempenho: document.getElementById('subtab-desempenho'),
    previsao: document.getElementById('subtab-previsao'),
  };
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.remove('bg-slate-900', 'text-white', 'border-slate-900');
        b.classList.add('bg-white', 'text-slate-700', 'border-slate-300');
      });
      btn.classList.add('bg-slate-900', 'text-white', 'border-slate-900');
      btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300');
      Object.values(tabs).forEach((t) => t.classList.add('hidden'));
      const alvo = tabs[btn.dataset.subtab];
      if (alvo) alvo.classList.remove('hidden');
    });
  });
}

async function carregarPrevisaoDashboard(uid, baseDate = new Date()) {
  const cards = document.getElementById('cardsPrevisao');
  const container = document.getElementById('topSkusPrevisao');
  const chartEl = document.getElementById('previsaoChart');
  if (!cards || !container) return;
  cards.innerHTML = '🔄 Carregando...';
  container.innerHTML = '';

  const proxMes = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
  const anoMes = `${proxMes.getFullYear()}-${String(proxMes.getMonth() + 1).padStart(2, '0')}`;

  try {
    const docSnap = await getDoc(doc(db, `uid/${uid}/previsoes`, anoMes));
    if (!docSnap.exists()) {
      cards.innerHTML =
        '<p class="text-gray-500">Nenhuma previsão disponível.</p>';
      return;
    }
    const previsao = docSnap.data() || {};
    renderPrevisaoCards(cards, previsao);
    renderPrevisaoChart(chartEl, previsao);
    const { precos, metas } = await carregarProdutosEMetas(uid);
    renderPrevisaoTopSkus(container, previsao, precos, metas);
    dashboardData.previsao = { dados: previsao, precos, metas };
  } catch (err) {
    console.error('Erro ao carregar previsão', err);
    cards.innerHTML = '<p class="text-red-500">Erro ao carregar previsão</p>';
  }
}

async function carregarProdutosEMetas(uid) {
  const precos = {};
  try {
    const snap = await getDocs(collection(db, `uid/${uid}/produtos`));
    for (const p of snap.docs) {
      let d = p.data();
      if (d.encrypted) {
        const pass = getPassphrase() || `chave-${uid}`;
        let txt;
        try {
          txt = await decryptString(d.encrypted, pass);
        } catch (e) {
          try {
            txt = await decryptString(d.encrypted, uid);
          } catch (_) {}
        }
        if (txt) d = JSON.parse(txt);
      }
      const sku = d.sku || p.id;
      precos[sku] = toNumber(d.custo);
    }
  } catch (err) {
    console.error('Erro ao carregar produtos', err);
  }

  const metas = {};
  try {
    const q = query(collection(db, 'metasSKU'), where('uid', '==', uid));
    const metasSnap = await getDocs(q);
    metasSnap.forEach((m) => {
      const originalSku = m.id.replaceAll('__', '/');
      metas[originalSku] = toNumber(m.data().valor);
    });
  } catch (err) {
    console.error('Erro ao carregar metasSKU', err);
  }

  Object.keys(precos).forEach((sku) => {
    if (metas[sku] === undefined) metas[sku] = precos[sku];
  });
  return { precos, metas };
}

function renderPrevisaoCards(el, previsao) {
  const base = previsao.totalGeral || 0;
  const pess = base * 0.85;
  const otm = base * 1.15;
  el.innerHTML = `
    <div class="bg-red-100 text-red-800 p-4 rounded shadow text-center">
      <div class="font-bold">Pessimista</div><div>${pess.toFixed(0)}</div>
    </div>
    <div class="bg-blue-100 text-blue-800 p-4 rounded shadow text-center">
      <div class="font-bold">Base</div><div>${base.toFixed(0)}</div>
    </div>
    <div class="bg-green-100 text-green-800 p-4 rounded shadow text-center">
      <div class="font-bold">Otimista</div><div>${otm.toFixed(0)}</div>
    </div>`;
}

function renderPrevisaoChart(canvas, previsao) {
  if (!canvas) return;
  const base = previsao.totalGeral || 0;
  const pess = base * 0.85;
  const otm = base * 1.15;
  initChart(canvas, {
    type: 'bar',
    data: {
      labels: ['Pessimista', 'Base', 'Otimista'],
      datasets: [
        {
          label: 'Projeção',
          data: [pess, base, otm],
          backgroundColor: ['#ec4899', '#60a5fa', '#34d399'],
        },
      ],
    },
    options: {
      ...opts,
      plugins: { ...opts.plugins, legend: { display: false } },
    },
  });
}

function renderPrevisaoTopSkus(container, previsao, precos, metas) {
  const dadosSkus = Object.entries(previsao.skus || {});
  if (!dadosSkus.length) {
    container.innerHTML =
      '<p class="text-gray-500">Nenhuma previsão disponível.</p>';
    return;
  }

  const baseLista = dadosSkus
    .map(([sku, info]) => {
      const quantidade = info.total || 0;
      const preco = precos[sku] || 0;
      const bruto = quantidade * preco;
      return { sku, quantidade, bruto };
    })
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  const cenarios = [
    { titulo: 'Pessimista', fator: 0.85 },
    { titulo: 'Base', fator: 1 },
    { titulo: 'Otimista', fator: 1.15 },
  ];

  const tabelas = cenarios
    .map((c) => {
      const linhas = baseLista
        .map((item) => {
          const quantidade = item.quantidade * c.fator;
          const bruto = item.bruto * c.fator;
          return `
            <tr>
              <td class="px-2 py-1 border">${item.sku}</td>
              <td class="px-2 py-1 border">${quantidade.toFixed(0)}</td>
              <td class="px-2 py-1 border">R$ ${bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>`;
        })
        .join('');

      return `
        <div class="overflow-x-auto">
          <h4 class="font-bold mb-2 text-center">Top 10 SKUs projeção ${c.titulo}</h4>
          <table class="min-w-full text-sm text-left">
            <thead>
              <tr>
                <th class="px-2 py-1 border">SKU</th>
                <th class="px-2 py-1 border">Quantidade</th>
                <th class="px-2 py-1 border">Bruto Esperado</th>
              </tr>
            </thead>
            <tbody>
              ${linhas}
            </tbody>
          </table>
        </div>`;
    })
    .join('');

  container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">${tabelas}</div>`;
}

document
  .getElementById('imprimirFechamentoBtn')
  ?.addEventListener('click', exportarFechamentoMes);

// Expose function globally in case the button is rendered dynamically
window.exportarFechamentoMes = exportarFechamentoMes;

async function exportarFechamentoMes() {
  const filtro = document.getElementById('filtroMes');
  const mesFiltro = filtro?.value;
  const user = auth.currentUser;
  if (user && mesFiltro && dashboardData.mesAtual !== mesFiltro) {
    await carregarDashboard(user, mesFiltro);
  }
  if (!dashboardData || !dashboardData.mesAtual) return;
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.width = '190mm';
  container.style.margin = '0 auto';
  container.style.boxSizing = 'border-box';
  container.style.backgroundColor = '#fff';
  container.innerHTML = gerarHTMLFechamento();
  document.body.appendChild(container);

  const dias = Object.keys(dashboardData.diarioBruto).sort();

  const diarioCtx = container.querySelector('#diarioChart');
  if (diarioCtx) {
    initChart(diarioCtx, {
      type: 'line',
      data: {
        labels: dias.map((d) => new Date(d).toLocaleDateString('pt-BR')),
        datasets: [
          {
            label: 'Bruto',
            data: dias.map((d) => dashboardData.diarioBruto[d] || 0),
            borderColor: 'var(--primary-dark)',
            backgroundColor: 'rgba(79,70,229,0.15)',
            fill: false,
            tension: 0.3,
          },
          {
            label: 'Líquido',
            data: dias.map((d) => dashboardData.diarioLiquido[d] || 0),
            borderColor: 'var(--primary)',
            backgroundColor: 'rgba(99,102,241,0.15)',
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        ...opts,
        plugins: {
          ...opts.plugins,
          title: {
            display: true,
            text: 'Faturamento Diário Bruto vs. Líquido',
            font: { size: 14 },
          },
        },
        scales: {
          ...opts.scales,
          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 10,
              font: { size: 10 },
              maxRotation: 45,
              minRotation: 45,
            },
          },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  const tendenciaCtx = container.querySelector('#tendenciaChart');
  if (tendenciaCtx) {
    const acumulado = [];
    dias.forEach((dia, idx) => {
      const prev = acumulado[idx - 1] || 0;
      acumulado[idx] = prev + (dashboardData.diarioLiquido[dia] || 0);
    });
    const metaLinha = dias.map((_, idx) => {
      return dashboardData.meta
        ? (dashboardData.meta * (idx + 1)) / dias.length
        : 0;
    });
    initChart(tendenciaCtx, {
      type: 'line',
      data: {
        labels: dias.map((d) => new Date(d).toLocaleDateString('pt-BR')),
        datasets: [
          {
            label: 'Acumulado',
            data: acumulado,
            borderColor: 'var(--primary-dark)',
            backgroundColor: 'rgba(79,70,229,0.2)',
            tension: 0.3,
          },
          {
            label: 'Meta',
            data: metaLinha,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.2)',
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0.3,
          },
        ],
      },
      options: {
        ...opts,
        plugins: {
          ...opts.plugins,
          title: {
            display: true,
            text: 'Faturamento Acumulado vs. Meta',
            font: { size: 14 },
          },
        },
        scales: {
          ...opts.scales,
          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 10,
              font: { size: 10 },
              maxRotation: 45,
              minRotation: 45,
            },
          },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  const metaGaugeCtx = container.querySelector('#metaGaugeChart');
  if (metaGaugeCtx) {
    const pct = dashboardData.meta
      ? (dashboardData.totalLiquido / dashboardData.meta) * 100
      : 0;
    initChart(metaGaugeCtx, {
      type: 'doughnut',
      data: {
        labels: ['Atingido', 'Restante'],
        datasets: [
          {
            data: [pct, Math.max(100 - pct, 0)],
            backgroundColor: ['var(--primary-dark)', '#e5e7eb'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        ...opts,
        rotation: -90,
        circumference: 180,
        cutout: '80%',
        plugins: {
          ...opts.plugins,
          legend: { display: false },
          tooltip: { enabled: false },
          title: {
            display: true,
            text: `Progresso da Meta (${pct.toFixed(1)}%)`,
            font: { size: 14 },
          },
        },
      },
    });
  }

  const proporcaoCtx = container.querySelector('#proporcaoChart');
  if (proporcaoCtx) {
    initChart(proporcaoCtx, {
      type: 'doughnut',
      data: {
        labels: ['Bruto', 'Líquido'],
        datasets: [
          {
            data: [dashboardData.totalBruto, dashboardData.totalLiquido],
            backgroundColor: ['var(--primary-dark)', 'var(--primary)'],
          },
        ],
      },
      options: opts,
    });
  }

  // Secção Desempenho & Rentabilidade
  renderTopSkusComparativo(
    dashboardData.topSkus,
    dashboardData.rentabilidade,
    container,
  );
  renderTopSkus(dashboardData.topSkus, container);
  renderRentabilidade(
    dashboardData.rentabilidade,
    dashboardData.topRentaveis,
    container,
  );

  // Secção Projeção & Previsão
  if (dashboardData.previsao) {
    const prev = dashboardData.previsao;
    const cardsPrev = container.querySelector('#cardsPrevisao');
    if (cardsPrev) {
      const base = prev.dados.totalGeral || 0;
      const pess = base * 0.85;
      const otm = base * 1.15;
      cardsPrev.innerHTML = `
        <div class="card" style="background:#fee2e2;color:#991b1b;"><div>Pessimista</div><strong>${pess.toFixed(0)}</strong></div>
        <div class="card" style="background:#dbeafe;color:#1e3a8a;"><div>Base</div><strong>${base.toFixed(0)}</strong></div>
        <div class="card" style="background:#d1fae5;color:#065f46;"><div>Otimista</div><strong>${otm.toFixed(0)}</strong></div>
      `;
    }
    renderPrevisaoChart(container.querySelector('#previsaoChart'), prev.dados);
    renderPrevisaoTopSkus(
      container.querySelector('#topSkusPrevisao'),
      prev.dados,
      prev.precos,
      prev.metas,
    );
  }

  setTimeout(() => {
    html2pdf()
      .set({
        margin: 10,
        filename: `fechamento-${dashboardData.mesAtual}.pdf`,
        pagebreak: { mode: ['css', 'legacy'] },
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff' },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: false,
        },
      })
      .from(container)
      .save()
      .then(() => container.remove());
  }, 1000);
}

function gerarHTMLFechamento() {
  const d = dashboardData;
  const mesBR = new Date(d.mesAtual + '-01').toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const mesTitle = mesBR.charAt(0).toUpperCase() + mesBR.slice(1);
  const pctMeta = d.meta ? ((d.totalLiquido / d.meta) * 100).toFixed(1) : '0';

  const meses = Object.keys(d.comparativo || {}).sort();
  const idxAtual = meses.indexOf(d.mesAtual);
  const mesAnterior = idxAtual > 0 ? meses[idxAtual - 1] : null;
  const liquidoAnterior = mesAnterior ? d.comparativo[mesAnterior] : null;
  const variacaoLiquido =
    liquidoAnterior !== null ? d.totalLiquido - liquidoAnterior : 0;
  const iconLiquido =
    variacaoLiquido >= 0 ? 'bx-up-arrow-alt' : 'bx-down-arrow-alt';
  const classeLiquido = variacaoLiquido >= 0 ? 'trend-up' : 'trend-down';

  return `
    <div style="font-family:'Inter',sans-serif;width:100%;max-width:190mm;color:#111827;">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
        @import url('https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css');
        :root {
          --primary-color: #6366F1;
          --secondary-color: #14B8A6;
          --text-color: #111827;
          --bg-color: #f8f8f8;
          --background: #ffffff;
        }

        body { background-color: var(--bg-color); }
        .page {
          page-break-after: always;
          padding: 20px;
          background: var(--background);
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          border-radius: 12px;
          margin-bottom: 20px;
        }
        .page:last-child { page-break-after: auto; }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 20px;
          border-bottom: 2px solid var(--primary-color);
          margin-bottom: 20px;
        }
        .header img { height: 40px; }
        .header .title {
          flex-grow: 1;
          text-align: center;
          font-size: 24px;
          font-weight: 600;
          color: var(--primary-color);
        }
        .header .responsavel { text-align: right; font-size: 12px; }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--primary-color);
          margin-top: 30px;
          margin-bottom: 15px;
          border-left: 4px solid var(--secondary-color);
          padding-left: 10px;
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 20px;
        }
        .card {
          background-color: var(--background);
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .card .icon {
          font-size: 28px;
          margin-bottom: 8px;
          color: var(--secondary-color);
        }
        .card .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .card .value {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-color);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .trend-up { color: #16a34a; }
        .trend-down { color: #dc2626; }
        .meta-wrapper { margin: 20px 0; text-align: center; }
        .meta-bar {
          background: #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
          height: 12px;
          margin-top: 6px;
        }
        .meta-bar .progress { background: var(--secondary-color); height: 100%; }
        .obs-box { display: flex; justify-content: center; gap: 30px; margin-top: 10px; }
        .chart-container {
          width: 100%;
          height: 300px;
          margin: 20px 0;
          padding: 15px;
          background: var(--background);
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .tables-container {
          display: flex;
          gap: 20px;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        .table-box {
          flex: 1;
          min-width: 300px;
          background: var(--background);
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          padding: 15px;
        }
        .list-items { list-style-type: none; padding: 0; margin: 0; }
        .list-items li {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .list-items li:nth-child(even) { background: #f9fafb; }
        .list-items li:last-child { border-bottom: none; }
      </style>
      <div class="page">
        <div class="header">
          ${d.logoUrl ? `<img src="${d.logoUrl}" alt="Logo">` : '<div></div>'}
          <div class="title">Fechamento de ${mesTitle}</div>
          <div class="responsavel">${d.responsavel ? `Responsável: ${d.responsavel}` : ''}</div>
        </div>
        <h2 class="section-title">1. Resumo Executivo</h2>
        <p>Desempenho financeiro consolidado do período com comparação à meta estabelecida.</p>
        <h3 class="section-title">Indicadores Chave do Mês</h3>
        <div class="cards">
          <div class="card">
            <div class="icon"><i class='bx bx-money'></i></div>
            <div class="label">Faturamento Bruto</div>
            <div class="value">R$ ${d.totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="card">
            <div class="icon"><i class='bx bx-wallet'></i></div>
            <div class="label">Faturamento Líquido</div>
            <div class="value">R$ ${d.totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <i class='bx ${iconLiquido} ${classeLiquido}'></i></div>
          </div>
          <div class="card">
            <div class="icon"><i class='bx bx-package'></i></div>
            <div class="label">Pedidos Totais</div>
            <div class="value">${d.totalUnidades}</div>
          </div>
          <div class="card">
            <div class="icon"><i class='bx bx-stats'></i></div>
            <div class="label">Ticket Médio</div>
            <div class="value">R$ ${d.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        <div class="meta-wrapper">
          <div>Meta Atingida: ${pctMeta}%</div>
          <div class="meta-bar"><div class="progress" style="width:${pctMeta}%;"></div></div>
        </div>
        <div class="chart-container"><canvas id="metaGaugeChart"></canvas></div>
        <div class="obs-box">
          <span>${d.diasAcima} dias acima da meta</span>
          <span>${d.diasAbaixo} dias abaixo da meta</span>
        </div>
        <h3 class="section-title">Desempenho Faturamento</h3>
        <div class="chart-container"><canvas id="diarioChart"></canvas></div>
        <div class="chart-container"><canvas id="tendenciaChart"></canvas></div>
      </div>
      <div class="page">
        <h2 class="section-title">2. Análise Detalhada</h2>
        <h3 class="section-title">Desempenho por Produto (SKU)</h3>
        <div class="chart-container"><canvas id="topSkusMargemChart"></canvas></div>
        <div class="tables-container">
          <div class="table-box">
            <h4 class="section-title" style="font-size:14px;">Top 5 SKUs do mês</h4>
            <ol id="topSkusList" class="list-items"></ol>
          </div>
          <div class="table-box">
            <h4 class="section-title" style="font-size:14px;">Top 5 mais rentáveis</h4>
            <ol id="topRentaveis" class="list-items"></ol>
          </div>
        </div>
      </div>
      <div class="page">
        <h2 class="section-title">3. Projeções e Previsões</h2>
        <h3 class="section-title">Projeção de Vendas</h3>
        <div class="chart-container"><canvas id="previsaoChart"></canvas></div>
        <div id="topSkusPrevisao"></div>
      </div>
    </div>
  `;
}

const filtroMes = document.getElementById('filtroMes');
if (filtroMes) {
  const agora = new Date();
  filtroMes.value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    const mesInicial = filtroMes?.value;
    carregarDashboard(user, mesInicial);
    filtroMes?.addEventListener('change', () => {
      carregarDashboard(user, filtroMes.value);
    });
  }
});
