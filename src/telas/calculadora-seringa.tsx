// Calculadora da seringa no passo da dose: mg no frasco + mL de diluente + a dose digitada acima
// -> concentração, unidades na seringa e quantas doses o frasco rende. Mesmas contas da tela
// Reconstituição (dominio/calculos.ts). Não sugere dose: só converte o que a pessoa digitou.
import { useEffect } from 'react'
import { calcularSeringa, fmtDose, fmtNum, lerNumero, UNIDADES_POR_ML } from '../dominio/calculos.ts'
import type { Frasco } from '../dominio/tipos.ts'
import { hojeStr } from '../dominio/datas.ts'
import { IcoEstoque } from '../ui/icones.tsx'
import { frascoDoCalculo, rascunho, type ItemRascunho } from './rascunho.ts'

/** Número para um campo editável (sem ponto de milhar, que o app recusa por ser ambíguo). */
const paraCampo = (n: number) => fmtNum(n).replace(/\./g, '')

function Linha({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-bold text-fraco">{titulo}</span>
      <b className={destaque ? 'text-[26px] leading-tight text-acento' : 'text-lg'}>{valor}</b>
      {detalhe && <span className="text-[13px] leading-snug text-suave">{detalhe}</span>}
    </div>
  )
}

export function CalculadoraSeringa({ it, blend, frascoLigado, ligadoUsavel, somaBlendMg }: { it: ItemRascunho; blend: boolean; frascoLigado?: Frasco; ligadoUsavel: boolean; somaBlendMg: number | null }) {
  // Editando um protocolo com frasco reconstituído ligado: já vem preenchida com os números dele.
  const ligadoMg = frascoLigado?.status === 'reconstituido' && frascoLigado.diluenteMl ? frascoLigado.mgTotal : undefined
  const ligadoMl = ligadoMg !== undefined ? frascoLigado!.diluenteMl : undefined
  useEffect(() => {
    if (ligadoMg !== undefined && ligadoMl !== undefined && it.calcMgTxt === undefined && it.calcMlTxt === undefined) {
      rascunho.mudarItem(() => ({ calcMgTxt: paraCampo(ligadoMg), calcMlTxt: paraCampo(ligadoMl) }))
    }
  }, [ligadoMg, ligadoMl, it.calcMgTxt, it.calcMlTxt])

  const mgTxt = it.calcMgTxt ?? ''
  const mlTxt = it.calcMlTxt ?? ''
  const c = calcularSeringa({ mgFrasco: mgTxt, diluenteMl: mlTxt, dose: it.doseTxt, unidade: it.doseUnidade, blend })
  const dose = lerNumero(it.doseTxt)
  const doseTxt = dose !== null && it.doseUnidade ? fmtDose(dose, it.doseUnidade) : ''
  const frascoOk = c.mgFrasco !== null && c.diluenteMl !== null
  const mesmoDoLigado = frascoOk && c.mgFrasco === ligadoMg && c.diluenteMl === ligadoMl
  const algumCampo = !!(mgTxt.trim() || mlTxt.trim())
  const novo = frascoDoCalculo(it, hojeStr(), ligadoUsavel)

  let falta: string | null = null
  if (c.falta === 'ui') falta = 'Dose em UI não é convertida: o app não sabe quantas UI há em cada mg. Para usar a calculadora, escolha mg, mcg, mL ou unidades.'
  else if (c.falta === 'blend-mg') falta = 'Em blend, informe a dose em mL ou unidades para ver a conta. O app não converte mg de blend.'
  else if (c.falta === 'dose') falta = algumCampo ? 'Digite a dose e escolha a unidade acima para ver a conta.' : null
  else if (c.falta === 'frasco') falta = 'Preencha quanto tem no frasco (mg) e quanto de água você colocou (mL) para ver a conta.'

  const mudar = (campo: 'calcMgTxt' | 'calcMlTxt', v: string) => rascunho.mudarItem(() => ({ [campo]: v }))

  return (
    <section aria-labelledby="calc-titulo" className="card flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="calc-titulo" className="text-[17px] font-bold">Calculadora da seringa</h2>
        <span className="text-[13px] leading-snug text-fraco">Opcional. Com os números do seu frasco, o app mostra quanto puxar na seringa e guarda o frasco no Estoque.</span>
      </div>
      <div className="grid grid-cols-2 items-end gap-2.5">
        <label className="rotulo text-sm">
          No frasco (mg)
          <input
            className="campo"
            inputMode="decimal"
            placeholder={somaBlendMg !== null ? fmtNum(somaBlendMg) : 'Ex.: 5'}
            value={mgTxt}
            aria-invalid={!!c.erros.mgFrasco}
            aria-describedby={c.erros.mgFrasco ? 'calc-erro-mg' : undefined}
            onChange={(e) => mudar('calcMgTxt', e.target.value)}
          />
        </label>
        <label className="rotulo text-sm">
          Água que você pôs (mL)
          <input
            className="campo"
            inputMode="decimal"
            placeholder="Ex.: 2"
            value={mlTxt}
            aria-invalid={!!c.erros.diluenteMl}
            aria-describedby={c.erros.diluenteMl ? 'calc-erro-ml' : undefined}
            onChange={(e) => mudar('calcMlTxt', e.target.value)}
          />
        </label>
      </div>
      {c.erros.mgFrasco && <p id="calc-erro-mg" role="alert" className="m-0 text-sm font-bold text-erro">Frasco (mg): {c.erros.mgFrasco}</p>}
      {c.erros.diluenteMl && <p id="calc-erro-ml" role="alert" className="m-0 text-sm font-bold text-erro">Água (mL): {c.erros.diluenteMl}</p>}
      {blend && <span className="text-[13px] leading-snug text-fraco">Em blend, a conta é só de volume (mL e unidades). O app não calcula quanto de cada componente vai em cada dose.</span>}

      <div aria-live="polite" className="flex flex-col gap-3">
        {c.concMgMl !== null && c.mgFrasco !== null && c.diluenteMl !== null && (
          <Linha titulo="Concentração" valor={`${fmtNum(c.concMgMl)} mg/mL`} detalhe={`${fmtNum(c.mgFrasco)} mg ÷ ${fmtNum(c.diluenteMl)} mL`} />
        )}
        {c.unidadesExatas !== null && c.volumeMl !== null && (
          <>
            <div className="h-px bg-sup2" />
            <Linha
              titulo={`Puxe na seringa para ${doseTxt}`}
              valor={`${fmtNum(c.unidadesExatas)} unidade${c.unidadesExatas === 1 ? '' : 's'}`}
              detalhe={`= ${fmtNum(c.volumeMl)} mL · seringa de insulina de ${UNIDADES_POR_ML} unidades por mL (as marcas que muita gente chama de “UI”)`}
              destaque
            />
            {c.mgDaDoseEmVolume !== null && <span className="text-[13px] text-suave">Essa dose tem {fmtNum(c.mgDaDoseEmVolume)} mg ({fmtNum(c.mgDaDoseEmVolume * 1000)} mcg).</span>}
            {c.marca !== null && (
              <p className="m-0 rounded-xl bg-sup2 px-3 py-2.5 text-sm leading-relaxed text-suave">
                O número exato não cai numa marca. A marca mais próxima é <b className="text-texto">{c.marca} unidades</b>
                {c.doseDaMarca !== null && it.doseUnidade ? <>, que dá <b className="text-texto">{fmtDose(c.doseDaMarca, it.doseUnidade)}</b> em vez de {doseTxt}</> : ''}.
              </p>
            )}
            {c.abaixoDaMenorMarca && (
              <p className="m-0 rounded-xl bg-aviso-fundo px-3 py-2.5 text-sm font-semibold text-aviso-texto">Menos de meia unidade: a seringa de insulina não tem marca para isso. Confira os números.</p>
            )}
          </>
        )}
        {c.rende !== null && (
          <>
            <div className="h-px bg-sup2" />
            {c.rende > 0 ? (
              <div className="flex items-baseline justify-between gap-2 text-[15px]"><span className="text-suave">Rende, com essa dose</span><b>{c.rende} dose{c.rende === 1 ? '' : 's'}</b></div>
            ) : (
              <span className="text-sm font-semibold text-aviso">A dose é maior que o frasco todo. Confira os números.</span>
            )}
          </>
        )}
        {falta && <span className="text-[13px] leading-snug text-fraco">{falta}</span>}
      </div>

      {/* Regra do dono: todo frasco informado vai para o Estoque (sem interruptor). */}
      <div className="flex items-start gap-2.5 border-t border-sup2 pt-3">
        <IcoEstoque tam={20} className="mt-0.5 shrink-0 text-acento" />
        <span className="flex flex-col gap-0.5">
          {ligadoUsavel ? (
            <>
              <b className="text-[15px]">Frasco já no Estoque</b>
              <span className="text-[13px] text-fraco">{mesmoDoLigado ? 'São os números do frasco já ligado a este protocolo.' : 'Este protocolo já tem um frasco ligado. Para um frasco novo, use Estoque > Frasco.'}</span>
            </>
          ) : novo ? (
            <>
              <b className="text-[15px]">O frasco entra no Estoque para você acompanhar o saldo</b>
              <span className="text-[13px] text-fraco">
                {novo.status === 'reconstituido' ? `${fmtNum(novo.mgTotal)} mg + ${fmtNum(novo.diluenteMl!)} mL, reconstituído hoje.` : `${fmtNum(novo.mgTotal)} mg, lacrado (sem água ainda).`} Salva junto com o protocolo.
              </span>
            </>
          ) : (
            <>
              <b className="text-[15px]">Informe os mg do frasco</b>
              <span className="text-[13px] text-fraco">Ele entra no Estoque para você acompanhar o saldo e as doses que restam. Sem isso, dá para adicionar o frasco depois.</span>
            </>
          )}
        </span>
      </div>
    </section>
  )
}
