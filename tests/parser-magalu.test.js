import { parseMagalu } from '../parser-magalu.js';

const p1 = `Pedido: 1457770464822704
Data estimada: 08/08/2025
REMETENTE
COLLORE
...`;
const p2 = `DECLARAÇÃO DE CONTEÚDO
Código de Rastreamento: B2D076FCCCE26813
REMETENTE
NOME: Magalu Collore
IDENTIFICAÇÃO DOS BENS
Nº SKU DESCRIÇÃO VARIAÇÃO QTD
1 InfantilRosa 28
Penteadeira Rosa MDF com
Espelho Infantil - Estilo
Camarim para Crianças
1
CPF/CNPJ: 27870958875
`;

const out = parseMagalu([
  { pagina: 1, text: p1 },
  { pagina: 2, text: p2 },
]);
console.assert(out.pedido === '1457770464822704');
console.assert(out.rastreio === 'B2D076FCCCE26813');
console.assert(out.loja === 'COLLORE');
console.assert(out.sku === 'InfantilRosa');
console.assert(out.descricao.toLowerCase().includes('penteadeira rosa mdf'));
console.assert(out.qtd === '1');
console.assert(out.dataEntregaPrevistaISO === '2025-08-08');
console.assert(/2025-08-/.test(out.dataEnvioISO) || out.dataEnvioISO === '');
