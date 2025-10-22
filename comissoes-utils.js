export const TIERS = [
  { limite: 150_000, taxa: 0.03 },
  { limite: 250_000, taxa: 0.04 },
  { limite: Infinity, taxa: 0.05 },
];

export function taxaFinalPorTotal(total) {
  if (total <= TIERS[0].limite) return TIERS[0].taxa;
  if (total <= TIERS[1].limite) return TIERS[1].taxa;
  return TIERS[2].taxa;
}

export function faltasParaTiers(total) {
  return {
    para4: Math.max(0, 150_000 - total),
    para5: Math.max(0, 250_000 - total),
  };
}

// Chave mensal no fuso Brasil
export function anoMesBR(d = new Date()) {
  const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}`;
}

// Utilitário para calcular resumo mensal a partir de uma lista de saques
export function calcularResumo(saques = []) {
  const totalSacado = saques.reduce((s, x) => s + (x.valor || 0), 0);
  const taxaFinal = taxaFinalPorTotal(totalSacado);
  const comissaoPrevista = totalSacado * taxaFinal;
  const comissaoJaPaga = saques.reduce(
    (s, x) => s + (x.valor || 0) * (x.percentualPago || 0),
    0,
  );
  const ajusteFinal = comissaoPrevista - comissaoJaPaga;
  const { para4, para5 } = faltasParaTiers(totalSacado);
  return {
    totalSacado,
    taxaFinal,
    comissaoPrevista,
    comissaoJaPaga,
    ajusteFinal,
    faltamPara4: para4,
    faltamPara5: para5,
  };
}
