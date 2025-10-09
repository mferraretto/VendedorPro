import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const form = document.getElementById('produtoUsuarioForm');
if (!form) {
  // Página não carregada, encerra o script.
  console.debug(
    '[anuncios-usuarios] Formulário não encontrado na página atual.',
  );
} else {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  const nomeInput = document.getElementById('nomeProdutoUsuario');
  const skuInput = document.getElementById('skuProdutoUsuario');
  const precoInput = document.getElementById('precoProdutoUsuario');
  const descricaoInput = document.getElementById('descricaoProdutoUsuario');
  const imagemInput = document.getElementById('imagemProdutoUsuario');
  const imagemPreviewWrapper = document.getElementById(
    'previewImagemProdutoUsuario',
  );
  const imagemPreview = imagemPreviewWrapper?.querySelector('img');
  const feedback = document.getElementById('feedbackProdutosUsuarios');
  const filtroSkuInput = document.getElementById('filtroSkuUsuarios');
  const recarregarButton = document.getElementById(
    'recarregarProdutosUsuarios',
  );
  const cardsContainer = document.getElementById('cardsProdutosUsuarios');
  const vazioState = document.getElementById('estadoVazioProdutosUsuarios');
  const loadingState = document.getElementById('carregandoProdutosUsuarios');
  const submitButton = form.querySelector('button[type="submit"]');

  let usuarioAtual = null;
  let produtosCache = [];

  function normalizarSku(valor) {
    if (!valor) return '';
    const semEspacos = valor.trim().replace(/\s+/g, '-');
    const caracteresInvalidos = /[./#$\[\]\/\\]/g;
    return semEspacos.replace(caracteresInvalidos, '-').toUpperCase();
  }

  function setFeedback(message, type = 'success') {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `text-sm font-medium ${
      type === 'error' ? 'text-red-600' : 'text-green-600'
    }`;
  }

  function limparFeedback() {
    if (!feedback) return;
    feedback.textContent = '';
    feedback.className = 'text-sm';
  }

  function mostrarLoading(flag) {
    if (!loadingState) return;
    loadingState.classList.toggle('hidden', !flag);
  }

  function atualizarEstadosLista(temItens) {
    if (cardsContainer) {
      cardsContainer.classList.toggle('hidden', !temItens);
    }
    if (vazioState) {
      vazioState.classList.toggle('hidden', temItens);
    }
  }

  function formatarPreco(preco) {
    if (typeof preco === 'number') {
      return preco.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
      });
    }
    return preco;
  }

  function criarCard(produto) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow p-5 flex flex-col';

    if (produto.imagem) {
      const img = document.createElement('img');
      img.src = produto.imagem;
      img.alt = `Imagem do produto ${produto.nome}`;
      img.className = 'h-40 w-full object-cover rounded-lg mb-4';
      card.appendChild(img);
    }

    const titulo = document.createElement('h3');
    titulo.className = 'text-lg font-semibold text-gray-800';
    titulo.textContent = produto.nome;
    card.appendChild(titulo);

    const sku = document.createElement('p');
    sku.className = 'text-sm text-gray-500 mt-1';
    sku.innerHTML = `<span class="font-semibold">SKU:</span> ${produto.sku}`;
    card.appendChild(sku);

    const preco = document.createElement('p');
    preco.className = 'text-sm text-gray-500 mt-1';
    preco.innerHTML = `<span class="font-semibold">Preço:</span> ${formatarPreco(
      produto.preco,
    )}`;
    card.appendChild(preco);

    const descricao = document.createElement('p');
    descricao.className = 'text-sm text-gray-600 mt-3 whitespace-pre-line';
    descricao.textContent = produto.descricao;
    card.appendChild(descricao);

    if (produto.atualizadoEm) {
      const atualizado = document.createElement('p');
      atualizado.className = 'text-xs text-gray-400 mt-4';
      const data = produto.atualizadoEm.toDate
        ? produto.atualizadoEm.toDate()
        : produto.atualizadoEm;
      if (data instanceof Date && !Number.isNaN(data.getTime())) {
        atualizado.textContent = `Atualizado em ${data.toLocaleString('pt-BR')}`;
        card.appendChild(atualizado);
      }
    }

    return card;
  }

  function renderizarProdutos() {
    if (!cardsContainer) return;
    const filtro = filtroSkuInput?.value.trim().toLowerCase() || '';
    cardsContainer.innerHTML = '';

    const produtosFiltrados = produtosCache.filter((produto) =>
      filtro ? produto.sku.toLowerCase().includes(filtro) : true,
    );

    if (!produtosFiltrados.length) {
      atualizarEstadosLista(false);
      return;
    }

    atualizarEstadosLista(true);
    produtosFiltrados.forEach((produto) => {
      cardsContainer.appendChild(criarCard(produto));
    });
  }

  async function carregarProdutos() {
    if (!usuarioAtual) return;
    mostrarLoading(true);
    try {
      const colecao = collection(
        db,
        'uid',
        usuarioAtual.uid,
        'anunciosUsuarios',
      );
      const consulta = query(colecao, orderBy('nome'));
      const snapshot = await getDocs(consulta);
      produtosCache = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      renderizarProdutos();
      if (!produtosCache.length) {
        atualizarEstadosLista(false);
      }
    } catch (error) {
      console.error('Erro ao carregar produtos de usuários:', error);
      setFeedback(
        'Não foi possível carregar os produtos. Tente novamente.',
        'error',
      );
      atualizarEstadosLista(false);
    } finally {
      mostrarLoading(false);
    }
  }

  function lerArquivoComoDataUrl(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(arquivo);
    });
  }

  function carregarImagem(dataUrl) {
    return new Promise((resolve, reject) => {
      const imagem = new Image();
      imagem.onload = () => resolve(imagem);
      imagem.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
      imagem.src = dataUrl;
    });
  }

  async function gerarImagemReduzida(arquivo) {
    if (!arquivo) return null;
    if (!arquivo.type?.startsWith('image/')) {
      throw new Error('Arquivo selecionado não é uma imagem.');
    }

    const dataUrlOriginal = await lerArquivoComoDataUrl(arquivo);
    if (!dataUrlOriginal) return null;

    try {
      const imagem = await carregarImagem(dataUrlOriginal);
      const maxLargura = 800;
      const maxAltura = 800;
      const escala = Math.min(
        1,
        maxLargura / imagem.width,
        maxAltura / imagem.height,
      );
      const larguraFinal = Math.max(1, Math.round(imagem.width * escala));
      const alturaFinal = Math.max(1, Math.round(imagem.height * escala));

      const canvas = document.createElement('canvas');
      canvas.width = larguraFinal;
      canvas.height = alturaFinal;
      const contexto = canvas.getContext('2d');
      contexto.drawImage(imagem, 0, 0, larguraFinal, alturaFinal);

      const tipoPreferencial =
        arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const qualidadeBase = 0.8;

      let dataUrlReduzido = canvas.toDataURL(tipoPreferencial, qualidadeBase);
      if (dataUrlReduzido.length >= dataUrlOriginal.length) {
        dataUrlReduzido = canvas.toDataURL('image/jpeg', 0.7);
      }

      if (dataUrlReduzido.length >= dataUrlOriginal.length) {
        return dataUrlOriginal;
      }

      return dataUrlReduzido;
    } catch (error) {
      console.warn('Falha ao reduzir a imagem, utilizando original.', error);
      return dataUrlOriginal;
    }
  }

  let imagemProcessadaDataUrl = null;

  imagemInput?.addEventListener('change', async () => {
    if (!imagemPreviewWrapper || !imagemPreview) return;
    imagemProcessadaDataUrl = null;
    const arquivo = imagemInput.files?.[0];
    if (!arquivo) {
      imagemPreviewWrapper.classList.add('hidden');
      imagemPreview.src = '';
      return;
    }
    try {
      const dataUrl = await gerarImagemReduzida(arquivo);
      if (dataUrl) {
        imagemProcessadaDataUrl = dataUrl;
        imagemPreview.src = dataUrl;
        imagemPreviewWrapper.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Erro ao ler a imagem selecionada:', error);
      setFeedback('Não foi possível carregar a imagem selecionada.', 'error');
    }
  });

  filtroSkuInput?.addEventListener('input', () => {
    renderizarProdutos();
  });

  recarregarButton?.addEventListener('click', () => {
    limparFeedback();
    carregarProdutos();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparFeedback();

    if (!usuarioAtual) {
      setFeedback('Você precisa estar logado para salvar produtos.', 'error');
      return;
    }

    const nome = nomeInput?.value.trim();
    const sku = skuInput?.value.trim();
    const precoTexto = precoInput?.value.trim();
    const descricao = descricaoInput?.value.trim();

    if (!nome || !sku || !precoTexto || !descricao) {
      setFeedback('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    const precoNormalizado = Number(
      precoTexto.replace(/\./g, '').replace(',', '.'),
    );
    if (Number.isNaN(precoNormalizado)) {
      setFeedback('Informe um preço válido.', 'error');
      return;
    }

    const arquivoImagem = imagemInput?.files?.[0];
    let imagemDataUrl = null;
    if (arquivoImagem) {
      try {
        imagemDataUrl =
          imagemProcessadaDataUrl || (await gerarImagemReduzida(arquivoImagem));
      } catch (error) {
        console.error('Erro ao converter imagem para base64:', error);
        setFeedback(
          'Não foi possível processar a imagem selecionada.',
          'error',
        );
        return;
      }
    }

    const skuNormalizado = normalizarSku(sku);
    if (!skuNormalizado) {
      setFeedback('Informe um SKU válido.', 'error');
      return;
    }

    try {
      submitButton?.setAttribute('disabled', 'disabled');
      submitButton?.classList.add('opacity-60');

      await setDoc(
        doc(db, 'uid', usuarioAtual.uid, 'anunciosUsuarios', skuNormalizado),
        {
          nome,
          sku: skuNormalizado,
          descricao,
          preco: precoNormalizado,
          imagem: imagemDataUrl,
          atualizadoEm: serverTimestamp(),
        },
      );

      setFeedback('Produto salvo com sucesso!');
      form.reset();
      if (imagemPreviewWrapper && imagemPreview) {
        imagemPreviewWrapper.classList.add('hidden');
        imagemPreview.src = '';
      }
      imagemProcessadaDataUrl = null;
      await carregarProdutos();
    } catch (error) {
      console.error('Erro ao salvar produto do usuário:', error);
      setFeedback(
        'Não foi possível salvar o produto. Tente novamente.',
        'error',
      );
    } finally {
      submitButton?.removeAttribute('disabled');
      submitButton?.classList.remove('opacity-60');
    }
  });

  onAuthStateChanged(auth, (user) => {
    usuarioAtual = user;
    if (!usuarioAtual) {
      produtosCache = [];
      renderizarProdutos();
      atualizarEstadosLista(false);
      return;
    }
    carregarProdutos();
  });
}
