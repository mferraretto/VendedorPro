import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getFirestore, collection, getDocs, doc, getDoc, collectionGroup, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { decryptString } from './crypto.js';
import { loadSecureDoc } from './secure-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { checkBackend } from './login.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function getPalette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue('--primary').trim(),
    secondary: styles.getPropertyValue('--secondary').trim()
  };
}

function hexToRgba(hex, opacity) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${opacity})`;
}
function toggleBlur(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const body = card.querySelector('.card-body');
  if (!body) return;
  const icon = card.querySelector('.toggle-blur i');
  const blurred = body.classList.toggle('blurred');
  if (icon) {
    icon.classList.toggle('fa-eye-slash', !blurred);
    icon.classList.toggle('fa-eye', blurred);
  }
  localStorage.setItem('blur_' + cardId, blurred);
}

function applyBlurStates() {
  document.querySelectorAll('[data-blur-id]').forEach(card => {
    const cardId = card.getAttribute('data-blur-id');
    const body = card.querySelector('.card-body');
    const icon = card.querySelector('.toggle-blur i');
    const blurred = localStorage.getItem('blur_' + cardId) === 'true';
    if (body) body.classList.toggle('blurred', blurred);
    if (icon) {
      icon.classList.toggle('fa-eye-slash', !blurred);
      icon.classList.toggle('fa-eye', blurred);
    }
    const btn = card.querySelector('.toggle-blur');
    if (btn) btn.addEventListener('click', () => toggleBlur(cardId));
  });
}

// apply saved blur settings for static cards immediately
applyBlurStates();

function startTour(force = false) {
  if (typeof introJs === 'undefined') return;
  if (!force && localStorage.getItem('tourSeen') === 'true') return;
  const intro = introJs.tour();
  intro.setOptions({
    steps: [
      { intro: 'Bem-vindo ao VendedorPro! Este tour apresenta os principais recursos da tela.' },
      { element: '#resumoFaturamentoCard', intro: 'Resumo do faturamento do mês.' },
      { element: '#topSkusCard', intro: 'Top 5 SKUs do mês.' },
      { element: '#tarefasCard', intro: 'Aqui ficam suas tarefas do dia.' },
      { element: '#atualizacoesCard', intro: 'Novidades e atualizações da Shopee.' }
    ],
    nextLabel: 'Próximo',
    prevLabel: 'Anterior',
    skipLabel: 'Pular',
    doneLabel: 'Finalizar'
  }).oncomplete(() => localStorage.setItem('tourSeen', 'true'))
    .onexit(() => localStorage.setItem('tourSeen', 'true'))
    .start();
}

document.addEventListener('navbarLoaded', () => {
  const btn = document.getElementById('startTourBtn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.addEventListener('click', () => startTour(true));
  }
});

function maybeStartTour() {
  startTour(false);
}


async function carregarResumoFaturamento(uid, isAdmin) {
  const el = document.getElementById('resumoFaturamento');
  const kpiEl = document.getElementById('kpiCards');
  if (!el) return;
  el.innerHTML = 'Carregando...';
  if (kpiEl) kpiEl.innerHTML = 'Carregando...';
  const hoje = new Date();
  const mesAtual = hoje.toISOString().slice(0,7); // YYYY-MM
  let totalLiquido = 0;
  let totalBruto = 0;
  let pedidos = 0;
  const dias = {};
  const snap = isAdmin
    ? await getDocs(collectionGroup(db, 'faturamento'))
    : await getDocs(collection(db, `uid/${uid}/faturamento`));
  for (const docSnap of snap.docs) {
    const [ano, mes, dia] = docSnap.id.split('-');
    if (`${ano}-${mes}` !== mesAtual) continue;
    const ownerUid = isAdmin ? docSnap.ref.parent.parent.id : uid;
    const subRef = collection(db, `uid/${ownerUid}/faturamento/${docSnap.id}/lojas`);
    const subSnap = await getDocs(subRef);
    let liquidoDia = 0;
    for (const s of subSnap.docs) {
      let d = s.data();
      if (d.encrypted) {
        const passFn = typeof window !== 'undefined' ? window.getPassphrase : null;
        const pass = passFn ? await passFn() : null;
        let txt;
        try {
          txt = await decryptString(d.encrypted, pass || ownerUid);
        } catch (e) {
          if (pass) {
            try {
              txt = await decryptString(d.encrypted, ownerUid);
            } catch (_) {
              // ignoramos erros de descriptografia para não interromper o resumo
            }
          }
        }
        if (!txt) continue; // não soma dados se a descriptografia falhar
        try {
          d = JSON.parse(txt);
        } catch (_) {
          continue;
        }
      }
      totalLiquido += d.valorLiquido || 0;
      totalBruto += d.valorBruto || 0;
      pedidos += d.qtdVendas || 0;
      liquidoDia += d.valorLiquido || 0;
    }
    dias[dia] = (dias[dia] || 0) + liquidoDia;
  }
  const labels = Object.keys(dias).sort((a,b)=>a.localeCompare(b));
  const valores = labels.map(d=>dias[d]);

  let totalSaques = 0;
  let totalComissaoPago = 0;
  let totalComissaoAberto = 0;
  const snapSaques = isAdmin
    ? await getDocs(collectionGroup(db, 'saques'))
    : await getDocs(collection(db, `uid/${uid}/saques`));
  for (const docSnap of snapSaques.docs) {
    const [anoS, mesS] = docSnap.id.split('-');
    if (`${anoS}-${mesS}` !== mesAtual) continue;
    const ownerUid = isAdmin ? docSnap.ref.parent.parent.id : uid;
    const passFn = typeof window !== 'undefined' ? window.getPassphrase : null;
    const pass = passFn ? await passFn() : null;
    const dados = await loadSecureDoc(db, `uid/${ownerUid}/saques`, docSnap.id, pass || ownerUid);
    const pago = dados?.pago || false;
    if (dados) totalSaques += dados.valorTotal || 0;
    const subRef = collection(db, `uid/${ownerUid}/saques/${docSnap.id}/lojas`);
    const subSnap = await getDocs(subRef);
    for (const s of subSnap.docs) {
      const enc = s.data().encrypted;
      if (!enc) continue;
      let txt;
      try {
        txt = await decryptString(enc, pass || ownerUid);
      } catch (e) {
        if (pass) {
          try {
            txt = await decryptString(enc, ownerUid);
          } catch (_) {
            // ignore
          }
        }
      }
      if (!txt) continue;
      try {
        const obj = JSON.parse(txt);
        const valorComissao = obj.comissao ? (obj.valor * obj.comissao / 100) : 0;
        if (pago) {
          totalComissaoPago += valorComissao;
        } else {
          totalComissaoAberto += valorComissao;
        }
      } catch (_) {
        // ignore JSON errors
      }
    }
  }

  if (kpiEl) {
    const cardSaques = `
      <div class="bg-white rounded-2xl shadow-lg p-4 text-center">
        <div class="text-sm text-gray-500">Saques</div>
        <div class="text-2xl font-bold">R$ ${totalSaques.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="mt-2">
          <div class="text-sm text-gray-500">Comissão Paga</div>
          <div class="text-xl font-bold text-green-600">R$ ${totalComissaoPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="mt-2">
          <div class="text-sm text-gray-500">Comissão em Aberto</div>
          <div class="text-xl font-bold text-yellow-600">R$ ${totalComissaoAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>
    `;
    const kpis = [
      { titulo: 'Receita Bruta', valor: totalBruto, moeda: true },
      { titulo: 'Receita Líquida', valor: totalLiquido, moeda: true },
      { titulo: 'Pedidos', valor: pedidos, moeda: false }
    ];
    kpiEl.innerHTML = [cardSaques, ...kpis.map(k => `
      <div class="bg-white rounded-2xl shadow-lg p-4 text-center">
        <div class="text-sm text-gray-500">${k.titulo}</div>
        <div class="text-2xl font-bold">${k.moeda ? 'R$ ' + k.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : k.valor}</div>
      </div>
    `)].join('');
  }
  el.innerHTML = `
      <a href="/VendedorPro/CONTROLE%20DE%20SOBRAS%20SHOPEE.html?tab=registroFaturamento" class="card block" id="resumoFaturamentoCard" data-blur-id="resumoFaturamentoCard">
        <div class="card-header">
          <div class="card-header-icon"><span class="text-2xl">💰</span></div>
          <div>
            <h2 class="text-xl font-extrabold text-gray-800">Faturamento do Mês</h2>
            <p class="text-gray-600 text-sm">${pedidos} pedidos</p>
          </div>
          <button type="button" class="ml-auto toggle-blur" data-card="resumoFaturamentoCard" onclick="event.preventDefault();event.stopPropagation();">
            <i class="fas fa-eye-slash"></i>
          </button>
        </div>
        <div class="card-body space-y-4">
          <div>
            <div class="text-sm text-gray-500">Líquido</div>
            <div class="text-4xl font-extrabold" style="color: var(--primary)">R$ ${totalLiquido.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Bruto</div>
            <div class="text-2xl font-bold" style="color: var(--secondary)">R$ ${totalBruto.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
          </div>
          <canvas id="miniChartFaturamento" height="80"></canvas>
        </div>
      </a>`;
  const ctxMini = document.getElementById('miniChartFaturamento')?.getContext('2d');
  if (ctxMini && typeof Chart !== 'undefined') {
    const { primary } = getPalette();
    new Chart(ctxMini, {
      type: 'line',
      data: { labels, datasets: [{ data: valores, borderColor: primary, backgroundColor: hexToRgba(primary,0.2), tension: 0.3, fill: true }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }
}

async function carregarTopSkus(uid, isAdmin) {
  const el = document.getElementById('topSkus');
  if (!el) return;
  el.innerHTML = 'Carregando...';
  const hoje = new Date();
  const mesAtual = hoje.toISOString().slice(0,7);
  const mapa = {};
  const snap = isAdmin
    ? await getDocs(collectionGroup(db, 'skusVendidos'))
    : await getDocs(collection(db, `uid/${uid}/skusVendidos`));
  for (const docSnap of snap.docs) {
    const [ano, mes] = docSnap.id.split('-');
    if (`${ano}-${mes}` !== mesAtual) continue;
    let ownerUid = uid;
    if (isAdmin) {
      const parentDoc = docSnap.ref.parent.parent;
      if (!parentDoc) {
        console.warn('Documento sem pai para skusVendidos:', docSnap.ref.path);
        continue;
      }
      ownerUid = parentDoc.id;
    }
    const listaRef = collection(db, `uid/${ownerUid}/skusVendidos/${docSnap.id}/lista`);
    const listaSnap = await getDocs(listaRef);
    listaSnap.forEach(s => {
      const d = s.data();
      const chave = `${d.sku}||${d.loja || ''}`;
      mapa[chave] = (mapa[chave] || 0) + (d.total || 0);
    });
  }
  const ordenado = Object.entries(mapa).sort((a,b) => b[1]-a[1]).slice(0,5);
  if (ordenado.length === 0) {
    el.innerHTML = '<p class="text-gray-500">Sem dados</p>';
    return;
  }
  const max = ordenado[0][1];
  const cores = ['var(--primary)', 'var(--success)', 'var(--secondary)', '#3b82f6', '#a855f7'];
  const linhas = ordenado.map(([ch,q],i) => {
    const [sku] = ch.split('||');
    const largura = (q / max) * 100;
    const cor = cores[i % cores.length];
    return `
      <div class="relative p-2 rounded bg-white overflow-hidden">
        <div class="absolute inset-0" style="width:${largura}%;background:${cor};opacity:0.2;"></div>
        <div class="relative flex justify-between text-sm font-medium">
          <span>${sku}</span>
          <span>${q}</span>
        </div>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="space-y-2">${linhas}</div>`;
}
async function carregarTarefas(uid, isAdmin) {
  const listaPend = document.getElementById('listaTarefasPendentes');
  const listaAnd = document.getElementById('listaTarefasAndamento');
  const listaFeitas = document.getElementById('listaTarefasFeitas');
  if (!listaPend || !listaAnd || !listaFeitas) return;
  listaPend.innerHTML = '<li class="placeholder text-gray-500">Carregando...</li>';
  listaAnd.innerHTML = '';
  listaFeitas.innerHTML = '';

  const tarefas = [
    '<a class="action-link" href="https://seller.shopee.com.br/portal/sale/order" target="_blank" rel="noopener">Baixar planilha vendas Shopee</a>',
    '<a class="action-link" href="https://mferraretto.github.io/VendedorPro/CONTROLE%20DE%20SOBRAS%20SHOPEE.html?tab=faturamento" target="_blank" rel="noopener">Registrar no sistema - Fechamento dia anterior</a>',
    '<a class="action-link" href="https://seller.shopee.com.br/portal/sale/mass/ship?mass_shipment_tab=201&filter.shipping_method=91003&filter.order_item_filter_type=item0&filter.order_process_status=1&filter.sort.sort_type=1&filter.sort.ascending=true&filter.pre_order=2&filter.shipping_urgency_filter.current_time=1755177333&filter.shipping_urgency_filter.shipping_urgency=1" target="_blank" rel="noopener">Organizar coleta e imprimir etiquetas + lista de empacotamento ZPL</a>',
    '<a class="action-link" href="https://mferraretto.github.io/VendedorPro/zpl-import-ocr.html" target="_blank" rel="noopener">Importar o arquivo ZPL para o sistema e aguardar a impressão das etiquetas do dia</a>'
  ];
  const hoje = new Date();
  const storageKey = `tarefasStatus_${hoje.toISOString().slice(0,10)}`;
  const statusMap = JSON.parse(localStorage.getItem(storageKey) || '{}');

  const pendentes = tarefas.filter(t => statusMap[t] === 'pendente' || !statusMap[t]);
  const andamento = tarefas.filter(t => statusMap[t] === 'andamento');
  const feitas = tarefas.filter(t => statusMap[t] === 'feito');

  function iconFor(status) {
    return status === 'feito' ? '✔️' : status === 'andamento' ? '🔄' : '⏳';
  }

  function render(t, status) {
    const leftBtn = status !== 'pendente'
      ? `<button class="task-btn" data-move="-1" data-tarefa="${t}">&#8592;</button>`
      : '';
    const rightBtn = status !== 'feito'
      ? `<button class="task-btn" data-move="1" data-tarefa="${t}">&#8594;</button>`
      : '';
    const textClass = status === 'feito' ? ' completed' : '';
    return `<li class="task-item${status === 'feito' ? ' completed' : ''}">`+
           `<span class="task-text${textClass}"><span class="status-icon">${iconFor(status)}</span>${t}</span>`+
           `<div class="task-actions">${leftBtn}${rightBtn}</div>`+
           `</li>`;
  }

  listaPend.innerHTML = pendentes.length
    ? pendentes.map(t => render(t, 'pendente')).join('')
    : '<li class="placeholder text-gray-500">Sem tarefas pendentes</li>';
  listaAnd.innerHTML = andamento.length
    ? andamento.map(t => render(t, 'andamento')).join('')
    : '<li class="placeholder text-gray-500">Nenhuma tarefa em andamento</li>';
  listaFeitas.innerHTML = feitas.length
    ? feitas.map(t => render(t, 'feito')).join('')
    : '<li class="placeholder text-gray-500">Nenhuma tarefa concluída</li>';

  function atualizarProgresso() {
    const total = tarefas.length;
    const concluidasQtd = feitas.length;
    const percent = total ? (concluidasQtd / total) * 100 : 0;
    const bar = document.getElementById('tarefasProgressBar');
    if (bar) bar.style.width = `${percent}%`;
  }

  function moveTask(desc, direction) {
    const order = ['pendente', 'andamento', 'feito'];
    const current = statusMap[desc] || 'pendente';
    let idx = order.indexOf(current) + direction;
    if (idx < 0) idx = 0;
    if (idx >= order.length) idx = order.length - 1;
    statusMap[desc] = order[idx];
    localStorage.setItem(storageKey, JSON.stringify(statusMap));
    carregarTarefas(uid, isAdmin);
  }

  document.querySelectorAll('#tarefasCard .task-actions button').forEach(btn => {
    btn.addEventListener('click', () => moveTask(btn.dataset.tarefa, parseInt(btn.dataset.move)));
  });

  atualizarProgresso();
}

async function iniciarPainel(user) {
  const uid = user?.uid;
  let isAdmin = false;

  const connected = await checkBackend();
  if (!connected) {
    document.getElementById('offlineNotice')?.classList.remove('hidden');
    return;
  }

  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'usuarios', uid)); // <- aqui era 'uid'
      if (snap.exists()) {
        const perfil = String(snap.data().perfil || '').toLowerCase();
        isAdmin = (perfil === 'adm' || perfil === 'admin');
      } else {
        console.warn(`Documento de usuário ${uid} não encontrado em 'usuarios'`);
      }
    } catch (e) {
      console.error('Erro ao carregar perfil do usuário:', e);
    }
  }

  await Promise.all([
    carregarResumoFaturamento(uid, isAdmin),
    carregarGraficoFaturamento(uid, isAdmin),
    carregarTopSkus(uid, isAdmin),
    carregarTarefas(uid, isAdmin)
  ]);

  const filtroMes = document.getElementById('filtroMesFaturamento');
  if (filtroMes) {
    filtroMes.value = new Date().toISOString().slice(0,7);
    filtroMes.addEventListener('change', () =>
      carregarGraficoFaturamento(uid, isAdmin)
    );
  }

  applyBlurStates();
  maybeStartTour();
}
onAuthStateChanged(auth, user => {
  if (user) iniciarPainel(user);
});

async function carregarGraficoFaturamento(uid, isAdmin) {
  const canvasLinha = document.getElementById('chartFaturamentoMeta');
  if (!canvasLinha || typeof Chart === 'undefined') return;
  const ctxLinha = canvasLinha.getContext('2d');
  const { primary, secondary } = getPalette();

  const filtro = document.getElementById('filtroMesFaturamento');
  const mesFiltro = filtro?.value || new Date().toISOString().slice(0, 7);

  const snap = isAdmin
    ? await getDocs(collectionGroup(db, 'faturamento'))
    : await getDocs(collection(db, `uid/${uid}/faturamento`));

  const dados = [];
  let totalLiquido = 0;

  for (const docSnap of snap.docs) {
    const [ano, mes, dia] = (docSnap.id || '').split('-');
    if (`${ano}-${mes}` !== mesFiltro) continue;

    const ownerUid = isAdmin ? docSnap.ref.parent.parent.id : uid;
    const subRef = collection(db, `uid/${ownerUid}/faturamento/${docSnap.id}/lojas`);
    const subSnap = await getDocs(subRef);

    let liquido = 0;
    for (const s of subSnap.docs) {
      let d = s.data();
      if (d.encrypted) {
        const passFn = typeof window !== 'undefined' ? window.getPassphrase : null;
        const pass = passFn ? await passFn() : null;
        let txt;
        try {
          txt = await decryptString(d.encrypted, pass || ownerUid);
        } catch (e) {
          if (pass) {
            try { txt = await decryptString(d.encrypted, ownerUid); } catch (_) {}
          }
        }
        if (txt) d = JSON.parse(txt);
      }
      liquido += Number(d.valorLiquido) || 0;
    }

    totalLiquido += liquido;
    dados.push({ dia, liquido });
  }

  dados.sort((a, b) => a.dia.localeCompare(b.dia));
  const labels = dados.map(d => d.dia);
  const valores = dados.map(d => d.liquido);

  // Destroy previous chart instance if it exists and supports destroy
  if (window.chartFaturamentoMeta?.destroy)
    window.chartFaturamentoMeta.destroy();
  window.chartFaturamentoMeta = new Chart(ctxLinha, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Líquido',
        data: valores,
        borderColor: primary,
        backgroundColor: hexToRgba(primary, 0.2),
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      plugins: {
        tooltip: { enabled: true },
        legend: { display: false }
      },
      scales: {
        x: { title: { display: true, text: 'Dia' } },
        y: { beginAtZero: true, title: { display: true, text: 'Valor (R$)' } }
      }
    }
  });

  const metaBar = document.getElementById('metaProgressBar');
  const metaText = document.getElementById('metaProgressText');
  let meta = 0;
  if (isAdmin) {
    const metasSnap = await getDocs(collectionGroup(db, 'metasFaturamento'));
    metasSnap.forEach(m => {
      if (m.id === mesFiltro) meta += Number(m.data().valor || 0);
    });
  } else if (uid) {
    const metaDoc = await getDoc(doc(db, `uid/${uid}/metasFaturamento`, mesFiltro));
    if (metaDoc.exists()) meta = Number(metaDoc.data().valor) || 0;
  }
  if (metaBar && metaText) {
    let percent = meta > 0 ? (totalLiquido / meta) * 100 : 0;
    percent = Math.min(100, percent);
    metaBar.style.width = percent + '%';
    metaBar.style.background = percent >= 100 ? 'var(--success)' : 'var(--primary)';
    metaText.textContent = `${percent.toFixed(0)}% da meta alcançada`;
  }
}
