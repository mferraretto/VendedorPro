export function parseMagalu(pages = []) {
  const getPageText = (numero) => {
    const pagina = pages.find((p) => Number(p?.pagina) === numero);
    return (pagina?.text || '').replace(/\r\n?/g, '\n');
  };

  const p1 = getPageText(1);
  const p2 = getPageText(2);

  const pedido = (p1.match(/Pedido:\s*(\d{10,})/) || [])[1] || '';
  const dataEntregaPrevista =
    (p1.match(/Data\s+estimada:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1] || '';

  const rastreio =
    (p2.match(/C[oó]digo\s+de\s+Rastreamento:\s*([A-Z0-9-]{8,})/i) || [])[1] ||
    '';

  const loja = 'MAGALU';

  const norm = (data) =>
    data ? data.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') : '';

  const itens = (() => {
    const bloco =
      (p2.match(
        /IDENTIFICA[ÇC][AÃ]O DOS BENS([\s\S]+?)(?:\n{2,}|UPNDA|CPF\/CNPJ|Total\s+\d+|$)/i,
      ) || [])[1] || '';

    const linhas = bloco
      .split(/\n+/)
      .map((linha) => linha.trim())
      .filter(Boolean);

    const linhaItem = linhas.find((linha) => /^\d+\s+\S+/.test(linha)) || '';

    let sku =
      (p2.match(/QTD\s*1\s*([A-Za-z0-9]{20})/) || [])[1] ||
      (p2.match(/QTD\s*1[^A-Za-z0-9]*([A-Za-z0-9]{20})/) || [])[1] ||
      '';
    let variacao = '';
    if (linhaItem) {
      const partes = linhaItem.match(/^\d+\s+([^\s]+)(?:\s+([^\s]+))?/);
      if (partes) {
        if (!sku) {
          sku = partes[1] || '';
        }
        const possivelVariacao = partes[2] || '';
        if (
          possivelVariacao &&
          !/^DESCRI(?:[CÇ][AÃ]O)?$/i.test(possivelVariacao)
        ) {
          variacao = possivelVariacao;
        }
      }
    }

    const startIndex = linhaItem ? linhas.indexOf(linhaItem) : -1;
    const descricaoLinhas = [];
    if (startIndex >= 0) {
      for (let i = startIndex + 1; i < linhas.length; i += 1) {
        const atual = linhas[i];
        if (!atual) continue;
        if (/^QTD\b/i.test(atual)) continue;
        if (/^\d+$/.test(atual)) break;
        if (/^CPF\/CNPJ/i.test(atual)) break;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(atual)) break;
        descricaoLinhas.push(atual);
      }
    }

    const descricao = descricaoLinhas
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const qtd =
      (bloco.match(/\bQTD\b[\s\S]*?(\d+)/i) || [])[1] ||
      linhas.find((linha) => /^\d+$/.test(linha)) ||
      '1';

    return {
      sku,
      variacao,
      descricao,
      qtd: String(qtd).trim() || '1',
    };
  })();

  const dataEnvio =
    (p2.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}/) || [])[1] ||
    (p1.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) || [])[1] ||
    '';

  const dataEntregaPrevistaISO = norm(dataEntregaPrevista);
  const dataEnvioISO = norm(dataEnvio);
  const dataTexto = dataEntregaPrevista || dataEnvio || '';
  const dataNormalizada = dataEntregaPrevistaISO || dataEnvioISO || '';

  return {
    modelo: 'magalu',
    pedido,
    dataEntregaPrevista,
    dataEntregaPrevistaISO,
    rastreio,
    loja,
    sku: itens.sku,
    variacao: itens.variacao,
    descricao: itens.descricao,
    qtd: itens.qtd,
    dataEnvio,
    dataEnvioISO,
    dataTexto,
    dataNormalizada,
  };
}
