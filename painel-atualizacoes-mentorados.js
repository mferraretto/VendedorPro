import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  documentId,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig, getPassphrase } from './firebase-config.js';
import { carregarUsuariosFinanceiros } from './responsavel-financeiro.js';
import { encryptString, decryptString } from './crypto.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const formMensagem = document.getElementById('formMensagem');
const formProblema = document.getElementById('formProblema');
const formProduto = document.getElementById('formProduto');
const mensagemInput = document.getElementById('mensagemTexto');
const problemaTituloInput = document.getElementById('problemaTitulo');
const problemaSolucaoInput = document.getElementById('problemaSolucao');
const problemaSetorInput = document.getElementById('problemaSetor');
const problemaResponsavelInput = document.getElementById('problemaResponsavel');
const problemaDataInput = document.getElementById('problemaData');
const produtoNomeInput = document.getElementById('produtoNome');
const produtoObsInput = document.getElementById('produtoObs');

const listaMensagensEl = document.getElementById('listaMensagens');
const listaProblemasEl = document.getElementById('listaProblemas');
const listaProdutosEl = document.getElementById('listaProdutos');
const mensagensVazioEl = document.getElementById('mensagensVazio');
const problemasVazioEl = document.getElementById('problemasVazio');
const produtosVazioEl = document.getElementById('produtosVazio');
const mensagemStatusEl = document.getElementById('mensagemStatus');
const problemaStatusEl = document.getElementById('problemaStatus');
const produtoStatusEl = document.getElementById('produtoStatus');
const painelStatusEl = document.getElementById('painelStatus');
const produtosAvisoEl = document.getElementById('produtosAviso');
const mensagemEscopoEl = document.getElementById('mensagemEscopo');
const exportarPecasBtn = document.getElementById('exportarPecasBtn');
const sincronizarCustosBtn = document.getElementById('sincronizarCustosBtn');
const participantesListaEl = document.getElementById('participantesLista');
const participantesResumoEl = document.getElementById('participantesResumo');
const participantesVazioEl = document.getElementById('participantesVazio');
const limparParticipantesBtn = document.getElementById(
  'limparParticipantesBtn',
);

const VISIBILIDADE_GLOBAL_ID = '__todos_conectados__';

let currentUser = null;
let participantesCompartilhamento = [VISIBILIDADE_GLOBAL_ID];
let mensagensUnsub = null;
let problemasUnsub = null;
let produtosUnsub = null;
let produtosImportacoesUnsub = null;
let produtosImportadosUnsub = null;
let manualProdutosCache = [];
let importadosProdutosCache = [];
let ultimaImportacaoMeta = null;
let manualProdutosPronto = false;
let importadosProdutosPronto = false;
let nomeResponsavel = '';
let participantesDetalhes = [];
let participantesPorUid = new Map();
let participantesSelecionados = new Set();

function setStatus(element, message = '', isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('text-red-600', Boolean(message) && isError);
  element.classList.toggle('text-gray-500', !isError);
}

function showTemporaryStatus(
  element,
  message,
  isError = false,
  timeout = 5000,
) {
  if (!element) return;
  setStatus(element, message, isError);
  if (message) {
    setTimeout(() => {
      if (element.textContent === message) {
        setStatus(element, '');
      }
    }, timeout);
  }
}

function formatDate(value, includeTime = true) {
  if (!value) return '';
  let date = null;
  if (value.toDate) {
    try {
      date = value.toDate();
    } catch (_) {
      date = null;
    }
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      date = parsed;
    }
  }
  if (!date) return '';
  return includeTime
    ? date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : date.toLocaleDateString('pt-BR');
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function montarDetalhesParticipante(uid, data = {}) {
  const nomeFonte =
    data.nomeCompleto ||
    data.nome ||
    data.displayName ||
    data.nomeFantasia ||
    data.razaoSocial ||
    data.fantasia ||
    data.usuario ||
    data.email ||
    '';
  const papelFonte =
    data.perfil ||
    data.funcao ||
    data.cargo ||
    data.papel ||
    data.tipo ||
    data.role ||
    data.departamento ||
    '';
  const emailFonte =
    data.email ||
    data.usuarioEmail ||
    data.loginEmail ||
    data.contatoEmail ||
    '';

  const nome = String(nomeFonte || '').trim() || `Usuário ${uid.slice(0, 6)}`;
  const papel = String(papelFonte || '').trim();
  const email = String(emailFonte || '').trim();

  return {
    uid,
    nome,
    papel,
    email,
    isAtual: currentUser?.uid === uid,
  };
}

async function carregarDetalhesParticipantes(uids = []) {
  const validos = Array.from(
    new Set(
      (uids || []).filter(
        (uid) =>
          typeof uid === 'string' && uid && uid !== VISIBILIDADE_GLOBAL_ID,
      ),
    ),
  );

  const detalhesMap = new Map();
  const buscarEmColecao = async (colecao, ids) => {
    for (let i = 0; i < ids.length; i += 10) {
      const lote = ids.slice(i, i + 10);
      if (!lote.length) continue;
      try {
        const snap = await getDocs(
          query(collection(db, colecao), where(documentId(), 'in', lote)),
        );
        snap.forEach((docSnap) => {
          const uid = docSnap.id;
          const data = docSnap.data() || {};
          detalhesMap.set(uid, montarDetalhesParticipante(uid, data));
        });
      } catch (err) {
        console.error(
          `Erro ao carregar participantes (${colecao}) para seleção:`,
          err,
        );
      }
    }
  };

  if (validos.length) {
    await buscarEmColecao('usuarios', validos);
    const faltantes = validos.filter((uid) => !detalhesMap.has(uid));
    if (faltantes.length) {
      await buscarEmColecao('uid', faltantes);
    }
    const aindaFaltando = validos.filter((uid) => !detalhesMap.has(uid));
    aindaFaltando.forEach((uid) => {
      detalhesMap.set(uid, {
        uid,
        nome: `Usuário ${uid.slice(0, 6)}`,
        papel: 'Perfil não identificado',
        email: '',
        isAtual: currentUser?.uid === uid,
      });
    });
  }

  participantesPorUid = detalhesMap;
  participantesDetalhes = Array.from(detalhesMap.values()).sort((a, b) => {
    if (a.isAtual && !b.isAtual) return -1;
    if (!a.isAtual && b.isAtual) return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  });

  participantesSelecionados = new Set(
    Array.from(participantesSelecionados).filter((uid) =>
      participantesPorUid.has(uid),
    ),
  );

  renderizarParticipantesDisponiveis();
}

function renderizarParticipantesDisponiveis() {
  if (!participantesListaEl) {
    atualizarResumoDestinatarios();
    return;
  }

  participantesListaEl.innerHTML = '';

  if (!participantesDetalhes.length) {
    participantesVazioEl?.classList.remove('hidden');
    atualizarResumoDestinatarios();
    return;
  }

  participantesVazioEl?.classList.add('hidden');
  const frag = document.createDocumentFragment();

  participantesDetalhes.forEach((info) => {
    const item = document.createElement('label');
    item.className =
      'flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-300';
    item.dataset.uid = info.uid;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className =
      'mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500';
    checkbox.checked = participantesSelecionados.has(info.uid);
    checkbox.addEventListener('change', (event) => {
      if (event.target.checked) {
        participantesSelecionados.add(info.uid);
      } else {
        participantesSelecionados.delete(info.uid);
      }
      atualizarResumoDestinatarios();
    });

    const content = document.createElement('div');
    content.className = 'flex-1 min-w-0';

    const nomeEl = document.createElement('p');
    nomeEl.className = 'text-sm font-medium text-gray-800';
    if (info.isAtual) {
      nomeEl.textContent = `${info.nome || 'Você'} (você)`;
    } else {
      nomeEl.textContent = info.nome || 'Usuário';
    }

    const detalheEl = document.createElement('p');
    detalheEl.className = 'text-xs text-gray-500';
    if (info.papel && info.email) {
      detalheEl.textContent = `${info.papel} • ${info.email}`;
    } else if (info.papel) {
      detalheEl.textContent = info.papel;
    } else if (info.email) {
      detalheEl.textContent = info.email;
    } else {
      detalheEl.textContent = 'Sem detalhes adicionais';
    }

    content.appendChild(nomeEl);
    content.appendChild(detalheEl);

    item.appendChild(checkbox);
    item.appendChild(content);
    frag.appendChild(item);
  });

  participantesListaEl.appendChild(frag);
  atualizarResumoDestinatarios();
}

function atualizarResumoDestinatarios() {
  const selecionados = Array.from(participantesSelecionados);
  const totalDisponiveis = participantesDetalhes.length;

  if (participantesResumoEl) {
    if (!totalDisponiveis) {
      participantesResumoEl.textContent =
        'Nenhum participante disponível para seleção.';
    } else if (!selecionados.length) {
      participantesResumoEl.textContent = `Nenhum destinatário selecionado. As atualizações alcançarão os ${totalDisponiveis} usuários conectados.`;
    } else if (selecionados.length === 1) {
      const info = participantesPorUid.get(selecionados[0]);
      const nome = info?.nome || '1 usuário';
      participantesResumoEl.textContent = `Enviando somente para ${nome}.`;
    } else {
      participantesResumoEl.textContent = `Enviando para ${selecionados.length} destinatários selecionados.`;
    }
  }

  if (mensagemEscopoEl) {
    if (!selecionados.length) {
      mensagemEscopoEl.textContent =
        'Informações visíveis para todos os perfis conectados.';
    } else if (selecionados.length === 1) {
      const info = participantesPorUid.get(selecionados[0]);
      const nome = info?.nome || '1 usuário';
      mensagemEscopoEl.textContent = `Informações visíveis apenas para ${nome}.`;
    } else {
      mensagemEscopoEl.textContent = `Informações visíveis apenas para ${selecionados.length} destinatários selecionados.`;
    }
  }
}

function obterParticipantesParaEnvio() {
  if (!participantesSelecionados.size) {
    return participantesCompartilhamento;
  }
  const destino = new Set(participantesSelecionados);
  if (currentUser?.uid) destino.add(currentUser.uid);
  return Array.from(destino);
}

function limparSelecaoDestinatarios() {
  if (!participantesSelecionados.size) {
    atualizarResumoDestinatarios();
    return;
  }
  participantesSelecionados.clear();
  participantesListaEl
    ?.querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.checked = false;
    });
  atualizarResumoDestinatarios();
}

function obterNomeProduto(item) {
  if (!item || typeof item !== 'object') return '';
  return item.nome || item.produto || '';
}

function compararProdutosPorNome(a, b) {
  const nomeA = obterNomeProduto(a).toLowerCase();
  const nomeB = obterNomeProduto(b).toLowerCase();
  if (nomeA && nomeB && nomeA !== nomeB) {
    return nomeA.localeCompare(nomeB, 'pt-BR');
  }
  if (nomeA && !nomeB) return -1;
  if (!nomeA && nomeB) return 1;

  const skuA = (a?.sku || '').toLowerCase();
  const skuB = (b?.sku || '').toLowerCase();
  if (skuA && skuB && skuA !== skuB) {
    return skuA.localeCompare(skuB, 'pt-BR');
  }
  if (skuA && !skuB) return -1;
  if (!skuA && skuB) return 1;

  if (typeof a?.ordem === 'number' && typeof b?.ordem === 'number') {
    return a.ordem - b.ordem;
  }

  return 0;
}

function renderProdutoCard(item) {
  if (item?.tipo === 'importado') {
    return renderProdutoImportado(item);
  }
  return renderProdutoManual(item);
}

function renderProdutoManual(item = {}) {
  const card = document.createElement('article');
  card.className =
    'bg-white border border-emerald-100 rounded-lg p-3 shadow-sm';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between text-sm text-gray-700';

  const nomeEl = document.createElement('span');
  nomeEl.className = 'font-semibold';
  nomeEl.textContent = item.nome || 'Produto sem nome';
  header.appendChild(nomeEl);

  if (item.autorNome) {
    const autorEl = document.createElement('span');
    autorEl.className = 'text-xs text-gray-500';
    autorEl.textContent = `Por ${item.autorNome}`;
    header.appendChild(autorEl);
  }

  card.appendChild(header);

  if (item.observacoes) {
    const obs = document.createElement('p');
    obs.className = 'mt-2 text-sm text-gray-600 whitespace-pre-line';
    obs.textContent = item.observacoes;
    card.appendChild(obs);
  }

  if (item.createdAt) {
    const dataCriacao = document.createElement('p');
    dataCriacao.className = 'mt-2 text-[11px] text-gray-400';
    dataCriacao.textContent = `Atualizado em ${formatDate(item.createdAt, true)}`;
    card.appendChild(dataCriacao);
  }

  return card;
}

function renderProdutoImportado(item = {}) {
  const card = document.createElement('article');
  card.className =
    'bg-white border border-emerald-100 rounded-lg p-3 shadow-sm space-y-2';

  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-2';

  const nomeEl = document.createElement('span');
  nomeEl.className = 'font-semibold text-sm text-gray-800';
  nomeEl.textContent = obterNomeProduto(item) || 'Produto sem nome';
  header.appendChild(nomeEl);

  const precoTexto = formatCurrency(item.sobra);
  if (precoTexto) {
    const precoEl = document.createElement('span');
    precoEl.className =
      'text-sm font-semibold text-emerald-600 whitespace-nowrap';
    precoEl.textContent = precoTexto;
    header.appendChild(precoEl);
  }

  card.appendChild(header);

  if (item.sku) {
    const skuRow = document.createElement('p');
    skuRow.className = 'text-xs text-gray-600';
    const label = document.createElement('span');
    label.className = 'font-medium text-gray-700';
    label.textContent = 'SKU: ';
    const skuValue = document.createElement('span');
    skuValue.className = 'font-mono text-gray-700';
    skuValue.textContent = item.sku;
    skuRow.appendChild(label);
    skuRow.appendChild(skuValue);
    card.appendChild(skuRow);
  }

  const footer = document.createElement('div');
  footer.className = 'text-[11px] text-gray-400 flex flex-wrap gap-x-2 gap-y-1';

  const dataReferencia =
    item.dataReferencia || ultimaImportacaoMeta?.dataReferencia || '';
  const referenciaFormatada = formatDate(dataReferencia, false);
  if (referenciaFormatada) {
    const referenciaEl = document.createElement('span');
    referenciaEl.textContent = `Referência: ${referenciaFormatada}`;
    footer.appendChild(referenciaEl);
  }

  const atualizadoEm = item.atualizadoEm || ultimaImportacaoMeta?.criadoEm;
  const atualizadoFormatado = formatDate(atualizadoEm, true);
  if (atualizadoFormatado) {
    const atualizadoEl = document.createElement('span');
    atualizadoEl.textContent = `Atualizado em ${atualizadoFormatado}`;
    footer.appendChild(atualizadoEl);
  }

  const origemEl = document.createElement('span');
  origemEl.textContent = 'Origem: Produtos/Preços';
  footer.appendChild(origemEl);

  if (footer.childElementCount) {
    card.appendChild(footer);
  }

  return card;
}

function atualizarStatusProdutos() {
  if (!produtoStatusEl) return;

  if (!manualProdutosPronto && !importadosProdutosPronto) {
    setStatus(produtoStatusEl, 'Carregando peças em linha...', false);
    return;
  }

  const partes = [];

  if (importadosProdutosCache.length) {
    const total = importadosProdutosCache.length;
    const descricao = [];
    descricao.push(
      `${total} peça${total === 1 ? '' : 's'} importada${
        total === 1 ? '' : 's'
      }`,
    );

    const dataReferencia =
      ultimaImportacaoMeta?.dataReferencia ||
      importadosProdutosCache[0]?.dataReferencia;
    const referenciaFormatada = formatDate(dataReferencia, false);
    if (referenciaFormatada) {
      descricao.push(`referência ${referenciaFormatada}`);
    }

    const atualizadoEm =
      ultimaImportacaoMeta?.criadoEm ||
      importadosProdutosCache[0]?.atualizadoEm;
    const atualizadoFormatado = formatDate(atualizadoEm, true);
    if (atualizadoFormatado) {
      descricao.push(`disponível desde ${atualizadoFormatado}`);
    }

    partes.push(descricao.join(' • '));
  }

  if (manualProdutosCache.length) {
    const total = manualProdutosCache.length;
    partes.push(
      `${total} peça${total === 1 ? '' : 's'} cadastrada manualmente`,
    );
  }

  if (!partes.length) {
    setStatus(produtoStatusEl, '', false);
    return;
  }

  setStatus(produtoStatusEl, partes.join(' | '), false);
}

function atualizarListaProdutos() {
  if (!listaProdutosEl) return;

  listaProdutosEl.innerHTML = '';

  const itensImportados = [...importadosProdutosCache].sort(
    compararProdutosPorNome,
  );
  const itensManuais = [...manualProdutosCache].sort(compararProdutosPorNome);
  const todos = [...itensImportados, ...itensManuais];

  if (!todos.length) {
    if (manualProdutosPronto && importadosProdutosPronto) {
      produtosVazioEl?.classList.remove('hidden');
    } else {
      produtosVazioEl?.classList.add('hidden');
    }
    atualizarStatusProdutos();
    return;
  }

  produtosVazioEl?.classList.add('hidden');
  const frag = document.createDocumentFragment();
  todos.forEach((item) => {
    frag.appendChild(renderProdutoCard(item));
  });
  listaProdutosEl.appendChild(frag);
  atualizarStatusProdutos();
}

let xlsxLoaderPromise = null;

async function ensureXlsxLoaded() {
  if (window.XLSX) return window.XLSX;
  if (!xlsxLoaderPromise) {
    xlsxLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src =
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = () =>
        reject(new Error('Falha ao carregar biblioteca XLSX.'));
      document.head.appendChild(script);
    });
  }
  try {
    const lib = await xlsxLoaderPromise;
    return lib;
  } catch (err) {
    xlsxLoaderPromise = null;
    throw err;
  }
}

function normalizarSkuChave(valor) {
  const texto = String(valor ?? '')
    .trim()
    .toUpperCase();
  return texto || '';
}

function converterNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }
  const texto = String(valor)
    .trim()
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function numerosSaoQuaseIguais(a, b, tolerancia = 0.009) {
  const numA = converterNumero(a);
  const numB = converterNumero(b);
  if (numA === null || numB === null) return false;
  return Math.abs(numA - numB) <= tolerancia;
}

function calcularTotaisTaxasPainel(taxas = {}, conversor) {
  return Object.entries(taxas).reduce(
    (acc, [chave, valor]) => {
      const numero = conversor ? conversor(valor) : Number(valor);
      if (!Number.isFinite(numero)) return acc;
      if (String(chave).includes('%')) acc.percent += numero;
      else acc.fix += numero;
      return acc;
    },
    { percent: 0, fix: 0 },
  );
}

function calcularPrecosComNovoCusto(produto = {}, novoCusto) {
  const niveis = ['minimo', 'medio', 'maximo'];
  const custoConvertido = converterNumero(novoCusto);
  const custoNumero = Number.isFinite(custoConvertido) ? custoConvertido : 0;

  const normalizarCustos = (custos = {}) => {
    const resultado = {};
    niveis.forEach((nivel) => {
      const info = custos?.[nivel] || {};
      resultado[nivel] = {
        valor: converterNumero(info.valor),
        comissao: converterNumero(info.comissao) || 0,
      };
    });
    return resultado;
  };

  const custosOriginais =
    produto && produto.custos
      ? normalizarCustos(produto.custos)
      : normalizarCustos({
          medio: { valor: converterNumero(produto.custo), comissao: 0 },
        });

  const custosAtualizados = {
    ...custosOriginais,
    medio: {
      valor: custoNumero,
      comissao: custosOriginais.medio?.comissao || 0,
    },
  };

  let percentualTotal = 0;
  let valorFixoTotal = 0;

  if (produto && typeof produto === 'object' && produto.taxas) {
    Object.entries(produto.taxas).forEach(([chave, valor]) => {
      const numero = converterNumero(valor);
      if (numero === null) return;
      if (String(chave).includes('%')) {
        percentualTotal += numero;
      } else {
        valorFixoTotal += numero;
      }
    });
  }

  const calcularParaCustos = (percentualExtra = 0, fixoExtra = 0) => {
    const calculos = {};
    let referencia = null;
    niveis.forEach((nivel) => {
      const info = custosAtualizados[nivel];
      if (!info || !(info.valor > 0)) return;
      const percent = percentualTotal + percentualExtra + (info.comissao || 0);
      if (percent >= 100) {
        calculos[nivel] = null;
        return;
      }
      const fixoTotalAtual = valorFixoTotal + fixoExtra;
      const precoCalculado =
        info.valor + fixoTotalAtual + (info.valor * percent) / 100;
      calculos[nivel] = {
        custo: Number.isFinite(info.valor) ? Number(info.valor.toFixed(2)) : 0,
        comissao: info.comissao || 0,
        preco: Number(precoCalculado.toFixed(2)),
      };
      if (!referencia || (referencia !== 'medio' && nivel === 'medio')) {
        referencia = nivel;
      }
    });
    if (!referencia)
      referencia = niveis.find((nivel) => calculos[nivel]) || 'medio';
    const resumo = {
      precoMinimo: calculos.minimo?.preco ?? null,
      precoMedio: calculos.medio?.preco ?? null,
      precoIdeal: calculos.maximo?.preco ?? null,
    };
    return { calculos, referencia, resumo };
  };

  const baseCalculo = calcularParaCustos();
  const referenciaDados = baseCalculo.calculos[baseCalculo.referencia] || {
    preco: 0,
    custo: custoNumero,
  };
  const obterPrecoResumo = (resumo, ordem) => {
    for (const chave of ordem) {
      const valor = resumo?.[chave];
      if (typeof valor === 'number' && Number.isFinite(valor)) {
        return valor;
      }
    }
    return 0;
  };
  const precoMinimoCalculado = obterPrecoResumo(baseCalculo.resumo, [
    'precoMinimo',
    'precoMedio',
    'precoIdeal',
  ]);
  const precoMedioCalculado = obterPrecoResumo(baseCalculo.resumo, [
    'precoMedio',
    'precoIdeal',
    'precoMinimo',
  ]);
  const precoIdealCalculado = obterPrecoResumo(baseCalculo.resumo, [
    'precoIdeal',
    'precoMedio',
    'precoMinimo',
  ]);

  const arredondar = (valor) =>
    Number.isFinite(valor) ? Number(valor.toFixed(2)) : 0;

  const calculosTaxas = {};
  if (produto?.calculosTaxas) {
    Object.entries(produto.calculosTaxas).forEach(([taxaKey, valores]) => {
      const taxaNumero = converterNumero(
        valores?.taxas?.['Taxas da Plataforma (%)'] || taxaKey,
      );
      const taxasDetalhadas = valores?.taxas || {
        ...produto.taxas,
        'Taxas da Plataforma (%)': taxaNumero,
      };
      const extras = calcularTotaisTaxasPainel(
        taxasDetalhadas,
        converterNumero,
      );
      const calculos = calcularParaCustos(
        extras.percent - percentualTotal,
        extras.fix - valorFixoTotal,
      );
      const resumoAtual = calculos.resumo;
      const precoMinimoTaxa = obterPrecoResumo(resumoAtual, [
        'precoMinimo',
        'precoMedio',
        'precoIdeal',
      ]);
      const precoMedioTaxa = obterPrecoResumo(resumoAtual, [
        'precoMedio',
        'precoIdeal',
        'precoMinimo',
      ]);
      const precoIdealTaxa = obterPrecoResumo(resumoAtual, [
        'precoIdeal',
        'precoMedio',
        'precoMinimo',
      ]);
      calculosTaxas[taxaKey] = {
        referencia: calculos.referencia,
        precosPorCusto: calculos.calculos,
        precoMinimo: precoMinimoTaxa,
        precoMedio: precoMedioTaxa,
        precoIdeal: precoIdealTaxa,
        precoPromo: precoMinimoTaxa,
        taxas: taxasDetalhadas,
      };
    });
  }

  return {
    custo: arredondar(referenciaDados.custo || custoNumero),
    precoMinimo: arredondar(precoMinimoCalculado),
    precoPromo: arredondar(precoMinimoCalculado),
    precoMedio: arredondar(precoMedioCalculado),
    precoIdeal: arredondar(precoIdealCalculado),
    custos: custosAtualizados,
    precosPorCusto: baseCalculo.calculos,
    referenciaCusto: baseCalculo.referencia,
    calculosTaxas,
  };
}

function coletarItensParaExportacao() {
  const itens = [];
  if (Array.isArray(importadosProdutosCache)) {
    importadosProdutosCache.forEach((item) => {
      const sobraNumero = converterNumero(item.sobra);
      itens.push({
        Data:
          formatDate(
            item.dataReferencia ||
              item.atualizadoEm ||
              ultimaImportacaoMeta?.dataReferencia,
            false,
          ) || '',
        SKU: item.sku || '',
        Produto: obterNomeProduto(item),
        Sobra:
          sobraNumero !== null
            ? Number((Math.round(sobraNumero * 100) / 100).toFixed(2))
            : '',
      });
    });
  }

  if (Array.isArray(manualProdutosCache)) {
    manualProdutosCache.forEach((item) => {
      itens.push({
        Data: formatDate(item.createdAt, false) || '',
        SKU: item.sku || '',
        Produto: obterNomeProduto(item),
        Sobra: '',
      });
    });
  }

  return itens;
}

function obterItensParaSincronizacao() {
  const mapa = new Map();
  if (!Array.isArray(importadosProdutosCache)) return mapa;
  importadosProdutosCache.forEach((item) => {
    const skuNormalizado = normalizarSkuChave(item.sku);
    if (!skuNormalizado) return;
    const sobraNumero = converterNumero(item.sobra);
    if (sobraNumero === null) return;
    const custoNormalizado = Math.round(sobraNumero * 100) / 100;
    mapa.set(skuNormalizado, {
      skuOriginal: item.sku || '',
      custo: custoNormalizado,
      item,
    });
  });
  return mapa;
}

async function buscarProdutosPorSkus(uid, itensMap) {
  const encontrados = new Map();
  if (!uid || !itensMap.size) return encontrados;

  let snap;
  try {
    snap = await getDocs(collection(db, 'uid', uid, 'produtos'));
  } catch (err) {
    console.error(
      'Erro ao carregar produtos cadastrados para comparação de SKUs:',
      err,
    );
    throw err;
  }

  const candidatosSenha = [];
  const passLocal = getPassphrase();
  if (passLocal) candidatosSenha.push(passLocal);
  if (uid) {
    candidatosSenha.push(`chave-${uid}`);
    candidatosSenha.push(uid);
  }

  for (const docSnap of snap.docs) {
    const docData = docSnap.data() || {};
    let dadosProduto = docData;
    let descriptografado = false;

    if (docData.encrypted) {
      for (const senha of candidatosSenha) {
        if (!senha) continue;
        try {
          const texto = await decryptString(docData.encrypted, senha);
          if (texto) {
            dadosProduto = JSON.parse(texto);
            descriptografado = true;
            break;
          }
        } catch (err) {
          // tenta próximo candidato
        }
      }
      if (!descriptografado) {
        console.warn(
          `Não foi possível descriptografar o produto ${docSnap.id} para sincronização de custos.`,
        );
        continue;
      }
    }

    if (!dadosProduto || typeof dadosProduto !== 'object') continue;
    const skuNormalizado = normalizarSkuChave(
      dadosProduto.sku || docData.sku || docSnap.id,
    );
    if (!skuNormalizado || !itensMap.has(skuNormalizado)) continue;

    encontrados.set(skuNormalizado, {
      ref: docSnap.ref,
      data: dadosProduto,
      raw: docData,
      encrypted: Boolean(docData.encrypted),
    });
  }

  return encontrados;
}

async function atualizarProdutosComSobras(uid, itensMap) {
  const encontrados = await buscarProdutosPorSkus(uid, itensMap);
  let encontradosTotal = 0;
  let atualizados = 0;
  const senhaCriptografia = getPassphrase() || `chave-${uid}`;

  for (const [skuNormalizado, itemImportado] of itensMap.entries()) {
    const produtoExistente = encontrados.get(skuNormalizado);
    if (!produtoExistente) continue;
    encontradosTotal += 1;

    const dadosAtuais = produtoExistente.data || {};
    const precosAtualizados = calcularPrecosComNovoCusto(
      dadosAtuais,
      itemImportado.custo,
    );

    const jaAtualizado =
      numerosSaoQuaseIguais(dadosAtuais.custo, precosAtualizados.custo) &&
      numerosSaoQuaseIguais(
        dadosAtuais.precoMinimo,
        precosAtualizados.precoMinimo,
      ) &&
      numerosSaoQuaseIguais(
        dadosAtuais.precoIdeal,
        precosAtualizados.precoIdeal,
      ) &&
      numerosSaoQuaseIguais(
        dadosAtuais.precoMedio,
        precosAtualizados.precoMedio,
      ) &&
      numerosSaoQuaseIguais(
        dadosAtuais.precoPromo,
        precosAtualizados.precoPromo,
      );

    if (jaAtualizado) {
      continue;
    }

    const payloadAtualizado = {
      ...dadosAtuais,
      ...precosAtualizados,
      custo: precosAtualizados.custo,
      atualizadoEm: new Date().toISOString(),
    };

    try {
      if (produtoExistente.encrypted) {
        const encryptedPayload = await encryptString(
          JSON.stringify(payloadAtualizado),
          senhaCriptografia,
        );
        await setDoc(
          produtoExistente.ref,
          {
            uid,
            encrypted: encryptedPayload,
          },
          { merge: true },
        );
      } else {
        await setDoc(produtoExistente.ref, payloadAtualizado, { merge: true });
      }
      atualizados += 1;
    } catch (err) {
      console.error(
        `Erro ao atualizar custo do produto ${skuNormalizado}:`,
        err,
      );
    }
  }

  return { encontrados: encontradosTotal, atualizados };
}

async function exportarPecasEmLinha() {
  const itens = coletarItensParaExportacao();
  if (!itens.length) {
    showTemporaryStatus(
      produtoStatusEl,
      'Não há peças em linha disponíveis para exportação no momento.',
      true,
    );
    return;
  }

  exportarPecasBtn?.setAttribute('disabled', 'true');
  try {
    const XLSX = await ensureXlsxLoaded();
    if (!XLSX) throw new Error('Biblioteca XLSX indisponível.');
    const ws = XLSX.utils.json_to_sheet(itens);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Peças');
    XLSX.writeFile(wb, 'pecas_em_linha.xlsx');
    showTemporaryStatus(
      produtoStatusEl,
      `Planilha exportada com ${itens.length} peça${
        itens.length === 1 ? '' : 's'
      } em linha.`,
    );
  } catch (err) {
    console.error('Erro ao exportar peças em linha:', err);
    showTemporaryStatus(
      produtoStatusEl,
      'Não foi possível exportar a planilha de peças em linha.',
      true,
    );
  } finally {
    exportarPecasBtn?.removeAttribute('disabled');
  }
}

async function sincronizarCustosComSobras() {
  if (!currentUser) {
    showTemporaryStatus(
      produtoStatusEl,
      'É necessário estar autenticado para atualizar os custos dos produtos.',
      true,
    );
    return;
  }

  const itensMap = obterItensParaSincronizacao();
  if (!itensMap.size) {
    showTemporaryStatus(
      produtoStatusEl,
      'Nenhuma peça importada com SKU e sobra disponível para sincronizar.',
      true,
    );
    return;
  }

  sincronizarCustosBtn?.setAttribute('disabled', 'true');
  setStatus(
    produtoStatusEl,
    'Atualizando custos e precificação com base nas sobras...',
    false,
  );

  try {
    const resultado = await atualizarProdutosComSobras(
      currentUser.uid,
      itensMap,
    );
    const naoEncontrados = itensMap.size - resultado.encontrados;
    const partes = [];
    partes.push(
      `Custos recalculados para ${resultado.atualizados} produto${
        resultado.atualizados === 1 ? '' : 's'
      }`,
    );
    if (naoEncontrados > 0) {
      partes.push(
        `${naoEncontrados} SKU${naoEncontrados === 1 ? '' : 's'} não encontrado${
          naoEncontrados === 1 ? '' : 's'
        } nos produtos cadastrados`,
      );
    }
    showTemporaryStatus(
      produtoStatusEl,
      partes.join('. ') + '.',
      naoEncontrados > 0,
    );
    setTimeout(() => atualizarStatusProdutos(), 5200);
  } catch (err) {
    console.error('Erro ao sincronizar custos com sobras:', err);
    showTemporaryStatus(
      produtoStatusEl,
      'Não foi possível atualizar os custos com base nas sobras importadas.',
      true,
    );
    setTimeout(() => atualizarStatusProdutos(), 5200);
  } finally {
    sincronizarCustosBtn?.removeAttribute('disabled');
  }
}

function monitorarItensImportados(importacaoRef) {
  produtosImportadosUnsub?.();
  importadosProdutosPronto = false;

  if (!importacaoRef) {
    importadosProdutosCache = [];
    importadosProdutosPronto = true;
    atualizarListaProdutos();
    return;
  }

  const itensRef = query(
    collection(importacaoRef, 'itens'),
    orderBy('ordem', 'asc'),
  );

  produtosImportadosUnsub = onSnapshot(
    itensRef,
    (snap) => {
      importadosProdutosCache = snap.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          tipo: 'importado',
          id: docSnap.id,
          produto: data.produto || data.nome || '',
          nome: data.produto || data.nome || '',
          sku: data.sku || '',
          sobra: data.sobra ?? null,
          ordem: data.ordem ?? null,
          dataReferencia:
            data.dataReferencia || ultimaImportacaoMeta?.dataReferencia || '',
          atualizadoEm: data.atualizadoEm || ultimaImportacaoMeta?.criadoEm,
        };
      });
      importadosProdutosPronto = true;
      atualizarListaProdutos();
    },
    (err) => {
      console.error('Erro ao carregar itens importados:', err);
      setStatus(
        produtoStatusEl,
        'Não foi possível carregar as peças importadas.',
        true,
      );
      importadosProdutosCache = [];
      importadosProdutosPronto = true;
      atualizarListaProdutos();
    },
  );
}

function monitorarUltimaImportacao() {
  produtosImportacoesUnsub?.();
  produtosImportadosUnsub?.();
  ultimaImportacaoMeta = null;
  importadosProdutosCache = [];
  importadosProdutosPronto = false;

  if (!currentUser) {
    atualizarListaProdutos();
    return;
  }

  const importacoesRef = query(
    collection(db, 'uid', currentUser.uid, 'produtosPrecos'),
    orderBy('criadoEm', 'desc'),
    limit(1),
  );

  produtosImportacoesUnsub = onSnapshot(
    importacoesRef,
    (snap) => {
      if (snap.empty) {
        ultimaImportacaoMeta = null;
        importadosProdutosCache = [];
        importadosProdutosPronto = true;
        produtosImportadosUnsub?.();
        produtosImportadosUnsub = null;
        atualizarListaProdutos();
        return;
      }

      const docSnap = snap.docs[0];
      ultimaImportacaoMeta = { id: docSnap.id, ...(docSnap.data() || {}) };
      monitorarItensImportados(docSnap.ref);
    },
    (err) => {
      console.error('Erro ao carregar importações de produtos/preços:', err);
      setStatus(
        produtoStatusEl,
        'Não foi possível carregar as peças importadas.',
        true,
      );
      ultimaImportacaoMeta = null;
      importadosProdutosCache = [];
      importadosProdutosPronto = true;
      produtosImportadosUnsub?.();
      produtosImportadosUnsub = null;
      atualizarListaProdutos();
    },
  );
}

async function montarEscopoCompartilhamento(user) {
  const participantes = new Set();
  const emails = new Set();
  const equipesParaInspecionar = new Set();

  const addUid = (uid) => {
    if (uid && typeof uid === 'string') {
      participantes.add(uid);
    }
  };

  const addEmail = (email) => {
    if (!email) return;
    const normalized = String(email).trim().toLowerCase();
    if (normalized) emails.add(normalized);
  };

  addUid(user.uid);
  if (user.email) addEmail(user.email);

  const usuarioDoc = await getDoc(doc(db, 'usuarios', user.uid));
  const usuarioData = usuarioDoc.exists() ? usuarioDoc.data() : {};
  const uidDoc = await getDoc(doc(db, 'uid', user.uid));
  const uidData = uidDoc.exists() ? uidDoc.data() : {};
  const perfil = usuarioData.perfil || uidData.perfil || '';

  const coletarDadosCompartilhamento = (data) => {
    if (!data || typeof data !== 'object') return;
    const uidFields = [
      'responsavelFinanceiroUid',
      'responsavelExpedicaoUid',
      'gestorUid',
      'gestoresFinanceirosUids',
      'gestoresExpedicaoUids',
      'equipeUids',
      'equipesUids',
      'timeUids',
    ];
    uidFields.forEach((field) => {
      const value = data[field];
      if (!value) return;
      if (Array.isArray(value)) value.forEach(addUid);
      else addUid(value);
    });

    const emailFields = [
      'responsavelFinanceiroEmail',
      'responsavelExpedicaoEmail',
      'gestorEmail',
      'gestoresFinanceirosEmails',
      'gestoresExpedicaoEmails',
      'equipeEmails',
      'equipesEmails',
      'timeEmails',
      'teamEmails',
      'responsaveisEquipeEmails',
      'usuariosEquipeEmails',
    ];
    emailFields.forEach((field) => {
      const value = data[field];
      if (!value) return;
      if (Array.isArray(value)) value.forEach(addEmail);
      else addEmail(value);
    });

    if (Array.isArray(data.equipe)) {
      data.equipe.forEach((item) => {
        if (item?.email) addEmail(item.email);
        if (item?.uid) addUid(item.uid);
      });
    }
    if (Array.isArray(data.team)) {
      data.team.forEach((item) => {
        if (item?.email) addEmail(item.email);
        if (item?.uid) addUid(item.uid);
      });
    }
  };

  const adicionarMembrosEquipe = async (ownerUid) => {
    if (!ownerUid) return;
    try {
      const membrosRef = collection(
        db,
        'artifacts',
        'equipes',
        'users',
        ownerUid,
        'members',
      );
      const membrosSnap = await getDocs(membrosRef);
      membrosSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.email) addEmail(data.email);
        if (data.uid) addUid(data.uid);
      });
    } catch (err) {
      console.error('Erro ao carregar membros da equipe:', err);
    }

    try {
      const expRef = collection(db, 'uid', ownerUid, 'expedicaoTeam');
      const expSnap = await getDocs(expRef);
      expSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.email) addEmail(data.email);
        if (data.uid) addUid(data.uid);
      });
    } catch (err) {
      console.error('Erro ao carregar equipe de expedição:', err);
    }
  };

  coletarDadosCompartilhamento(usuarioData);
  coletarDadosCompartilhamento(uidData);
  await adicionarMembrosEquipe(user.uid);

  const meuEmail = user.email ? user.email.toLowerCase() : '';
  if (meuEmail) {
    try {
      const consultas = [
        getDocs(
          query(
            collection(db, 'usuarios'),
            where('responsavelFinanceiroEmail', '==', meuEmail),
          ),
        ),
        getDocs(
          query(
            collection(db, 'usuarios'),
            where('responsavelExpedicaoEmail', '==', meuEmail),
          ),
        ),
        getDocs(
          query(
            collection(db, 'usuarios'),
            where('gestoresFinanceirosEmails', 'array-contains', meuEmail),
          ),
        ),
        getDocs(
          query(
            collection(db, 'usuarios'),
            where('gestoresExpedicaoEmails', 'array-contains', meuEmail),
          ),
        ),
      ];
      const resultados = await Promise.all(consultas);
      resultados.forEach((snap) => {
        snap.forEach((docSnap) => {
          addUid(docSnap.id);
          coletarDadosCompartilhamento(docSnap.data());
        });
      });
    } catch (err) {
      console.error(
        'Erro ao localizar usuários vinculados ao seu e-mail:',
        err,
      );
    }

    try {
      const membrosSnap = await getDocs(
        query(collectionGroup(db, 'members'), where('email', '==', meuEmail)),
      );
      membrosSnap.forEach((docSnap) => {
        const pathSegments = docSnap.ref.path.split('/');
        const usersIndex = pathSegments.indexOf('users');
        if (usersIndex >= 0 && usersIndex + 1 < pathSegments.length) {
          const ownerUid = pathSegments[usersIndex + 1];
          addUid(ownerUid);
          equipesParaInspecionar.add(ownerUid);
        }
      });
    } catch (err) {
      console.error('Erro ao localizar equipes que incluem o usuário:', err);
    }
  }

  for (const ownerUid of equipesParaInspecionar) {
    await adicionarMembrosEquipe(ownerUid);
  }

  const adicionarUidsPorEmails = async () => {
    const processados = new Set();
    let pendentes = Array.from(emails).filter(
      (email) => email && !processados.has(email),
    );
    while (pendentes.length) {
      const lote = pendentes.slice(0, 10);
      try {
        const snap = await getDocs(
          query(collection(db, 'usuarios'), where('email', 'in', lote)),
        );
        const encontrados = new Set();
        snap.forEach((docSnap) => {
          addUid(docSnap.id);
          const data = docSnap.data() || {};
          const email = (data.email || '').toLowerCase();
          if (email) encontrados.add(email);
          coletarDadosCompartilhamento(data);
        });
        for (const email of lote) {
          processados.add(email);
        }
        const faltantes = lote.filter((email) => !encontrados.has(email));
        for (const email of faltantes) {
          try {
            const altSnap = await getDocs(
              query(collection(db, 'uid'), where('email', '==', email)),
            );
            altSnap.forEach((docSnap) => {
              addUid(docSnap.id);
              coletarDadosCompartilhamento(docSnap.data());
            });
          } catch (err) {
            console.error('Erro ao buscar UID pelo e-mail:', err);
          }
        }
      } catch (err) {
        console.error('Erro ao mapear e-mails para usuários:', err);
        for (const email of lote) {
          processados.add(email);
        }
      }
      pendentes = Array.from(emails).filter(
        (email) => email && !processados.has(email),
      );
    }
  };

  await adicionarUidsPorEmails();

  return { participantes: Array.from(participantes), perfil };
}

function atualizarEscopoMensagem() {
  atualizarResumoDestinatarios();
}

function renderMensagem(docSnap) {
  const data = docSnap.data() || {};
  const item = document.createElement('article');
  item.className = 'quick-message-card';

  const badge = document.createElement('div');
  badge.className = 'quick-message-card__badge';
  const badgeIcon = document.createElement('i');
  badgeIcon.className = 'fa-solid fa-comment-dots';
  badge.appendChild(badgeIcon);

  const content = document.createElement('div');
  content.className = 'quick-message-card__content';

  const label = document.createElement('span');
  label.className = 'quick-message-card__label';
  label.textContent = 'Atualização rápida';

  const meta = document.createElement('div');
  meta.className = 'quick-message-card__meta';

  const responsavelNome = data.responsavelNome || data.autorNome || '';
  const autorEl = document.createElement('span');
  autorEl.className = 'quick-message-card__author';
  autorEl.textContent = responsavelNome
    ? `Por ${responsavelNome}`
    : 'Responsável não informado';

  const dataEl = document.createElement('span');
  dataEl.className = 'quick-message-card__date';
  dataEl.textContent = formatDate(data.createdAt, true) || '—';

  meta.appendChild(autorEl);
  meta.appendChild(dataEl);

  const corpo = document.createElement('p');
  corpo.className = 'quick-message-card__text';
  corpo.textContent = data.texto || '';

  content.appendChild(label);
  content.appendChild(meta);
  content.appendChild(corpo);

  item.appendChild(badge);
  item.appendChild(content);

  if (currentUser?.uid && data.autorUid === currentUser.uid) {
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-semibold';
    deleteBtn.innerHTML =
      '<i class="fa-solid fa-trash-can"></i><span>Excluir mensagem</span>';
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm('Deseja realmente excluir esta mensagem?')) {
        return;
      }
      deleteBtn.disabled = true;
      deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
      try {
        await excluirMensagemMentorados(docSnap.id);
      } catch (err) {
        deleteBtn.disabled = false;
        deleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    });
    actions.appendChild(deleteBtn);
    item.appendChild(actions);
  }
  return item;
}

async function excluirMensagemMentorados(id) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, 'painelAtualizacoesMentorados', id));
    showTemporaryStatus(
      mensagemStatusEl,
      'Mensagem excluída com sucesso.',
      false,
      4000,
    );
  } catch (err) {
    console.error('Erro ao excluir mensagem:', err);
    showTemporaryStatus(
      mensagemStatusEl,
      'Não foi possível excluir a mensagem. Tente novamente.',
      true,
    );
    throw err;
  }
}

function renderProblema(docSnap) {
  const data = docSnap.data() || {};
  const card = document.createElement('article');
  card.className = 'bg-white border border-amber-100 rounded-lg p-3 shadow-sm';

  const header = document.createElement('div');
  header.className =
    'flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500';

  const setorEl = document.createElement('span');
  setorEl.className = 'font-semibold text-gray-700';
  setorEl.textContent = data.setor
    ? `Setor: ${data.setor}`
    : 'Setor não informado';

  const responsavelEl = document.createElement('span');
  responsavelEl.textContent = data.responsavel
    ? `Responsável: ${data.responsavel}`
    : 'Responsável não informado';

  const dataOcorrenciaEl = document.createElement('span');
  dataOcorrenciaEl.textContent = data.dataOcorrencia
    ? `Data: ${formatDate(data.dataOcorrencia, false)}`
    : '';

  header.appendChild(setorEl);
  header.appendChild(responsavelEl);
  if (dataOcorrenciaEl.textContent) header.appendChild(dataOcorrenciaEl);

  const descricao = document.createElement('p');
  descricao.className = 'mt-2 text-sm text-gray-700 whitespace-pre-line';
  descricao.textContent = data.problema || '';

  card.appendChild(header);
  card.appendChild(descricao);

  if (data.solucao) {
    const solucao = document.createElement('p');
    solucao.className =
      'mt-2 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded p-2';
    solucao.textContent = `Solução: ${data.solucao}`;
    card.appendChild(solucao);
  }

  const rodape = document.createElement('div');
  rodape.className = 'mt-2 text-[11px] text-gray-400 flex justify-between';
  const autor = document.createElement('span');
  autor.textContent = data.autorNome ? `Registrado por ${data.autorNome}` : '';
  const createdAt = document.createElement('span');
  createdAt.textContent = data.createdAt
    ? `Registro: ${formatDate(data.createdAt, true)}`
    : '';
  if (autor.textContent) rodape.appendChild(autor);
  if (createdAt.textContent) rodape.appendChild(createdAt);
  if (rodape.childElementCount) card.appendChild(rodape);

  return card;
}

function carregarMensagens() {
  if (!currentUser) return;
  mensagensUnsub?.();
  const mensagensRef = query(
    collection(db, 'painelAtualizacoesMentorados'),
    where('categoria', '==', 'mensagem'),
    orderBy('createdAt', 'desc'),
    limit(10),
  );
  mensagensUnsub = onSnapshot(
    mensagensRef,
    (snap) => {
      listaMensagensEl.innerHTML = '';
      if (snap.empty) {
        mensagensVazioEl?.classList.remove('hidden');
        return;
      }
      mensagensVazioEl?.classList.add('hidden');
      const frag = document.createDocumentFragment();
      snap.forEach((docSnap) => {
        frag.appendChild(renderMensagem(docSnap));
      });
      listaMensagensEl.appendChild(frag);
    },
    (err) => {
      console.error('Erro ao carregar mensagens:', err);
      mensagensVazioEl?.classList.remove('hidden');
    },
  );
}

function carregarProblemas() {
  if (!currentUser) return;
  problemasUnsub?.();
  const problemasRef = query(
    collection(db, 'painelAtualizacoesMentorados'),
    where('categoria', '==', 'problema'),
    orderBy('createdAt', 'desc'),
    limit(25),
  );
  problemasUnsub = onSnapshot(
    problemasRef,
    (snap) => {
      listaProblemasEl.innerHTML = '';
      if (snap.empty) {
        problemasVazioEl?.classList.remove('hidden');
        return;
      }
      problemasVazioEl?.classList.add('hidden');
      const frag = document.createDocumentFragment();
      snap.forEach((docSnap) => frag.appendChild(renderProblema(docSnap)));
      listaProblemasEl.appendChild(frag);
    },
    (err) => {
      console.error('Erro ao carregar problemas:', err);
      problemasVazioEl?.classList.remove('hidden');
    },
  );
}

function carregarProdutos() {
  if (!currentUser) return;

  produtosUnsub?.();
  produtosImportacoesUnsub?.();
  produtosImportadosUnsub?.();

  manualProdutosCache = [];
  importadosProdutosCache = [];
  manualProdutosPronto = false;
  importadosProdutosPronto = false;
  ultimaImportacaoMeta = null;

  if (listaProdutosEl) listaProdutosEl.innerHTML = '';
  produtosVazioEl?.classList.add('hidden');
  setStatus(produtoStatusEl, 'Carregando peças em linha...', false);

  const produtosRef = query(
    collection(db, 'painelAtualizacoesMentorados'),
    where('categoria', '==', 'produto'),
    orderBy('createdAt', 'desc'),
  );

  produtosUnsub = onSnapshot(
    produtosRef,
    (snap) => {
      manualProdutosPronto = true;
      manualProdutosCache = snap.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          tipo: 'manual',
          id: docSnap.id,
          nome: data.nome || '',
          observacoes: data.observacoes || '',
          autorNome: data.autorNome || '',
          createdAt: data.createdAt || null,
        };
      });
      atualizarListaProdutos();
    },
    (err) => {
      console.error('Erro ao carregar produtos cadastrados manualmente:', err);
      manualProdutosCache = [];
      manualProdutosPronto = true;
      setStatus(
        produtoStatusEl,
        'Não foi possível carregar os produtos cadastrados manualmente.',
        true,
      );
      atualizarListaProdutos();
    },
  );

  monitorarUltimaImportacao();
}

async function enviarMensagem(event) {
  event.preventDefault();
  if (!currentUser) return;
  const texto = mensagemInput?.value.trim();
  if (!texto) {
    showTemporaryStatus(
      mensagemStatusEl,
      'Digite uma mensagem antes de enviar.',
      true,
    );
    return;
  }
  try {
    const participantesDestino = obterParticipantesParaEnvio();
    await addDoc(collection(db, 'painelAtualizacoesMentorados'), {
      categoria: 'mensagem',
      texto,
      autorUid: currentUser.uid,
      autorNome: nomeResponsavel,
      responsavelUid: currentUser.uid,
      responsavelNome: nomeResponsavel,
      participantes: participantesDestino,
      createdAt: serverTimestamp(),
    });
    mensagemInput.value = '';
    showTemporaryStatus(
      mensagemStatusEl,
      'Mensagem compartilhada com a equipe.',
    );
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    showTemporaryStatus(
      mensagemStatusEl,
      'Não foi possível registrar a mensagem. Tente novamente.',
      true,
    );
  }
}

async function registrarProblema(event) {
  event.preventDefault();
  if (!currentUser) return;
  const problema = problemaTituloInput?.value.trim();
  const solucao = problemaSolucaoInput?.value.trim();
  const setor = problemaSetorInput?.value.trim();
  const responsavel = problemaResponsavelInput?.value.trim();
  const dataOcorrencia = problemaDataInput?.value;
  if (!problema || !setor || !responsavel || !dataOcorrencia) {
    showTemporaryStatus(
      problemaStatusEl,
      'Preencha todos os campos obrigatórios para registrar o problema.',
      true,
    );
    return;
  }
  try {
    const participantesDestino = obterParticipantesParaEnvio();
    await addDoc(collection(db, 'painelAtualizacoesMentorados'), {
      categoria: 'problema',
      problema,
      solucao: solucao || '',
      setor,
      responsavel,
      dataOcorrencia,
      autorUid: currentUser.uid,
      autorNome: nomeResponsavel,
      participantes: participantesDestino,
      createdAt: serverTimestamp(),
    });
    formProblema.reset();
    showTemporaryStatus(problemaStatusEl, 'Problema registrado com sucesso.');
  } catch (err) {
    console.error('Erro ao registrar problema:', err);
    showTemporaryStatus(
      problemaStatusEl,
      'Não foi possível salvar o problema. Tente novamente.',
      true,
    );
  }
}

async function registrarProduto(event) {
  event.preventDefault();
  if (!currentUser) return;
  const nome = produtoNomeInput?.value.trim();
  const observacoes = produtoObsInput?.value.trim();
  if (!nome) {
    showTemporaryStatus(
      produtoStatusEl,
      'Informe o nome do produto para concluir o cadastro.',
      true,
    );
    return;
  }
  try {
    const participantesDestino = obterParticipantesParaEnvio();
    await addDoc(collection(db, 'painelAtualizacoesMentorados'), {
      categoria: 'produto',
      nome,
      observacoes: observacoes || '',
      autorUid: currentUser.uid,
      autorNome: nomeResponsavel,
      participantes: participantesDestino,
      createdAt: serverTimestamp(),
    });
    formProduto?.reset();
    showTemporaryStatus(produtoStatusEl, 'Produto cadastrado com sucesso.');
  } catch (err) {
    console.error('Erro ao cadastrar produto:', err);
    showTemporaryStatus(
      produtoStatusEl,
      'Não foi possível cadastrar o produto. Tente novamente.',
      true,
    );
  }
}

formMensagem?.addEventListener('submit', enviarMensagem);
formProblema?.addEventListener('submit', registrarProblema);
formProduto?.addEventListener('submit', registrarProduto);
exportarPecasBtn?.addEventListener('click', exportarPecasEmLinha);
sincronizarCustosBtn?.addEventListener('click', sincronizarCustosComSobras);
limparParticipantesBtn?.addEventListener('click', limparSelecaoDestinatarios);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  currentUser = user;
  nomeResponsavel = user.displayName || user.email || 'Usuário';
  setStatus(painelStatusEl, 'Carregando configurações da equipe...');
  let participantes = [];
  try {
    ({ participantes } = await montarEscopoCompartilhamento(user));
  } catch (err) {
    console.error(
      'Erro ao preparar painel de atualizações de vendedores/mentorados:',
      err,
    );
    setStatus(
      painelStatusEl,
      'Não foi possível carregar a configuração da equipe. Exibindo dados compartilhados com todos os perfis.',
      true,
    );
  }

  const participantesSet = new Set(participantes || []);
  if (currentUser?.uid) participantesSet.add(currentUser.uid);
  participantesSet.add(VISIBILIDADE_GLOBAL_ID);
  participantesCompartilhamento = Array.from(participantesSet);
  await carregarDetalhesParticipantes(participantesCompartilhamento);
  atualizarEscopoMensagem();
  if (!painelStatusEl?.classList?.contains('text-red-600')) {
    setStatus(painelStatusEl, '');
  }

  try {
    const { isGestor, isResponsavelFinanceiro } =
      await carregarUsuariosFinanceiros(db, user);
    const podeGerirProdutos = isGestor || isResponsavelFinanceiro;
    if (podeGerirProdutos) {
      formProduto?.classList.remove('hidden');
      produtosAvisoEl?.classList.add('hidden');
    } else {
      formProduto?.classList.add('hidden');
      produtosAvisoEl?.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Erro ao verificar permissões financeiras:', err);
    formProduto?.classList.add('hidden');
    produtosAvisoEl?.classList.remove('hidden');
  }

  carregarMensagens();
  carregarProblemas();
  carregarProdutos();
});
