import { encryptString, decryptString } from '../crypto.js';

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
// Avoid clashing with a global `db` from other scripts
const dbListaPrecos = firebase.firestore();
const authListaPrecos = firebase.auth();
let produtos = [];
let viewMode = 'cards';
let selecionados = new Set();

const NIVEIS_CUSTO = ['minimo', 'medio', 'maximo'];

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeaderIndex(headers, keywords, excludes = []) {
  return headers.findIndex(
    (header) =>
      keywords.every((keyword) => header.includes(keyword)) &&
      excludes.every((keyword) => !header.includes(keyword)),
  );
}

function hasCellValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function parsePlanilhaNumero(raw) {
  if (raw === undefined || raw === null || raw === '') return NaN;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\s+/g, '');
    if (!cleaned) return NaN;
    const sanitized = cleaned.replace(/[^0-9.,-]/g, '');
    if (!sanitized) return NaN;
    if (sanitized.includes(',') && sanitized.includes('.')) {
      return Number.parseFloat(sanitized.replace(/\./g, '').replace(',', '.'));
    }
    if (sanitized.includes(',')) {
      return Number.parseFloat(sanitized.replace(',', '.'));
    }
    return Number.parseFloat(sanitized);
  }
  return NaN;
}

function normalizarCustosProduto(custos = {}) {
  const normalizado = {};
  NIVEIS_CUSTO.forEach((nivel) => {
    const info = custos?.[nivel] || {};
    normalizado[nivel] = {
      valor: Number.parseFloat(info.valor) || 0,
      comissao: Number.parseFloat(info.comissao) || 0,
    };
  });
  return normalizado;
}

function formatCurrency(valor) {
  return `R$ ${Number.parseFloat(valor || 0).toFixed(2)}`;
}

function primeiroNumeroValido(...valores) {
  for (const valor of valores) {
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      return valor;
    }
  }
  return null;
}

function obterCustosDoProduto(prod) {
  if (prod?.custos) return normalizarCustosProduto(prod.custos);
  const custoBase = Number.parseFloat(prod?.custo || 0) || 0;
  return normalizarCustosProduto({
    medio: { valor: custoBase, comissao: 0 },
  });
}

function coletarCustosDoModal() {
  return normalizarCustosProduto({
    minimo: {
      valor: document.getElementById('editCustoMinimo')?.value,
      comissao: document.getElementById('editComissaoMinimo')?.value,
    },
    medio: {
      valor: document.getElementById('editCustoMedio')?.value,
      comissao: document.getElementById('editComissaoMedio')?.value,
    },
    maximo: {
      valor: document.getElementById('editCustoMaximo')?.value,
      comissao: document.getElementById('editComissaoMaximo')?.value,
    },
  });
}

function gerarTabelaPreview(resultado) {
  const linhas = NIVEIS_CUSTO.map((nivel) => {
    const dados = resultado.precosPorCusto?.[nivel];
    if (!dados || typeof dados.preco !== 'number') return '';
    const titulo =
      nivel === 'minimo'
        ? 'Custo mínimo'
        : nivel === 'medio'
          ? 'Custo médio'
          : 'Custo máximo';
    return `
      <tr>
        <td class="px-2 py-1 font-medium text-gray-600">${titulo}</td>
        <td class="px-2 py-1 text-right">${formatCurrency(dados.preco)}</td>
      </tr>
    `;
  })
    .filter(Boolean)
    .join('');
  if (!linhas) {
    return '<span class="text-red-600">Informe ao menos um custo válido para visualizar os preços.</span>';
  }
  return `
    <table class="min-w-full text-xs">
      <thead>
        <tr>
          <th class="px-2 py-1 text-left text-gray-500">Custo base</th>
          <th class="px-2 py-1 text-gray-500 text-right">Preço calculado</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-600">
      <div><strong>Preço mínimo:</strong> ${formatCurrency(resultado.precoMinimo)}</div>
      <div><strong>Preço médio:</strong> ${formatCurrency(resultado.precoMedio)}</div>
      <div><strong>Preço ideal:</strong> ${formatCurrency(resultado.precoIdeal)}</div>
    </div>
    <p class="mt-2 text-xs text-gray-500">Referência atual: <strong>${resultado.referenciaCusto?.toUpperCase() || 'MÉDIO'}</strong></p>
  `;
}

function calcularTotaisTaxas(taxas = {}) {
  return Object.entries(taxas).reduce(
    (acc, [chave, valor]) => {
      const numero = Number.parseFloat(valor) || 0;
      if (String(chave).includes('%')) acc.percent += numero;
      else acc.fix += numero;
      return acc;
    },
    { percent: 0, fix: 0 },
  );
}

function calcularPrecosCustos(custos, totalPercentual, totalFixo) {
  const calculos = {};
  let referencia = null;
  NIVEIS_CUSTO.forEach((nivel) => {
    const info = custos[nivel];
    if (!info || !(info.valor > 0)) return;
    const percentual = totalPercentual + (info.comissao || 0);
    const precoBase = info.valor + totalFixo + (info.valor * percentual) / 100;
    calculos[nivel] = {
      custo: Number(info.valor.toFixed(2)),
      comissao: info.comissao || 0,
      preco: Number(precoBase.toFixed(2)),
    };
    if (!referencia || (referencia !== 'medio' && nivel === 'medio')) {
      referencia = nivel;
    }
  });
  if (!referencia) {
    referencia = NIVEIS_CUSTO.find((nivel) => calculos[nivel]) || 'medio';
  }
  const resumo = {
    precoMinimo: calculos.minimo?.preco ?? null,
    precoMedio: calculos.medio?.preco ?? null,
    precoIdeal: calculos.maximo?.preco ?? null,
  };
  return { calculos, referencia, resumo };
}

async function carregarProdutos() {
  const user = firebase.auth().currentUser;
  const uid = user?.uid;
  const isAdmin = window.sistema?.isAdmin;

  produtos = [];
  selecionados.clear();
  const selectAll = document.getElementById('selectAll');
  if (selectAll) selectAll.checked = false;

  if (isAdmin) {
    const snap = await dbListaPrecos
      .collectionGroup('produtos')
      .orderBy('createdAt', 'desc')
      .get();
    for (const doc of snap.docs) {
      const owner = doc.ref.parent.parent.id;
      const pass = getPassphrase() || `chave-${owner}`;
      const docData = doc.data();
      let data;
      if (docData.encrypted) {
        data = JSON.parse(await decryptString(docData.encrypted, pass));
      } else {
        data = docData;
      }
      produtos.push({ id: doc.id, uid: owner, ...data });
    }
  } else if (uid) {
    const pass = getPassphrase() || `chave-${uid}`;
    const snap = await dbListaPrecos
      .collection('uid')
      .doc(uid)
      .collection('produtos')
      .orderBy('createdAt', 'desc')
      .get();
    for (const doc of snap.docs) {
      const docData = doc.data();
      let data;
      if (docData.encrypted) {
        data = JSON.parse(await decryptString(docData.encrypted, pass));
      } else {
        data = docData;
      }
      produtos.push({ id: doc.id, uid, ...data });
    }
  }

  aplicarFiltros();
}

function normalizeTexto(valor) {
  return typeof valor === 'string'
    ? valor.toLowerCase()
    : String(valor ?? '').toLowerCase();
}

function aplicarFiltros() {
  const termo =
    document.getElementById('filtroBusca')?.value?.toLowerCase() || '';
  const tipo = document.getElementById('tipoFiltro')?.value || 'contains';

  const filtrados = produtos.filter((p) => {
    const nome = normalizeTexto(p.produto);
    const sku = normalizeTexto(p.sku);
    const loja = normalizeTexto(p.plataforma);
    if (!termo) return true;
    if (tipo === 'exact') {
      return nome === termo || sku === termo || loja === termo;
    }
    if (tipo === 'starts') {
      return (
        nome.startsWith(termo) ||
        sku.startsWith(termo) ||
        loja.startsWith(termo)
      );
    }
    return nome.includes(termo) || sku.includes(termo) || loja.includes(termo);
  });

  renderLista(filtrados);
}

function renderLista(lista) {
  const cards = document.getElementById('listaPrecos');
  const table = document.getElementById('listaPrecosList');
  const tbody = document.getElementById('listaPrecosListBody');
  if (!cards || !table || !tbody) return;
  cards.innerHTML = '';
  tbody.innerHTML = '';

  if (viewMode === 'cards') {
    cards.classList.remove('hidden');
    table.classList.add('hidden');
    lista.forEach((data) => {
      const card = document.createElement('div');
      card.className =
        'bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition duration-200';
      card.innerHTML = `
        <div class="flex justify-between items-start">
          <div class="flex items-start">
            <input type="checkbox" class="mr-2 selecionar-produto" onchange="toggleSelecionado('${data.id}', this.checked)" ${selecionados.has(data.id) ? 'checked' : ''}>
            <div>
              <h3 class="font-bold text-lg">${data.produto}</h3>
              ${data.sku ? `<div class="text-sm text-gray-500">SKU: ${data.sku}</div>` : ''}
            </div>
          </div>
          <div class="text-right">
            ${
              data.calculosTaxas
                ? Object.entries(data.calculosTaxas)
                    .map(([taxa, valores]) => {
                      const referencia = valores.referencia
                        ? ` (${String(valores.referencia).toUpperCase()})`
                        : '';
                      return `
              <div class="mb-2">
                <div class="text-gray-500 text-sm">${taxa}${referencia} - Preços calculados</div>
                <div class="text-xs text-gray-500 space-y-0.5 mt-1">
                  <div><strong>Mínimo:</strong> R$ ${parseFloat(valores.precoMinimo).toFixed(2)}</div>
                  <div><strong>Médio:</strong> R$ ${parseFloat(valores.precoMedio).toFixed(2)}</div>
                  <div><strong>Ideal:</strong> R$ ${parseFloat(valores.precoIdeal).toFixed(2)}</div>
                </div>
              </div>
            `;
                    })
                    .join('')
                : `
              <div class="text-gray-500 text-sm">Preço mínimo</div>
              <div class="text-lg font-semibold text-green-600">R$ ${parseFloat(data.precoMinimo).toFixed(2)}</div>
              <div class="text-xs text-gray-500 mt-1">Médio: R$ ${parseFloat(data.precoMedio).toFixed(2)} | Ideal: R$ ${parseFloat(data.precoIdeal).toFixed(2)}</div>
            `
            }
          </div>
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100 flex justify-between">
          <div class="text-sm text-gray-500"><i class="far fa-calendar-alt"></i> ${new Date(data.createdAt).toLocaleDateString('pt-BR')}</div>
          <div class="flex space-x-2">
            <button onclick="verDetalhes('${data.id}')" class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
              <i class='fas fa-eye mr-1'></i> Ver
            </button>
            <button onclick="editarProduto('${data.id}')" class="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600">
              <i class='fas fa-edit mr-1'></i> Editar
            </button>
            <button onclick="excluirProduto('${data.id}')" class="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600">
              <i class='fas fa-trash mr-1'></i> Excluir
            </button>
          </div>

        </div>`;
      cards.appendChild(card);
    });
  } else {
    cards.classList.add('hidden');
    table.classList.remove('hidden');
    lista.forEach((data) => {
      const row = document.createElement('tr');
      row.innerHTML = `
       <td><input type="checkbox" class="selecionar-produto" onchange="toggleSelecionado('${data.id}', this.checked)" ${selecionados.has(data.id) ? 'checked' : ''}></td>
        <td>${data.produto}</td>
        <td>${data.sku || ''}</td>
        <td>${data.plataforma}</td>
        <td class="whitespace-nowrap">R$ ${parseFloat(data.precoMinimo).toFixed(2)}</td>
        <td class="whitespace-nowrap">
          <button class="text-blue-600 mr-2" onclick="verDetalhes('${data.id}')"><i class='fas fa-eye'></i></button>
          <button class="text-yellow-600 mr-2" onclick="editarProduto('${data.id}')"><i class='fas fa-edit'></i></button>
          <button class="text-red-600" onclick="excluirProduto('${data.id}')"><i class='fas fa-trash'></i></button>
        </td>`;
      tbody.appendChild(row);
    });
  }
  const selectAll = document.getElementById('selectAll');
  if (selectAll) {
    selectAll.checked =
      produtos.length > 0 && selecionados.size === produtos.length;
  }
}

function verDetalhes(id) {
  const prod = produtos.find((p) => p.id === id);
  if (!prod) return;
  document.getElementById('saveBtn').classList.add('hidden');
  document.getElementById('modalTitle').textContent = prod.produto;
  const body = document.getElementById('modalBody');
  const precoMinimo = parseFloat(prod.precoMinimo) || 0;
  const lucroPercent = (preco) =>
    precoMinimo
      ? (
          (((parseFloat(preco) || 0) - precoMinimo) / precoMinimo) *
          100
        ).toFixed(2)
      : '0';
  const custos = obterCustosDoProduto(prod);
  const custosHtml = NIVEIS_CUSTO.map((nivel) => {
    const info = custos[nivel];
    if (!info || !(info.valor > 0)) return '';
    const label =
      nivel === 'minimo' ? 'Mínimo' : nivel === 'medio' ? 'Médio' : 'Máximo';
    return `
      <div class="mt-2">
        <strong>${label}:</strong> ${formatCurrency(info.valor)}
        ${info.comissao ? `<span class="text-sm text-gray-500">(Comissão ${info.comissao}% )</span>` : ''}
      </div>
    `;
  })
    .filter(Boolean)
    .join('');
  body.innerHTML = `
    ${prod.sku ? `<div><strong>SKU:</strong> ${prod.sku}</div>` : ''}
    <div><strong>Plataforma:</strong> ${prod.plataforma}</div>
    <div><strong>Custo referência:</strong> ${formatCurrency(prod.custo)}</div>
    ${custosHtml ? `<div class="mt-3"><strong>Custos cadastrados:</strong>${custosHtml}</div>` : ''}
    <div><strong>Preço mínimo:</strong> R$ ${prod.precoMinimo} (Lucro: ${lucroPercent(prod.precoMinimo)}%)</div>
    <div><strong>Preço ideal:</strong> R$ ${prod.precoIdeal} (Lucro: ${lucroPercent(prod.precoIdeal)}%)</div>
    <div><strong>Preço médio:</strong> R$ ${prod.precoMedio} (Lucro: ${lucroPercent(prod.precoMedio)}%)</div>
  `;
  // Utilize global modal helpers to ensure proper display
  document.getElementById('detalhesModal').classList.remove('hidden');
  if (typeof openModal === 'function') {
    openModal('detalhesModal');
  } else {
    document.getElementById('detalhesModal').style.display = 'flex';
  }
}

let editId = null;
function editarProduto(id) {
  const prod = produtos.find((p) => p.id === id);
  if (!prod) return;
  editId = id;
  document.getElementById('modalTitle').textContent = 'Editar ' + prod.produto;
  const body = document.getElementById('modalBody');
  const custos = obterCustosDoProduto(prod);
  body.innerHTML = `
    <label class='block'>Nome<input id='editNome' class='w-full border p-2 rounded mt-1' value="${prod.produto}"></label>
    <label class='block mt-2'>SKU<input id='editSku' class='w-full border p-2 rounded mt-1' value="${prod.sku || ''}"></label>
    <div class='mt-4'>
      <h3 class='font-semibold text-sm text-gray-700 mb-2'>Custos e Comissões</h3>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <div>
          <label class='block text-sm font-medium text-gray-600'>Custo mínimo (R$)</label>
          <input id='editCustoMinimo' type='number' step='0.01' class='w-full border p-2 rounded mt-1' value="${custos.minimo.valor}">
          <label class='block text-sm font-medium text-gray-600 mt-2'>Comissão mín. (%)</label>
          <input id='editComissaoMinimo' type='number' step='0.01' class='w-full border p-2 rounded mt-1' value="${custos.minimo.comissao}">
        </div>
        <div>
          <label class='block text-sm font-medium text-gray-600'>Custo médio (R$)</label>
          <input id='editCustoMedio' type='number' step='0.01' class='w-full border p-2 rounded mt-1' value="${custos.medio.valor}">
          <label class='block text-sm font-medium text-gray-600 mt-2'>Comissão méd. (%)</label>
          <input id='editComissaoMedio' type='number' step='0.01' class='w-full border p-2 rounded mt-1' value="${custos.medio.comissao}">
        </div>
        <div>
          <label class='block text-sm font-medium text-gray-600'>Custo máximo (R$)</label>
          <input id='editCustoMaximo' type='number' step='0.01' class='w-full border p-2 rounded mt-1' value="${custos.maximo.valor}">
          <label class='block text-sm font-medium text-gray-600 mt-2'>Comissão máx. (%)</label>
          <input id='editComissaoMaximo' type='number' step='0.01' class='w-full border p-2 rounded mt-1' value="${custos.maximo.comissao}">
        </div>
      </div>
      <p class='text-xs text-gray-500 mt-2'>Os preços serão recalculados automaticamente considerando as taxas cadastradas no produto.</p>
    </div>
    <div class='mt-4'>
      <div class='flex items-center justify-between mb-2'>
        <h3 class='font-semibold text-sm text-gray-700'>Pré-visualização dos preços</h3>
        <button type='button' id='btnRecalcularPrecos' class='text-sm text-blue-600 hover:underline'>Recalcular agora</button>
      </div>
      <div id='previewCustos' class='text-sm text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3'>Carregando...</div>
    </div>
  `;
  document.getElementById('saveBtn').classList.remove('hidden');
  document.getElementById('detalhesModal').classList.remove('hidden');
  if (typeof openModal === 'function') {
    openModal('detalhesModal');
  } else {
    document.getElementById('detalhesModal').style.display = 'flex';
  }

  const atualizarPreview = () => {
    const custosAtualizados = coletarCustosDoModal();
    const preview = document.getElementById('previewCustos');
    const resultado = recalcularPrecos(prod, custosAtualizados);
    if (!resultado) {
      preview.innerHTML =
        '<span class="text-red-600">Não foi possível calcular os preços com os valores informados.</span>';
      return;
    }
    preview.innerHTML = gerarTabelaPreview(resultado);
    preview.dataset.resultado = JSON.stringify(resultado);
  };

  document
    .getElementById('btnRecalcularPrecos')
    ?.addEventListener('click', atualizarPreview);
  [
    'editCustoMinimo',
    'editComissaoMinimo',
    'editCustoMedio',
    'editComissaoMedio',
    'editCustoMaximo',
    'editComissaoMaximo',
  ].forEach((idCampo) => {
    document.getElementById(idCampo)?.addEventListener('input', () => {
      // Atualização leve para pré-visualização
      atualizarPreview();
    });
  });

  atualizarPreview();
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!editId) return;
  const user = firebase.auth().currentUser;
  if (!user) return;
  const prod = produtos.find((p) => p.id === editId) || {};
  const custosAtualizados = coletarCustosDoModal();
  const resultado = recalcularPrecos(prod, custosAtualizados);
  if (!resultado) {
    alert(
      'Não foi possível recalcular os preços com os valores informados. Verifique custos, comissões e taxas.',
    );
    return;
  }
  const data = {
    produto: document.getElementById('editNome').value,
    sku: document.getElementById('editSku').value,
    plataforma: prod.plataforma,
    custo: resultado.custo,
    precoMinimo: resultado.precoMinimo,
    precoIdeal: resultado.precoIdeal,
    precoMedio: resultado.precoMedio,
    precoPromo: resultado.precoMinimo,
    custos: resultado.custos,
    precosPorCusto: resultado.precosPorCusto,
    referenciaCusto: resultado.referenciaCusto,
    calculosTaxas: Object.keys(resultado.calculosTaxas || {}).length
      ? resultado.calculosTaxas
      : prod.calculosTaxas || {},
    taxas: resultado.taxas,
  };
  const pass = getPassphrase() || `chave-${user.uid}`;
  await dbListaPrecos
    .collection('uid')
    .doc(user.uid)
    .collection('produtos')
    .doc(editId)
    .set(
      {
        uid: user.uid,
        encrypted: await encryptString(JSON.stringify(data), pass),
      },
      { merge: true },
    );
  const idx = produtos.findIndex((p) => p.id === editId);
  if (idx !== -1) {
    produtos[idx] = { ...produtos[idx], ...data };
  }
  fecharModal();
  carregarProdutos();
});

function excluirProduto(id) {
  const user = firebase.auth().currentUser;
  if (!user) return;
  if (!confirm('Excluir este produto?')) return;
  dbListaPrecos
    .collection('uid')
    .doc(user.uid)
    .collection('produtos')
    .doc(id)
    .delete()
    .then(carregarProdutos);
}
function toggleSelecionado(id, checked) {
  if (checked) selecionados.add(id);
  else selecionados.delete(id);
}

function selecionarTodos(checked) {
  selecionados = new Set(checked ? produtos.map((p) => p.id) : []);
  document.querySelectorAll('.selecionar-produto').forEach((el) => {
    el.checked = checked;
  });
}

async function excluirSelecionados() {
  const user = firebase.auth().currentUser;
  if (!user || !selecionados.size) return;
  if (!confirm('Excluir produtos selecionados?')) return;
  await Promise.all(
    Array.from(selecionados).map((id) =>
      dbListaPrecos
        .collection('uid')
        .doc(user.uid)
        .collection('produtos')
        .doc(id)
        .delete(),
    ),
  );
  selecionados.clear();
  carregarProdutos();
}

async function excluirTodos() {
  if (!produtos.length) return;
  if (!confirm('Excluir todos os produtos?')) return;
  await Promise.all(
    produtos.map((p) =>
      dbListaPrecos
        .collection('uid')
        .doc(p.uid)
        .collection('produtos')
        .doc(p.id)
        .delete(),
    ),
  );
  selecionados.clear();
  carregarProdutos();
}
function fecharModal() {
  if (typeof closeModal === 'function') {
    closeModal('detalhesModal');
  } else {
    document.getElementById('detalhesModal').style.display = 'none';
  }
  document.getElementById('detalhesModal').classList.add('hidden');
  editId = null;
}
function exportarExcelLista() {
  if (!produtos.length) return;

  const headers = [
    'Produto',
    'SKU',
    'Plataforma',
    'Custo (R$)',
    'Custo Mínimo (R$)',
    'Comissão Custo Mínimo (%)',
    'Custo Médio (R$)',
    'Comissão Custo Médio (%)',
    'Custo Máximo (R$)',
    'Comissão Custo Máximo (%)',
    'Taxas da Plataforma (%)',
    'Custo Fixo Plataforma (R$)',
    'Frete (R$)',
    'Taxa de Transação (%)',
    'Taxa de Transferência (%)',
    'Taxa de Antecipação (%)',
    'Custos Variáveis (R$)',
    'Imposto (%)',
    'Comissão do Vendedor (%)',
    'Duas Taxas Shopee (S/N)',
  ];

  const data = produtos.map((p) => ({
    Produto: p.produto,
    SKU: p.sku || '',
    Plataforma: p.plataforma || '',
    ...(() => {
      const custos = obterCustosDoProduto(p);
      return {
        'Custo (R$)': parseFloat(p.custo ?? custos.medio?.valor ?? 0),
        'Custo Mínimo (R$)': custos.minimo.valor,
        'Comissão Custo Mínimo (%)': custos.minimo.comissao,
        'Custo Médio (R$)': custos.medio.valor,
        'Comissão Custo Médio (%)': custos.medio.comissao,
        'Custo Máximo (R$)': custos.maximo.valor,
        'Comissão Custo Máximo (%)': custos.maximo.comissao,
      };
    })(),
    'Taxas da Plataforma (%)': '',
    'Custo Fixo Plataforma (R$)': '',
    'Frete (R$)': '',
    'Taxa de Transação (%)': '',
    'Taxa de Transferência (%)': '',
    'Taxa de Antecipação (%)': '',
    'Custos Variáveis (R$)': '',
    'Imposto (%)': '',
    'Comissão do Vendedor (%)': '',
    'Duas Taxas Shopee (S/N)': '',
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  XLSX.writeFile(wb, 'produtos_precificacao.xlsx');
}

function exportarPlanilhaPrecificacao() {
  if (!produtos.length) return;
  const headers = [
    'Produto',
    'SKU',
    'Plataforma',
    'Custo (R$)',
    'Custo Mínimo (R$)',
    'Comissão Custo Mínimo (%)',
    'Custo Médio (R$)',
    'Comissão Custo Médio (%)',
    'Custo Máximo (R$)',
    'Comissão Custo Máximo (%)',
    'Taxas da Plataforma (%)',
    'Custo Fixo Plataforma (R$)',
    'Frete (R$)',
    'Taxa de Transação (%)',
    'Taxa de Transferência (%)',
    'Taxa de Antecipação (%)',
    'Custos Variáveis (R$)',
    'Imposto (%)',
    'Comissão do Vendedor (%)',
  ];
  const data = produtos.map((p) => ({
    Produto: p.produto,
    SKU: p.sku || '',
    Plataforma: p.plataforma,
    ...(() => {
      const custos = obterCustosDoProduto(p);
      return {
        'Custo (R$)': parseFloat(p.custo ?? custos.medio?.valor ?? 0),
        'Custo Mínimo (R$)': custos.minimo.valor,
        'Comissão Custo Mínimo (%)': custos.minimo.comissao,
        'Custo Médio (R$)': custos.medio.valor,
        'Comissão Custo Médio (%)': custos.medio.comissao,
        'Custo Máximo (R$)': custos.maximo.valor,
        'Comissão Custo Máximo (%)': custos.maximo.comissao,
      };
    })(),
    'Taxas da Plataforma (%)': parseFloat(
      p.taxas?.['Taxas da Plataforma (%)'] || 0,
    ),
    'Custo Fixo Plataforma (R$)': parseFloat(
      p.taxas?.['Custo Fixo Plataforma (R$)'] || 0,
    ),
    'Frete (R$)': parseFloat(p.taxas?.['Frete (R$)'] || 0),
    'Taxa de Transação (%)': parseFloat(
      p.taxas?.['Taxa de Transação (%)'] || 0,
    ),
    'Taxa de Transferência (%)': parseFloat(
      p.taxas?.['Taxa de Transferência (%)'] || 0,
    ),
    'Taxa de Antecipação (%)': parseFloat(
      p.taxas?.['Taxa de Antecipação (%)'] || 0,
    ),
    'Custos Variáveis (R$)': parseFloat(
      p.taxas?.['Custos Variáveis (R$)'] || 0,
    ),
    'Imposto (%)': parseFloat(p.taxas?.['Imposto (%)'] || 0),
    'Comissão do Vendedor (%)': parseFloat(
      p.taxas?.['Comissão do Vendedor (%)'] || 0,
    ),
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Precificacao');
  XLSX.writeFile(wb, 'precificacao_produtos.xlsx');
}

function exportarPDFLista() {
  if (!produtos.length) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const headers = [
    'Produto',
    'SKU',
    'Loja',
    'Custo',
    'Preço Mín.',
    'Preço Ideal',
    'Preço Médio',
  ];
  const body = produtos.map((p) => [
    p.produto,
    p.sku || '',
    p.plataforma,
    parseFloat(p.custo || 0).toFixed(2),
    parseFloat(p.precoMinimo).toFixed(2),
    parseFloat(p.precoIdeal).toFixed(2),
    parseFloat(p.precoMedio).toFixed(2),
  ]);
  doc.autoTable({ head: [headers], body, startY: 20, styles: { fontSize: 8 } });
  doc.save('lista_precos.pdf');
}

function recalcularPrecos(prod, novosCustosEntrada) {
  const custosOriginais = obterCustosDoProduto(prod);
  let custosAtualizados;
  if (typeof novosCustosEntrada === 'number') {
    custosAtualizados = {
      ...custosOriginais,
      medio: {
        valor: Number.parseFloat(novosCustosEntrada) || 0,
        comissao: custosOriginais.medio?.comissao || 0,
      },
    };
  } else if (novosCustosEntrada) {
    custosAtualizados = normalizarCustosProduto(novosCustosEntrada);
  } else {
    custosAtualizados = custosOriginais;
  }

  const taxasBase = prod.taxas || {};
  const totaisBase = calcularTotaisTaxas(taxasBase);
  const { calculos, referencia, resumo } = calcularPrecosCustos(
    custosAtualizados,
    totaisBase.percent,
    totaisBase.fix,
  );
  const referenciaDados = calculos[referencia];
  if (!referenciaDados) {
    return null;
  }

  const precoMinimoBase =
    primeiroNumeroValido(
      resumo.precoMinimo,
      resumo.precoMedio,
      resumo.precoIdeal,
    ) ?? 0;
  const precoMedioBase =
    primeiroNumeroValido(
      resumo.precoMedio,
      resumo.precoIdeal,
      resumo.precoMinimo,
    ) ?? 0;
  const precoIdealBase =
    primeiroNumeroValido(
      resumo.precoIdeal,
      resumo.precoMedio,
      resumo.precoMinimo,
    ) ?? 0;

  const calculosTaxas = {};
  if (prod.calculosTaxas) {
    Object.entries(prod.calculosTaxas).forEach(([taxaKey, dados]) => {
      const taxaNumero = Number.parseFloat(taxaKey);
      const taxasDetalhadas = dados?.taxas
        ? dados.taxas
        : {
            ...taxasBase,
            'Taxas da Plataforma (%)': Number.isFinite(taxaNumero)
              ? taxaNumero
              : taxasBase['Taxas da Plataforma (%)'],
          };
      const totais = calcularTotaisTaxas(taxasDetalhadas);
      const { calculos: calcCustos, referencia: refTaxa, resumo: resumoTaxa } =
        calcularPrecosCustos(custosAtualizados, totais.percent, totais.fix);
      const dadosReferencia = calcCustos[refTaxa] || {};
      const precoMinimoTaxa =
        primeiroNumeroValido(
          resumoTaxa.precoMinimo,
          resumoTaxa.precoMedio,
          resumoTaxa.precoIdeal,
        ) ?? 0;
      const precoMedioTaxa =
        primeiroNumeroValido(
          resumoTaxa.precoMedio,
          resumoTaxa.precoIdeal,
          resumoTaxa.precoMinimo,
        ) ?? 0;
      const precoIdealTaxa =
        primeiroNumeroValido(
          resumoTaxa.precoIdeal,
          resumoTaxa.precoMedio,
          resumoTaxa.precoMinimo,
        ) ?? 0;
      calculosTaxas[taxaKey] = {
        referencia: refTaxa,
        precosPorCusto: calcCustos,
        precoMinimo: precoMinimoTaxa,
        precoMedio: precoMedioTaxa,
        precoIdeal: precoIdealTaxa,
        precoPromo: precoMinimoTaxa,
        taxas: taxasDetalhadas,
      };
    });
  }

  return {
    custo: Number(referenciaDados.custo || 0),
    precoMinimo: precoMinimoBase,
    precoMedio: precoMedioBase,
    precoIdeal: precoIdealBase,
    precoPromo: precoMinimoBase,
    custos: custosAtualizados,
    precosPorCusto: calculos,
    referenciaCusto: referencia,
    calculosTaxas,
    taxas: taxasBase,
  };
}

function importarExcelLista() {
  const input = document.getElementById('importFileInput');
  const file = input?.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows.length) return;
    const normalizedHeaders = rows[0].map((header) => normalizeHeader(header));
    const idxSku = normalizedHeaders.indexOf('sku');
    if (idxSku === -1) {
      alert('A planilha precisa conter uma coluna de SKU.');
      return;
    }
    const idxCusto = normalizedHeaders.findIndex((header) => {
      if (!header.includes('custo')) return false;
      if (
        header.includes('minimo') ||
        header.includes('medio') ||
        header.includes('maximo') ||
        header.includes('comissao')
      ) {
        return false;
      }
      return (
        header === 'custo' ||
        header.startsWith('custo (r$') ||
        header.startsWith('custo r$') ||
        header.startsWith('custo base')
      );
    });
    const idxPrecoMin = findHeaderIndex(normalizedHeaders, ['preco', 'minimo']);
    const idxPrecoIdeal = findHeaderIndex(normalizedHeaders, ['preco', 'ideal']);
    const idxPrecoMedio = findHeaderIndex(normalizedHeaders, ['preco', 'medio']);
    const idxPrecoPromo = findHeaderIndex(normalizedHeaders, ['preco', 'promo']);
    const idxCustoMin = findHeaderIndex(normalizedHeaders, ['custo', 'minimo'], [
      'comissao',
    ]);
    const idxComissaoMin = findHeaderIndex(normalizedHeaders, ['comissao', 'minimo']);
    const idxCustoMedio = findHeaderIndex(normalizedHeaders, ['custo', 'medio'], [
      'comissao',
    ]);
    const idxComissaoMedio = findHeaderIndex(normalizedHeaders, ['comissao', 'medio']);
    const idxCustoMax = findHeaderIndex(normalizedHeaders, ['custo', 'maximo'], [
      'comissao',
    ]);
    const idxComissaoMax = findHeaderIndex(normalizedHeaders, ['comissao', 'maximo']);
    let updated = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const skuCell = row[idxSku];
      const sku = skuCell !== undefined && skuCell !== null ? String(skuCell).trim() : '';
      if (!sku) continue;
      const prod = produtos.find((p) => String(p.sku).trim() === sku);
      if (!prod) continue;
      const updateData = {};
      const custosImportados = {};
      const aplicarCusto = (nivel, idxValor, idxComissao) => {
        const temValor = idxValor !== -1 && hasCellValue(row[idxValor]);
        const temComissao = idxComissao !== -1 && hasCellValue(row[idxComissao]);
        if (!temValor && !temComissao) return;
        const dados = {};
        if (temValor) {
          const valor = parsePlanilhaNumero(row[idxValor]);
          if (Number.isFinite(valor)) dados.valor = valor;
        }
        if (temComissao) {
          const comissao = parsePlanilhaNumero(row[idxComissao]);
          if (Number.isFinite(comissao)) dados.comissao = comissao;
        }
        if (Object.keys(dados).length) {
          custosImportados[nivel] = dados;
        }
      };
      aplicarCusto('minimo', idxCustoMin, idxComissaoMin);
      aplicarCusto('medio', idxCustoMedio, idxComissaoMedio);
      aplicarCusto('maximo', idxCustoMax, idxComissaoMax);
      if (Object.keys(custosImportados).length) {
        const custosAtuais = obterCustosDoProduto(prod);
        const custosMesclados = {};
        NIVEIS_CUSTO.forEach((nivel) => {
          const atual = custosAtuais[nivel] || {};
          const novo = custosImportados[nivel] || {};
          custosMesclados[nivel] = {
            valor: novo.valor !== undefined ? novo.valor : atual.valor,
            comissao: novo.comissao !== undefined ? novo.comissao : atual.comissao,
          };
        });
        const resultado = recalcularPrecos(prod, custosMesclados);
        if (resultado) {
          Object.assign(updateData, resultado);
        }
      } else if (idxCusto !== -1 && hasCellValue(row[idxCusto])) {
        const novoCusto = parsePlanilhaNumero(row[idxCusto]);
        if (Number.isFinite(novoCusto)) {
          const resultado = recalcularPrecos(prod, novoCusto);
          if (resultado) {
            Object.assign(updateData, resultado);
          }
        }
      } else {
        if (idxPrecoMin !== -1 && hasCellValue(row[idxPrecoMin])) {
          const precoMinimo = parsePlanilhaNumero(row[idxPrecoMin]);
          if (Number.isFinite(precoMinimo)) updateData.precoMinimo = precoMinimo;
        }
        if (idxPrecoIdeal !== -1 && hasCellValue(row[idxPrecoIdeal])) {
          const precoIdeal = parsePlanilhaNumero(row[idxPrecoIdeal]);
          if (Number.isFinite(precoIdeal)) updateData.precoIdeal = precoIdeal;
        }
        if (idxPrecoMedio !== -1 && hasCellValue(row[idxPrecoMedio])) {
          const precoMedio = parsePlanilhaNumero(row[idxPrecoMedio]);
          if (Number.isFinite(precoMedio)) updateData.precoMedio = precoMedio;
        }
        if (idxPrecoPromo !== -1 && hasCellValue(row[idxPrecoPromo])) {
          const precoPromo = parsePlanilhaNumero(row[idxPrecoPromo]);
          if (Number.isFinite(precoPromo)) updateData.precoPromo = precoPromo;
        }
      }
      if (Object.keys(updateData).length) {
        await dbListaPrecos
          .collection('uid')
          .doc(prod.uid)
          .collection('produtos')
          .doc(prod.id)
          .update(updateData);
        Object.assign(prod, updateData);
        updated++;
      }
    }
    input.value = '';
    aplicarFiltros();
    alert(`${updated} produtos atualizados`);
  };
  reader.readAsArrayBuffer(file);
}
// Expose functions for inline event handlers
window.verDetalhes = verDetalhes;
window.editarProduto = editarProduto;
window.excluirProduto = excluirProduto;
window.toggleSelecionado = toggleSelecionado;
window.excluirSelecionados = excluirSelecionados;
window.excluirTodos = excluirTodos;
window.exportarExcelLista = exportarExcelLista;
window.exportarPlanilhaPrecificacao = exportarPlanilhaPrecificacao;
window.exportarPDFLista = exportarPDFLista;
window.importarExcelLista = importarExcelLista;
window.fecharModal = fecharModal;

function setupListeners() {
  document
    .getElementById('filtroBusca')
    ?.addEventListener('input', aplicarFiltros);
  document
    .getElementById('tipoFiltro')
    ?.addEventListener('change', aplicarFiltros);
  document.getElementById('btnCardView')?.addEventListener('click', () => {
    viewMode = 'cards';
    aplicarFiltros();
  });
  document.getElementById('btnListView')?.addEventListener('click', () => {
    viewMode = 'list';
    aplicarFiltros();
  });
  document
    .getElementById('selectAll')
    ?.addEventListener('change', (e) => selecionarTodos(e.target.checked));
}

function initTooltips() {
  document.querySelectorAll('.tooltip').forEach((el) => {
    const text = el.getAttribute('data-tooltip');
    if (text && !el.querySelector('.tooltip-text')) {
      const span = document.createElement('span');
      span.className = 'tooltip-text';
      span.textContent = text;
      el.appendChild(span);
    }
  });
}

function init() {
  setupListeners();
  initTooltips();
  // Aguardamos o evento de autenticação abaixo para carregar os produtos
}

if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
authListaPrecos.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  carregarProdutos();
});

// Expose functions for inline handlers
Object.assign(window, {
  exportarExcelLista,
  exportarPlanilhaPrecificacao,
  exportarPDFLista,
  importarExcelLista,
  excluirSelecionados,
  excluirTodos,
  toggleSelecionado,
  verDetalhes,
  editarProduto,
  excluirProduto,
  fecharModal,
});
