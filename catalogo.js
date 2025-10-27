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
const modalVariacoesSection = document.getElementById(
  'catalogDetailsVariacoesSection',
);
const modalVariacoes = document.getElementById('catalogDetailsVariacoes');
const modalFotos = document.getElementById('catalogDetailsFotos');

const nameInput = document.getElementById('catalogProductName');
const skuInput = document.getElementById('catalogProductSku');
const costInput = document.getElementById('catalogProductCost');
const priceInput = document.getElementById('catalogProductPrice');
const categoryInput = document.getElementById('catalogProductCategory');
const descriptionInput = document.getElementById('catalogProductDescription');
const measuresInput = document.getElementById('catalogProductMeasures');
const photosInput = document.getElementById('catalogProductPhotos');
const photoUrlsInput = document.getElementById('catalogProductPhotoUrls');
const colorVariationsList = document.getElementById(
  'catalogColorVariationsList',
);
const addColorVariationBtn = document.getElementById(
  'catalogAddColorVariationBtn',
);
const formEditAlert = document.getElementById('catalogFormEditAlert');
const submitBtn = form?.querySelector('button[type="submit"]');

let currentUser = null;
let currentProfile = null;
let scopeUid = null;
let responsavelInfo = null;
let canEdit = false;
let catalogUnsub = null;
let isSubmitting = false;
const productCache = new Map();
let editingProductId = null;

function updateSubmitButtonLabel(text) {
  const label = submitBtn?.querySelector('span');
  if (label) label.textContent = text;
}

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
  if (colorVariationsList) colorVariationsList.innerHTML = '';
  editingProductId = null;
  if (formEditAlert) formEditAlert.classList.add('hidden');
  if (form) form.removeAttribute('data-editing');
  updateSubmitButtonLabel('Salvar produto');
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

function createColorVariationRow(variacao = {}) {
  const row = document.createElement('div');
  row.className =
    'rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4';
  row.dataset.colorVariation = 'true';

  const grid = document.createElement('div');
  grid.className = 'grid gap-3 sm:grid-cols-2';

  const colorWrapper = document.createElement('div');
  colorWrapper.className = 'flex flex-col';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'text-xs font-medium text-gray-600';
  colorLabel.textContent = 'Cor';
  const colorInput = document.createElement('input');
  colorInput.type = 'text';
  colorInput.name = 'variationColor';
  colorInput.value = variacao.cor || '';
  colorInput.placeholder = 'Ex.: Preto, Azul, Vermelho';
  colorInput.className =
    'mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  colorWrapper.appendChild(colorLabel);
  colorWrapper.appendChild(colorInput);

  const urlWrapper = document.createElement('div');
  urlWrapper.className = 'flex flex-col';
  const urlLabel = document.createElement('label');
  urlLabel.className = 'text-xs font-medium text-gray-600';
  urlLabel.textContent = 'URL da foto';
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.name = 'variationPhotoUrl';
  urlInput.value = variacao.fotoUrl || '';
  urlInput.placeholder = 'https://exemplo.com/imagem.jpg';
  urlInput.className =
    'mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  urlWrapper.appendChild(urlLabel);
  urlWrapper.appendChild(urlInput);

  grid.appendChild(colorWrapper);
  grid.appendChild(urlWrapper);

  const actions = document.createElement('div');
  actions.className = 'mt-3 flex justify-end';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100';
  removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Remover</span>';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });
  actions.appendChild(removeBtn);

  row.appendChild(grid);
  row.appendChild(actions);

  return row;
}

function addColorVariationRow(variacao = {}) {
  if (!colorVariationsList) return null;
  const row = createColorVariationRow(variacao);
  colorVariationsList.appendChild(row);
  return row;
}

function parseColorVariationsFromForm() {
  if (!colorVariationsList) return { variations: [], hasInvalid: false };
  const rows = Array.from(
    colorVariationsList.querySelectorAll('[data-color-variation="true"]'),
  );

  const variations = [];
  let hasInvalid = false;

  rows.forEach((row) => {
    const cor = row.querySelector('input[name="variationColor"]')?.value.trim();
    const fotoUrl = row
      .querySelector('input[name="variationPhotoUrl"]')
      ?.value.trim();

    if (!cor && !fotoUrl) return;
    if (!cor || !fotoUrl) {
      hasInvalid = true;
      return;
    }
    variations.push({ cor, fotoUrl });
  });

  return { variations, hasInvalid };
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

  if (modalVariacoes) modalVariacoes.innerHTML = '';
  const variacoes = Array.isArray(produto.variacoesCor)
    ? produto.variacoesCor.filter(
        (variacao) => variacao && (variacao.cor || variacao.fotoUrl),
      )
    : [];
  if (modalVariacoesSection) {
    if (!variacoes.length) {
      modalVariacoesSection.classList.add('hidden');
    } else {
      modalVariacoesSection.classList.remove('hidden');
      variacoes.forEach((variacao) => {
        const item = document.createElement('div');
        item.className =
          'flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between';

        const info = document.createElement('div');
        info.className = 'flex-1';

        const nome = document.createElement('p');
        nome.className = 'text-sm font-semibold text-gray-900';
        nome.textContent = variacao.cor || 'Sem nome';
        info.appendChild(nome);

        if (variacao.fotoUrl) {
          const link = document.createElement('a');
          link.href = variacao.fotoUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'break-words text-xs text-blue-600 hover:underline';
          link.textContent = variacao.fotoUrl;
          info.appendChild(link);
        }

        item.appendChild(info);

        if (variacao.fotoUrl) {
          const previewLink = document.createElement('a');
          previewLink.href = variacao.fotoUrl;
          previewLink.target = '_blank';
          previewLink.rel = 'noopener noreferrer';
          previewLink.className =
            'group relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100';

          const img = document.createElement('img');
          img.src = variacao.fotoUrl;
          img.alt = variacao.cor || 'Variação de cor';
          img.className =
            'h-full w-full object-cover transition group-hover:scale-105';
          img.loading = 'lazy';

          previewLink.appendChild(img);
          item.appendChild(previewLink);
        }

        modalVariacoes?.appendChild(item);
      });
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

      if (Array.isArray(produto.variacoesCor) && produto.variacoesCor.length) {
        const preview = document.createElement('div');
        preview.className = 'mt-3 flex flex-wrap gap-2';
        const variacoesVisiveis = produto.variacoesCor.filter(
          (variacao) => variacao && variacao.cor,
        );
        variacoesVisiveis.slice(0, 3).forEach((variacao) => {
          const chip = document.createElement('span');
          chip.className =
            'inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700';
          chip.textContent = variacao.cor;
          preview.appendChild(chip);
        });
        if (variacoesVisiveis.length > 3) {
          const extra = document.createElement('span');
          extra.className =
            'inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500';
          extra.textContent = `+${variacoesVisiveis.length - 3}`;
          preview.appendChild(extra);
        }
        body.appendChild(preview);
      }

      const actions = document.createElement('div');
      actions.className = 'mt-auto flex flex-wrap gap-3 pt-4';

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className =
        'inline-flex items-center gap-2 text-sm font-semibold text-red-600 transition hover:text-red-700';
      detailsBtn.innerHTML =
        '<span>Ver mais</span><i class="fa-solid fa-arrow-right"></i>';
      detailsBtn.addEventListener('click', () => openModal(produto));
      actions.appendChild(detailsBtn);

      if (canEdit) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className =
          'inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700';
        editBtn.innerHTML =
          '<span>Editar</span><i class="fa-solid fa-pen-to-square"></i>';
        editBtn.addEventListener('click', () => startEditingProduct(produto));
        actions.appendChild(editBtn);
      }

      body.appendChild(skuLabel);
      body.appendChild(skuValue);
      body.appendChild(nameEl);
      body.appendChild(categoryEl);
      body.appendChild(actions);
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
  const produtoExistente = isEditing
    ? productCache.get(editingProductId)
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
  const { variations: colorVariations, hasInvalid } =
    parseColorVariationsFromForm();

  if (!nome || !sku) {
    showToast('Preencha os campos obrigatórios (nome e SKU).', 'warning');
    return;
  }

  if (hasInvalid) {
    showToast(
      'Preencha o nome e a URL da foto para cada variação de cor adicionada.',
      'warning',
    );
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

  const usuarioNome =
    currentProfile?.nome || currentUser.displayName || currentUser.email;

  const now = serverTimestamp();

  const payloadBase = {
    nome,
    sku,
    custo: typeof custo === 'number' && !Number.isNaN(custo) ? custo : null,
    precoSugerido:
      typeof preco === 'number' && !Number.isNaN(preco) ? preco : null,
    categoria: categoria || null,
    descricao: descricao || null,
    medidas: medidas || null,
    variacoesCor: colorVariations,
    fotos: [],
    updatedAt: now,
    atualizadoPorUid: currentUser.uid,
    atualizadoPorEmail: currentUser.email,
    atualizadoPorNome: usuarioNome,
  };

  const colRef = collection(db, 'usuarios', scopeUid, 'catalogoProdutos');
  const docRef = isEditing ? doc(colRef, editingProductId) : doc(colRef);

  try {
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-60');
    }

    const fotosSalvas = [];
    if (isEditing && produtoExistente) {
      const existentes = Array.isArray(produtoExistente.fotos)
        ? produtoExistente.fotos
        : [];
      existentes
        .filter((foto) => foto?.storagePath && foto?.url)
        .forEach((foto) => fotosSalvas.push(foto));
    }
    const errosUpload = [];
    for (const arquivo of arquivos) {
      if (!(arquivo instanceof File)) continue;
      try {
        const path = `catalogo/${scopeUid}/${docRef.id}/${Date.now()}-${arquivo.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, arquivo);
        const url = await getDownloadURL(storageRef);
        fotosSalvas.push({ nome: arquivo.name, url, storagePath: path });
      } catch (err) {
        console.error('Não foi possível enviar uma foto para o Storage:', err);
        errosUpload.push(arquivo.name);
      }
    }

    fotosUrls.forEach((url, index) => {
      const nome = getFileNameFromUrl(url) || `Foto ${index + 1}`;
      fotosSalvas.push({ nome, url });
    });
    payloadBase.fotos = fotosSalvas;

    if (isEditing) {
      await setDoc(docRef, payloadBase, { merge: true });
      showToast('Produto atualizado com sucesso!');
    } else {
      const payloadCreate = {
        ...payloadBase,
        createdAt: now,
        criadoPorUid: currentUser.uid,
        criadoPorEmail: currentUser.email,
        criadoPorNome: usuarioNome,
        responsavelUid: responsavel?.uid || scopeUid,
        responsavelEmail: responsavel?.email || null,
        responsavelNome: responsavel?.nome || null,
      };
      await setDoc(docRef, payloadCreate);
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
    showToast('Erro ao salvar o produto. Tente novamente.', 'error');
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
  if (formEditAlert) formEditAlert.classList.remove('hidden');
  if (form) form.setAttribute('data-editing', 'true');
  updateSubmitButtonLabel('Atualizar produto');

  form?.reset();

  if (nameInput) nameInput.value = produto.nome || '';
  if (skuInput) skuInput.value = produto.sku || '';
  if (costInput)
    costInput.value =
      typeof produto.custo === 'number' && !Number.isNaN(produto.custo)
        ? produto.custo
        : '';
  if (priceInput)
    priceInput.value =
      typeof produto.precoSugerido === 'number' &&
      !Number.isNaN(produto.precoSugerido)
        ? produto.precoSugerido
        : '';
  if (categoryInput) categoryInput.value = produto.categoria || '';
  if (descriptionInput) descriptionInput.value = produto.descricao || '';
  if (measuresInput) measuresInput.value = produto.medidas || '';

  if (photoUrlsInput) {
    const fotos = Array.isArray(produto.fotos) ? produto.fotos : [];
    const externas = fotos
      .filter((foto) => !foto?.storagePath && foto?.url)
      .map((foto) => foto.url);
    photoUrlsInput.value = externas.join('\n');
  }

  if (colorVariationsList) {
    colorVariationsList.innerHTML = '';
    const variacoes = Array.isArray(produto.variacoesCor)
      ? produto.variacoesCor
      : [];
    variacoes
      .filter((variacao) => variacao && (variacao.cor || variacao.fotoUrl))
      .forEach((variacao) =>
        addColorVariationRow({
          cor: variacao.cor || '',
          fotoUrl: variacao.fotoUrl || '',
        }),
      );
  }

  toggleForm(true);
  setTimeout(() => {
    formWrapper?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
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
  form?.addEventListener('submit', handleSubmit);
  modalCloseBtn?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) {
      closeModal();
    }
  });
  addColorVariationBtn?.addEventListener('click', () => {
    addColorVariationRow();
  });
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
