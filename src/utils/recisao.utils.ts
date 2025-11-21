/**
 * Rescisão - Módulo Profissional (Modelo Contábil Tradicional)
 *
 * - Totalmente modular: funções puras para cada parcela.
 * - Validações básicas de entrada.
 * - Regras documentadas e parametrizáveis.
 * - Arredondamento consistente (2 casas).
 *
 * Nota: esse módulo entrega o motor de cálculo. Tributação (INSS/IRRF) não está aplicada aqui —
 * deixe isso para um módulo fiscal separado que consuma os valores brutos gerados por este motor.
 */

/* ============================
   Tipos
   ============================ */

export type MotivoRescisao = 'sem_justa_causa' | 'pedido_demissao' | 'justa_causa' | 'acordo';

export type TipoAviso = 'trabalhado' | 'indenizado' | 'nao_cumprido';

export interface DadosRescisao {
  salario: number; // salário mensal (valor base)
  dataAdmissao: string; // ISO date string YYYY-MM-DD
  dataSaida: string; // ISO date string YYYY-MM-DD
  motivo: MotivoRescisao;
  aviso: TipoAviso;
  feriasVencidas: boolean;
  // opcional: numero de dias de faltas não justificadas no periodo (afeta contagem de meses)
  faltas?: number;
}

export interface ResultadoDetalhado {
  saldoSalario: number;
  avisoPrevio: number;
  decimoTerceiro: number;
  feriasProporcionais: number;
  umTercoFerias: number;
  feriasVencidas: number;
  fgtsDepositos: number;
  multaFgts: number;
  totalBruto: number;
  breakdown: Record<string, number>;
}

export interface LogItem {
  nome: string;
  detalhe?: string;
  valor: number;
}

/* ============================
   Constantes de Regra (fáceis de ajustar)
   ============================ */

const DIAS_POR_MES = 30;
const REGRA_15_DIAS = 15; // se trabalhou >= 15 dias no mês, conta como mês inteiro
const FGTS_PERC = 0.08; // 8%
const MULTA_FGTS_PERC = 0.4; // 40%
const AVISO_BASE_DIAS = 30; // base aviso prévio
const AVISO_DIAS_POR_ANO = 3; // adicionais por ano completo de serviço
const AVISO_MAX_DIAS = 90; // teto máximo (30 + 60) -> 90 dias

/* ============================
   Helpers
   ============================ */

function throwIf(condition: boolean, message: string): void {
  if (condition) throw new Error(message);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Converte string ISO para Date (meio-dia UTC para evitar problemas de timezone)
 */
function toDateSafe(iso: string): Date {
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) throw new Error(`Data inválida: ${iso}`);
  return d;
}

/**
 * Conta meses completos entre duas datas (ano/mês), sem arredondar dias.
 * Ex: 2020-01-15 a 2020-04-10 -> 3 (jan->fev->mar->abr -> diferença de meses = 3)
 */
export function diffMesesSimples(admissao: Date, saida: Date): number {
  return (saida.getFullYear() - admissao.getFullYear()) * 12 + (saida.getMonth() - admissao.getMonth());
}

/**
 * Itera pelos meses entre admissão e saída e conta quantos meses têm >= REGRA_15_DIAS de trabalho.
 * Usa como unidade meses civis (do dia 1 ao último dia do mês).
 */
export function contarMesesPorQuinzeDias(admissao: Date, saida: Date): number {
  // se admissão após saída -> 0
  if (saida < admissao) return 0;

  let count = 0;
  let atual = new Date(admissao.getFullYear(), admissao.getMonth(), 1);

  const ultimoMes = new Date(saida.getFullYear(), saida.getMonth(), 1);

  while (atual <= ultimoMes) {
    const primeiroDiaMes = new Date(atual.getFullYear(), atual.getMonth(), 1);
    const ultimoDiaMes = new Date(atual.getFullYear(), atual.getMonth() + 1, 0);

    const inicioConsiderado = admissao > primeiroDiaMes ? admissao : primeiroDiaMes;
    const fimConsiderado = saida < ultimoDiaMes ? saida : ultimoDiaMes;

    const diasTrab = Math.max(0, Math.floor((+fimConsiderado - +inicioConsiderado) / (1000 * 60 * 60 * 24)) + 1);

    if (diasTrab >= REGRA_15_DIAS) count++;

    atual.setMonth(atual.getMonth() + 1);
  }

  return count;
}

/**
 * Conta meses inteiros trabalhados (cada mês iniciando no mesmo dia da admissão).
 * Útil para alguns cálculos alternativos.
 */
export function contarMesesInteiros(admissao: Date, saida: Date): number {
  const ad = new Date(admissao.getFullYear(), admissao.getMonth(), admissao.getDate());
  const sd = new Date(saida.getFullYear(), saida.getMonth(), saida.getDate());
  let months =
    (sd.getFullYear() - ad.getFullYear()) * 12 + (sd.getMonth() - ad.getMonth());
  if (sd.getDate() < ad.getDate()) months--;
  return Math.max(0, months);
}

/* ============================
   Cálculos modulares
   ============================ */

/**
 * Calcula o saldo de salário (dias trabalhados no mês da saída).
 * Usa convenção 30 avos por mês (salario/30 * diasTrab).
 *
 * @param salario Salário mensal
 * @param saida Data de saída
 * @returns valor do saldo de salário (arredondado)
 */
export function calcularSaldoSalario(salario: number, saida: Date): number {
  throwIf(!(salario > 0), 'salario deve ser > 0');
  const diasNoMesSaida = saida.getDate();
  const saldo = (salario / DIAS_POR_MES) * diasNoMesSaida;
  return round2(saldo);
}

/**
 * Calcula aviso prévio indenizado (ou negativo se aviso não cumprido em pedido de demissão),
 * segundo regra contábil tradicional: 30 dias base + 3 dias por ano completo de serviço, até máximo AVISO_MAX_DIAS.
 *
 * @param salario Salário mensal
 * @param admissao Data de admissão
 * @param saida Data de saída
 * @param motivo motivo da rescisão (influencia apenas na interpretação de "pedido_demissão")
 * @param tipoAviso 'trabalhado' | 'indenizado' | 'nao_cumprido'
 * @returns valor do aviso (positivo/negativo conforme caso), arredondado
 */
export function calcularAvisoPrevio(
  salario: number,
  admissao: Date,
  saida: Date,
  motivo: MotivoRescisao,
  tipoAviso: TipoAviso
): number {
  throwIf(!(salario > 0), 'salario deve ser > 0');
  // anos completos de serviço
  const mesesTotais = diffMesesSimples(admissao, saida);
  const anosCompletos = Math.floor(mesesTotais / 12);

  const adicionais = Math.min(anosCompletos * AVISO_DIAS_POR_ANO, AVISO_MAX_DIAS - AVISO_BASE_DIAS);
  const diasAviso = AVISO_BASE_DIAS + adicionais;

  if (tipoAviso === 'indenizado' && motivo === 'sem_justa_causa') {
    const valor = (salario / DIAS_POR_MES) * diasAviso;
    return round2(valor);
  }

  if (tipoAviso === 'nao_cumprido' && motivo === 'pedido_demissao') {
    // desconto equivalente a aviso indenizado (convenção contábil)
    const valor = - (salario / DIAS_POR_MES) * diasAviso;
    return round2(valor);
  }

  // aviso trabalhado --> não gera pagamento indenizado
  return 0;
}

/**
 * Calcula o 13º proporcional usando a regra dos 15 dias por mês.
 * Conta meses no ano corrente (do Jan até mês da saída) com >=15 dias trabalhados.
 *
 * @param salario Salário mensal
 * @param admissao Data admissão
 * @param saida Data saída
 * @returns valor do 13º proporcional (arredondado)
 */
export function calcularDecimoTerceiroProporcional(
  salario: number,
  admissao: Date,
  saida: Date
): number {
  throwIf(!(salario > 0), 'salario deve ser > 0');

  // Considera apenas meses do ano da saída
  const inicioAno = new Date(saida.getFullYear(), 0, 1);
  const inicioContagem = admissao > inicioAno ? admissao : inicioAno;
  const meses = contarMesesPorQuinzeDias(inicioContagem, saida);
  const valor = (salario / 12) * meses;
  return round2(valor);
}

/**
 * Calcula férias proporcionais (meses não completados do período aquisitivo),
 * usando regra dos 15 dias. Essa função retorna apenas o valor das férias (sem 1/3).
 *
 * @param salario Salário mensal
 * @param admissao Data admissão
 * @param saida Data saída
 * @returns valor das férias proporcionais (arredondado)
 */
export function calcularFeriasProporcionais(
  salario: number,
  admissao: Date,
  saida: Date
): number {
  throwIf(!(salario > 0), 'salario deve ser > 0');

  // encontra o início do último período aquisitivo:
  // período aquisitivo: do aniversário da admissão até 12 meses depois.
  // simplificação: contar meses com regra dos 15 dias desde a última data de aquisição.
  // calcular meses desde a última "data aquisitiva" (ano corrente relativo à admissão)
  // Para robustez: iteramos desde admissão e verificamos o período atual.
  const meses = contarMesesPorQuinzeDias(admissao, saida) % 12;
  const valor = (salario / 12) * meses;
  return round2(valor);
}

/**
 * Calcula 1/3 constitucional sobre o valor de férias informado.
 *
 * @param valorFerias valor bruto de férias (sem 1/3)
 * @returns valor do 1/3 das férias (arredondado)
 */
export function calcularUmTercoFerias(valorFerias: number): number {
  return round2(valorFerias / 3);
}

/**
 * Calcula o valor devido por férias vencidas (se houver): salário + 1/3.
 * Caso não existam férias vencidas, retorna 0.
 *
 * @param salario Salário mensal
 * @param feriasVencidas boolean
 * @returns valor de férias vencidas (arredondado)
 */
export function calcularFeriasVencidasValor(salario: number, feriasVencidas: boolean): number {
  if (!feriasVencidas) return 0;
  const valor = salario + salario / 3;
  return round2(valor);
}

/**
 * Calcula depósitos de FGTS relativos ao período trabalhado (apenas depósitos mensais básicos),
 * usando contagem de meses inteiros trabalhados (diffMesesSimples).
 *
 * Nota: este cálculo é uma aproximação contábil simples (FGTS incide sobre remunerações,
 * incluindo 13º, férias e aviso indenizado; esses adicionais podem ser adicionados separadamente).
 *
 * @param salario Salário mensal
 * @param admissao Data admissão
 * @param saida Data saída
 * @returns valor aproximado dos depósitos de FGTS (arredondado)
 */
export function calcularFgtsDepositosBasicos(salario: number, admissao: Date, saida: Date): number {
  throwIf(!(salario > 0), 'salario deve ser > 0');
  const mesesTrabalhados = Math.max(0, diffMesesSimples(admissao, saida));
  const valor = salario * FGTS_PERC * mesesTrabalhados;
  return round2(valor);
}

/**
 * Calcula multa do FGTS (40% sobre os depósitos realizados) quando aplicável.
 *
 * @param fgtsDepositos Valor total de depósitos de FGTS
 * @param motivo Motivo da rescisão
 * @returns multa (arredondada)
 */
export function calcularMultaFgts(fgtsDepositos: number, motivo: MotivoRescisao): number {
  if (motivo === 'sem_justa_causa') {
    return round2(fgtsDepositos * MULTA_FGTS_PERC);
  }
  return 0;
}

/* ============================
   Agregador / Orquestrador
   ============================ */

/**
 * Calcula a rescisão completa (Modelo Contábil Tradicional).
 *
 * @param dados Dados da rescisão
 * @returns ResultadoDetalhado com detalhamento e total bruto
 */
export function calcularRescisaoReal(dados: DadosRescisao): ResultadoDetalhado {
  // Validações de entrada
  throwIf(!dados, 'dados é obrigatório');
  throwIf(!(dados.salario > 0), 'salario deve ser > 0');
  throwIf(!dados.dataAdmissao, 'dataAdmissao é obrigatória');
  throwIf(!dados.dataSaida, 'dataSaida é obrigatória');
  throwIf(!['sem_justa_causa', 'pedido_demissao', 'justa_causa', 'acordo'].includes(dados.motivo), 'motivo inválido');
  throwIf(!['trabalhado', 'indenizado', 'nao_cumprido'].includes(dados.aviso), 'aviso inválido');

  const admissao = toDateSafe(dados.dataAdmissao);
  const saida = toDateSafe(dados.dataSaida);

  throwIf(saida < admissao, 'dataSaida deve ser posterior a dataAdmissao');

  // logs para depuração
  const log: LogItem[] = [];

  // 1) Saldo de salário
  const saldoSalario = calcularSaldoSalario(dados.salario, saida);
  log.push({ nome: 'saldoSalario', valor: saldoSalario });

  // 2) Aviso prévio
  const avisoPrevio = calcularAvisoPrevio(dados.salario, admissao, saida, dados.motivo, dados.aviso);
  log.push({ nome: 'avisoPrevio', valor: avisoPrevio });

  // 3) 13º proporcional
  const decimo = calcularDecimoTerceiroProporcional(dados.salario, admissao, saida);
  log.push({ nome: 'decimoTerceiro', valor: decimo });

  // 4) Férias proporcionais
  const feriasProp = calcularFeriasProporcionais(dados.salario, admissao, saida);
  log.push({ nome: 'feriasProporcionais', valor: feriasProp });

  // 5) 1/3 sobre férias
  const umTerco = calcularUmTercoFerias(feriasProp);
  log.push({ nome: 'umTercoFerias', valor: umTerco });

  // 6) Férias vencidas
  const feriasVencidasValor = calcularFeriasVencidasValor(dados.salario, dados.feriasVencidas);
  log.push({ nome: 'feriasVencidas', valor: feriasVencidasValor });

  // 7) FGTS depósitos básicos (apenas sobre salários mensais)
  const fgtsDepositos = calcularFgtsDepositosBasicos(dados.salario, admissao, saida);
  log.push({ nome: 'fgtsDepositosBasicos', valor: fgtsDepositos });

  // 8) Multa FGTS (quando aplicável)
  const multaFgts = calcularMultaFgts(fgtsDepositos, dados.motivo);
  log.push({ nome: 'multaFgts', valor: multaFgts });

  // 9) FGTS sobre 13º, férias e aviso indenizado (adicionais) - contagem simples:
  // FGTS adicional = FGTS_PERC * (decimo + feriasProp + feriasVencidas + avisoPrevioPositive)
  const avisoPrevioPositive = avisoPrevio > 0 ? avisoPrevio : 0;
  const fgtsAdicionais = round2(FGTS_PERC * (decimo + feriasProp + feriasVencidasValor + avisoPrevioPositive));
  log.push({ nome: 'fgtsAdicionaisSobreVerbas', valor: fgtsAdicionais });

  const fgtsTotal = round2(fgtsDepositos + fgtsAdicionais);
  log.push({ nome: 'fgtsTotal', valor: fgtsTotal });

  const multaFgtsTotal = dados.motivo === 'sem_justa_causa' ? round2(fgtsTotal * MULTA_FGTS_PERC) : 0;
  log.push({ nome: 'multaFgtsTotal', valor: multaFgtsTotal });

  // 10) total bruto
  const totalBruto = round2(
    saldoSalario +
      avisoPrevio +
      decimo +
      feriasProp +
      umTerco +
      feriasVencidasValor +
      multaFgtsTotal
  );

  // breakdown
  const breakdown: Record<string, number> = {};
  for (const item of log) breakdown[item.nome] = item.valor;

  return {
    saldoSalario,
    avisoPrevio,
    decimoTerceiro: decimo,
    feriasProporcionais: feriasProp,
    umTercoFerias: umTerco,
    feriasVencidas: feriasVencidasValor,
    fgtsDepositos: fgtsTotal,
    multaFgts: multaFgtsTotal,
    totalBruto,
    breakdown
  };
}

/* ============================
   Exemplo de uso / testes rápidos
   ============================ */

// if (require && (require as any).main === module) {
//   // execução local para teste
//   const exemplo: DadosRescisao = {
//     salario: 2000,
//     dataAdmissao: '2024-08-13',
//     dataSaida: '2026-09-18',
//     motivo: 'pedido_demissao',
//     aviso: 'trabalhado',
//     feriasVencidas: false
//   };

//   const res = calcularRescisaoReal(exemplo);
//   // eslint-disable-next-line no-console
//   console.log('Resultado de exemplo:', JSON.stringify(res, null, 2));
// }
