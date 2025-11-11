(function () {
  const COST_LEVEL_CONFIG = [
    {
      key: 'minimo',
      valueHeaders: ['Custo Mínimo (R$)', 'Custo Minimo (R$)'],
      commissionHeaders: [
        'Comissão Custo Mínimo (%)',
        'Comissao Custo Minimo (%)',
      ],
    },
    {
      key: 'medio',
      valueHeaders: ['Custo Médio (R$)', 'Custo Medio (R$)'],
      commissionHeaders: [
        'Comissão Custo Médio (%)',
        'Comissao Custo Medio (%)',
      ],
    },
    {
      key: 'maximo',
      valueHeaders: ['Custo Máximo (R$)', 'Custo Maximo (R$)'],
      commissionHeaders: [
        'Comissão Custo Máximo (%)',
        'Comissao Custo Maximo (%)',
      ],
    },
  ];

  const REMOVE_DIACRITICS_REGEX = /[\u0300-\u036f]/g;

  function normalizeHeaderKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(REMOVE_DIACRITICS_REGEX, '')
      .trim()
      .toLowerCase();
  }

  function buildHeaderLookup(headers = []) {
    return headers.reduce((acc, header) => {
      const normalized = normalizeHeaderKey(header);
      if (!(normalized in acc)) {
        acc[normalized] = header;
      }
      return acc;
    }, {});
  }

  function getValueFromVariants(product, headerLookup, variants = []) {
    for (const variant of variants) {
      if (Object.prototype.hasOwnProperty.call(product, variant)) {
        const value = product[variant];
        if (value !== undefined && value !== '') {
          return value;
        }
      }
      const normalized = normalizeHeaderKey(variant);
      const original = headerLookup[normalized];
      if (original && Object.prototype.hasOwnProperty.call(product, original)) {
        const value = product[original];
        if (value !== undefined && value !== '') {
          return value;
        }
      }
    }
    return undefined;
  }

  function parseNumber(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(/\s/g, '').replace(',', '.');
      if (!normalized) return 0;
      const parsed = parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function formatTwoDecimals(number) {
    const parsed = parseNumber(number);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }

  function cloneCosts(custos = {}) {
    const clone = {};
    COST_LEVEL_CONFIG.forEach(({ key }) => {
      const info = custos[key] || {};
      clone[key] = {
        valor: formatTwoDecimals(info.valor),
        comissao: formatTwoDecimals(info.comissao),
      };
    });
    return clone;
  }

  function ensureCostsStructure(custosEntrada = {}, fallbackCusto = 0) {
    const normalizado = {};
    COST_LEVEL_CONFIG.forEach(({ key }) => {
      const info = custosEntrada[key] || {};
      normalizado[key] = {
        valor: formatTwoDecimals(info.valor),
        comissao: formatTwoDecimals(info.comissao),
      };
    });
    if (!(normalizado.medio?.valor > 0) && fallbackCusto > 0) {
      normalizado.medio.valor = formatTwoDecimals(fallbackCusto);
    }
    return normalizado;
  }

  function calculateTotals(taxas = {}) {
    return Object.entries(taxas).reduce(
      (acc, [key, val]) => {
        const numero = parseNumber(val);
        if (String(key).includes('%')) acc.percent += numero;
        else acc.fix += numero;
        return acc;
      },
      { percent: 0, fix: 0 },
    );
  }

  function calculatePricesPerCost(
    custosNormalizados,
    totalPercentual,
    totalFixo,
  ) {
    const calculos = {};
    let referencia = null;

    COST_LEVEL_CONFIG.forEach(({ key }) => {
      const info = custosNormalizados[key] || {};
      if (!(info.valor > 0)) {
        calculos[key] = null;
        return;
      }

      const percentualTotal = totalPercentual + (info.comissao || 0);
      if (percentualTotal >= 100) {
        calculos[key] = null;
        return;
      }

      const precoBase = (info.valor + totalFixo) / (1 - percentualTotal / 100);
      const precoPromo = precoBase;
      const precoMedio = precoBase * 1.05;
      const precoIdeal = precoBase * 1.1;

      calculos[key] = {
        custo: formatTwoDecimals(info.valor),
        comissao: formatTwoDecimals(info.comissao),
        precoMinimo: formatTwoDecimals(precoBase),
        precoPromo: formatTwoDecimals(precoPromo),
        precoMedio: formatTwoDecimals(precoMedio),
        precoIdeal: formatTwoDecimals(precoIdeal),
      };

      if (!referencia || (referencia !== 'medio' && key === 'medio')) {
        referencia = key;
      }
    });

    if (!referencia) {
      referencia = COST_LEVEL_CONFIG.map(({ key }) => key).find(
        (nivel) => calculos[nivel],
      );
    }

    return { calculos, referencia };
  }

  function formatTaxas(taxas = {}) {
    const formatted = {};
    Object.entries(taxas).forEach(([key, value]) => {
      formatted[key] = formatTwoDecimals(value);
    });
    return formatted;
  }

  function montarResultadoImportacao(
    custosNormalizados,
    totalPercentual,
    totalFixo,
    taxasDetalhadas,
    taxaPercentual,
  ) {
    const { calculos, referencia } = calculatePricesPerCost(
      custosNormalizados,
      totalPercentual,
      totalFixo,
    );

    if (!referencia || !calculos[referencia]) {
      return null;
    }

    const custosInformados = cloneCosts(custosNormalizados);

    const precoMinimoBase = calculos.minimo?.precoPromo;
    const precoMedioBase = calculos.medio?.precoPromo;
    const precoIdealBase = calculos.maximo?.precoPromo;

    const precoMinimo =
      precoMinimoBase ?? precoMedioBase ?? precoIdealBase ?? 0;
    const precoMedio = precoMedioBase ?? precoIdealBase ?? precoMinimo;
    const precoIdeal = precoIdealBase ?? precoMedioBase ?? precoMedio;
    const precoPromo = precoMinimo;

    return {
      taxaPercentual: formatTwoDecimals(taxaPercentual),
      custosInformados,
      custosCalculados: calculos,
      referencia,
      custoBase: custosInformados[referencia]?.valor || 0,
      precoMinimo: formatTwoDecimals(precoMinimo),
      precoIdeal: formatTwoDecimals(precoIdeal),
      precoMedio: formatTwoDecimals(precoMedio),
      precoPromo: formatTwoDecimals(precoPromo),
      taxas: formatTaxas(taxasDetalhadas),
    };
  }

  function gerarResultadoComTaxa(
    custosNormalizados,
    totaisTaxas,
    taxasBase,
    taxaOverride,
  ) {
    const taxaAtual = parseNumber(taxasBase['Taxas da Plataforma (%)']);
    const taxaAplicada =
      typeof taxaOverride === 'number' && Number.isFinite(taxaOverride)
        ? taxaOverride
        : taxaAtual;
    const totalPercentSemTaxa = totaisTaxas.percent - taxaAtual;
    const totalPercentual = totalPercentSemTaxa + taxaAplicada;
    const taxasDetalhadas = {
      ...taxasBase,
      'Taxas da Plataforma (%)': taxaAplicada,
    };
    return montarResultadoImportacao(
      custosNormalizados,
      totalPercentual,
      totaisTaxas.fix,
      taxasDetalhadas,
      taxaAplicada,
    );
  }

  function extrairCustosDaPlanilha(product, headerLookup, custoBase) {
    const custos = {};
    COST_LEVEL_CONFIG.forEach(({ key, valueHeaders, commissionHeaders }) => {
      const valorBruto = getValueFromVariants(
        product,
        headerLookup,
        valueHeaders,
      );
      const comissaoBruta = getValueFromVariants(
        product,
        headerLookup,
        commissionHeaders,
      );
      custos[key] = {
        valor: parseNumber(valorBruto),
        comissao: parseNumber(comissaoBruta),
      };
    });
    return ensureCostsStructure(custos, custoBase);
  }

  // Toggle visibility of the Importar Produtos card on the precificação page
  window.toggleImportCard = function () {
    var card = document.getElementById('importarProdutosCard');
    var btn = document.getElementById('toggleImportarBtn');
    if (!card || !btn) return;
    card.classList.toggle('hidden');
    if (card.classList.contains('hidden')) {
      btn.textContent = 'Exibir Importar Produtos';
    } else {
      btn.textContent = 'Esconder Importar Produtos';
    }
  };

  // Generate a template spreadsheet for pricing imports, including dual Shopee rate flag
  window.downloadPricingTemplate = function () {
    const headers = [
      'Produto',
      'SKU',
      'Plataforma',
      'Custo (R$)',
      'Custo Mínimo (R$)',
      'Comissão Custo Mínimo (%)',
      'Custo Médio (R$)',
      'Comissão Custo Médio (%)',
      'Custo Máximo (R$)',
      'Comissão Custo Máximo (%)',
      'Taxas da Plataforma (%)',
      'Custo Fixo Plataforma (R$)',
      'Frete (R$)',
      'Taxa de Transação (%)',
      'Taxa de Transferência (%)',
      'Taxa de Antecipação (%)',
      'Custos Variáveis (R$)',
      'Imposto (%)',
      'Comissão do Vendedor (%)',
      'Duas Taxas Shopee (S/N)',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, 'modelo_precificacao.xlsx');
  };

  // Import pricing data from a spreadsheet and optionally calculate Shopee prices for 14% and 20%
  window.importPricingFile = async function () {
    const fileInput = document.getElementById('pricingFileInput');
    const file = fileInput.files[0];

    if (!file) {
      showToast('Selecione um arquivo primeiro!', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (jsonData.length < 2) {
        showToast('Planilha vazia ou formato inválido!', 'warning');
        return;
      }

      const headers = jsonData[0];
      const headerLookup = buildHeaderLookup(headers);
      let imported = 0;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const product = {};
        for (let j = 0; j < headers.length; j++) {
          product[headers[j]] = row[j];
        }

        const nome = (
          getValueFromVariants(product, headerLookup, [
            'Produto',
            'Nome do Produto',
          ]) || ''
        )
          .toString()
          .trim();
        const sku = (
          getValueFromVariants(product, headerLookup, ['SKU', 'sku']) || ''
        )
          .toString()
          .trim();
        const plataforma = (
          getValueFromVariants(product, headerLookup, ['Plataforma']) || ''
        )
          .toString()
          .trim()
          .toUpperCase();
        const custo = parseNumber(
          getValueFromVariants(product, headerLookup, [
            'Custo',
            'Custo do Produto',
            'Custo (R$)',
          ]),
        );

        if (!nome || !plataforma) continue;

        const custosNormalizados = extrairCustosDaPlanilha(
          product,
          headerLookup,
          custo,
        );
        const possuiCustoValido = COST_LEVEL_CONFIG.some(
          ({ key }) => custosNormalizados[key]?.valor > 0,
        );
        if (!possuiCustoValido) continue;

        const duasVal = (
          getValueFromVariants(product, headerLookup, [
            'Duas Taxas Shopee (S/N)',
          ]) || ''
        )
          .toString()
          .trim()
          .toLowerCase();
        const usarDuas =
          plataforma === 'SHOPEE' &&
          ['s', 'sim', 'y', 'yes', '1', 'true'].includes(duasVal);

        const taxas = {
          'Taxas da Plataforma (%)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Taxas da Plataforma (%)',
              'Taxa da Plataforma',
            ]),
          ),
          'Custo Fixo Plataforma (R$)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Custo Fixo Plataforma (R$)',
              'Custo Fixo',
            ]),
          ),
          'Frete (R$)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, ['Frete (R$)']),
          ),
          'Taxa de Transação (%)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Taxa de Transação (%)',
            ]),
          ),
          'Taxa de Transferência (%)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Taxa de Transferência (%)',
            ]),
          ),
          'Taxa de Antecipação (%)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Taxa de Antecipação (%)',
            ]),
          ),
          'Custos Variáveis (R$)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Custos Variáveis (R$)',
            ]),
          ),
          'Imposto (%)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, ['Imposto (%)']),
          ),
          'Comissão do Vendedor (%)': formatTwoDecimals(
            getValueFromVariants(product, headerLookup, [
              'Comissão do Vendedor (%)',
            ]),
          ),
        };

        const totais = calculateTotals(taxas);

        if (usarDuas) {
          const resultados = [20, 14]
            .map((taxa) =>
              gerarResultadoComTaxa(custosNormalizados, totais, taxas, taxa),
            )
            .filter(Boolean);

          if (resultados.length) {
            const salvo = await salvarProdutoMultiplasTaxas(
              nome,
              sku,
              plataforma,
              resultados,
            );
            if (salvo) imported++;
          }
          continue;
        }

        const resultadoBasico = gerarResultadoComTaxa(
          custosNormalizados,
          totais,
          taxas,
        );
        if (!resultadoBasico) continue;

        const salvo = await salvarProduto(
          nome,
          sku,
          plataforma,
          resultadoBasico,
        );
        if (salvo) imported++;
      }

      showToast(`${imported} produtos importados!`, 'success');
      fileInput.value = '';
    };

    reader.readAsArrayBuffer(file);
  };
})();
