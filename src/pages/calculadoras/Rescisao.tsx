import React, { useState, useEffect } from 'react';
import Tooltip from '../../components/Tooltip';
import { calcularRescisaoReal } from '../../utils/recisao.utils';
import { NumericFormat } from 'react-number-format';

export default function Rescisao() {
  useEffect(() => {
    document.title = 'Calculadora de Rescisão CLT | MyCalculadora';
  }, []);
  
  const [salario, setSalario] = useState<number | undefined>(undefined);

  const [admissao, setAdmissao] = useState('');
  const [saida, setSaida] = useState('');
  const [aviso, setAviso] = useState('');
  const [feriasVencidas, setFeriasVencidas] = useState<boolean | null>(null);
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState('');

  const handleClear = () => {
    setSalario(undefined); 
    setAdmissao('');
    setSaida('');
    setAviso('');
    setFeriasVencidas(null);
    setMotivo('');
    setResultado(null);
    setErro('');
  };

  useEffect(() => {
    setAviso('');
  }, [motivo]);

  const getOpcoesAvisoPrevio = () => {
    switch (motivo) {
      case 'sem_justa_causa':
        return [
          { value: 'indenizado', label: 'Indenizado (pago pela empresa)' },
          { value: 'trabalhado', label: 'Trabalhado' },
        ];
      case 'pedido_demissao':
        return [
          { value: 'trabalhado', label: 'Trabalhado' },
          { value: 'dispensado', label: 'Dispensado pelo empregador' },
          { value: 'nao_cumprido', label: 'Não cumprido (descontar)' },
        ];
      default:
        return [];
    }
  };

  const getMesesTrabalhados = () => {
    if (!admissao || !saida) return 0;
    const adm = new Date(admissao);
    const sai = new Date(saida);
    if (sai <= adm) return 0;
    return (sai.getFullYear() - adm.getFullYear()) * 12 + (sai.getMonth() - adm.getMonth());
  };

  const mesesTrabalhados = getMesesTrabalhados();
  const menosDe12Meses = mesesTrabalhados < 12;

  const opcoesAviso = getOpcoesAvisoPrevio();
  const avisoPrevioDesabilitado = opcoesAviso.length === 0 || motivo === 'justa_causa';

  const formatarReal = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const calcular = () => {
    if (!salario) {
      setErro('Por favor, preencha todos os campos para continuar.');
      setResultado(null);
      return;
    }

    const feriasVencidasReal = menosDe12Meses ? false : feriasVencidas;
    const avisoSelecionado = motivo === 'justa_causa' ? 'dispensado' : aviso;

    if (!admissao || !saida || !motivo || !avisoSelecionado || (!menosDe12Meses && feriasVencidasReal === null)) {
      setErro('Por favor, preencha todos os campos para continuar.');
      setResultado(null);
      return;
    }
    
    const dataAdmissao = new Date(admissao);
    const dataSaida = new Date(saida);

    if (dataSaida <= dataAdmissao) {
      setErro('A data de saída deve ser posterior à data de admissão.');
      setResultado(null);
      return;
    }
    
    setErro('');

    const total = calcularRescisaoReal({
      salario: salario,
      dataAdmissao: admissao,
      dataSaida: saida,
      motivo,
      aviso: avisoSelecionado,
      feriasVencidas: feriasVencidasReal ?? false,
    });

    setResultado(total);
  };

  return (
    <>
      <div className="max-w-2xl mx-auto p-6 bg-white rounded shadow mt-6">
        <h1 className="text-2xl font-bold mb-4 text-blue-700">Cálculo de Rescisão CLT</h1>
        <p className="mb-6 text-gray-700">
          Preencha os dados abaixo para estimar o valor da sua rescisão trabalhista.
        </p>
        <div className="space-y-5">
          <div>
            <label htmlFor="salario-bruto" className="block font-medium">
              Salário bruto
              <Tooltip message="Salário mensal registrado na carteira de trabalho." />
            </label>
            <div className="flex items-center">
              <span className="bg-gray-100 px-3 py-2 rounded-l text-gray-600">R$</span>
              <NumericFormat
                id="salario-bruto"
                className="border rounded-r px-3 py-2 w-full"
                placeholder="Ex: 2.500,00"
                thousandSeparator="."
                decimalSeparator=","
                decimalScale={2}
                fixedDecimalScale
                value={salario}
                onValueChange={(values) => setSalario(values.floatValue)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="data-admissao" className="block font-medium">
                Data de admissão
                <Tooltip message="Data em que você começou oficialmente a trabalhar na empresa." />
              </label>
              <input id="data-admissao" type="date" className="border rounded px-3 py-2 w-full" value={admissao} onChange={e => setAdmissao(e.target.value)} />
            </div>
            <div>
              <label htmlFor="data-saida" className="block font-medium">
                Data de saída
                <Tooltip message="Último dia de vínculo com a empresa, incluindo aviso prévio." />
              </label>
              <input id="data-saida" type="date" className="border rounded px-3 py-2 w-full" value={saida} onChange={e => setSaida(e.target.value)} />
            </div>
          </div>
          
          <div>
            <label htmlFor="motivo-saida" className="block font-medium">
              Motivo da saída
              <Tooltip message="Se foi pedido de demissão, demissão sem justa causa ou por justa causa." />
            </label>
            <select id="motivo-saida" className="border rounded px-3 py-2 w-full appearance-none pr-8" value={motivo} onChange={e => setMotivo(e.target.value)}>
              <option value="">Selecione</option>
              <option value="sem_justa_causa">Demissão sem justa causa</option>
              <option value="pedido_demissao">Pedido de demissão</option>
              <option value="justa_causa">Justa causa</option>
            </select>
          </div>
          
          <div className="relative">
            <label htmlFor="aviso-previo" className="block font-medium">
              Tipo de aviso prévio
              <Tooltip message="O aviso prévio pode ser trabalhado, indenizado (pago sem trabalhar) ou dispensado." />
            </label>
            <select
              id="aviso-previo"
              className="border rounded px-3 py-2 w-full appearance-none pr-8 disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={aviso}
              onChange={e => setAviso(e.target.value)}
              disabled={avisoPrevioDesabilitado}
            >
              <option value="">{avisoPrevioDesabilitado ? 'Não aplicável' : 'Selecione'}</option>
              {opcoesAviso.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
            </select>
            {avisoPrevioDesabilitado && motivo === 'justa_causa' && (
              <div className="absolute inset-0 group cursor-help">
                <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs p-2 rounded shadow-lg w-64 top-full mt-2 left-1/2 -translate-x-1/2 z-10">
                  O aviso prévio não é aplicável em demissões por justa causa.
                </div>
              </div>
            )}
          </div>
          
          <div className="relative">
            <label className={`block font-medium mb-1 ${menosDe12Meses ? 'text-gray-400' : ''}`}>
              Possui férias vencidas?
              <Tooltip message="As férias vencidas só se aplicam quando o funcionário completa 12 meses de trabalho sem tirar o descanso." />
            </label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 ${menosDe12Meses ? 'cursor-not-allowed' : ''}`}>
                <input
                  type="radio"
                  name="ferias-vencidas"
                  checked={!menosDe12Meses && feriasVencidas === true}
                  onChange={() => setFeriasVencidas(true)}
                  disabled={menosDe12Meses}
                />
                <span className={menosDe12Meses ? 'text-gray-400' : ''}>Sim</span>
              </label>
              <label className={`flex items-center gap-2 ${menosDe12Meses ? 'cursor-not-allowed' : ''}`}>
                <input
                  type="radio"
                  name="ferias-vencidas"
                  checked={menosDe12Meses || feriasVencidas === false}
                  onChange={() => setFeriasVencidas(false)}
                  disabled={menosDe12Meses}
                />
                <span className={menosDe12Meses ? 'text-gray-400' : ''}>Não</span>
              </label>
            </div>
            {menosDe12Meses && (
              <div className="absolute inset-0 group cursor-help">
                 <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs p-2 rounded shadow-lg w-64 top-full mt-2 left-1/2 -translate-x-1/2 z-10">
                   A opção de férias vencidas só é habilitada para contratos com mais de 12 meses de duração.
                 </div>
              </div>
            )}
          </div>

          {erro && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded">
              <p>{erro}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={calcular}
              className="bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 px-4 rounded w-full sm:w-auto"
            >
              Calcular rescisão
            </button>
            <button
              onClick={handleClear}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded w-full sm:w-auto"
            >
              Limpar
            </button>
          </div>

          {resultado && (
            <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 text-blue-900 p-4 rounded">
              <p className="font-medium mb-2">Resultado estimado:</p>
              <ul className="text-sm mb-3 space-y-1">
                <li>🔹 Saldo de salário: <strong>{formatarReal(resultado.saldoSalario)}</strong></li>
                
                {resultado.avisoPrevio > 0 && (
                  <li>🔹 Aviso prévio indenizado: <strong>{formatarReal(resultado.avisoPrevio)}</strong></li>
                )}
                {resultado.avisoPrevio < 0 && (
                  <li className='text-red-700'>🔻 Desconto aviso prévio: <strong>{formatarReal(resultado.avisoPrevio)}</strong></li>
                )}

                <li>🔹 13º proporcional: <strong>{formatarReal(resultado.decimoTerceiro)}</strong></li>
                <li>🔹 Férias proporcionais: <strong>{formatarReal(resultado.feriasProporcionais)}</strong></li>
                <li>🔹 1/3 de férias: <strong>{formatarReal(resultado.umTercoFerias)}</strong></li>
                {resultado.feriasVencidas > 0 && (<li>🔹 Férias vencidas: <strong>{formatarReal(resultado.feriasVencidas)}</strong></li>)}
                {resultado.multaFgts > 0 && (<li>🔹 Multa de 40% do FGTS: <strong>{formatarReal(resultado.multaFgts)}</strong></li>)}
              </ul>
              <p className="text-xl font-bold">Total estimado: {formatarReal(resultado.total)}</p>
              <p className="text-xs text-gray-600 mt-2">
                Este valor é uma simulação. A multa de 40% do FGTS é uma estimativa sobre os depósitos do período e o valor final pode variar. Consulte um contador para casos específicos.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}