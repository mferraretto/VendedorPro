import assert from 'node:assert/strict';
import { calcularResumo, anoMesPorDataISO } from '../comissoes-utils.js';

function testeAbaixo150k() {
  const saques = [
    { valor: 50_000, percentualPago: 0.03 },
    { valor: 40_000, percentualPago: 0.04 },
  ];
  const r = calcularResumo(saques);
  assert.equal(r.totalSacado, 90_000);
  assert.equal(r.taxaFinal, 0.03);
  assert.equal(r.comissaoPrevista, 2_700);
  assert.equal(r.comissaoJaPaga, 3_100);
  assert.equal(r.ajusteFinal, -400);
  assert.equal(r.faltamPara4, 60_000);
  assert.equal(r.faltamPara5, 160_000);
}

function testeCruza150k() {
  const saques = [
    { valor: 100_000, percentualPago: 0.03 },
    { valor: 60_000, percentualPago: 0.03 },
  ];
  const r = calcularResumo(saques);
  assert.equal(r.totalSacado, 160_000);
  assert.equal(r.taxaFinal, 0.04);
  assert.equal(r.comissaoPrevista, 6_400);
  assert.equal(r.comissaoJaPaga, 4_800);
  assert.equal(r.ajusteFinal, 1_600);
  assert.equal(r.faltamPara4, 0);
  assert.equal(r.faltamPara5, 90_000);
}

function testeCruza250k() {
  const saques = [
    { valor: 200_000, percentualPago: 0.04 },
    { valor: 60_000, percentualPago: 0.04 },
  ];
  const r = calcularResumo(saques);
  assert.equal(r.totalSacado, 260_000);
  assert.equal(r.taxaFinal, 0.05);
  assert.equal(r.comissaoPrevista, 13_000);
  assert.equal(r.comissaoJaPaga, 10_400);
  assert.equal(r.ajusteFinal, 2_600);
  assert.equal(r.faltamPara4, 0);
  assert.equal(r.faltamPara5, 0);
}

function testeAnoMesPorDataISO() {
  assert.equal(anoMesPorDataISO('2024-05-01'), '2024-05');
  assert.equal(anoMesPorDataISO('2024-05-01T00:00:00-03:00'), '2024-05');
  assert.equal(anoMesPorDataISO('2024-05-01T03:00:00.000Z'), '2024-05');
}

testeAbaixo150k();
testeCruza150k();
testeCruza250k();
testeAnoMesPorDataISO();
console.log('Tests passed');
