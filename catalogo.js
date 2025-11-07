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
const costInput = document.getElementById('catalogProductCost');
const priceInput = document.getElementById('catalogProductPrice');
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
  const valores = [
    produto?.custo,
    produto?.custoUnitario,
    produto?.valorCusto,
    produto?.custoTotal,
  ];
  for (const valor of valores) {
    const parsed = parseNumericValue(valor);
    if (parsed !== null) return parsed;
  }
  return 0;
}

function getProductPrice(produto) {
  const valores = [
    produto?.precoSugerido,
    produto?.preco,
    produto?.valorVenda,
    produto?.precoUnitario,
  ];
  for (const valor of valores) {
    const parsed = parseNumericValue(valor);
    if (parsed !== null) return parsed;
  }
  return 0;
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
  let totalCost = 0;
  let totalPrice = 0;
  selectedProducts.forEach((productId) => {
    const produto = productCache.get(productId);
    if (!produto) return;
    totalCost += getProductCost(produto);
    totalPrice += getProductPrice(produto);
  });
  if (kitResultEl) {
    const count = selectedProducts.size;
    const partes = [
      `<p class="font-semibold">Kit com ${count} produto${
        count > 1 ? 's' : ''
      } selecionado${count > 1 ? 's' : ''}.</p>`,
      `<p class="mt-1">Custo total: <span class="font-semibold">${formatCurrency(
        totalCost,
      )}</span></p>`,
      `<p class="mt-1">Valor de venda total: <span class="font-semibold">${formatCurrency(
        totalPrice,
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
  modalCusto.textContent = formatCurrency(produto.custo);
  modalPreco.textContent = formatCurrency(produto.precoSugerido);
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
    'Custo',
    'Preço sugerido',
    'Descrição',
    'Medidas',
    'Tamanho da embalagem',
    'Componentes',
    'Variações de cor',
    'Fotos (URLs)',
  ];
  const linhas = produtos.map((produto) => {
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
      formatCurrencyForExport(produto.custo),
      formatCurrencyForExport(produto.precoSugerido),
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

async function carregarImagemComoDataUrl(url) {
  if (!url) return null;
  try {
    const resposta = await fetch(url, { mode: 'cors' });
    if (!resposta.ok) {
      throw new Error(
        `Resposta inesperada ao carregar imagem: ${resposta.status}`,
      );
    }
    const blob = await resposta.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      reader.readAsDataURL(blob);
    });
  } catch (erro) {
    console.warn('Não foi possível carregar imagem para o PDF:', url, erro);
    return null;
  }
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
  const grupos = getProductsGroupedByCategory();
  if (!grupos.length) {
    showToast('Não há produtos para exportar.', 'warning');
    return;
  }
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    showToast('Biblioteca de PDF não foi carregada.', 'error');
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
      await generateListPdf(doc, grupos);
    } else {
      await generateCardPdf(doc, grupos);
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

async function generateCardPdf(doc, grupos) {
  const margem = 15;
  const espacamentoEntreCartoes = 8;
  const colunas = 2;
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraCartao =
    (larguraPagina - margem * 2 - espacamentoEntreCartoes * (colunas - 1)) /
    colunas;
  const alturaCartao = 85;
  const paddingCartao = 5;
  const alturaImagem = 32;
  const larguraImagem = larguraCartao - paddingCartao * 2;

  let posicaoYAtual = margem;

  const adicionarCabecalhoCategoria = (categoria) => {
    const alturaCabecalho = 8;
    if (posicaoYAtual + alturaCabecalho > alturaPagina - margem) {
      doc.addPage();
      posicaoYAtual = margem;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(categoria, margem, posicaoYAtual);
    posicaoYAtual += alturaCabecalho + 2;
  };

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Catálogo de Produtos', margem, posicaoYAtual);
  posicaoYAtual += 10;
  doc.setFont('helvetica', 'normal');

  for (const grupo of grupos) {
    const categoriaTitulo = grupo.categoria || 'Sem categoria';
    adicionarCabecalhoCategoria(categoriaTitulo);

    const produtosPreparados = await Promise.all(
      grupo.produtos.map(async (produto) => {
        const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
        const primeiraFoto = fotos.find((foto) => foto?.url)?.url;
        const imagemDataUrl = await carregarImagemComoDataUrl(primeiraFoto);
        return { produto, imagemDataUrl };
      }),
    );

    let colunaAtual = 0;
    let yLinhaAtual = posicaoYAtual;

    for (const { produto, imagemDataUrl } of produtosPreparados) {
      if (colunaAtual === 0) {
        yLinhaAtual = posicaoYAtual;
        if (yLinhaAtual + alturaCartao > alturaPagina - margem) {
          doc.addPage();
          posicaoYAtual = margem;
          adicionarCabecalhoCategoria(categoriaTitulo);
          yLinhaAtual = posicaoYAtual;
        }
      } else if (yLinhaAtual + alturaCartao > alturaPagina - margem) {
        doc.addPage();
        posicaoYAtual = margem;
        adicionarCabecalhoCategoria(categoriaTitulo);
        yLinhaAtual = posicaoYAtual;
        colunaAtual = 0;
      }

      const posicaoX =
        margem + colunaAtual * (larguraCartao + espacamentoEntreCartoes);

      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.roundedRect(posicaoX, yLinhaAtual, larguraCartao, alturaCartao, 3, 3);

      if (imagemDataUrl) {
        try {
          doc.addImage(
            imagemDataUrl,
            undefined,
            posicaoX + paddingCartao,
            yLinhaAtual + paddingCartao,
            larguraImagem,
            alturaImagem,
          );
        } catch (erro) {
          console.warn('Não foi possível adicionar imagem ao PDF:', erro);
        }
      }

      let textoY = yLinhaAtual + paddingCartao + alturaImagem + 5;
      const textoX = posicaoX + paddingCartao;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(produto.nome || 'Produto sem nome', textoX, textoY, {
        maxWidth: larguraCartao - paddingCartao * 2,
      });
      textoY += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`SKU: ${produto.sku || '--'}`, textoX, textoY);
      textoY += 5;

      doc.text(
        `Categoria: ${produto.categoria || 'Sem categoria'}`,
        textoX,
        textoY,
        {
          maxWidth: larguraCartao - paddingCartao * 2,
        },
      );
      textoY += 5;

      doc.text(
        `Custo: ${formatCurrencyForExport(getProductCost(produto))}`,
        textoX,
        textoY,
      );
      textoY += 5;

      doc.text(
        `Venda: ${formatCurrencyForExport(getProductPrice(produto))}`,
        textoX,
        textoY,
      );
      textoY += 5;

      const packageText = produto.tamanhoEmbalagem
        ? `Embalagem: ${produto.tamanhoEmbalagem}`
        : '';
      if (packageText) {
        const packageLines = doc.splitTextToSize(
          packageText,
          larguraCartao - paddingCartao * 2,
        );
        packageLines.forEach((line) => {
          doc.text(line, textoX, textoY);
          textoY += 4;
        });
        textoY += 1;
      }

      const componentsSummary = getComponentSummaryText(produto);
      if (componentsSummary) {
        const componentsLines = doc.splitTextToSize(
          `Componentes: ${componentsSummary}`,
          larguraCartao - paddingCartao * 2,
        );
        componentsLines.forEach((line) => {
          doc.text(line, textoX, textoY);
          textoY += 4;
        });
      }

      colunaAtual += 1;
      if (colunaAtual >= colunas) {
        colunaAtual = 0;
        posicaoYAtual = yLinhaAtual + alturaCartao + espacamentoEntreCartoes;
      }
    }

    if (colunaAtual > 0) {
      posicaoYAtual = yLinhaAtual + alturaCartao + espacamentoEntreCartoes;
    }

    posicaoYAtual += 4;
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
    { label: 'Custo', width: colCustoWidth, align: 'right' },
    { label: 'Venda', width: colVendaWidth, align: 'right' },
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

      const linhasNecessarias = Math.max(
        nomeLinhas.length,
        categoriaLinhas.length,
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

      const custoTexto = formatCurrencyForExport(getProductCost(produto));
      const vendaTexto = formatCurrencyForExport(getProductPrice(produto));

      doc.text(custoTexto, columnPositions[3] + columns[3].width - 1, baseY, {
        align: 'right',
      });
      doc.text(vendaTexto, columnPositions[4] + columns[4].width - 1, baseY, {
        align: 'right',
      });

      y += alturaLinha;
    }

    y += lineHeight;
  }
}

function renderCardView(displayItems) {
  if (!cardsContainer) return;

  const createInfoCell = (
    label,
    value,
    { containerClass = '', labelClass = '', valueClass = '' } = {},
  ) => {
    const wrapper = document.createElement('div');
    wrapper.className =
      'flex flex-col gap-1 rounded-lg bg-white px-3 py-2 shadow-inner ' +
      containerClass;
    const labelEl = document.createElement('span');
    labelEl.className =
      'text-xs font-semibold uppercase tracking-wide text-gray-600 ' +
      labelClass;
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className =
      'text-sm font-semibold text-gray-900 whitespace-pre-wrap ' + valueClass;
    const resolvedValue =
      typeof value === 'string'
        ? value.trim() || '--'
        : value === null || value === undefined
          ? '--'
          : `${value}`;
    valueEl.textContent = resolvedValue;
    wrapper.append(labelEl, valueEl);
    return wrapper;
  };

  displayItems.forEach((produto) => {
    if (!produto) return;
    const card = document.createElement('article');
    card.className =
      'relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-md transition hover:shadow-lg';
    card.dataset.productId = produto.id || '';
    card.dataset.viewType = 'card';

    const selectionWrapper = document.createElement('label');
    selectionWrapper.className =
      'catalog-select-toggle absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow';
    selectionWrapper.title = 'Selecionar produto';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className =
      'catalog-select-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500';
    checkbox.checked = selectedProducts.has(produto.id);
    checkbox.addEventListener('change', (event) => {
      handleProductSelection(produto.id, event.target.checked);
      setCardSelectedState(card, selectedProducts.has(produto.id));
    });
    const checkboxLabel = document.createElement('span');
    checkboxLabel.textContent = 'Selecionar';
    selectionWrapper.append(checkbox, checkboxLabel);
    card.appendChild(selectionWrapper);

    const header = document.createElement('div');
    header.className = 'bg-yellow-300 px-4 py-3 text-center';
    const headerTitle = document.createElement('h3');
    headerTitle.className =
      'text-base font-bold uppercase tracking-wide text-gray-900';
    headerTitle.textContent = produto.nome || 'Produto sem nome';
    header.appendChild(headerTitle);
    card.appendChild(header);

    const imageSection = document.createElement('div');
    imageSection.className =
      'relative flex flex-col items-center border-b border-gray-200 bg-white px-6 pt-5 pb-10';
    const imageFrame = document.createElement('div');
    imageFrame.className =
      'relative flex h-48 w-full max-w-sm items-center justify-center overflow-hidden rounded-xl border-4 border-yellow-200 bg-gray-100 shadow-inner';
    const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
    const primeiraFoto = fotos.find((foto) => foto?.url);
    if (primeiraFoto) {
      const img = document.createElement('img');
      img.src = primeiraFoto.url;
      img.alt = produto.nome || primeiraFoto.nome || 'Produto';
      img.className = 'h-full w-full object-cover';
      imageFrame.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className =
        'flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-200 to-gray-100 text-gray-400';
      placeholder.innerHTML = '<i class="fa-solid fa-image text-4xl"></i>';
      imageFrame.appendChild(placeholder);
    }

    const imageOverlay = document.createElement('div');
    imageOverlay.className =
      'pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-900';
    const skuBadge = document.createElement('span');
    skuBadge.className = 'rounded-md bg-white/90 px-3 py-1 shadow-md';
    skuBadge.textContent = `SKU = ${produto.sku || '--'}`;
    const categoriaBadge = document.createElement('span');
    categoriaBadge.className = 'rounded-md bg-white/90 px-3 py-1 shadow-md';
    const categoriaTexto = produto.categoria
      ? produto.categoria.toString().trim().toUpperCase()
      : 'SEM CATEGORIA';
    categoriaBadge.textContent = categoriaTexto || 'SEM CATEGORIA';
    imageOverlay.append(skuBadge, categoriaBadge);
    imageFrame.appendChild(imageOverlay);

    imageSection.appendChild(imageFrame);
    card.appendChild(imageSection);

    const content = document.createElement('div');
    content.className = 'flex flex-1 flex-col gap-4 px-5 py-4';

    const measuresSection = document.createElement('div');
    measuresSection.className =
      'rounded-2xl border-2 border-gray-200 bg-gray-100 px-4 py-4';
    const measuresHeading = document.createElement('p');
    measuresHeading.className =
      'text-center text-xs font-semibold uppercase tracking-wide text-gray-700';
    measuresHeading.textContent = 'Medidas do produto / Medidas da embalagem';
    measuresSection.appendChild(measuresHeading);

    const measuresGrid = document.createElement('div');
    measuresGrid.className = 'mt-3 grid gap-3 sm:grid-cols-2';
    measuresGrid.appendChild(
      createInfoCell('Produto', produto.medidas || '--', {
        containerClass: 'border border-gray-300',
      }),
    );
    measuresGrid.appendChild(
      createInfoCell('Embalagem', produto.tamanhoEmbalagem || '--', {
        containerClass: 'border border-gray-300',
      }),
    );
    measuresSection.appendChild(measuresGrid);
    content.appendChild(measuresSection);

    const infoRow = document.createElement('div');
    infoRow.className = 'flex flex-col gap-4 lg:flex-row';

    const componentsSection = document.createElement('div');
    componentsSection.className =
      'flex-1 rounded-2xl border-2 border-gray-200 bg-gray-100 px-4 py-4';
    const componentsTitle = document.createElement('p');
    componentsTitle.className =
      'text-sm font-semibold uppercase tracking-wide text-gray-700';
    componentsTitle.textContent = 'Componentes';
    componentsSection.appendChild(componentsTitle);

    const componentsGrid = document.createElement('div');
    componentsGrid.className = 'mt-3 grid grid-cols-2 gap-3';
    const componentes =
      produto && typeof produto.componentes === 'object'
        ? produto.componentes
        : {};
    const parafusosQuantidade = normalizeComponentQuantity(
      getFirstAvailableValue(componentes, ['parafusos', 'qtdParafusos']),
    );
    const puxadorDisplay = getPuxadorDisplay(produto);
    const outrosDisplays = getAdditionalComponentDisplays(produto);

    componentsGrid.appendChild(
      createInfoCell(
        'Parafusos',
        formatComponentQuantityForDisplay(parafusosQuantidade),
        {
          containerClass: 'border border-yellow-300 bg-yellow-50',
          valueClass: 'text-sm font-semibold text-gray-800',
        },
      ),
    );
    componentsGrid.appendChild(
      createInfoCell('Puxador', puxadorDisplay, {
        containerClass: 'border border-yellow-300 bg-yellow-50',
        valueClass: 'text-sm font-semibold text-gray-800',
      }),
    );
    componentsGrid.appendChild(
      createInfoCell('Outros', outrosDisplays[0] || '--', {
        containerClass: 'border border-yellow-300 bg-yellow-50',
        valueClass: 'text-sm font-semibold text-gray-800',
      }),
    );
    componentsGrid.appendChild(
      createInfoCell('Outros', outrosDisplays[1] || '--', {
        containerClass: 'border border-yellow-300 bg-yellow-50',
        valueClass: 'text-sm font-semibold text-gray-800',
      }),
    );
    componentsSection.appendChild(componentsGrid);
    infoRow.appendChild(componentsSection);

    const financeSection = document.createElement('div');
    financeSection.className =
      'flex w-full flex-col rounded-2xl border-2 border-green-300 bg-green-100 px-4 py-4 text-gray-900 lg:w-64';
    const financeTitle = document.createElement('p');
    financeTitle.className =
      'text-sm font-semibold uppercase tracking-wide text-green-900';
    financeTitle.textContent = 'Custo / Preço sugerido';
    financeSection.appendChild(financeTitle);

    const financeValues = document.createElement('div');
    financeValues.className = 'mt-3 flex flex-col gap-3';
    financeValues.appendChild(
      createInfoCell('Custo', formatCurrency(getProductCost(produto)), {
        containerClass: 'border border-green-300 bg-white',
        labelClass: 'text-green-700',
        valueClass: 'text-base font-bold text-green-900',
      }),
    );
    financeValues.appendChild(
      createInfoCell(
        'Preço sugerido',
        formatCurrency(getProductPrice(produto)),
        {
          containerClass: 'border border-green-300 bg-white',
          labelClass: 'text-green-700',
          valueClass: 'text-base font-bold text-green-900',
        },
      ),
    );
    financeSection.appendChild(financeValues);
    infoRow.appendChild(financeSection);

    content.appendChild(infoRow);

    const actions = document.createElement('div');
    actions.className =
      'mt-auto flex flex-wrap items-center justify-end gap-2 pt-2';

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className =
      'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400';
    detailsBtn.innerHTML =
      '<i class="fa-solid fa-circle-info"></i><span>Detalhes</span>';
    detailsBtn.addEventListener('click', () => openModal(produto));
    actions.appendChild(detailsBtn);

    if (canEdit) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className =
        'inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400';
      editBtn.innerHTML =
        '<i class="fa-solid fa-pen-to-square"></i><span>Editar</span>';
      editBtn.addEventListener('click', () => startEditingProduct(produto));
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className =
        'inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400';
      deleteBtn.innerHTML =
        '<i class="fa-solid fa-trash-can"></i><span>Excluir</span>';
      deleteBtn.addEventListener('click', () =>
        handleDeleteProduct(produto, deleteBtn),
      );
      actions.appendChild(deleteBtn);
    }

    content.appendChild(actions);
    card.appendChild(content);

    const cardDriveLink =
      produto.driveFolderLink || produto.driveLink || produto.linkDrive;
    const footer = document.createElement('div');
    footer.className = 'bg-yellow-300 px-4 py-3';
    if (cardDriveLink) {
      const driveBtn = document.createElement('a');
      driveBtn.href = cardDriveLink;
      driveBtn.target = '_blank';
      driveBtn.rel = 'noopener noreferrer';
      driveBtn.className =
        'inline-flex w-full items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-900 transition hover:text-gray-800';
      driveBtn.innerHTML =
        '<i class="fa-solid fa-folder-open"></i><span>Abrir pasta de fotos (Abrir pasta Driver)</span>';
      footer.appendChild(driveBtn);
    } else {
      const drivePlaceholder = document.createElement('div');
      drivePlaceholder.className =
        'inline-flex w-full items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600';
      drivePlaceholder.innerHTML =
        '<i class="fa-solid fa-folder-open"></i><span>Pasta de fotos não cadastrada</span>';
      footer.appendChild(drivePlaceholder);
    }
    card.appendChild(footer);

    setCardSelectedState(card, selectedProducts.has(produto.id));
    cardsContainer?.appendChild(card);
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
    custoCell.className = 'px-3 py-3 text-right font-medium text-gray-900';
    custoCell.textContent = formatCurrency(getProductCost(produto));
    row.appendChild(custoCell);

    const vendaCell = document.createElement('td');
    vendaCell.className = 'px-3 py-3 text-right font-medium text-gray-900';
    vendaCell.textContent = formatCurrency(getProductPrice(produto));
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
  const custoValor = costInput?.value.trim();
  const precoValor = priceInput?.value.trim();
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

  const custo = custoValor ? Number(custoValor.replace(',', '.')) : null;
  const preco = precoValor ? Number(precoValor.replace(',', '.')) : null;

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
    custo: typeof custo === 'number' && !Number.isNaN(custo) ? custo : null,
    precoSugerido:
      typeof preco === 'number' && !Number.isNaN(preco) ? preco : null,
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
  if (costInput)
    costInput.value =
      typeof produto.custo === 'number' && !Number.isNaN(produto.custo)
        ? produto.custo
        : produto.custo || '';
  if (priceInput)
    priceInput.value =
      typeof produto.precoSugerido === 'number' &&
      !Number.isNaN(produto.precoSugerido)
        ? produto.precoSugerido
        : produto.precoSugerido || '';
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
