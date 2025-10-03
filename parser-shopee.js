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
    const [, afterRemetente = ''] = normalizedText.split(/REMETENTE/i);
    const candidatos = afterRemetente
      .split(/\n/)
      .slice(0, 8)
      .map((linha) => linha.trim())
      .filter(
        (linha) =>
          linha &&
          !/CEP|Envio previsto|AG[ÊE]NCIA|Rua|R\b|Avenida|Av\.|[0-9]{5}-[0-9]{3}/i.test(
            linha,
          ),
      );

    const prioridade = candidatos.find((linha) =>
      /LTDA|EIRELI|ME|STORE|COM|IND|LTDA\.?/i.test(linha),
    );

    if (prioridade) return prioridade.replace(/\s{2,}/g, ' ').trim();

    const fallback = candidatos.find((linha) => /\b\w+\s+\w+/.test(linha));
    return (fallback || '').replace(/\s{2,}/g, ' ').trim();
  })();

  const dataPrevistaEnvioBR = only(/Envio previsto:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const emissaoNFeBR = only(
    /Emiss[aã]o:\s*(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/i,
  );

  const toISO_BR = (value) =>
    value ? value.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') : '';

  const emissaoNFeISO = emissaoNFeBR
    ? emissaoNFeBR.replace(
        /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/,
        '$3-$2-$1T$4',
      )
    : '';

  const itemLine = (normalizedText.match(/^\s*\d+\.\s+.+$/m) || [''])[0];
  const produto = itemLine
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/\s+\*[0-9]+$/, '')
    .trim();
  const qtd = (itemLine.match(/\*(\d+)\s*$/) || [])[1] || '1';

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
    dataPrevistaEnvioISO: toISO_BR(dataPrevistaEnvioBR),
    emissaoNFe: emissaoNFeBR,
    emissaoNFeISO,
  };
}
