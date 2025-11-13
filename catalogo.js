import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';
import { showToast } from './utils.js';
import { loadUserProfile } from './login.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

const totalEl = document.getElementById('catalogTotal');
const todayEl = document.getElementById('catalogToday');
const managerEl = document.getElementById('catalogManager');
const cardsContainer = document.getElementById('catalogCards');
const listContainer = document.getElementById('catalogList');
const listBody = document.getElementById('catalogListBody');
const emptyStateEl = document.getElementById('catalogEmptyState');
const searchInput = document.getElementById('catalogSearchInput');
const addItemBtn = document.getElementById('catalogAddItemBtn');
const formWrapper = document.getElementById('catalogFormWrapper');
const form = document.getElementById('catalogProductForm');
const cancelFormBtn = document.getElementById('catalogCancelForm');
const modal = document.getElementById('catalogDetailsModal');
const modalBackdrop = document.getElementById('catalogDetailsBackdrop');
const modalCloseBtn = document.getElementById('catalogDetailsClose');
const modalTitle = document.getElementById('catalogDetailsTitle');
const modalSku = document.getElementById('catalogDetailsSku');
const modalCategoria = document.getElementById('catalogDetailsCategoria');
const modalCusto = document.getElementById('catalogDetailsCusto');
const modalPreco = document.getElementById('catalogDetailsPreco');
const modalDescricao = document.getElementById('catalogDetailsDescricao');
const modalMedidas = document.getElementById('catalogDetailsMedidas');
const modalPackageSize = document.getElementById('catalogDetailsPackageSize');
const modalComponents = document.getElementById('catalogDetailsComponents');
const modalFotos = document.getElementById('catalogDetailsFotos');
const modalVariacoes = document.getElementById('catalogDetailsVariacoes');
const modalDriveLinkSection = document.getElementById(
  'catalogDetailsDriveLinkSection',
);
const modalDriveLinkBtn = document.getElementById('catalogDetailsDriveLink');
const modalDriveLinkEmpty = document.getElementById(
  'catalogDetailsDriveLinkEmpty',
);
const copyTitleBtn = document.getElementById('catalogCopyTitleBtn');
const copyDescriptionBtn = document.getElementById('catalogCopyDescriptionBtn');
const downloadImagesBtn = document.getElementById('catalogDownloadImagesBtn');
const viewCardBtn = document.getElementById('catalogViewCard');
const viewListBtn = document.getElementById('catalogViewList');

const nameInput = document.getElementById('catalogProductName');
const skuInput = document.getElementById('catalogProductSku');
const costMinInput = document.getElementById('catalogProductCostMin');
const costAvgInput = document.getElementById('catalogProductCostAvg');
const costMaxInput = document.getElementById('catalogProductCostMax');
const priceMinInput = document.getElementById('catalogProductPriceMin');
const priceAvgInput = document.getElementById('catalogProductPriceAvg');
const priceMaxInput = document.getElementById('catalogProductPriceMax');
const categoryInput = document.getElementById('catalogProductCategory');
const descriptionInput = document.getElementById('catalogProductDescription');
const driveLinkInput = document.getElementById('catalogProductDriveLink');
const measuresInput = document.getElementById('catalogProductMeasures');
const packageSizeInput = document.getElementById('catalogProductPackageSize');
const componentsScrewsInput = document.getElementById(
  'catalogProductComponentsScrews',
);
const componentsWiringInput = document.getElementById(
  'catalogProductComponentsWiring',
);
const componentsSocketInput = document.getElementById(
  'catalogProductComponentsSocket',
);
const componentsOthersQuantityInput = document.getElementById(
  'catalogProductComponentsOthersQuantity',
);
const componentsOthersDescriptionInput = document.getElementById(
  'catalogProductComponentsOthersDescription',
);
const photosInput = document.getElementById('catalogProductPhotos');
const photoUrlsInput = document.getElementById('catalogProductPhotoUrls');
const colorVariationsContainer = document.getElementById(
  'catalogColorVariations',
);
const addColorVariationBtn = document.getElementById(
  'catalogAddColorVariation',
);
const editingNotice = document.getElementById('catalogEditingNotice');
const editingNameEl = document.getElementById('catalogEditingName');
const editingCancelBtn = document.getElementById('catalogEditingCancel');
const submitBtn = form?.querySelector('button[type="submit"]');
const exportPdfBtn = document.getElementById('catalogExportPdf');
const exportExcelBtn = document.getElementById('catalogExportExcel');
const kitCalculateBtn = document.getElementById('catalogCalculateKit');
const kitSelectionInfoEl = document.getElementById('catalogKitSelectionInfo');
const kitResultEl = document.getElementById('catalogKitResult');
const deleteSelectedBtn = document.getElementById('catalogDeleteSelected');
const defaultEmptyStateMessage = emptyStateEl?.innerHTML || '';

let currentUser = null;
let currentProfile = null;
let scopeUid = null;
let responsavelInfo = null;
let canEdit = false;
let catalogUnsub = null;
let isSubmitting = false;
const productCache = new Map();
let editingProductId = null;
let editingProductData = null;
const selectedProducts = new Set();
let currentModalProduct = null;
let isDownloadingImages = false;
let isDeletingSelectedProducts = false;
const downloadImagesBtnDefaultContent = downloadImagesBtn?.innerHTML || '';
const deleteSelectedBtnDefaultContent = deleteSelectedBtn?.innerHTML || '';
let allProducts = [];
let currentViewMode = 'card';
let currentSearchTerm = '';

function normalizePerfil(perfil) {
  const base = (perfil || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!base) return '';
  if (['adm', 'admin', 'administrador'].includes(base)) return 'adm';
  if (['usuario completo', 'usuario'].includes(base)) return 'usuario';
  if (['usuario basico', 'cliente'].includes(base)) return 'cliente';
  if (
    [
      'gestor',
      'mentor',
      'responsavel',
      'gestor financeiro',
      'responsavel financeiro',
      'gerente',
    ].includes(base)
  )
    return 'gestor';
  if (['seller', 'vendedor'].includes(base)) return 'seller';
  if (['expedicao', 'gestor expedicao', 'gestor de expedicao'].includes(base))
    return 'expedicao';
  if (['posvendas', 'pos-vendas', 'pos vendas'].includes(base))
    return 'posvendas';
  if (['casarosa', 'casa rosa', 'casa-rosa'].includes(base)) return 'casarosa';
  return base;
}

function normalizeSearchValue(value) {
  if (value === null || value === undefined) return '';
  let normalized = value.toString();
  if (typeof normalized.normalize === 'function') {
    normalized = normalized.normalize('NFD');
  }
  normalized = normalized.replace(/[\u0300-\u036f]/g, '');
  return normalized.toLowerCase().replace(/\s+/g, ' ').trim();
}

function filterProductsBySearch(produtos, termo) {
  const collection = Array.isArray(produtos) ? produtos : [];
  const normalizedTerm = normalizeSearchValue(termo);
  if (!normalizedTerm) {
    return [...collection];
  }
  return collection.filter((produto) => {
    const nome = normalizeSearchValue(produto?.nome || '');
    const sku = normalizeSearchValue(produto?.sku || '');
    return nome.includes(normalizedTerm) || sku.includes(normalizedTerm);
  });
}

function refreshCatalogView() {
  const filtered = filterProductsBySearch(allProducts, currentSearchTerm);
  renderProducts(filtered, allProducts);
}

function formatCurrency(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(value);
  } catch (err) {
    console.warn('Não foi possível formatar o valor:', err);
    return value.toFixed(2);
  }
}

function parseNumericValue(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = Number(
      trimmed
        .replace(/R\$/gi, '')
        .replace(/\s+/g, '')
        .replace(/\./g, '')
        .replace(',', '.'),
    );
    if (!Number.isNaN(normalized)) return normalized;
  }
  return null;
}

function coalesceNumeric(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function getNumericValueFromKeys(source, keys = []) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const parsed = parseNumericValue(source[key]);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

function buildRangeFromProduto(produto, config = {}) {
  if (!produto || typeof produto !== 'object') {
    return { minimo: null, medio: null, maximo: null };
  }
  const {
    minKeys = [],
    medioKeys = [],
    maxKeys = [],
    fallbackKeys = [],
  } = config;
  const minimoDireto = getNumericValueFromKeys(produto, minKeys);
  const medioDireto = getNumericValueFromKeys(produto, medioKeys);
  const maximoDireto = getNumericValueFromKeys(produto, maxKeys);
  const fallbackDireto = getNumericValueFromKeys(produto, fallbackKeys);

  return {
    minimo: minimoDireto,
    medio: medioDireto,
    maximo: maximoDireto,
    fallback: coalesceNumeric(
      fallbackDireto,
      medioDireto,
      minimoDireto,
      maximoDireto,
    ),
  };
}

function getProductCostRange(produto) {
  return buildRangeFromProduto(produto, {
    minKeys: ['custoMinimo', 'custo_minimo', 'custoMin'],
    medioKeys: ['custoMedio', 'custo_medio', 'custoMed', 'custo'],
    maxKeys: ['custoMaximo', 'custo_maximo', 'custoMax'],
    fallbackKeys: ['custoUnitario', 'valorCusto', 'custoTotal'],
  });
}

function getProductPriceRange(produto) {
  return buildRangeFromProduto(produto, {
    minKeys: [
      'precoSugeridoMinimo',
      'preco_sugerido_minimo',
      'precoMinimo',
      'precoMin',
    ],
    medioKeys: [
      'precoSugeridoMedio',
      'precoSugerido',
      'preco',
      'valorVenda',
      'precoUnitario',
    ],
    maxKeys: [
      'precoSugeridoMaximo',
      'preco_sugerido_maximo',
      'precoMaximo',
      'precoMax',
    ],
    fallbackKeys: ['precoSugerido', 'preco', 'valorVenda', 'precoUnitario'],
  });
}

function formatRangeLines(
  range,
  { shortLabels = false, collapseEquals = true } = {},
) {
  if (!range || typeof range !== 'object') return [];
  const labels = shortLabels
    ? { minimo: 'Mín', medio: 'Méd', maximo: 'Máx', referencia: 'Ref.' }
    : {
        minimo: 'Mínimo',
        medio: 'Médio',
        maximo: 'Máximo',
        referencia: 'Referência',
      };
  const entries = [
    {
      key: 'minimo',
      label: labels.minimo,
      value:
        typeof range.minimo === 'number' && !Number.isNaN(range.minimo)
          ? range.minimo
          : null,
    },
    {
      key: 'medio',
      label: labels.medio,
      value:
        typeof range.medio === 'number' && !Number.isNaN(range.medio)
          ? range.medio
          : null,
    },
    {
      key: 'maximo',
      label: labels.maximo,
      value:
        typeof range.maximo === 'number' && !Number.isNaN(range.maximo)
          ? range.maximo
          : null,
    },
  ].filter((entry) => entry.value !== null);

  if (!entries.length) {
    const fallbackValue =
      typeof range.fallback === 'number' && !Number.isNaN(range.fallback)
        ? range.fallback
        : null;
    if (fallbackValue !== null) {
      return [`${labels.referencia}: ${formatCurrency(fallbackValue)}`];
    }
    return [];
  }

  if (collapseEquals) {
    const uniqueValues = new Set(entries.map((entry) => entry.value));
    if (uniqueValues.size === 1 && entries.length > 1) {
      const [first] = entries;
      return [`${labels.referencia}: ${formatCurrency(first.value)}`];
    }
  }

  return entries.map(
    (entry) => `${entry.label}: ${formatCurrency(entry.value)}`,
  );
}

function formatRangeForDisplay(range, options) {
  const lines = formatRangeLines(range, options);
  return lines.length ? lines.join('\n') : '--';
}

function formatRangeForInline(range, options) {
  const lines = formatRangeLines(range, options);
  return lines.length ? lines.join(' • ') : '--';
}

function formatRangeForHtml(range, options) {
  const lines = formatRangeLines(range, options);
  return lines.length ? lines.join('<br>') : '--';
}

function sumRangeIntoTotals(totals, range, fallbackValue = 0) {
  if (!totals || !range) return;
  const normalizedFallback =
    typeof fallbackValue === 'number' && !Number.isNaN(fallbackValue)
      ? fallbackValue
      : 0;
  const resolveValue = (primary, secondary, tertiary) =>
    coalesceNumeric(
      typeof primary === 'number' && !Number.isNaN(primary) ? primary : null,
      typeof secondary === 'number' && !Number.isNaN(secondary)
        ? secondary
        : null,
      typeof tertiary === 'number' && !Number.isNaN(tertiary) ? tertiary : null,
      normalizedFallback,
    ) || 0;

  totals.minimo += resolveValue(range.minimo, range.medio, range.maximo);
  totals.medio += resolveValue(range.medio, range.minimo, range.maximo);
  totals.maximo += resolveValue(range.maximo, range.medio, range.minimo);
}

function parseFormNumberValue(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNumberFromInput(input) {
  if (!input || typeof input.value !== 'string') return null;
  return parseFormNumberValue(input.value);
}

function normalizeComponentQuantity(value) {
  if (value === null || value === undefined) return null;
  const parsed = parseNumericValue(value);
  if (parsed === null) return null;
  if (Number.isNaN(parsed)) return null;
  const rounded = Math.round(parsed);
  if (!Number.isFinite(rounded)) return null;
  return rounded < 0 ? 0 : rounded;
}

function getFirstAvailableValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return null;
}

function getComponentEntries(produto) {
  if (!produto) return [];
  const componentes = produto.componentes;
  if (!componentes || typeof componentes !== 'object') return [];

  const entries = [];

  const parafusos = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, ['parafusos', 'qtdParafusos']),
  );
  if (parafusos !== null && parafusos > 0) {
    entries.push({ label: 'Parafusos', quantity: parafusos });
  }

  const fiacao = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, ['fiacao', 'fios']),
  );
  if (fiacao !== null && fiacao > 0) {
    entries.push({ label: 'Fiação', quantity: fiacao });
  }

  const bocal = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, ['bocal', 'bocais']),
  );
  if (bocal !== null && bocal > 0) {
    entries.push({ label: 'Bocal', quantity: bocal });
  }

  const outrosQuantidadeValor = getFirstAvailableValue(componentes, [
    'outrosQuantidade',
    'outrosQtd',
    'outrosQtde',
    'outros',
  ]);
  const outrosQuantidade = normalizeComponentQuantity(outrosQuantidadeValor);
  let outrosDescricaoRaw = getFirstAvailableValue(componentes, [
    'outrosDescricao',
    'descricaoOutros',
    'outrosDescricaoTexto',
    'outrosDetalhes',
    'outrosNome',
  ]);
  if (
    !outrosDescricaoRaw &&
    typeof outrosQuantidadeValor === 'string' &&
    outrosQuantidade === null
  ) {
    outrosDescricaoRaw = outrosQuantidadeValor;
  }
  const outrosDescricao =
    typeof outrosDescricaoRaw === 'string' ? outrosDescricaoRaw.trim() : '';
  if ((outrosQuantidade !== null && outrosQuantidade > 0) || outrosDescricao) {
    entries.push({
      label: outrosDescricao ? `Outros (${outrosDescricao})` : 'Outros',
      quantity:
        outrosQuantidade !== null && outrosQuantidade > 0
          ? outrosQuantidade
          : null,
    });
  }

  return entries;
}

function getComponentSummaryText(produto) {
  const entries = getComponentEntries(produto);
  if (!entries.length) return '';
  return entries
    .map((entry) => {
      if (typeof entry.quantity === 'number') {
        return `${entry.label} (${entry.quantity})`;
      }
      return entry.label;
    })
    .join(', ');
}

function formatComponentQuantityForDisplay(quantity) {
  if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    return `${quantity}`;
  }
  return '--';
}

function getPuxadorDisplay(produto) {
  if (!produto || typeof produto !== 'object') return '--';
  const componentes = produto.componentes;
  if (!componentes || typeof componentes !== 'object') return '--';

  const descricaoBruta = getFirstAvailableValue(componentes, [
    'puxadorDescricao',
    'descricaoPuxador',
    'puxador',
    'puxadores',
    'tipoPuxador',
    'modeloPuxador',
    'puxadorTipo',
  ]);
  const quantidade = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, [
      'puxadorQuantidade',
      'puxadoresQuantidade',
    ]),
  );

  const descricao =
    typeof descricaoBruta === 'string'
      ? descricaoBruta.trim()
      : descricaoBruta && typeof descricaoBruta.toString === 'function'
        ? descricaoBruta.toString().trim()
        : '';

  if (quantidade !== null && descricao) {
    return `${descricao} (${quantidade})`;
  }
  if (quantidade !== null) {
    return `${quantidade}`;
  }
  if (descricao) {
    return descricao;
  }
  return '--';
}

function getAdditionalComponentDisplays(produto) {
  const entries = getComponentEntries(produto).filter(
    (entry) => entry && entry.label !== 'Parafusos',
  );
  return entries.map((entry) => {
    if (!entry) return '--';
    const { label, quantity } = entry;
    if (typeof quantity === 'number' && Number.isFinite(quantity)) {
      return `${label} (${quantity})`;
    }
    return label;
  });
}

function getProductCost(produto) {
  const faixa = getProductCostRange(produto);
  const valor = coalesceNumeric(
    faixa.medio,
    faixa.minimo,
    faixa.maximo,
    faixa.fallback,
    parseNumericValue(produto?.custo),
    parseNumericValue(produto?.custoUnitario),
    parseNumericValue(produto?.valorCusto),
    parseNumericValue(produto?.custoTotal),
  );
  return typeof valor === 'number' && !Number.isNaN(valor) ? valor : 0;
}

function getProductPrice(produto) {
  const faixa = getProductPriceRange(produto);
  const valor = coalesceNumeric(
    faixa.medio,
    faixa.minimo,
    faixa.maximo,
    faixa.fallback,
    parseNumericValue(produto?.precoSugerido),
    parseNumericValue(produto?.preco),
    parseNumericValue(produto?.valorVenda),
    parseNumericValue(produto?.precoUnitario),
  );
  return typeof valor === 'number' && !Number.isNaN(valor) ? valor : 0;
}

function setCardSelectedState(card, selected) {
  if (!card) return;
  if (card.dataset.viewType === 'list') {
    const listClasses = ['bg-indigo-50'];
    if (selected) {
      card.classList.add(...listClasses);
    } else {
      card.classList.remove(...listClasses);
    }
    return;
  }
  const classes = ['ring-2', 'ring-indigo-300', 'border-indigo-400'];
  if (selected) {
    card.classList.add(...classes);
  } else {
    card.classList.remove(...classes);
  }
}

function updateKitControlsState() {
  const count = selectedProducts.size;
  if (kitCalculateBtn) {
    kitCalculateBtn.disabled = count === 0;
    if (count === 0) {
      kitCalculateBtn.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
      kitCalculateBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }
  if (deleteSelectedBtn) {
    const shouldDisable = count === 0 || isDeletingSelectedProducts;
    deleteSelectedBtn.disabled = shouldDisable;
    if (shouldDisable) {
      deleteSelectedBtn.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
      deleteSelectedBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }
  if (kitSelectionInfoEl) {
    kitSelectionInfoEl.textContent =
      count === 0
        ? 'Selecione os produtos para montar um kit.'
        : `${count} produto${count > 1 ? 's' : ''} selecionado${
            count > 1 ? 's' : ''
          }.`;
  }
  if (count === 0 && kitResultEl) {
    kitResultEl.classList.add('hidden');
    kitResultEl.textContent = '';
  }
}

function setDeleteSelectedButtonLoading(loading) {
  if (!deleteSelectedBtn) return;
  isDeletingSelectedProducts = Boolean(loading);
  if (loading) {
    deleteSelectedBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i><span>Excluindo...</span>';
  } else {
    deleteSelectedBtn.innerHTML = deleteSelectedBtnDefaultContent;
  }
  updateKitControlsState();
}

function deselectProducts(productIds) {
  const ids = Array.isArray(productIds)
    ? productIds.filter((id) => typeof id === 'string' && id)
    : [];
  if (!ids.length) return;
  const idSet = new Set(ids);
  ids.forEach((id) => selectedProducts.delete(id));
  const checkboxes = document.querySelectorAll('.catalog-select-checkbox');
  checkboxes.forEach((element) => {
    if (!(element instanceof HTMLInputElement)) return;
    const container = element.closest('[data-product-id]');
    if (!container || !idSet.has(container.dataset.productId || '')) return;
    element.checked = false;
    setCardSelectedState(container, false);
  });
  if (
    !selectedProducts.size &&
    kitResultEl &&
    !kitResultEl.classList.contains('hidden')
  ) {
    kitResultEl.classList.add('hidden');
    kitResultEl.textContent = '';
  }
  updateKitControlsState();
}

function handleProductSelection(productId, isSelected) {
  if (!productId) return;
  if (isSelected) {
    selectedProducts.add(productId);
  } else {
    selectedProducts.delete(productId);
  }
  if (kitResultEl && !kitResultEl.classList.contains('hidden')) {
    kitResultEl.classList.add('hidden');
    kitResultEl.textContent = '';
  }
  updateKitControlsState();
}

function handleCalculateKit() {
  if (!selectedProducts.size) {
    showToast('Selecione ao menos um produto para montar o kit.', 'warning');
    return;
  }
  const totalCost = { minimo: 0, medio: 0, maximo: 0 };
  const totalPrice = { minimo: 0, medio: 0, maximo: 0 };
  selectedProducts.forEach((productId) => {
    const produto = productCache.get(productId);
    if (!produto) return;
    sumRangeIntoTotals(
      totalCost,
      getProductCostRange(produto),
      getProductCost(produto),
    );
    sumRangeIntoTotals(
      totalPrice,
      getProductPriceRange(produto),
      getProductPrice(produto),
    );
  });
  if (kitResultEl) {
    const count = selectedProducts.size;
    const partes = [
      `<p class="font-semibold">Kit com ${count} produto${
        count > 1 ? 's' : ''
      } selecionado${count > 1 ? 's' : ''}.</p>`,
      `<p class="mt-1">Custo total: <span class="font-semibold">${formatRangeForInline(
        totalCost,
        { shortLabels: true, collapseEquals: false },
      )}</span></p>`,
      `<p class="mt-1">Valor de venda total: <span class="font-semibold">${formatRangeForInline(
        totalPrice,
        { shortLabels: true, collapseEquals: false },
      )}</span></p>`,
    ];
    kitResultEl.innerHTML = partes.join('');
    kitResultEl.classList.remove('hidden');
  }
}

async function handleDeleteSelectedProducts() {
  if (!canEdit) {
    showToast(
      'Você não tem permissão para excluir produtos do catálogo.',
      'warning',
    );
    return;
  }
  const count = selectedProducts.size;
  if (!count) {
    showToast('Selecione ao menos um produto para excluir.', 'warning');
    return;
  }
  if (!scopeUid) {
    showToast(
      'Não foi possível identificar o responsável pelo catálogo.',
      'error',
    );
    return;
  }

  const confirmationMessage =
    count === 1
      ? 'Tem certeza que deseja excluir o produto selecionado do catálogo?'
      : `Tem certeza que deseja excluir ${count} produtos selecionados do catálogo?`;

  const confirmed =
    typeof window !== 'undefined' ? window.confirm(confirmationMessage) : true;
  if (!confirmed) return;

  const colRef = collection(db, 'usuarios', scopeUid, 'catalogoProdutos');
  const ids = Array.from(selectedProducts);

  try {
    setDeleteSelectedButtonLoading(true);
    const results = await Promise.allSettled(
      ids.map((id) => deleteDoc(doc(colRef, id))),
    );

    const failedIds = [];
    const successfulIds = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulIds.push(ids[index]);
      } else {
        console.error('Erro ao excluir produto do catálogo:', result.reason);
        failedIds.push(ids[index]);
      }
    });

    if (successfulIds.length) {
      deselectProducts(successfulIds);
    }

    if (failedIds.length === ids.length) {
      showToast(
        'Não foi possível excluir os produtos selecionados. Tente novamente.',
        'error',
      );
      return;
    }

    if (failedIds.length) {
      showToast(
        'Alguns produtos não puderam ser excluídos. Verifique o console para mais detalhes.',
        'warning',
      );
    } else {
      showToast('Produtos excluídos com sucesso!', 'success');
    }
  } catch (error) {
    console.error('Erro inesperado ao excluir produtos do catálogo:', error);
    showToast(
      'Não foi possível excluir os produtos selecionados. Tente novamente.',
      'error',
    );
  } finally {
    setDeleteSelectedButtonLoading(false);
  }
}

async function handleDeleteProduct(produto, triggerButton) {
  if (!canEdit) {
    showToast(
      'Você não tem permissão para excluir produtos do catálogo.',
      'warning',
    );
    return;
  }
  if (!produto || !produto.id) {
    showToast('Não foi possível identificar o produto selecionado.', 'error');
    return;
  }
  if (!scopeUid) {
    showToast(
      'Não foi possível identificar o responsável pelo catálogo.',
      'error',
    );
    return;
  }

  const descricao = produto.nome || produto.sku || 'este produto';
  const confirmationMessage = `Tem certeza que deseja excluir "${descricao}" do catálogo? Esta ação não pode ser desfeita.`;
  const confirmed =
    typeof window !== 'undefined' ? window.confirm(confirmationMessage) : true;
  if (!confirmed) return;

  const button =
    triggerButton instanceof HTMLButtonElement ? triggerButton : null;
  const originalContent = button ? button.innerHTML : null;
  if (button) {
    button.disabled = true;
    button.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i><span>Excluindo...</span>';
  }

  try {
    const colRef = collection(db, 'usuarios', scopeUid, 'catalogoProdutos');
    await deleteDoc(doc(colRef, produto.id));
    deselectProducts([produto.id]);
    showToast('Produto excluído com sucesso!', 'success');
  } catch (error) {
    console.error('Erro ao excluir produto do catálogo:', error);
    showToast('Não foi possível excluir o produto. Tente novamente.', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      if (originalContent !== null) {
        button.innerHTML = originalContent;
      }
    }
  }
}

function toggleForm(visible) {
  if (!formWrapper || !addItemBtn) return;
  if (!canEdit) {
    formWrapper.classList.add('hidden');
    addItemBtn.classList.add('hidden');
    return;
  }
  const shouldShow =
    typeof visible === 'boolean'
      ? visible
      : formWrapper.classList.contains('hidden');
  if (shouldShow) {
    formWrapper.classList.remove('hidden');
    addItemBtn.classList.add('hidden');
  } else {
    formWrapper.classList.add('hidden');
    addItemBtn.classList.remove('hidden');
  }
}

function updateSubmitButtonLabel() {
  if (!submitBtn) return;
  const span = submitBtn.querySelector('span');
  if (span)
    span.textContent = editingProductId
      ? 'Atualizar produto'
      : 'Salvar produto';
}

function updateEditingNotice() {
  if (!editingNotice) return;
  if (editingProductId) {
    editingNotice.classList.remove('hidden');
    editingNotice.classList.add('flex');
    if (editingNameEl) {
      const descricao =
        editingProductData?.nome || editingProductData?.sku || '';
      editingNameEl.textContent = descricao ? `Produto: ${descricao}` : '';
    }
  } else {
    editingNotice.classList.add('hidden');
    editingNotice.classList.remove('flex');
    if (editingNameEl) editingNameEl.textContent = '';
  }
}

function createColorVariationRow(variacao = {}) {
  const wrapper = document.createElement('div');
  wrapper.className =
    'catalog-color-variation grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-3 sm:items-end';

  const colorGroup = document.createElement('div');
  colorGroup.className = 'flex flex-col gap-1';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'text-xs font-semibold uppercase text-gray-600';
  colorLabel.textContent = 'Cor';
  const colorInput = document.createElement('input');
  colorInput.type = 'text';
  colorInput.value = variacao.cor || '';
  colorInput.placeholder = 'Ex.: Preto, Azul, Vermelho';
  colorInput.className =
    'catalog-color-name rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  colorGroup.append(colorLabel, colorInput);

  const urlGroup = document.createElement('div');
  urlGroup.className = 'flex flex-col gap-1';
  const urlLabel = document.createElement('label');
  urlLabel.className = 'text-xs font-semibold uppercase text-gray-600';
  urlLabel.textContent = 'URL da foto';
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.value = variacao.fotoUrl || '';
  urlInput.placeholder = 'https://exemplo.com/imagem-cor.jpg';
  urlInput.className =
    'catalog-color-url rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  urlGroup.append(urlLabel, urlInput);

  const actions = document.createElement('div');
  actions.className = 'flex items-center justify-end sm:justify-center';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100';
  removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Remover</span>';
  removeBtn.addEventListener('click', () => {
    wrapper.remove();
  });
  actions.appendChild(removeBtn);

  wrapper.append(colorGroup, urlGroup, actions);
  return wrapper;
}

function setColorVariations(variacoes = []) {
  if (!colorVariationsContainer) return;
  colorVariationsContainer.innerHTML = '';
  variacoes
    .filter((item) => item && (item.cor || item.fotoUrl))
    .forEach((variacao) => {
      colorVariationsContainer.appendChild(createColorVariationRow(variacao));
    });
}

function getColorVariations() {
  if (!colorVariationsContainer) return [];
  const rows = Array.from(
    colorVariationsContainer.querySelectorAll('.catalog-color-variation'),
  );
  return rows
    .map((row) => {
      const cor = row.querySelector('.catalog-color-name')?.value?.trim();
      const fotoUrl = row.querySelector('.catalog-color-url')?.value?.trim();
      if (!cor && !fotoUrl) return null;
      return {
        cor: cor || null,
        fotoUrl: fotoUrl || null,
      };
    })
    .filter(Boolean);
}

function resetComponentInputs() {
  if (componentsScrewsInput) componentsScrewsInput.value = '';
  if (componentsWiringInput) componentsWiringInput.value = '';
  if (componentsSocketInput) componentsSocketInput.value = '';
  if (componentsOthersQuantityInput) componentsOthersQuantityInput.value = '';
  if (componentsOthersDescriptionInput)
    componentsOthersDescriptionInput.value = '';
}

function fillComponentInputsFromProduct(produto) {
  const componentes =
    produto && typeof produto.componentes === 'object'
      ? produto.componentes
      : null;

  const assignValue = (input, valor) => {
    if (!input) return;
    if (valor === null || valor === undefined || Number.isNaN(valor)) {
      input.value = '';
    } else {
      input.value = valor;
    }
  };

  const parafusos = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, ['parafusos', 'qtdParafusos']),
  );
  assignValue(componentsScrewsInput, parafusos);

  const fiacao = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, ['fiacao', 'fios']),
  );
  assignValue(componentsWiringInput, fiacao);

  const bocal = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, ['bocal', 'bocais']),
  );
  assignValue(componentsSocketInput, bocal);

  const outrosQuantidade = normalizeComponentQuantity(
    getFirstAvailableValue(componentes, [
      'outrosQuantidade',
      'outrosQtd',
      'outrosQtde',
      'outros',
    ]),
  );
  assignValue(componentsOthersQuantityInput, outrosQuantidade);

  const outrosDescricaoRaw = getFirstAvailableValue(componentes, [
    'outrosDescricao',
    'descricaoOutros',
    'outrosDescricaoTexto',
    'outrosDetalhes',
    'outrosNome',
  ]);
  if (componentsOthersDescriptionInput) {
    componentsOthersDescriptionInput.value =
      typeof outrosDescricaoRaw === 'string' ? outrosDescricaoRaw.trim() : '';
  }
}

function getComponentDataFromInputs() {
  const parafusos = normalizeComponentQuantity(componentsScrewsInput?.value);
  const fiacao = normalizeComponentQuantity(componentsWiringInput?.value);
  const bocal = normalizeComponentQuantity(componentsSocketInput?.value);
  const outrosQuantidade = normalizeComponentQuantity(
    componentsOthersQuantityInput?.value,
  );
  const outrosDescricao = componentsOthersDescriptionInput?.value
    ? componentsOthersDescriptionInput.value.trim()
    : '';

  const possuiInformacoes =
    [parafusos, fiacao, bocal, outrosQuantidade].some(
      (valor) => typeof valor === 'number' && valor > 0,
    ) || Boolean(outrosDescricao);

  if (!possuiInformacoes) {
    return { possuiComponentes: null, componentes: null };
  }

  const componentes = {};
  if (parafusos !== null) componentes.parafusos = parafusos;
  if (fiacao !== null) componentes.fiacao = fiacao;
  if (bocal !== null) componentes.bocal = bocal;
  if (outrosQuantidade !== null)
    componentes.outrosQuantidade = outrosQuantidade;
  if (outrosDescricao) componentes.outrosDescricao = outrosDescricao;

  return { possuiComponentes: true, componentes };
}

function renderComponentsDetails(container, produto) {
  if (!container) return;
  container.innerHTML = '';
  const entries = getComponentEntries(produto);
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-gray-500';
    empty.textContent = 'Nenhum componente cadastrado.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'list-disc space-y-1 pl-5';
  entries.forEach((entry) => {
    const item = document.createElement('li');
    if (typeof entry.quantity === 'number') {
      item.textContent = `${entry.label} (${entry.quantity})`;
    } else {
      item.textContent = entry.label;
    }
    list.appendChild(item);
  });
  container.appendChild(list);
}

function clearForm() {
  form?.reset();
  if (costMinInput) costMinInput.value = '';
  if (costAvgInput) costAvgInput.value = '';
  if (costMaxInput) costMaxInput.value = '';
  if (priceMinInput) priceMinInput.value = '';
  if (priceAvgInput) priceAvgInput.value = '';
  if (priceMaxInput) priceMaxInput.value = '';
  if (packageSizeInput) packageSizeInput.value = '';
  if (photosInput) photosInput.value = '';
  if (photoUrlsInput) photoUrlsInput.value = '';
  if (driveLinkInput) driveLinkInput.value = '';
  resetComponentInputs();
  setColorVariations([]);
  editingProductId = null;
  editingProductData = null;
  updateSubmitButtonLabel();
  updateEditingNotice();
}

function getFileNameFromUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
    return parsed.hostname || '';
  } catch (err) {
    console.warn('URL inválida fornecida para foto:', url, err);
    return '';
  }
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('Erro ao copiar texto para a área de transferência:', err);
    return false;
  }
}

async function copyProductField(
  value,
  {
    successMessage = 'Copiado para a área de transferência!',
    emptyMessage = 'Nada para copiar.',
  } = {},
) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    showToast(emptyMessage, 'warning');
    return;
  }

  const copied = await copyTextToClipboard(text);
  if (copied) {
    showToast(successMessage, 'success');
  } else {
    showToast('Não foi possível copiar o conteúdo. Tente novamente.', 'error');
  }
}

function setDownloadImagesLoading(isLoading) {
  if (!downloadImagesBtn) return;
  if (isLoading) {
    downloadImagesBtn.disabled = true;
    downloadImagesBtn.classList.add('opacity-60', 'cursor-not-allowed');
    downloadImagesBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin text-xs"></i><span>Baixando...</span>';
  } else {
    downloadImagesBtn.disabled = false;
    downloadImagesBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    if (downloadImagesBtnDefaultContent) {
      downloadImagesBtn.innerHTML = downloadImagesBtnDefaultContent;
    }
  }
}

async function downloadProductImages() {
  if (isDownloadingImages) return;

  const produto = currentModalProduct;
  if (!produto) {
    showToast('Nenhum produto selecionado.', 'warning');
    return;
  }

  const fotos = Array.isArray(produto.fotos)
    ? produto.fotos.filter((foto) => foto?.url)
    : [];

  if (!fotos.length) {
    showToast('Nenhuma imagem disponível para download.', 'warning');
    return;
  }

  isDownloadingImages = true;
  setDownloadImagesLoading(true);

  const falhas = [];

  try {
    for (let index = 0; index < fotos.length; index += 1) {
      const foto = fotos[index];
      const rawName = getFileNameFromUrl(foto.url);
      let fileName = rawName ? decodeURIComponent(rawName) : '';
      if (fileName.includes('/')) {
        const partes = fileName.split('/');
        fileName = partes[partes.length - 1];
      }
      if (!fileName || !fileName.includes('.')) {
        fileName = `imagem-${index + 1}.jpg`;
      }

      try {
        const response = await fetch(foto.url);
        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        console.error('Erro ao baixar imagem do produto:', foto.url, err);
        falhas.push(fileName);
      }
    }

    if (falhas.length === fotos.length) {
      showToast('Não foi possível baixar as imagens do produto.', 'error');
    } else if (falhas.length > 0) {
      showToast(
        `Algumas imagens não puderam ser baixadas (${falhas.length}).`,
        'warning',
      );
    } else {
      showToast('Todas as imagens foram baixadas com sucesso!');
    }
  } finally {
    isDownloadingImages = false;
    setDownloadImagesLoading(false);
  }
}

function closeModal() {
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
  currentModalProduct = null;
  isDownloadingImages = false;
  setDownloadImagesLoading(false);
}

function openModal(produto) {
  if (!modal || !produto) return;
  currentModalProduct = produto;
  isDownloadingImages = false;
  setDownloadImagesLoading(false);
  modalTitle.textContent = produto.nome || 'Detalhes do produto';
  modalSku.textContent = produto.sku || '--';
  modalCategoria.textContent = produto.categoria || 'Sem categoria';
  if (modalCusto) {
    const custoHtml = formatRangeForHtml(getProductCostRange(produto), {
      shortLabels: true,
    });
    if (custoHtml === '--') {
      modalCusto.textContent = '--';
    } else {
      modalCusto.innerHTML = custoHtml;
    }
  }
  if (modalPreco) {
    const precoHtml = formatRangeForHtml(getProductPriceRange(produto), {
      shortLabels: true,
    });
    if (precoHtml === '--') {
      modalPreco.textContent = '--';
    } else {
      modalPreco.innerHTML = precoHtml;
    }
  }
  modalDescricao.textContent = produto.descricao || 'Sem descrição cadastrada.';
  modalMedidas.textContent = produto.medidas || 'Sem medidas cadastradas.';
  if (modalPackageSize) {
    modalPackageSize.textContent =
      produto.tamanhoEmbalagem || 'Sem tamanho de embalagem cadastrado.';
  }
  renderComponentsDetails(modalComponents, produto);

  const driveLink =
    produto.driveFolderLink || produto.driveLink || produto.linkDrive || '';
  if (modalDriveLinkSection && modalDriveLinkBtn && modalDriveLinkEmpty) {
    if (driveLink) {
      modalDriveLinkBtn.href = driveLink;
      modalDriveLinkSection.classList.remove('hidden');
      modalDriveLinkEmpty.classList.add('hidden');
    } else {
      modalDriveLinkBtn.removeAttribute('href');
      modalDriveLinkSection.classList.add('hidden');
      modalDriveLinkEmpty.classList.remove('hidden');
    }
  }

  modalFotos.innerHTML = '';
  const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
  if (!fotos.length) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-gray-500';
    empty.textContent = 'Nenhuma foto cadastrada.';
    modalFotos.appendChild(empty);
  } else {
    fotos.forEach((foto) => {
      if (!foto?.url) return;
      const link = document.createElement('a');
      link.href = foto.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className =
        'group block overflow-hidden rounded-lg border border-gray-200 shadow-sm';

      const img = document.createElement('img');
      img.src = foto.url;
      img.alt = foto.nome || produto.nome || 'Foto do produto';
      img.className =
        'h-32 w-full object-cover transition duration-200 group-hover:scale-105';

      link.appendChild(img);
      modalFotos.appendChild(link);
    });
  }

  if (modalVariacoes) {
    modalVariacoes.innerHTML = '';
    const variacoes = Array.isArray(produto.variacoesCor)
      ? produto.variacoesCor.filter(
          (item) => item && (item.cor || item.fotoUrl),
        )
      : [];
    if (!variacoes.length) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-gray-500';
      empty.textContent = 'Nenhuma variação cadastrada.';
      modalVariacoes.appendChild(empty);
    } else {
      variacoes.forEach((variacao) => {
        const item = document.createElement('div');
        item.className =
          'space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700';

        if (variacao.cor) {
          const corEl = document.createElement('p');
          corEl.className = 'font-medium text-gray-800';
          corEl.textContent = variacao.cor;
          item.appendChild(corEl);
        }

        if (variacao.fotoUrl) {
          const link = document.createElement('a');
          link.href = variacao.fotoUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className =
            'break-all text-xs text-blue-600 hover:text-blue-700';
          link.textContent = variacao.fotoUrl;
          item.appendChild(link);
        }

        if (!variacao.cor && !variacao.fotoUrl) {
          const emptyInfo = document.createElement('p');
          emptyInfo.className = 'text-xs text-gray-500';
          emptyInfo.textContent = 'Variação sem detalhes.';
          item.appendChild(emptyInfo);
        }

        modalVariacoes.appendChild(item);
      });
    }
  }

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function updateSummary(produtos) {
  if (totalEl) totalEl.textContent = produtos.length.toString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = produtos.filter((produto) => {
    const ts = produto.createdAt;
    const date =
      ts && typeof ts.toDate === 'function'
        ? ts.toDate()
        : ts instanceof Date
          ? ts
          : null;
    if (!date) return false;
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime() === today.getTime();
  }).length;
  if (todayEl) todayEl.textContent = todayCount.toString();
}

function formatCurrencyForExport(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return formatCurrency(value);
  }
  if (typeof value === 'string') {
    const direct = Number(value);
    if (!Number.isNaN(direct)) {
      return formatCurrency(direct);
    }
    const normalized = Number(
      value
        .replace(/R\$/gi, '')
        .replace(/\s+/g, '')
        .replace(/\./g, '')
        .replace(',', '.'),
    );
    if (!Number.isNaN(normalized)) {
      return formatCurrency(normalized);
    }
    return value;
  }
  return '';
}

function getCatalogExportData() {
  const produtos = Array.from(productCache.values());
  const headers = [
    'SKU',
    'Nome',
    'Categoria',
    'Custo mínimo',
    'Custo médio',
    'Custo máximo',
    'Preço sugerido mínimo',
    'Preço sugerido médio',
    'Preço sugerido máximo',
    'Descrição',
    'Medidas',
    'Tamanho da embalagem',
    'Componentes',
    'Variações de cor',
    'Fotos (URLs)',
  ];
  const linhas = produtos.map((produto) => {
    const custoRange = getProductCostRange(produto);
    const precoRange = getProductPriceRange(produto);
    const formatValue = (valor) =>
      typeof valor === 'number' && !Number.isNaN(valor)
        ? formatCurrencyForExport(valor)
        : '';
    const custoMinValue = custoRange.minimo;
    const custoMedValue =
      custoRange.medio !== null && custoRange.medio !== undefined
        ? custoRange.medio
        : (custoRange.fallback ?? null);
    const custoMaxValue = custoRange.maximo;
    const precoMinValue = precoRange.minimo;
    const precoMedValue =
      precoRange.medio !== null && precoRange.medio !== undefined
        ? precoRange.medio
        : (precoRange.fallback ?? null);
    const precoMaxValue = precoRange.maximo;
    const fotos = Array.isArray(produto.fotos)
      ? produto.fotos
          .map((foto) => foto?.url)
          .filter(Boolean)
          .join('\n')
      : '';
    const variacoes = Array.isArray(produto.variacoesCor)
      ? produto.variacoesCor
          .filter((item) => item && (item.cor || item.fotoUrl))
          .map((item) => {
            if (item.cor && item.fotoUrl)
              return `${item.cor} - ${item.fotoUrl}`;
            return item.cor || item.fotoUrl || '';
          })
          .filter(Boolean)
          .join('\n')
      : '';
    const componentesResumo = getComponentEntries(produto)
      .map((entry) => {
        if (typeof entry.quantity === 'number') {
          return `${entry.label}: ${entry.quantity}`;
        }
        return entry.label;
      })
      .join('\n');
    return [
      produto.sku || '',
      produto.nome || '',
      produto.categoria || '',
      formatValue(custoMinValue),
      formatValue(custoMedValue),
      formatValue(custoMaxValue),
      formatValue(precoMinValue),
      formatValue(precoMedValue),
      formatValue(precoMaxValue),
      produto.descricao || '',
      produto.medidas || '',
      produto.tamanhoEmbalagem || '',
      componentesResumo,
      variacoes,
      fotos,
    ];
  });
  return { headers, linhas };
}

function getProductsGroupedByCategory() {
  const produtos = Array.from(productCache.values());
  const grupos = new Map();
  produtos.forEach((produto) => {
    const categoriaBase = (produto.categoria || '').trim();
    const chave = categoriaBase ? categoriaBase : 'Sem categoria';
    if (!grupos.has(chave)) {
      grupos.set(chave, []);
    }
    grupos.get(chave).push(produto);
  });

  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  return Array.from(grupos.entries())
    .map(([categoria, itens]) => ({
      categoria,
      produtos: itens.sort((a, b) =>
        collator.compare(a.nome || '', b.nome || ''),
      ),
    }))
    .sort((a, b) => collator.compare(a.categoria, b.categoria));
}

function updateExportButtons(hasProducts) {
  const disabled = !hasProducts;
  [exportPdfBtn, exportExcelBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = disabled;
    if (disabled) {
      btn.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
      btn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  });
}

function exportCatalogToExcel() {
  const { headers, linhas } = getCatalogExportData();
  if (!linhas.length) {
    showToast('Não há produtos para exportar.', 'warning');
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca de planilhas não foi carregada.', 'error');
    return;
  }
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...linhas]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Catálogo');
  const nomeArquivo = `catalogo_produtos_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, nomeArquivo);
}

async function exportCatalogToPdf() {
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    showToast('Biblioteca de PDF não foi carregada.', 'error');
    return;
  }
  if (!productCache.size) {
    showToast('Não há produtos para exportar.', 'warning');
    return;
  }
  if (exportPdfBtn) {
    exportPdfBtn.disabled = true;
    exportPdfBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }
  const doc = new window.jspdf.jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  try {
    if (currentViewMode === 'list') {
      const grupos = getProductsGroupedByCategory();
      await generateListPdf(doc, grupos);
    } else {
      await generateCardPdf(doc);
    }
    const nomeArquivo = `catalogo_produtos_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    doc.save(nomeArquivo);
  } catch (error) {
    console.error('Erro ao gerar PDF do catálogo:', error);
    showToast('Não foi possível gerar o PDF do catálogo.', 'error');
  } finally {
    updateExportButtons(productCache.size > 0);
  }
}

async function generateCardPdf(doc) {
  if (typeof window.html2canvas !== 'function') {
    throw new Error('Biblioteca de captura não foi carregada.');
  }
  if (!cardsContainer) {
    throw new Error('Layout do catálogo não está disponível.');
  }

  const grupos = getProductsGroupedByCategory();
  if (!grupos.length) {
    showToast('Não há produtos para exportar.', 'warning');
    return;
  }

  const tempWrapper = document.createElement('div');
  const containerClasses = (cardsContainer.className || '')
    .split(/\s+/)
    .filter((classe) => classe && classe !== 'hidden')
    .join(' ');
  tempWrapper.className = containerClasses;
  tempWrapper.style.position = 'fixed';
  tempWrapper.style.left = '-99999px';
  tempWrapper.style.top = '0';
  tempWrapper.style.pointerEvents = 'none';
  tempWrapper.style.opacity = '0';
  const cardsStyles = window.getComputedStyle(cardsContainer);
  if (cardsStyles) {
    tempWrapper.style.padding = cardsStyles.padding;
    tempWrapper.style.gap = cardsStyles.gap;
  }
  const measuredWidth =
    cardsContainer.offsetWidth ||
    cardsContainer.scrollWidth ||
    document.body.clientWidth ||
    window.innerWidth ||
    1024;
  tempWrapper.style.width = `${Math.max(measuredWidth, 320)}px`;
  tempWrapper.style.backgroundColor = cardsStyles?.backgroundColor || '#ffffff';
  document.body.appendChild(tempWrapper);

  const cardElements = [];
  try {
    grupos.forEach((grupo) => {
      grupo.produtos.forEach((produto) => {
        const card = buildCatalogCardElement(produto, { interactive: false });
        if (!card) return;
        setCardSelectedState(card, false);
        tempWrapper.appendChild(card);
        cardElements.push(card);
      });
    });

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const margin = 10;
    const columnCount = 2;
    const columnSpacing = 6;
    const rowSpacing = 8;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const defaultCardWidth =
      (usableWidth - columnSpacing * (columnCount - 1)) / columnCount;

    let columnIndex = 0;
    let currentY = margin;
    let currentRowHeight = 0;

    for (const cardEl of cardElements) {
      const canvas = await window.html2canvas(cardEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imageData = canvas.toDataURL('image/png');
      const aspectRatio = canvas.height / canvas.width || 1;
      let renderWidth = defaultCardWidth;
      let renderHeight = renderWidth * aspectRatio;

      const maxHeight = pageHeight - margin * 2;
      if (renderHeight > maxHeight) {
        renderHeight = maxHeight;
        renderWidth = renderHeight / aspectRatio;
      }

      if (currentY + renderHeight > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
        columnIndex = 0;
        currentRowHeight = 0;
      }

      const positionX =
        margin + columnIndex * (defaultCardWidth + columnSpacing);
      doc.addImage(
        imageData,
        'PNG',
        positionX,
        currentY,
        renderWidth,
        renderHeight,
        undefined,
        'FAST',
      );

      currentRowHeight = Math.max(currentRowHeight, renderHeight);
      columnIndex += 1;

      if (columnIndex >= columnCount) {
        columnIndex = 0;
        currentY += currentRowHeight + rowSpacing;
        currentRowHeight = 0;
      }
    }
  } finally {
    tempWrapper.remove();
  }
}

function generateListPdf(doc, grupos) {
  const margem = 15;
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraUtil = larguraPagina - margem * 2;
  const lineHeight = 5;

  const colSkuWidth = 25;
  const colCategoriaWidth = 35;
  const colCustoWidth = 20;
  const colVendaWidth = 20;
  const colProdutoWidth =
    larguraUtil -
    (colSkuWidth + colCategoriaWidth + colCustoWidth + colVendaWidth);

  const columns = [
    { label: 'SKU', width: colSkuWidth, align: 'left' },
    { label: 'Produto', width: colProdutoWidth, align: 'left' },
    { label: 'Categoria', width: colCategoriaWidth, align: 'left' },
    { label: 'Custos', width: colCustoWidth, align: 'right' },
    { label: 'Preços', width: colVendaWidth, align: 'right' },
  ];

  const columnPositions = [];
  let position = margem;
  columns.forEach((col) => {
    columnPositions.push(position);
    position += col.width;
  });

  let y = margem;

  const initializePage = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Catálogo de Produtos - Lista', margem, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };

  const startNewPage = () => {
    doc.addPage();
    y = margem;
    initializePage();
  };

  const drawTableHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const headerY = y + lineHeight;
    columns.forEach((col, index) => {
      const baseX = columnPositions[index];
      if (col.align === 'right') {
        doc.text(col.label, baseX + col.width - 1, headerY, { align: 'right' });
      } else {
        doc.text(col.label, baseX, headerY);
      }
    });
    y += lineHeight + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };

  initializePage();

  for (const grupo of grupos) {
    const categoriaTitulo = grupo.categoria || 'Sem categoria';
    if (y + lineHeight * 2 > alturaPagina - margem) {
      startNewPage();
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(categoriaTitulo, margem, y);
    y += lineHeight + 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    if (y + lineHeight * 2 > alturaPagina - margem) {
      startNewPage();
    }
    drawTableHeader();

    for (const produto of grupo.produtos) {
      const variacoes = Array.isArray(produto.variacoesCor)
        ? produto.variacoesCor.filter((item) => item && item.cor)
        : [];
      let nomeTexto = produto.nome || 'Produto sem nome';
      if (variacoes.length) {
        nomeTexto = `${nomeTexto}\nCores: ${variacoes
          .map((item) => item.cor)
          .join(', ')}`;
      }
      const nomeLinhas = doc.splitTextToSize(nomeTexto, columns[1].width - 2);
      const categoriaLinhas = doc.splitTextToSize(
        produto.categoria || 'Sem categoria',
        columns[2].width - 2,
      );
      const custoLinhas = formatRangeLines(getProductCostRange(produto), {
        shortLabels: true,
      });
      const vendaLinhas = formatRangeLines(getProductPriceRange(produto), {
        shortLabels: true,
      });

      const linhasNecessarias = Math.max(
        nomeLinhas.length,
        categoriaLinhas.length,
        custoLinhas.length || 1,
        vendaLinhas.length || 1,
        1,
      );
      const alturaLinha = linhasNecessarias * lineHeight + 2;

      if (y + alturaLinha > alturaPagina - margem) {
        startNewPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(categoriaTitulo, margem, y);
        y += lineHeight + 1;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        drawTableHeader();
      }

      const baseY = y + lineHeight;

      doc.text(produto.sku || '--', columnPositions[0], baseY);
      nomeLinhas.forEach((linha, indice) => {
        doc.text(linha, columnPositions[1], baseY + lineHeight * indice);
      });
      categoriaLinhas.forEach((linha, indice) => {
        doc.text(linha, columnPositions[2], baseY + lineHeight * indice);
      });

      const custoTextoLinhas = custoLinhas.length ? custoLinhas : ['--'];
      const custoBaseX = columnPositions[3] + columns[3].width - 1;
      custoTextoLinhas.forEach((linha, indice) => {
        doc.text(linha, custoBaseX, baseY + lineHeight * indice, {
          align: 'right',
        });
      });

      const vendaTextoLinhas = vendaLinhas.length ? vendaLinhas : ['--'];
      const vendaBaseX = columnPositions[4] + columns[4].width - 1;
      vendaTextoLinhas.forEach((linha, indice) => {
        doc.text(linha, vendaBaseX, baseY + lineHeight * indice, {
          align: 'right',
        });
      });

      y += alturaLinha;
    }

    y += lineHeight;
  }
}

function createCatalogInfoItem(
  label,
  value,
  { labelClass = '', valueClass = '' } = {},
) {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col gap-1';
  const labelEl = document.createElement('span');
  labelEl.className =
    'text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 ' +
    labelClass;
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className =
    'text-sm font-semibold leading-snug text-gray-900 whitespace-pre-wrap break-words ' +
    valueClass;
  const resolvedValue =
    typeof value === 'string'
      ? value.trim() || '--'
      : value === null || value === undefined
        ? '--'
        : `${value}`;
  valueEl.textContent = resolvedValue;
  wrapper.append(labelEl, valueEl);
  return wrapper;
}

function buildCatalogCardElement(produto, { interactive = true } = {}) {
  if (!produto) return null;

  const card = document.createElement('article');
  card.className =
    'relative flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg';
  card.dataset.productId = produto.id || '';
  card.dataset.viewType = 'card';

  const selectionWrapper = document.createElement('label');
  selectionWrapper.className =
    'catalog-select-toggle absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-full bg-white/95 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-600 shadow-sm';
  selectionWrapper.title = 'Selecionar produto';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className =
    'catalog-select-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500';
  if (interactive) {
    checkbox.checked = selectedProducts.has(produto.id);
    checkbox.addEventListener('change', (event) => {
      handleProductSelection(produto.id, event.target.checked);
      setCardSelectedState(card, selectedProducts.has(produto.id));
    });
  } else {
    checkbox.checked = false;
  }
  const checkboxLabel = document.createElement('span');
  checkboxLabel.textContent = 'Selecionar';
  selectionWrapper.append(checkbox, checkboxLabel);
  card.appendChild(selectionWrapper);

  const body = document.createElement('div');
  body.className = 'flex flex-1 flex-col gap-4 p-4';

  const topSection = document.createElement('div');
  topSection.className = 'flex flex-col gap-3 sm:flex-row sm:items-start';

  const imageWrapper = document.createElement('div');
  imageWrapper.className =
    'relative flex h-28 w-full flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 sm:h-28 sm:w-28';
  const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
  const primeiraFoto = fotos.find((foto) => foto?.url);
  if (primeiraFoto) {
    const img = document.createElement('img');
    img.src = primeiraFoto.url;
    img.alt = produto.nome || primeiraFoto.nome || 'Produto';
    img.className = 'h-full w-full object-cover';
    img.crossOrigin = 'anonymous';
    imageWrapper.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className =
      'flex h-full w-full items-center justify-center text-gray-400';
    placeholder.innerHTML = '<i class="fa-solid fa-image text-3xl"></i>';
    imageWrapper.appendChild(placeholder);
  }
  topSection.appendChild(imageWrapper);

  const details = document.createElement('div');
  details.className = 'flex-1 min-w-0 space-y-2';

  const title = document.createElement('h3');
  title.className =
    'text-base font-semibold leading-snug text-gray-900 break-words';
  title.textContent = produto.nome || 'Produto sem nome';
  details.appendChild(title);

  const badges = document.createElement('div');
  badges.className =
    'flex flex-wrap items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-wide';
  const skuBadge = document.createElement('span');
  skuBadge.className =
    'inline-flex max-w-full items-center rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700 whitespace-normal break-words';
  skuBadge.textContent = `SKU ${produto.sku || '--'}`;
  badges.appendChild(skuBadge);

  const categoriaBadge = document.createElement('span');
  categoriaBadge.className =
    'inline-flex max-w-full items-center rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 whitespace-normal break-words';
  const categoriaTexto = produto.categoria
    ? produto.categoria.toString().trim() || 'Sem categoria'
    : 'Sem categoria';
  categoriaBadge.textContent = categoriaTexto;
  badges.appendChild(categoriaBadge);
  details.appendChild(badges);

  const variacoes = Array.isArray(produto.variacoesCor)
    ? produto.variacoesCor.filter((item) => item && item.cor)
    : [];
  if (variacoes.length) {
    const variacoesInfo = document.createElement('p');
    variacoesInfo.className = 'text-xs text-gray-500 break-words';
    variacoesInfo.textContent = `Cores: ${variacoes
      .map((item) => item.cor)
      .join(', ')}`;
    details.appendChild(variacoesInfo);
  }

  topSection.appendChild(details);
  body.appendChild(topSection);

  const infoGrid = document.createElement('div');
  infoGrid.className = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';

  const medidasBox = document.createElement('div');
  medidasBox.className =
    'rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm';
  const medidasTitulo = document.createElement('p');
  medidasTitulo.className =
    'text-[0.7rem] font-semibold uppercase tracking-wide text-gray-500';
  medidasTitulo.textContent = 'Medidas';
  medidasBox.appendChild(medidasTitulo);
  const medidasLista = document.createElement('div');
  medidasLista.className = 'mt-2 grid gap-2';
  medidasLista.appendChild(
    createCatalogInfoItem('Produto', produto.medidas || '--', {
      valueClass: 'text-gray-700',
    }),
  );
  medidasLista.appendChild(
    createCatalogInfoItem('Embalagem', produto.tamanhoEmbalagem || '--', {
      valueClass: 'text-gray-700',
    }),
  );
  medidasBox.appendChild(medidasLista);
  infoGrid.appendChild(medidasBox);

  const componentesBox = document.createElement('div');
  componentesBox.className =
    'rounded-lg border border-yellow-200 bg-yellow-50 p-3 shadow-sm';
  const componentesTitulo = document.createElement('p');
  componentesTitulo.className =
    'text-[0.7rem] font-semibold uppercase tracking-wide text-yellow-700';
  componentesTitulo.textContent = 'Componentes';
  componentesBox.appendChild(componentesTitulo);
  const componentesLista = document.createElement('div');
  componentesLista.className = 'mt-2 grid gap-2';
  const componentesDados =
    produto && typeof produto.componentes === 'object'
      ? produto.componentes
      : {};
  const parafusosQuantidade = normalizeComponentQuantity(
    getFirstAvailableValue(componentesDados, ['parafusos', 'qtdParafusos']),
  );
  const puxadorDisplay = getPuxadorDisplay(produto);
  const outrosDisplays = getAdditionalComponentDisplays(produto).filter(
    (valor) => valor && valor.trim(),
  );
  componentesLista.appendChild(
    createCatalogInfoItem(
      'Parafusos',
      formatComponentQuantityForDisplay(parafusosQuantidade),
      {
        valueClass: 'text-gray-800',
      },
    ),
  );
  componentesLista.appendChild(
    createCatalogInfoItem('Puxador', puxadorDisplay, {
      valueClass: 'text-gray-800',
    }),
  );
  if (!outrosDisplays.length) {
    componentesLista.appendChild(
      createCatalogInfoItem('Outros', '--', {
        valueClass: 'text-gray-800',
      }),
    );
  } else {
    outrosDisplays.slice(0, 2).forEach((display, index) => {
      componentesLista.appendChild(
        createCatalogInfoItem(`Outros ${index + 1}`, display, {
          valueClass: 'text-gray-800',
        }),
      );
    });
  }
  componentesBox.appendChild(componentesLista);
  infoGrid.appendChild(componentesBox);

  const valoresBox = document.createElement('div');
  valoresBox.className =
    'rounded-lg border border-emerald-200 bg-emerald-50 p-3 shadow-sm';
  const valoresTitulo = document.createElement('p');
  valoresTitulo.className =
    'text-[0.7rem] font-semibold uppercase tracking-wide text-emerald-700';
  valoresTitulo.textContent = 'Valores sugeridos';
  valoresBox.appendChild(valoresTitulo);
  const valoresLista = document.createElement('div');
  valoresLista.className = 'mt-2 grid gap-2';
  const custoRange = getProductCostRange(produto);
  const precoRange = getProductPriceRange(produto);
  valoresLista.appendChild(
    createCatalogInfoItem('Custos', formatRangeForDisplay(custoRange), {
      valueClass: 'text-base font-bold text-emerald-800 whitespace-pre-wrap',
    }),
  );
  valoresLista.appendChild(
    createCatalogInfoItem(
      'Preços sugeridos',
      formatRangeForDisplay(precoRange),
      {
        valueClass: 'text-base font-bold text-emerald-800 whitespace-pre-wrap',
      },
    ),
  );
  valoresBox.appendChild(valoresLista);
  infoGrid.appendChild(valoresBox);

  body.appendChild(infoGrid);

  const actions = document.createElement('div');
  actions.className =
    'mt-auto flex flex-wrap items-center justify-end gap-2 pt-1 text-xs';

  const detailsBtn = document.createElement('button');
  detailsBtn.type = 'button';
  detailsBtn.className =
    'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400';
  detailsBtn.innerHTML =
    '<i class="fa-solid fa-circle-info"></i><span>Detalhes</span>';
  if (interactive) {
    detailsBtn.addEventListener('click', () => openModal(produto));
  }
  actions.appendChild(detailsBtn);

  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400';
    editBtn.innerHTML =
      '<i class="fa-solid fa-pen-to-square"></i><span>Editar</span>';
    if (interactive) {
      editBtn.addEventListener('click', () => startEditingProduct(produto));
    }
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400';
    deleteBtn.innerHTML =
      '<i class="fa-solid fa-trash-can"></i><span>Excluir</span>';
    if (interactive) {
      deleteBtn.addEventListener('click', () =>
        handleDeleteProduct(produto, deleteBtn),
      );
    }
    actions.appendChild(deleteBtn);
  }

  body.appendChild(actions);
  card.appendChild(body);

  const cardDriveLink =
    produto.driveFolderLink || produto.driveLink || produto.linkDrive;
  const footer = document.createElement('div');
  footer.className = 'border-t border-gray-200 bg-gray-50 px-4 py-3';
  if (cardDriveLink) {
    const driveBtn = document.createElement('a');
    driveBtn.href = cardDriveLink;
    driveBtn.target = '_blank';
    driveBtn.rel = 'noopener noreferrer';
    driveBtn.className =
      'inline-flex w-full items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 transition hover:text-indigo-500';
    driveBtn.innerHTML =
      '<i class="fa-solid fa-folder-open"></i><span>Abrir pasta de fotos</span>';
    if (!interactive) {
      driveBtn.setAttribute('tabindex', '-1');
    }
    footer.appendChild(driveBtn);
  } else {
    const drivePlaceholder = document.createElement('div');
    drivePlaceholder.className =
      'inline-flex w-full items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500';
    drivePlaceholder.innerHTML =
      '<i class="fa-solid fa-folder-open"></i><span>Pasta de fotos não cadastrada</span>';
    footer.appendChild(drivePlaceholder);
  }
  card.appendChild(footer);

  return card;
}

function renderCardView(displayItems) {
  if (!cardsContainer) return;

  displayItems.forEach((produto) => {
    if (!produto) return;
    const card = buildCatalogCardElement(produto, { interactive: true });
    if (!card) return;
    setCardSelectedState(card, selectedProducts.has(produto.id));
    cardsContainer.appendChild(card);
  });
}

function renderListView(displayItems) {
  if (!listBody) return;
  listBody.innerHTML = '';
  displayItems.forEach((produto) => {
    if (!produto) return;
    const row = document.createElement('tr');
    row.className = 'transition-colors hover:bg-gray-50';
    row.dataset.productId = produto.id || '';
    row.dataset.viewType = 'list';

    const selectionCell = document.createElement('td');
    selectionCell.className = 'px-3 py-3 text-center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className =
      'catalog-select-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500';
    checkbox.checked = selectedProducts.has(produto.id);
    checkbox.addEventListener('change', (event) => {
      handleProductSelection(produto.id, event.target.checked);
      setCardSelectedState(row, selectedProducts.has(produto.id));
    });
    selectionCell.appendChild(checkbox);
    row.appendChild(selectionCell);

    const skuCell = document.createElement('td');
    skuCell.className = 'px-3 py-3 font-semibold text-gray-900';
    skuCell.textContent = produto.sku || '--';
    row.appendChild(skuCell);

    const nameCell = document.createElement('td');
    nameCell.className = 'px-3 py-3';
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'flex flex-col';
    const nameTitle = document.createElement('span');
    nameTitle.className = 'font-semibold text-gray-900';
    nameTitle.textContent = produto.nome || 'Produto sem nome';
    nameWrapper.appendChild(nameTitle);
    const variacoes = Array.isArray(produto.variacoesCor)
      ? produto.variacoesCor.filter((item) => item && item.cor)
      : [];
    if (variacoes.length) {
      const variacoesInfo = document.createElement('span');
      variacoesInfo.className = 'text-xs text-gray-500';
      variacoesInfo.textContent = `Cores: ${variacoes
        .map((item) => item.cor)
        .join(', ')}`;
      nameWrapper.appendChild(variacoesInfo);
    }
    nameCell.appendChild(nameWrapper);
    row.appendChild(nameCell);

    const categoriaCell = document.createElement('td');
    categoriaCell.className = 'px-3 py-3 text-gray-600';
    categoriaCell.textContent = produto.categoria || 'Sem categoria';
    row.appendChild(categoriaCell);

    const custoCell = document.createElement('td');
    custoCell.className =
      'px-3 py-3 text-right font-medium text-gray-900 whitespace-pre-line';
    const custoLines = formatRangeLines(getProductCostRange(produto), {
      shortLabels: true,
    });
    if (custoLines.length) {
      custoCell.innerHTML = custoLines.join('<br>');
    } else {
      custoCell.textContent = '--';
    }
    row.appendChild(custoCell);

    const vendaCell = document.createElement('td');
    vendaCell.className =
      'px-3 py-3 text-right font-medium text-gray-900 whitespace-pre-line';
    const vendaLines = formatRangeLines(getProductPriceRange(produto), {
      shortLabels: true,
    });
    if (vendaLines.length) {
      vendaCell.innerHTML = vendaLines.join('<br>');
    } else {
      vendaCell.textContent = '--';
    }
    row.appendChild(vendaCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'px-3 py-3';
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className =
      'flex flex-wrap items-center gap-2 text-sm font-semibold';

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className =
      'inline-flex items-center gap-1 text-red-600 hover:text-red-700';
    detailsBtn.innerHTML =
      '<span>Ver mais</span><i class="fa-solid fa-arrow-right"></i>';
    detailsBtn.addEventListener('click', () => openModal(produto));
    actionsWrapper.appendChild(detailsBtn);

    const listDriveLink =
      produto.driveFolderLink || produto.driveLink || produto.linkDrive;
    if (listDriveLink) {
      const driveBtn = document.createElement('a');
      driveBtn.href = listDriveLink;
      driveBtn.target = '_blank';
      driveBtn.rel = 'noopener noreferrer';
      driveBtn.className =
        'inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-green-700 hover:bg-green-100';
      driveBtn.innerHTML =
        '<i class="fa-solid fa-folder-open"></i><span>Drive</span>';
      actionsWrapper.appendChild(driveBtn);
    }

    if (canEdit) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className =
        'inline-flex items-center gap-1 text-blue-600 hover:text-blue-700';
      editBtn.innerHTML =
        '<i class="fa-solid fa-pen-to-square"></i><span>Editar</span>';
      editBtn.addEventListener('click', () => startEditingProduct(produto));
      actionsWrapper.appendChild(editBtn);
    }

    actionsCell.appendChild(actionsWrapper);
    row.appendChild(actionsCell);

    setCardSelectedState(row, selectedProducts.has(produto.id));
    listBody.appendChild(row);
  });
}

function renderProducts(produtos, fullCollection = produtos) {
  if (cardsContainer) {
    cardsContainer.innerHTML = '';
  }
  if (currentViewMode !== 'list' && listBody) {
    listBody.innerHTML = '';
  }

  const displayItems = Array.isArray(produtos) ? [...produtos] : [];
  const collection = Array.isArray(fullCollection) ? [...fullCollection] : [];

  productCache.clear();
  collection.forEach((produto) => {
    if (produto) {
      productCache.set(produto.id, produto);
    }
  });

  const validIds = new Set(collection.map((produto) => produto?.id));
  Array.from(selectedProducts).forEach((id) => {
    if (!validIds.has(id)) {
      selectedProducts.delete(id);
    }
  });
  updateKitControlsState();

  const hasProducts = collection.length > 0;
  const isSearching =
    typeof currentSearchTerm === 'string' &&
    currentSearchTerm.trim().length > 0;
  const hasItemsToDisplay = displayItems.length > 0;

  if (cardsContainer) {
    const shouldShowCards = currentViewMode === 'card' && hasItemsToDisplay;
    cardsContainer.classList.toggle('hidden', !shouldShowCards);
  }
  if (listContainer) {
    const shouldShowList = currentViewMode === 'list' && hasItemsToDisplay;
    listContainer.classList.toggle('hidden', !shouldShowList);
  }

  if (!hasItemsToDisplay) {
    if (emptyStateEl) {
      if (isSearching && hasProducts) {
        emptyStateEl.textContent = 'Nenhum produto encontrado para a busca.';
      } else {
        emptyStateEl.innerHTML = defaultEmptyStateMessage;
      }
      emptyStateEl.classList.remove('hidden');
    }
  } else {
    if (emptyStateEl) {
      emptyStateEl.innerHTML = defaultEmptyStateMessage;
      emptyStateEl.classList.add('hidden');
    }
    if (currentViewMode === 'list') {
      renderListView(displayItems);
    } else {
      renderCardView(displayItems);
    }
  }

  updateSummary(collection);
  updateExportButtons(hasProducts);
}

function updateViewToggleState() {
  if (viewCardBtn) {
    const isCard = currentViewMode === 'card';
    viewCardBtn.classList.toggle('bg-indigo-600', isCard);
    viewCardBtn.classList.toggle('text-white', isCard);
    viewCardBtn.classList.toggle('shadow-sm', isCard);
    viewCardBtn.classList.toggle('bg-white', !isCard);
    viewCardBtn.classList.toggle('text-gray-700', !isCard);
    viewCardBtn.setAttribute('aria-pressed', isCard ? 'true' : 'false');
  }
  if (viewListBtn) {
    const isList = currentViewMode === 'list';
    viewListBtn.classList.toggle('bg-indigo-600', isList);
    viewListBtn.classList.toggle('text-white', isList);
    viewListBtn.classList.toggle('shadow-sm', isList);
    viewListBtn.classList.toggle('bg-white', !isList);
    viewListBtn.classList.toggle('text-gray-700', !isList);
    viewListBtn.setAttribute('aria-pressed', isList ? 'true' : 'false');
  }
}

function setViewMode(mode) {
  if (mode !== 'card' && mode !== 'list') return;
  if (currentViewMode === mode) {
    updateViewToggleState();
    return;
  }
  currentViewMode = mode;
  updateViewToggleState();
  refreshCatalogView();
}

function subscribeToCatalog(uid) {
  if (catalogUnsub) {
    catalogUnsub();
    catalogUnsub = null;
  }
  if (!uid) {
    allProducts = [];
    refreshCatalogView();
    return;
  }
  allProducts = [];
  refreshCatalogView();
  const colRef = collection(db, 'usuarios', uid, 'catalogoProdutos');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  catalogUnsub = onSnapshot(
    q,
    (snapshot) => {
      const produtos = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        produtos.push({ id: docSnap.id, ...data });
      });
      allProducts = produtos;
      refreshCatalogView();
    },
    (error) => {
      console.error('Erro ao carregar catálogo:', error);
      showToast('Não foi possível carregar os produtos do catálogo.', 'error');
    },
  );
}

async function resolveResponsavel(user, profile) {
  if (typeof window !== 'undefined' && window.responsavelFinanceiro) {
    return window.responsavelFinanceiro;
  }
  let email = null;
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data() || {};
      email = (data.responsavelFinanceiroEmail || '').trim() || email;
    }
  } catch (err) {
    console.warn('Não foi possível obter dados do usuário:', err);
  }
  if (!email && profile && profile.responsavelFinanceiroEmail) {
    email = (profile.responsavelFinanceiroEmail || '').trim();
  }
  if (!email) {
    try {
      const uidDoc = await getDoc(doc(db, 'uid', user.uid));
      if (uidDoc.exists()) {
        email =
          (uidDoc.data().responsavelFinanceiroEmail || '').trim() || email;
      }
    } catch (err) {
      console.warn('Falha ao consultar documento UID:', err);
    }
  }
  if (!email) return null;

  try {
    const responsavelQuery = query(
      collection(db, 'usuarios'),
      where('email', '==', email),
    );
    const responsavelDocs = await getDocs(responsavelQuery);
    if (!responsavelDocs.empty) {
      const docSnap = responsavelDocs.docs[0];
      const data = docSnap.data() || {};
      return {
        uid: docSnap.id,
        email,
        nome: data.nome || email,
      };
    }
    return { uid: null, email, nome: email };
  } catch (err) {
    console.error('Erro ao localizar responsável financeiro:', err);
    return { uid: null, email, nome: email };
  }
}

function definirResponsavelCatalogo(perfilNormalizado) {
  if (perfilNormalizado === 'gestor' || perfilNormalizado === 'adm') {
    responsavelInfo = {
      uid: currentUser.uid,
      email: currentUser.email,
      nome:
        currentProfile?.nome ||
        currentUser.displayName ||
        currentUser.email ||
        'Responsável',
    };
    scopeUid = currentUser.uid;
    if (managerEl) managerEl.textContent = responsavelInfo.nome;
    return;
  }

  if (responsavelInfo?.uid) {
    scopeUid = responsavelInfo.uid;
    if (managerEl)
      managerEl.textContent = responsavelInfo.nome || responsavelInfo.email;
  } else {
    scopeUid = currentUser.uid;
    if (managerEl)
      managerEl.textContent =
        currentProfile?.nome || currentUser.displayName || currentUser.email;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!canEdit || !form || isSubmitting) return;
  if (!scopeUid) {
    showToast(
      'Não foi possível identificar o responsável pelo catálogo.',
      'error',
    );
    return;
  }

  const nome = nameInput?.value.trim();
  const sku = skuInput?.value.trim();
  const custoMin = getNumberFromInput(costMinInput);
  const custoMedio = getNumberFromInput(costAvgInput);
  const custoMax = getNumberFromInput(costMaxInput);
  const precoMin = getNumberFromInput(priceMinInput);
  const precoMedio = getNumberFromInput(priceAvgInput);
  const precoMax = getNumberFromInput(priceMaxInput);
  const categoria = categoryInput?.value.trim();
  const descricao = descriptionInput?.value.trim();
  const driveFolderLink = driveLinkInput?.value.trim();
  const medidas = measuresInput?.value.trim();
  const tamanhoEmbalagem = packageSizeInput?.value.trim();
  const componentesInfo = getComponentDataFromInputs();
  const arquivos = photosInput?.files ? Array.from(photosInput.files) : [];
  const fotosUrlsBruto = photoUrlsInput?.value.trim();
  const fotosUrls = fotosUrlsBruto
    ? fotosUrlsBruto
        .split(/\n+/)
        .map((linha) => linha.trim())
        .filter(Boolean)
    : [];

  if (!nome || !sku) {
    showToast('Preencha os campos obrigatórios (nome e SKU).', 'warning');
    return;
  }

  const responsavel =
    scopeUid === currentUser.uid
      ? {
          uid: currentUser.uid,
          email: currentUser.email,
          nome:
            currentProfile?.nome ||
            currentUser.displayName ||
            currentUser.email,
        }
      : responsavelInfo;

  const colRef = collection(db, 'usuarios', scopeUid, 'catalogoProdutos');
  const isEditing = Boolean(editingProductId);
  const docRef = isEditing ? doc(colRef, editingProductId) : doc(colRef);

  const variacoesCor = getColorVariations();

  const basePayload = {
    nome,
    sku,
    custoMinimo: custoMin ?? null,
    custoMedio: custoMedio ?? null,
    custoMaximo: custoMax ?? null,
    precoSugeridoMinimo: precoMin ?? null,
    precoSugeridoMedio: precoMedio ?? null,
    precoSugeridoMaximo: precoMax ?? null,
    custo: coalesceNumeric(custoMedio, custoMin, custoMax),
    precoSugerido: coalesceNumeric(precoMedio, precoMin, precoMax),
    categoria: categoria || null,
    descricao: descricao || null,
    driveFolderLink: driveFolderLink || null,
    medidas: medidas || null,
    tamanhoEmbalagem: tamanhoEmbalagem || null,
    componentes: componentesInfo.componentes ?? null,
    possuiComponentes: componentesInfo.possuiComponentes ?? null,
    variacoesCor,
    updatedAt: serverTimestamp(),
  };

  const payload = isEditing
    ? basePayload
    : {
        ...basePayload,
        fotos: [],
        createdAt: serverTimestamp(),
        criadoPorUid: currentUser.uid,
        criadoPorEmail: currentUser.email,
        criadoPorNome:
          currentProfile?.nome || currentUser.displayName || currentUser.email,
        responsavelUid: responsavel?.uid || scopeUid,
        responsavelEmail: responsavel?.email || null,
        responsavelNome: responsavel?.nome || null,
      };

  const fotosAtuais = isEditing
    ? Array.isArray(editingProductData?.fotos)
      ? [...editingProductData.fotos]
      : []
    : [];

  try {
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-60');
    }

    const errosUpload = [];
    for (const arquivo of arquivos) {
      if (!(arquivo instanceof File)) continue;
      try {
        const path = `catalogo/${scopeUid}/${docRef.id}/${Date.now()}-${arquivo.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, arquivo);
        const url = await getDownloadURL(storageRef);
        fotosAtuais.push({ nome: arquivo.name, url, storagePath: path });
      } catch (err) {
        console.error('Não foi possível enviar uma foto para o Storage:', err);
        errosUpload.push(arquivo.name);
      }
    }

    fotosUrls.forEach((url, index) => {
      const nome = getFileNameFromUrl(url) || `Foto ${index + 1}`;
      fotosAtuais.push({ nome, url });
    });

    payload.fotos = fotosAtuais;

    if (isEditing) {
      await updateDoc(docRef, payload);
      showToast('Produto atualizado com sucesso!');
    } else {
      await setDoc(docRef, payload);
      showToast('Produto cadastrado no catálogo com sucesso!');
    }
    if (errosUpload.length) {
      showToast(
        'Algumas fotos não puderam ser enviadas. Considere usar URLs externas.',
        'warning',
      );
    }
    clearForm();
    toggleForm(false);
  } catch (err) {
    console.error('Erro ao salvar produto no catálogo:', err);
    showToast('Erro ao salvar produto. Tente novamente.', 'error');
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-60');
    }
  }
}

function startEditingProduct(produto) {
  if (!canEdit || !produto) return;
  editingProductId = produto.id;
  editingProductData = produto;
  if (nameInput) nameInput.value = produto.nome || '';
  if (skuInput) skuInput.value = produto.sku || '';
  if (costMinInput) {
    const valor = getNumericValueFromKeys(produto, [
      'custoMinimo',
      'custo_minimo',
      'custoMin',
    ]);
    costMinInput.value = valor ?? '';
  }
  if (costAvgInput) {
    const valor = getNumericValueFromKeys(produto, [
      'custoMedio',
      'custo_medio',
      'custoMed',
      'custo',
    ]);
    costAvgInput.value = valor ?? '';
  }
  if (costMaxInput) {
    const valor = getNumericValueFromKeys(produto, [
      'custoMaximo',
      'custo_maximo',
      'custoMax',
    ]);
    costMaxInput.value = valor ?? '';
  }
  if (priceMinInput) {
    const valor = getNumericValueFromKeys(produto, [
      'precoSugeridoMinimo',
      'preco_sugerido_minimo',
      'precoMinimo',
      'precoMin',
    ]);
    priceMinInput.value = valor ?? '';
  }
  if (priceAvgInput) {
    const valor = getNumericValueFromKeys(produto, [
      'precoSugeridoMedio',
      'precoSugerido',
      'preco',
      'valorVenda',
      'precoUnitario',
    ]);
    priceAvgInput.value = valor ?? '';
  }
  if (priceMaxInput) {
    const valor = getNumericValueFromKeys(produto, [
      'precoSugeridoMaximo',
      'preco_sugerido_maximo',
      'precoMaximo',
      'precoMax',
    ]);
    priceMaxInput.value = valor ?? '';
  }
  if (categoryInput) categoryInput.value = produto.categoria || '';
  if (descriptionInput) descriptionInput.value = produto.descricao || '';
  if (driveLinkInput)
    driveLinkInput.value =
      produto.driveFolderLink || produto.driveLink || produto.linkDrive || '';
  if (measuresInput) measuresInput.value = produto.medidas || '';
  if (packageSizeInput) packageSizeInput.value = produto.tamanhoEmbalagem || '';
  fillComponentInputsFromProduct(produto);
  if (photosInput) photosInput.value = '';
  if (photoUrlsInput) photoUrlsInput.value = '';
  setColorVariations(
    Array.isArray(produto.variacoesCor) ? produto.variacoesCor : [],
  );
  updateSubmitButtonLabel();
  updateEditingNotice();
  toggleForm(true);
  setTimeout(() => {
    formWrapper?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function setupEventListeners() {
  addItemBtn?.addEventListener('click', () => toggleForm(true));
  cancelFormBtn?.addEventListener('click', () => {
    clearForm();
    toggleForm(false);
  });
  form?.addEventListener('submit', handleSubmit);
  modalCloseBtn?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) {
      closeModal();
    }
  });
  exportExcelBtn?.addEventListener('click', exportCatalogToExcel);
  exportPdfBtn?.addEventListener('click', exportCatalogToPdf);
  addColorVariationBtn?.addEventListener('click', () => {
    colorVariationsContainer?.appendChild(createColorVariationRow());
  });
  editingCancelBtn?.addEventListener('click', () => {
    clearForm();
    toggleForm(false);
  });
  kitCalculateBtn?.addEventListener('click', handleCalculateKit);
  deleteSelectedBtn?.addEventListener('click', handleDeleteSelectedProducts);
  searchInput?.addEventListener('input', (event) => {
    const target = event.target;
    if (target && typeof target.value === 'string') {
      currentSearchTerm = target.value;
    } else {
      currentSearchTerm = searchInput.value || '';
    }
    refreshCatalogView();
  });
  copyTitleBtn?.addEventListener('click', () => {
    copyProductField(currentModalProduct?.nome, {
      successMessage: 'Título copiado para a área de transferência!',
      emptyMessage: 'Título não disponível para copiar.',
    });
  });
  copyDescriptionBtn?.addEventListener('click', () => {
    copyProductField(currentModalProduct?.descricao, {
      successMessage: 'Descrição copiada para a área de transferência!',
      emptyMessage: 'Descrição não disponível para copiar.',
    });
  });
  downloadImagesBtn?.addEventListener('click', downloadProductImages);
  viewCardBtn?.addEventListener('click', () => setViewMode('card'));
  viewListBtn?.addEventListener('click', () => setViewMode('list'));
}

updateViewToggleState();
setupEventListeners();
updateKitControlsState();
updateExportButtons(false);
updateSubmitButtonLabel();
updateEditingNotice();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?login=1';
    return;
  }
  currentUser = user;
  currentProfile =
    (typeof window !== 'undefined' && window.userProfile) ||
    (await loadUserProfile(user.uid));
  const perfilNormalizado = normalizePerfil(currentProfile?.perfil);
  const isFinanceiroResponsavel =
    typeof window !== 'undefined' && Boolean(window.isFinanceiroResponsavel);
  canEdit =
    perfilNormalizado === 'gestor' ||
    perfilNormalizado === 'adm' ||
    isFinanceiroResponsavel;

  if (!canEdit && addItemBtn) {
    addItemBtn.classList.add('hidden');
  } else if (canEdit && addItemBtn) {
    addItemBtn.classList.remove('hidden');
  }
  if (!canEdit && deleteSelectedBtn) {
    deleteSelectedBtn.classList.add('hidden');
  } else if (canEdit && deleteSelectedBtn) {
    deleteSelectedBtn.classList.remove('hidden');
  }

  responsavelInfo = await resolveResponsavel(user, currentProfile);
  definirResponsavelCatalogo(perfilNormalizado);
  subscribeToCatalog(scopeUid);
});

window.catalogo = {
  abrirDetalhesPorId(id) {
    if (!id) return;
    const produto = productCache.get(id);
    if (produto) openModal(produto);
  },
};
