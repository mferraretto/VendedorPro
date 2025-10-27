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

let usuariosEquipe = [];
let carregando = false;

function toLocalIsoDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function obterMesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function obterSemanaIsoAtual() {
  const date = new Date();
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNr = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function calcularIntervaloSemanaIso(semanaIso) {
  if (!/^\d{4}-W\d{2}$/.test(semanaIso || '')) return null;
  const [anoStr, semanaStr] = semanaIso.split('-W');
  const ano = Number(anoStr);
  const semana = Number(semanaStr);
  if (!Number.isFinite(ano) || !Number.isFinite(semana)) return null;
  const simple = new Date(Date.UTC(ano, 0, 1 + (semana - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const start = new Date(simple);
  if (dayOfWeek <= 4) {
    start.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  } else {
    start.setUTCDate(simple.getUTCDate() + 8 - dayOfWeek);
  }
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: toLocalIsoDate(start),
    end: toLocalIsoDate(end),
  };
}

function calcularIntervaloMes(valorMes) {
  if (!/^\d{4}-\d{2}$/.test(valorMes || '')) return null;
  const [anoStr, mesStr] = valorMes.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return null;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    start: `${valorMes}-01`,
    end: `${valorMes}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

function formatarDataHumana(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

function formatarMesReferencia(anoMes) {
  if (!anoMes) return '';
  const [anoStr, mesStr] = anoMes.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return anoMes;
  const nomes = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const nomeMes = nomes[mes - 1] || '';
  if (!nomeMes) return anoMes;
  return `${nomeMes}/${ano}`;
}

function formatarRangeDisplay(start, end) {
  if (!start && !end) return '';
  if (start && end && start !== end) {
    return `${formatarDataHumana(start)} a ${formatarDataHumana(end)}`;
  }
  return formatarDataHumana(start || end);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatarNumeroPadrao(valor) {
  if (valor === null || valor === undefined) return '0';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '0';
  return numero.toLocaleString('pt-BR');
}

function formatarPercentualPadrao(valor) {
  if (valor === null || valor === undefined || valor === '') return '-';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '-';
  return `${numero.toFixed(2)}%`;
}

function formatCurrency(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 'R$ 0,00';
  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function atualizarStatus(id, mensagem, tipo = 'info') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = mensagem || '';
  el.classList.remove('text-gray-500', 'text-red-500', 'text-emerald-600');
  if (tipo === 'erro') {
    el.classList.add('text-red-500');
  } else if (tipo === 'sucesso') {
    el.classList.add('text-emerald-600');
  } else {
    el.classList.add('text-gray-500');
  }
}

function configurarTabs() {
  const botoes = document.querySelectorAll('.tab-btn');
  const paines = {
    diario: document.getElementById('tab-diario'),
    vendas: document.getElementById('tab-vendas'),
    problemas: document.getElementById('tab-problemas'),
  };
  botoes.forEach((botao) => {
    botao.addEventListener('click', () => {
      const alvo = botao.dataset.tab;
      botoes.forEach((btn) => {
        const ativo = btn === botao;
        btn.classList.toggle('bg-indigo-600', ativo);
        btn.classList.toggle('text-white', ativo);
        btn.classList.toggle('bg-white', !ativo);
        btn.classList.toggle('text-indigo-600', !ativo);
      });
      Object.entries(paines).forEach(([nome, painel]) => {
        if (!painel) return;
        if (nome === alvo) {
          painel.classList.remove('hidden');
        } else {
          painel.classList.add('hidden');
        }
      });
    });
  });
}

function atualizarVisibilidadePeriodo(tipo) {
  const mes = document.getElementById('resumoFiltroMesWrapper');
  const semana = document.getElementById('resumoFiltroSemanaWrapper');
  const dia = document.getElementById('resumoFiltroDiaWrapper');
  if (mes) mes.classList.toggle('hidden', tipo !== 'mes');
  if (semana) semana.classList.toggle('hidden', tipo !== 'semana');
  if (dia) dia.classList.toggle('hidden', tipo !== 'dia');
}

function configurarTipoPeriodo() {
  const tipoSel = document.getElementById('resumoFiltroTipo');
  if (!tipoSel) return;
  tipoSel.addEventListener('change', () => {
    atualizarVisibilidadePeriodo(tipoSel.value);
  });
}

function popularUsuariosSelect() {
  const select = document.getElementById('resumoFiltroUsuario');
  if (!select) return;
  select.innerHTML = '';
  const optTodos = document.createElement('option');
  optTodos.value = 'todos';
  optTodos.textContent = 'Todos';
  select.appendChild(optTodos);
  usuariosEquipe
    .filter((u) => u && u.uid)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    .forEach((usuario) => {
      const opt = document.createElement('option');
      opt.value = usuario.uid;
      opt.textContent = usuario.nome || usuario.email || usuario.uid;
      select.appendChild(opt);
    });
  select.value = 'todos';
}

function definirValoresPadraoFiltro() {
  const mesInput = document.getElementById('resumoFiltroMes');
  const semanaInput = document.getElementById('resumoFiltroSemana');
  const diaInput = document.getElementById('resumoFiltroDia');
  const tipoSel = document.getElementById('resumoFiltroTipo');
  if (mesInput && !mesInput.value) mesInput.value = obterMesAtual();
  if (semanaInput && !semanaInput.value)
    semanaInput.value = obterSemanaIsoAtual();
  if (diaInput && !diaInput.value) diaInput.value = toLocalIsoDate(new Date());
  if (tipoSel) tipoSel.value = 'mes';
  atualizarVisibilidadePeriodo('mes');
}

function obterPeriodoSelecionado() {
  const tipoSel = document.getElementById('resumoFiltroTipo');
  const tipo = tipoSel?.value || 'mes';
  if (tipo === 'dia') {
    const diaInput = document.getElementById('resumoFiltroDia');
    const dia = diaInput?.value || toLocalIsoDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
    return {
      tipo,
      start: dia,
      end: dia,
      label: formatarDataHumana(dia),
      descricao: formatarDataHumana(dia),
    };
  }
  if (tipo === 'semana') {
    const semanaInput = document.getElementById('resumoFiltroSemana');
    const semanaValor = semanaInput?.value || obterSemanaIsoAtual();
    const intervalo = calcularIntervaloSemanaIso(semanaValor);
    if (!intervalo) return null;
    const descricao = `Semana ${semanaValor.replace('-W', ' / ')} (${formatarRangeDisplay(
      intervalo.start,
      intervalo.end,
    )})`;
    return {
      tipo,
      start: intervalo.start,
      end: intervalo.end,
      label: descricao,
      descricao,
    };
  }
  const mesInput = document.getElementById('resumoFiltroMes');
  const mesValor = mesInput?.value || obterMesAtual();
  const intervaloMes = calcularIntervaloMes(mesValor);
  if (!intervaloMes) return null;
  const descricao = formatarMesReferencia(mesValor);
  return {
    tipo,
    start: intervaloMes.start,
    end: intervaloMes.end,
    label: descricao,
    descricao,
  };
}

function buildDateConstraints(start, end) {
  const constraints = [orderBy('__name__')];
  if (start) constraints.push(startAt(start));
  if (end) constraints.push(endAt(end));
  return constraints;
}

function normalizarNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor).replace(/\./g, '').replace(',', '.').trim();
  if (!texto) return 0;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

async function tentarDescriptografar(encrypted, candidatos) {
  for (const chave of candidatos) {
    if (!chave) continue;
    try {
      const texto = await decryptString(encrypted, chave);
      if (texto) return texto;
    } catch (_) {
      // tenta próxima chave
    }
  }
  return null;
}

function criarChavesDescriptografia(uid, passphrasePadrao) {
  const candidatos = [passphrasePadrao, `chave-${uid}`, uid];
  return candidatos.filter(Boolean);
}

async function calcularFaturamentoDia(uid, dia, passphrasePadrao) {
  let bruto = 0;
  let liquido = 0;
  const candidatos = criarChavesDescriptografia(uid, passphrasePadrao);
  const lojasSnap = await getDocs(
    collection(db, `uid/${uid}/faturamento/${dia}/lojas`),
  );
  for (const lojaDoc of lojasSnap.docs) {
    let dados = lojaDoc.data() || {};
    if (dados.encrypted) {
      const texto = await tentarDescriptografar(dados.encrypted, candidatos);
      if (!texto) continue;
      try {
        dados = JSON.parse(texto);
      } catch (err) {
        console.warn(
          'Não foi possível interpretar faturamento descriptografado',
          err,
        );
        continue;
      }
    }
    liquido += normalizarNumero(dados.valorLiquido ?? dados.valor);
    bruto += normalizarNumero(dados.valorBruto);
  }
  return { bruto, liquido };
}

async function carregarSkusDia(uid, dia, skuMap, passphrasePadrao) {
  const candidatos = criarChavesDescriptografia(uid, passphrasePadrao);
  const listaRef = collection(db, `uid/${uid}/skusVendidos/${dia}/lista`);
  const snap = await getDocs(listaRef);
  let unidades = 0;
  for (const itemDoc of snap.docs) {
    let dados = itemDoc.data() || {};
    if (dados.encrypted) {
      const texto = await tentarDescriptografar(dados.encrypted, candidatos);
      if (!texto) continue;
      try {
        dados = JSON.parse(texto);
      } catch (err) {
        console.warn('Não foi possível interpretar SKU descriptografado', err);
        continue;
      }
    }
    const sku = (dados.sku || itemDoc.id || '').toString().trim().toUpperCase();
    if (!sku) continue;
    const quantidade = normalizarNumero(
      dados.total ?? dados.quantidade ?? dados.qtd,
    );
    const sobra = normalizarNumero(
      dados.sobraReal ?? dados.sobra ?? dados.valorLiquido ?? dados.valor,
    );
    if (quantidade) unidades += quantidade;
    const atual = skuMap.get(sku) || { total: 0, sobraTotal: 0 };
    atual.total += quantidade;
    atual.sobraTotal += sobra;
    skuMap.set(sku, atual);
  }
  return { unidades };
}

function normalizarNumeroDiario(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor).trim().replace(',', '.');
  if (!texto) return 0;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarPercentualResumo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function criarAcumuladorPercentual() {
  return { soma: 0, total: 0 };
}

function adicionarPercentual(acumulador, valor) {
  if (!acumulador) return;
  if (valor === null || valor === undefined || valor === '') return;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return;
  acumulador.soma += numero;
  acumulador.total += 1;
}

function mediaPercentual(acumulador) {
  if (!acumulador || !acumulador.total) return null;
  return acumulador.soma / acumulador.total;
}

function obterNumeroDiarioCompat(registro, chaveNova, chaveLegado) {
  if (!registro) return 0;
  if (registro[chaveNova] !== undefined) {
    return normalizarNumeroDiario(registro[chaveNova]);
  }
  if (registro[chaveLegado] !== undefined) {
    return normalizarNumeroDiario(registro[chaveLegado]);
  }
  return 0;
}

function obterPercentualDiarioCompat(registro, chaveNova, chaveLegado) {
  if (!registro) return null;
  if (chaveNova && registro[chaveNova] !== undefined) {
    const valor = normalizarPercentualResumo(registro[chaveNova]);
    if (valor !== null) return valor;
  }
  if (chaveLegado && registro[chaveLegado] !== undefined) {
    const valor = normalizarPercentualResumo(registro[chaveLegado]);
    if (valor !== null) return valor;
  }
  return null;
}

function agruparRegistrosDiariosGestor(registros) {
  const criarPercentuaisConjunto = () => ({
    fim: {
      reclamacoes: criarAcumuladorPercentual(),
      cancelamento: criarAcumuladorPercentual(),
      atraso: criarAcumuladorPercentual(),
      mediacao: criarAcumuladorPercentual(),
    },
    inicio: {
      reclamacoes: criarAcumuladorPercentual(),
      cancelamento: criarAcumuladorPercentual(),
      atraso: criarAcumuladorPercentual(),
      mediacao: criarAcumuladorPercentual(),
    },
  });

  const mapa = new Map();
  const totaisPorUsuario = new Map();
  const totaisGerais = {
    pedidosNaoEnviados: 0,
    reclamacoesAbertas: 0,
    reclamacoesRespondidas: 0,
    reclamacoesEncerradas: 0,
    percentuais: criarPercentuaisConjunto(),
  };

  registros.forEach((registro) => {
    const plataforma = String(registro.plataforma || '-');
    const nomeLoja = String(registro.nomeLoja || 'Sem loja');
    const usuarioUid = registro.usuarioUid || 'desconhecido';
    const usuarioNome =
      registro.usuarioNome || registro.usuarioEmail || usuarioUid;
    const chave = `${usuarioUid}||${plataforma}||${nomeLoja}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        usuarioUid,
        usuarioNome,
        plataforma,
        nomeLoja,
        pedidosNaoEnviados: 0,
        reclamacoesAbertas: 0,
        reclamacoesRespondidas: 0,
        reclamacoesEncerradas: 0,
        percentuais: criarPercentuaisConjunto(),
      });
    }
    const item = mapa.get(chave);

    if (!totaisPorUsuario.has(usuarioUid)) {
      totaisPorUsuario.set(usuarioUid, {
        usuarioUid,
        usuarioNome,
        pedidosNaoEnviados: 0,
        reclamacoesAbertas: 0,
        reclamacoesRespondidas: 0,
        reclamacoesEncerradas: 0,
        percentuais: criarPercentuaisConjunto(),
      });
    }
    const totalUsuario = totaisPorUsuario.get(usuarioUid);

    const pedidos = normalizarNumeroDiario(registro.pedidosNaoEnviados);
    const abertas = obterNumeroDiarioCompat(
      registro,
      'reclamacoesAbertas',
      'reclamacoesAbertas',
    );
    const respondidas = obterNumeroDiarioCompat(
      registro,
      'reclamacoesRespondidas',
      'reclamacoesRecorridas',
    );
    const encerradas = obterNumeroDiarioCompat(
      registro,
      'reclamacoesEncerradas',
      'reclamacoesRecusadas',
    );

    const percReclamacoesFim = obterPercentualDiarioCompat(
      registro,
      'porcentagemReclamacoesFim',
      'porcentagemReclamacoes',
    );
    const percReclamacoesInicio = obterPercentualDiarioCompat(
      registro,
      'porcentagemReclamacoesInicio',
      null,
    );
    const percCancelamentoFim = obterPercentualDiarioCompat(
      registro,
      'porcentagemCancelamentoFim',
      'porcentagemCancelamento',
    );
    const percCancelamentoInicio = obterPercentualDiarioCompat(
      registro,
      'porcentagemCancelamentoInicio',
      null,
    );
    const percAtrasoFim = obterPercentualDiarioCompat(
      registro,
      'porcentagemAtrasoFim',
      'porcentagemAtraso',
    );
    const percAtrasoInicio = obterPercentualDiarioCompat(
      registro,
      'porcentagemAtrasoInicio',
      null,
    );
    const percMediacaoFim = obterPercentualDiarioCompat(
      registro,
      'porcentagemMediacaoFim',
      'porcentagemMediacao',
    );
    const percMediacaoInicio = obterPercentualDiarioCompat(
      registro,
      'porcentagemMediacaoInicio',
      null,
    );

    item.pedidosNaoEnviados += pedidos;
    item.reclamacoesAbertas += abertas;
    item.reclamacoesRespondidas += respondidas;
    item.reclamacoesEncerradas += encerradas;

    totalUsuario.pedidosNaoEnviados += pedidos;
    totalUsuario.reclamacoesAbertas += abertas;
    totalUsuario.reclamacoesRespondidas += respondidas;
    totalUsuario.reclamacoesEncerradas += encerradas;

    totaisGerais.pedidosNaoEnviados += pedidos;
    totaisGerais.reclamacoesAbertas += abertas;
    totaisGerais.reclamacoesRespondidas += respondidas;
    totaisGerais.reclamacoesEncerradas += encerradas;

    adicionarPercentual(item.percentuais.fim.reclamacoes, percReclamacoesFim);
    adicionarPercentual(item.percentuais.fim.cancelamento, percCancelamentoFim);
    adicionarPercentual(item.percentuais.fim.atraso, percAtrasoFim);
    adicionarPercentual(item.percentuais.fim.mediacao, percMediacaoFim);
    adicionarPercentual(
      item.percentuais.inicio.reclamacoes,
      percReclamacoesInicio,
    );
    adicionarPercentual(
      item.percentuais.inicio.cancelamento,
      percCancelamentoInicio,
    );
    adicionarPercentual(item.percentuais.inicio.atraso, percAtrasoInicio);
    adicionarPercentual(item.percentuais.inicio.mediacao, percMediacaoInicio);

    adicionarPercentual(
      totalUsuario.percentuais.fim.reclamacoes,
      percReclamacoesFim,
    );
    adicionarPercentual(
      totalUsuario.percentuais.fim.cancelamento,
      percCancelamentoFim,
    );
    adicionarPercentual(totalUsuario.percentuais.fim.atraso, percAtrasoFim);
    adicionarPercentual(totalUsuario.percentuais.fim.mediacao, percMediacaoFim);
    adicionarPercentual(
      totalUsuario.percentuais.inicio.reclamacoes,
      percReclamacoesInicio,
    );
    adicionarPercentual(
      totalUsuario.percentuais.inicio.cancelamento,
      percCancelamentoInicio,
    );
    adicionarPercentual(
      totalUsuario.percentuais.inicio.atraso,
      percAtrasoInicio,
    );
    adicionarPercentual(
      totalUsuario.percentuais.inicio.mediacao,
      percMediacaoInicio,
    );

    adicionarPercentual(
      totaisGerais.percentuais.fim.reclamacoes,
      percReclamacoesFim,
    );
    adicionarPercentual(
      totaisGerais.percentuais.fim.cancelamento,
      percCancelamentoFim,
    );
    adicionarPercentual(totaisGerais.percentuais.fim.atraso, percAtrasoFim);
    adicionarPercentual(totaisGerais.percentuais.fim.mediacao, percMediacaoFim);
    adicionarPercentual(
      totaisGerais.percentuais.inicio.reclamacoes,
      percReclamacoesInicio,
    );
    adicionarPercentual(
      totaisGerais.percentuais.inicio.cancelamento,
      percCancelamentoInicio,
    );
    adicionarPercentual(
      totaisGerais.percentuais.inicio.atraso,
      percAtrasoInicio,
    );
    adicionarPercentual(
      totaisGerais.percentuais.inicio.mediacao,
      percMediacaoInicio,
    );
  });

  const linhas = Array.from(mapa.values())
    .map((item) => ({
      usuarioUid: item.usuarioUid,
      usuarioNome: item.usuarioNome,
      plataforma: item.plataforma,
      nomeLoja: item.nomeLoja,
      pedidosNaoEnviados: item.pedidosNaoEnviados,
      reclamacoesAbertas: item.reclamacoesAbertas,
      reclamacoesRespondidas: item.reclamacoesRespondidas,
      reclamacoesEncerradas: item.reclamacoesEncerradas,
      porcentagemReclamacoes: mediaPercentual(item.percentuais.fim.reclamacoes),
      porcentagemCancelamento: mediaPercentual(
        item.percentuais.fim.cancelamento,
      ),
      porcentagemAtraso: mediaPercentual(item.percentuais.fim.atraso),
      porcentagemMediacao: mediaPercentual(item.percentuais.fim.mediacao),
      porcentagemReclamacoesInicio: mediaPercentual(
        item.percentuais.inicio.reclamacoes,
      ),
      porcentagemCancelamentoInicio: mediaPercentual(
        item.percentuais.inicio.cancelamento,
      ),
      porcentagemAtrasoInicio: mediaPercentual(item.percentuais.inicio.atraso),
      porcentagemMediacaoInicio: mediaPercentual(
        item.percentuais.inicio.mediacao,
      ),
    }))
    .sort((a, b) => {
      const cmpUsuario = a.usuarioNome.localeCompare(b.usuarioNome, 'pt-BR');
      if (cmpUsuario !== 0) return cmpUsuario;
      const cmpPlataforma = a.plataforma.localeCompare(b.plataforma, 'pt-BR');
      if (cmpPlataforma !== 0) return cmpPlataforma;
      return a.nomeLoja.localeCompare(b.nomeLoja, 'pt-BR');
    });

  const totais = {
    pedidosNaoEnviados: totaisGerais.pedidosNaoEnviados,
    reclamacoesAbertas: totaisGerais.reclamacoesAbertas,
    reclamacoesRespondidas: totaisGerais.reclamacoesRespondidas,
    reclamacoesEncerradas: totaisGerais.reclamacoesEncerradas,
    porcentagemReclamacoes: mediaPercentual(
      totaisGerais.percentuais.fim.reclamacoes,
    ),
    porcentagemCancelamento: mediaPercentual(
      totaisGerais.percentuais.fim.cancelamento,
    ),
    porcentagemAtraso: mediaPercentual(totaisGerais.percentuais.fim.atraso),
    porcentagemMediacao: mediaPercentual(totaisGerais.percentuais.fim.mediacao),
    porcentagemReclamacoesInicio: mediaPercentual(
      totaisGerais.percentuais.inicio.reclamacoes,
    ),
    porcentagemCancelamentoInicio: mediaPercentual(
      totaisGerais.percentuais.inicio.cancelamento,
    ),
    porcentagemAtrasoInicio: mediaPercentual(
      totaisGerais.percentuais.inicio.atraso,
    ),
    porcentagemMediacaoInicio: mediaPercentual(
      totaisGerais.percentuais.inicio.mediacao,
    ),
  };

  const totaisUsuarios = Array.from(totaisPorUsuario.values())
    .map((item) => ({
      usuarioUid: item.usuarioUid,
      usuarioNome: item.usuarioNome,
      pedidosNaoEnviados: item.pedidosNaoEnviados,
      reclamacoesAbertas: item.reclamacoesAbertas,
      reclamacoesRespondidas: item.reclamacoesRespondidas,
      reclamacoesEncerradas: item.reclamacoesEncerradas,
      porcentagemReclamacoes: mediaPercentual(item.percentuais.fim.reclamacoes),
      porcentagemCancelamento: mediaPercentual(
        item.percentuais.fim.cancelamento,
      ),
      porcentagemAtraso: mediaPercentual(item.percentuais.fim.atraso),
      porcentagemMediacao: mediaPercentual(item.percentuais.fim.mediacao),
      porcentagemReclamacoesInicio: mediaPercentual(
        item.percentuais.inicio.reclamacoes,
      ),
      porcentagemCancelamentoInicio: mediaPercentual(
        item.percentuais.inicio.cancelamento,
      ),
      porcentagemAtrasoInicio: mediaPercentual(item.percentuais.inicio.atraso),
      porcentagemMediacaoInicio: mediaPercentual(
        item.percentuais.inicio.mediacao,
      ),
    }))
    .sort((a, b) => a.usuarioNome.localeCompare(b.usuarioNome, 'pt-BR'));

  return { linhas, totais, totaisUsuarios };
}

function renderDiarioTabela(linhas = []) {
  const tabelaBody = document.getElementById('diarioTabela');
  if (!tabelaBody) return;
  tabelaBody.innerHTML = '';
  if (!linhas.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="10" class="px-4 py-3 text-center text-gray-500">Nenhum registro para exibir.</td>';
    tabelaBody.appendChild(tr);
    return;
  }
  linhas.forEach((linha) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-2">${escapeHtml(linha.usuarioNome)}</td>
      <td class="px-4 py-2">${escapeHtml(linha.plataforma)}</td>
      <td class="px-4 py-2">${escapeHtml(linha.nomeLoja)}</td>
      <td class="px-4 py-2 text-right">${formatarNumeroPadrao(linha.reclamacoesAbertas)}</td>
      <td class="px-4 py-2 text-right">${formatarNumeroPadrao(linha.reclamacoesRespondidas)}</td>
      <td class="px-4 py-2 text-right">${formatarNumeroPadrao(linha.reclamacoesEncerradas)}</td>
      <td class="px-4 py-2 text-right">${formatarPercentualPadrao(linha.porcentagemReclamacoes)}</td>
      <td class="px-4 py-2 text-right">${formatarPercentualPadrao(linha.porcentagemMediacao)}</td>
      <td class="px-4 py-2 text-right">${formatarPercentualPadrao(linha.porcentagemAtraso)}</td>
      <td class="px-4 py-2 text-right">${formatarPercentualPadrao(linha.porcentagemCancelamento)}</td>
    `;
    tabelaBody.appendChild(tr);
  });
}

function renderDiarioTotais(totais, totaisUsuarios, label) {
  const container = document.getElementById('diarioTotais');
  if (!container) return;
  const periodo = label ? escapeHtml(label) : 'Período selecionado';
  const formatarPercentualDetalhe = (valor) =>
    valor === null || valor === undefined
      ? '-'
      : formatarPercentualPadrao(valor);
  const usuariosHtml = totaisUsuarios.length
    ? `<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${totaisUsuarios
          .map(
            (usuario) => `
              <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div class="font-semibold text-gray-800 mb-2">${escapeHtml(
                  usuario.usuarioNome,
                )}</div>
                <div class="grid gap-3 md:grid-cols-3">
                  <div>
                    <p class="text-xs text-gray-500 uppercase">Abertas</p>
                    <p class="text-lg font-semibold text-gray-700">${formatarNumeroPadrao(
                      usuario.reclamacoesAbertas,
                    )}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500 uppercase">Respondidas</p>
                    <p class="text-lg font-semibold text-gray-700">${formatarNumeroPadrao(
                      usuario.reclamacoesRespondidas,
                    )}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500 uppercase">Encerradas</p>
                    <p class="text-lg font-semibold text-gray-700">${formatarNumeroPadrao(
                      usuario.reclamacoesEncerradas,
                    )}</p>
                  </div>
                </div>
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-3">
                  <div>
                    <p class="text-xs text-gray-500 uppercase">% Reclamação</p>
                    <p class="text-sm font-semibold text-gray-700">${formatarPercentualPadrao(
                      usuario.porcentagemReclamacoes,
                    )}</p>
                    <p class="text-xs text-gray-400">Início: ${escapeHtml(
                      formatarPercentualDetalhe(
                        usuario.porcentagemReclamacoesInicio,
                      ),
                    )}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500 uppercase">% Mediação</p>
                    <p class="text-sm font-semibold text-gray-700">${formatarPercentualPadrao(
                      usuario.porcentagemMediacao,
                    )}</p>
                    <p class="text-xs text-gray-400">Início: ${escapeHtml(
                      formatarPercentualDetalhe(
                        usuario.porcentagemMediacaoInicio,
                      ),
                    )}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500 uppercase">% Atraso</p>
                    <p class="text-sm font-semibold text-gray-700">${formatarPercentualPadrao(
                      usuario.porcentagemAtraso,
                    )}</p>
                    <p class="text-xs text-gray-400">Início: ${escapeHtml(
                      formatarPercentualDetalhe(
                        usuario.porcentagemAtrasoInicio,
                      ),
                    )}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500 uppercase">% Cancelado</p>
                    <p class="text-sm font-semibold text-gray-700">${formatarPercentualPadrao(
                      usuario.porcentagemCancelamento,
                    )}</p>
                    <p class="text-xs text-gray-400">Início: ${escapeHtml(
                      formatarPercentualDetalhe(
                        usuario.porcentagemCancelamentoInicio,
                      ),
                    )}</p>
                  </div>
                </div>
              </div>
            `,
          )
          .join('')}
      </div>`
    : '<p class="text-sm text-gray-500">Nenhum dado detalhado por usuário no período selecionado.</p>';

  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-base font-semibold text-gray-700">Totais gerais ${periodo}</h3>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl bg-rose-500/90 p-5 text-white shadow-sm">
            <p class="text-xs uppercase tracking-wide">Reclamações abertas</p>
            <p class="mt-3 text-2xl font-bold">${formatarNumeroPadrao(
              totais.reclamacoesAbertas,
            )}</p>
          </div>
          <div class="rounded-2xl bg-amber-400/90 p-5 text-white shadow-sm">
            <p class="text-xs uppercase tracking-wide">Reclamações respondidas</p>
            <p class="mt-3 text-2xl font-bold">${formatarNumeroPadrao(
              totais.reclamacoesRespondidas,
            )}</p>
          </div>
          <div class="rounded-2xl bg-emerald-500/90 p-5 text-white shadow-sm">
            <p class="text-xs uppercase tracking-wide">Reclamações encerradas</p>
            <p class="mt-3 text-2xl font-bold">${formatarNumeroPadrao(
              totais.reclamacoesEncerradas,
            )}</p>
          </div>
          <div class="rounded-2xl bg-indigo-500/90 p-5 text-white shadow-sm">
            <p class="text-xs uppercase tracking-wide">Pedidos não enviados</p>
            <p class="mt-3 text-2xl font-bold">${formatarNumeroPadrao(
              totais.pedidosNaoEnviados,
            )}</p>
          </div>
        </div>
      </div>
      <div>
        <h4 class="text-base font-semibold text-gray-700">Médias de reputação</h4>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-pink-200 bg-pink-100 p-4">
            <p class="text-xs uppercase text-pink-600">Reclamação</p>
            <p class="mt-2 text-xl font-bold text-pink-700">${formatarPercentualPadrao(
              totais.porcentagemReclamacoes,
            )}</p>
            <p class="text-xs text-pink-600/80">Início: ${escapeHtml(
              formatarPercentualDetalhe(totais.porcentagemReclamacoesInicio),
            )}</p>
          </div>
          <div class="rounded-2xl border border-purple-200 bg-purple-100 p-4">
            <p class="text-xs uppercase text-purple-600">Mediação</p>
            <p class="mt-2 text-xl font-bold text-purple-700">${formatarPercentualPadrao(
              totais.porcentagemMediacao,
            )}</p>
            <p class="text-xs text-purple-600/80">Início: ${escapeHtml(
              formatarPercentualDetalhe(totais.porcentagemMediacaoInicio),
            )}</p>
          </div>
          <div class="rounded-2xl border border-sky-200 bg-sky-100 p-4">
            <p class="text-xs uppercase text-sky-600">Atraso</p>
            <p class="mt-2 text-xl font-bold text-sky-700">${formatarPercentualPadrao(
              totais.porcentagemAtraso,
            )}</p>
            <p class="text-xs text-sky-600/80">Início: ${escapeHtml(
              formatarPercentualDetalhe(totais.porcentagemAtrasoInicio),
            )}</p>
          </div>
          <div class="rounded-2xl border border-fuchsia-200 bg-fuchsia-100 p-4">
            <p class="text-xs uppercase text-fuchsia-600">Cancelado</p>
            <p class="mt-2 text-xl font-bold text-fuchsia-700">${formatarPercentualPadrao(
              totais.porcentagemCancelamento,
            )}</p>
            <p class="text-xs text-fuchsia-600/80">Início: ${escapeHtml(
              formatarPercentualDetalhe(totais.porcentagemCancelamentoInicio),
            )}</p>
          </div>
        </div>
      </div>
      <div>
        <h4 class="text-base font-semibold text-gray-700">Totais por usuário</h4>
        ${usuariosHtml}
      </div>
    </div>
  `;
}

function renderVendasUsuarios(lista) {
  const tbody = document.getElementById('vendasUsuariosTabela');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!lista.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="4" class="px-4 py-3 text-center text-gray-500">Nenhum dado de vendas encontrado para o período selecionado.</td>';
    tbody.appendChild(tr);
    return;
  }
  lista
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach((usuario) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-4 py-3">${escapeHtml(usuario.nome)}</td>
        <td class="px-4 py-3 text-right">${formatCurrency(usuario.bruto)}</td>
        <td class="px-4 py-3 text-right">${formatCurrency(usuario.liquido)}</td>
        <td class="px-4 py-3 text-right">${formatarNumeroPadrao(usuario.unidades)}</td>
      `;
      tbody.appendChild(tr);
    });
}

function renderVendasTotais(bruto, liquido, unidades, usuarios, label) {
  const container = document.getElementById('vendasTotais');
  if (!container) return;
  const periodo = label ? escapeHtml(label) : 'Período selecionado';
  container.innerHTML = `
    <div class="card flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <span class="text-xs uppercase text-gray-500">Faturamento bruto</span>
      <span class="text-xl font-semibold text-indigo-600">${formatCurrency(bruto)}</span>
      <span class="text-xs text-gray-400">${periodo}</span>
    </div>
    <div class="card flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <span class="text-xs uppercase text-gray-500">Faturamento líquido</span>
      <span class="text-xl font-semibold text-emerald-600">${formatCurrency(liquido)}</span>
      <span class="text-xs text-gray-400">${periodo}</span>
    </div>
    <div class="card flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <span class="text-xs uppercase text-gray-500">Quantidade vendida</span>
      <span class="text-xl font-semibold text-blue-600">${formatarNumeroPadrao(unidades)}</span>
      <span class="text-xs text-gray-400">${periodo}</span>
    </div>
    <div class="card flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <span class="text-xs uppercase text-gray-500">Usuários considerados</span>
      <span class="text-xl font-semibold text-gray-700">${formatarNumeroPadrao(usuarios)}</span>
      <span class="text-xs text-gray-400">Total de responsáveis vinculados</span>
    </div>
  `;
}

function renderTopSkus(skuMap) {
  const tbody = document.getElementById('vendasSkusTabela');
  if (!tbody) return;
  tbody.innerHTML = '';
  const itens = Array.from(skuMap.entries())
    .map(([sku, info]) => ({
      sku,
      quantidade: info.total,
      sobraTotal: info.sobraTotal,
      sobraMedia: info.total ? info.sobraTotal / info.total : 0,
    }))
    .filter((item) => item.quantidade > 0 || item.sobraTotal)
    .sort((a, b) => {
      const cmpQtd = (b.quantidade || 0) - (a.quantidade || 0);
      if (cmpQtd !== 0) return cmpQtd;
      return (b.sobraTotal || 0) - (a.sobraTotal || 0);
    })
    .slice(0, 10);

  if (!itens.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="4" class="px-4 py-3 text-center text-gray-500">Nenhum SKU encontrado para o período selecionado.</td>';
    tbody.appendChild(tr);
    return;
  }

  itens.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-3">${escapeHtml(item.sku)}</td>
      <td class="px-4 py-3 text-right">${formatarNumeroPadrao(item.quantidade)}</td>
      <td class="px-4 py-3 text-right">${formatCurrency(item.sobraTotal)}</td>
      <td class="px-4 py-3 text-right">${formatCurrency(item.sobraMedia)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarResumoDiarioEquipe(periodo, listaUsuarios) {
  atualizarStatus(
    'diarioStatus',
    'Carregando resumo do acompanhamento diário...',
  );
  renderDiarioTabela([]);
  renderDiarioTotais(
    {
      pedidosNaoEnviados: 0,
      reclamacoesAbertas: 0,
      reclamacoesRespondidas: 0,
      reclamacoesEncerradas: 0,
      porcentagemReclamacoes: 0,
      porcentagemCancelamento: 0,
      porcentagemAtraso: 0,
      porcentagemMediacao: 0,
      porcentagemReclamacoesInicio: 0,
      porcentagemCancelamentoInicio: 0,
      porcentagemAtrasoInicio: 0,
      porcentagemMediacaoInicio: 0,
    },
    [],
    '',
  );
  try {
    const registrosResumo = [];
    await Promise.all(
      listaUsuarios.map(async (usuario) => {
        const colResumo = collection(
          db,
          `uid/${usuario.uid}/acompanhamentoDiarioResumo`,
        );
        const constraintsResumo = buildDateConstraints(
          periodo.start,
          periodo.end,
        );
        const snapResumo = await getDocs(
          query(colResumo, ...constraintsResumo),
        );
        snapResumo.forEach((docSnap) => {
          const dados = docSnap.data() || {};
          const dataRegistro = String(dados.data || docSnap.id || '');
          if (!dataRegistro) return;
          if (periodo.start && dataRegistro < periodo.start) return;
          if (periodo.end && dataRegistro > periodo.end) return;
          registrosResumo.push({
            ...dados,
            usuarioUid: usuario.uid,
            usuarioNome: usuario.nome || usuario.email || usuario.uid,
            usuarioEmail: usuario.email || '',
          });
        });
      }),
    );

    const registros = registrosResumo.length ? registrosResumo : [];

    if (!registros.length) {
      await Promise.all(
        listaUsuarios.map(async (usuario) => {
          const colRef = collection(
            db,
            `uid/${usuario.uid}/acompanhamentoDiario`,
          );
          const snap = await getDocs(colRef);
          snap.forEach((docSnap) => {
            const dados = docSnap.data() || {};
            const dataRegistro = String(dados.data || docSnap.id || '');
            if (!dataRegistro) return;
            if (periodo.start && dataRegistro < periodo.start) return;
            if (periodo.end && dataRegistro > periodo.end) return;
            registros.push({
              ...dados,
              usuarioUid: usuario.uid,
              usuarioNome: usuario.nome || usuario.email || usuario.uid,
              usuarioEmail: usuario.email || '',
            });
          });
        }),
      );
    }

    if (!registros.length) {
      atualizarStatus(
        'diarioStatus',
        'Nenhum registro encontrado para o período selecionado.',
      );
      renderDiarioTabela([]);
      renderDiarioTotais(
        {
          pedidosNaoEnviados: 0,
          reclamacoesAbertas: 0,
          reclamacoesRespondidas: 0,
          reclamacoesEncerradas: 0,
          porcentagemReclamacoes: 0,
          porcentagemCancelamento: 0,
          porcentagemAtraso: 0,
          porcentagemMediacao: 0,
          porcentagemReclamacoesInicio: 0,
          porcentagemCancelamentoInicio: 0,
          porcentagemAtrasoInicio: 0,
          porcentagemMediacaoInicio: 0,
        },
        [],
        periodo.label || periodo.descricao || '',
      );
      return;
    }

    const { linhas, totais, totaisUsuarios } =
      agruparRegistrosDiariosGestor(registros);
    renderDiarioTabela(linhas);
    renderDiarioTotais(
      totais,
      totaisUsuarios,
      periodo.label || periodo.descricao || '',
    );
    atualizarStatus(
      'diarioStatus',
      `${linhas.length} registros consolidados${periodo.descricao ? ` • ${periodo.descricao}` : ''}.`,
      'sucesso',
    );
  } catch (err) {
    console.error('Erro ao carregar acompanhamento diário da equipe', err);
    atualizarStatus(
      'diarioStatus',
      'Erro ao carregar os dados do acompanhamento diário.',
      'erro',
    );
  }
}

async function carregarResumoVendasEquipe(periodo, listaUsuarios) {
  atualizarStatus('vendasStatus', 'Carregando dados de vendas...');
  renderVendasUsuarios([]);
  renderVendasTotais(0, 0, 0, listaUsuarios.length, periodo.descricao || '');
  renderTopSkus(new Map());
  try {
    const passphrase = getPassphrase();
    const usuariosResumo = [];
    const skuMap = new Map();
    let totalBrutoGeral = 0;
    let totalLiquidoGeral = 0;
    let totalUnidadesGerais = 0;

    for (const usuario of listaUsuarios) {
      const { uid } = usuario;
      let brutoUsuario = 0;
      let liquidoUsuario = 0;
      let unidadesUsuario = 0;
      const colFat = collection(db, `uid/${uid}/faturamento`);
      const constraints = buildDateConstraints(periodo.start, periodo.end);
      const fatSnap = await getDocs(query(colFat, ...constraints));

      for (const docSnap of fatSnap.docs) {
        const dia = docSnap.id;
        const { bruto, liquido } = await calcularFaturamentoDia(
          uid,
          dia,
          passphrase,
        );
        brutoUsuario += bruto;
        liquidoUsuario += liquido;
        totalBrutoGeral += bruto;
        totalLiquidoGeral += liquido;

        const resultadoSkus = await carregarSkusDia(
          uid,
          dia,
          skuMap,
          passphrase,
        );
        unidadesUsuario += resultadoSkus.unidades;
        totalUnidadesGerais += resultadoSkus.unidades;
      }

      usuariosResumo.push({
        uid,
        nome: usuario.nome || usuario.email || uid,
        bruto: brutoUsuario,
        liquido: liquidoUsuario,
        unidades: unidadesUsuario,
      });
    }

    renderVendasUsuarios(usuariosResumo);
    renderVendasTotais(
      totalBrutoGeral,
      totalLiquidoGeral,
      totalUnidadesGerais,
      listaUsuarios.length,
      periodo.descricao || '',
    );
    renderTopSkus(skuMap);
    atualizarStatus(
      'vendasStatus',
      `Resumo carregado${periodo.descricao ? ` • ${periodo.descricao}` : ''}.`,
      'sucesso',
    );
  } catch (err) {
    console.error('Erro ao carregar acompanhamento de vendas', err);
    atualizarStatus(
      'vendasStatus',
      'Erro ao carregar dados de vendas.',
      'erro',
    );
  }
}

async function aplicarFiltros() {
  if (carregando) return;
  const periodo = obterPeriodoSelecionado();
  const usuarioSel = document.getElementById('resumoFiltroUsuario');
  const selecionado = usuarioSel?.value || 'todos';
  if (!periodo) {
    atualizarStatus('diarioStatus', 'Selecione um período válido.', 'erro');
    atualizarStatus('vendasStatus', 'Selecione um período válido.', 'erro');
    return;
  }
  const lista =
    selecionado === 'todos'
      ? usuariosEquipe
      : usuariosEquipe.filter((u) => u.uid === selecionado);
  if (!lista.length) {
    atualizarStatus(
      'diarioStatus',
      'Nenhum usuário disponível para o filtro selecionado.',
      'erro',
    );
    atualizarStatus(
      'vendasStatus',
      'Nenhum usuário disponível para o filtro selecionado.',
      'erro',
    );
    return;
  }
  const periodoLabel = document.getElementById(
    'resumoFiltroPeriodoSelecionado',
  );
  if (periodoLabel) {
    periodoLabel.textContent = periodo.descricao
      ? `Período selecionado: ${periodo.descricao}`
      : '';
  }
  carregando = true;
  try {
    await Promise.all([
      carregarResumoDiarioEquipe(periodo, lista),
      carregarResumoVendasEquipe(periodo, lista),
    ]);
  } finally {
    carregando = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  configurarTabs();
  configurarTipoPeriodo();
  document
    .getElementById('resumoFiltroAplicar')
    ?.addEventListener('click', aplicarFiltros);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  try {
    const { usuarios } = await carregarUsuariosFinanceiros(db, user);
    usuariosEquipe = usuarios || [];
  } catch (err) {
    console.error('Erro ao carregar usuários financeiros', err);
    usuariosEquipe = [
      {
        uid: user.uid,
        nome: user.displayName || user.email || 'Usuário',
        email: user.email || '',
      },
    ];
  }
  popularUsuariosSelect();
  definirValoresPadraoFiltro();
  await aplicarFiltros();
});
