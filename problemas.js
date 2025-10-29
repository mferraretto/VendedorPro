import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { setDocWithCopy } from './secure-firestore.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let uidAtual = null;
let pecasCache = [];
let pecasFiltradas = [];
let pecasColRef = null;
let reembolsosCache = [];
let reembolsosColRef = null;

const REEMBOLSO_STATUS_OPCOES = [
  { valor: 'AGUARDANDO PIX', texto: 'Aguardando PIX' },
  { valor: 'AGUARDANDO MERCADO', texto: 'Aguardando Mercado' },
  { valor: 'AGUARDANDO', texto: 'Aguardando' },
  { valor: 'FEITO', texto: 'Feito' },
  { valor: 'FEITO PIX', texto: 'Feito PIX' },
  { valor: 'FEITO MERCADO', texto: 'Feito Mercado' },
  { valor: 'CANCELADO', texto: 'Cancelado' },
];

function obterPosVendasUid() {
  if (typeof window === 'undefined') return null;
  return window.responsavelPosVendas?.uid || null;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html?login=1';
    return;
  }
  uidAtual = user.uid;
  const dataInput = document.getElementById('data');
  if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
  const dataRInput = document.getElementById('dataR');
  if (dataRInput) dataRInput.value = new Date().toISOString().split('T')[0];
  const pecasForm = document.getElementById('pecasForm');
  const togglePecasForm = document.getElementById('togglePecasForm');
  if (togglePecasForm && pecasForm) {
    togglePecasForm.setAttribute('aria-expanded', 'false');
    togglePecasForm.addEventListener('click', () => {
      const hidden = pecasForm.classList.toggle('hidden');
      togglePecasForm.textContent = hidden
        ? 'Registrar Peça Faltante'
        : 'Ocultar formulário';
      togglePecasForm.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      if (!hidden) {
        pecasForm.querySelector('input, textarea, select')?.focus();
        pecasForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  pecasForm?.addEventListener('submit', salvarPeca);
  document
    .getElementById('reembolsosForm')
    ?.addEventListener('submit', salvarReembolso);
  document
    .getElementById('filtroDataInicio')
    ?.addEventListener('change', renderPecas);
  document
    .getElementById('filtroDataFim')
    ?.addEventListener('change', renderPecas);
  document
    .getElementById('filtroStatus')
    ?.addEventListener('change', renderPecas);
  document
    .getElementById('searchPecas')
    ?.addEventListener('input', renderPecas);
  document
    .getElementById('limparReembolsos')
    ?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const form = document.getElementById('reembolsosForm');
      form?.reset();
      const di = document.getElementById('dataR');
      if (di) di.value = new Date().toISOString().split('T')[0];
    });
  document
    .getElementById('filtroStatusReembolsos')
    ?.addEventListener('change', renderReembolsos);
  document
    .getElementById('filtroApelidoReembolsos')
    ?.addEventListener('input', renderReembolsos);
  document
    .getElementById('filtroLojaReembolsos')
    ?.addEventListener('input', renderReembolsos);
  document
    .getElementById('filtroNumeroReembolsos')
    ?.addEventListener('input', renderReembolsos);
  document
    .getElementById('limparFiltrosReembolsos')
    ?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const filtroStatus = document.getElementById('filtroStatusReembolsos');
      const filtroApelido = document.getElementById('filtroApelidoReembolsos');
      const filtroLoja = document.getElementById('filtroLojaReembolsos');
      const filtroNumero = document.getElementById('filtroNumeroReembolsos');
      if (filtroStatus) filtroStatus.value = '';
      if (filtroApelido) filtroApelido.value = '';
      if (filtroLoja) filtroLoja.value = '';
      if (filtroNumero) filtroNumero.value = '';
      renderReembolsos();
    });
  document.getElementById('limparPecas')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const form = document.getElementById('pecasForm');
    form?.reset();
    const di = document.getElementById('data');
    if (di) di.value = new Date().toISOString().split('T')[0];
    const valor = document.getElementById('valorGasto');
    if (valor) valor.value = '';
  });
  document.getElementById('limparFiltros')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const fs = document.getElementById('filtroStatus');
    const search = document.getElementById('searchPecas');
    const fdInicio = document.getElementById('filtroDataInicio');
    const fdFim = document.getElementById('filtroDataFim');
    if (fdInicio) fdInicio.value = '';
    if (fdFim) fdFim.value = '';
    if (fs) fs.value = '';
    if (search) search.value = '';
    renderPecas();
  });
  document.getElementById('exportCsv')?.addEventListener('click', exportarCsv);
  carregarPecas();
  carregarReembolsos();
});

async function salvarPeca(ev) {
  ev.preventDefault();
  const form = ev.target;
  const valorBruto = (form.valorGasto?.value || '').replace(',', '.');
  const valorConvertido = Number.parseFloat(valorBruto);
  const registro = {
    data: form.data.value,
    nomeCliente: form.nomeCliente?.value.trim() || '',
    numero: form.numero.value.trim(),
    apelido: form.apelido.value.trim(),
    nf: form.nf.value.trim(),
    loja: form.loja.value.trim(),
    peca: form.peca.value.trim(),
    valorGasto: Number.isFinite(valorConvertido) ? valorConvertido : 0,
    status: 'NÃO FEITO',
    informacoes: form.informacoes?.value.trim() || '',
    endereco: {
      cep: form.cep?.value.trim() || '',
      rua: form.rua?.value.trim() || '',
      numero: form.numeroEndereco?.value.trim() || '',
      bairro: form.bairro?.value.trim() || '',
      cidade: form.cidade?.value.trim() || '',
      estado: form.estado?.value.trim() || '',
      complemento: form.complemento?.value.trim() || '',
      referencia: form.referencia?.value.trim() || '',
    },
  };
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'pecasfaltando');
  const colRef = collection(baseDoc, 'itens');
  const ref = doc(colRef);
  await setDocWithCopy(ref, registro, uidAtual, null, {
    posVendasUid: obterPosVendasUid(),
  });
  form.reset();
  const dataInput = document.getElementById('data');
  if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
  const togglePecasForm = document.getElementById('togglePecasForm');
  if (togglePecasForm) {
    togglePecasForm.textContent = 'Registrar Peça Faltante';
    togglePecasForm.setAttribute('aria-expanded', 'false');
  }
  form.classList.add('hidden');
  carregarPecas();
}

async function carregarPecas() {
  if (!uidAtual) return;
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'pecasfaltando');
  pecasColRef = collection(baseDoc, 'itens');
  const snap = await getDocs(pecasColRef);
  pecasCache = snap.docs
    .map((d) => {
      const dados = d.data();
      const valorNumerico = Number.isFinite(Number(dados.valorGasto))
        ? Number(dados.valorGasto)
        : Number.parseFloat(dados.valorGasto) || 0;
      return {
        id: d.id,
        ...dados,
        valorGasto: valorNumerico,
        status: dados.status || 'NÃO FEITO',
        endereco: normalizarEndereco(dados.endereco),
      };
    })
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  renderPecas();
}

function renderPecas() {
  const container = document.getElementById('pecasListContainer');
  const emptyState = document.getElementById('pecasEmptyState');
  if (!container) return;
  container.innerHTML = '';
  const filtroDataInicio = document.getElementById('filtroDataInicio')?.value;
  const filtroDataFim = document.getElementById('filtroDataFim')?.value;
  const filtroStatus = document.getElementById('filtroStatus')?.value;
  const busca =
    document.getElementById('searchPecas')?.value.toLowerCase().trim() || '';
  pecasFiltradas = pecasCache.filter((d) => {
    const data = d.data || '';
    const dataInicioOk = filtroDataInicio ? data >= filtroDataInicio : true;
    const dataFimOk = filtroDataFim ? data <= filtroDataFim : true;
    const dataOk = dataInicioOk && dataFimOk;
    const statusOk = filtroStatus ? d.status === filtroStatus : true;
    if (!busca) return dataOk && statusOk;
    const enderecoValores = Object.values(d.endereco || {});
    const valoresPesquisa = [
      d.data,
      d.numero,
      d.apelido,
      d.nomeCliente,
      d.loja,
      d.peca,
      d.nf,
      d.informacoes,
      d.status,
      d.valorGasto,
      ...enderecoValores,
    ];
    const buscaOk = valoresPesquisa.some((valor) =>
      String(valor || '')
        .toLowerCase()
        .includes(busca),
    );
    return dataOk && statusOk && buscaOk;
  });
  if (emptyState) {
    if (!pecasFiltradas.length) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }
  }
  pecasFiltradas.forEach((d) => {
    const endereco = normalizarEndereco(d.endereco);
    const card = document.createElement('article');
    card.className =
      'space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-6';

    const detalhes = document.createElement('div');
    detalhes.className = 'hidden space-y-5 border-t border-slate-200 pt-4';

    const resumo = document.createElement('div');
    resumo.className =
      'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between';

    const infoGrid = document.createElement('div');
    infoGrid.className =
      'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-6';

    const camposResumo = [
      { rotulo: 'Cliente', valor: d.nomeCliente || '—' },
      { rotulo: 'Apelido', valor: d.apelido || '—' },
      { rotulo: 'Produto', valor: d.peca || '—' },
      { rotulo: 'Número do Pedido', valor: d.numero || '—' },
      { rotulo: 'Loja', valor: d.loja || '—' },
      {
        rotulo: 'Data',
        valor: d.data ? formatarData(d.data) : '—',
      },
    ];

    camposResumo.forEach(({ rotulo, valor }) => {
      const item = document.createElement('div');
      item.className = 'space-y-1';
      const chip = document.createElement('span');
      chip.className =
        'inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600';
      chip.textContent = rotulo;
      const valorTexto = document.createElement('p');
      valorTexto.className = 'text-sm font-medium text-slate-700';
      valorTexto.textContent = valor;
      item.appendChild(chip);
      item.appendChild(valorTexto);
      infoGrid.appendChild(item);
    });

    resumo.appendChild(infoGrid);

    const resumoAcoes = document.createElement('div');
    resumoAcoes.className =
      'flex flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end';

    const statusContainer = document.createElement('div');
    statusContainer.className =
      'flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500';
    const statusLabel = document.createElement('span');
    statusLabel.textContent = 'Status';
    statusContainer.appendChild(statusLabel);
    const statusSelect = document.createElement('select');
    statusSelect.className =
      'status-select rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide focus:border-violet-500 focus:ring-violet-500';
    const opcoes = [
      { valor: 'NÃO FEITO', texto: 'Não feito' },
      { valor: 'EM ANDAMENTO', texto: 'Em andamento' },
      { valor: 'RESOLVIDO', texto: 'Resolvido' },
    ];
    opcoes.forEach(({ valor, texto }) => {
      const option = document.createElement('option');
      option.value = valor;
      option.textContent = texto;
      if (d.status === valor) option.selected = true;
      statusSelect.appendChild(option);
    });
    aplicarCorStatus(statusSelect, d.status);
    statusSelect.addEventListener('change', async (ev) => {
      const novoStatus = ev.target.value;
      await atualizarPeca(d, { status: novoStatus });
      aplicarCorStatus(statusSelect, novoStatus);
    });
    statusContainer.appendChild(statusSelect);
    resumoAcoes.appendChild(statusContainer);

    const verMaisBtn = document.createElement('button');
    verMaisBtn.type = 'button';
    verMaisBtn.className =
      'inline-flex items-center justify-center rounded-xl border border-violet-200 px-3 py-1.5 text-sm font-medium text-violet-600 transition hover:bg-violet-50';
    verMaisBtn.textContent = 'Ver mais';
    verMaisBtn.addEventListener('click', () => {
      const estaOculto = detalhes.classList.contains('hidden');
      detalhes.classList.toggle('hidden');
      verMaisBtn.textContent = estaOculto ? 'Ver menos' : 'Ver mais';
    });
    resumoAcoes.appendChild(verMaisBtn);

    const excluirBtn = document.createElement('button');
    excluirBtn.type = 'button';
    excluirBtn.textContent = 'Excluir';
    excluirBtn.className =
      'inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50';
    excluirBtn.addEventListener('click', async () => {
      const confirma = window.confirm('Deseja excluir este registro?');
      if (!confirma) return;
      await excluirPeca(d.id);
    });
    resumoAcoes.appendChild(excluirBtn);

    resumo.appendChild(resumoAcoes);
    card.appendChild(resumo);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

    grid.appendChild(
      criarCampoEditavel('Data', {
        tipo: 'date',
        valor: d.data || '',
        onChange: (valor) => atualizarPeca(d, { data: valor }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Nome do Comprador', {
        valor: d.nomeCliente || '',
        onChange: (valor) => atualizarPeca(d, { nomeCliente: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Apelido', {
        valor: d.apelido || '',
        onChange: (valor) => atualizarPeca(d, { apelido: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Número do Pedido', {
        valor: d.numero || '',
        onChange: (valor) => atualizarPeca(d, { numero: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Loja', {
        valor: d.loja || '',
        onChange: (valor) => atualizarPeca(d, { loja: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('NF', {
        valor: d.nf || '',
        onChange: (valor) => atualizarPeca(d, { nf: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Peça Faltante', {
        valor: d.peca || '',
        onChange: (valor) => atualizarPeca(d, { peca: valor.trim() }),
      }),
    );

    grid.appendChild(
      criarCampoEditavel('Valor Gasto', {
        tipo: 'number',
        passo: '0.01',
        valor: formatarNumero(d.valorGasto),
        prefixo: 'R$',
        onChange: async (valor, input) => {
          const convertido = Number.parseFloat(String(valor).replace(',', '.'));
          const numerico = Number.isFinite(convertido) ? convertido : 0;
          await atualizarPeca(d, { valorGasto: numerico });
          if (input) input.value = formatarNumero(numerico);
        },
      }),
    );

    detalhes.appendChild(grid);

    const infoField = document.createElement('label');
    infoField.className = 'flex flex-col gap-2 text-sm';
    const infoSpan = document.createElement('span');
    infoSpan.className =
      'text-xs font-semibold uppercase tracking-wide text-slate-500';
    infoSpan.textContent = 'Informações adicionais';
    infoField.appendChild(infoSpan);
    const infoTextarea = document.createElement('textarea');
    infoTextarea.rows = 3;
    infoTextarea.value = d.informacoes || '';
    infoTextarea.className =
      'rounded-2xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500';
    infoTextarea.addEventListener('change', async (ev) => {
      await atualizarPeca(d, { informacoes: ev.target.value.trim() });
    });
    infoField.appendChild(infoTextarea);
    detalhes.appendChild(infoField);

    const enderecoWrapper = document.createElement('div');
    enderecoWrapper.className = 'space-y-3';
    const enderecoBtn = document.createElement('button');
    enderecoBtn.type = 'button';
    enderecoBtn.className =
      'inline-flex items-center gap-2 text-sm font-semibold text-violet-600 transition hover:text-violet-700';
    enderecoBtn.innerHTML =
      '<i class="fa-solid fa-location-dot"></i><span>Ver endereço</span>';
    const enderecoTexto = enderecoBtn.querySelector('span');
    const enderecoSection = document.createElement('div');
    enderecoSection.className =
      'hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5';

    const enderecoGrid = document.createElement('div');
    enderecoGrid.className =
      'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4';

    const criarCampoEndereco = (rotulo, chave) => {
      const campo = document.createElement('label');
      campo.className = 'flex flex-col gap-1 text-sm';
      const span = document.createElement('span');
      span.className =
        'text-xs font-semibold uppercase tracking-wide text-slate-500';
      span.textContent = rotulo;
      campo.appendChild(span);
      const input = document.createElement('input');
      input.type = 'text';
      input.value = endereco[chave] || '';
      input.className =
        'rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500';
      input.addEventListener('change', async (ev) => {
        const atualizado = normalizarEndereco({
          ...endereco,
          [chave]: ev.target.value.trim(),
        });
        await atualizarPeca(d, { endereco: atualizado });
        Object.assign(endereco, atualizado);
      });
      campo.appendChild(input);
      return campo;
    };

    enderecoGrid.appendChild(criarCampoEndereco('CEP', 'cep'));
    enderecoGrid.appendChild(criarCampoEndereco('Rua', 'rua'));
    enderecoGrid.appendChild(criarCampoEndereco('Número', 'numero'));
    enderecoGrid.appendChild(criarCampoEndereco('Bairro', 'bairro'));
    enderecoGrid.appendChild(criarCampoEndereco('Cidade', 'cidade'));
    enderecoGrid.appendChild(criarCampoEndereco('Estado', 'estado'));
    enderecoGrid.appendChild(criarCampoEndereco('Complemento', 'complemento'));
    enderecoGrid.appendChild(
      criarCampoEndereco('Ponto de Referência', 'referencia'),
    );

    enderecoSection.appendChild(enderecoGrid);

    enderecoBtn.addEventListener('click', () => {
      const escondido = enderecoSection.classList.toggle('hidden');
      if (enderecoTexto) {
        enderecoTexto.textContent = escondido
          ? 'Ver endereço'
          : 'Ocultar endereço';
      }
    });

    enderecoWrapper.appendChild(enderecoBtn);
    enderecoWrapper.appendChild(enderecoSection);
    detalhes.appendChild(enderecoWrapper);

    card.appendChild(detalhes);

    container.appendChild(card);
  });
}

function exportarCsv() {
  if (!pecasFiltradas.length) return;
  const header = [
    'Data',
    'Nome do Comprador',
    'Apelido',
    'Número',
    'Loja',
    'Peça Faltante',
    'NF',
    'Informações',
    'Valor Gasto',
    'Status',
    'CEP',
    'Rua',
    'Número Endereço',
    'Bairro',
    'Cidade',
    'Estado',
    'Complemento',
    'Referência',
  ];
  const rows = pecasFiltradas.map((d) => [
    formatarData(d.data),
    d.nomeCliente || '',
    d.apelido || '',
    d.numero || '',
    d.loja || '',
    d.peca || '',
    d.nf || '',
    d.informacoes || '',
    (Number(d.valorGasto) || 0).toFixed(2).replace('.', ','),
    d.status || '',
    d.endereco?.cep || '',
    d.endereco?.rua || '',
    d.endereco?.numero || '',
    d.endereco?.bairro || '',
    d.endereco?.cidade || '',
    d.endereco?.estado || '',
    d.endereco?.complemento || '',
    d.endereco?.referencia || '',
  ]);
  const csv = [header, ...rows].map((r) => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pecas-faltando.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function salvarReembolso(ev) {
  ev.preventDefault();
  const form = ev.target;
  const registro = {
    data: form.data.value,
    numero: form.numero.value.trim(),
    loja: form.loja.value.trim(),
    apelido: form.apelido.value.trim(),
    nf: form.nf.value.trim(),
    valor: parseFloat(form.valor.value) || 0,
    pix: form.pix?.value.trim() || '',
    problema: form.problema?.value.trim() || '',
    status: form.status?.value || 'AGUARDANDO PIX',
  };
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'reembolsos');
  const colRef = collection(baseDoc, 'itens');
  const ref = doc(colRef);
  await setDocWithCopy(ref, registro, uidAtual, null, {
    posVendasUid: obterPosVendasUid(),
  });
  form.reset();
  const dataRInput = document.getElementById('dataR');
  if (dataRInput) dataRInput.value = new Date().toISOString().split('T')[0];
  const statusInput = document.getElementById('statusR');
  if (statusInput) statusInput.value = 'AGUARDANDO PIX';
  carregarReembolsos();
}

async function carregarReembolsos() {
  const tbody = document.getElementById('reembolsosTableBody');
  if (!tbody || !uidAtual) return;
  const baseDoc = doc(db, 'uid', uidAtual, 'problemas', 'reembolsos');
  reembolsosColRef = collection(baseDoc, 'itens');
  const snap = await getDocs(reembolsosColRef);
  reembolsosCache = snap.docs
    .map((d) => {
      const dados = d.data();
      const statusValido = REEMBOLSO_STATUS_OPCOES.some(
        (opcao) => opcao.valor === dados.status,
      )
        ? dados.status
        : 'AGUARDANDO';
      return {
        id: d.id,
        ...dados,
        valor: Number.isFinite(Number(dados.valor))
          ? Number(dados.valor)
          : Number.parseFloat(dados.valor) || 0,
        pix: dados.pix || '',
        problema: dados.problema || '',
        status: statusValido,
      };
    })
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  renderReembolsos();
}

function renderReembolsos() {
  const tbody = document.getElementById('reembolsosTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const filtroStatus = document.getElementById('filtroStatusReembolsos')?.value;
  const filtroApelido =
    document.getElementById('filtroApelidoReembolsos')?.value.toLowerCase() ||
    '';
  const filtroLoja =
    document.getElementById('filtroLojaReembolsos')?.value.toLowerCase() || '';
  const filtroNumero =
    document.getElementById('filtroNumeroReembolsos')?.value.toLowerCase() ||
    '';
  const reembolsosFiltrados = reembolsosCache.filter((d) => {
    const statusOk = filtroStatus ? d.status === filtroStatus : true;
    const apelidoOk = filtroApelido
      ? (d.apelido || '').toLowerCase().includes(filtroApelido)
      : true;
    const lojaOk = filtroLoja
      ? (d.loja || '').toLowerCase().includes(filtroLoja)
      : true;
    const numeroOk = filtroNumero
      ? (d.numero || '').toLowerCase().includes(filtroNumero)
      : true;
    return statusOk && apelidoOk && lojaOk && numeroOk;
  });
  const baseInputClass =
    'w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500';
  reembolsosFiltrados.forEach((d) => {
    const tr = document.createElement('tr');
    tr.className =
      'border-t border-slate-100 hover:bg-slate-50 odd:bg-white even:bg-slate-50';

    tr.appendChild(
      criarCelulaInput({
        tipo: 'date',
        valor: d.data || '',
        onChange: (valor) => atualizarReembolso(d, { data: valor }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.numero || '',
        onChange: (valor) => atualizarReembolso(d, { numero: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.loja || '',
        onChange: (valor) => atualizarReembolso(d, { loja: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.apelido || '',
        onChange: (valor) => atualizarReembolso(d, { apelido: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.problema || '',
        onChange: (valor) => atualizarReembolso(d, { problema: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.nf || '',
        onChange: (valor) => atualizarReembolso(d, { nf: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaInput({
        tipo: 'text',
        valor: d.pix || '',
        onChange: (valor) => atualizarReembolso(d, { pix: valor.trim() }),
        classe: baseInputClass,
      }),
    );

    tr.appendChild(
      criarCelulaSelect({
        valor: d.status || 'AGUARDANDO',
        opcoes: REEMBOLSO_STATUS_OPCOES,
        onChange: (valor) => atualizarReembolso(d, { status: valor }),
        classe:
          'w-full rounded-xl border-slate-300 p-1 text-sm focus:border-violet-500 focus:ring-violet-500',
      }),
    );

    const valorTd = document.createElement('td');
    valorTd.className = 'p-2';
    const valorWrapper = document.createElement('div');
    valorWrapper.className = 'flex items-center justify-end gap-1';
    const valorPrefix = document.createElement('span');
    valorPrefix.textContent = 'R$';
    valorPrefix.className = 'text-slate-500';
    const valorInput = document.createElement('input');
    valorInput.type = 'number';
    valorInput.step = '0.01';
    valorInput.value = formatarNumero(d.valor);
    valorInput.className =
      'w-28 rounded-xl border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
    valorInput.addEventListener('change', async (ev) => {
      const novoValor = Number.parseFloat(ev.target.value);
      const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
      await atualizarReembolso(d, { valor: valorConvertido });
      ev.target.value = formatarNumero(valorConvertido);
    });
    valorWrapper.appendChild(valorPrefix);
    valorWrapper.appendChild(valorInput);
    valorTd.appendChild(valorWrapper);
    tr.appendChild(valorTd);

    const acaoTd = criarCelulaAcoes(d, 'reembolso');
    tr.appendChild(acaoTd);

    tbody.appendChild(tr);
  });
}

function aplicarCorStatus(el, status) {
  el.classList.remove(
    'bg-amber-50',
    'text-amber-700',
    'border-amber-200',
    'bg-blue-50',
    'text-blue-700',
    'border-blue-200',
    'bg-emerald-50',
    'text-emerald-700',
    'border-emerald-200',
  );
  if (status === 'RESOLVIDO') {
    el.classList.add(
      'bg-emerald-50',
      'text-emerald-700',
      'border',
      'border-emerald-200',
    );
  } else if (status === 'EM ANDAMENTO') {
    el.classList.add(
      'bg-blue-50',
      'text-blue-700',
      'border',
      'border-blue-200',
    );
  } else {
    el.classList.add(
      'bg-amber-50',
      'text-amber-700',
      'border',
      'border-amber-200',
    );
  }
}

function formatarData(str) {
  if (!str) return '';
  const [ano, mes, dia] = str.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarNumero(valor) {
  return (Number(valor) || 0).toFixed(2);
}

function criarChip(iconClass, texto) {
  const chip = document.createElement('span');
  chip.className =
    'inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600';
  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = `${iconClass} text-slate-500`;
    chip.appendChild(icon);
  }
  const textoSpan = document.createElement('span');
  textoSpan.textContent = texto;
  chip.appendChild(textoSpan);
  return chip;
}

function criarCampoEditavel(
  rotulo,
  { tipo = 'text', valor = '', onChange, prefixo, passo },
) {
  const wrapper = document.createElement('label');
  wrapper.className = 'flex flex-col gap-1 text-sm';
  const span = document.createElement('span');
  span.className =
    'text-xs font-semibold uppercase tracking-wide text-slate-500';
  span.textContent = rotulo;
  wrapper.appendChild(span);
  const input = document.createElement('input');
  input.type = tipo;
  input.value = valor ?? '';
  input.className =
    'rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500';
  if (passo) input.step = passo;
  if (tipo === 'number') input.inputMode = 'decimal';
  const handleChange = async (ev) => {
    if (!onChange) return;
    const resultado = onChange(ev.target.value, ev.target);
    if (resultado instanceof Promise) {
      await resultado;
    }
  };
  input.addEventListener('change', handleChange);
  if (prefixo) {
    input.classList.add('pl-8');
    const container = document.createElement('div');
    container.className = 'relative';
    const prefixSpan = document.createElement('span');
    prefixSpan.className =
      'pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-400';
    prefixSpan.textContent = prefixo;
    container.appendChild(prefixSpan);
    container.appendChild(input);
    wrapper.appendChild(container);
  } else {
    wrapper.appendChild(input);
  }
  return wrapper;
}

function normalizarEndereco(endereco) {
  const campos = [
    'cep',
    'rua',
    'numero',
    'bairro',
    'cidade',
    'estado',
    'complemento',
    'referencia',
  ];
  const base = {};
  campos.forEach((campo) => {
    base[campo] = '';
  });
  if (!endereco || typeof endereco !== 'object') {
    return base;
  }
  campos.forEach((campo) => {
    base[campo] = endereco[campo] ? String(endereco[campo]) : '';
  });
  return base;
}

function criarCelulaInput({ tipo, valor, onChange, classe }) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const input = document.createElement('input');
  input.type = tipo;
  input.value = valor;
  if (classe) {
    input.className = classe;
  }
  input.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(input);
  return td;
}

function criarCelulaSelect({ valor, opcoes, onChange, classe }) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const select = document.createElement('select');
  if (classe) {
    select.className = classe;
  }
  opcoes.forEach((opcao) => {
    const option = document.createElement('option');
    option.value = opcao.valor;
    option.textContent = opcao.texto;
    if (opcao.valor === valor) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  select.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(select);
  return td;
}

function criarCelulaTextarea({ valor, onChange }) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const textarea = document.createElement('textarea');
  textarea.value = valor;
  textarea.rows = 2;
  textarea.className =
    'w-full rounded-xl border-slate-300 p-1 focus:border-violet-500 focus:ring-violet-500 resize-y min-h-[36px]';
  textarea.addEventListener('change', async (ev) => {
    await onChange(ev.target.value);
  });
  td.appendChild(textarea);
  return td;
}

function criarCelulaValor(dado) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center justify-end gap-1';
  const span = document.createElement('span');
  span.textContent = 'R$';
  span.className = 'text-slate-500';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = formatarNumero(dado.valorGasto);
  input.className =
    'w-28 rounded-xl border-slate-300 p-1 text-right focus:border-violet-500 focus:ring-violet-500';
  input.addEventListener('change', async (ev) => {
    const novoValor = Number.parseFloat(ev.target.value);
    const valorConvertido = Number.isFinite(novoValor) ? novoValor : 0;
    await atualizarPeca(dado, { valorGasto: valorConvertido });
    ev.target.value = formatarNumero(valorConvertido);
  });
  wrapper.appendChild(span);
  wrapper.appendChild(input);
  td.appendChild(wrapper);
  return td;
}

function criarCelulaStatus(dado) {
  const td = document.createElement('td');
  td.className = 'p-2';
  const select = document.createElement('select');
  select.className =
    'status-select text-xs font-medium rounded-full px-2 py-1 border focus:border-violet-500 focus:ring-violet-500';
  const opcoes = [
    { valor: 'NÃO FEITO', texto: 'Não feito' },
    { valor: 'EM ANDAMENTO', texto: 'Em andamento' },
    { valor: 'RESOLVIDO', texto: 'Resolvido' },
  ];
  opcoes.forEach(({ valor, texto }) => {
    const option = document.createElement('option');
    option.value = valor;
    option.textContent = texto;
    if (dado.status === valor) option.selected = true;
    select.appendChild(option);
  });
  aplicarCorStatus(select, dado.status);
  select.addEventListener('change', async (ev) => {
    const novoStatus = ev.target.value;
    await atualizarPeca(dado, { status: novoStatus });
    aplicarCorStatus(select, novoStatus);
  });
  td.appendChild(select);
  return td;
}

function criarCelulaAcoes(dado, tipo) {
  const td = document.createElement('td');
  td.className = 'p-2 text-right';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = 'Excluir';
  botao.className =
    'rounded-xl border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50';
  botao.addEventListener('click', async () => {
    const confirma = window.confirm('Deseja excluir este registro?');
    if (!confirma) return;
    if (tipo === 'peca') {
      await excluirPeca(dado.id);
    } else {
      await excluirReembolso(dado.id);
    }
  });
  td.appendChild(botao);
  return td;
}

async function atualizarPeca(dado, atualizacoes) {
  if (!pecasColRef) return;
  const ref = doc(pecasColRef, dado.id);
  const atualizado = { ...dado, ...atualizacoes };
  const { id, ...payload } = atualizado;
  await setDocWithCopy(ref, payload, uidAtual, null, {
    posVendasUid: obterPosVendasUid(),
  });
  Object.assign(dado, atualizacoes);
  const original = pecasCache.find((item) => item.id === dado.id);
  if (original) Object.assign(original, atualizacoes);
}

async function atualizarReembolso(dado, atualizacoes) {
  if (!reembolsosColRef) return;
  const ref = doc(reembolsosColRef, dado.id);
  const atualizado = { ...dado, ...atualizacoes };
  const { id, ...payload } = atualizado;
  await setDocWithCopy(ref, payload, uidAtual, null, {
    posVendasUid: obterPosVendasUid(),
  });
  Object.assign(dado, atualizacoes);
  const original = reembolsosCache.find((item) => item.id === dado.id);
  if (original) Object.assign(original, atualizacoes);
}

async function excluirPeca(id) {
  if (!pecasColRef) return;
  const ref = doc(pecasColRef, id);
  await deleteDocWithCopy(ref);
  pecasCache = pecasCache.filter((item) => item.id !== id);
  renderPecas();
}

async function excluirReembolso(id) {
  if (!reembolsosColRef) return;
  const ref = doc(reembolsosColRef, id);
  await deleteDocWithCopy(ref);
  reembolsosCache = reembolsosCache.filter((item) => item.id !== id);
  renderReembolsos();
}

async function deleteDocWithCopy(ref) {
  await deleteDoc(ref);
  const destinatarios = new Set();
  if (typeof window !== 'undefined') {
    const financeiroUid = window.responsavelFinanceiro?.uid;
    const posVendasUid = window.responsavelPosVendas?.uid;
    if (financeiroUid) destinatarios.add(financeiroUid);
    if (posVendasUid) destinatarios.add(posVendasUid);
  }

  destinatarios.delete(uidAtual);
  if (!destinatarios.size) return;

  const segmentos = ref.path.split('/');
  const relativo = segmentos.slice(2).join('/');

  for (const responsavelUid of destinatarios) {
    const copiaRef = doc(
      ref.firestore,
      `uid/${responsavelUid}/uid/${uidAtual}/${relativo}`,
    );
    await deleteDoc(copiaRef);
  }
}

// Tabs
for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('border-violet-600', 'text-violet-600');
      b.classList.add('border-transparent', 'text-slate-500');
    });
    document
      .querySelectorAll('.tab-panel')
      .forEach((p) => p.classList.add('hidden'));
    btn.classList.add('border-violet-600', 'text-violet-600');
    btn.classList.remove('border-transparent', 'text-slate-500');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
}
