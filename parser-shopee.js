export function parseShopeePage({ text = '', pagina } = {}) {
  const normalizedText = (text || '').replace(/\r\n?/g, '\n');
  const only = (re, i = 1) => {
    const match = normalizedText.match(re);
    return (match || [])[i] || '';
  };

  const nfeChave = only(/\b(\d{44})\b/);
  const rastreio = only(/\b(BR[0-9A-Z]{8,})\b/i).toUpperCase();

  const upCode = only(/\b(UP[0-9A-Z]+)\b/) || only(/#(UP[0-9A-Z]+)/);

  const loja = (() => {
    const afterRemetente = (normalizedText.split(/REMETENTE/i)[1] || '')
      .split('\n')
      .slice(0, 10)
      .map((linha) => linha.trim())
      .filter(
        (linha) =>
          linha &&
          !/CEP|Envio previsto|AG[ÊE]NCIA|Rua|Avenida|R\s|Av\.|[0-9]{5}-[0-9]{3}/i.test(
            linha,
          ),
      );

    const prioridade = afterRemetente.find((linha) =>
      /LTDA|EIRELI|STORE|COM[EÉ]RCIO|IND(?:[ÚU]STRIA)?/i.test(linha),
    );

    if (prioridade) return prioridade.replace(/\s{2,}/g, ' ').trim();

    const fallback = afterRemetente.find((linha) => /\b\w+\s+\w+/.test(linha));
    return (fallback || '').replace(/\s{2,}/g, ' ').trim();
  })();

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

  const pedido = upCode || rastreio || '';

  return {
    modelo: 'shopee',
    pagina,
    nfeChave,
    pedido,
    rastreio,
    loja,
    sku: skuInterno,
    produto,
    qtd,
    dataPrevistaEnvio: dataPrevistaEnvioBR,
    dataPrevistaEnvioISO,
    emissaoNFe,
    emissaoNFeISO,
  };
}
