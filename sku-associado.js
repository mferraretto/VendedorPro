import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { carregarUsuariosFinanceiros } from './responsavel-financeiro.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let editDocId = null;
let editSkuAnterior = null;
let skuCache = new Map();
let eventosRegistrados = false;

const COMPONENTES_PADRAO = [
  { nome: 'Fiação', quantidade: null },
  { nome: 'Bocal', quantidade: null },

];

const CONTEXT_ESCOPOS_PADRAO = [
  'publico',
  'geral',
  'todos',
  'default',
  'padrao',
];
let contextoUsuario = {
  perfil: 'cliente',
  isAdm: false,
  isGestor: false,
  isResponsavelFinanceiro: false,
  escoposPermitidos: [...CONTEXT_ESCOPOS_PADRAO],
};

function normalizarTexto(valor) {
  return String(valor || '')
    .toLowerCase()
    .trim();
}

async function prepararContextoUsuario(user) {
  contextoUsuario = {
    perfil: 'cliente',
    isAdm: false,
    isGestor: false,
    isResponsavelFinanceiro: false,
    escoposPermitidos: [...CONTEXT_ESCOPOS_PADRAO],
  };

  try {
    const dadosFinanceiro = await carregarUsuariosFinanceiros(db, user);
    const perfilNormalizado = normalizarTexto(dadosFinanceiro?.perfil || '');

    contextoUsuario.perfil = perfilNormalizado || 'cliente';
    contextoUsuario.isAdm = contextoUsuario.perfil === 'adm';
    contextoUsuario.isGestor =
      contextoUsuario.perfil === 'gestor' || dadosFinanceiro?.isGestor;
    contextoUsuario.isResponsavelFinanceiro = Boolean(
      dadosFinanceiro?.isResponsavelFinanceiro,
    );

    if (contextoUsuario.isAdm) {
      contextoUsuario.escoposPermitidos = null;
      return;
    }

    const escopos = new Set(CONTEXT_ESCOPOS_PADRAO);

    if (
      contextoUsuario.isGestor ||
      contextoUsuario.isResponsavelFinanceiro ||
      contextoUsuario.perfil === 'gestor'
    ) {
      [
        'gestor',
        'financeiro',
        'responsavel',
        'gestor financeiro',
        'responsavel financeiro',
      ].forEach((valor) => escopos.add(normalizarTexto(valor)));
    }

    if (
      contextoUsuario.perfil === 'usuario' ||
      contextoUsuario.perfil === 'cliente'
    ) {
      ['usuario', 'cliente'].forEach((valor) =>
        escopos.add(normalizarTexto(valor)),
      );
    }

    contextoUsuario.escoposPermitidos = Array.from(escopos)
      .map((escopo) => normalizarTexto(escopo))
      .filter(
        (escopo, index, arr) =>
          escopo && escopo !== 'vts' && arr.indexOf(escopo) === index,
      );
  } catch (error) {
    console.error('Erro ao preparar contexto do usuário:', error);
    contextoUsuario.escoposPermitidos = CONTEXT_ESCOPOS_PADRAO.map((escopo) =>
      normalizarTexto(escopo),
    );
  }
}

async function obterDocumentosSku() {
  const docs = [];
  const idsProcessados = new Set();

  try {
    const snapCompleto = await getDocs(collection(db, 'skuAssociado'));
    snapCompleto.forEach((docSnap) => {
      idsProcessados.add(docSnap.id);
      docs.push(docSnap);
    });
    return docs;
  } catch (error) {
    if (error?.code !== 'permission-denied') {
      throw error;
    }

    if (!contextoUsuario?.escoposPermitidos || contextoUsuario.isAdm) {
      console.warn('Permissões insuficientes para listar todos os SKUs.');
      return docs;
    }
  }

  const escoposPermitidos = Array.from(
    new Set(
      (contextoUsuario.escoposPermitidos || [])
        .map((escopo) => normalizarTexto(escopo))
        .filter((escopo) => escopo && escopo !== 'vts'),
    ),
  );

  if (!escoposPermitidos.length) {
    return docs;
  }

  for (let i = 0; i < escoposPermitidos.length; i += 10) {
    const chunk = escoposPermitidos.slice(i, i + 10);
    try {
      const snap = await getDocs(
        query(collection(db, 'skuAssociado'), where('escopo', 'in', chunk)),
      );
      snap.forEach((docSnap) => {
        if (!idsProcessados.has(docSnap.id)) {
          idsProcessados.add(docSnap.id);
          docs.push(docSnap);
        }
      });
    } catch (erroChunk) {
      if (erroChunk?.code === 'permission-denied') {
        console.warn('Permissões insuficientes para os escopos:', chunk);
        continue;
      }
      throw erroChunk;
    }
  }

  return docs;
}

function gerarIdDocumentoSku(valor) {
  return encodeURIComponent(String(valor || '').trim());
}

function recuperarSkuDoIdDocumento(id, fallback = '') {
  if (!id) return fallback;
  try {
    const decodificado = decodeURIComponent(id);
    return decodificado || fallback || id;
  } catch (error) {
    console.warn('Não foi possível decodificar o ID do documento:', id, error);
    return fallback || id;
  }
}

function parseAssociados(value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function sanitizarQuantidadeNumerica(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  const texto = String(valor).replace(',', '.').trim();
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function formatarQuantidadeNumerica(valor) {
  const numero = sanitizarQuantidadeNumerica(valor);
  return numero === null ? '—' : numero.toLocaleString('pt-BR');
}

function sanitizarQuantidadeParafusos(valor) {
  return sanitizarQuantidadeNumerica(valor);
}

function formatarQuantidadeParafusos(valor) {
  return formatarQuantidadeNumerica(valor);
}

function criarLinhaComponente(componente = {}) {
  const linha = document.createElement('div');
  linha.className =
    'component-row flex flex-col gap-2 md:flex-row md:items-center';

  const inputNome = document.createElement('input');
  inputNome.type = 'text';
  inputNome.className = 'component-nome flex-1 p-2 border rounded';
  inputNome.placeholder = 'Nome do componente';
  inputNome.value = componente?.nome ? String(componente.nome).trim() : '';

  const inputQuantidade = document.createElement('input');
  inputQuantidade.type = 'number';
  inputQuantidade.min = '0';
  inputQuantidade.step = '1';
  inputQuantidade.className =
    'component-quantidade w-full md:w-32 p-2 border rounded';
  inputQuantidade.placeholder = 'Quantidade';
  const quantidadeSanitizada = sanitizarQuantidadeNumerica(
    componente?.quantidade,
  );
  inputQuantidade.value =
    quantidadeSanitizada === null ? '' : quantidadeSanitizada;

  const botaoRemover = document.createElement('button');
  botaoRemover.type = 'button';
  botaoRemover.className = 'text-sm font-medium text-red-600';
  botaoRemover.textContent = 'Remover';
  botaoRemover.addEventListener('click', () => {
    linha.remove();
  });

  linha.appendChild(inputNome);
  linha.appendChild(inputQuantidade);
  linha.appendChild(botaoRemover);

  return linha;
}

function adicionarLinhaComponente(componente = {}) {
  const container = document.getElementById('componentesContainer');
  if (!container) return;
  container.appendChild(criarLinhaComponente(componente));
}

function resetarComponentesFormulario(componentes = null) {
  const container = document.getElementById('componentesContainer');
  if (!container) return;
  container.innerHTML = '';
  const listaBase =
    Array.isArray(componentes) && componentes.length
      ? componentes
      : COMPONENTES_PADRAO;
  listaBase.forEach((item) =>
    adicionarLinhaComponente({
      nome: item?.nome || '',
      quantidade: item?.quantidade === undefined ? null : item.quantidade,
    }),
  );
}

function normalizarComponentesLista(componentes) {
  if (!Array.isArray(componentes)) return [];
  return componentes
    .map((comp) => {
      if (!comp || typeof comp !== 'object') return null;
      const nome = String(comp.nome || comp.descricao || '').trim();
      if (!nome) return null;
      const quantidade = sanitizarQuantidadeNumerica(comp.quantidade);
      return {
        nome,
        quantidade,
      };
    })
    .filter(Boolean);
}

function obterComponentesDoFormulario() {
  const container = document.getElementById('componentesContainer');
  if (!container) return [];
  const linhas = Array.from(container.querySelectorAll('.component-row'));
  const componentes = linhas.map((linha) => ({
    nome: linha.querySelector('.component-nome')?.value,
    quantidade: linha.querySelector('.component-quantidade')?.value,
  }));
  return normalizarComponentesLista(componentes);
}

function preencherComponentesNoFormulario(componentes = []) {
  const listaNormalizada = normalizarComponentesLista(componentes);
  if (listaNormalizada.length) {
    resetarComponentesFormulario(listaNormalizada);
  } else {
    resetarComponentesFormulario();
  }
}

function formatarComponentesParaTabela(componentes = []) {
  const listaNormalizada = normalizarComponentesLista(componentes);
  if (!listaNormalizada.length) return '—';
  return listaNormalizada
    .map((item) => {
      const quantidadeFormatada = formatarQuantidadeNumerica(item.quantidade);
      return quantidadeFormatada === '—'
        ? item.nome
        : `${item.nome} (${quantidadeFormatada})`;
    })
    .join(', ');
}

function popularSelectOptions(excluirSku = null, selecionados = []) {
  const select = document.getElementById('skusPrincipaisVinculados');
  select.innerHTML = '';
  const selecionadosSet = new Set(
    selecionados.map((valor) => normalizarTexto(valor)),
  );
  const excluirNormalizado = normalizarTexto(excluirSku);
  const opcoes = Array.from(skuCache.values()).sort((a, b) =>
    a.skuPrincipal.localeCompare(b.skuPrincipal),
  );
  opcoes.forEach((item) => {
    const sku = item.skuPrincipal;
    if (!sku) return;
    if (excluirNormalizado && normalizarTexto(sku) === excluirNormalizado)
      return;
    const option = document.createElement('option');
    option.value = sku;
    option.textContent = sku;
    if (selecionadosSet.has(normalizarTexto(sku))) option.selected = true;
    select.appendChild(option);
  });
}

function renderTabela() {
  const tbody = document.querySelector('#skuTable tbody');
  tbody.innerHTML = '';
  const linhas = Array.from(skuCache.values()).sort((a, b) =>
    a.skuPrincipal.localeCompare(b.skuPrincipal),
  );
  if (!linhas.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="6" class="px-2 py-4 text-center text-gray-500">Nenhum SKU associado encontrado para o seu perfil.</td>';
    tbody.appendChild(tr);
    return;
  }
  linhas.forEach((data) => {
    const tr = document.createElement('tr');
    const quantidadeParafusos = formatarQuantidadeParafusos(
      data.quantidadeParafusos,
    );
    const componentesDescricao = formatarComponentesParaTabela(
      data.componentes,
    );
    tr.innerHTML = `
      <td class="px-2 py-1">${data.skuPrincipal}</td>
      <td class="px-2 py-1">${(data.associados || []).join(', ')}</td>
      <td class="px-2 py-1">${quantidadeParafusos}</td>
      <td class="px-2 py-1">${componentesDescricao}</td>
      <td class="px-2 py-1">${(data.principaisVinculados || []).join(', ')}</td>
      <td class="px-2 py-1 space-x-2">
        <button class="text-blue-600" data-edit="${data.id}">Editar</button>
        <button class="text-red-600" data-del="${data.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarSkus() {
  let documentos;
  try {
    documentos = await obterDocumentosSku();
  } catch (error) {
    console.error('Erro ao carregar SKUs associados:', error);
    alert(
      'Não foi possível carregar os SKUs associados. Verifique suas permissões ou tente novamente mais tarde.',
    );
    return;
  }

  skuCache = new Map();
  documentos.forEach((docSnap) => {
    const data = docSnap.data();
    const escopo = String(data?.escopo || '').toLowerCase();
    if (data?.apenasVts === true || escopo === 'vts') {
      return;
    }
    const docId = docSnap.id;
    const skuPrincipal = (
      data.skuPrincipal || recuperarSkuDoIdDocumento(docId)
    ).trim();
    const quantidadeParafusos = sanitizarQuantidadeParafusos(
      data.quantidadeParafusos,
    );
    skuCache.set(docId, {
      ...data,
      id: docId,
      skuPrincipal,
      associados: data.associados || [],
      principaisVinculados: data.principaisVinculados || [],
      quantidadeParafusos,
      componentes: normalizarComponentesLista(data.componentes),
    });
  });
  renderTabela();

  const principalAtual = document.getElementById('skuPrincipal').value.trim();
  let selecionados = [];
  if (editDocId) {
    const dadosEdicao = skuCache.get(editDocId);
    if (dadosEdicao) {
      selecionados = dadosEdicao.principaisVinculados || [];
    }
  } else {
    const select = document.getElementById('skusPrincipaisVinculados');
    selecionados = Array.from(select.selectedOptions).map((opt) => opt.value);
  }
  const excluirSku = principalAtual || editSkuAnterior || null;
  popularSelectOptions(excluirSku, selecionados);
}

function obterPrincipaisSelecionados() {
  const select = document.getElementById('skusPrincipaisVinculados');
  return Array.from(select.selectedOptions)
    .map((opt) => opt.value)
    .filter(Boolean);
}

function limparFormulario() {
  document.getElementById('skuPrincipal').value = '';
  document.getElementById('skuAssociados').value = '';
  document.getElementById('quantidadeParafusos').value = '';
  resetarComponentesFormulario();
  editDocId = null;
  editSkuAnterior = null;
  popularSelectOptions(null, []);
}

async function salvarSku() {
  const principalEl = document.getElementById('skuPrincipal');
  const associadosEl = document.getElementById('skuAssociados');
  const quantidadeParafusosEl = document.getElementById('quantidadeParafusos');
  const principaisSelecionados = obterPrincipaisSelecionados();
  const componentes = obterComponentesDoFormulario();
  const skuPrincipal = principalEl.value.trim();
  if (!skuPrincipal) {
    alert('Informe o SKU principal');
    return;
  }
  const associados = parseAssociados(associadosEl.value);
  const quantidadeParafusos = sanitizarQuantidadeParafusos(
    quantidadeParafusosEl.value,
  );
  const docId = gerarIdDocumentoSku(skuPrincipal);
  if (editDocId && editDocId !== docId) {
    await deleteDoc(doc(db, 'skuAssociado', editDocId));
  }
  await setDoc(doc(db, 'skuAssociado', docId), {
    skuPrincipal,
    associados,
    principaisVinculados: principaisSelecionados.filter(
      (sku) => normalizarTexto(sku) !== normalizarTexto(skuPrincipal),
    ),
    quantidadeParafusos,
    componentes,
  });
  await carregarSkus();
  limparFormulario();
}

function preencherFormulario(id, data) {
  document.getElementById('skuPrincipal').value =
    data.skuPrincipal || recuperarSkuDoIdDocumento(id);
  document.getElementById('skuAssociados').value = (data.associados || []).join(
    ', ',
  );
  const quantidade = sanitizarQuantidadeParafusos(data.quantidadeParafusos);
  document.getElementById('quantidadeParafusos').value =
    quantidade === null ? '' : quantidade;
  preencherComponentesNoFormulario(data.componentes);
  popularSelectOptions(
    data.skuPrincipal || recuperarSkuDoIdDocumento(id),
    data.principaisVinculados || [],
  );
  editDocId = id;
  editSkuAnterior = data.skuPrincipal || recuperarSkuDoIdDocumento(id);
}

function registrarEventos() {
  if (eventosRegistrados) return;
  document.getElementById('skuPrincipal').addEventListener('input', (e) => {
    const selecionados = obterPrincipaisSelecionados();
    const excluirSku = e.target.value.trim() || editSkuAnterior || null;
    popularSelectOptions(excluirSku, selecionados);
  });
  document.getElementById('salvarSku').addEventListener('click', salvarSku);
  const botaoAdicionarComponente = document.getElementById(
    'adicionarComponente',
  );
  if (botaoAdicionarComponente) {
    botaoAdicionarComponente.addEventListener('click', () =>
      adicionarLinhaComponente(),
    );
  }
  document
    .querySelector('#skuTable tbody')
    .addEventListener('click', async (e) => {
      const idEdit = e.target.getAttribute('data-edit');
      const idDel = e.target.getAttribute('data-del');
      if (idEdit) {
        const dados = skuCache.get(idEdit);
        if (dados) preencherFormulario(idEdit, dados);
      } else if (idDel) {
        if (confirm('Excluir este registro?')) {
          await deleteDoc(doc(db, 'skuAssociado', idDel));
          await carregarSkus();
          if (editDocId === idDel) {
            limparFormulario();
          }
        }
      }
    });
  eventosRegistrados = true;
}

resetarComponentesFormulario();

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    await prepararContextoUsuario(user);
    await carregarSkus();
  } catch (error) {
    console.error('Erro ao iniciar a página de SKU associado:', error);
  }
  registrarEventos();
});
