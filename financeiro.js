import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  startAt,
  endAt,
  startAfter,
  getDocs,
  limit,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig, getPassphrase } from './firebase-config.js';
import { decryptString } from './crypto.js';
import {
  atualizarSaque as atualizarSaqueSvc,
  watchResumoMes as watchResumoMesSvc,
} from './comissoes-service.js';
import { carregarUsuariosFinanceiros } from './responsavel-financeiro.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let usuariosCache = [];
let dadosSaquesExport = [];
let dadosFaturamentoExport = [];
let resumoUsuarios = {};
let kpiUnsubs = [];
let resumoUnsub = null;
let currentUser = null;

const metaPerfilCache = new Map();
let amostragemLoadToken = 0;

function parseMetaValor(meta) {
  if (typeof meta === 'number' && Number.isFinite(meta)) {
    return meta;
  }
  if (typeof meta === 'string') {
    const trimmed = meta.trim();
    if (!trimmed) return 0;
    const sanitized = trimmed.replace(/[R$\s]/g, '');
    let normalized;
    if (sanitized.includes(',')) {
      normalized = sanitized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = sanitized.replace(/\./g, '');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function atualizarMetaCache(uid, valor, possuiMeta) {
  const numero = Number.isFinite(valor) ? valor : 0;
  const resultado = {
    valor: numero,
    possuiMeta: !!possuiMeta && Number.isFinite(valor),
  };
  metaPerfilCache.set(uid, resultado);
  return resultado;
}

async function obterMetaPerfil(uid, { force = false } = {}) {
  if (!uid) return { valor: 0, possuiMeta: false };
  if (!force && metaPerfilCache.has(uid)) {
    return metaPerfilCache.get(uid);
  }
  try {
    const snap = await getDoc(doc(db, 'perfilMentorado', uid));
    if (snap.exists()) {
      const bruto = snap.data()?.metaFaturamentoLiquido;
      if (bruto !== undefined && bruto !== null && bruto !== '') {
        const valor = parseMetaValor(bruto);
        return atualizarMetaCache(uid, valor, true);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar meta de faturamento do perfil:', err);
  }
  return atualizarMetaCache(uid, 0, false);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  currentUser = user;
  try {
    const { usuarios } = await carregarUsuariosFinanceiros(db, user);
    usuariosCache = usuarios;
  } catch (err) {
    console.error('Erro ao verificar acesso financeiro:', err);
    usuariosCache = [{ uid: user.uid, nome: user.displayName || user.email }];
  }
  metaPerfilCache.clear();
  setupFiltros(usuariosCache);
  await carregar();
  initKpiRealtime();
  initKpiVendasDetalhes();
});

function setupFiltros(usuarios) {
  const userSel = document.getElementById('usuarioFiltro');
  const mesSel = document.getElementById('mesFiltro');
  const metaSection = document.getElementById('metaSection');
  const metaInput = document.getElementById('metaValor');
  const salvarMetaBtn = document.getElementById('salvarMeta');
  if (!userSel || !mesSel) return;
  userSel.innerHTML = '';
  const optTodos = document.createElement('option');
  optTodos.value = 'todos';
  optTodos.textContent = 'Todos';
  userSel.appendChild(optTodos);
  usuarios.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.uid;
    opt.textContent = u.nome;
    userSel.appendChild(opt);
  });
  userSel.value = 'todos';
  mesSel.value = formatMes(new Date());

  // A interação com os filtros não precisa mais bloquear a propagação
  // de cliques. Isso evita conflitos com o botão que abre o sidebar
  // em dispositivos móveis.
  document.getElementById('usuarioIcon')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof userSel.showPicker === 'function') {
      userSel.showPicker();
    } else {
      userSel.focus();
    }
  });
  document.getElementById('mesIcon')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof mesSel.showPicker === 'function') {
      mesSel.showPicker();
    } else {
      mesSel.focus();
    }
  });

  async function atualizarMeta() {
    if (!metaSection) return;
    if (userSel.value === 'todos') {
      metaSection.classList.add('hidden');
      if (metaInput) metaInput.value = '';
      return;
    }
    metaSection.classList.remove('hidden');
    if (!metaInput) return;
    const metaInfo = await obterMetaPerfil(userSel.value);
    metaInput.value = metaInfo.possuiMeta ? metaInfo.valor : '';
  }

  userSel.addEventListener('change', () => {
    atualizarMeta();
    atualizarContexto();
    carregar();
  });
  mesSel.addEventListener('change', () => {
    atualizarMeta();
    atualizarContexto();
    carregar();
  });
  if (salvarMetaBtn) salvarMetaBtn.addEventListener('click', salvarMeta);
  atualizarMeta();
  atualizarContexto();
}

async function salvarMeta() {
  const uid = document.getElementById('usuarioFiltro')?.value;
  const input = document.getElementById('metaValor');
  const valor = Number(input?.value || 0);
  if (!uid || uid === 'todos') {
    alert('Selecione um usuário');
    return;
  }
  try {
    const ref = doc(db, 'perfilMentorado', uid);
    await setDoc(ref, { metaFaturamentoLiquido: valor }, { merge: true });
    atualizarMetaCache(uid, valor, true);
    alert('Meta salva com sucesso!');
    await carregar();
    await subscribeKPIs();
  } catch (err) {
    console.error('Erro ao salvar meta:', err);
    alert('Erro ao salvar meta');
  }
}

async function carregar() {
  const mesSel = document.getElementById('mesFiltro');
  let mes = mesSel?.value;
  if (!mes) {
    mes = formatMes(new Date());
    if (mesSel) mesSel.value = mes;
  }
  const uid = document.getElementById('usuarioFiltro')?.value || 'todos';
  const listaUsuarios =
    uid === 'todos'
      ? usuariosCache
      : usuariosCache.filter((u) => u.uid === uid);
  atualizarContexto();
  resumoUsuarios = {};
  listaUsuarios.forEach(
    (u) => (resumoUsuarios[u.uid] = { uid: u.uid, nome: u.nome }),
  );
  await Promise.all([
    carregarSaques(listaUsuarios, mes),
    carregarFaturamentoMeta(listaUsuarios, mes),
    carregarDevolucoes(listaUsuarios, mes),
  ]);
  renderResumoUsuarios(Object.values(resumoUsuarios));
  renderTabelaSaques();
  if (uid !== 'todos') {
    carregarAmostragem(uid).catch((err) =>
      console.error('Falha ao atualizar amostragem:', err),
    );
  } else {
    amostragemLoadToken++;
    renderAmostragemMessage(
      'Selecione um usuário para visualizar a amostragem.',
    );
  }
  if (uid !== 'todos') {
    assistirResumoFinanceiro(uid, mes);
  } else {
    if (resumoUnsub) resumoUnsub();
    const cards = document.getElementById('cardsResumoFinanceiro');
    const texto = document.getElementById('faltasTextoFinanceiro');
    const resumo = document.getElementById('resumoSaquesFinanceiro');
    if (cards) cards.innerHTML = '';
    if (texto) texto.textContent = '';
    if (resumo) resumo.textContent = '';
  }
}

function atualizarContexto() {
  const contextoEl = document.getElementById('contexto');
  const dataEl = document.getElementById('dataAtual');
  const mes = document.getElementById('mesFiltro')?.value;
  const uid = document.getElementById('usuarioFiltro')?.value;
  if (contextoEl) {
    const mesData = mes ? parseMes(mes) : null;
    const mesTxt = mesData
      ? mesData.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : '';
    let usuarioTxt = 'Todos os usuários';
    if (uid && uid !== 'todos') {
      const u = usuariosCache.find((x) => x.uid === uid);
      usuarioTxt = u ? u.nome : uid;
    }
    contextoEl.textContent = `${mesTxt} – ${usuarioTxt}`;
  }
  if (dataEl) {
    dataEl.textContent = `Hoje: ${new Date().toLocaleDateString('pt-BR')}`;
  }
}

function parseDate(str) {
  if (!str) return new Date('');
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    if (str.includes('-') && parts[0].length === 4) {
      return new Date(str);
    }
    const [d, m, y] = parts;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(str);
}

function parseMes(str) {
  const [ano, mes] = (str || '').split('-').map(Number);
  if (!ano || !mes) return new Date('');
  return new Date(ano, mes - 1, 1);
}

function formatMes(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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

function formatCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function renderAmostragemWrapper(content) {
  return `
    <div class="card p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm text-gray-500 uppercase tracking-wide">Amostragem – Top 10 SKUs (15 dias)</h4>
      </div>
      ${content}
    </div>`;
}

function renderAmostragemMessage(message) {
  const container = document.getElementById('amostragemContainer');
  if (!container) return;
  container.innerHTML = renderAmostragemWrapper(
    `<p class="text-sm text-gray-500">${message}</p>`,
  );
}

function renderAmostragemLista(itens) {
  const container = document.getElementById('amostragemContainer');
  if (!container) return;
  if (!Array.isArray(itens) || !itens.length) {
    renderAmostragemMessage('Sem dados de vendas recentes para exibir.');
    return;
  }
  const grid = itens
    .map(
      (item, index) => `
        <div class="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
          <div class="flex items-center justify-between text-xs text-gray-400">
            <span>#${index + 1}</span>
            <span>${item.total} vendas</span>
          </div>
          <div class="mt-2 text-sm font-semibold text-gray-700 break-words">${item.sku}</div>
          <div class="mt-3 text-sm font-bold text-indigo-600">${formatCurrency(item.media)}</div>
          <div class="text-xs text-gray-500">Média sobra real</div>
        </div>`,
    )
    .join('');
  container.innerHTML = renderAmostragemWrapper(
    `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">${grid}</div>`,
  );
}

async function carregarAmostragem(uid) {
  const container = document.getElementById('amostragemContainer');
  if (!container) return;
  const token = ++amostragemLoadToken;
  if (!uid) {
    renderAmostragemMessage(
      'Selecione um usuário para visualizar a amostragem.',
    );
    return;
  }
  renderAmostragemMessage('Carregando amostragem...');
  try {
    const diasRef = collection(db, `uid/${uid}/skusVendidos`);
    const diasSnap = await getDocs(
      query(diasRef, orderBy('data', 'desc'), limit(15)),
    );
    if (token !== amostragemLoadToken) return;
    if (diasSnap.empty) {
      renderAmostragemMessage('Sem dados de vendas recentes para exibir.');
      return;
    }

    const acumulado = new Map();
    const passphrase = getPassphrase();
    for (const diaDoc of diasSnap.docs) {
      const listaRef = collection(
        db,
        `uid/${uid}/skusVendidos/${diaDoc.id}/lista`,
      );
      const listaSnap = await getDocs(listaRef);
      if (token !== amostragemLoadToken) return;
      for (const itemDoc of listaSnap.docs) {
        let dados = itemDoc.data() || {};
        if (dados.encrypted) {
          const candidatos = [passphrase, `chave-${uid}`, uid].filter(Boolean);
          let texto = null;
          for (const chave of candidatos) {
            if (!chave) continue;
            try {
              texto = await decryptString(dados.encrypted, chave);
              if (texto) break;
            } catch (_) {
              // tenta próxima chave
            }
          }
          if (texto) {
            try {
              dados = JSON.parse(texto);
            } catch (_) {
              continue;
            }
          } else {
            continue;
          }
        }
        const sku = dados.sku || itemDoc.id;
        const total = Number(dados.total) || 0;
        const liquido = Number(dados.valorLiquido || dados.valor || 0);
        if (!sku) continue;
        const atual = acumulado.get(sku) || { total: 0, liquido: 0 };
        atual.total += total;
        atual.liquido += liquido;
        acumulado.set(sku, atual);
      }
    }
    if (token !== amostragemLoadToken) return;
    const itensOrdenados = Array.from(acumulado.entries())
      .map(([sku, valores]) => ({
        sku,
        total: valores.total,
        liquido: valores.liquido,
        media: valores.total ? valores.liquido / valores.total : 0,
      }))
      .filter((item) => item.total > 0 || item.liquido > 0)
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.liquido - a.liquido ||
          a.sku.localeCompare(b.sku, 'pt-BR'),
      )
      .slice(0, 10);

    if (!itensOrdenados.length) {
      renderAmostragemMessage('Sem dados de vendas recentes para exibir.');
      return;
    }
    renderAmostragemLista(itensOrdenados);
  } catch (err) {
    console.error('Erro ao carregar amostragem de SKUs:', err);
    if (token !== amostragemLoadToken) return;
    renderAmostragemMessage(
      'Não foi possível carregar a amostragem no momento.',
    );
  }
}

function calcularLiquido(p) {
  const total = toNumber(p.valor || p.total || 0);
  const loja = (p.loja || p.store || '').toLowerCase();
  let taxa = 0;
  if (loja.includes('shopee')) {
    if (Array.isArray(p.itens) && p.itens.length) {
      p.itens.forEach((i) => {
        const v = toNumber(i.valor || i.total || i.preco || i.price || 0);
        const comissao = Math.min(v * 0.22, 100);
        taxa += comissao + 4.0;
      });
    } else {
      const comissao = Math.min(total * 0.22, 100);
      taxa = comissao + 4.0;
    }
  } else if (loja.includes('mercado livre') || loja.includes('mercadolivre')) {
    if (Array.isArray(p.itens) && p.itens.length) {
      p.itens.forEach((i) => {
        const v = toNumber(i.valor || i.total || i.preco || i.price || 0);
        let fixo = 0;
        if (v < 12.5) fixo = v / 2;
        else if (v < 29) fixo = 6.25;
        else if (v < 50) fixo = 6.5;
        else if (v < 79) fixo = 6.75;
        taxa += v * 0.12 + fixo;
      });
    } else {
      const v = total;
      let fixo = 0;
      if (v < 12.5) fixo = v / 2;
      else if (v < 29) fixo = 6.25;
      else if (v < 50) fixo = 6.5;
      else if (v < 79) fixo = 6.75;
      taxa = v * 0.12 + fixo;
    }
  }
  return total - taxa;
}

async function carregarSaques(usuarios, mes) {
  dadosSaquesExport = [];
  for (const usuario of usuarios) {
    let total = 0;
    let totalComissao = 0;
    const detalhes = [];
    try {
      const col = collection(
        db,
        'usuarios',
        usuario.uid,
        'comissoes',
        mes,
        'saques',
      );
      const snap = await getDocs(col);
      snap.forEach((docSnap) => {
        const dados = docSnap.data();
        const valor = Number(dados.valor) || 0;
        const percentual = Number(dados.percentualPago) || 0;
        const comissao = Number(dados.comissaoPaga) || valor * percentual;
        total += valor;
        totalComissao += comissao;
        detalhes.push({
          id: docSnap.id,
          data: (dados.data || '').substring(0, 10),
          dataISO: dados.data || '',
          loja: dados.origem || '-',
          valor,
          percentual,
          comissao,
        });
      });
    } catch (e) {
      console.error('Erro ao carregar saques:', e);
    }
    dadosSaquesExport.push({
      usuario: usuario.nome,
      total,
      comissao: totalComissao,
    });
    resumoUsuarios[usuario.uid].saques = { total, comissao: totalComissao };
    resumoUsuarios[usuario.uid].saquesDetalhes = detalhes;
  }
}

async function carregarFaturamentoMeta(usuarios, mes) {
  dadosFaturamentoExport = [];
  for (const usuario of usuarios) {
    let total = 0;
    let totalBruto = 0;
    const diario = {};

    const colFat = collection(db, `uid/${usuario.uid}/faturamento`);
    let q = colFat;
    if (mes) {
      const inicio = `${mes}-01`;
      const fim = `${mes}-31`;
      q = query(colFat, orderBy('__name__'), startAt(inicio), endAt(fim));
    }
    const snap = await getDocs(q);

    const dias = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const lojasSnap = await getDocs(
          collection(db, `uid/${usuario.uid}/faturamento/${docSnap.id}/lojas`),
        );
        let totalDia = 0;
        let totalDiaBruto = 0;
        for (const lojaDoc of lojasSnap.docs) {
          let dados = lojaDoc.data();
          if (dados.encrypted) {
            const pass = getPassphrase() || `chave-${usuario.uid}`;
            let txt;
            try {
              txt = await decryptString(dados.encrypted, pass);
            } catch (e) {
              try {
                txt = await decryptString(dados.encrypted, usuario.uid);
              } catch (_) {}
            }
            if (txt) dados = JSON.parse(txt);
          }
          totalDia += Number(dados.valorLiquido) || 0;
          totalDiaBruto += Number(dados.valorBruto) || 0;
        }
        return { dia: docSnap.id, totalDia, totalDiaBruto };
      }),
    );

    dias.forEach(({ dia, totalDia, totalDiaBruto }) => {
      total += totalDia;
      totalBruto += totalDiaBruto;
      diario[dia] = totalDia;
    });
    let meta = 0;
    let esperado = 0;
    let diferenca = 0;
    let metaDiaria = 0;
    const { valor: metaPerfil } = await obterMetaPerfil(usuario.uid);
    meta = metaPerfil;
    if (meta && mes) {
      const [ano, mesNum] = mes.split('-').map(Number);
      const totalDias = new Date(ano, mesNum, 0).getDate();
      let diasDecorridos = totalDias;
      const hoje = new Date();
      if (mes === formatMes(hoje)) diasDecorridos = hoje.getDate();
      metaDiaria = meta / totalDias;
      esperado = metaDiaria * diasDecorridos;
      diferenca = total - esperado;
    }
    dadosFaturamentoExport.push({
      usuario: usuario.nome,
      faturado: total,
      meta,
      esperado,
      diferenca,
    });
    resumoUsuarios[usuario.uid].faturamento = {
      faturado: total,
      bruto: totalBruto,
      meta,
      esperado,
      diferenca,
    };
    resumoUsuarios[usuario.uid].faturamentoDetalhes = { diario, metaDiaria };
  }
}

async function carregarDevolucoes(usuarios, mes) {
  for (const usuario of usuarios) {
    const colDev = collection(db, `uid/${usuario.uid}/devolucoes`);
    let q = colDev;
    if (mes) {
      const inicio = `${mes}-01`;
      const fim = `${mes}-31`;
      q = query(colDev, orderBy('__name__'), startAt(inicio), endAt(fim));
    }
    const snap = await getDocs(q);
    let total = 0;
    snap.forEach((docSnap) => {
      const dados = docSnap.data();
      total += Number(dados.quantidade || dados.total || 1);
    });
    resumoUsuarios[usuario.uid].devolucoes = total;
  }
}

async function calcularFaturamentoDiaDetalhado(uid, dia) {
  const lojasSnap = await getDocs(
    collection(db, `uid/${uid}/faturamento/${dia}/lojas`),
  );
  let liquido = 0;
  let bruto = 0;
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
    liquido += Number(dados.valorLiquido) || 0;
    bruto += Number(dados.valorBruto) || 0;
  }
  return { liquido, bruto };
}

async function getFaturamentoRegistrosDia(uid, dia) {
  const lojasSnap = await getDocs(
    collection(db, `uid/${uid}/faturamento/${dia}/lojas`),
  );
  const registros = [];
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
    registros.push({
      loja: lojaDoc.id,
      valorBruto: Number(dados.valorBruto) || 0,
      valorLiquido: Number(dados.valorLiquido) || 0,
    });
  }
  return registros;
}

function initKpiRealtime() {
  const userSel = document.getElementById('usuarioFiltro');
  const mesSel = document.getElementById('mesFiltro');
  if (userSel) userSel.addEventListener('change', subscribeKPIs);
  if (mesSel) mesSel.addEventListener('change', subscribeKPIs);
  subscribeKPIs();
}

function initKpiVendasDetalhes() {
  const btn = document.getElementById('kpiVendasDetalhes');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const uid = document.getElementById('usuarioFiltro')?.value;
    if (!uid || uid === 'todos') {
      alert('Selecione um usuário');
      return;
    }
    const dia = new Date();
    dia.setDate(dia.getDate() - 1);
    const diaStr = dia.toISOString().slice(0, 10);
    const registros = await getFaturamentoRegistrosDia(uid, diaStr);
    if (!registros.length) {
      alert('Sem registros de faturamento no dia anterior');
      return;
    }
    const linhas = registros
      .map(
        (r) =>
          `<tr><td>${r.loja}</td><td>R$ ${r.valorBruto.toLocaleString('pt-BR')}</td><td>R$ ${r.valorLiquido.toLocaleString('pt-BR')}</td></tr>`,
      )
      .join('');
    const tabela = `<table class="data-table w-full text-sm"><thead><tr><th>Loja</th><th>Bruto</th><th>Líquido</th></tr></thead><tbody>${linhas}</tbody></table>`;
    showModal(`Faturamento Diário - ${formatarData(diaStr)}`, tabela);
  });
}

async function subscribeKPIs() {
  kpiUnsubs.forEach((fn) => fn());
  kpiUnsubs = [];
  const uid = document.getElementById('usuarioFiltro')?.value;
  const mes = document.getElementById('mesFiltro')?.value;
  const brutoEl = document.getElementById('kpiVendasBruto');
  const liquidoEl = document.getElementById('kpiVendasLiquido');
  const skusEl = document.getElementById('kpiVendasSkus');
  const metaEl = document.getElementById('kpiMetaAtingida');
  const metaProjEl = document.getElementById('kpiMetaProjection');
  const metaBar = document.getElementById('kpiMetaProgress');
  const metaWrap = document.getElementById('kpiMetaProgressWrapper');
  const metaMulti = document.getElementById('kpiMetaMulti');
  const devEl = document.getElementById('kpiDevolucoes');
  if (!brutoEl || !liquidoEl || !skusEl || !metaEl || !devEl) return;
  if (!uid) {
    brutoEl.textContent = '-';
    liquidoEl.textContent = '-';
    skusEl.textContent = '-';
    metaEl.textContent = '-';
    if (metaProjEl) metaProjEl.textContent = 'Proj: -';
    devEl.textContent = '-';
    return;
  }
  if (uid === 'todos') {
    brutoEl.textContent = '-';
    liquidoEl.textContent = '-';
    skusEl.textContent = '-';
    devEl.textContent = '-';
    if (metaEl && metaProjEl && metaWrap && metaMulti) {
      metaEl.classList.add('hidden');
      metaProjEl.classList.add('hidden');
      metaWrap.classList.add('hidden');
      metaMulti.classList.remove('hidden');
      metaMulti.innerHTML = '';
      for (const u of usuariosCache) {
        const { valor: metaValor } = await obterMetaPerfil(u.uid);
        const fatSnap = await getDocs(
          collection(db, `uid/${u.uid}/faturamento`),
        );
        let totalMes = 0;
        for (const d of fatSnap.docs) {
          if (mes && !d.id.startsWith(mes)) continue;
          const { liquido: totalDia } = await calcularFaturamentoDiaDetalhado(
            u.uid,
            d.id,
          );
          totalMes += totalDia;
        }
        const [ano, mesNum] = mes.split('-').map(Number);
        const totalDias = new Date(ano, mesNum, 0).getDate();
        const hoje = new Date();
        let diasDecorridos = totalDias;
        if (mes === formatMes(hoje)) diasDecorridos = hoje.getDate();
        const mediaDiaria = diasDecorridos ? totalMes / diasDecorridos : 0;
        const projTotal = mediaDiaria * totalDias;
        const prog = metaValor
          ? Math.min(100, (totalMes / metaValor) * 100)
          : 0;
        const projPerc = metaValor ? (projTotal / metaValor) * 100 : 0;
        const color =
          prog >= 100
            ? 'text-green-600'
            : prog >= 50
              ? 'text-yellow-500'
              : 'text-red-600';
        const item = document.createElement('div');
        item.innerHTML = `\n          <div class="text-sm font-medium">${u.nome}</div>\n          <div class="flex items-baseline gap-2">\n            <span class="text-2xl font-bold ${color}">${metaValor ? prog.toFixed(1) : '0'}%</span>\n            <span class="text-xs text-gray-500">Proj: ${metaValor ? projPerc.toFixed(1) : '0'}%</span>\n          </div>\n          <div class="progress mt-1 ${color}">\n            <div class="progress-bar" style="width:${prog.toFixed(0)}%"></div>\n          </div>`;
        metaMulti.appendChild(item);
      }
    }
    return;
  }
  if (metaEl && metaProjEl && metaWrap && metaMulti) {
    metaEl.classList.remove('hidden');
    metaProjEl.classList.remove('hidden');
    metaWrap.classList.remove('hidden');
    metaMulti.classList.add('hidden');
    metaMulti.innerHTML = '';
  }
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const diaAnterior = ontem.toISOString().slice(0, 10);
  let metaValor = 0;
  const metaRef = doc(db, 'perfilMentorado', uid);
  const unsubMeta = onSnapshot(metaRef, (snap) => {
    if (snap.exists()) {
      const bruto = snap.data()?.metaFaturamentoLiquido;
      if (bruto !== undefined && bruto !== null && bruto !== '') {
        const valor = parseMetaValor(bruto);
        const possuiMeta = Number.isFinite(valor);
        metaValor = possuiMeta ? valor : 0;
        atualizarMetaCache(uid, valor, possuiMeta);
        return;
      }
    }
    metaValor = 0;
    atualizarMetaCache(uid, 0, false);
  });
  kpiUnsubs.push(unsubMeta);

  const faturamentoRef = collection(db, `uid/${uid}/faturamento`);
  const unsubFat = onSnapshot(faturamentoRef, async (snap) => {
    let totalMes = 0;
    let vendasLiquido = 0;
    let vendasBruto = 0;
    for (const d of snap.docs) {
      const { liquido: totalDia, bruto: brutoDia } =
        await calcularFaturamentoDiaDetalhado(uid, d.id);
      if (d.id === diaAnterior) {
        vendasLiquido = totalDia;
        vendasBruto = brutoDia;
      }
      if (mes && !d.id.startsWith(mes)) continue;
      totalMes += totalDia;
    }
    brutoEl.textContent = `R$ ${vendasBruto.toLocaleString('pt-BR')}`;
    liquidoEl.textContent = `R$ ${vendasLiquido.toLocaleString('pt-BR')}`;
    const prog = metaValor ? Math.min(100, (totalMes / metaValor) * 100) : 0;
    const [ano, mesNum] = mes.split('-').map(Number);
    const totalDias = new Date(ano, mesNum, 0).getDate();
    const hoje = new Date();
    let diasDecorridos = totalDias;
    if (mes === formatMes(hoje)) diasDecorridos = hoje.getDate();
    const mediaDiaria = diasDecorridos ? totalMes / diasDecorridos : 0;
    const projTotal = mediaDiaria * totalDias;
    const projPerc = metaValor ? (projTotal / metaValor) * 100 : 0;
    metaEl.textContent = metaValor ? `${prog.toFixed(1)}%` : '0%';
    if (metaProjEl)
      metaProjEl.textContent = metaValor
        ? `Proj: ${projPerc.toFixed(1)}%`
        : 'Proj: 0%';
    if (metaBar && metaWrap) {
      metaBar.style.width = `${prog.toFixed(0)}%`;
      metaWrap.classList.remove(
        'text-green-600',
        'text-yellow-500',
        'text-red-600',
      );
      metaEl.classList.remove(
        'text-green-600',
        'text-yellow-500',
        'text-red-600',
      );
      if (prog >= 100) {
        metaWrap.classList.add('text-green-600');
        metaEl.classList.add('text-green-600');
      } else if (prog >= 50) {
        metaWrap.classList.add('text-yellow-500');
        metaEl.classList.add('text-yellow-500');
      } else {
        metaWrap.classList.add('text-red-600');
        metaEl.classList.add('text-red-600');
      }
    }
  });
  kpiUnsubs.push(unsubFat);

  const skusRef = collection(
    db,
    `uid/${uid}/skusVendidos/${diaAnterior}/lista`,
  );
  const unsubSkus = onSnapshot(skusRef, (snap) => {
    let totalSkus = 0;
    snap.forEach((item) => {
      const dados = item.data();
      totalSkus += Number(dados.total || dados.quantidade) || 0;
    });
    skusEl.textContent = totalSkus;
  });
  kpiUnsubs.push(unsubSkus);

  const devolucoesRef = collection(db, `uid/${uid}/devolucoes`);
  const unsubDev = onSnapshot(devolucoesRef, (snap) => {
    const hoje = new Date().toISOString().slice(0, 10);
    let qtd = 0;
    snap.forEach((docSnap) => {
      if (docSnap.id.includes(hoje)) {
        const dados = docSnap.data();
        qtd += Number(dados.quantidade || dados.total || 1);
      }
    });
    devEl.textContent = qtd;
  });
  kpiUnsubs.push(unsubDev);
}

function renderResumoUsuarios(lista) {
  const container = document.getElementById('cardsContainer');
  const overview = document.getElementById('overviewCards');
  if (!container || !overview) return;
  container.innerHTML = '';
  overview.innerHTML = '';

  const totalBruto = lista.reduce((s, u) => s + (u.faturamento?.bruto || 0), 0);
  const totalLiquido = lista.reduce(
    (s, u) => s + (u.faturamento?.faturado || 0),
    0,
  );
  const metaTotal = lista.reduce((s, u) => s + (u.faturamento?.meta || 0), 0);
  const devolTotal = lista.reduce((s, u) => s + (u.devolucoes || 0), 0);
  const perc = metaTotal ? (totalLiquido / metaTotal) * 100 : 0;
  const percColor =
    perc >= 100
      ? 'text-green-600'
      : perc >= 50
        ? 'text-yellow-500'
        : 'text-red-600';

  overview.innerHTML = `
    <div class="card p-4 flex items-center gap-2 text-green-600"><i class="fa fa-money-bill text-2xl"></i><div><div class="text-sm text-gray-500">Total Faturado</div><div class="text-xl font-bold">R$ ${totalBruto.toLocaleString('pt-BR')}</div></div></div>
    <div class="card p-4 flex items-center gap-2 text-green-600"><i class="fa fa-wallet text-2xl"></i><div><div class="text-sm text-gray-500">Total Líquido</div><div class="text-xl font-bold">R$ ${totalLiquido.toLocaleString('pt-BR')}</div></div></div>
    <div class="card p-4 flex items-center gap-2"><i class="fa fa-bullseye text-blue-600 text-2xl"></i><div><div class="text-sm text-gray-500">Meta Mensal</div><div class="text-xl font-bold">R$ ${metaTotal.toLocaleString('pt-BR')}</div></div></div>
    <div class="card p-4 flex items-center gap-2 ${percColor}"><i class="fa fa-chart-line text-2xl"></i><div><div class="text-sm text-gray-500">% da Meta</div><div class="text-xl font-bold">${perc.toFixed(1)}%</div></div></div>
    <div class="card p-4 flex items-center gap-2 text-orange-500"><i class="fa fa-undo text-2xl"></i><div><div class="text-sm text-gray-500">Devoluções</div><div class="text-xl font-bold">${devolTotal}</div></div></div>`;

  const grid = document.createElement('div');
  grid.className =
    'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
  lista.forEach((u) => grid.appendChild(createResumoCard(u)));
  container.appendChild(grid);
}

function createResumoCard(u) {
  const progresso = u.faturamento?.meta
    ? Math.min(100, (u.faturamento.faturado / u.faturamento.meta) * 100)
    : 0;
  const statusColor =
    progresso >= 100
      ? 'text-green-600'
      : progresso >= 50
        ? 'text-yellow-500'
        : 'text-red-600';
  const card = document.createElement('div');
  card.className = 'card p-4 flex flex-col gap-2';
  card.innerHTML = `
    <h3 class="font-bold">${u.nome} – ${progresso.toFixed(0)}% da meta</h3>
    <div class="text-sm">Faturado: R$ ${(u.faturamento?.faturado || 0).toLocaleString('pt-BR')}</div>
    <div class="text-sm">Saques: R$ ${(u.saques?.total || 0).toLocaleString('pt-BR')}</div>
    <div class="text-sm">Comissão: R$ ${(u.saques?.comissao || 0).toLocaleString('pt-BR')}</div>
    <div class="progress ${statusColor}"><div class="progress-bar" style="width:${progresso.toFixed(0)}%"></div></div>`;
  return card;
}

function renderTabelaSaques() {
  const uid = document.getElementById('usuarioFiltro')?.value;
  const section = document.getElementById('saquesGestor');
  const tbody = document.getElementById('tbodySaquesFinanceiro');
  const resumo = document.getElementById('resumoSaquesFinanceiro');
  const chkAll = document.getElementById('chkSaquesFinanceiro');
  if (!section || !tbody || !resumo || !chkAll) return;
  if (!uid || uid === 'todos') {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  const dados = resumoUsuarios[uid]?.saquesDetalhes || [];
  dados.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  tbody.innerHTML = '';
  chkAll.checked = false;
  dados.forEach((s) => {
    const pago = (s.percentual || 0) > 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-2"><input type="checkbox" class="chk-saque-fin" data-id="${s.id}"></td>
      <td class="px-4 py-2">${s.data || ''}</td>
      <td class="px-4 py-2">${s.loja || ''}</td>
      <td class="px-4 py-2 text-right">R$ ${s.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="px-4 py-2 text-right">${(s.percentual * 100).toFixed(0)}%</td>
      <td class="px-4 py-2 text-right">R$ ${s.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="px-4 py-2 text-center ${pago ? 'text-green-600' : 'text-red-600'}">${pago ? 'PAGO' : 'A PAGAR'}</td>`;
    tbody.appendChild(tr);
  });
  resumo.textContent = '';
}

function assistirResumoFinanceiro(uid, anoMes) {
  if (resumoUnsub) resumoUnsub();
  resumoUnsub = watchResumoMesSvc({
    db,
    uid,
    anoMes,
    onChange: (r) => {
      const cards = document.getElementById('cardsResumoFinanceiro');
      const texto = document.getElementById('faltasTextoFinanceiro');
      const resumo = document.getElementById('resumoSaquesFinanceiro');
      if (!cards || !texto || !resumo) return;
      if (!r) {
        cards.innerHTML = '<p class="text-gray-500">Sem dados</p>';
        texto.textContent = '';
        resumo.textContent = '';
        return;
      }
      cards.innerHTML = `
        <div>
          <div class="text-sm text-gray-500">Total sacado</div>
          <div class="text-xl font-bold">R$ ${r.totalSacado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div>
          <div class="text-sm text-gray-500">Total comissão</div>
          <div class="text-xl font-bold">R$ ${(r.comissaoPrevista || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="text-sm text-gray-500">${(r.taxaFinal * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div class="text-sm text-gray-500">Total comissão paga</div>
          <div class="text-xl font-bold">R$ ${(r.comissaoRecebida || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div>
          <div class="text-sm text-gray-500">Total comissão falta pagar</div>
          <div class="text-xl font-bold">R$ ${((r.comissaoPrevista || 0) - (r.comissaoRecebida || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      `;
      texto.textContent = `Faltam R$${r.faltamPara4.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para 4% | R$${r.faltamPara5.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para 5%`;
      resumo.textContent =
        `Total Saque: R$ ${r.totalSacado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ` +
        `Total Comissão: R$ ${(r.comissaoPrevista || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ` +
        `Total já pago: R$ ${(r.comissaoRecebida || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ` +
        `Total a pagar: R$ ${((r.comissaoPrevista || 0) - (r.comissaoRecebida || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
  });
}

async function marcarSaquesSelecionados() {
  const uid = document.getElementById('usuarioFiltro')?.value;
  const mes = document.getElementById('mesFiltro')?.value;
  const perc = parseFloat(
    document.getElementById('percentualMarcar')?.value || '0',
  );
  if (!uid || uid === 'todos' || !mes) return;
  const checks = Array.from(
    document.querySelectorAll('.chk-saque-fin:checked'),
  );
  for (const chk of checks) {
    const id = chk.dataset.id;
    const dados = (resumoUsuarios[uid]?.saquesDetalhes || []).find(
      (s) => s.id === id,
    );
    if (!dados) continue;
    await atualizarSaqueSvc({
      db,
      uid,
      anoMes: mes,
      saqueId: id,
      dataISO: dados.dataISO,
      valor: dados.valor,
      percentualPago: perc,
      origem: dados.loja,
    });
  }
  await carregar();
}

function formatarData(str) {
  // Evita problemas de fuso horário ao converter datas (ex.: "2024-05-01"
  // sendo interpretado como 30/04 em localidades UTC-3). Quando a string
  // está no formato YYYY-MM-DD construímos a data utilizando o construtor
  // `new Date(ano, mesIndex, dia)` que considera o fuso local sem deslocar
  // para UTC.
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(str);
  if (match) {
    const [_, a, m, d] = match;
    const data = new Date(Number(a), Number(m) - 1, Number(d));
    return data.toLocaleDateString('pt-BR');
  }
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('pt-BR');
}

function showModal(titulo, corpo) {
  let modal = document.getElementById('detalhesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'detalhesModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3 id="detalhesTitulo" class="text-xl font-bold mb-4"></h3>
        <div id="detalhesCorpo" class="space-y-2"></div>
        <div class="mt-4 text-right">
          <button id="detalhesFechar" class="btn btn-primary">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
    modal
      .querySelector('#detalhesFechar')
      .addEventListener('click', () => (modal.style.display = 'none'));
  }
  modal.querySelector('#detalhesTitulo').textContent = titulo;
  modal.querySelector('#detalhesCorpo').innerHTML = corpo;
  modal.style.display = 'flex';
}

function exportarSaques() {
  if (!dadosSaquesExport.length) {
    alert('Sem dados para exportar');
    return;
  }
  exportarCSV(dadosSaquesExport, ['usuario', 'total', 'comissao'], 'saques');
}

function exportarFaturamento() {
  if (!dadosFaturamentoExport.length) {
    alert('Sem dados para exportar');
    return;
  }
  exportarCSV(
    dadosFaturamentoExport,
    ['usuario', 'faturado', 'meta', 'esperado', 'diferenca'],
    'faturamento_meta',
  );
}

function exportarCSV(dados, campos, nome) {
  const linhas = [campos.join(';')];
  dados.forEach((l) => {
    linhas.push(campos.map((c) => l[c]).join(';'));
  });
  const csv = linhas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document
  .getElementById('btnMarcarPago')
  ?.addEventListener('click', marcarSaquesSelecionados);
document
  .getElementById('chkSaquesFinanceiro')
  ?.addEventListener('change', (e) => {
    document
      .querySelectorAll('.chk-saque-fin')
      .forEach((ch) => (ch.checked = e.target.checked));
  });

// PWA install handling
if ('serviceWorker' in navigator) {
  // Use a relative path so GitHub Pages serves the correct file when hosted in a subdirectory
  navigator.serviceWorker
    .register('service-worker.js')
    .catch((err) => console.error('SW registration failed', err));
}

let deferredPrompt;
const installBtn = document.getElementById('installAppBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove('hidden');
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});
