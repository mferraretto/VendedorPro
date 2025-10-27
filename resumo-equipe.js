import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  startAt,
  endAt,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig, getPassphrase } from './firebase-config.js';
import { decryptString } from './crypto.js';
import { carregarUsuariosFinanceiros } from './responsavel-financeiro.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let usuariosVinculados = [];
let currentUser = null;
let carregamentoInicialConcluido = false;

const mainTabButtons = Array.from(document.querySelectorAll('.main-tab-btn'));
const mainTabSections = Array.from(
  document.querySelectorAll('#aba-diario, #aba-vendas, #aba-problemas'),
);

function setActiveMainTab(id) {
  mainTabButtons.forEach((btn) => {
    const ativo = btn.dataset.tab === id;
    btn.classList.toggle('border-indigo-600', ativo);
    btn.classList.toggle('text-indigo-600', ativo);
    btn.classList.toggle('font-medium', ativo);
    btn.classList.toggle('border-transparent', !ativo);
    btn.classList.toggle('text-gray-500', !ativo);
  });
  mainTabSections.forEach((sec) => {
    sec.classList.toggle('hidden', sec.id !== id);
  });
}

mainTabButtons.forEach((btn) =>
  btn.addEventListener('click', () => setActiveMainTab(btn.dataset.tab)),
);
setActiveMainTab('aba-diario');

const dailyUsuarioSelect = document.getElementById('dailyUsuarioSelect');
const dailyPeriodoTipo = document.getElementById('dailyPeriodoTipo');
const dailyDiaInput = document.getElementById('dailyDataDia');
const dailySemanaInput = document.getElementById('dailyDataSemana');
const dailyMesInput = document.getElementById('dailyDataMes');
const dailyDiaWrapper = document.getElementById('dailyPeriodoDiaWrapper');
const dailySemanaWrapper = document.getElementById('dailyPeriodoSemanaWrapper');
const dailyMesWrapper = document.getElementById('dailyPeriodoMesWrapper');
const dailyIntervaloLabel = document.getElementById('dailyIntervaloLabel');
const dailyStatusEl = document.getElementById('dailyStatus');
const dailyCardsContainer = document.getElementById('dailyCardsContainer');
const dailyUsuariosTableBody = document.getElementById(
  'dailyUsuariosTableBody',
);
const dailyDetalhesTableBody = document.getElementById(
  'dailyDetalhesTableBody',
);
const dailyEmptyState = document.getElementById('dailyEmptyState');
const dailyLastUpdate = document.getElementById('dailyLastUpdate');

const salesUsuarioSelect = document.getElementById('salesUsuarioSelect');
const salesPeriodoTipo = document.getElementById('salesPeriodoTipo');
const salesDiaInput = document.getElementById('salesDataDia');
const salesSemanaInput = document.getElementById('salesDataSemana');
const salesMesInput = document.getElementById('salesDataMes');
const salesDiaWrapper = document.getElementById('salesPeriodoDiaWrapper');
const salesSemanaWrapper = document.getElementById('salesPeriodoSemanaWrapper');
const salesMesWrapper = document.getElementById('salesPeriodoMesWrapper');
const salesIntervaloLabel = document.getElementById('salesIntervaloLabel');
const salesStatusEl = document.getElementById('salesStatus');
const salesCardsContainer = document.getElementById('salesCardsContainer');
const salesUsuariosTableBody = document.getElementById(
  'salesUsuariosTableBody',
);
const salesTopSkusTableBody = document.getElementById('salesTopSkusTableBody');
const salesEmptyState = document.getElementById('salesEmptyState');
const salesLastUpdate = document.getElementById('salesLastUpdate');

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatWeekInput(date) {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  const week = String(weekNo).padStart(2, '0');
  return `${target.getUTCFullYear()}-W${week}`;
}

function weekToRange(weekValue) {
  if (!weekValue || !weekValue.includes('-W')) return null;
  const [yearStr, weekStr] = weekValue.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  if (!year || !week) return null;
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const isoStart = new Date(simple);
  if (dow <= 4) {
    isoStart.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  } else {
    isoStart.setUTCDate(simple.getUTCDate() + (8 - dow));
  }
  const isoEnd = new Date(isoStart);
  isoEnd.setUTCDate(isoStart.getUTCDate() + 6);
  return {
    start: formatDateInput(isoStart),
    end: formatDateInput(isoEnd),
  };
}

function monthToRange(monthValue) {
  if (!monthValue || !monthValue.includes('-')) return null;
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return null;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  return {
    start: formatDateInput(startDate),
    end: formatDateInput(endDate),
  };
}

function togglePeriodoInputs(tipo, diaWrapper, semanaWrapper, mesWrapper) {
  diaWrapper.classList.toggle('hidden', tipo !== 'dia');
  semanaWrapper.classList.toggle('hidden', tipo !== 'semana');
  mesWrapper.classList.toggle('hidden', tipo !== 'mes');
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  const parsed = Number(
    String(value)
      .replace(/[^0-9,-.]/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePercent(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num <= 1 && num >= 0) return num * 100;
  return Math.max(0, Math.min(100, num));
}

function formatPercent(value) {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatCurrency(value) {
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateLabel(value) {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return value;
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

async function getDocsWithRange(ref, field, start, end) {
  if (!start && !end) {
    const snap = await getDocs(ref);
    return snap.docs;
  }
  try {
    let q = query(ref, orderBy(field));
    if (start) q = query(q, startAt(start));
    if (end) q = query(q, endAt(end));
    const snap = await getDocs(q);
    return snap.docs;
  } catch (err) {
    console.warn(
      'Consulta por intervalo não suportada, usando filtro local:',
      err,
    );
    const snap = await getDocs(ref);
    return snap.docs.filter((doc) => {
      const dados = doc.data() || {};
      const valor = String(dados[field] || doc.id || '');
      return inRange(valor, start, end);
    });
  }
}

function getUsuariosSelecionados(selectEl) {
  if (!selectEl) return [];
  const valor = selectEl.value;
  if (!valor || valor === 'todos') return usuariosVinculados.slice();
  return usuariosVinculados.filter((u) => u.uid === valor);
}

function getPeriodoSelecionado(tipo, dia, semana, mes) {
  if (tipo === 'semana') {
    const range = weekToRange(semana);
    if (range) {
      return { ...range, label: `Semana ${semana}` };
    }
  }
  if (tipo === 'mes') {
    const range = monthToRange(mes);
    if (range) {
      const [ano, mesNumero] = mes.split('-');
      return {
        ...range,
        label: `Mês ${mesNumero}/${ano}`,
      };
    }
  }
  const data = dia || formatDateInput(new Date());
  return {
    start: data,
    end: data,
    label: `Dia ${formatDateLabel(data)}`,
  };
}

function preencherSelectUsuarios(select) {
  if (!select) return;
  const valorAtual = select.value;
  select.innerHTML =
    '<option value="todos">Todos os usuários vinculados</option>';
  usuariosVinculados
    .slice()
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    .forEach((usuario) => {
      const opt = document.createElement('option');
      opt.value = usuario.uid;
      opt.textContent = usuario.nome || usuario.email || usuario.uid;
      select.appendChild(opt);
    });
  if (valorAtual && valorAtual !== 'todos') {
    const existe = usuariosVinculados.some((u) => u.uid === valorAtual);
    select.value = existe ? valorAtual : 'todos';
  } else {
    select.value = 'todos';
  }
}

async function decryptPayloadIfNeeded(data, uid) {
  if (!data || typeof data !== 'object') return data;
  if (!data.encrypted) return data;
  let passphrase;
  try {
    passphrase = getPassphrase();
  } catch (err) {
    passphrase = null;
  }
  const candidatos = [passphrase, `chave-${uid}`, uid].filter(Boolean);
  for (const candidato of candidatos) {
    try {
      const texto = await decryptString(data.encrypted, candidato);
      if (texto) return JSON.parse(texto);
    } catch (err) {
      // tenta próximo candidato
    }
  }
  return data;
}

async function carregarResumoDiario() {
  if (!dailyStatusEl) return;
  const usuariosSelecionados = getUsuariosSelecionados(dailyUsuarioSelect);
  if (!usuariosSelecionados.length) {
    dailyStatusEl.textContent = 'Nenhum usuário vinculado encontrado.';
    dailyCardsContainer.innerHTML = '';
    dailyUsuariosTableBody.innerHTML = '';
    dailyDetalhesTableBody.innerHTML = '';
    dailyEmptyState?.classList.remove('hidden');
    return;
  }

  const periodo = getPeriodoSelecionado(
    dailyPeriodoTipo?.value || 'dia',
    dailyDiaInput?.value,
    dailySemanaInput?.value,
    dailyMesInput?.value,
  );
  if (dailyIntervaloLabel) dailyIntervaloLabel.textContent = periodo.label;
  dailyStatusEl.textContent = 'Carregando dados do acompanhamento diário...';
  dailyStatusEl.classList.remove('text-green-600');

  const totalizador = {
    registros: 0,
    abertas: 0,
    respondidas: 0,
    encerradas: 0,
    somaPercReclamacoes: 0,
    somaPercMediacao: 0,
    somaPercAtraso: 0,
    somaPercCancelamento: 0,
  };
  const porUsuario = new Map();
  const detalhes = [];

  for (const usuario of usuariosSelecionados) {
    const ref = collection(db, `uid/${usuario.uid}/acompanhamentoDiario`);
    const docs = await getDocsWithRange(
      ref,
      'data',
      periodo.start,
      periodo.end,
    );
    let registrosUsuario = 0;
    let abertas = 0;
    let respondidas = 0;
    let encerradas = 0;
    let percReclamacoes = 0;
    let percMediacao = 0;
    let percAtraso = 0;
    let percCancelamento = 0;

    docs.forEach((docSnap) => {
      const dados = docSnap.data() || {};
      const dataRegistro = String(dados.data || docSnap.id || '');
      if (!inRange(dataRegistro, periodo.start, periodo.end)) return;
      const reclamacoesAbertas = toNumber(dados.reclamacoesAbertas);
      const reclamacoesRespondidas = toNumber(
        dados.reclamacoesRespondidas || dados.reclamacoesRecorridas,
      );
      const reclamacoesEncerradas = toNumber(
        dados.reclamacoesEncerradas || dados.reclamacoesRecusadas,
      );
      const percRec = normalizePercent(dados.porcentagemReclamacoes);
      const percMed = normalizePercent(dados.porcentagemMediacao);
      const percAtr = normalizePercent(dados.porcentagemAtraso);
      const percCan = normalizePercent(dados.porcentagemCancelamento);

      registrosUsuario += 1;
      abertas += reclamacoesAbertas;
      respondidas += reclamacoesRespondidas;
      encerradas += reclamacoesEncerradas;
      percReclamacoes += percRec;
      percMediacao += percMed;
      percAtraso += percAtr;
      percCancelamento += percCan;

      detalhes.push({
        data: dataRegistro,
        usuarioNome: usuario.nome || usuario.email || usuario.uid,
        plataforma: dados.plataforma || '',
        loja: dados.nomeLoja || '',
        abertas: reclamacoesAbertas,
        respondidas: reclamacoesRespondidas,
        encerradas: reclamacoesEncerradas,
        percRec,
        percMed,
        percAtr,
        percCan,
      });
    });

    if (registrosUsuario > 0) {
      porUsuario.set(usuario.uid, {
        usuario,
        registros: registrosUsuario,
        abertas,
        respondidas,
        encerradas,
        percRec: percReclamacoes / registrosUsuario,
        percMed: percMediacao / registrosUsuario,
        percAtr: percAtraso / registrosUsuario,
        percCan: percCancelamento / registrosUsuario,
      });

      totalizador.registros += registrosUsuario;
      totalizador.abertas += abertas;
      totalizador.respondidas += respondidas;
      totalizador.encerradas += encerradas;
      totalizador.somaPercReclamacoes += percReclamacoes;
      totalizador.somaPercMediacao += percMediacao;
      totalizador.somaPercAtraso += percAtraso;
      totalizador.somaPercCancelamento += percCancelamento;
    }
  }

  const registrosCarregados = totalizador.registros;
  if (registrosCarregados === 0) {
    dailyCardsContainer.innerHTML = '';
    dailyUsuariosTableBody.innerHTML = '';
    dailyDetalhesTableBody.innerHTML = '';
    dailyEmptyState?.classList.remove('hidden');
    dailyStatusEl.textContent =
      'Nenhum acompanhamento encontrado para o período.';
    return;
  }

  dailyEmptyState?.classList.add('hidden');
  dailyStatusEl.textContent = `${registrosCarregados} registro${
    registrosCarregados === 1 ? '' : 's'
  } carregado${registrosCarregados === 1 ? '' : 's'}.`;
  dailyStatusEl.classList.add('text-green-600');
  dailyLastUpdate.textContent = `Atualizado em ${new Date().toLocaleString('pt-BR')}`;

  const mediaRec = totalizador.somaPercReclamacoes / registrosCarregados || 0;
  const mediaMed = totalizador.somaPercMediacao / registrosCarregados || 0;
  const mediaAtr = totalizador.somaPercAtraso / registrosCarregados || 0;
  const mediaCan = totalizador.somaPercCancelamento / registrosCarregados || 0;

  dailyCardsContainer.innerHTML = `
    <div class="card p-4 bg-white shadow-sm border border-gray-200">
      <p class="text-xs uppercase text-gray-500">Registros avaliados</p>
      <p class="text-2xl font-semibold text-indigo-600">${registrosCarregados}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-rose-200">
      <p class="text-xs uppercase text-rose-600">Reclamações abertas</p>
      <p class="text-2xl font-semibold text-rose-600">${totalizador.abertas}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-amber-200">
      <p class="text-xs uppercase text-amber-600">Reclamações respondidas</p>
      <p class="text-2xl font-semibold text-amber-600">${totalizador.respondidas}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-emerald-200">
      <p class="text-xs uppercase text-emerald-600">Reclamações encerradas</p>
      <p class="text-2xl font-semibold text-emerald-600">${totalizador.encerradas}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-pink-200">
      <p class="text-xs uppercase text-pink-600">Média % Reclamação</p>
      <p class="text-2xl font-semibold text-pink-600">${formatPercent(mediaRec)}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-purple-200">
      <p class="text-xs uppercase text-purple-600">Média % Mediação</p>
      <p class="text-2xl font-semibold text-purple-600">${formatPercent(mediaMed)}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-sky-200">
      <p class="text-xs uppercase text-sky-600">Média % Atraso</p>
      <p class="text-2xl font-semibold text-sky-600">${formatPercent(mediaAtr)}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-fuchsia-200">
      <p class="text-xs uppercase text-fuchsia-600">Média % Cancelamento</p>
      <p class="text-2xl font-semibold text-fuchsia-600">${formatPercent(mediaCan)}</p>
    </div>
  `;

  const linhasUsuarios = Array.from(porUsuario.values()).sort((a, b) =>
    (a.usuario.nome || '').localeCompare(b.usuario.nome || '', 'pt-BR'),
  );
  dailyUsuariosTableBody.innerHTML = linhasUsuarios
    .map(
      (linha) => `
        <tr>
          <td class="px-4 py-2">${linha.usuario.nome || linha.usuario.email || linha.usuario.uid}</td>
          <td class="px-4 py-2 text-right">${linha.registros}</td>
          <td class="px-4 py-2 text-right">${linha.abertas}</td>
          <td class="px-4 py-2 text-right">${linha.respondidas}</td>
          <td class="px-4 py-2 text-right">${linha.encerradas}</td>
          <td class="px-4 py-2 text-right">${formatPercent(linha.percRec || 0)}</td>
          <td class="px-4 py-2 text-right">${formatPercent(linha.percMed || 0)}</td>
          <td class="px-4 py-2 text-right">${formatPercent(linha.percAtr || 0)}</td>
          <td class="px-4 py-2 text-right">${formatPercent(linha.percCan || 0)}</td>
        </tr>
      `,
    )
    .join('');

  const detalhesOrdenados = detalhes.sort((a, b) => {
    if (a.data === b.data) {
      return (a.usuarioNome || '').localeCompare(b.usuarioNome || '', 'pt-BR');
    }
    return a.data < b.data ? 1 : -1;
  });
  dailyDetalhesTableBody.innerHTML = detalhesOrdenados
    .map(
      (item) => `
        <tr>
          <td class="px-4 py-2">${formatDateLabel(item.data)}</td>
          <td class="px-4 py-2">${item.usuarioNome}</td>
          <td class="px-4 py-2">${item.plataforma || '-'}</td>
          <td class="px-4 py-2">${item.loja || '-'}</td>
          <td class="px-4 py-2 text-right">${item.abertas}</td>
          <td class="px-4 py-2 text-right">${item.respondidas}</td>
          <td class="px-4 py-2 text-right">${item.encerradas}</td>
          <td class="px-4 py-2 text-right">${formatPercent(item.percRec || 0)}</td>
          <td class="px-4 py-2 text-right">${formatPercent(item.percMed || 0)}</td>
          <td class="px-4 py-2 text-right">${formatPercent(item.percAtr || 0)}</td>
          <td class="px-4 py-2 text-right">${formatPercent(item.percCan || 0)}</td>
        </tr>
      `,
    )
    .join('');
}

async function carregarResumoVendas() {
  if (!salesStatusEl) return;
  const usuariosSelecionados = getUsuariosSelecionados(salesUsuarioSelect);
  if (!usuariosSelecionados.length) {
    salesStatusEl.textContent = 'Nenhum usuário vinculado encontrado.';
    salesCardsContainer.innerHTML = '';
    salesUsuariosTableBody.innerHTML = '';
    salesTopSkusTableBody.innerHTML = '';
    salesEmptyState?.classList.remove('hidden');
    return;
  }

  const periodo = getPeriodoSelecionado(
    salesPeriodoTipo?.value || 'dia',
    salesDiaInput?.value,
    salesSemanaInput?.value,
    salesMesInput?.value,
  );
  if (salesIntervaloLabel) salesIntervaloLabel.textContent = periodo.label;
  salesStatusEl.textContent = 'Carregando faturamento e SKUs...';
  salesStatusEl.classList.remove('text-green-600');

  const resultadosUsuarios = [];
  const resumoSkus = new Map();

  for (const usuario of usuariosSelecionados) {
    const faturamentoRef = collection(db, `uid/${usuario.uid}/faturamento`);
    const fatDocs = await getDocsWithRange(
      faturamentoRef,
      '__name__',
      periodo.start,
      periodo.end,
    );

    let totalBruto = 0;
    let totalLiquido = 0;
    let totalQuantidade = 0;
    const diasProcessados = new Set();

    for (const diaDoc of fatDocs) {
      const diaId = diaDoc.id;
      if (!inRange(diaId, periodo.start, periodo.end)) continue;
      const lojasRef = collection(
        db,
        `uid/${usuario.uid}/faturamento/${diaId}/lojas`,
      );
      const lojasSnap = await getDocs(lojasRef);
      let diaBruto = 0;
      let diaLiquido = 0;
      let diaQuantidade = 0;
      for (const lojaDoc of lojasSnap.docs) {
        let dados = lojaDoc.data();
        dados = await decryptPayloadIfNeeded(dados, usuario.uid);
        const bruto = toNumber(dados.valorBruto || dados.bruto || 0);
        const liquido = toNumber(
          dados.valorLiquido ||
            dados.valor ||
            dados.liquido ||
            dados.total ||
            0,
        );
        const quantidade = toNumber(
          dados.quantidade || dados.total || dados.quantidadeVendida || 0,
        );
        diaBruto += bruto;
        diaLiquido += liquido;
        diaQuantidade += quantidade;
      }
      if (diaBruto || diaLiquido || diaQuantidade) {
        diasProcessados.add(diaId);
        totalBruto += diaBruto;
        totalLiquido += diaLiquido;
        totalQuantidade += diaQuantidade;
      }
    }

    const skusRef = collection(db, `uid/${usuario.uid}/skusVendidos`);
    const skusDocs = await getDocsWithRange(
      skusRef,
      '__name__',
      periodo.start,
      periodo.end,
    );
    for (const skuDiaDoc of skusDocs) {
      const dataSku = skuDiaDoc.id;
      if (!inRange(dataSku, periodo.start, periodo.end)) continue;
      const listaRef = collection(
        db,
        `uid/${usuario.uid}/skusVendidos/${dataSku}/lista`,
      );
      const listaSnap = await getDocs(listaRef);
      for (const itemDoc of listaSnap.docs) {
        let dados = itemDoc.data();
        dados = await decryptPayloadIfNeeded(dados, usuario.uid);
        const sku = dados.sku || itemDoc.id;
        if (!sku) continue;
        const quantidade = toNumber(
          dados.total || dados.quantidade || dados.vendas || 0,
        );
        const bruto = toNumber(dados.valorBruto || dados.bruto || 0);
        const liquido = toNumber(
          dados.valorLiquido || dados.liquido || dados.total || 0,
        );
        const sobraMedia = toNumber(dados.sobraMedia ?? dados.sobra ?? 0);
        if (!resumoSkus.has(sku)) {
          resumoSkus.set(sku, {
            quantidade: 0,
            bruto: 0,
            liquido: 0,
            sobraTotal: 0,
            ocorrenciasSobra: 0,
          });
        }
        const info = resumoSkus.get(sku);
        info.quantidade += quantidade;
        info.bruto += bruto;
        info.liquido += liquido;
        if (Number.isFinite(sobraMedia) && sobraMedia !== 0) {
          info.sobraTotal += sobraMedia;
          info.ocorrenciasSobra += 1;
        } else if ('sobraMedia' in dados || 'sobra' in dados) {
          info.ocorrenciasSobra += 1;
        }
      }
    }

    if (diasProcessados.size || totalLiquido || totalBruto) {
      resultadosUsuarios.push({
        usuario,
        bruto: totalBruto,
        liquido: totalLiquido,
        quantidade: totalQuantidade,
        dias: diasProcessados.size,
      });
    }
  }

  if (!resultadosUsuarios.length) {
    salesCardsContainer.innerHTML = '';
    salesUsuariosTableBody.innerHTML = '';
    salesTopSkusTableBody.innerHTML = '';
    salesEmptyState?.classList.remove('hidden');
    salesStatusEl.textContent =
      'Nenhum faturamento encontrado para o período selecionado.';
    return;
  }

  salesEmptyState?.classList.add('hidden');
  salesStatusEl.textContent = `${resultadosUsuarios.length} usuário${
    resultadosUsuarios.length === 1 ? '' : 's'
  } com faturamento carregado.`;
  salesStatusEl.classList.add('text-green-600');
  salesLastUpdate.textContent = `Atualizado em ${new Date().toLocaleString('pt-BR')}`;

  const totalBruto = resultadosUsuarios.reduce(
    (acc, item) => acc + item.bruto,
    0,
  );
  const totalLiquido = resultadosUsuarios.reduce(
    (acc, item) => acc + item.liquido,
    0,
  );
  const totalQuantidade = resultadosUsuarios.reduce(
    (acc, item) => acc + item.quantidade,
    0,
  );
  const usuariosAtivos = resultadosUsuarios.length;
  const ticketMedioGlobal = totalQuantidade
    ? totalLiquido / totalQuantidade
    : 0;

  salesCardsContainer.innerHTML = `
    <div class="card p-4 bg-white shadow-sm border border-indigo-200">
      <p class="text-xs uppercase text-indigo-600">Faturamento bruto</p>
      <p class="text-2xl font-semibold text-indigo-600">${formatCurrency(totalBruto)}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-emerald-200">
      <p class="text-xs uppercase text-emerald-600">Faturamento líquido</p>
      <p class="text-2xl font-semibold text-emerald-600">${formatCurrency(totalLiquido)}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-amber-200">
      <p class="text-xs uppercase text-amber-600">Quantidade vendida</p>
      <p class="text-2xl font-semibold text-amber-600">${totalQuantidade}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-slate-200">
      <p class="text-xs uppercase text-slate-600">Ticket médio líquido</p>
      <p class="text-2xl font-semibold text-slate-700">${formatCurrency(ticketMedioGlobal || 0)}</p>
    </div>
    <div class="card p-4 bg-white shadow-sm border border-sky-200">
      <p class="text-xs uppercase text-sky-600">Usuários com vendas</p>
      <p class="text-2xl font-semibold text-sky-600">${usuariosAtivos}</p>
    </div>
  `;

  const linhasUsuarios = resultadosUsuarios
    .slice()
    .sort((a, b) =>
      (a.usuario.nome || '').localeCompare(b.usuario.nome || '', 'pt-BR'),
    )
    .map((item) => {
      const ticket = item.quantidade ? item.liquido / item.quantidade : 0;
      return `
        <tr>
          <td class="px-4 py-2">${item.usuario.nome || item.usuario.email || item.usuario.uid}</td>
          <td class="px-4 py-2 text-right">${item.dias}</td>
          <td class="px-4 py-2 text-right">${formatCurrency(item.bruto)}</td>
          <td class="px-4 py-2 text-right">${formatCurrency(item.liquido)}</td>
          <td class="px-4 py-2 text-right">${item.quantidade}</td>
          <td class="px-4 py-2 text-right">${formatCurrency(ticket)}</td>
        </tr>
      `;
    })
    .join('');
  salesUsuariosTableBody.innerHTML = linhasUsuarios;

  const topSkus = Array.from(resumoSkus.entries())
    .map(([sku, info]) => {
      const sobraMedia = info.ocorrenciasSobra
        ? info.sobraTotal / info.ocorrenciasSobra
        : 0;
      return {
        sku,
        quantidade: info.quantidade,
        bruto: info.bruto,
        liquido: info.liquido,
        sobraMedia,
      };
    })
    .filter((item) => item.quantidade > 0 || item.liquido > 0 || item.bruto > 0)
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  if (!topSkus.length) {
    salesTopSkusTableBody.innerHTML =
      '<tr><td colspan="5" class="px-4 py-3 text-center text-gray-500">Nenhum SKU registrado no período.</td></tr>';
  } else {
    salesTopSkusTableBody.innerHTML = topSkus
      .map(
        (item) => `
        <tr>
          <td class="px-4 py-2">${item.sku}</td>
          <td class="px-4 py-2 text-right">${item.quantidade}</td>
          <td class="px-4 py-2 text-right">${formatCurrency(item.bruto)}</td>
          <td class="px-4 py-2 text-right">${formatCurrency(item.liquido)}</td>
          <td class="px-4 py-2 text-right">${formatCurrency(item.sobraMedia || 0)}</td>
        </tr>
      `,
      )
      .join('');
  }
}

function inicializarFiltrosPadrao() {
  const hoje = new Date();
  const semana = formatWeekInput(hoje);
  const mes = formatMonthInput(hoje);
  const dia = formatDateInput(hoje);

  if (dailyDiaInput && !dailyDiaInput.value) dailyDiaInput.value = dia;
  if (dailySemanaInput && !dailySemanaInput.value)
    dailySemanaInput.value = semana;
  if (dailyMesInput && !dailyMesInput.value) dailyMesInput.value = mes;

  if (salesDiaInput && !salesDiaInput.value) salesDiaInput.value = dia;
  if (salesSemanaInput && !salesSemanaInput.value)
    salesSemanaInput.value = semana;
  if (salesMesInput && !salesMesInput.value) salesMesInput.value = mes;

  togglePeriodoInputs(
    dailyPeriodoTipo?.value || 'dia',
    dailyDiaWrapper,
    dailySemanaWrapper,
    dailyMesWrapper,
  );
  togglePeriodoInputs(
    salesPeriodoTipo?.value || 'dia',
    salesDiaWrapper,
    salesSemanaWrapper,
    salesMesWrapper,
  );
}

function registrarEventosFiltros() {
  dailyPeriodoTipo?.addEventListener('change', () => {
    togglePeriodoInputs(
      dailyPeriodoTipo.value,
      dailyDiaWrapper,
      dailySemanaWrapper,
      dailyMesWrapper,
    );
    carregarResumoDiario();
  });
  dailyUsuarioSelect?.addEventListener('change', carregarResumoDiario);
  dailyDiaInput?.addEventListener('change', carregarResumoDiario);
  dailySemanaInput?.addEventListener('change', carregarResumoDiario);
  dailyMesInput?.addEventListener('change', carregarResumoDiario);

  salesPeriodoTipo?.addEventListener('change', () => {
    togglePeriodoInputs(
      salesPeriodoTipo.value,
      salesDiaWrapper,
      salesSemanaWrapper,
      salesMesWrapper,
    );
    carregarResumoVendas();
  });
  salesUsuarioSelect?.addEventListener('change', carregarResumoVendas);
  salesDiaInput?.addEventListener('change', carregarResumoVendas);
  salesSemanaInput?.addEventListener('change', carregarResumoVendas);
  salesMesInput?.addEventListener('change', carregarResumoVendas);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  currentUser = user;
  try {
    const resposta = await carregarUsuariosFinanceiros(db, user);
    usuariosVinculados = resposta.usuarios || [];
  } catch (err) {
    console.error(
      'Erro ao carregar usuários vinculados ao gestor financeiro:',
      err,
    );
    usuariosVinculados = [
      {
        uid: user.uid,
        nome: user.displayName || user.email || 'Usuário',
        email: user.email || '',
      },
    ];
  }

  preencherSelectUsuarios(dailyUsuarioSelect);
  preencherSelectUsuarios(salesUsuarioSelect);
  inicializarFiltrosPadrao();
  registrarEventosFiltros();

  await Promise.all([carregarResumoDiario(), carregarResumoVendas()]);
  carregamentoInicialConcluido = true;
});

window.addEventListener('focus', () => {
  if (carregamentoInicialConcluido) {
    carregarResumoDiario();
    carregarResumoVendas();
  }
});
