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
  onSnapshot,
  orderBy,
  query,
  where,
  setDoc,
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
const emptyStateEl = document.getElementById('catalogEmptyState');
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
const modalFotos = document.getElementById('catalogDetailsFotos');
const modalVariacoes = document.getElementById('catalogDetailsVariacoes');

const nameInput = document.getElementById('catalogProductName');
const skuInput = document.getElementById('catalogProductSku');
const costInput = document.getElementById('catalogProductCost');
const priceInput = document.getElementById('catalogProductPrice');
const categoryInput = document.getElementById('catalogProductCategory');
const descriptionInput = document.getElementById('catalogProductDescription');
const measuresInput = document.getElementById('catalogProductMeasures');
const photosInput = document.getElementById('catalogProductPhotos');
const photoUrlsInput = document.getElementById('catalogProductPhotoUrls');
const submitBtn = form?.querySelector('button[type="submit"]');
const colorVariationsContainer = document.getElementById(
  'catalogColorVariationsContainer',
);
const colorVariationsEmpty = document.getElementById(
  'catalogColorVariationsEmpty',
);
const addColorVariationBtn = document.getElementById(
  'catalogAddColorVariationBtn',
);
const editingBanner = document.getElementById('catalogEditingBanner');
const editingBannerText = document.getElementById('catalogEditingBannerText');
const editingCancelBtn = document.getElementById('catalogEditingCancelBtn');

const submitBtnDefaultContent = submitBtn?.innerHTML || '';
const submitBtnEditingContent =
  '<i class="fa-solid fa-arrows-rotate"></i><span>Atualizar produto</span>';

const editingBannerDefaultText = 'Editando o produto selecionado.';

let currentUser = null;
let currentProfile = null;
let scopeUid = null;
let responsavelInfo = null;
let canEdit = false;
let catalogUnsub = null;
let isSubmitting = false;
let editingProductId = null;
let editingProductData = null;
const productCache = new Map();

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

function clearForm() {
  form?.reset();
  if (photosInput) photosInput.value = '';
  if (photoUrlsInput) photoUrlsInput.value = '';
  setColorVariationsInForm([]);
  cancelEditing();
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

function updateColorVariationsEmptyState() {
  if (!colorVariationsContainer || !colorVariationsEmpty) return;
  const hasRows = Boolean(
    colorVariationsContainer.querySelector('[data-variation-row="true"]'),
  );
  if (hasRows) {
    colorVariationsEmpty.classList.add('hidden');
  } else {
    colorVariationsEmpty.classList.remove('hidden');
  }
}

function createColorVariationRow(data = {}) {
  if (!colorVariationsContainer) return null;
  const row = document.createElement('div');
  row.className =
    'flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-end';
  row.dataset.variationRow = 'true';

  const colorWrapper = document.createElement('div');
  colorWrapper.className = 'flex-1';
  const colorLabel = document.createElement('span');
  colorLabel.className = 'text-xs font-medium text-gray-500';
  colorLabel.textContent = 'Cor';
  const colorInput = document.createElement('input');
  colorInput.type = 'text';
  colorInput.className =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  colorInput.placeholder = 'Ex.: Azul Marinho';
  colorInput.value = data.cor || '';
  colorInput.dataset.role = 'color-name';
  colorWrapper.appendChild(colorLabel);
  colorWrapper.appendChild(colorInput);

  const urlWrapper = document.createElement('div');
  urlWrapper.className = 'flex-1';
  const urlLabel = document.createElement('span');
  urlLabel.className = 'text-xs font-medium text-gray-500';
  urlLabel.textContent = 'URL da foto';
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  urlInput.placeholder = 'https://exemplo.com/imagem.jpg';
  urlInput.value = data.fotoUrl || data.url || '';
  urlInput.dataset.role = 'color-photo-url';
  urlWrapper.appendChild(urlLabel);
  urlWrapper.appendChild(urlInput);

  const actionsWrapper = document.createElement('div');
  actionsWrapper.className = 'flex items-center justify-end sm:w-auto';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50';
  removeBtn.innerHTML =
    '<i class="fa-solid fa-trash-can"></i><span>Remover</span>';
  removeBtn.addEventListener('click', () => {
    row.remove();
    updateColorVariationsEmptyState();
  });
  actionsWrapper.appendChild(removeBtn);

  row.appendChild(colorWrapper);
  row.appendChild(urlWrapper);
  row.appendChild(actionsWrapper);

  colorVariationsContainer.appendChild(row);
  updateColorVariationsEmptyState();

  return row;
}

function setColorVariationsInForm(variations) {
  if (!colorVariationsContainer) return;
  const rows = colorVariationsContainer.querySelectorAll(
    '[data-variation-row="true"]',
  );
  rows.forEach((row) => row.remove());
  if (Array.isArray(variations) && variations.length) {
    variations.forEach((variacao) => createColorVariationRow(variacao));
  }
  updateColorVariationsEmptyState();
}

function getColorVariationsFromForm() {
  if (!colorVariationsContainer) return { variations: [], isValid: true };
  const rows = Array.from(
    colorVariationsContainer.querySelectorAll('[data-variation-row="true"]'),
  );
  const variations = [];
  let hasError = false;

  rows.forEach((row) => {
    const colorInput = row.querySelector('input[data-role="color-name"]');
    const urlInput = row.querySelector('input[data-role="color-photo-url"]');
    const cor = colorInput?.value.trim() || '';
    const fotoUrl = urlInput?.value.trim() || '';
    if (!cor && !fotoUrl) {
      return;
    }
    if (!cor || !fotoUrl) {
      hasError = true;
      row.classList.add('border-red-300', 'bg-red-50');
      setTimeout(() => {
        row.classList.remove('border-red-300', 'bg-red-50');
      }, 2000);
      return;
    }
    variations.push({ cor, fotoUrl });
  });

  if (hasError) {
    showToast(
      'Preencha a cor e a URL da foto para cada variação adicionada.',
      'warning',
    );
    return { variations: [], isValid: false };
  }

  return { variations, isValid: true };
}

function updateFormEditingState() {
  const isEditing = Boolean(editingProductId);
  if (editingBanner) {
    editingBanner.classList.toggle('hidden', !isEditing);
  }
  if (editingBannerText && !isEditing) {
    editingBannerText.textContent = editingBannerDefaultText;
  }
  if (submitBtn) {
    submitBtn.innerHTML = isEditing
      ? submitBtnEditingContent
      : submitBtnDefaultContent;
  }
}

function cancelEditing() {
  editingProductId = null;
  editingProductData = null;
  updateFormEditingState();
}

function populateFormWithProduct(produto) {
  if (!form || !produto) return;
  form.reset();
  if (nameInput) nameInput.value = produto.nome || '';
  if (skuInput) skuInput.value = produto.sku || '';
  if (costInput) {
    costInput.value =
      typeof produto.custo === 'number' && !Number.isNaN(produto.custo)
        ? produto.custo
        : produto.custo || '';
  }
  if (priceInput) {
    priceInput.value =
      typeof produto.precoSugerido === 'number' &&
      !Number.isNaN(produto.precoSugerido)
        ? produto.precoSugerido
        : produto.precoSugerido || '';
  }
  if (categoryInput) categoryInput.value = produto.categoria || '';
  if (descriptionInput) descriptionInput.value = produto.descricao || '';
  if (measuresInput) measuresInput.value = produto.medidas || '';
  if (photoUrlsInput) {
    const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
    const urls = fotos
      .map((foto) => foto?.url)
      .filter(Boolean)
      .join('\n');
    photoUrlsInput.value = urls;
  }
  if (photosInput) {
    photosInput.value = '';
  }
  setColorVariationsInForm(
    Array.isArray(produto.variacoesCor) ? produto.variacoesCor : [],
  );
}

function startEditProduct(produto) {
  if (!canEdit || !produto) return;
  editingProductId = produto.id;
  editingProductData = produto;
  populateFormWithProduct(produto);
  toggleForm(true);
  if (editingBannerText) {
    const parts = [produto.nome, produto.sku]
      .filter((valor) => Boolean(valor))
      .join(' • ');
    editingBannerText.textContent = parts
      ? `Editando: ${parts}`
      : editingBannerDefaultText;
  }
  updateFormEditingState();
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeModal() {
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function openModal(produto) {
  if (!modal || !produto) return;
  modalTitle.textContent = produto.nome || 'Detalhes do produto';
  modalSku.textContent = produto.sku || '--';
  modalCategoria.textContent = produto.categoria || 'Sem categoria';
  modalCusto.textContent = formatCurrency(produto.custo);
  modalPreco.textContent = formatCurrency(produto.precoSugerido);
  modalDescricao.textContent = produto.descricao || 'Sem descrição cadastrada.';
  modalMedidas.textContent = produto.medidas || 'Sem medidas cadastradas.';

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
      ? produto.variacoesCor
      : [];
    if (!variacoes.length) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-gray-500';
      empty.textContent = 'Nenhuma variação de cor cadastrada.';
      modalVariacoes.appendChild(empty);
    } else {
      variacoes.forEach((variacao) => {
        const item = document.createElement('div');
        item.className =
          'flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm';

        const thumb = document.createElement('div');
        thumb.className =
          'flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gray-100';
        const variacaoUrl = variacao?.fotoUrl || variacao?.url;
        if (variacaoUrl) {
          const img = document.createElement('img');
          img.src = variacaoUrl;
          img.alt = variacao?.cor
            ? `Foto da variação ${variacao.cor}`
            : 'Foto da variação';
          img.className = 'h-full w-full object-cover';
          thumb.appendChild(img);
        } else {
          thumb.innerHTML = '<i class="fa-solid fa-image text-gray-400"></i>';
        }

        const info = document.createElement('div');
        info.className = 'flex flex-col';
        const corNome = document.createElement('p');
        corNome.className = 'text-sm font-semibold text-gray-900';
        corNome.textContent = variacao?.cor || 'Cor não informada';
        info.appendChild(corNome);

        if (variacaoUrl) {
          const link = document.createElement('a');
          link.href = variacaoUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className =
            'text-xs font-medium text-blue-600 transition hover:text-blue-700';
          link.textContent = 'Abrir foto da variação';
          info.appendChild(link);
        } else {
          const placeholder = document.createElement('p');
          placeholder.className = 'text-xs text-gray-500';
          placeholder.textContent = 'Sem URL cadastrada.';
          info.appendChild(placeholder);
        }

        item.appendChild(thumb);
        item.appendChild(info);
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

function renderProducts(produtos) {
  productCache.clear();
  if (cardsContainer) cardsContainer.innerHTML = '';

  const sorted = [...produtos];
  sorted.forEach((produto) => productCache.set(produto.id, produto));

  if (!sorted.length) {
    if (emptyStateEl) emptyStateEl.classList.remove('hidden');
  } else {
    if (emptyStateEl) emptyStateEl.classList.add('hidden');
    sorted.forEach((produto) => {
      if (editingProductId === produto.id) {
        editingProductData = produto;
      }
      const card = document.createElement('div');
      card.className =
        'flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md';

      const media = document.createElement('div');
      media.className = 'relative h-40 w-full bg-gray-100';
      const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
      const primeiraFoto = fotos.find((foto) => foto?.url);
      if (primeiraFoto) {
        const img = document.createElement('img');
        img.src = primeiraFoto.url;
        img.alt = produto.nome || primeiraFoto.nome || 'Produto';
        img.className = 'h-full w-full object-cover';
        media.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className =
          'flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-200 to-gray-100 text-gray-400';
        placeholder.innerHTML = '<i class="fa-solid fa-image text-4xl"></i>';
        media.appendChild(placeholder);
      }
      card.appendChild(media);

      const body = document.createElement('div');
      body.className = 'flex flex-1 flex-col px-4 py-4';

      const skuLabel = document.createElement('p');
      skuLabel.className =
        'text-xs font-semibold uppercase tracking-wide text-gray-500';
      skuLabel.textContent = 'SKU';

      const skuValue = document.createElement('p');
      skuValue.className = 'text-sm font-semibold text-gray-900';
      skuValue.textContent = produto.sku || '--';

      const nameEl = document.createElement('h3');
      nameEl.className = 'mt-2 text-lg font-semibold text-gray-900';
      nameEl.textContent = produto.nome || 'Produto sem nome';

      const categoryEl = document.createElement('p');
      categoryEl.className = 'mt-1 text-sm text-gray-500';
      categoryEl.textContent = produto.categoria || 'Sem categoria';

      let variationsWrap = null;
      if (Array.isArray(produto.variacoesCor) && produto.variacoesCor.length) {
        variationsWrap = document.createElement('div');
        variationsWrap.className = 'mt-3 flex flex-wrap gap-2';
        const maxTags = 4;
        produto.variacoesCor.slice(0, maxTags).forEach((variacao, index) => {
          const tag = document.createElement('span');
          tag.className =
            'inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700';
          tag.textContent = variacao?.cor || `Variação ${index + 1}`;
          variationsWrap.appendChild(tag);
        });
        if (produto.variacoesCor.length > maxTags) {
          const moreTag = document.createElement('span');
          moreTag.className =
            'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700';
          moreTag.textContent = `+${produto.variacoesCor.length - maxTags}`;
          variationsWrap.appendChild(moreTag);
        }
      }

      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'mt-auto flex flex-wrap gap-2 pt-4';

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className =
        'inline-flex items-center gap-2 text-sm font-semibold text-red-600 transition hover:text-red-700';
      detailsBtn.innerHTML =
        '<span>Ver mais</span><i class="fa-solid fa-arrow-right"></i>';
      detailsBtn.addEventListener('click', () => openModal(produto));
      actionsContainer.appendChild(detailsBtn);

      if (canEdit) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className =
          'inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100';
        editBtn.innerHTML =
          '<i class="fa-solid fa-pen-to-square"></i><span>Editar</span>';
        editBtn.addEventListener('click', () => startEditProduct(produto));
        actionsContainer.appendChild(editBtn);
      }

      body.appendChild(skuLabel);
      body.appendChild(skuValue);
      body.appendChild(nameEl);
      body.appendChild(categoryEl);
      if (variationsWrap) body.appendChild(variationsWrap);
      body.appendChild(actionsContainer);
      card.appendChild(body);

      cardsContainer?.appendChild(card);
    });
  }

  updateSummary(sorted);
}

function subscribeToCatalog(uid) {
  if (catalogUnsub) {
    catalogUnsub();
    catalogUnsub = null;
  }
  if (!uid) return;
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
      renderProducts(produtos);
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

  const isEditing = Boolean(editingProductId);
  const produtoAnterior =
    isEditing && editingProductId
      ? productCache.get(editingProductId) || editingProductData
      : null;

  const nome = nameInput?.value.trim();
  const sku = skuInput?.value.trim();
  const custoValor = costInput?.value.trim();
  const precoValor = priceInput?.value.trim();
  const categoria = categoryInput?.value.trim();
  const descricao = descriptionInput?.value.trim();
  const medidas = measuresInput?.value.trim();
  const arquivos = photosInput?.files ? Array.from(photosInput.files) : [];
  const fotosUrlsBruto = photoUrlsInput?.value.trim();
  const fotosUrls = fotosUrlsBruto
    ? fotosUrlsBruto
        .split(/\n+/)
        .map((linha) => linha.trim())
        .filter(Boolean)
    : [];

  const { variations: colorVariations, isValid: colorVariationsValid } =
    getColorVariationsFromForm();
  if (!colorVariationsValid) {
    return;
  }

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

  const payload = {
    nome,
    sku,
    custo: typeof custo === 'number' && !Number.isNaN(custo) ? custo : null,
    precoSugerido:
      typeof preco === 'number' && !Number.isNaN(preco) ? preco : null,
    categoria: categoria || null,
    descricao: descricao || null,
    medidas: medidas || null,
    fotos: [],
    variacoesCor: colorVariations,
    updatedAt: serverTimestamp(),
  };

  if (!isEditing) {
    payload.createdAt = serverTimestamp();
    payload.criadoPorUid = currentUser.uid;
    payload.criadoPorEmail = currentUser.email;
    payload.criadoPorNome =
      currentProfile?.nome || currentUser.displayName || currentUser.email;
    payload.responsavelUid = responsavel?.uid || scopeUid;
    payload.responsavelEmail = responsavel?.email || null;
    payload.responsavelNome = responsavel?.nome || null;
  }

  const colRef = collection(db, 'usuarios', scopeUid, 'catalogoProdutos');
  const docRef = isEditing ? doc(colRef, editingProductId) : doc(colRef);

  try {
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-60');
    }

    const fotosSalvas = [];
    const fotosRegistradas = new Set();
    const adicionarFoto = (foto) => {
      if (!foto?.url || fotosRegistradas.has(foto.url)) return;
      fotosSalvas.push(foto);
      fotosRegistradas.add(foto.url);
    };
    const existingPhotoMap = new Map();
    if (produtoAnterior && Array.isArray(produtoAnterior.fotos)) {
      produtoAnterior.fotos.forEach((foto) => {
        if (foto?.url) {
          existingPhotoMap.set(foto.url, foto);
        }
      });
    }

    const errosUpload = [];
    for (const arquivo of arquivos) {
      if (!(arquivo instanceof File)) continue;
      try {
        const path = `catalogo/${scopeUid}/${docRef.id}/${Date.now()}-${arquivo.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, arquivo);
        const url = await getDownloadURL(storageRef);
        adicionarFoto({ nome: arquivo.name, url, storagePath: path });
      } catch (err) {
        console.error('Não foi possível enviar uma foto para o Storage:', err);
        errosUpload.push(arquivo.name);
      }
    }

    fotosUrls.forEach((url, index) => {
      const existente = existingPhotoMap.get(url);
      if (existente) {
        adicionarFoto(existente);
      } else {
        const nome = getFileNameFromUrl(url) || `Foto ${index + 1}`;
        adicionarFoto({ nome, url });
      }
    });
    payload.fotos = fotosSalvas;

    if (isEditing) {
      await setDoc(docRef, payload, { merge: true });
    } else {
      await setDoc(docRef, payload);
    }
    showToast(
      isEditing
        ? 'Produto atualizado com sucesso!'
        : 'Produto cadastrado no catálogo com sucesso!',
    );
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
    showToast(
      isEditing
        ? 'Erro ao atualizar o produto. Tente novamente.'
        : 'Erro ao cadastrar produto. Tente novamente.',
      'error',
    );
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-60');
    }
  }
}

function setupEventListeners() {
  addItemBtn?.addEventListener('click', () => {
    clearForm();
    toggleForm(true);
  });
  cancelFormBtn?.addEventListener('click', () => {
    clearForm();
    toggleForm(false);
  });
  addColorVariationBtn?.addEventListener('click', () => {
    createColorVariationRow();
  });
  editingCancelBtn?.addEventListener('click', () => {
    clearForm();
    if (formWrapper && formWrapper.classList.contains('hidden')) {
      toggleForm(true);
    }
  });
  form?.addEventListener('submit', handleSubmit);
  modalCloseBtn?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) {
      closeModal();
    }
  });
  updateColorVariationsEmptyState();
  updateFormEditingState();
}

setupEventListeners();

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
