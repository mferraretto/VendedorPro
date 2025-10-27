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

function clearForm() {
  form?.reset();
  if (photosInput) photosInput.value = '';
  if (photoUrlsInput) photoUrlsInput.value = '';
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
    return [
      produto.sku || '',
      produto.nome || '',
      produto.categoria || '',
      formatCurrencyForExport(produto.custo),
      formatCurrencyForExport(produto.precoSugerido),
      produto.descricao || '',
      produto.medidas || '',
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

  const margem = 15;
  const espacamentoEntreCartoes = 8;
  const colunas = 2;
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraCartao =
    (larguraPagina - margem * 2 - espacamentoEntreCartoes * (colunas - 1)) /
    colunas;
  const alturaCartao = 70;
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

  try {
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
        doc.roundedRect(
          posicaoX,
          yLinhaAtual,
          larguraCartao,
          alturaCartao,
          3,
          3,
        );

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
          `Custo: ${formatCurrencyForExport(produto.custo)}`,
          textoX,
          textoY,
        );
        textoY += 5;

        doc.text(
          `Venda: ${formatCurrencyForExport(
            produto.precoSugerido ?? produto.preco ?? produto.valorVenda,
          )}`,
          textoX,
          textoY,
        );

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

      body.appendChild(skuLabel);
      body.appendChild(skuValue);
      body.appendChild(nameEl);
      body.appendChild(categoryEl);

      const variacoes = Array.isArray(produto.variacoesCor)
        ? produto.variacoesCor.filter((item) => item && item.cor)
        : [];
      if (variacoes.length) {
        const variacoesEl = document.createElement('p');
        variacoesEl.className = 'mt-2 text-xs text-gray-500';
        variacoesEl.textContent = `Cores: ${variacoes
          .map((item) => item.cor)
          .join(', ')}`;
        body.appendChild(variacoesEl);
      }

      const actions = document.createElement('div');
      actions.className =
        'mt-auto flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between';

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
          '<i class="fa-solid fa-pen-to-square"></i><span>Editar</span>';
        editBtn.addEventListener('click', () => startEditingProduct(produto));
        actions.appendChild(editBtn);
      }

      body.appendChild(actions);
      card.appendChild(body);

      cardsContainer?.appendChild(card);
    });
  }

  updateSummary(sorted);
  updateExportButtons(sorted.length > 0);
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
    medidas: medidas || null,
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
  if (measuresInput) measuresInput.value = produto.medidas || '';
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
}

setupEventListeners();
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
