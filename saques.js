import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import {
  registrarSaque as registrarSaqueSvc,
  deletarSaque as deletarSaqueSvc,
  atualizarSaque as atualizarSaqueSvc,
  fecharMes as fecharMesSvc,
  watchResumoMes as watchResumoMesSvc,
  registrarComissaoRecebida as registrarComissaoRecebidaSvc,
  obterConfiguracaoComissoes as obterConfiguracaoComissoesSvc,
  salvarPercentualPadrao as salvarPercentualPadraoSvc,
  PERCENTUAIS_COMISSAO,
} from './comissoes-service.js';
import {
  anoMesBR,
  calcularResumo,
  taxaFinalPorTotal,
} from './comissoes-utils.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let uidAtual = null;
let nomeUsuarioAtual = '';
let unsubscribeResumo = null;
let editandoId = null;
let saquesCache = {};
let selecionados = new Set();
const VALOR_TODAS_LOJAS = '__todas__';
const VALOR_SEM_LOJA = '__sem_loja__';
let filtroLojaAtual = VALOR_TODAS_LOJAS;
let listaSaques = [];
let listaSaquesFiltrada = [];
let percentualPadrao = null;
let mensagemPercentualPadraoTimeout = null;
let resumoMesAtual = null;
let statusCobrancaTimeout = null;

function mensagemPadraoBase() {
  if (percentualPadrao === null) {
    return 'Sem padrão definido. O cálculo atual será utilizado.';
  }
  const percentual = (percentualPadrao * 100).toFixed(0);
  return `Padrão atual: ${percentual}% aplicado automaticamente.`;
}

function atualizarMensagemPadrao(mensagemTemporaria = null) {
  const statusEl = document.getElementById('percentualPadraoStatus');
  if (!statusEl) return;
  if (mensagemPercentualPadraoTimeout) {
    clearTimeout(mensagemPercentualPadraoTimeout);
    mensagemPercentualPadraoTimeout = null;
  }
  if (mensagemTemporaria) {
    statusEl.textContent = mensagemTemporaria;
    mensagemPercentualPadraoTimeout = window.setTimeout(() => {
      statusEl.textContent = mensagemPadraoBase();
    }, 4000);
  } else {
    statusEl.textContent = mensagemPadraoBase();
  }
}

function atualizarSelectPadrao() {
  const select = document.getElementById('percentualPadraoSaque');
  if (!select) return;
  const valor = percentualPadrao === null ? '' : String(percentualPadrao);
  if (Array.from(select.options).some((opt) => opt.value === valor)) {
    select.value = valor;
  }
}

function atualizarSelectCobranca() {
  const select = document.getElementById('percentualCobranca');
  if (!select) return;
  const opcaoAuto = select.querySelector('option[value="auto"]');
  if (opcaoAuto) {
    if (percentualPadrao !== null) {
      opcaoAuto.textContent = `${(percentualPadrao * 100).toFixed(0)}% (usar padrão)`;
    } else {
      opcaoAuto.textContent = 'Automático (por faixa de faturamento)';
    }
  }
  const valoresPermitidos = new Set(['auto', '0', '0.03', '0.04', '0.05']);
  if (!valoresPermitidos.has(select.value)) {
    select.value = 'auto';
  }
}

function aplicarPercentualPadrao() {
  if (editandoId) return;
  const select = document.getElementById('percentualSaque');
  if (!select) return;
  const valor = percentualPadrao === null ? null : String(percentualPadrao);
  const valores = Array.from(select.options).map((opt) => opt.value);
  if (valor !== null && valores.includes(valor)) {
    select.value = valor;
  } else if (valores.includes('0')) {
    select.value = '0';
  } else if (select.options.length > 0) {
    select.selectedIndex = 0;
  }
}

function atualizarStatusCobranca(mensagem = '', tipo = 'info') {
  const statusEl = document.getElementById('statusCobranca');
  if (!statusEl) return;
  statusEl.textContent = mensagem;
  statusEl.classList.remove(
    'text-emerald-600',
    'text-rose-600',
    'text-slate-500',
  );
  statusEl.classList.add('text-xs');
  if (!mensagem) {
    statusEl.classList.add('text-slate-500');
  } else if (tipo === 'sucesso') {
    statusEl.classList.add('text-emerald-600');
  } else if (tipo === 'erro') {
    statusEl.classList.add('text-rose-600');
  } else {
    statusEl.classList.add('text-slate-500');
  }
  if (statusCobrancaTimeout) {
    clearTimeout(statusCobrancaTimeout);
    statusCobrancaTimeout = null;
  }
  if (mensagem) {
    statusCobrancaTimeout = window.setTimeout(() => {
      statusEl.textContent = '';
      statusEl.classList.remove('text-emerald-600', 'text-rose-600');
      statusEl.classList.add('text-slate-500');
    }, 6000);
  }
}

function renderResumoCards() {
  const cardsResumo = document.getElementById('cardsResumo');
  const faltasTexto = document.getElementById('faltasTexto');
  if (!cardsResumo || !faltasTexto) return;

  if (!resumoMesAtual) {
    cardsResumo.innerHTML = '<p class="text-slate-500">Sem dados</p>';
    faltasTexto.textContent = '';
    return;
  }

  const totalSacado = Number(resumoMesAtual.totalSacado) || 0;
  const taxaFinalOriginal = Number(resumoMesAtual.taxaFinal) || 0;
  const comissaoPrevistaOriginal =
    Number(resumoMesAtual.comissaoPrevista) || totalSacado * taxaFinalOriginal;
  const comissaoRecebida = Number(resumoMesAtual.comissaoRecebida) || 0;

  const taxaAplicada =
    percentualPadrao !== null ? percentualPadrao : taxaFinalOriginal;
  const comissaoPrevista =
    percentualPadrao !== null
      ? totalSacado * percentualPadrao
      : comissaoPrevistaOriginal;
  const faltaPagar = Math.max(0, comissaoPrevista - comissaoRecebida);

  cardsResumo.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">Total Saques</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">R$ ${totalSacado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="mt-1 text-xs text-slate-500">Mês atual</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">% Comissão</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">${(taxaAplicada * 100).toFixed(0)}%</div>
          <div class="mt-1 text-xs text-slate-500">Padrão</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">Comissão Paga</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">R$ ${comissaoRecebida.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="mt-1 text-xs text-slate-500">Até agora</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">Falta Pagar</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">R$ ${faltaPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="mt-1 text-xs text-slate-500">Estimado</div>
        </div>
      `;

  const faltamPara4 =
    Number(resumoMesAtual.faltamPara4) || Math.max(0, 150000 - totalSacado);
  const faltamPara5 =
    Number(resumoMesAtual.faltamPara5) || Math.max(0, 250000 - totalSacado);
  faltasTexto.textContent = `Faltam R$${faltamPara4.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} para 4% | R$${faltamPara5.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} para 5%`;
}

async function carregarConfiguracaoPercentualPadrao() {
  if (!uidAtual) {
    percentualPadrao = null;
    atualizarSelectPadrao();
    aplicarPercentualPadrao();
    atualizarSelectCobranca();
    atualizarMensagemPadrao();
    return;
  }
  try {
    const config = await obterConfiguracaoComissoesSvc({
      db,
      uid: uidAtual,
    });
    let padrao = config?.percentualPadrao;
    if (typeof padrao === 'string' && padrao.trim() !== '') {
      const convertido = Number(padrao);
      padrao = Number.isNaN(convertido) ? null : convertido;
    }
    if (typeof padrao === 'number' && PERCENTUAIS_COMISSAO.includes(padrao)) {
      percentualPadrao = padrao;
    } else {
      percentualPadrao = null;
    }
  } catch (err) {
    console.error('Erro ao carregar configuração de comissão padrão', err);
    percentualPadrao = null;
  }
  atualizarSelectPadrao();
  aplicarPercentualPadrao();
  atualizarSelectCobranca();
  atualizarMensagemPadrao();
  if (resumoMesAtual) {
    renderResumoCards();
  }
}

async function salvarPercentualPadraoUsuario() {
  if (!uidAtual) {
    atualizarMensagemPadrao(
      'É necessário estar autenticado para salvar o padrão.',
    );
    return;
  }
  const select = document.getElementById('percentualPadraoSaque');
  const botao = document.getElementById('btnSalvarPercentualPadrao');
  if (!select || !botao) return;

  const valor = select.value;
  let novoPadrao = null;
  if (valor !== '') {
    const convertido = Number(valor);
    if (
      !Number.isFinite(convertido) ||
      !PERCENTUAIS_COMISSAO.includes(convertido)
    ) {
      atualizarMensagemPadrao('Selecione um percentual válido.');
      return;
    }
    novoPadrao = convertido;
  }

  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    await salvarPercentualPadraoSvc({
      db,
      uid: uidAtual,
      percentualPadrao: novoPadrao,
    });
    percentualPadrao = novoPadrao;
    aplicarPercentualPadrao();
    atualizarSelectCobranca();
    atualizarMensagemPadrao('Padrão atualizado com sucesso.');
    if (resumoMesAtual) {
      renderResumoCards();
    }
  } catch (err) {
    console.error('Erro ao salvar padrão de comissão', err);
    atualizarMensagemPadrao(
      'Não foi possível salvar o padrão. Tente novamente.',
    );
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }

  atualizarSelectPadrao();
}

atualizarMensagemPadrao();

function getFiltroMesInicio() {
  return document.getElementById('filtroMesInicio');
}

function getFiltroMesFim() {
  return document.getElementById('filtroMesFim');
}

function mesStringValida(valor) {
  return typeof valor === 'string' && /^\d{4}-\d{2}$/.test(valor);
}

function normalizarIntervaloMeses() {
  const inicioInput = getFiltroMesInicio();
  const fimInput = getFiltroMesFim();
  const padrao = anoMesBR();

  let inicio = padrao;
  if (inicioInput) {
    inicio = mesStringValida(inicioInput.value) ? inicioInput.value : padrao;
    inicioInput.value = inicio;
  }

  let fim = inicio;
  if (fimInput) {
    fim = mesStringValida(fimInput.value) ? fimInput.value : inicio;
    if (fim < inicio) fim = inicio;
    fimInput.value = fim;
  }

  return { inicio, fim };
}

function obterMesesSelecionados() {
  const { inicio, fim } = normalizarIntervaloMeses();
  const meses = [];

  let [anoAtual, mesAtual] = inicio
    .split('-')
    .map((parte) => parseInt(parte, 10));
  const [anoFim, mesFim] = fim.split('-').map((parte) => parseInt(parte, 10));

  if (Number.isNaN(anoAtual) || Number.isNaN(mesAtual)) {
    return [anoMesBR()];
  }

  while (anoAtual < anoFim || (anoAtual === anoFim && mesAtual <= mesFim)) {
    const mesStr = String(mesAtual).padStart(2, '0');
    meses.push(`${anoAtual}-${mesStr}`);
    mesAtual += 1;
    if (mesAtual > 12) {
      mesAtual = 1;
      anoAtual += 1;
    }
  }

  return meses.length > 0 ? meses : [anoMesBR()];
}

function obterMesPrincipal() {
  const meses = obterMesesSelecionados();
  return meses[0] || anoMesBR();
}

const filtroLojaSelect = document.getElementById('filtroLoja');
if (filtroLojaSelect) {
  filtroLojaSelect.addEventListener('change', (event) => {
    filtroLojaAtual = event.target.value;
    selecionados.clear();
    atualizarResumoSelecionados();
    renderSaques();
  });
}

function valorPadraoLoja(origem) {
  if (typeof origem === 'string' && origem.trim()) {
    return origem.trim();
  }
  return VALOR_SEM_LOJA;
}

function labelParaLoja(valor) {
  return valor === VALOR_SEM_LOJA ? 'Sem loja cadastrada' : valor;
}

function atualizarCheckboxTodos() {
  const master = document.getElementById('checkboxSelecionarTodos');
  if (!master) return;
  if (listaSaquesFiltrada.length === 0) {
    master.checked = false;
    master.indeterminate = false;
    return;
  }
  const selecionadosVisiveis = listaSaquesFiltrada.filter((s) =>
    selecionados.has(s.id),
  ).length;
  master.checked =
    selecionadosVisiveis > 0 &&
    selecionadosVisiveis === listaSaquesFiltrada.length;
  master.indeterminate =
    selecionadosVisiveis > 0 &&
    selecionadosVisiveis < listaSaquesFiltrada.length;
}

function atualizarFiltroLojas() {
  if (!filtroLojaSelect) return;
  const valorAnterior = filtroLojaAtual;
  const lojas = Array.from(
    new Set(listaSaques.map((s) => valorPadraoLoja(s.origem))),
  ).sort((a, b) => labelParaLoja(a).localeCompare(labelParaLoja(b), 'pt-BR'));

  filtroLojaSelect.innerHTML = `<option value="${VALOR_TODAS_LOJAS}">Todas as lojas</option>`;
  lojas.forEach((valor) => {
    const option = document.createElement('option');
    option.value = valor;
    option.textContent = labelParaLoja(valor);
    filtroLojaSelect.appendChild(option);
  });

  if (valorAnterior !== VALOR_TODAS_LOJAS && !lojas.includes(valorAnterior)) {
    filtroLojaAtual = VALOR_TODAS_LOJAS;
  }
  filtroLojaSelect.value = filtroLojaAtual;
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  uidAtual = user.uid;
  nomeUsuarioAtual = (user.displayName || user.email || '').trim();
  const titulo = document.getElementById('tituloVendedor');
  if (titulo) {
    titulo.textContent = (user.displayName || 'VENDEDOR').toUpperCase();
  }
  const mesAtual = anoMesBR();
  const inicioInput = getFiltroMesInicio();
  const fimInput = getFiltroMesFim();
  if (inicioInput && !mesStringValida(inicioInput.value)) {
    inicioInput.value = mesAtual;
  }
  if (fimInput && !mesStringValida(fimInput.value)) {
    fimInput.value = inicioInput ? inicioInput.value : mesAtual;
  }
  const onMudancaMes = () => {
    carregarSaques();
    assistirResumo();
  };
  inicioInput?.addEventListener('change', onMudancaMes);
  fimInput?.addEventListener('change', onMudancaMes);
  (async () => {
    await carregarConfiguracaoPercentualPadrao();
    normalizarIntervaloMeses();
    carregarSaques();
    assistirResumo();
  })();
});

export async function registrarSaque() {
  const dataISO = document.getElementById('dataSaque').value;
  const valor = parseFloat(document.getElementById('valorSaque').value);
  const percentual = parseFloat(
    document.getElementById('percentualSaque').value,
  );
  const origem = document.getElementById('lojaSaque').value.trim();
  if (!dataISO || isNaN(valor) || valor <= 0) {
    alert('Preencha data e valor corretamente.');
    return;
  }
  if (editandoId) {
    const original = saquesCache[editandoId];
    const anoMes = original?.anoMes || obterMesPrincipal();
    const saqueId = original?.saqueId || editandoId;
    await atualizarSaqueSvc({
      db,
      uid: uidAtual,
      anoMes,
      saqueId,
      dataISO,
      valor,
      percentualPago: percentual,
      origem,
    });
  } else {
    await registrarSaqueSvc({
      db,
      uid: uidAtual,
      dataISO,
      valor,
      percentualPago: percentual,
      origem,
    });
  }
  document.getElementById('valorSaque').value = '';
  document.getElementById('lojaSaque').value = '';
  editandoId = null;
  document.getElementById('btnRegistrar').textContent = 'Registrar';
  aplicarPercentualPadrao();
  carregarSaques();
}

export async function registrarComissaoRecebida() {
  const dataISO = document.getElementById('dataComissao').value;
  const valor = parseFloat(document.getElementById('valorComissao').value);
  if (!dataISO || isNaN(valor) || valor <= 0) {
    alert('Preencha data e valor corretamente.');
    return;
  }
  await registrarComissaoRecebidaSvc({ db, uid: uidAtual, dataISO, valor });
  document.getElementById('valorComissao').value = '';
}

async function carregarSaques() {
  if (!uidAtual) return;
  const mesesSelecionados = obterMesesSelecionados();
  const tbody = document.getElementById('tbodySaques');
  const tfoot = document.getElementById('tfootResumo');

  if (tbody) tbody.innerHTML = '';
  if (tfoot) tfoot.innerHTML = '';
  selecionados.clear();
  atualizarResumoSelecionados();

  const colecoes = mesesSelecionados.map((anoMes) =>
    getDocs(
      collection(db, 'usuarios', uidAtual, 'comissoes', anoMes, 'saques'),
    ).then((snap) => ({ anoMes, snap })),
  );

  const resultados = await Promise.all(colecoes);

  saquesCache = {};
  listaSaques = resultados
    .flatMap(({ anoMes, snap }) =>
      snap.docs.map((d) => {
        const dados = d.data();
        const composto = `${anoMes}__${d.id}`;
        return {
          id: composto,
          saqueId: d.id,
          anoMes,
          ...dados,
        };
      }),
    )
    .sort((a, b) => {
      const dataA = a.data || '';
      const dataB = b.data || '';
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      if (a.anoMes !== b.anoMes) return a.anoMes.localeCompare(b.anoMes);
      return (a.saqueId || '').localeCompare(b.saqueId || '');
    });

  listaSaques.forEach((s) => {
    saquesCache[s.id] = s;
  });

  atualizarFiltroLojas();
  renderSaques();
}

async function excluirSaque(id) {
  const saque = saquesCache[id];
  if (!saque) return;
  await deletarSaqueSvc({
    db,
    uid: uidAtual,
    anoMes: saque.anoMes,
    saqueId: saque.saqueId,
  });
  carregarSaques();
}

function renderSaques() {
  const tbody = document.getElementById('tbodySaques');
  const tfoot = document.getElementById('tfootResumo');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (tfoot) tfoot.innerHTML = '';

  listaSaquesFiltrada = listaSaques.filter((s) => {
    const valor = valorPadraoLoja(s.origem);
    return filtroLojaAtual === VALOR_TODAS_LOJAS || valor === filtroLojaAtual;
  });

  if (listaSaquesFiltrada.length === 0) {
    if (tfoot) {
      const mensagem =
        listaSaques.length === 0
          ? 'Sem saques registrados.'
          : 'Nenhum saque encontrado para a loja selecionada.';
      tfoot.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-3 text-center text-sm text-slate-500">${mensagem}</td>
        </tr>`;
    }
    atualizarCheckboxTodos();
    return;
  }

  let totalValor = 0;
  let totalComissao = 0;

  listaSaquesFiltrada.forEach((s) => {
    const valor = Number(s.valor) || 0;
    const comissao = Number(s.comissaoPaga) || 0;
    const percentual = Number(s.percentualPago) || 0;
    const statusPago = percentual > 0;
    const status = statusPago ? 'Pago' : 'A pagar';

    totalValor += valor;
    totalComissao += comissao;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 even:bg-slate-50/50';
    tr.innerHTML = `
      <td class="px-4 py-3 text-center">
        <input type="checkbox" class="saque-select h-4 w-4 rounded border-slate-300" data-id="${s.id}" onchange="toggleSelecao('${s.id}', this.checked)" ${
          selecionados.has(s.id) ? 'checked' : ''
        } />
      </td>
      <td class="px-4 py-3 text-slate-800">${formatarDataBR(s.data)}</td>
      <td class="px-4 py-3 text-slate-600">${
        s.origem && s.origem.trim() ? s.origem : '-'
      }</td>
      <td class="px-4 py-3 text-right font-medium text-slate-900">R$ ${valor.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}</td>
      <td class="px-4 py-3 text-right text-slate-600">${(percentual * 100).toFixed(0)}%</td>
      <td class="px-4 py-3 text-right text-slate-800">R$ ${comissao.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center rounded-full ${
          statusPago
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        } px-2 py-0.5 text-xs font-medium">${status}</span>
      </td>
      <td class="px-4 py-3 text-right">
        <div class="inline-flex gap-1">
          <button class="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="Editar" onclick="editarSaque('${s.id}')">✎</button>
          <button class="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 hover:bg-rose-50" aria-label="Excluir" onclick="excluirSaque('${s.id}')">🗑</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tfoot) {
    const perc = totalValor > 0 ? (totalComissao / totalValor) * 100 : 0;
    tfoot.innerHTML = `
      <tr>
        <td></td>
        <td colspan="2" class="px-4 py-3 font-medium text-slate-700">Total</td>
        <td class="px-4 py-3 text-right font-semibold text-slate-900">R$ ${totalValor.toLocaleString(
          'pt-BR',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )}</td>
        <td class="px-4 py-3 text-right text-slate-700">${perc.toFixed(0)}%</td>
        <td class="px-4 py-3 text-right font-semibold text-slate-900">R$ ${totalComissao.toLocaleString(
          'pt-BR',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )}</td>
        <td colspan="2"></td>
      </tr>`;
  }

  atualizarCheckboxTodos();
}

function toggleSelecao(id, marcado) {
  if (marcado) selecionados.add(id);
  else selecionados.delete(id);
  atualizarResumoSelecionados();
}

function toggleSelecaoTodos(marcado) {
  selecionados.clear();
  document.querySelectorAll('.saque-select').forEach((cb) => {
    cb.checked = marcado;
    if (marcado) selecionados.add(cb.dataset.id);
  });
  atualizarResumoSelecionados();
}

function atualizarResumoSelecionados() {
  const div = document.getElementById('acoesSelecionados');
  const texto = document.getElementById('resumoSelecionados');
  if (!div || !texto) return;
  if (selecionados.size === 0) {
    div.style.display = 'none';
    texto.textContent = '';
    atualizarCheckboxTodos();
    return;
  }
  let totalValor = 0;
  let totalComissaoSel = 0;
  selecionados.forEach((id) => {
    const s = saquesCache[id];
    if (s) {
      totalValor += Number(s.valor) || 0;
      totalComissaoSel += Number(s.comissaoPaga) || 0;
    }
  });
  texto.textContent = `${selecionados.size} selecionado(s) - Valor: R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Comissão: R$ ${totalComissaoSel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  div.style.display = 'flex';
  atualizarCheckboxTodos();
}

async function marcarComoPagoSelecionados() {
  const perc = parseFloat(
    document.getElementById('percentualSelecionado')?.value || '0',
  );
  for (const id of selecionados) {
    const s = saquesCache[id];
    if (!s) continue;
    await atualizarSaqueSvc({
      db,
      uid: uidAtual,
      anoMes: s.anoMes,
      saqueId: s.saqueId,
      dataISO: s.data,
      valor: s.valor,
      percentualPago: perc,
      origem: s.origem,
    });
  }
  selecionados.clear();
  carregarSaques();
}

function mostrarResumoSelecionados() {
  const texto = document.getElementById('resumoSelecionados');
  if (texto) alert(texto.textContent);
}

function exportarSelecionadosExcel() {
  if (selecionados.size === 0) return;

  // Cabeçalho principal
  const linhas = [
    ['Data', 'Loja', 'Saque', '%', 'Comissão', 'Status'].join(';'),
  ];
  const resumo = {};

  // Linhas detalhadas e consolidação por loja
  selecionados.forEach((id) => {
    const s = saquesCache[id];
    if (!s) return;
    const valor = Number(s.valor) || 0;
    const comissao = Number(s.comissaoPaga) || 0;
    const percentual = Number(s.percentualPago) || 0;
    const status = percentual > 0 ? 'PAGO' : 'A PAGAR';
    const lojaValor = valorPadraoLoja(s.origem);
    const lojaLabel = labelParaLoja(lojaValor);
    linhas.push(
      [
        formatarDataBR(s.data),
        lojaLabel,
        valor.toFixed(2),
        (percentual * 100).toFixed(0) + '%',
        comissao.toFixed(2),
        status,
      ].join(';'),
    );

    if (!resumo[lojaLabel]) {
      resumo[lojaLabel] = { total: 0, comissao: 0, pagos: true };
    }
    resumo[lojaLabel].total += valor;
    resumo[lojaLabel].comissao += comissao;
    resumo[lojaLabel].pagos = resumo[lojaLabel].pagos && percentual > 0;
  });

  // Tabela de resumo
  linhas.push('');
  linhas.push('Resumo Final');
  linhas.push(['Loja', 'Total', '%', 'Comissão Total', 'Status'].join(';'));
  Object.keys(resumo).forEach((loja) => {
    const r = resumo[loja];
    const perc = r.total > 0 ? (r.comissao / r.total) * 100 : 0;
    linhas.push(
      [
        loja,
        r.total.toFixed(2),
        perc.toFixed(0) + '%',
        r.comissao.toFixed(2),
        r.pagos ? 'PAGO' : 'A PAGAR',
      ].join(';'),
    );
  });

  const csv = `\ufeff${linhas.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'saques-selecionados.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function removerAcentos(texto) {
  if (texto == null) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

function slugArquivo(texto, padrao = 'sem-nome') {
  if (!texto) return padrao;
  const semAcento = removerAcentos(texto);
  const slug = semAcento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return slug || padrao;
}

function exportarSelecionadosPDF() {
  if (selecionados.size === 0 || !window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Fechamento Comissão', 105, 15, { align: 'center' });

  // Reunir itens selecionados
  const itens = Array.from(selecionados)
    .map((id) => saquesCache[id])
    .filter(Boolean);

  const totalSaque = itens.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const body = [];

  itens.forEach((s) => {
    const valor = Number(s.valor || 0);
    const status = s.percentualPago > 0 ? 'PAGO' : 'A PAGAR';

    body.push([
      formatarDataBR(s.data),
      s.origem || '',
      valor.toFixed(2),
      status,
    ]);
  });

  doc.autoTable({
    head: [['Data', 'Loja', 'Saque', 'Status']],
    body,
    startY: 25,
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 25;

  doc.setFontSize(12);
  doc.text(
    `Total de Saques Selecionados: R$ ${totalSaque.toFixed(2)}`,
    14,
    finalY + 10,
  );

  const lojasSelecionadas = Array.from(
    new Set(
      itens
        .map((s) => (s.origem || '').trim())
        .filter((origem) => origem && origem.length > 0),
    ),
  );
  const nomeUsuarioSlug = slugArquivo(nomeUsuarioAtual, 'usuario');
  const lojasSlug = lojasSelecionadas.length
    ? slugArquivo(lojasSelecionadas.join('-'), 'lojas')
    : 'sem-loja';
  const nomeArquivo = `fechamento-comissao-${nomeUsuarioSlug}-${lojasSlug}.pdf`;

  doc.save(nomeArquivo);
}

function gerarCobrancaComissoes() {
  if (!window.jspdf) {
    atualizarStatusCobranca('Biblioteca de PDF não carregada.', 'erro');
    return;
  }

  const dataPagamentoValor = document.getElementById(
    'dataPagamentoCobranca',
  )?.value;
  if (!dataPagamentoValor) {
    atualizarStatusCobranca('Informe a data limite de pagamento.', 'erro');
    return;
  }

  const selectPercentual = document.getElementById('percentualCobranca');
  const valorPercentual = selectPercentual ? selectPercentual.value : 'auto';
  const inputMulta = document.getElementById('percentualMultaCobranca');
  const multaPercentual = parseFloat(inputMulta?.value || '0');

  const pendentes = listaSaquesFiltrada.filter(
    (s) => (Number(s.percentualPago) || 0) === 0,
  );
  if (pendentes.length === 0) {
    atualizarStatusCobranca(
      'Não há comissões pendentes no filtro atual.',
      'erro',
    );
    return;
  }

  let percentualDecimal;
  if (valorPercentual === 'auto') {
    if (percentualPadrao !== null) {
      percentualDecimal = percentualPadrao;
    } else {
      const totalPendentes = pendentes.reduce(
        (soma, saque) => soma + (Number(saque.valor) || 0),
        0,
      );
      percentualDecimal = taxaFinalPorTotal(totalPendentes);
    }
  } else {
    percentualDecimal = parseFloat(valorPercentual);
  }

  if (
    !percentualDecimal ||
    Number.isNaN(percentualDecimal) ||
    percentualDecimal <= 0
  ) {
    atualizarStatusCobranca(
      'Selecione um percentual de comissão válido para gerar a cobrança.',
      'erro',
    );
    return;
  }

  const dataLimite = new Date(`${dataPagamentoValor}T00:00:00`);
  if (Number.isNaN(dataLimite.getTime())) {
    atualizarStatusCobranca('Data limite inválida.', 'erro');
    return;
  }

  const formatCurrency = (valor) =>
    `R$ ${(Number(valor) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const linhasTabela = [];
  let totalSaque = 0;
  let totalComissao = 0;

  pendentes.forEach((saque) => {
    const valorSaque = Number(saque.valor) || 0;
    const comissaoDevida = valorSaque * percentualDecimal;
    totalSaque += valorSaque;
    totalComissao += comissaoDevida;
    linhasTabela.push([
      formatarDataBR(saque.data),
      saque.origem && saque.origem.trim() ? saque.origem : '-',
      formatCurrency(valorSaque),
      formatCurrency(comissaoDevida),
    ]);
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limiteComparacao = new Date(dataLimite);
  limiteComparacao.setHours(0, 0, 0, 0);
  const atrasoMs = hoje.getTime() - limiteComparacao.getTime();
  const estaAtrasado = atrasoMs > 0;
  const diasAtraso = estaAtrasado
    ? Math.ceil(atrasoMs / (1000 * 60 * 60 * 24))
    : 0;
  const multaDecimal =
    Number.isNaN(multaPercentual) || multaPercentual <= 0
      ? 0
      : multaPercentual / 100;
  const valorMulta = estaAtrasado ? totalComissao * multaDecimal : 0;
  const totalComMulta = totalComissao + valorMulta;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Cobrança de Comissões', 105, 15, { align: 'center' });

  doc.setFontSize(11);
  const responsavel = nomeUsuarioAtual || '-';
  doc.text(`Responsável: ${responsavel}`, 14, 25);
  doc.text(
    `Data limite para pagamento: ${formatarDataBR(`${dataPagamentoValor}T00:00:00`)}`,
    14,
    32,
  );
  const situacao = estaAtrasado
    ? `Situação: Vencido há ${diasAtraso} dia(s)`
    : 'Situação: Dentro do prazo';
  doc.text(situacao, 14, 39);
  doc.text(
    `Percentual aplicado: ${(percentualDecimal * 100).toFixed(2)}%`,
    14,
    46,
  );
  if (!Number.isNaN(multaPercentual) && multaPercentual > 0) {
    doc.text(`Multa definida: ${multaPercentual.toFixed(2)}%`, 14, 53);
  }

  doc.autoTable({
    head: [['Data do Saque', 'Loja', 'Valor do Saque', 'Comissão Devida']],
    body: linhasTabela,
    startY: 60,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [244, 63, 94], textColor: 255 },
    alternateRowStyles: { fillColor: [252, 231, 233] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'left' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    foot: [
      [
        {
          content: 'Totais',
          colSpan: 2,
          styles: { halign: 'right', fontStyle: 'bold' },
        },
        {
          content: formatCurrency(totalSaque),
          styles: { halign: 'right', fontStyle: 'bold' },
        },
        {
          content: formatCurrency(totalComissao),
          styles: { halign: 'right', fontStyle: 'bold' },
        },
      ],
    ],
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 60;
  let textoY = finalY + 10;
  doc.setFontSize(12);
  doc.text(
    `Total de comissões devidas: ${formatCurrency(totalComissao)}`,
    14,
    textoY,
  );
  textoY += 6;
  if (estaAtrasado && valorMulta > 0) {
    doc.text(
      `Multa aplicada (${multaPercentual.toFixed(2)}%): ${formatCurrency(valorMulta)}`,
      14,
      textoY,
    );
    textoY += 6;
    doc.text(
      `Valor total com multa: ${formatCurrency(totalComMulta)}`,
      14,
      textoY,
    );
    textoY += 6;
  } else {
    if (multaDecimal > 0) {
      doc.text(
        'Multa será aplicada caso o pagamento ocorra após a data limite informada.',
        14,
        textoY,
      );
      textoY += 6;
    }
    doc.text(
      `Valor total a pagar: ${formatCurrency(totalComissao)}`,
      14,
      textoY,
    );
    textoY += 6;
  }

  doc.setFontSize(10);
  doc.text(
    'Documento gerado automaticamente pelo painel de saques.',
    14,
    textoY + 4,
  );

  const nomeResponsavelSlug = slugArquivo(responsavel || 'responsavel');
  const dataSlug = dataPagamentoValor.replace(/-/g, '');
  doc.save(`cobranca-comissoes-${nomeResponsavelSlug}-${dataSlug}.pdf`);

  atualizarStatusCobranca('PDF de cobrança gerado com sucesso.', 'sucesso');
}

function editarSaque(id) {
  const s = saquesCache[id];
  if (!s) return;
  document.getElementById('dataSaque').value = (s.data || '').substring(0, 10);
  document.getElementById('valorSaque').value = s.valor;
  document.getElementById('percentualSaque').value = String(
    s.percentualPago || 0,
  );
  document.getElementById('lojaSaque').value = s.origem || '';
  editandoId = id;
  document.getElementById('btnRegistrar').textContent = 'Atualizar';
}

async function fecharMes() {
  const meses = obterMesesSelecionados();
  if (meses.length !== 1) {
    alert('Selecione apenas um mês para realizar o fechamento.');
    return;
  }
  const anoMes = meses[0];
  const ajusteId = await fecharMesSvc({ db, uid: uidAtual, anoMes });
  alert(ajusteId ? 'Ajuste lançado!' : 'Sem ajuste necessário');
}

function assistirResumo() {
  if (!uidAtual) return;
  const meses = obterMesesSelecionados();
  if (unsubscribeResumo) {
    unsubscribeResumo();
    unsubscribeResumo = null;
  }

  const cards = document.getElementById('cardsResumo');
  const texto = document.getElementById('faltasTexto');

  if (meses.length !== 1) {
    resumoMesAtual = null;
    if (cards) {
      cards.innerHTML = `
        <div class="col-span-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600">
          Selecione apenas um mês para visualizar o resumo mensal.
        </div>
      `;
    }
    if (texto) texto.textContent = '';
    return;
  }

  const anoMes = meses[0];
  unsubscribeResumo = watchResumoMesSvc({
    db,
    uid: uidAtual,
    anoMes,
    onChange: (r) => {
      resumoMesAtual = r;
      renderResumoCards();
    },
  });
}

async function carregarFonteRoboto(doc) {
  if (doc.getFontList().Roboto) return;
  function toBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  const [regular, medium] = await Promise.all([
    fetch(
      'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
    ).then((r) => r.arrayBuffer()),
    fetch(
      'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf',
    ).then((r) => r.arrayBuffer()),
  ]);
  doc.addFileToVFS('Roboto-Regular.ttf', toBase64(regular));
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Medium.ttf', toBase64(medium));
  doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
}

async function imprimirFechamento() {
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const meses = obterMesesSelecionados();
  if (meses.length !== 1) {
    alert('Selecione apenas um mês para exportar o fechamento.');
    return;
  }
  const anoMes = meses[0];

  const colSaques = collection(
    db,
    'usuarios',
    uidAtual,
    'comissoes',
    anoMes,
    'saques',
  );
  const colRecebidas = collection(
    db,
    'usuarios',
    uidAtual,
    'comissoes',
    anoMes,
    'recebidas',
  );
  const [snapSaques, snapRecebidas] = await Promise.all([
    getDocs(colSaques),
    getDocs(colRecebidas),
  ]);

  const saques = snapSaques.docs
    .map((d) => d.data())
    .sort((a, b) => a.data.localeCompare(b.data));
  const recebidas = snapRecebidas.docs
    .map((d) => d.data())
    .sort((a, b) => a.data.localeCompare(b.data));
  const resumoCalc = calcularResumo(saques);
  const { totalSacado, taxaFinal, comissaoPrevista } = resumoCalc;
  const totalPago = recebidas.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const totalPagar = comissaoPrevista - totalPago;

  let responsavel =
    auth.currentUser?.displayName || auth.currentUser?.email || '';
  let loja = '';
  try {
    const perfil = await getDoc(doc(db, 'perfil', uidAtual));
    if (perfil.exists()) {
      const pdata = perfil.data();
      responsavel = pdata.nomeCompleto || responsavel;
      loja = pdata.empresa || '';
    }
  } catch (_) {}

  const [anoTitulo, mesTitulo] = anoMes.split('-').map(Number);
  const dataTitulo = new Date(anoTitulo, mesTitulo - 1, 1);
  const mesNome = dataTitulo.toLocaleDateString('pt-BR', { month: 'long' });
  const mesAno = `${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}/${dataTitulo.getFullYear()}`;
  const emissao = new Date().toLocaleDateString('pt-BR');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await carregarFonteRoboto(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const accent = [79, 70, 229];

  function formatCurrency(v) {
    return `R$ ${(Number(v) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  function formatDate(iso) {
    return formatarDataBR(iso);
  }

  const header = (data) => {
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(20);
    doc.text(`Fechamento de Saques — ${mesAno}`, margin, 20);
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, 24, pageWidth - margin, 24);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    const right = `${responsavel}${loja ? ' / ' + loja : ''} / ${emissao}`;
    doc.text(right, pageWidth - margin, 20, { align: 'right' });
  };

  const footer = (data) => {
    doc.setFontSize(10);
    doc.text(`Página ${data.pageNumber}`, pageWidth / 2, pageHeight - 10, {
      align: 'center',
    });
  };

  header();

  let y = 30;
  const cardGap = 5;
  const cardW = (pageWidth - margin * 2 - cardGap * 3) / 4;
  const cardH = 24;
  const cards = [
    { icon: '💰', label: 'Total Sacado', valor: formatCurrency(totalSacado) },
    {
      icon: '🧾',
      label: 'Comissão do Mês',
      valor: formatCurrency(comissaoPrevista),
    },
    { icon: '✅', label: 'Pago', valor: formatCurrency(totalPago) },
    { icon: '⌛', label: 'A Pagar', valor: formatCurrency(totalPagar) },
  ];
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + cardGap);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'S');
    doc.setFontSize(10);
    doc.text(c.icon, x + 3, y + 9);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(14);
    doc.text(c.valor, x + cardW / 2, y + 15, { align: 'center' });
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.text(c.label, x + cardW / 2, y + cardH - 4, { align: 'center' });
  });

  y += cardH + 12;

  const saquesBody = saques.map((s) => [
    formatDate(s.data),
    s.origem || '',
    formatCurrency(s.valor),
  ]);
  const saquesFoot = [
    [
      {
        content: 'Total',
        colSpan: 2,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      {
        content: formatCurrency(totalSacado),
        styles: { halign: 'right', fontStyle: 'bold' },
      },
    ],
  ];

  doc.autoTable({
    startY: y,
    head: [['Data', 'Loja', 'Saque']],
    body: saquesBody,
    foot: saquesFoot,
    margin: { top: 32, left: margin, right: margin },
    styles: {
      font: 'Roboto',
      fontSize: 12,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'right' },
    },
    didDrawPage: (data) => {
      header();
      footer(data);
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  const comissoesBody = [
    ...recebidas.map((c) => [
      formatDate(c.data),
      `${(taxaFinal * 100).toFixed(0)}%`,
      formatCurrency(c.valor),
      'Pago',
    ]),
    [
      '',
      `${(taxaFinal * 100).toFixed(0)}%`,
      formatCurrency(totalPagar),
      'A pagar',
    ],
  ];
  const comissoesFoot = [
    [
      {
        content: 'Total',
        colSpan: 2,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      {
        content: formatCurrency(comissaoPrevista),
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      '',
    ],
  ];

  doc.autoTable({
    startY: y,
    head: [['Data', '%', 'Valor', 'Status']],
    body: comissoesBody,
    foot: comissoesFoot,
    margin: { top: 32, left: margin, right: margin },
    styles: {
      font: 'Roboto',
      fontSize: 12,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const val = data.cell.raw;
        data.cell.styles.textColor = val === 'Pago' ? '#16a34a' : '#d97706';
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => {
      header();
      footer(data);
    },
  });

  doc.save('fechamento-saques.pdf');
}

if (typeof window !== 'undefined') {
  window.registrarSaque = registrarSaque;
  window.excluirSaque = excluirSaque;
  window.editarSaque = editarSaque;
  window.fecharMes = fecharMes;
  window.toggleSelecao = toggleSelecao;
  window.toggleSelecaoTodos = toggleSelecaoTodos;
  window.marcarComoPagoSelecionados = marcarComoPagoSelecionados;
  window.mostrarResumoSelecionados = mostrarResumoSelecionados;
  window.exportarSelecionadosExcel = exportarSelecionadosExcel;
  window.exportarSelecionadosPDF = exportarSelecionadosPDF;
  window.registrarComissaoRecebida = registrarComissaoRecebida;
  window.imprimirFechamento = imprimirFechamento;
  window.salvarPercentualPadrao = salvarPercentualPadraoUsuario;
  window.gerarCobrancaComissoes = gerarCobrancaComissoes;
}
