// Firebase configuration and initialization
import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  collectionGroup,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { saveSecureDoc, loadSecureDoc } from './secure-firestore.js';
import logger from './logger.js';

import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

const BASE_PATH = new URL('.', import.meta.url);
const tabs = [
  'cadastro',
  'anuncios',
  'analise',
  'evolucao',
  'planilha-shopee',
  'produtos-usuarios',
];
for (const t of tabs) {
  const container = document.getElementById(t);
  if (container) {
    const tabUrl = new URL(`anuncios-tabs/${t}.html`, BASE_PATH);
    const res = await fetch(tabUrl);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const content = doc.getElementById('tab-content')?.innerHTML || text;
    container.innerHTML = content;
    container.querySelectorAll('script').forEach((old) => {
      const s = document.createElement('script');
      Array.from(old.attributes).forEach((attr) =>
        s.setAttribute(attr.name, attr.value),
      );
      s.appendChild(document.createTextNode(old.innerHTML));
      old.replaceWith(s);
    });
  }
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
let isAdmin = false;
// Resolve a senha efetiva: usa a passphrase do usuário; se não houver, cai no UID
function getEffectivePass(ownerUid) {
  try {
    const pass = typeof getPassphrase === 'function' ? getPassphrase() : '';
    const current = auth.currentUser?.uid;
    return current === ownerUid && pass && pass.trim() ? pass : ownerUid;
  } catch {
    return ownerUid;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    const perfil = String(snap.data()?.perfil || '')
      .toLowerCase()
      .trim();
    isAdmin =
      snap.exists() && ['adm', 'admin', 'administrador'].includes(perfil);
  } catch (err) {
    console.error('Erro ao verificar perfil do usuário:', err);
    isAdmin = false;
  }
  carregarAnuncios();
});

// Global produtos object
window.produtos = {};
// Lista global de SKUs não cadastrados
window.skusNaoCadastrados = [];
// Escape HTML for safe insertion of text content
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Update product counter
function atualizarContador() {
  const el = document.getElementById('contador-produtos');
  if (!el) return;
  const count = Object.keys(window.produtos).length;
  el.textContent = `${count} produto${count !== 1 ? 's' : ''}`;
}

function limparUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  );
}

function parseNumeroBr(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (typeof valor === 'number') return valor;

  let str = valor.toString().trim();
  if (!str) return undefined;

  // Detect the last separator to determine decimal symbol
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  let decimalSeparator = '';
  if (lastComma > lastDot) decimalSeparator = ',';
  else if (lastDot > lastComma) decimalSeparator = '.';

  // Remove thousands separators and normalize decimal separator to '.'
  if (decimalSeparator === ',') {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (decimalSeparator === '.') {
    str = str.replace(/,/g, '');
  }

  str = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? undefined : num;
}

function formatarData(valor) {
  if (!valor) return undefined;
  const d = new Date(valor);
  return isNaN(d) ? undefined : d.toISOString().slice(0, 10);
}

const COL_ALIASES = {
  idProduto: [
    'ID do Item',
    'Item ID',
    'ID do Produto',
    'Produto ID',
    'idproduto',
  ],
  skuReferencia: [
    'SKU de referência',
    'SKU de Referência',
    'SKU de referencia',
    'SKU Principal',
    'Parent SKU',
  ],
  idVariacao: [
    'ID da Variação',
    'Variante Identificador',
    'ID SKU',
    'SKU ID',
    'Variation ID',
  ],
  skuVariacao: ['SKU da Variação', 'SKU', 'SKU da Variacao', 'Variation SKU'],
  nomeProduto: ['Nome do Produto', 'Produto', 'Product name'],
  variacao: ['Variação', 'Atributos', 'Variation'],
  categoria: ['Categoria', 'Category'],
  dataInicio: ['Período Início', 'Data Início', 'Start Date', 'Periodo Inicio'],
  dataFim: ['Período Fim', 'Data Fim', 'End Date', 'Periodo Fim'],
  visitantes: [
    'Visitantes do produto',
    'Visitantes',
    'Unique visitors',
    'Visitantes únicos',
  ],
  visualizacoes: [
    'Visualizações',
    'Views',
    'Page Views',
    'Visualizações da Página do Produto',
  ],
  impressoes: ['Impressões', 'Impressions'],
  cliques: ['Cliques', 'Clicks'],
  ctr: ['CTR', 'Taxa de cliques'],
  vendas: ['Vendas', 'Itens vendidos', 'Unidades vendidas'],
  pedidos: ['Pedidos', 'Orders'],
  taxaConversao: ['Taxa de conversão', 'Conversion rate'],
  receitaBruta: ['Receita Bruta', 'Receita', 'Gross Sales'],
  descontos: ['Descontos', 'Cupons', 'Coupons'],
  receitaLiquida: ['Receita Líquida', 'Net Sales'],
  estoqueVendedor: ['Estoque do vendedor', 'Estoque', 'Seller stock'],
  precoAtual: ['Preço', 'Preço atual', 'Price'],
  gastosAds: ['Gasto em anúncios', 'Ads cost', 'Cost'],
  roas: ['ROAS'],
  cpc: ['CPC'],
  cpa: ['CPA'],
  statusItem: ['Status Atual do Item', 'Status do Item', 'Status'],
};

// Process spreadsheets
window.processarPlanilha = function (file, tipo) {
  const user = auth.currentUser;
  if (!user) return alert('Você precisa estar logado.');

  const uid = user.uid;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const workbook = XLSX.read(e.target.result, { type: 'binary' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (tipo === 'desempenho') {
      const escolha = prompt(
        'Digite 1 para usar um dia único ou 2 para especificar um período',
      );
      if (escolha === '2') {
        const inicio = prompt(
          '📅 Data inicial do período (AAAA-MM-DD)',
          new Date().toISOString().slice(0, 10),
        );
        const fim = prompt(
          '📅 Data final do período (AAAA-MM-DD)',
          new Date().toISOString().slice(0, 10),
        );
        window.dataDesempenhoReferencia = `${inicio}_ate_${fim}`;
      } else {
        const dataReferencia = prompt(
          '📅 Qual a data de referência desses dados de desempenho? (formato: AAAA-MM-DD)',
          new Date().toISOString().slice(0, 10),
        );
        window.dataDesempenhoReferencia = dataReferencia;
      }
    }
    const normalizeKey = (str) =>
      str.toString().toLowerCase().normalize('NFD').replace(/[^\w]/g, '');
    let ultimoId = null;
    let ultimaVariacao = null;
    for (const linha of dados) {
      const map = {};
      for (const [k, v] of Object.entries(linha)) {
        map[normalizeKey(k)] = v;
      }
      const get = (...keys) => {
        for (const key of keys) {
          const val = map[normalizeKey(key)];
          if (val !== undefined && val !== '') return val;
        }
        return undefined;
      };
      const getAlias = (campo) => get(...(COL_ALIASES[campo] || []));

      let id = getAlias('idProduto');
      if (!id) id = ultimoId;
      const skuRef = getAlias('skuReferencia');
      let varianteId = getAlias('idVariacao') || getAlias('skuVariacao');
      if (!varianteId) varianteId = ultimaVariacao;

      if (!id && skuRef) {
        const skuNorm = String(skuRef).trim();
        id = Object.keys(window.produtos).find((pid) => {
          const prod = window.produtos[pid];
          return (
            prod.skuReferencia && String(prod.skuReferencia).trim() === skuNorm
          );
        });
        if (!id) {
          try {
            const q = query(
              collection(db, `uid/${uid}/anuncios`),
              where('skuReferencia', '==', skuNorm),
              limit(1),
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              id = snap.docs[0].id;
            }
          } catch (err) {
            console.error(`Erro ao buscar SKU ${skuNorm}:`, err);
          }
        }
      }
      if (!id) {
        logger.warn(`❌ Linha de ${tipo} sem ID do Produto.`, linha);
        continue;
      }
      id = String(id).trim();
      if (id !== ultimoId) {
        ultimoId = id;
        ultimaVariacao = null;
      }

      if (!varianteId) {
        if (tipo === 'desempenho') {
          logger.warn(
            `❌ Linha de desempenho sem ID da Variação para item ${id}.`,
          );
          continue;
        }
        varianteId = 'unico_' + id;
      }
      varianteId = String(varianteId).trim();
      ultimaVariacao = varianteId;

      // Criar estrutura do produto pai
      if (!window.produtos[id]) {
        // Apenas a planilha de informações básicas pode cadastrar novos anúncios
        if (tipo !== 'basica') {
          try {
            const docRef = doc(db, `uid/${uid}/anuncios`, id);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
              showNotification(
                `Anúncio ${id} não cadastrado. Use a planilha de Informações Básicas para cadastrá-lo.`,
                'warning',
              );
              continue;
            }
          } catch (err) {
            console.error(`Erro ao verificar anúncio ${id}:`, err);
            continue;
          }
        }

        window.produtos[id] = {
          id,
          uid,
          variantes: {},
        };
      }

      const p = window.produtos[id];
      if (skuRef) p.skuReferencia = skuRef;
      if (!p.variantes[varianteId]) p.variantes[varianteId] = { varianteId };

      const v = p.variantes[varianteId];
      if (skuRef) v.skuReferencia = skuRef;

      const nomeLinha = getAlias('nomeProduto');
      if (nomeLinha && !p.nome) p.nome = nomeLinha.toString().trim();
      // Separar por tipo de planilha
      switch (tipo) {
        case 'desempenho':
          v.dataReferencia = window.dataDesempenhoReferencia;
          v.idProduto = id;
          v.skuReferencia = (skuRef || v.skuReferencia || p.skuReferencia || '')
            .toString()
            .trim();
          v.skuVariacao = (getAlias('skuVariacao') || v.skuVariacao || '')
            .toString()
            .trim();
          const nomePlanilha = nomeLinha
            ? nomeLinha.toString().trim()
            : undefined;
          if (nomePlanilha) {
            p.nome = p.nome || nomePlanilha;
            v.nomeProduto = nomePlanilha;
          } else {
            v.nomeProduto = p.nome ? p.nome.toString().trim() : undefined;
          }
          const variacaoNome = getAlias('variacao');
          if (variacaoNome) v.variacao = variacaoNome.toString().trim();
          const categoria = getAlias('categoria');
          if (categoria) p.categoria = categoria.toString().trim();
          v.categoria = p.categoria;
          v.dataInicio = formatarData(getAlias('dataInicio'));
          v.dataFim = formatarData(getAlias('dataFim'));
          v.visitantes = parseNumeroBr(getAlias('visitantes'));
          v.visualizacoes = parseNumeroBr(getAlias('visualizacoes'));
          v.impressoes = parseNumeroBr(getAlias('impressoes'));
          v.cliques = parseNumeroBr(getAlias('cliques'));
          v.ctr = parseNumeroBr(getAlias('ctr'));
          v.pedidos = parseNumeroBr(getAlias('pedidos'));
          v.vendas = parseNumeroBr(getAlias('vendas'));
          v.taxaConversao = parseNumeroBr(getAlias('taxaConversao'));
          v.receitaBruta = parseNumeroBr(getAlias('receitaBruta'));
          v.descontos = parseNumeroBr(getAlias('descontos'));
          v.receitaLiquida = parseNumeroBr(getAlias('receitaLiquida'));
          v.estoqueVendedor = parseNumeroBr(getAlias('estoqueVendedor'));
          v.precoAtual = parseNumeroBr(getAlias('precoAtual'));
          v.gastosAds = parseNumeroBr(getAlias('gastosAds'));
          v.roas = parseNumeroBr(getAlias('roas'));
          v.cpc = parseNumeroBr(getAlias('cpc'));
          v.cpa = parseNumeroBr(getAlias('cpa'));
          v.statusItem = getAlias('statusItem');
          if (v.statusItem) v.statusItem = v.statusItem.toString().trim();
          if (v.ctr === undefined && v.cliques !== undefined && v.impressoes) {
            v.ctr = v.impressoes ? v.cliques / v.impressoes : undefined;
          }
          if (
            v.taxaConversao === undefined &&
            v.vendas !== undefined &&
            v.visitantes
          ) {
            v.taxaConversao = v.visitantes
              ? v.vendas / v.visitantes
              : undefined;
          }
          if (
            v.roas === undefined &&
            v.receitaBruta !== undefined &&
            v.gastosAds
          ) {
            v.roas = v.gastosAds ? v.receitaBruta / v.gastosAds : undefined;
          }
          break;

        case 'vendas':
          // ID do Produto já foi usado como chave (variável `id`)
          // e `varianteId` identifica cada variação.
          p.nome = get('Nome do Produto') || p.nome;
          p.skuReferencia = p.skuReferencia || skuRef;

          // Registrar campos principais da variação
          v.varianteId = varianteId;
          v.varianteIdentificador = varianteId;
          v.skuReferencia = p.skuReferencia;
          v.sku = get('SKU', 'sku', 'Código da Variação');
          v.skuVariante = v.sku; // compatibilidade
          v.nome = get('Nome', 'Nome da Variação', 'Variação', 'Modelo') || '';
          v.nomeVariante = v.nome; // compatibilidade
          v.preco = parseFloat(
            get('Preço', 'preco', 'Valor', 'Valor da Variação') || 0,
          );
          v.estoqueVendedor = parseInt(
            get('Estoque do vendedor', 'Estoque') || 0,
          );
          v.estoque = v.estoqueVendedor; // compatibilidade
          v.idProduto = id;
          v.gtin = get('GTIN (EAN)', 'gtin', 'Código EAN');

          if (varianteId.startsWith('unico_')) {
            p.sku = v.sku;
            p.preco = v.preco;
            p.estoqueVendedor = v.estoqueVendedor;
            p.gtin = v.gtin;
          } else {
            delete p.variantes['unico_' + id];
          }
          break;

        case 'basica':
          p.nome = get('Nome do Produto') || p.nome;
          p.descricao = get('Descrição do Produto');
          p.skuReferencia = p.skuReferencia || skuRef;
          break;

        case 'frete':
          p.skuReferencia = p.skuReferencia || skuRef;
          p.peso = parseNumeroBr(get('Peso (kg)', 'Peso do Produto/kg'));
          p.comprimento = parseNumeroBr(get('Comprimento (cm)', 'Comprimento'));
          p.largura = parseNumeroBr(get('Largura (cm)', 'Largura'));
          p.altura = parseNumeroBr(get('Altura (cm)', 'Altura'));
          p.taxaFrete = parseNumeroBr(
            get(
              'Taxa de frete (R$)',
              'Taxa de frete',
              'taxaFrete (R$)',
              'taxaFrete',
            ),
          );
          break;

        case 'midia': {
          p.skuReferencia = p.skuReferencia || skuRef;
          p.categoria = get('Categoria');
          p.tabelaMedidas = get('Template da Tabela de Medidas');
          p.nomeVariacao = get('Nome da Variação 1');
          p.opcoesVariacao = Object.keys(linha)
            .filter((k) => k.startsWith('Opção'))
            .map((k) => linha[k])
            .filter(Boolean);

          const urls = [];
          const pushUrls = (val) => {
            if (val === undefined || val === null) return;
            const tokens = String(val)
              .split(/[\s,;]+/)
              .map((s) => s.trim())
              .filter((s) => s && !/^(-|n\/?a)$/i.test(s));
            urls.push(...tokens);
          };

          pushUrls(get('Imagem de capa', 'Cover Image'));
          for (const [col, val] of Object.entries(linha)) {
            if (/imagem/i.test(col) && !/capa/i.test(col)) {
              pushUrls(val);
            }
          }

          if (urls.length) {
            if (varianteId.startsWith('unico_')) {
              if (!p.imagemCapa) p.imagemCapa = urls[0];
              p.galeria = urls;
            } else {
              v.imagemUrl = urls[0];
            }
          }
          break;
        }
      }
    }

    alert(`✅ Planilha ${tipo.toUpperCase()} processada com sucesso!`);
  };
  reader.readAsBinaryString(file);
};

// Save to Firebase com suporte a variantes
window.salvarNoFirebase = async () => {
  const total = Object.keys(window.produtos).length;
  if (total === 0) {
    showNotification('⚠️ Nenhum dado para salvar.', 'warning');
    return;
  }

  let atualizados = 0;
  const loadingMsg = showNotification(
    '⏳ Salvando dados no Firebase...',
    'info',
    true,
  );

  try {
    const user = auth.currentUser;
    const pass = getEffectivePass(user.uid);

    for (const [id, produto] of Object.entries(window.produtos)) {
      const docPath = `uid/${user.uid}/anuncios`;
      const docRef = doc(db, docPath, id); // <-- cria a ref crua
      const rawSnap = await getDoc(docRef); // <-- lê o doc sem criptografia
      const dadosAntigos = await loadSecureDoc(db, docPath, id, pass); // <-- tenta descriptografar
      const docExiste = rawSnap.exists(); // <-- existência real do doc

      // Se o doc existe mas a descriptografia falhou, a senha está errada.
      // Evita sobrescrever com outra chave.
      if (docExiste && !dadosAntigos) {
        showNotification(
          '🔒 Senha incorreta para este anúncio. Atualização ignorada.',
          'error',
        );
        continue;
      }

      let dadosCompletos = { ...produto };
      let salvarPai = true;
      let registrarHistorico = false;

      // Remove variantes do objeto pai antes da comparação
      const variantes = dadosCompletos.variantes || {};
      delete dadosCompletos.variantes;

      if (docExiste) {
        if (dadosAntigos.uid && dadosAntigos.uid !== user.uid && !isAdmin) {
          continue;
        }

        dadosCompletos = { ...dadosAntigos, ...dadosCompletos };
        ['precoIdeal', 'precoMinimo', 'precoSemLucro'].forEach((campo) => {
          if (dadosAntigos && dadosAntigos[campo] !== undefined) {
            dadosCompletos[campo] = dadosAntigos[campo];
          }
        });

        if (objetosIguais(dadosAntigos, dadosCompletos)) {
          salvarPai = false;
        } else {
          registrarHistorico = Object.keys(dadosAntigos).some(
            (chave) =>
              !objetosIguais(dadosAntigos[chave], dadosCompletos[chave]),
          );
        }
      }

      // 🔹 Salvar documento principal
      if (salvarPai) {
        dadosCompletos.uid = dadosCompletos.uid || user.uid;
        await saveSecureDoc(
          db,
          `uid/${user.uid}/anuncios`,
          id,
          limparUndefined(dadosCompletos),
          pass,
        );
        if (registrarHistorico) {
          await addDoc(collection(db, `uid/${user.uid}/atualizacoes`), {
            id,
            uid: dadosCompletos.uid,
            dataHora: new Date().toISOString(),
            dadosAntigos,
            dadosNovos: dadosCompletos,
          });
        }

        atualizados++;
      }

      // 🔸 Salvar variações
      for (const [varianteId, variante] of Object.entries(variantes)) {
        if (variante.dataReferencia) {
          if (docExiste) {
            const { dataReferencia, ...metricas } = variante;
            const desempenhoPath = `uid/${user.uid}/anuncios/${id}/desempenho`;
            const antigo =
              (await loadSecureDoc(db, desempenhoPath, dataReferencia, pass)) ||
              {};
            const novo = { ...antigo, ...metricas };
            if (!objetosIguais(antigo, novo)) {
              await saveSecureDoc(
                db,
                desempenhoPath,
                dataReferencia,
                limparUndefined(novo),
                pass,
              );
            }
            if (
              metricas.precoAtual !== undefined ||
              metricas.estoqueVendedor !== undefined
            ) {
              const variantesPath = `uid/${user.uid}/anuncios/${id}/variantes`;
              const antigoVar =
                (await loadSecureDoc(db, variantesPath, varianteId, pass)) ||
                {};
              const novoVar = { ...antigoVar };
              if (metricas.precoAtual !== undefined)
                novoVar.precoAtual = metricas.precoAtual;
              if (metricas.estoqueVendedor !== undefined)
                novoVar.estoqueVendedor = metricas.estoqueVendedor;
              if (!objetosIguais(antigoVar, novoVar)) {
                await saveSecureDoc(
                  db,
                  variantesPath,
                  varianteId,
                  limparUndefined(novoVar),
                  pass,
                );
              }
            }
          } else {
            logger.warn(
              `❌ Desempenho ignorado - anúncio ${id} não existe no Firebase.`,
            );
          }
        } else {
          const variantesPath = `uid/${user.uid}/anuncios/${id}/variantes`;
          const antigo =
            (await loadSecureDoc(db, variantesPath, varianteId, pass)) || {};
          const novo = { ...antigo, ...variante };
          if (!objetosIguais(antigo, novo)) {
            await saveSecureDoc(
              db,
              variantesPath,
              varianteId,
              limparUndefined(novo),
              pass,
            );
          }
        }
      }
    }

    window.produtos = {};
    atualizarContador();
    loadingMsg.remove();
    showNotification(
      `✅ ${atualizados} anúncio(s) salvos/atualizados no Firebase!`,
      'success',
    );
  } catch (error) {
    console.error('Erro ao salvar no Firebase:', error);
    loadingMsg.remove();
    showNotification(`❌ Erro ao salvar: ${error.message}`, 'error');
  }
};

// Helper functions
function objetosIguais(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;

  const chavesA = Object.keys(a).sort();
  const chavesB = Object.keys(b).sort();
  if (chavesA.length !== chavesB.length) return false;

  return chavesA.every((k) => objetosIguais(a[k], b[k]));
}

function showNotification(message, type = 'info', persistent = false) {
  const notification = document.createElement('div');
  notification.className = `fixed bottom-4 right-4 px-4 py-4 rounded-lg shadow-lg text-white ${
    type === 'success'
      ? 'bg-green-500'
      : type === 'error'
        ? 'bg-red-500'
        : type === 'warning'
          ? 'bg-yellow-500'
          : 'bg-blue-500'
  }`;
  notification.innerHTML = `
        <div class="flex items-center">
          <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} mr-2"></i>
          <span>${message}</span>
        </div>
      `;

  document.body.appendChild(notification);

  if (!persistent) {
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  return notification;
}

// Tab navigation
document.querySelectorAll('.tab-button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document
      .querySelectorAll('.tab-button')
      .forEach((b) => b.classList.remove('active'));
    document
      .querySelectorAll('.tab-content')
      .forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'anuncios') {
      carregarAnuncios();
    }
  });
});

// Paginação de anúncios
const PAGE_SIZE = 20;
let currentPage = 0;
let pageCursors = [null];

// Load produtos com paginação
window.carregarAnuncios = async function (direction) {
  const tbody = document.querySelector('#tabelaAnuncios tbody');
  if (!tbody) {
    logger.warn('Elemento #tabelaAnuncios tbody não encontrado.');
    return;
  }
  tbody.innerHTML =
    '<tr><td colspan="7" class="text-center py-8">Carregando anúncios...</td></tr>';

  try {
    if (direction === 'next') {
      currentPage++;
    } else if (direction === 'prev') {
      currentPage = Math.max(0, currentPage - 1);
    } else {
      currentPage = 0;
      pageCursors = [null];
    }
    const user = auth.currentUser;
    let baseRef;
    if (!isAdmin) {
      baseRef = collection(db, `uid/${user.uid}/anuncios`);
    } else {
      baseRef = collectionGroup(db, 'anuncios');
    }
    const cursor = pageCursors[currentPage];
    let q;
    if (cursor) {
      q = query(
        baseRef,
        orderBy('__name__'),
        startAfter(cursor),
        limit(PAGE_SIZE),
      );
    } else {
      q = query(baseRef, orderBy('__name__'), limit(PAGE_SIZE));
    }
    const querySnapshot = await getDocs(q);
    tbody.innerHTML = '';
    const nextBtn = document.getElementById('nextPage');
    const prevBtn = document.getElementById('prevPage');
    const info = document.getElementById('pageInfo');
    if (querySnapshot.empty) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center py-8">Nenhum anúncio encontrado</td></tr>';
      if (nextBtn) nextBtn.disabled = true;
      if (prevBtn) prevBtn.disabled = currentPage === 0;
      if (info) info.textContent = `Página ${currentPage + 1}`;
      return;
    }
    pageCursors[currentPage + 1] =
      querySnapshot.docs[querySnapshot.docs.length - 1];
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = querySnapshot.docs.length < PAGE_SIZE;
    if (info) info.textContent = `Página ${currentPage + 1}`;

    for (const doc of querySnapshot.docs) {
      const id = doc.id;
      const ownerUid = doc.data().uid || user.uid;
      const basePath = doc.ref.parent.path;
      const pass = getEffectivePass(ownerUid);
      const data = (await loadSecureDoc(db, basePath, id, pass)) || {};
      if (!isAdmin && data.uid && data.uid !== user.uid) {
        continue;
      }

      // 🔄 Buscar subcoleção de variantes
      const variantesRef = collection(db, `${basePath}/${id}/variantes`);
      const snap = await getDocs(variantesRef);
      let variantes = [];

      if (!snap.empty) {
        const docs = await Promise.all(
          snap.docs.map((v) =>
            loadSecureDoc(db, `${basePath}/${id}/variantes`, v.id, pass),
          ),
        );
        variantes = docs.filter(Boolean);
      }

      if (variantes.length === 0) variantes = [{}];

      // 🔍 Verificar se alguma variação está abaixo do preço mínimo ou tem SKU não cadastrado
      for (const v of variantes) {
        const sku = v.skuVariante || data.skuVariante || data.sku;
        if (!sku) continue;

        try {
          const refProd = collection(db, `uid/${ownerUid}/produtos`);
          const qProd = query(refProd, where('sku', '==', sku));
          const snapshotProd = await getDocs(qProd);

          if (!snapshotProd.empty) {
            const docProd = snapshotProd.docs[0].data();
            const precoMinimo = parseFloat(docProd.precoMinimo || 0);
            const precoVar = parseFloat(v.preco || 0);

            if (precoVar > 0 && precoVar < precoMinimo) {
              v.alertaPreco = true;
              v.precoMinimo = precoMinimo;
            }
          } else {
            // 🚨 SKU não encontrado na base de produtos
            v.skuNaoEncontrado = true;
            const skuLower = String(sku);
            if (!window.skusNaoCadastrados.includes(skuLower)) {
              window.skusNaoCadastrados.push(skuLower);
            }
          }
        } catch (e) {
          logger.warn(`Erro ao buscar SKU ${sku} em produtos:`, e);
          v.skuNaoEncontrado = true; // fallback de segurança
          const skuLower = String(sku);
          if (!window.skusNaoCadastrados.includes(skuLower)) {
            window.skusNaoCadastrados.push(skuLower);
          }
        }
      }

      // 🔄 Buscar últimos 7 dias da subcoleção desempenho
      const desempenhoRef = collection(db, `${basePath}/${id}/desempenho`);
      const desempenhoQuery = query(
        desempenhoRef,
        orderBy('__name__', 'desc'),
        limit(7),
      );
      const desempenhoSnap = await getDocs(desempenhoQuery);

      let acumulado = {
        visualizacoes: 0,
        curtidas: 0,
        vendasPago: 0,
        unidadesPago: 0,
        conversaoPago: 0,
        taxaRejeicao: 0,
      };
      let count = 0;
      function parseNumero(valor) {
        if (!valor) return 0;
        return (
          parseFloat(valor.toString().replace(',', '.').replace('%', '')) || 0
        );
      }
      desempenhoSnap.forEach((doc) => {
        const d = doc.data();
        acumulado.visualizacoes += Number(d.visualizacoes || 0);
        acumulado.curtidas += Number(d.curtidas || 0);
        acumulado.vendasPago += Number(d.vendasPago || 0);
        acumulado.unidadesPago += Number(d.unidadesPago || 0);
        acumulado.conversaoPago += parseNumero(d.conversaoPago);
        acumulado.taxaRejeicao += parseNumero(d.taxaRejeicao);
        count++;
      });

      const mediaDesempenho = {
        visualizacoes: count ? Math.round(acumulado.visualizacoes / count) : 0,
        curtidas: count ? Math.round(acumulado.curtidas / count) : 0,
        vendasPago: count ? (acumulado.vendasPago / count).toFixed(2) : '0.00',
        unidadesPago: count ? Math.round(acumulado.unidadesPago / count) : 0,
        conversaoPago: count
          ? (acumulado.conversaoPago / count).toFixed(2)
          : '0.00',
        taxaRejeicao: count
          ? (acumulado.taxaRejeicao / count).toFixed(2)
          : '0.00',
      };

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50';

      let variacoesHTML = variantes
        .map((v) => {
          const nome = v.nomeVariante || v.skuVariante || v.varianteId;
          const preco = v.preco ? `R$ ${parseFloat(v.preco).toFixed(2)}` : '';

          const alertaPreco = v.alertaPreco
            ? `<span class="badge badge-danger ml-2">Abaixo do mínimo (R$ ${v.precoMinimo.toFixed(2)})</span>`
            : '';

          const alertaSku = v.skuNaoEncontrado
            ? '<span class="badge badge-warning ml-2">SKU não cadastrado</span>'
            : '';

          return `<li class="text-xs text-gray-700">↳ ${nome} — ${preco} ${alertaPreco} ${alertaSku}</li>`;
        })
        .join('');

      const precosValidos = variantes
        .map((v) => parseFloat(v.preco))
        .filter((p) => !isNaN(p));
      const precoMedio = precosValidos.length
        ? (
            precosValidos.reduce((a, b) => a + b, 0) / precosValidos.length
          ).toFixed(2)
        : (parseFloat(data.preco) || 0).toFixed(2);

      const estoqueTotal = variantes.reduce(
        (soma, v) => soma + parseInt(v.estoque || 0),
        0,
      );
      const estoqueStatus =
        estoqueTotal < 10
          ? 'danger'
          : estoqueTotal < 30
            ? 'warning'
            : 'success';
      const conversao = parseFloat(mediaDesempenho.conversaoPago || 0);
      const conversaoStatus =
        conversao < 2 ? 'danger' : conversao < 5 ? 'warning' : 'success';

      tr.innerHTML = `
        <td class="px-4 py-2 font-mono text-sm">${id}</td>
        <td class="px-4 py-2">
          ${data.imagemCapa ? `<img src="${data.imagemCapa}" class="w-16 h-16 object-contain rounded border">` : '<div class="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16"></div>'}
        </td>
        <td class="px-4 py-2">
          <div class="font-medium text-gray-900">${data.nome || 'Sem nome'}</div>
          <div class="text-gray-500 text-sm">${data.categoria || 'Sem categoria'}</div>
          <ul class="mt-2">${variacoesHTML}</ul>
        </td>
    <td class="px-4 py-2"><div class="font-semibold">R$ ${precoMedio}</div></td>
        <td class="px-4 py-2">R$ ${data.taxaFrete || '0.00'}</td>
        <td class="px-4 py-2"><span class="badge badge-${estoqueStatus}">${estoqueTotal} un</span></td>
        <td class="px-4 py-2"><span class="badge badge-${conversaoStatus}">${conversao}%</span></td>
        <td class="px-4 py-2">R$ ${mediaDesempenho.vendasPago || '0.00'}</td>
        <td class="px-4 py-2 whitespace-nowrap">
          <button onclick="verDetalhesAnuncio('${id}','${ownerUid}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-2 rounded text-sm">
            <i class="fas fa-eye mr-1"></i>Ver Detalhes
          </button>
        </td>
      `;
      tr.setAttribute('data-id', id);
      tr.setAttribute('data-nome', (data.nome || '').toLowerCase());
      tr.setAttribute(
        'data-sku',
        (variantes.map((v) => v.skuVariante).join(' ') || '').toLowerCase(),
      );
      tr.setAttribute('data-preco', precoMedio);
      tr.setAttribute('data-frete', data.taxaFrete || 0);
      tr.setAttribute('data-estoque', estoqueTotal);
      tr.setAttribute('data-conversao', conversao);
      tr.setAttribute('data-vendas', mediaDesempenho.vendasPago || 0);
      tr.setAttribute(
        'data-alerta',
        variantes.some((v) => v.alertaPreco) ? '1' : '0',
      );
      tr.setAttribute(
        'data-skuinvalido',
        variantes.some((v) => v.skuNaoEncontrado) ? '1' : '0',
      );
      tr.setAttribute('data-owner', ownerUid);

      tbody.appendChild(tr);
    } // ✅ FECHAMENTO DO `for`
  } catch (error) {
    console.error('Erro ao carregar anúncios:', error);
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center py-8 text-red-500">Erro ao carregar dados</td></tr>';
  }
};

window.verDetalhesAnuncio = async function (
  id,
  ownerUid = auth.currentUser?.uid,
) {
  try {
    const user = auth.currentUser;
    const pass = getEffectivePass(ownerUid);
    const data = await loadSecureDoc(db, `uid/${ownerUid}/anuncios`, id, pass);

    if (!data) {
      showNotification('❌ Anúncio não encontrado', 'error');
      return;
    }

    if (!isAdmin && data.uid && data.uid !== user.uid) {
      showNotification('❌ Acesso negado', 'error');
      return;
    }

    // 🔍 Buscar variantes
    const variantesRef = collection(
      db,
      `uid/${ownerUid}/anuncios/${id}/variantes`,
    );
    const variantesSnap = await getDocs(variantesRef);
    let variantes = [];
    if (!variantesSnap.empty) {
      const passVar = getEffectivePass(ownerUid);
      const docs = await Promise.all(
        variantesSnap.docs.map((v) =>
          loadSecureDoc(
            db,
            `uid/${ownerUid}/anuncios/${id}/variantes`,
            v.id,
            passVar,
          ),
        ),
      );
      variantes = docs.filter(Boolean);
    }
    // 🔍 Buscar média dos últimos 7 dias da subcoleção de desempenho
    const desempenhoRef = collection(
      db,
      `uid/${ownerUid}/anuncios/${id}/desempenho`,
    );
    const desempenhoSnap = await getDocs(desempenhoRef);
    let desempenho = {};

    if (!desempenhoSnap.empty) {
      const hoje = new Date();
      const diasValidos = [...Array(7)].map((_, i) => {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() - i);
        return d.toISOString().slice(0, 10);
      });

      const docsValidos = desempenhoSnap.docs.filter((doc) =>
        diasValidos.includes(doc.id),
      );
      const acumulado = {
        visualizacoes: 0,
        curtidas: 0,
        vendasPago: 0,
        unidadesPago: 0,
        conversaoPago: 0,
        taxaRejeicao: 0,
      };
      function parseNumero(valor) {
        if (!valor) return 0;
        return (
          parseFloat(valor.toString().replace(',', '.').replace('%', '')) || 0
        );
      }
      docsValidos.forEach((d) => {
        const v = d.data();
        acumulado.visualizacoes += Number(v.visualizacoes || 0);
        acumulado.curtidas += Number(v.curtidas || 0);
        acumulado.vendasPago += Number(v.vendasPago || 0);
        acumulado.unidadesPago += Number(v.unidadesPago || 0);
        const convStr = (v.conversaoPago || '0')
          .toString()
          .replace(',', '.')
          .replace('%', '');
        acumulado.conversaoPago += parseFloat(convStr) || 0;

        const taxaStr = (v.taxaRejeicao || '0')
          .toString()
          .replace(',', '.')
          .replace('%', '');
        acumulado.taxaRejeicao += parseFloat(taxaStr) || 0;
      });

      const divisor = docsValidos.length || 1;
      desempenho = {
        visualizacoes: Math.round(acumulado.visualizacoes / divisor),
        curtidas: Math.round(acumulado.curtidas / divisor),
        vendasPago: (acumulado.vendasPago / divisor).toFixed(2),
        unidadesPago: Math.round(acumulado.unidadesPago / divisor),
        conversaoPago: (acumulado.conversaoPago / divisor).toFixed(2),
        taxaRejeicao: (acumulado.taxaRejeicao / divisor).toFixed(2),
      };
    }

    let container = document.getElementById('detalhesProduto');
    if (!container) {
      // se o modal ainda não existe, cria uma estrutura básica para exibição
      const modal = document.createElement('div');
      modal.id = 'modalDetalhes';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content w-full max-w-3xl">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold"><i class="fas fa-info-circle mr-2 text-blue-500"></i>Detalhes do Produto</h3>
            <button onclick="fecharModal('modalDetalhes')" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div id="detalhesProduto" class="space-y-4"></div>
        </div>`;
      document.body.appendChild(modal);
      container = modal.querySelector('#detalhesProduto');
    }

    // 🔸 Tabela de variantes
    let variantesHtml = '';
    if (variantes.length > 0) {
      variantesHtml = `
        <h5 class="font-bold mt-6 mb-2"><i class="fas fa-layer-group mr-2"></i>Variações</h5>
        <table class="w-full text-sm bg-white border rounded">
          <thead class="bg-gray-100">
            <tr>
              <th class="p-2 border">Variante</th>
              <th class="p-2 border">Preço</th>
              <th class="p-2 border">Estoque</th>
              <th class="p-2 border">Conversão</th>
              <th class="p-2 border">SKU</th>
            </tr>
          </thead>
          <tbody>
            ${variantes
              .map(
                (v) => `
              <tr class="text-center">
                <td class="p-2 border">${v.nomeVariante || '-'}</td>
                <td class="p-2 border">R$ ${v.preco ? parseFloat(v.preco).toFixed(2) : '0.00'}</td>
                <td class="p-2 border">${v.estoque || 0} un</td>
                <td class="p-2 border">${v.conversaoPago || '0'}%</td>
                <td class="p-2 border">${v.skuVariante || '-'}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    // 🔹 Dados principais
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-1">
          ${
            data.imagemCapa
              ? `<img src="${data.imagemCapa}" class="w-full h-auto rounded-lg border shadow">`
              : '<div class="bg-gray-200 border-2 border-dashed rounded-xl w-full h-48 flex items-center justify-center text-gray-500"><i class="fas fa-image fa-3x"></i></div>'
          }
        </div>
        
        <div class="md:col-span-2">
          <h4 class="text-lg font-bold">${data.nome || 'Sem nome'}</h4>
          <div class="text-gray-600 mb-2">ID: ${data.id || id}</div>
          
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-gray-50 p-3 rounded">
              <div class="text-sm text-gray-500">Preço</div>
              <div class="text-lg font-bold">R$ ${data.preco ? parseFloat(data.preco).toFixed(2) : '0.00'}</div>
            </div>
            <div class="bg-gray-50 p-3 rounded">
              <div class="text-sm text-gray-500">Frete</div>
              <div class="text-lg font-bold">R$ ${data.taxaFrete || '0.00'}</div>
            </div>
            <div class="bg-gray-50 p-3 rounded">
              <div class="text-sm text-gray-500">Estoque</div>
              <div class="text-lg font-bold">${data.estoque || '0'} un</div>
            </div>
            <div class="bg-gray-50 p-3 rounded">
              <div class="text-sm text-gray-500">Conversão</div>
              <div class="text-lg font-bold">${desempenho.conversaoPago || data.conversaoPago || '0.00'}%</div>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t pt-4">
        <h5 class="font-bold mb-2"><i class="fas fa-file-alt mr-2"></i>Descrição</h5>
        <div class="bg-gray-50 p-4 rounded border">
          ${data.descricao ? data.descricao.replace(/\n/g, '<br>') : 'Sem descrição'}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h5 class="font-bold mb-2"><i class="fas fa-chart-line mr-2"></i>Desempenho</h5>
          <div class="bg-gray-50 p-4 rounded border text-sm space-y-2">
            <div><span class="font-medium">Visualizações:</span> ${desempenho.visualizacoes || data.visualizacoes || '0'}</div>
            <div><span class="font-medium">Curtidas:</span> ${desempenho.curtidas || data.curtidas || '0'}</div>
            <div><span class="font-medium">Vendas (Pago):</span> R$ ${desempenho.vendasPago || data.vendasPago || '0.00'}</div>
            <div><span class="font-medium">Unidades Vendidas:</span> ${desempenho.unidadesPago || data.unidadesPago || '0'}</div>
            <div><span class="font-medium">Taxa de Rejeição:</span> ${desempenho.taxaRejeicao || data.taxaRejeicao || '0.00'}%</div>
          </div>
        </div>
        
        <div>
          <h5 class="font-bold mb-2"><i class="fas fa-cube mr-2"></i>Especificações</h5>
          <div class="bg-gray-50 p-4 rounded border text-sm space-y-2">
            <div><span class="font-medium">Peso:</span> ${data.peso || '0'} kg</div>
            <div><span class="font-medium">Dimensões:</span> ${data.comprimento || '0'} x ${data.largura || '0'} x ${data.altura || '0'} cm</div>
            <div><span class="font-medium">SKU:</span> ${data.skuVariante || ''}</div>
            <div><span class="font-medium">Categoria:</span> ${data.categoria || ''}</div>
            <div><span class="font-medium">Data Referência:</span> ${data.dataReferencia || ''}</div>
          </div>
        </div>
      </div>

      ${variantesHtml}

      <div class="flex justify-end space-x-2 mt-4">
        <button onclick="verHistorico('${id}','${data.uid || ownerUid}')" class="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded">
          <i class="fas fa-history mr-2"></i>Ver Histórico
        </button>
        <button onclick="fecharModal('modalDetalhes')" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
          Fechar
        </button>
            <button onclick="gerarTextoAnuncioIA()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
    🧠 Gerar Título/Descrição com IA
  </button>
      <button onclick="otimizarTituloAtual()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
    🔍 Otimizar Título com IA
  </button>
      <button onclick="gerarDiagnosticoIA()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">
  📉 Diagnóstico de Baixo Desempenho
</button>
        <div id="resultadoIA" class="bg-gray-100 border border-gray-300 rounded p-3 mt-3 whitespace-pre-wrap"></div>
      </div>
      <input type="hidden" id="nomeProduto">
<input type="hidden" id="tituloProduto">
<input type="hidden" id="categoriaProduto">
<input type="hidden" id="beneficiosProduto">
<input type="hidden" id="visitasProduto">
<input type="hidden" id="cliquesProduto">
<input type="hidden" id="vendasProduto">
<input type="hidden" id="estoqueProduto">
    `;
    // 🧠 Preencher os campos invisíveis para a IA agora que eles existem no DOM
    document.getElementById('nomeProduto').value = data.nome || '';
    document.getElementById('tituloProduto').value =
      data.titulo || data.nome || '';
    document.getElementById('categoriaProduto').value = data.categoria || '';
    document.getElementById('beneficiosProduto').value = data.descricao || '';
    document.getElementById('visitasProduto').value =
      desempenho.visualizacoes || data.visualizacoes || 0;
    document.getElementById('cliquesProduto').value =
      desempenho.curtidas || data.curtidas || 0;
    document.getElementById('vendasProduto').value =
      desempenho.unidadesPago || data.unidadesPago || 0;
    document.getElementById('estoqueProduto').value = data.estoque || 0;

    document.getElementById('modalDetalhes').style.display = 'flex';
  } catch (error) {
    console.error('Erro ao carregar detalhes:', error);
    showNotification('❌ Erro ao carregar detalhes do produto', 'error');
  }
};

// View history
window.verHistorico = async function (id, ownerUid = auth.currentUser?.uid) {
  const container = document.getElementById('conteudoHistorico');
  container.innerHTML =
    '<div class="text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Carregando histórico...</div>';
  document.getElementById('modalHistorico').style.display = 'flex';

  try {
    const qRef = collection(db, `uid/${ownerUid}/atualizacoes`);

    const q = await getDocs(qRef);
    const historico = [];
    q.forEach((doc) => {
      const h = doc.data();
      if (h.id === id) historico.push(h);
    });

    historico.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

    if (historico.length === 0) {
      container.innerHTML =
        '<div class="text-center py-4 text-gray-500">Nenhum histórico encontrado</div>';
      return;
    }

    container.innerHTML = `
          <div class="mb-4 font-medium">Total de alterações: ${historico.length}</div>
          <div class="space-y-4">
            ${historico
              .map(
                (h) => `
              <div class="border rounded-lg p-4 bg-white">
                <div class="flex justify-between items-center mb-2">
                  <span class="font-semibold">${new Date(h.dataHora).toLocaleString('pt-BR')}</span>
                  <button onclick="this.nextElementSibling.classList.toggle('hidden')" class="text-blue-500 hover:text-blue-700">
                    <i class="fas fa-chevron-down"></i>
                  </button>
                </div>
                <div class="hidden bg-gray-50 p-3 rounded mt-2 text-sm">
                  <pre class="whitespace-pre-wrap">${escapeHTML(JSON.stringify(h.dadosNovos, null, 2))}</pre>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        `;
  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
    container.innerHTML =
      '<div class="text-center py-4 text-red-500">Erro ao carregar histórico</div>';
  }
};

// Close modal
window.fecharModal = function (modalId) {
  document.getElementById(modalId).style.display = 'none';
};

// Generate suggestions
window.gerarSugestoes = async function () {
  const container = document.getElementById('sugestoesIA');
  container.innerHTML =
    '<div class="text-center py-8"><i class="fas fa-spinner fa-spin mr-2"></i>Analisando anúncios...</div>';

  try {
    const user = auth.currentUser;
    let q;
    if (!isAdmin) {
      q = collection(db, `uid/${user.uid}/anuncios`);
    } else {
      q = collectionGroup(db, 'anuncios');
    }
    const querySnapshot = await getDocs(q);
    const sugestoes = [];

    for (const doc of querySnapshot.docs) {
      const ownerUid = doc.data().uid || user.uid;
      const pass = getEffectivePass(ownerUid);
      const a =
        (await loadSecureDoc(db, doc.ref.parent.path, doc.id, pass)) || {};
      const id = a.id || doc.id || '(sem ID)';
      const nome = a.nome || '(sem nome)';
      const conversao = parseFloat(a.conversaoPago || 0);
      const visualizacoes = parseInt(a.visualizacoes || 0);
      const imagemCapa = a.imagemCapa || '';
      const descricao = a.descricao || '';

      let problemas = [];
      let nivel = 'baixo';

      // Conversion analysis
      if (conversao < 2 && visualizacoes >= 100) {
        problemas.push('Conversão muito baixa para o volume de visualizações');
        nivel = 'alto';
      } else if (conversao < 5 && visualizacoes >= 50) {
        problemas.push('Conversão abaixo do esperado');
        nivel = 'médio';
      }

      // Image analysis
      if (!imagemCapa) {
        problemas.push('Imagem de capa ausente');
        nivel = problemas.length ? nivel : 'médio';
      }

      // Title analysis
      if (!nome || nome.trim().length < 10) {
        problemas.push('Título muito curto ou incompleto');
        nivel = problemas.length ? nivel : 'médio';
      } else if (nome.length > 80) {
        problemas.push('Título muito longo (acima de 80 caracteres)');
        nivel = problemas.length ? nivel : 'médio';
      }

      // Description analysis
      if (!descricao) {
        problemas.push('Descrição do produto ausente');
        nivel = problemas.length ? nivel : 'médio';
      } else if (descricao.length < 200) {
        problemas.push('Descrição muito curta (menos de 200 caracteres)');
        nivel = problemas.length ? nivel : 'médio';
      }

      if (problemas.length > 0) {
        const corNivel =
          nivel === 'alto'
            ? 'bg-red-100 border-red-300'
            : nivel === 'médio'
              ? 'bg-yellow-100 border-yellow-300'
              : 'bg-blue-100 border-blue-300';

        const iconNivel =
          nivel === 'alto'
            ? 'fa-exclamation-triangle text-red-500'
            : nivel === 'médio'
              ? 'fa-exclamation-circle text-yellow-500'
              : 'fa-info-circle text-blue-500';

        sugestoes.push(`
              <div class="sugestao-item border rounded-lg p-4 ${corNivel}">
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <h4 class="font-bold text-lg">${nome}</h4>
                    <div class="text-sm text-gray-600">ID: ${id}</div>
                  </div>
                  <i class="fas ${iconNivel} text-xl"></i>
                </div>
                
                <div class="mb-3">
                  ${imagemCapa ? `<img src="${imagemCapa}" class="w-24 h-24 object-contain border rounded-lg mx-auto mb-2">` : ''}
                </div>
                
                <div class="mb-3">
                  <h5 class="font-medium mb-1">Problemas identificados:</h5>
                  <ul class="list-disc pl-5 text-sm">
                    ${problemas.map((p) => `<li>${p}</li>`).join('')}
                  </ul>
                </div>
                
                <div class="text-sm">
                  <h5 class="font-medium mb-1">Sugestões:</h5>
                  <ul class="list-disc pl-5">
                    ${problemas.includes('Imagem de capa ausente') ? '<li>Adicione uma imagem de capa atrativa</li>' : ''}
                    ${problemas.includes('Título muito curto ou incompleto') ? '<li>Melhore o título com palavras-chave relevantes</li>' : ''}
                    ${problemas.includes('Descrição muito curta') ? '<li>Amplie a descrição com detalhes do produto</li>' : ''}
                    ${problemas.some((p) => p.includes('Conversão')) ? '<li>Revise o preço e ofertas especiais</li>' : ''}
                    <li>Verifique a qualidade das fotos</li>
                    <li>Analise a concorrência</li>
                  </ul>
                </div>
                
                <div class="mt-3 flex justify-end">
                 <button onclick="copiarTitulo('${nome.replace(/'/g, "\\'")}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-2 rounded text-sm mr-2">
                    <i class="far fa-copy mr-1"></i>Copiar Título
                  </button>
                  <button onclick="verDetalhesAnuncio('${doc.id}','${ownerUid}')" class="bg-gray-500 hover:bg-gray-600 text-white px-2 py-2 rounded text-sm">
                    <i class="fas fa-eye mr-1"></i>Ver Detalhes
                  </button>
                </div>
              </div>
            `);
      }
    }

    container.innerHTML = sugestoes.length
      ? sugestoes.join('')
      : '<div class="text-center py-8 text-green-600"><i class="fas fa-check-circle mr-2"></i>Nenhuma sugestão no momento. Seus anúncios estão bem otimizados!</div>';
  } catch (error) {
    console.error('Erro ao gerar sugestões:', error);
    container.innerHTML =
      '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Erro ao gerar sugestões</div>';
  }
};

// Copy title to clipboard
window.copiarTitulo = function (titulo) {
  navigator.clipboard.writeText(titulo).then(() => {
    showNotification(
      '📋 Título copiado para a área de transferência!',
      'success',
    );
  });
};

// Load evolution data
window.carregarEvolucao = async function () {
  const container = document.getElementById('conteudoEvolucao');
  container.innerHTML =
    '<div class="text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Buscando dados de evolução...</div>';

  try {
    const user = auth.currentUser;
    let qAnuncios;
    let qHistorico;

    if (!isAdmin) {
      qAnuncios = collection(db, `uid/${user.uid}/anuncios`);
      qHistorico = collection(db, `uid/${user.uid}/atualizacoes`);
    } else {
      qAnuncios = collectionGroup(db, 'anuncios');
      qHistorico = collectionGroup(db, 'atualizacoes');
    }

    const [anunciosSnap, historicoSnap] = await Promise.all([
      getDocs(qAnuncios),
      getDocs(qHistorico),
    ]);

    const historicoPorId = {};
    historicoSnap.forEach((doc) => {
      const h = doc.data();
      if (!historicoPorId[h.id]) historicoPorId[h.id] = [];
      historicoPorId[h.id].push(h);
    });

    const cards = [];

    for (const doc of anunciosSnap.docs) {
      const ownerUid = doc.ref.parent.parent.id;
      const pass = getEffectivePass(ownerUid);
      const a =
        (await loadSecureDoc(db, doc.ref.parent.path, doc.id, pass)) || {};
      const id = a.id || doc.id || '(sem ID)';
      const nome = a.nome || '(sem nome)';
      const visitas = a.visitas || a.visualizacoes || 0;
      const vendas = a.vendasPago || 0;
      const conversao = a.conversaoPago || 0;
      const variantesSnap = await getDocs(
        collection(db, `uid/${ownerUid}/anuncios/${doc.id}/variantes`),
      );
      const variantes = (
        await Promise.all(
          variantesSnap.docs.map((v) =>
            loadSecureDoc(
              db,
              `uid/${ownerUid}/anuncios/${doc.id}/variantes`,
              v.id,
              pass,
            ),
          ),
        )
      ).filter(Boolean);
      const historico = (historicoPorId[id] || []).sort(
        (a, b) => new Date(a.dataHora) - new Date(b.dataHora),
      );

      let evolucaoHTML = '';

      if (historico.length > 0) {
        evolucaoHTML = historico
          .map((h, index) => {
            const antes = h.dadosAntigos;
            const depois = h.dadosNovos;
            const visitasAntes = antes.visitas || antes.visualizacoes || 0;
            const visitasDepois = depois.visitas || depois.visualizacoes || 0;
            const vendasAntes = antes.vendasPago || 0;
            const vendasDepois = depois.vendasPago || 0;

            const difVisitas = visitasDepois - visitasAntes;
            const difVendas = vendasDepois - vendasAntes;

            const iconVisitas =
              difVisitas >= 0
                ? 'fa-arrow-up text-green-500'
                : 'fa-arrow-down text-red-500';
            const iconVendas =
              difVendas >= 0
                ? 'fa-arrow-up text-green-500'
                : 'fa-arrow-down text-red-500';

            return `
            <div class="border-l-4 border-blue-400 pl-2 py-2">
              <div class="font-medium">Alteração #${index + 1} - ${new Date(h.dataHora).toLocaleDateString('pt-BR')}</div>
              <div class="grid grid-cols-2 gap-2 text-sm mt-1">
                <div class="flex items-center">
                  <i class="fas ${iconVisitas} mr-1"></i>
                  Visitas: ${visitasAntes} → ${visitasDepois} 
                  <span class="ml-1 ${difVisitas >= 0 ? 'text-green-600' : 'text-red-600'}">(${difVisitas >= 0 ? '+' : ''}${difVisitas})</span>
                </div>
                <div class="flex items-center">
                  <i class="fas ${iconVendas} mr-1"></i>
                  Vendas: ${vendasAntes} → ${vendasDepois}
                  <span class="ml-1 ${difVendas >= 0 ? 'text-green-600' : 'text-red-600'}">(${difVendas >= 0 ? '+' : ''}${difVendas})</span>
                </div>
              </div>
            </div>
          `;
          })
          .join('');
      } else {
        evolucaoHTML =
          '<div class="text-gray-500 italic">Sem histórico de alterações</div>';
      }

      let variantesHtml = '';
      if (variantes.length > 0) {
        variantesHtml = `
          <div class="mt-4 border-t pt-3">
            <h5 class="font-bold mb-2">📦 Variações</h5>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              ${variantes
                .map(
                  (vari) => `
                <div class="border rounded p-3 bg-gray-50">
                  <div><strong>Nome:</strong> ${vari.nomeVariante || 'N/A'}</div>
                  <div><strong>SKU:</strong> ${vari.skuVariante || 'N/A'}</div>
                  <div><strong>Estoque:</strong> ${vari.estoque || 0} un</div>
                  <div><strong>Preço:</strong> R$ ${vari.preco ? parseFloat(vari.preco).toFixed(2) : '0.00'}</div>
                  <div><strong>Conversão:</strong> ${vari.conversaoPago || '0'}%</div>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        `;
      }

      cards.push(`
        <div class="bg-white border rounded-lg p-4 shadow-sm">
          <div class="flex justify-between items-start mb-3">
            <div>
              <h4 class="font-bold">${nome}</h4>
              <div class="text-sm text-gray-600">ID: ${id}</div>
            </div>
            <span class="bg-blue-100 text-blue-800 px-2 py-2 rounded-full text-xs">
              ${historico.length} alterações
            </span>
          </div>
        
          <div class="grid grid-cols-3 gap-2 mb-4 text-center">
            <div class="bg-gray-50 p-2 rounded">
              <div class="text-xs text-gray-500">Visitas</div>
              <div class="font-bold">${visitas}</div>
            </div>
            <div class="bg-gray-50 p-2 rounded">
              <div class="text-xs text-gray-500">Vendas</div>
              <div class="font-bold">${vendas}</div>
            </div>
            <div class="bg-gray-50 p-2 rounded">
              <div class="text-xs text-gray-500">Conversão</div>
              <div class="font-bold">${conversao}%</div>
            </div>
          </div>
          
          <div>
            <h5 class="font-medium mb-2 border-b pb-1">Histórico de Alterações</h5>
            <div class="space-y-4 text-sm max-h-60 overflow-y-auto p-2">
              ${evolucaoHTML}
            </div>
          </div>

          ${variantesHtml}
        </div>
      `);
    }

    container.innerHTML = cards.length
      ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${cards.join('')}</div>`
      : '<div class="text-center py-8 text-gray-500">Nenhum dado de evolução encontrado</div>';
  } catch (error) {
    console.error('Erro ao carregar evolução:', error);
    container.innerHTML =
      '<div class="text-center py-8 text-red-500">Erro ao carregar dados de evolução</div>';
  }
};

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  atualizarContador();
});

let ordemAscendente = true;
let ultimaColunaOrdenada = null;

window.ordenarTabela = function (indiceColuna) {
  const tabela = document.getElementById('tabelaAnuncios');
  const tbody = tabela.querySelector('tbody');
  const linhas = Array.from(tbody.querySelectorAll('tr'));

  linhas.sort((a, b) => {
    const valorA = a.children[indiceColuna].innerText.trim();
    const valorB = b.children[indiceColuna].innerText.trim();

    const numA = parseFloat(valorA.replace(/[^\d.-]/g, ''));
    const numB = parseFloat(valorB.replace(/[^\d.-]/g, ''));

    const aFinal = isNaN(numA) ? valorA.toLowerCase() : numA;
    const bFinal = isNaN(numB) ? valorB.toLowerCase() : numB;

    if (aFinal < bFinal) return ordemAscendente ? -1 : 1;
    if (aFinal > bFinal) return ordemAscendente ? 1 : -1;
    return 0;
  });

  ordemAscendente = !ordemAscendente;

  // Reanexar linhas ordenadas
  tbody.innerHTML = '';
  linhas.forEach((linha) => tbody.appendChild(linha));
};

// 🔁 Consulta a IA (DeepSeek)
async function consultarDeepSeek(prompt) {
  try {
    const response = await fetch(
      'https://us-central1-matheus-35023.cloudfunctions.net/proxyDeepSeek',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: prompt }),
      },
    );

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '⚠️ Sem resposta da IA.';
  } catch (err) {
    console.error('Erro ao consultar IA:', err);
    return '❌ Erro ao consultar IA';
  }
}

// 🔠 Gera título + descrição com IA
window.gerarTextoAnuncioIA = async function () {
  const nome = document.getElementById('nomeProduto').value;
  const categoria = document.getElementById('categoriaProduto').value;
  const beneficios = document.getElementById('beneficiosProduto').value;

  const prompt = `Gere um título e uma descrição atrativa para Shopee com base no seguinte produto: 
Nome: ${nome}
Categoria: ${categoria}
Benefícios: ${beneficios}`;

  const resposta = await consultarDeepSeek(prompt);
  document.getElementById('resultadoIA').innerText = resposta;
};

// 🔍 Otimiza o título atual com IA
window.otimizarTituloAtual = async function () {
  const titulo = document.getElementById('tituloProduto').value;
  const prompt = `Otimize esse título para Shopee com foco em cliques e conversão: "${titulo}".`;

  const resposta = await consultarDeepSeek(prompt);
  document.getElementById('resultadoIA').innerText = resposta;
};

// 📉 Diagnóstico de baixo desempenho
window.gerarDiagnosticoIA = async function () {
  const nome = document.getElementById('nomeProduto').value;
  const visitas = document.getElementById('visitasProduto').value;
  const cliques = document.getElementById('cliquesProduto').value;
  const vendas = document.getElementById('vendasProduto').value;
  const estoque = document.getElementById('estoqueProduto').value;

  const prompt = `
Produto: ${nome}
Visitas: ${visitas}
Cliques: ${cliques}
Vendas: ${vendas}
Estoque: ${estoque}

Analise o desempenho e diga por que esse anúncio pode estar performando abaixo do esperado, e o que pode ser otimizado.`;

  const resposta = await consultarDeepSeek(prompt);
  document.getElementById('resultadoIA').innerText = resposta;
};
// Oculta todas as abas e mostra apenas a selecionada
document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    const abaSelecionada = button.getAttribute('data-tab');

    // Remover classe 'active' de todos os botões
    document
      .querySelectorAll('.tab-button')
      .forEach((btn) => btn.classList.remove('active'));

    // Esconder todas as abas
    document
      .querySelectorAll('.tab-content')
      .forEach((tab) => (tab.style.display = 'none'));

    // Ativar o botão atual
    button.classList.add('active');

    // Mostrar a aba selecionada
    const tabAtiva = document.getElementById(abaSelecionada);
    if (tabAtiva) tabAtiva.style.display = 'block';
  });
});

// Mostrar apenas a aba ativa inicial ao carregar
window.addEventListener('DOMContentLoaded', () => {
  document
    .querySelectorAll('.tab-content')
    .forEach((tab) => (tab.style.display = 'none'));
  const ativa = document
    .querySelector('.tab-button.active')
    ?.getAttribute('data-tab');
  if (ativa) document.getElementById(ativa).style.display = 'block';
});
window.filtrarTabela = function () {
  const busca = document.getElementById('campoBusca').value.toLowerCase();
  const precoMax = parseFloat(document.getElementById('filtroPrecoMax').value);
  const estoqueMin = parseInt(
    document.getElementById('filtroEstoqueMin').value,
  );
  const conversaoMin = parseFloat(
    document.getElementById('filtroConversaoMin').value,
  );
  const alertaPreco = document.getElementById('filtroAlertaPreco').checked;
  const skuInvalido =
    document.getElementById('filtroSkuInvalido')?.checked || false;

  document.querySelectorAll('#tabelaAnuncios tbody tr').forEach((tr) => {
    const nome = tr.getAttribute('data-nome') || '';
    const sku = tr.getAttribute('data-sku') || '';
    const id = tr.getAttribute('data-id') || '';
    const preco = parseFloat(tr.getAttribute('data-preco') || '0');
    const estoque = parseInt(tr.getAttribute('data-estoque') || '0');
    const conversao = parseFloat(tr.getAttribute('data-conversao') || '0');
    const alerta = tr.getAttribute('data-alerta') === '1';
    const skuInvalidoAttr = tr.getAttribute('data-skuinvalido') === '1';

    const matchBusca =
      nome.includes(busca) || sku.includes(busca) || id.includes(busca);
    const matchPreco = isNaN(precoMax) || preco <= precoMax;
    const matchEstoque = isNaN(estoqueMin) || estoque >= estoqueMin;
    const matchConversao = isNaN(conversaoMin) || conversao >= conversaoMin;
    const matchAlerta = !alertaPreco || alerta;
    const matchSkuInvalido = !skuInvalido || skuInvalidoAttr;

    tr.style.display =
      matchBusca &&
      matchPreco &&
      matchEstoque &&
      matchConversao &&
      matchAlerta &&
      matchSkuInvalido
        ? ''
        : 'none';
  });
};

// 📤 Exporta lista de SKUs não cadastrados
window.exportarSkusNaoCadastrados = function () {
  if (!window.skusNaoCadastrados.length) {
    showNotification('Nenhum SKU não cadastrado encontrado', 'warning');
    return;
  }
  const data = window.skusNaoCadastrados.map((sku) => ({ SKU: sku }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SKUs');
  XLSX.writeFile(wb, 'skus_nao_cadastrados.xlsx');
};
