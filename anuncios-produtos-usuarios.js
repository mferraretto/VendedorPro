import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { db, auth } from './firebase-config.js';

const form = document.getElementById('formProdutoUsuario');
const statusEl = document.getElementById('statusCadastroProdutoUsuario');
const filtroSkuInput = document.getElementById('filtroSkuProdutosUsuarios');
const cardsContainer = document.getElementById('cardsProdutosUsuarios');
const emptyState = document.getElementById('emptyProdutosUsuarios');

let produtosCache = [];
let usuarioAtual = null;
let carregando = false;

const moedaFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function setStatus(message, type = 'info') {
  if (!statusEl) return;
  if (!message) {
    statusEl.textContent = '';
    statusEl.className = 'text-sm';
    return;
  }
  const baseClass =
    type === 'success'
      ? 'text-sm text-green-600'
      : type === 'error'
        ? 'text-sm text-red-600'
        : 'text-sm text-gray-600';
  statusEl.className = baseClass;
  statusEl.textContent = message;
}

function normalizarSku(sku) {
  return sku ? sku.trim().toUpperCase() : '';
}

function renderCards(lista) {
  if (!cardsContainer || !emptyState) return;
  cardsContainer.innerHTML = '';
  if (!lista.length) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  const fragment = document.createDocumentFragment();
  for (const produto of lista) {
    const card = document.createElement('div');
    card.className = 'bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col h-full';

    if (produto.imagemUrl) {
      const img = document.createElement('img');
      img.src = produto.imagemUrl;
      img.alt = produto.nome || produto.sku;
      img.className = 'w-full h-40 object-cover rounded mb-4';
      img.onerror = () => {
        img.classList.add('hidden');
      };
      card.appendChild(img);
    }

    const titulo = document.createElement('h3');
    titulo.className = 'text-lg font-semibold text-gray-800 mb-1';
    titulo.textContent = produto.nome || 'Produto sem nome';
    card.appendChild(titulo);

    const sku = document.createElement('p');
    sku.className = 'text-sm font-mono text-gray-500 mb-2';
    sku.textContent = `SKU: ${produto.sku}`;
    card.appendChild(sku);

    const descricao = document.createElement('p');
    descricao.className = 'text-sm text-gray-600 flex-1';
    descricao.textContent = produto.descricao || 'Sem descrição informada.';
    card.appendChild(descricao);

    const preco = document.createElement('p');
    preco.className = 'text-base font-semibold text-orange-600 mt-4';
    preco.textContent =
      typeof produto.preco === 'number'
        ? moedaFormatter.format(produto.preco)
        : 'Preço não informado';
    card.appendChild(preco);

    const data = document.createElement('p');
    data.className = 'text-xs text-gray-400 mt-2';
    if (produto.updatedAt) {
      const dt = produto.updatedAt.toDate
        ? produto.updatedAt.toDate()
        : new Date(produto.updatedAt);
      if (!Number.isNaN(dt.getTime())) {
        data.textContent = `Atualizado em ${dt.toLocaleString('pt-BR')}`;
      }
    }
    if (!data.textContent) {
      data.textContent = '—';
    }
    card.appendChild(data);

    fragment.appendChild(card);
  }
  cardsContainer.appendChild(fragment);
}

function aplicarFiltro() {
  const termo = normalizarSku(filtroSkuInput?.value || '');
  if (!termo) {
    renderCards(produtosCache);
    return;
  }
  const filtrados = produtosCache.filter((produto) =>
    normalizarSku(produto.sku).includes(termo),
  );
  renderCards(filtrados);
}

async function carregarProdutos(uid) {
  if (!uid || carregando) return;
  carregando = true;
  try {
    const colRef = collection(db, `uid/${uid}/produtosUsuarios`);
    const snap = await getDocs(colRef);
    produtosCache = snap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        sku: docSnap.id,
      }))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis
          ? a.updatedAt.toMillis()
          : new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = b.updatedAt?.toMillis
          ? b.updatedAt.toMillis()
          : new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    aplicarFiltro();
  } catch (err) {
    console.error('Erro ao carregar produtos dos usuários:', err);
    setStatus('Não foi possível carregar os produtos cadastrados.', 'error');
  } finally {
    carregando = false;
  }
}

async function salvarProduto(event) {
  event.preventDefault();
  if (!usuarioAtual) {
    setStatus('É necessário estar logado para salvar produtos.', 'error');
    return;
  }

  const nomeInput = document.getElementById('nomeProdutoUsuario');
  const skuInput = document.getElementById('skuProdutoUsuario');
  const descricaoInput = document.getElementById('descricaoProdutoUsuario');
  const precoInput = document.getElementById('precoProdutoUsuario');
  const imagemInput = document.getElementById('imagemProdutoUsuario');

  const sku = normalizarSku(skuInput?.value || '');
  if (!sku) {
    setStatus('Informe um SKU válido para o produto.', 'error');
    return;
  }

  const precoTexto = `${precoInput?.value ?? ''}`.replace(',', '.');
  const precoValor = parseFloat(precoTexto || '0');
  if (Number.isNaN(precoValor) || precoValor < 0) {
    setStatus('Informe um preço válido (maior ou igual a zero).', 'error');
    return;
  }

  const jaExistente = produtosCache.some(
    (produto) => normalizarSku(produto.sku) === sku,
  );

  const dados = {
    nome: nomeInput?.value.trim() || '',
    sku,
    descricao: descricaoInput?.value.trim() || '',
    preco: Number(precoValor.toFixed(2)),
    imagemUrl: imagemInput?.value.trim() || '',
    updatedAt: serverTimestamp(),
    ...(jaExistente ? {} : { createdAt: serverTimestamp() }),
  };

  if (!dados.nome) {
    setStatus('Informe o nome do produto.', 'error');
    return;
  }

  setStatus('Salvando produto...', 'info');

  try {
    const docRef = doc(collection(db, `uid/${usuarioAtual}/produtosUsuarios`), sku);
    await setDoc(docRef, dados, { merge: true });
    setStatus('Produto salvo com sucesso!', 'success');
    form?.reset();
    if (nomeInput) nomeInput.focus();
    await carregarProdutos(usuarioAtual);
  } catch (err) {
    console.error('Erro ao salvar produto personalizado:', err);
    setStatus('Erro ao salvar o produto. Tente novamente.', 'error');
  }
}

if (form) {
  form.addEventListener('submit', salvarProduto);
}

if (filtroSkuInput) {
  filtroSkuInput.addEventListener('input', aplicarFiltro);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    usuarioAtual = null;
    produtosCache = [];
    renderCards([]);
    setStatus('Faça login para cadastrar e visualizar produtos.', 'info');
    return;
  }
  usuarioAtual = user.uid;
  setStatus('');
  await carregarProdutos(usuarioAtual);
});

// Se o usuário já estiver autenticado (página carregada depois do login)
if (auth.currentUser) {
  usuarioAtual = auth.currentUser.uid;
  carregarProdutos(usuarioAtual);
}
