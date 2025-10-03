export function parseShopeePage({ text = '', pagina } = {}) {
  const normalizedText = (text || '').replace(/\r\n?/g, '\n');
  const linhasLimpa = normalizedText
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha);
  const only = (re, i = 1) => {
    const match = normalizedText.match(re);
    return (match || [])[i] || '';
  };

  const nfeChave = only(/\b(\d{44})\b/);
  const rastreio = only(/\b(BR[0-9A-Z]{8,})\b/i).toUpperCase();

  const upCode = only(/\b(UP[0-9A-Z]+)\b/) || only(/#(UP[0-9A-Z]+)/);

  const loja = 'Shopee';

  const mPrevista = normalizedText.match(
    /Envio previsto:[^\d]{0,80}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const dataPrevistaEnvioBR = mPrevista ? mPrevista[1] : '';
  const dataPrevistaEnvioISO = dataPrevistaEnvioBR
    ? dataPrevistaEnvioBR.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')
    : '';

  const mEmissao = normalizedText.match(
    /Emiss[aã]o:\s*(?:\d+\s+){0,2}(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})/i,
  );
  const emissaoNFe = mEmissao ? `${mEmissao[1]} ${mEmissao[2]}` : '';
  const emissaoNFeISO = mEmissao
    ? mEmissao[1].replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1') +
      'T' +
      mEmissao[2]
    : '';

  const itemStart = normalizedText.search(/^\s*\d+\s*[.\-–]\s+/m);
  let produto = '';
  let qtd = '1';

  if (itemStart !== -1) {
    const tail = normalizedText.slice(itemStart);
    const firstLineMatch = tail.match(/^\s*\d+\s*[.\-–]\s+(.+)$/m);
    const firstLine = (firstLineMatch && firstLineMatch[1]) || '';
    const nextLines = tail
      .split('\n')
      .slice(1, 3)
      .map((linha) => linha.trim());
    const joined = [firstLine, ...nextLines]
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const qtdMatch = joined.match(/\*(\d+)\s*$/);
    qtd = (qtdMatch && qtdMatch[1]) || '1';
    produto = joined.replace(/\s*\*\d+\s*$/, '').trim();
  }

  const skuHeader = only(/SKU:\s*([^\n]+)/i);
  const skuInterno =
    (skuHeader.match(/#(UP[0-9A-Z]+)/) || [])[1] || upCode || '';

  const skuDeadline = (() => {
    const regex = /Deadline:\s*\d{2}\/\d{2}\/\d{4}\s*1\.\s*/i;
    const match = normalizedText.match(regex);
    if (!match) return '';
    const inicioSku = match.index + match[0].length;
    if (inicioSku == null || Number.isNaN(inicioSku)) return '';
    const resto = normalizedText.slice(inicioSku).split('\n')[0] || '';
    return resto.trim();
  })();

  const pedidoAntesCep = (() => {
    const inlineMatch = normalizedText.match(
      /([A-Z0-9-]{6,})\s*(?:\r?\n)?\s*\b\d{5}-\d{3}\b/,
    );
    if (inlineMatch) {
      return inlineMatch[1];
    }

    for (let indice = 0; indice < linhasLimpa.length; indice += 1) {
      const linha = linhasLimpa[indice];
      const cepMatch = linha.match(/\b\d{5}-\d{3}\b/);
      if (!cepMatch) continue;

      const antesCep = linha.slice(0, cepMatch.index).trim();
      const candidatoInline = (antesCep.match(/([A-Z0-9-]{6,})\s*$/) || [])[1];
      if (candidatoInline) return candidatoInline;

      const anterior = linhasLimpa[indice - 1] || '';
      const candidatoAnterior = (anterior.match(/([A-Z0-9-]{6,})\s*$/) ||
        [])[1];
      if (candidatoAnterior) return candidatoAnterior;
    }

    return '';
  })();

  const pedido = pedidoAntesCep.replace(/\s+/g, '') || upCode || rastreio || '';

  return {
    modelo: 'shopee',
    pagina,
    nfeChave,
    pedido,
    rastreio,
    loja,
    sku: skuDeadline || skuInterno,
    produto,
    qtd,
    dataPrevistaEnvio: dataPrevistaEnvioBR,
    dataPrevistaEnvioISO,
    emissaoNFe,
    emissaoNFeISO,
  };
}
