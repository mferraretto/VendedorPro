import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import {
  registrarSaque as registrarSaqueSvc,
  deletarSaque as deletarSaqueSvc,
  atualizarSaque as atualizarSaqueSvc,
  fecharMes as fecharMesSvc,
  watchResumoMes as watchResumoMesSvc,
  registrarComissaoRecebida as registrarComissaoRecebidaSvc,
} from './comissoes-service.js';
import {
  anoMesBR,
  calcularResumo,
  taxaFinalPorTotal,
} from './comissoes-utils.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let uidAtual = null;
let unsubscribeResumo = null;
let editandoId = null;
let saquesCache = {};
let selecionados = new Set();
const VALOR_TODAS_LOJAS = '__todas__';
const VALOR_SEM_LOJA = '__sem_loja__';
let filtroLojaAtual = VALOR_TODAS_LOJAS;
let listaSaques = [];
let listaSaquesFiltrada = [];

const filtroLojaSelect = document.getElementById('filtroLoja');
if (filtroLojaSelect) {
  filtroLojaSelect.addEventListener('change', (event) => {
    filtroLojaAtual = event.target.value;
    selecionados.clear();
    atualizarResumoSelecionados();
    renderSaques();
  });
}

function valorPadraoLoja(origem) {
  if (typeof origem === 'string' && origem.trim()) {
    return origem.trim();
  }
  return VALOR_SEM_LOJA;
}

function labelParaLoja(valor) {
  return valor === VALOR_SEM_LOJA ? 'Sem loja cadastrada' : valor;
}

function atualizarCheckboxTodos() {
  const master = document.getElementById('checkboxSelecionarTodos');
  if (!master) return;
  if (listaSaquesFiltrada.length === 0) {
    master.checked = false;
    master.indeterminate = false;
    return;
  }
  const selecionadosVisiveis = listaSaquesFiltrada.filter((s) =>
    selecionados.has(s.id),
  ).length;
  master.checked =
    selecionadosVisiveis > 0 &&
    selecionadosVisiveis === listaSaquesFiltrada.length;
  master.indeterminate =
    selecionadosVisiveis > 0 &&
    selecionadosVisiveis < listaSaquesFiltrada.length;
}

function atualizarFiltroLojas() {
  if (!filtroLojaSelect) return;
  const valorAnterior = filtroLojaAtual;
  const lojas = Array.from(
    new Set(listaSaques.map((s) => valorPadraoLoja(s.origem))),
  ).sort((a, b) => labelParaLoja(a).localeCompare(labelParaLoja(b), 'pt-BR'));

  filtroLojaSelect.innerHTML = `<option value="${VALOR_TODAS_LOJAS}">Todas as lojas</option>`;
  lojas.forEach((valor) => {
    const option = document.createElement('option');
    option.value = valor;
    option.textContent = labelParaLoja(valor);
    filtroLojaSelect.appendChild(option);
  });

  if (valorAnterior !== VALOR_TODAS_LOJAS && !lojas.includes(valorAnterior)) {
    filtroLojaAtual = VALOR_TODAS_LOJAS;
  }
  filtroLojaSelect.value = filtroLojaAtual;
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  uidAtual = user.uid;
  const titulo = document.getElementById('tituloVendedor');
  if (titulo) {
    titulo.textContent = (user.displayName || 'VENDEDOR').toUpperCase();
  }
  const mesInput = document.getElementById('filtroMes');
  mesInput.value = anoMesBR();
  mesInput.addEventListener('change', () => {
    carregarSaques();
    assistirResumo();
  });
  carregarSaques();
  assistirResumo();
});

export async function registrarSaque() {
  const dataISO = document.getElementById('dataSaque').value;
  const valor = parseFloat(document.getElementById('valorSaque').value);
  const percentual = parseFloat(
    document.getElementById('percentualSaque').value,
  );
  const origem = document.getElementById('lojaSaque').value.trim();
  if (!dataISO || isNaN(valor) || valor <= 0) {
    alert('Preencha data e valor corretamente.');
    return;
  }
  if (editandoId) {
    const anoMes = document.getElementById('filtroMes').value || anoMesBR();
    await atualizarSaqueSvc({
      db,
      uid: uidAtual,
      anoMes,
      saqueId: editandoId,
      dataISO,
      valor,
      percentualPago: percentual,
      origem,
    });
  } else {
    await registrarSaqueSvc({
      db,
      uid: uidAtual,
      dataISO,
      valor,
      percentualPago: percentual,
      origem,
    });
  }
  document.getElementById('valorSaque').value = '';
  document.getElementById('lojaSaque').value = '';
  editandoId = null;
  document.getElementById('btnRegistrar').textContent = 'Registrar';
  carregarSaques();
}

export async function registrarComissaoRecebida() {
  const dataISO = document.getElementById('dataComissao').value;
  const valor = parseFloat(document.getElementById('valorComissao').value);
  if (!dataISO || isNaN(valor) || valor <= 0) {
    alert('Preencha data e valor corretamente.');
    return;
  }
  await registrarComissaoRecebidaSvc({ db, uid: uidAtual, dataISO, valor });
  document.getElementById('valorComissao').value = '';
}

async function carregarSaques() {
  const anoMes = document.getElementById('filtroMes').value || anoMesBR();
  const tbody = document.getElementById('tbodySaques');
  const tfoot = document.getElementById('tfootResumo');

  if (tbody) tbody.innerHTML = '';
  if (tfoot) tfoot.innerHTML = '';
  selecionados.clear();
  atualizarResumoSelecionados();

  const col = collection(
    db,
    'usuarios',
    uidAtual,
    'comissoes',
    anoMes,
    'saques',
  );
  const snap = await getDocs(col);
  saquesCache = {};
  listaSaques = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  listaSaques.forEach((s) => {
    saquesCache[s.id] = s;
  });

  atualizarFiltroLojas();
  renderSaques();
}

async function excluirSaque(id) {
  const anoMes = document.getElementById('filtroMes').value || anoMesBR();
  await deletarSaqueSvc({ db, uid: uidAtual, anoMes, saqueId: id });
  carregarSaques();
}

function renderSaques() {
  const tbody = document.getElementById('tbodySaques');
  const tfoot = document.getElementById('tfootResumo');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (tfoot) tfoot.innerHTML = '';

  listaSaquesFiltrada = listaSaques.filter((s) => {
    const valor = valorPadraoLoja(s.origem);
    return filtroLojaAtual === VALOR_TODAS_LOJAS || valor === filtroLojaAtual;
  });

  if (listaSaquesFiltrada.length === 0) {
    if (tfoot) {
      const mensagem =
        listaSaques.length === 0
          ? 'Sem saques registrados.'
          : 'Nenhum saque encontrado para a loja selecionada.';
      tfoot.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-3 text-center text-sm text-slate-500">${mensagem}</td>
        </tr>`;
    }
    atualizarCheckboxTodos();
    return;
  }

  let totalValor = 0;
  let totalComissao = 0;

  listaSaquesFiltrada.forEach((s) => {
    const valor = Number(s.valor) || 0;
    const comissao = Number(s.comissaoPaga) || 0;
    const percentual = Number(s.percentualPago) || 0;
    const statusPago = percentual > 0;
    const status = statusPago ? 'Pago' : 'A pagar';

    totalValor += valor;
    totalComissao += comissao;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 even:bg-slate-50/50';
    tr.innerHTML = `
      <td class="px-4 py-3 text-center">
        <input type="checkbox" class="saque-select h-4 w-4 rounded border-slate-300" data-id="${s.id}" onchange="toggleSelecao('${s.id}', this.checked)" ${
          selecionados.has(s.id) ? 'checked' : ''
        } />
      </td>
      <td class="px-4 py-3 text-slate-800">${formatarDataBR(s.data)}</td>
      <td class="px-4 py-3 text-slate-600">${
        s.origem && s.origem.trim() ? s.origem : '-'
      }</td>
      <td class="px-4 py-3 text-right font-medium text-slate-900">R$ ${valor.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}</td>
      <td class="px-4 py-3 text-right text-slate-600">${(percentual * 100).toFixed(0)}%</td>
      <td class="px-4 py-3 text-right text-slate-800">R$ ${comissao.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center rounded-full ${
          statusPago
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        } px-2 py-0.5 text-xs font-medium">${status}</span>
      </td>
      <td class="px-4 py-3 text-right">
        <div class="inline-flex gap-1">
          <button class="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="Editar" onclick="editarSaque('${s.id}')">✎</button>
          <button class="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 hover:bg-rose-50" aria-label="Excluir" onclick="excluirSaque('${s.id}')">🗑</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tfoot) {
    const perc = totalValor > 0 ? (totalComissao / totalValor) * 100 : 0;
    tfoot.innerHTML = `
      <tr>
        <td></td>
        <td colspan="2" class="px-4 py-3 font-medium text-slate-700">Total</td>
        <td class="px-4 py-3 text-right font-semibold text-slate-900">R$ ${totalValor.toLocaleString(
          'pt-BR',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )}</td>
        <td class="px-4 py-3 text-right text-slate-700">${perc.toFixed(0)}%</td>
        <td class="px-4 py-3 text-right font-semibold text-slate-900">R$ ${totalComissao.toLocaleString(
          'pt-BR',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )}</td>
        <td colspan="2"></td>
      </tr>`;
  }

  atualizarCheckboxTodos();
}

function toggleSelecao(id, marcado) {
  if (marcado) selecionados.add(id);
  else selecionados.delete(id);
  atualizarResumoSelecionados();
}

function toggleSelecaoTodos(marcado) {
  selecionados.clear();
  document.querySelectorAll('.saque-select').forEach((cb) => {
    cb.checked = marcado;
    if (marcado) selecionados.add(cb.dataset.id);
  });
  atualizarResumoSelecionados();
}

function atualizarResumoSelecionados() {
  const div = document.getElementById('acoesSelecionados');
  const texto = document.getElementById('resumoSelecionados');
  if (!div || !texto) return;
  if (selecionados.size === 0) {
    div.style.display = 'none';
    texto.textContent = '';
    atualizarCheckboxTodos();
    return;
  }
  let totalValor = 0;
  let totalComissaoSel = 0;
  selecionados.forEach((id) => {
    const s = saquesCache[id];
    if (s) {
      totalValor += Number(s.valor) || 0;
      totalComissaoSel += Number(s.comissaoPaga) || 0;
    }
  });
  texto.textContent = `${selecionados.size} selecionado(s) - Valor: R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Comissão: R$ ${totalComissaoSel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  div.style.display = 'flex';
  atualizarCheckboxTodos();
}

async function marcarComoPagoSelecionados() {
  const perc = parseFloat(
    document.getElementById('percentualSelecionado')?.value || '0',
  );
  const anoMes = document.getElementById('filtroMes').value || anoMesBR();
  for (const id of selecionados) {
    const s = saquesCache[id];
    if (!s) continue;
    await atualizarSaqueSvc({
      db,
      uid: uidAtual,
      anoMes,
      saqueId: id,
      dataISO: s.data,
      valor: s.valor,
      percentualPago: perc,
      origem: s.origem,
    });
  }
  selecionados.clear();
  carregarSaques();
}

function mostrarResumoSelecionados() {
  const texto = document.getElementById('resumoSelecionados');
  if (texto) alert(texto.textContent);
}

function exportarSelecionadosExcel() {
  if (selecionados.size === 0) return;

  // Cabeçalho principal
  const linhas = [
    ['Data', 'Loja', 'Saque', '%', 'Comissão', 'Status'].join(';'),
  ];
  const resumo = {};

  // Linhas detalhadas e consolidação por loja
  selecionados.forEach((id) => {
    const s = saquesCache[id];
    if (!s) return;
    const valor = Number(s.valor) || 0;
    const comissao = Number(s.comissaoPaga) || 0;
    const percentual = Number(s.percentualPago) || 0;
    const status = percentual > 0 ? 'PAGO' : 'A PAGAR';
    const lojaValor = valorPadraoLoja(s.origem);
    const lojaLabel = labelParaLoja(lojaValor);
    linhas.push(
      [
        formatarDataBR(s.data),
        lojaLabel,
        valor.toFixed(2),
        (percentual * 100).toFixed(0) + '%',
        comissao.toFixed(2),
        status,
      ].join(';'),
    );

    if (!resumo[lojaLabel]) {
      resumo[lojaLabel] = { total: 0, comissao: 0, pagos: true };
    }
    resumo[lojaLabel].total += valor;
    resumo[lojaLabel].comissao += comissao;
    resumo[lojaLabel].pagos = resumo[lojaLabel].pagos && percentual > 0;
  });

  // Tabela de resumo
  linhas.push('');
  linhas.push('Resumo Final');
  linhas.push(['Loja', 'Total', '%', 'Comissão Total', 'Status'].join(';'));
  Object.keys(resumo).forEach((loja) => {
    const r = resumo[loja];
    const perc = r.total > 0 ? (r.comissao / r.total) * 100 : 0;
    linhas.push(
      [
        loja,
        r.total.toFixed(2),
        perc.toFixed(0) + '%',
        r.comissao.toFixed(2),
        r.pagos ? 'PAGO' : 'A PAGAR',
      ].join(';'),
    );
  });

  const csv = `\ufeff${linhas.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'saques-selecionados.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportarSelecionadosPDF() {
  if (selecionados.size === 0 || !window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Fechamento Comissão', 105, 15, { align: 'center' });

  // Reunir itens selecionados
  const itens = Array.from(selecionados)
    .map((id) => saquesCache[id])
    .filter(Boolean);

  const totalSaque = itens.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const body = [];

  itens.forEach((s) => {
    const valor = Number(s.valor || 0);
    const status = s.percentualPago > 0 ? 'PAGO' : 'A PAGAR';

    body.push([
      formatarDataBR(s.data),
      s.origem || '',
      valor.toFixed(2),
      status,
    ]);
  });

  doc.autoTable({
    head: [['Data', 'Loja', 'Saque', 'Status']],
    body,
    startY: 25,
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 25;

  doc.setFontSize(12);
  doc.text(
    `Total de Saques Selecionados: R$ ${totalSaque.toFixed(2)}`,
    14,
    finalY + 10,
  );

  // Evite acentos no nome de arquivo para compatibilidade
  doc.save('fechamento-comissao.pdf');
}

function editarSaque(id) {
  const s = saquesCache[id];
  document.getElementById('dataSaque').value = s.data.substring(0, 10);
  document.getElementById('valorSaque').value = s.valor;
  document.getElementById('percentualSaque').value = String(
    s.percentualPago || 0,
  );
  document.getElementById('lojaSaque').value = s.origem || '';
  editandoId = id;
  document.getElementById('btnRegistrar').textContent = 'Atualizar';
}

async function fecharMes() {
  const anoMes = document.getElementById('filtroMes').value || anoMesBR();
  const ajusteId = await fecharMesSvc({ db, uid: uidAtual, anoMes });
  alert(ajusteId ? 'Ajuste lançado!' : 'Sem ajuste necessário');
}

function assistirResumo() {
  const anoMes = document.getElementById('filtroMes').value || anoMesBR();
  if (unsubscribeResumo) unsubscribeResumo();
  unsubscribeResumo = watchResumoMesSvc({
    db,
    uid: uidAtual,
    anoMes,
    onChange: (r) => {
      const cards = document.getElementById('cardsResumo');
      const texto = document.getElementById('faltasTexto');
      if (!r) {
        cards.innerHTML = '<p class="text-slate-500">Sem dados</p>';
        texto.textContent = '';
        return;
      }
      cards.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">Total Saques</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">R$ ${r.totalSacado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="mt-1 text-xs text-slate-500">Mês atual</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">% Comissão</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">${(r.taxaFinal * 100).toFixed(0)}%</div>
          <div class="mt-1 text-xs text-slate-500">Padrão</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">Comissão Paga</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">R$ ${(r.comissaoRecebida || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="mt-1 text-xs text-slate-500">Até agora</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-slate-600 text-xs font-medium tracking-wide uppercase">Falta Pagar</div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">R$ ${((r.comissaoPrevista || 0) - (r.comissaoRecebida || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="mt-1 text-xs text-slate-500">Estimado</div>
        </div>
      `;
      texto.textContent = `Faltam R$${r.faltamPara4.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para 4% | R$${r.faltamPara5.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para 5%`;
    },
  });
}

async function carregarFonteRoboto(doc) {
  if (doc.getFontList().Roboto) return;
  function toBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  const [regular, medium] = await Promise.all([
    fetch(
      'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
    ).then((r) => r.arrayBuffer()),
    fetch(
      'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf',
    ).then((r) => r.arrayBuffer()),
  ]);
  doc.addFileToVFS('Roboto-Regular.ttf', toBase64(regular));
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Medium.ttf', toBase64(medium));
  doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
}

async function imprimirFechamento() {
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const anoMes = document.getElementById('filtroMes').value || anoMesBR();

  const colSaques = collection(
    db,
    'usuarios',
    uidAtual,
    'comissoes',
    anoMes,
    'saques',
  );
  const colRecebidas = collection(
    db,
    'usuarios',
    uidAtual,
    'comissoes',
    anoMes,
    'recebidas',
  );
  const [snapSaques, snapRecebidas] = await Promise.all([
    getDocs(colSaques),
    getDocs(colRecebidas),
  ]);

  const saques = snapSaques.docs
    .map((d) => d.data())
    .sort((a, b) => a.data.localeCompare(b.data));
  const recebidas = snapRecebidas.docs
    .map((d) => d.data())
    .sort((a, b) => a.data.localeCompare(b.data));
  const resumoCalc = calcularResumo(saques);
  const { totalSacado, taxaFinal, comissaoPrevista } = resumoCalc;
  const totalPago = recebidas.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const totalPagar = comissaoPrevista - totalPago;

  let responsavel =
    auth.currentUser?.displayName || auth.currentUser?.email || '';
  let loja = '';
  try {
    const perfil = await getDoc(doc(db, 'perfil', uidAtual));
    if (perfil.exists()) {
      const pdata = perfil.data();
      responsavel = pdata.nomeCompleto || responsavel;
      loja = pdata.empresa || '';
    }
  } catch (_) {}

  const [anoTitulo, mesTitulo] = anoMes.split('-').map(Number);
  const dataTitulo = new Date(anoTitulo, mesTitulo - 1, 1);
  const mesNome = dataTitulo.toLocaleDateString('pt-BR', { month: 'long' });
  const mesAno = `${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}/${dataTitulo.getFullYear()}`;
  const emissao = new Date().toLocaleDateString('pt-BR');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await carregarFonteRoboto(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const accent = [79, 70, 229];

  function formatCurrency(v) {
    return `R$ ${(Number(v) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  function formatDate(iso) {
    return formatarDataBR(iso);
  }

  const header = (data) => {
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(20);
    doc.text(`Fechamento de Saques — ${mesAno}`, margin, 20);
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, 24, pageWidth - margin, 24);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    const right = `${responsavel}${loja ? ' / ' + loja : ''} / ${emissao}`;
    doc.text(right, pageWidth - margin, 20, { align: 'right' });
  };

  const footer = (data) => {
    doc.setFontSize(10);
    doc.text(`Página ${data.pageNumber}`, pageWidth / 2, pageHeight - 10, {
      align: 'center',
    });
  };

  header();

  let y = 30;
  const cardGap = 5;
  const cardW = (pageWidth - margin * 2 - cardGap * 3) / 4;
  const cardH = 24;
  const cards = [
    { icon: '💰', label: 'Total Sacado', valor: formatCurrency(totalSacado) },
    {
      icon: '🧾',
      label: 'Comissão do Mês',
      valor: formatCurrency(comissaoPrevista),
    },
    { icon: '✅', label: 'Pago', valor: formatCurrency(totalPago) },
    { icon: '⌛', label: 'A Pagar', valor: formatCurrency(totalPagar) },
  ];
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + cardGap);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'S');
    doc.setFontSize(10);
    doc.text(c.icon, x + 3, y + 9);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(14);
    doc.text(c.valor, x + cardW / 2, y + 15, { align: 'center' });
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.text(c.label, x + cardW / 2, y + cardH - 4, { align: 'center' });
  });

  y += cardH + 12;

  const saquesBody = saques.map((s) => [
    formatDate(s.data),
    s.origem || '',
    formatCurrency(s.valor),
  ]);
  const saquesFoot = [
    [
      {
        content: 'Total',
        colSpan: 2,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      {
        content: formatCurrency(totalSacado),
        styles: { halign: 'right', fontStyle: 'bold' },
      },
    ],
  ];

  doc.autoTable({
    startY: y,
    head: [['Data', 'Loja', 'Saque']],
    body: saquesBody,
    foot: saquesFoot,
    margin: { top: 32, left: margin, right: margin },
    styles: {
      font: 'Roboto',
      fontSize: 12,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'right' },
    },
    didDrawPage: (data) => {
      header();
      footer(data);
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  const comissoesBody = [
    ...recebidas.map((c) => [
      formatDate(c.data),
      `${(taxaFinal * 100).toFixed(0)}%`,
      formatCurrency(c.valor),
      'Pago',
    ]),
    [
      '',
      `${(taxaFinal * 100).toFixed(0)}%`,
      formatCurrency(totalPagar),
      'A pagar',
    ],
  ];
  const comissoesFoot = [
    [
      {
        content: 'Total',
        colSpan: 2,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      {
        content: formatCurrency(comissaoPrevista),
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      '',
    ],
  ];

  doc.autoTable({
    startY: y,
    head: [['Data', '%', 'Valor', 'Status']],
    body: comissoesBody,
    foot: comissoesFoot,
    margin: { top: 32, left: margin, right: margin },
    styles: {
      font: 'Roboto',
      fontSize: 12,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const val = data.cell.raw;
        data.cell.styles.textColor = val === 'Pago' ? '#16a34a' : '#d97706';
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => {
      header();
      footer(data);
    },
  });

  doc.save('fechamento-saques.pdf');
}

if (typeof window !== 'undefined') {
  window.registrarSaque = registrarSaque;
  window.excluirSaque = excluirSaque;
  window.editarSaque = editarSaque;
  window.fecharMes = fecharMes;
  window.toggleSelecao = toggleSelecao;
  window.toggleSelecaoTodos = toggleSelecaoTodos;
  window.marcarComoPagoSelecionados = marcarComoPagoSelecionados;
  window.mostrarResumoSelecionados = mostrarResumoSelecionados;
  window.exportarSelecionadosExcel = exportarSelecionadosExcel;
  window.exportarSelecionadosPDF = exportarSelecionadosPDF;
  window.registrarComissaoRecebida = registrarComissaoRecebida;
  window.imprimirFechamento = imprimirFechamento;
}
