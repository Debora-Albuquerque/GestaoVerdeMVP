import { useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Download, FileSpreadsheet } from 'lucide-react';
import type { FieldReport } from '../types';
import {
  buildSeasonalitySummary,
  exportSeasonalityCsv,
  getEfficiencyLabel,
} from '../utils/agronomy';

interface SeasonalityReportProps {
  reports: FieldReport[];
}

export function SeasonalityReport({ reports }: SeasonalityReportProps) {
  const [periodDays, setPeriodDays] = useState<7 | 30 | 365>(30);
  const [generated, setGenerated] = useState(true);

  const filteredReports = useMemo(() => {
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    return (periodDays === 365 ? reports : reports.filter((r) => r.createdAtMs >= cutoff))
      .slice()
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [reports, periodDays]);

  const summary = useMemo(
    () => buildSeasonalitySummary(reports, periodDays),
    [reports, periodDays]
  );

  const maxMonthTotal = useMemo(
    () => Math.max(1, ...summary.byMonth.map((m) => m.total)),
    [summary.byMonth]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="group"
          aria-label="Selecionar período do relatório"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl"
        >
          {(
            [
              { days: 7, label: '7 dias' },
              { days: 30, label: '30 dias' },
              { days: 365, label: 'Safra' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => {
                setPeriodDays(opt.days);
                setGenerated(true);
              }}
              className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                periodDays === opt.days
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGenerated(true)}
            className="min-h-[42px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            Gerar Relatório de Períodos
          </button>

          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => exportSeasonalityCsv(reports)}
              className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 shrink-0" />
              CSV
            </button>
          )}
        </div>
      </div>

      {generated && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-950">
              <CalendarRange className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Leitura Consolidada de Sazonalidade</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{summary.insight}</p>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 pt-0.5">
              Total: {summary.totalReports} · Urgentes: {summary.urgentCount} · Médias:{' '}
              {summary.mediumCount} · Baixas: {summary.lowCount} · Resolvidas: {summary.resolvedCount}
            </p>
          </div>

          {summary.totalReports > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-2.5">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
                    Evolução Mensal de Ocorrências
                  </h3>
                  <div className="space-y-2">
                    {summary.byMonth.map((row) => {
                      const widthPct = Math.max(8, Math.round((row.total / maxMonthTotal) * 100));
                      return (
                        <div key={row.month} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800 capitalize">
                              {row.label}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {row.total} registro(s)
                              {row.urgent > 0 ? ` · ${row.urgent} urgente(s)` : ''}
                            </span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-700 rounded-full transition-all"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 mb-1.5">
                      Hortaliças com Mais Ocorrências
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {summary.byCrop.map((item) => (
                        <div
                          key={item.crop}
                          className="py-1.5 flex items-center justify-between text-xs sm:text-sm"
                        >
                          <span className="font-medium text-slate-800">{item.crop}</span>
                          <span className="text-xs font-mono tabular-nums text-slate-600">
                            {item.total} total · {item.urgent} urgente(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 mb-1.5">
                      Riscos Recorrentes por Categoria
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {summary.byCategory.map((cat) => (
                        <div
                          key={cat.category}
                          className="py-1.5 flex items-center justify-between text-xs sm:text-sm"
                        >
                          <span className="text-slate-700">{cat.label}</span>
                          <span className="text-xs font-mono tabular-nums font-semibold text-emerald-900">
                            {cat.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
                    Histórico Agronômico do Período (Praga, Tratamento e Solução)
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {filteredReports.length} registro(s)
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredReports.map((r) => {
                    const dateStr = new Date(r.createdAtMs).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const sevLabel =
                      r.severity === 'urgente'
                        ? 'Urgente'
                        : r.severity === 'media'
                          ? 'Média'
                          : 'Baixa';

                    return (
                      <div key={r.id} className="py-3 first:pt-1 last:pb-1 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900">
                            {r.microareaName}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500">
                            {dateStr} · {sevLabel} · {r.resolved ? 'Resolvido' : 'Em aberto'}
                          </p>
                        </div>

                        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 min-w-0">
                            <dt className="text-[11px] font-semibold text-slate-500">Praga / Doença</dt>
                            <dd className="text-slate-900 font-medium break-words mt-0.5">
                              {r.pestProblem || 'Não informado'}
                            </dd>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 min-w-0">
                            <dt className="text-[11px] font-semibold text-slate-500">Contagem</dt>
                            <dd className="text-slate-900 font-medium break-words mt-0.5">
                              {r.pestCount || 'Não informada'}
                            </dd>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 min-w-0">
                            <dt className="text-[11px] font-semibold text-slate-500">
                              Combate Atual
                            </dt>
                            <dd className="text-slate-900 font-medium break-words mt-0.5">
                              {r.currentTreatment || 'Nenhum tratamento informado'}
                            </dd>
                          </div>
                          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-200/70 min-w-0">
                            <dt className="text-[11px] font-semibold text-emerald-900">
                              Eficiência · Solução
                            </dt>
                            <dd className="text-emerald-950 font-medium break-words mt-0.5">
                              <span className="font-bold">
                                {getEfficiencyLabel(r.treatmentEfficiency || 'parcial')}:
                              </span>{' '}
                              {r.recommendedSolution || 'Monitoramento contínuo'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-700 flex items-center gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Nenhum relato encontrado neste recorte de tempo.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
