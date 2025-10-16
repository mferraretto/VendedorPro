import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
  limit,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  ref,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';
import { firebaseConfig, getPassphrase } from './firebase-config.js';
import { decryptString } from './crypto.js';
import { fetchResponsavelFinanceiroUsuarios } from './responsavel-financeiro.js';
import { getConfiguredStorage, uploadFileWithRetry } from './storage-utils.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getConfiguredStorage(app);

let currentUser = null;
let initialLoad = true;
let usuariosResponsaveis = [];

const metaMentoradoCache = new Map();
let xlsxLoaderPromise = null;

function atualizarEstadoBotaoExportacao(ativo) {
  const botao = document.getElementById('exportarHistoricoBtn');
  if (!botao) return;
  botao.dataset.hasHistorico = ativo ? 'true' : 'false';
  botao.disabled = !ativo;
}

function setExportButtonLoading(loading) {
  const botao = document.getElementById('exportarHistoricoBtn');
  if (!botao) return;
  if (loading) {
    botao.dataset.originalText = botao.textContent || '';
    botao.textContent = 'Exportando...';
    botao.disabled = true;
  } else {
    const original = botao.dataset.originalText;
    if (original) {
      botao.textContent = original;
    }
    botao.disabled = botao.dataset.hasHistorico !== 'true';
  }
}

async function ensureXlsxLoaded() {
  if (window.XLSX) return window.XLSX;
  if (!xlsxLoaderPromise) {
    xlsxLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src =
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = () =>
        reject(new Error('Falha ao carregar biblioteca XLSX.'));
      document.head.appendChild(script);
    });
  }
  try {
    return await xlsxLoaderPromise;
  } catch (err) {
    xlsxLoaderPromise = null;
    throw err;
  }
}

atualizarEstadoBotaoExportacao(false);

function parseMetaValor(meta) {
  if (typeof meta === 'number' && Number.isFinite(meta)) {
    return meta;
  }
  if (typeof meta === 'string') {
    const trimmed = meta.trim();
    if (!trimmed) return 0;
    const sanitized = trimmed.replace(/[R$\s]/g, '');
    let normalized;
    if (sanitized.includes(',')) {
      normalized = sanitized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = sanitized.replace(/\./g, '');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function buscarMetaMentorado(uid) {
  if (!uid) return 0;
  if (metaMentoradoCache.has(uid)) {
    return metaMentoradoCache.get(uid);
  }
  try {
    const snap = await getDoc(doc(db, 'perfilMentorado', uid));
    let valor = 0;
    if (snap.exists()) {
      valor = parseMetaValor(snap.data()?.metaFaturamentoLiquido);
    }
    metaMentoradoCache.set(uid, valor);
    return valor;
  } catch (err) {
    console.error('Erro ao carregar meta de faturamento do perfil:', err);
    metaMentoradoCache.set(uid, 0);
    return 0;
  }
}

function showNotification(message, type = 'info') {
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
  setTimeout(() => notification.remove(), 5000);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  currentUser = user;
  await carregarUsuarios();
  carregarExpedicao();
  carregarAtualizacoes();
});

async function carregarUsuarios() {
  const select = document.getElementById('destinatarios');
  const card = document.getElementById('usuariosResponsaveisCard');
  const lista = document.getElementById('usuariosResponsaveisLista');
  if (select) select.innerHTML = '';
  if (lista) lista.innerHTML = '';
  usuariosResponsaveis = [];
  metaMentoradoCache.clear();
  try {
    const listaUsuarios = await fetchResponsavelFinanceiroUsuarios(
      db,
      currentUser.email,
    );
    if (!listaUsuarios.length) {
      card?.classList.add('hidden');
      return;
    }
    card?.classList.remove('hidden');
    listaUsuarios.forEach((u) => {
      usuariosResponsaveis.push({ uid: u.uid, nome: u.nome });
      if (select) {
        const opt = document.createElement('option');
        opt.value = u.uid;
        opt.textContent = u.nome;
        select.appendChild(opt);
      }
      if (lista) {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2';
        const avatar = `<div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium">${(u.nome || '?').charAt(0).toUpperCase()}</div>`;
        li.innerHTML = `${avatar}<span>${u.nome}</span>`;
        lista.appendChild(li);
      }
    });
    carregarHistoricoFaturamento();
    carregarTotais();
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
  }
}

async function calcularFaturamentoDiaDetalhado(responsavelUid, uid, dia) {
  const lojasSnap = await getDocs(
    collection(
      db,
      'uid',
      responsavelUid,
      'uid',
      uid,
      'faturamento',
      dia,
      'lojas',
    ),
  );
  let liquido = 0;
  let bruto = 0;
  for (const lojaDoc of lojasSnap.docs) {
    let dados = lojaDoc.data();
    if (dados.encrypted) {
      let txt;
      const candidates = [
        getPassphrase(),
        currentUser?.email,
        `chave-${uid}`,
        uid,
      ];
      for (const p of candidates) {
        if (!p) continue;
        try {
          txt = await decryptString(dados.encrypted, p);
          if (txt) break;
        } catch (_) {}
      }
      if (txt) dados = JSON.parse(txt);
    }
    liquido += Number(dados.valorLiquido) || 0;
    bruto += Number(dados.valorBruto) || 0;
  }
  return { liquido, bruto };
}

async function calcularVendasDia(responsavelUid, uid, dia) {
  try {
    const lojasSnap = await getDocs(
      collection(
        db,
        'uid',
        responsavelUid,
        'uid',
        uid,
        'faturamento',
        dia,
        'lojas',
      ),
    );
    let total = 0;
    for (const lojaDoc of lojasSnap.docs) {
      let dados = lojaDoc.data();
      if (dados.encrypted) {
        let txt;
        const candidates = [
          getPassphrase(),
          currentUser?.email,
          `chave-${uid}`,
          uid,
        ];
        for (const p of candidates) {
          if (!p) continue;
          try {
            txt = await decryptString(dados.encrypted, p);
            if (txt) break;
          } catch (_) {}
        }
        if (txt) dados = JSON.parse(txt);
      }
      total += Number(dados.qtdVendas || dados.quantidade) || 0;
    }
    return total;
  } catch (e) {
    console.error('Erro ao calcular vendas do dia:', e);
    return 0;
  }
}

function formatarData(str) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(str);
  if (!m) return str;
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  return `${m[3]}/${meses[Number(m[2]) - 1]}`;
}

async function carregarHistoricoFaturamento() {
  const card = document.getElementById('historicoFaturamentoCard');
  const container = document.getElementById('historicoFaturamento');
  if (!card || !container) return;
  container.innerHTML = '';
  atualizarEstadoBotaoExportacao(false);
  if (!usuariosResponsaveis.length) {
    card.classList.add('hidden');
    return;
  }
  const mesAtual = new Date().toISOString().slice(0, 7);
  const ano = new Date().getFullYear();
  const mesNum = new Date().getMonth() + 1;
  const totalDiasMes = new Date(ano, mesNum, 0).getDate();
  let possuiHistorico = false;
  for (const u of usuariosResponsaveis) {
    const metaMensal = await buscarMetaMentorado(u.uid);
    const metaDiaria = totalDiasMes ? metaMensal / totalDiasMes : 0;
    const metaDiariaFormatada = metaDiaria.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    });

    const fatSnap = await getDocs(
      collection(db, 'uid', currentUser.uid, 'uid', u.uid, 'faturamento'),
    );
    const dias = fatSnap.docs
      .map((d) => d.id)
      .filter((id) => id.startsWith(mesAtual))
      .sort()
      .slice(-1);

    if (!dias.length) {
      continue;
    }

    const col = document.createElement('div');
    col.className = 'faturamento-col';

    const header = document.createElement('div');
    header.className = 'faturamento-header cursor-pointer';
    header.innerHTML = `<div>${u.nome}</div><div>META diária R$ ${metaDiariaFormatada}</div>`;
    header.addEventListener('click', () =>
      toggleFaturamentoMensal(col, currentUser.uid, u.uid),
    );
    col.appendChild(header);

    for (const dia of dias) {
      const { liquido, bruto } = await calcularFaturamentoDiaDetalhado(
        currentUser.uid,
        u.uid,
        dia,
      );
      const vendas = await calcularVendasDia(currentUser.uid, u.uid, dia);
      const diff = metaDiaria - liquido;
      const atingido = diff <= 0;
      const day = document.createElement('div');
      day.className = 'faturamento-dia';
      day.innerHTML = `
        <div class="dia-data">${formatarData(dia)}</div>
        <div>Bruto: <span class="valor">R$ ${bruto.toLocaleString('pt-BR')}</span></div>
        <div>Líquido: <span class="valor">R$ ${liquido.toLocaleString('pt-BR')}</span></div>
        <div>Qtd: <span class="valor">${vendas}</span></div>
        <div class="resultado ${atingido ? 'positivo' : 'negativo'}">${atingido ? 'POSITIVO' : 'NEGATIVO'}${diff ? ` R$ ${Math.abs(diff).toLocaleString('pt-BR')}` : ''}</div>
      `;
      col.appendChild(day);
    }

    container.appendChild(col);
    possuiHistorico = true;
  }

  if (possuiHistorico) {
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
  atualizarEstadoBotaoExportacao(possuiHistorico);
}

async function toggleFaturamentoMensal(container, responsavelUid, uid) {
  let tabela = container.querySelector('table');
  if (tabela) {
    tabela.remove();
    return;
  }
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [anoAtual, mesAtualNumero] = mesAtual.split('-');
  const totalDiasMes = mesAtualNumero
    ? new Date(Number(anoAtual), Number(mesAtualNumero), 0).getDate()
    : 0;
  const metaMensal = await buscarMetaMentorado(uid);
  const metaDiaria = totalDiasMes ? metaMensal / totalDiasMes : 0;
  const fatSnap = await getDocs(
    collection(db, 'uid', responsavelUid, 'uid', uid, 'faturamento'),
  );
  const dias = fatSnap.docs
    .map((d) => d.id)
    .filter((id) => id.startsWith(mesAtual))
    .sort();
  tabela = document.createElement('table');
  tabela.className = 'mt-2 w-full text-sm border-collapse';
  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th class="border px-2 py-1">Data</th><th class="border px-2 py-1">Bruto</th><th class="border px-2 py-1">Líquido</th><th class="border px-2 py-1">Vendas</th><th class="border px-2 py-1">Resultado meta</th></tr>';
  tabela.appendChild(thead);
  const tbody = document.createElement('tbody');
  let totalBruto = 0;
  let totalLiquido = 0;
  let totalVendas = 0;
  let totalDiferenca = 0;
  for (const dia of dias) {
    const { bruto, liquido } = await calcularFaturamentoDiaDetalhado(
      responsavelUid,
      uid,
      dia,
    );
    const vendas = await calcularVendasDia(responsavelUid, uid, dia);
    totalBruto += bruto;
    totalLiquido += liquido;
    totalVendas += vendas;
    const diferenca = liquido - metaDiaria;
    totalDiferenca += diferenca;
    const diferencaEhZero = Math.abs(diferenca) < 0.005;
    let diferencaClass = 'border px-2 py-1';
    let diferencaTexto = 'Na meta';
    if (!diferencaEhZero) {
      diferencaClass +=
        diferenca >= 0
          ? ' text-green-600 font-semibold'
          : ' text-red-600 font-semibold';
      diferencaTexto = `${diferenca >= 0 ? 'Acima' : 'Abaixo'} R$ ${Math.abs(
        diferenca,
      ).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border px-2 py-1">${dia}</td>
      <td class="border px-2 py-1">R$ ${bruto.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}</td>
      <td class="border px-2 py-1">R$ ${liquido.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}</td>
      <td class="border px-2 py-1">${vendas.toLocaleString('pt-BR')}</td>
      <td class="${diferencaClass}">${diferencaTexto}</td>
    `;
    tbody.appendChild(tr);
  }
  tabela.appendChild(tbody);
  const tfoot = document.createElement('tfoot');
  const diferencaTotalEhZero = Math.abs(totalDiferenca) < 0.005;
  let diferencaTotalClass = 'border px-2 py-1 font-semibold';
  let diferencaTotalTexto = 'Na meta';
  if (!diferencaTotalEhZero) {
    diferencaTotalClass +=
      totalDiferenca >= 0 ? ' text-green-600' : ' text-red-600';
    diferencaTotalTexto = `${
      totalDiferenca >= 0 ? 'Acima' : 'Abaixo'
    } R$ ${Math.abs(totalDiferenca).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    })}`;
  }
  tfoot.innerHTML = `
    <tr>
      <td class="border px-2 py-1 font-semibold">Totais</td>
      <td class="border px-2 py-1 font-semibold">R$ ${totalBruto.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
        },
      )}</td>
      <td class="border px-2 py-1 font-semibold">R$ ${totalLiquido.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
        },
      )}</td>
      <td class="border px-2 py-1 font-semibold">${totalVendas.toLocaleString('pt-BR')}</td>
      <td class="${diferencaTotalClass}">${diferencaTotalTexto}</td>
    </tr>
  `;
  tabela.appendChild(tfoot);
  container.appendChild(tabela);
}

async function carregarTotais() {
  const container = document.getElementById('resumoTotais');
  if (!container) return;
  container.innerHTML = '';
  if (!usuariosResponsaveis.length) return;
  let totalBruto = 0,
    totalLiquido = 0,
    totalPedidos = 0,
    totalMeta = 0;
  const hoje = new Date();
  const mesAtual = hoje.toISOString().slice(0, 7);
  const totalDiasMes = new Date(
    hoje.getFullYear(),
    hoje.getMonth() + 1,
    0,
  ).getDate();
  for (const u of usuariosResponsaveis) {
    const fatSnap = await getDocs(
      collection(db, 'uid', currentUser.uid, 'uid', u.uid, 'faturamento'),
    );
    const dias = fatSnap.docs
      .map((d) => d.id)
      .sort()
      .slice(-1);
    if (!dias.length) continue;
    const dia = dias[0];
    const { bruto, liquido } = await calcularFaturamentoDiaDetalhado(
      currentUser.uid,
      u.uid,
      dia,
    );
    const pedidos = await calcularVendasDia(currentUser.uid, u.uid, dia);
    totalBruto += bruto;
    totalLiquido += liquido;
    totalPedidos += pedidos;
    const metaMensal = await buscarMetaMentorado(u.uid);
    totalMeta += totalDiasMes ? metaMensal / totalDiasMes : 0;
  }
  const cards = [
    {
      label: 'Bruto',
      valor: `R$ ${totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    },
    {
      label: 'Líquido',
      valor: `R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    },
    { label: 'Pedidos', valor: totalPedidos.toLocaleString('pt-BR') },
    {
      label: 'Meta',
      valor: `R$ ${totalMeta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    },
  ];
  cards.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'card text-center';
    div.innerHTML = `
      <div class="label text-xs sm:text-sm text-gray-500">${c.label}</div>
      <div class="value text-base sm:text-lg font-semibold">${c.valor}</div>
    `;
    container.appendChild(div);
  });
}

function gerarNomeAbaPlanilha(nome, indice) {
  const base = (nome || '').trim() || `Usuario ${indice + 1}`;
  const sanitized = base
    .replace(/[\\\/*?:\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return `Usuario ${indice + 1}`;
  return sanitized.slice(0, 31);
}

function arredondarNumero(valor, casas = 2) {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return 0;
  const fator = 10 ** casas;
  return Math.round(numero * fator) / fator;
}

function calcularMetaDiariaPorMes(metaMensal, anoMes) {
  const numeroMeta =
    typeof metaMensal === 'number' ? metaMensal : Number(metaMensal);
  if (!Number.isFinite(numeroMeta) || numeroMeta <= 0) return 0;
  const [anoStr, mesStr] = (anoMes || '').split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return 0;
  const diasMes = new Date(ano, mes, 0).getDate();
  if (!Number.isFinite(diasMes) || diasMes <= 0) return 0;
  return numeroMeta / diasMes;
}

async function montarHistoricoCompletoUsuario(responsavelUid, usuario) {
  const linhas = [];
  if (!responsavelUid || !usuario?.uid) return linhas;
  const col = collection(
    db,
    'uid',
    responsavelUid,
    'uid',
    usuario.uid,
    'faturamento',
  );
  const snap = await getDocs(col);
  if (snap.empty) return linhas;
  const dias = snap.docs.map((d) => d.id).sort();
  const metaMensal = await buscarMetaMentorado(usuario.uid);
  const cacheMeta = new Map();
  for (const dia of dias) {
    const { bruto, liquido } = await calcularFaturamentoDiaDetalhado(
      responsavelUid,
      usuario.uid,
      dia,
    );
    const vendas = await calcularVendasDia(responsavelUid, usuario.uid, dia);
    const liquidoNum = Number.isFinite(liquido)
      ? liquido
      : Number(liquido) || 0;
    const brutoNum = Number.isFinite(bruto) ? bruto : Number(bruto) || 0;
    let vendasNum = Number.isFinite(vendas) ? vendas : Number(vendas);
    if (!Number.isFinite(vendasNum)) vendasNum = 0;
    const chaveMes = dia.slice(0, 7);
    let metaDiaria = cacheMeta.get(chaveMes);
    if (metaDiaria === undefined) {
      metaDiaria = calcularMetaDiariaPorMes(metaMensal, chaveMes);
      cacheMeta.set(chaveMes, metaDiaria);
    }
    if (!Number.isFinite(metaDiaria)) metaDiaria = 0;
    const diferenca = liquidoNum - metaDiaria;
    let resultado = 'Na meta';
    if (diferenca > 0.005) resultado = 'Acima';
    else if (diferenca < -0.005) resultado = 'Abaixo';
    linhas.push({
      Data: dia,
      'Valor Bruto (R$)': arredondarNumero(brutoNum),
      'Valor Líquido (R$)': arredondarNumero(liquidoNum),
      Pedidos: Math.round(vendasNum),
      'Meta diária (R$)': arredondarNumero(metaDiaria),
      'Diferença x Meta (R$)': arredondarNumero(diferenca),
      Resultado: resultado,
    });
  }
  return linhas;
}

async function exportarHistoricoFaturamentoCompleto() {
  const botao = document.getElementById('exportarHistoricoBtn');
  if (!botao) return;
  if (botao.dataset.hasHistorico !== 'true') {
    showNotification(
      'Não há dados de faturamento disponíveis para exportação no momento.',
      'warning',
    );
    return;
  }
  setExportButtonLoading(true);
  try {
    const XLSX = await ensureXlsxLoaded();
    if (!XLSX) throw new Error('Biblioteca XLSX indisponível.');
    const workbook = XLSX.utils.book_new();
    let adicionouAba = false;
    for (let i = 0; i < usuariosResponsaveis.length; i++) {
      const usuario = usuariosResponsaveis[i];
      const linhas = await montarHistoricoCompletoUsuario(
        currentUser?.uid,
        usuario,
      );
      if (!linhas.length) continue;
      const ws = XLSX.utils.json_to_sheet(linhas, {
        header: [
          'Data',
          'Valor Bruto (R$)',
          'Valor Líquido (R$)',
          'Pedidos',
          'Meta diária (R$)',
          'Diferença x Meta (R$)',
          'Resultado',
        ],
      });
      const nomeAba = gerarNomeAbaPlanilha(usuario?.nome, i);
      XLSX.utils.book_append_sheet(workbook, ws, nomeAba);
      adicionouAba = true;
    }
    if (!adicionouAba) {
      showNotification(
        'Não há dados de faturamento disponíveis para exportação no momento.',
        'warning',
      );
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `historico_faturamento_${hoje}.xlsx`);
    showNotification('Planilha exportada com sucesso!', 'success');
  } catch (err) {
    console.error('Erro ao exportar histórico de faturamento:', err);
    showNotification(
      'Não foi possível exportar o histórico de faturamento.',
      'error',
    );
  } finally {
    setExportButtonLoading(false);
  }
}

async function carregarExpedicao() {
  const card = document.getElementById('expedicaoCard');
  const container = document.getElementById('expedicaoAtualizacoes');
  if (!card || !container) return;
  container.innerHTML = '';
  const limiteData = new Date();
  limiteData.setDate(limiteData.getDate() - 3);
  try {
    const q = query(
      collection(db, 'expedicaoMensagens'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const snap = await getDocs(q);
    let count = 0;
    snap.forEach((docSnap) => {
      const dados = docSnap.data();
      if (dados.tipo === 'status_etiqueta') return;
      const dests = dados.destinatarios || [];
      if (
        currentUser &&
        !dests.includes(currentUser.uid) &&
        dados.gestorUid !== currentUser.uid
      )
        return;
      const dataHora = dados.createdAt?.toDate
        ? dados.createdAt.toDate()
        : null;
      if (!dataHora || dataHora < limiteData) return;
      const item = document.createElement('div');
      item.className = 'p-2 border rounded';
      item.innerHTML =
        `<div>Qtd não expedida: ${dados.quantidade}</div>` +
        `${dados.motivo ? `<div>Motivo: ${dados.motivo}</div>` : ''}` +
        `<div class="text-xs text-gray-500">${dataHora.toLocaleString('pt-BR')}</div>`;
      container.appendChild(item);
      count++;
    });
    if (count) card.classList.remove('hidden');
    else card.classList.add('hidden');
  } catch (e) {
    console.error('Erro ao carregar expedição:', e);
  }
}

document
  .getElementById('exportarHistoricoBtn')
  ?.addEventListener('click', exportarHistoricoFaturamentoCompleto);

document
  .getElementById('formAtualizacao')
  ?.addEventListener('submit', enviarAtualizacao);

async function enviarAtualizacao(e) {
  e.preventDefault();
  if (!currentUser) return;
  const descricao = document.getElementById('descricao').value.trim();
  const destinatarios = Array.from(
    document.getElementById('destinatarios').selectedOptions,
  ).map((o) => o.value);
  if (!destinatarios.includes(currentUser.uid))
    destinatarios.push(currentUser.uid);
  const arquivos = document.getElementById('arquivos').files;
  const docRef = await addDoc(collection(db, 'financeiroAtualizacoes'), {
    descricao,
    autorUid: currentUser.uid,
    autorNome: currentUser.displayName || currentUser.email,
    destinatarios,
    tipo: 'atualizacao',
    createdAt: serverTimestamp(),
    anexos: [],
  });
  const anexos = [];
  for (const file of arquivos) {
    const path = `financeiroAtualizacoes/${currentUser.uid}/${docRef.id}/${file.name}`;
    const storageRef = ref(storage, path);
    await uploadFileWithRetry(storage, path, file);
    const url = await getDownloadURL(storageRef);
    anexos.push({ nome: file.name, url });
  }
  if (anexos.length) {
    await updateDoc(docRef, { anexos });
  }
  document.getElementById('descricao').value = '';
  Array.from(document.getElementById('destinatarios').options).forEach(
    (o) => (o.selected = false),
  );
  document.getElementById('arquivos').value = '';
}

function carregarAtualizacoes() {
  const lista = document.getElementById('listaAtualizacoes');
  if (!lista) return;
  const colRef = collection(db, 'financeiroAtualizacoes');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    if (!initialLoad) {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const dests = data.destinatarios || [];
          if (
            data.autorUid !== currentUser.uid &&
            dests.includes(currentUser.uid) &&
            data.tipo === 'faturamento'
          ) {
            showNotification(data.descricao || 'Novo faturamento registrado');
          }
        }
      });
    }
    lista.innerHTML = '';
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const dests = data.destinatarios || [];
      if (data.autorUid !== currentUser.uid && !dests.includes(currentUser.uid))
        return;
      lista.appendChild(renderCard(docSnap.id, data));
    });
    initialLoad = false;
  });
}

async function excluirAtualizacao(id, data) {
  try {
    await deleteDoc(doc(db, 'financeiroAtualizacoes', id));
  } catch (err) {
    console.error('Erro ao excluir atualização:', err);
    showNotification('Não foi possível excluir a atualização.', 'error');
    throw err;
  }

  const anexos = Array.isArray(data.anexos) ? data.anexos : [];
  if (anexos.length) {
    const tarefas = anexos
      .filter((anexo) => anexo?.nome)
      .map((anexo) => {
        const caminho = `financeiroAtualizacoes/${data.autorUid}/${id}/${anexo.nome}`;
        return deleteObject(ref(storage, caminho)).catch((erro) => {
          console.warn(
            `Não foi possível remover o anexo "${anexo.nome}" da atualização ${id}.`,
            erro,
          );
        });
      });
    await Promise.all(tarefas);
  }

  showNotification('Atualização excluída com sucesso.', 'success');
}

function renderCard(id, data) {
  const card = document.createElement('div');
  card.className = 'card p-4';
  const dataStr = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleString('pt-BR')
    : '';
  const anexosHtml = (data.anexos || [])
    .map(
      (a) =>
        `<a href="${a.url}" target="_blank" class="text-blue-500 underline block">${a.nome}</a>`,
    )
    .join('');
  card.innerHTML = `
    <p class="text-sm text-gray-500">${dataStr}</p>
    <p class="font-medium">${data.autorNome || ''}</p>
    <p class="mb-2">${data.descricao || ''}</p>
    ${anexosHtml}
  `;

  if (
    currentUser?.uid &&
    data?.autorUid === currentUser.uid &&
    data?.tipo === 'atualizacao'
  ) {
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'text-sm text-red-600 hover:text-red-700 flex items-center gap-1';
    deleteBtn.innerHTML =
      '<i class="fa-solid fa-trash-can"></i><span>Excluir mensagem</span>';
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm('Tem certeza que deseja excluir esta mensagem?')) {
        return;
      }
      deleteBtn.disabled = true;
      deleteBtn.classList.add('opacity-50');
      try {
        await excluirAtualizacao(id, data);
      } catch (err) {
        deleteBtn.disabled = false;
        deleteBtn.classList.remove('opacity-50');
      }
    });
    actions.appendChild(deleteBtn);
    card.appendChild(actions);
  }
  return card;
}
