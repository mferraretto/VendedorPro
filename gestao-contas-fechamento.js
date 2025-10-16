import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';
import { firebaseConfig, storageBucketUrl } from './firebase-config.js';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app, storageBucketUrl);

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const input = document.getElementById('inputPdfFechamento');
const btnProcessar = document.getElementById('btnProcessarPdf');
const btnExportar = document.getElementById('btnExportarExcel');
const tabelaDiv = document.getElementById('previewFechamento');
const paginacaoDiv = document.getElementById('paginacaoFechamento');
const totalDiv = document.getElementById('totalFechamento');
const statusDiv = document.getElementById('statusFechamento');

let lancamentos = [];
let paginaAtual = 1;
const pageSize = 20;

btnProcessar?.addEventListener('click', async () => {
  const files = Array.from(input?.files || []);
  if (!files.length) {
    statusDiv.textContent = 'Selecione um ou mais arquivos PDF.';
    return;
  }
  statusDiv.textContent = 'Processando...';
  lancamentos = [];
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const storagePath = `contasfechamento/${Date.now()}-${file.name}`;
    await uploadBytes(ref(storage, storagePath), file);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const lines = agruparLinhas(textContent.items);
      for (const line of lines) {
        if (line.trim()) {
          lancamentos.push({
            Arquivo: file.name,
            Pagina: i,
            Linha: line.trim(),
          });
        }
      }
    }
  }
  if (lancamentos.length) {
    btnExportar.disabled = false;
    paginaAtual = 1;
    renderTabela();
    statusDiv.textContent = `${lancamentos.length} lançamentos carregados.`;
    await salvarContasFechamento();
  } else {
    statusDiv.textContent = 'Nenhum lançamento encontrado.';
  }
});

function agruparLinhas(items) {
  const lines = [];
  let line = [];
  let prevY = null;
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    if (prevY === null || Math.abs(prevY - y) <= 1) {
      line.push(item.str);
    } else {
      lines.push(line.join('').trim());
      line = [item.str];
    }
    prevY = y;
  }
  if (line.length) lines.push(line.join('').trim());
  return lines;
}

// Processamento genérico: cada linha do PDF é armazenada sem formatação específica

function renderTabela() {
  const start = (paginaAtual - 1) * pageSize;
  const dados = lancamentos.slice(start, start + pageSize);
  const headers = ['Arquivo', 'Página', 'Linha'];
  let html =
    '<table class="w-full text-sm"><thead><tr>' +
    headers.map((h) => `<th class="text-left px-1">${h}</th>`).join('') +
    '</tr></thead><tbody>';
  for (const l of dados) {
    html +=
      '<tr>' +
      `<td>${l.Arquivo}</td>` +
      `<td>${l.Pagina}</td>` +
      `<td>${l.Linha}</td>` +
      '</tr>';
  }
  html += '</tbody></table>';
  tabelaDiv.innerHTML = html;
  totalDiv.textContent = '';

  const totalPages = Math.ceil(lancamentos.length / pageSize);
  let pagHtml = '';
  if (totalPages > 1) {
    pagHtml += `<button ${paginaAtual <= 1 ? 'disabled' : ''} id="prevFech">Anterior</button>`;
    pagHtml += `<span class="muted"> Página ${paginaAtual}/${totalPages} </span>`;
    pagHtml += `<button ${paginaAtual >= totalPages ? 'disabled' : ''} id="nextFech">Próxima</button>`;
  }
  paginacaoDiv.innerHTML = pagHtml;
  document.getElementById('prevFech')?.addEventListener('click', () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      renderTabela();
    }
  });
  document.getElementById('nextFech')?.addEventListener('click', () => {
    if (paginaAtual < totalPages) {
      paginaAtual++;
      renderTabela();
    }
  });
}

btnExportar?.addEventListener('click', () => {
  if (!lancamentos.length) return;
  const ws = XLSX.utils.json_to_sheet(lancamentos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fechamentos');
  XLSX.writeFile(wb, 'fechamentos.xlsx');
});

async function salvarContasFechamento() {
  try {
    const ops = lancamentos.map((l) =>
      addDoc(collection(db, 'contasfechamento'), l),
    );
    await Promise.all(ops);
  } catch (err) {
    console.error('Erro ao salvar contasfechamento', err);
  }
}

export {}; // for module scope
