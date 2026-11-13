import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Mic,
  ShieldAlert,
  Sprout,
} from 'lucide-react';
import type {
  FieldReport,
  Microarea,
  MicroareaStatus,
  Severity,
  TreatmentEfficiency,
} from '../types';
import { getCategoryLabel, getEfficiencyLabel } from '../utils/agronomy';

function efficiencyDot(eff: TreatmentEfficiency): string {
  if (eff === 'eficiente') return 'bg-emerald-500';
  if (eff === 'parcial') return 'bg-amber-500';
  return 'bg-red-600';
}

interface PriorityKpiGridProps {
  microareas: Microarea[];
  activeStatusFilter: 'todas' | MicroareaStatus;
  onSelectStatusFilter: (status: 'todas' | MicroareaStatus) => void;
}

export function PriorityKpiGrid({
  microareas,
  activeStatusFilter,
  onSelectStatusFilter,
}: PriorityKpiGridProps) {
  const kpis = useMemo(() => {
    const total = microareas.length;
    const critico = microareas.filter((m) => m.status === 'critico').length;
    const atencao = microareas.filter((m) => m.status === 'atencao').length;
    const saudavel = microareas.filter((m) => m.status === 'saudavel').length;
    return { total, critico, atencao, saudavel };
  }, [microareas]);

  return (
    <section aria-label="Indicadores diários das microáreas" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
      <button
        type="button"
        onClick={() => onSelectStatusFilter('todas')}
        className={`p-3.5 rounded-2xl border shadow-sm text-left transition-colors ${
          activeStatusFilter === 'todas'
            ? 'bg-white border-emerald-700 ring-1 ring-emerald-700'
            : 'bg-white border-slate-200/80 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-600">Microáreas</span>
          <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
            <Sprout className="w-3.5 h-3.5 shrink-0" />
          </span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
          {kpis.total}
        </p>
        <p className="text-[11px] text-slate-500">Total monitorado</p>
      </button>

      <button
        type="button"
        onClick={() => onSelectStatusFilter('critico')}
        className={`p-3.5 rounded-2xl border shadow-sm text-left transition-colors ${
          activeStatusFilter === 'critico'
            ? 'bg-red-100/90 border-red-500 ring-1 ring-red-500'
            : 'bg-red-50/90 border-red-200 hover:bg-red-100/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-red-900">Críticas</span>
          <span className="p-1.5 rounded-lg bg-red-200/80 text-red-800">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          </span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-red-950 mt-1.5">
          {kpis.critico}
        </p>
        <p className="text-[11px] font-medium text-red-800">Ação imediata</p>
      </button>

      <button
        type="button"
        onClick={() => onSelectStatusFilter('atencao')}
        className={`p-3.5 rounded-2xl border shadow-sm text-left transition-colors ${
          activeStatusFilter === 'atencao'
            ? 'bg-amber-100/90 border-amber-500 ring-1 ring-amber-500'
            : 'bg-amber-50/90 border-amber-200 hover:bg-amber-100/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-amber-900">Em Atenção</span>
          <span className="p-1.5 rounded-lg bg-amber-200/80 text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          </span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-950 mt-1.5">
          {kpis.atencao}
        </p>
        <p className="text-[11px] font-medium text-amber-800">Monitorar hoje</p>
      </button>

      <button
        type="button"
        onClick={() => onSelectStatusFilter('saudavel')}
        className={`p-3.5 rounded-2xl border shadow-sm text-left transition-colors ${
          activeStatusFilter === 'saudavel'
            ? 'bg-emerald-100/90 border-emerald-600 ring-1 ring-emerald-600'
            : 'bg-emerald-50/90 border-emerald-200 hover:bg-emerald-100/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-emerald-900">Saudáveis</span>
          <span className="p-1.5 rounded-lg bg-emerald-200/80 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          </span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-950 mt-1.5">
          {kpis.saudavel}
        </p>
        <p className="text-[11px] font-medium text-emerald-800">Estáveis</p>
      </button>
    </section>
  );
}

interface PriorityQueuePanelProps {
  loadingData: boolean;
  reports: FieldReport[];
  onResolveReport: (report: FieldReport) => Promise<void>;
}

const SEVERITY_RANK: Record<Severity, number> = {
  urgente: 0,
  media: 1,
  baixa: 2,
};

function getSeverityVisual(severity: Severity) {
  if (severity === 'urgente') {
    return {
      label: 'Urgente',
      cardBg: 'bg-red-50/70 border-red-200',
      labelColor: 'text-red-800',
      Icon: ShieldAlert,
    };
  }
  if (severity === 'media') {
    return {
      label: 'Média',
      cardBg: 'bg-amber-50/70 border-amber-200',
      labelColor: 'text-amber-800',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'Baixa',
    cardBg: 'bg-slate-50 border-slate-200',
    labelColor: 'text-emerald-800',
    Icon: CheckCircle2,
  };
}

export function PriorityQueuePanel({
  loadingData,
  reports,
  onResolveReport,
}: PriorityQueuePanelProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const priorityQueue = useMemo(() => {
    return reports
      .filter((r) => !r.resolved)
      .sort((a, b) => {
        const diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (diff !== 0) return diff;
        return b.createdAtMs - a.createdAtMs;
      });
  }, [reports]);

  const handleResolve = async (report: FieldReport) => {
    setResolvingId(report.id);
    try {
      await onResolveReport(report);
    } finally {
      setResolvingId(null);
    }
  };

  if (loadingData) {
    return (
      <div className="space-y-2.5" aria-busy="true">
        {[0, 1].map((idx) => (
          <div
            key={idx}
            className="h-24 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60"
          />
        ))}
      </div>
    );
  }

  if (priorityQueue.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center gap-3 text-emerald-950">
        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Nenhuma pendência aberta hoje</p>
          <p className="text-xs text-emerald-900/80 mt-0.5">
            Todos os relatos foram tratados. Novas ocorrências gravadas por voz aparecerão aqui ordenadas por gravidade.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {priorityQueue.map((item, idx) => {
        const vis = getSeverityVisual(item.severity);
        const SevIcon = vis.Icon;
        const timeStr = new Date(item.createdAtMs).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <article
            key={item.id}
            className={`p-3.5 sm:p-4 rounded-xl border ${vis.cardBg} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
          >
            <div className="space-y-1 min-w-0">
              <div className={`flex items-center gap-2 text-xs font-semibold ${vis.labelColor}`}>
                <SevIcon className="w-4 h-4 shrink-0" />
                <span>
                  #{idx + 1} · Prioridade {vis.label}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-normal text-slate-600">
                  {timeStr}
                </span>
              </div>

              <h4 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                {item.microareaName}
              </h4>

              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                &ldquo;{item.transcript}&rdquo;
              </p>

              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1.5 text-xs">
                <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70 min-w-0">
                  <dt className="text-[11px] font-semibold text-slate-500">
                    Praga / Doença
                  </dt>
                  <dd className="text-slate-900 font-medium break-words mt-0.5">
                    {item.pestProblem || 'Não informado'}
                  </dd>
                </div>
                <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70 min-w-0">
                  <dt className="text-[11px] font-semibold text-slate-500">
                    Contagem / Intensidade
                  </dt>
                  <dd className="text-slate-900 font-medium break-words mt-0.5">
                    {item.pestCount || 'Não informada'}
                  </dd>
                </div>
                <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70 min-w-0">
                  <dt className="text-[11px] font-semibold text-slate-500">
                    Combate Atual
                  </dt>
                  <dd className="text-slate-900 font-medium break-words mt-0.5">
                    {item.currentTreatment || 'Nenhum tratamento informado'}
                  </dd>
                </div>
                <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70 min-w-0">
                  <dt className="text-[11px] font-semibold text-slate-500">
                    Eficiência do Combate
                  </dt>
                  <dd className="text-slate-900 font-semibold mt-0.5 flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${efficiencyDot(item.treatmentEfficiency || 'parcial')}`}
                    />
                    <span>{getEfficiencyLabel(item.treatmentEfficiency || 'parcial')}</span>
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-emerald-950 bg-white/80 border border-emerald-200/70 rounded-lg px-2.5 py-1.5 mt-1.5">
                <span className="font-semibold">Ação recomendada:</span>{' '}
                {item.recommendedSolution || 'Monitoramento contínuo'}
              </p>

              <p className="text-[11px] text-slate-500 font-mono tabular-nums pt-0.5">
                {item.crop} · {getCategoryLabel(item.category)}
                {item.detectedKeywords.length > 0
                  ? ` · Termos: ${item.detectedKeywords.join(', ')}`
                  : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleResolve(item)}
              disabled={resolvingId === item.id}
              className="min-h-[44px] px-4 py-2 bg-white hover:bg-emerald-700 hover:text-white text-slate-900 border border-slate-200 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {resolvingId === item.id ? 'Concluindo...' : 'Marcar como Resolvido'}
            </button>
          </article>
        );
      })}
    </div>
  );
}

interface MicroareasPanelProps {
  microareas: Microarea[];
  selectedMicroareaId: string;
  statusFilter: 'todas' | MicroareaStatus;
  onChangeFilter: (status: 'todas' | MicroareaStatus) => void;
  onSelectMicroareaForReport: (microareaId: string) => void;
}

function getMicroareaStatusVisual(status: MicroareaStatus) {
  if (status === 'critico') {
    return {
      label: 'Crítica',
      textColor: 'text-red-800',
      Icon: ShieldAlert,
    };
  }
  if (status === 'atencao') {
    return {
      label: 'Em Atenção',
      textColor: 'text-amber-800',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'Saudável',
    textColor: 'text-emerald-800',
    Icon: CheckCircle2,
  };
}

export function MicroareasPanel({
  microareas,
  selectedMicroareaId,
  statusFilter,
  onChangeFilter,
  onSelectMicroareaForReport,
}: MicroareasPanelProps) {
  const filteredMicroareas = useMemo(() => {
    if (statusFilter === 'todas') return microareas;
    return microareas.filter((m) => m.status === statusFilter);
  }, [microareas, statusFilter]);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Toque em um local para gravar uma nova ocorrência por voz
        </p>

        <div
          role="group"
          aria-label="Filtrar microáreas por status"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl"
        >
          {(
            [
              { key: 'todas', label: 'Todas' },
              { key: 'critico', label: 'Críticas' },
              { key: 'atencao', label: 'Em Atenção' },
              { key: 'saudavel', label: 'Saudáveis' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChangeFilter(tab.key)}
              className={`min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredMicroareas.length === 0 ? (
        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-slate-700">
          <Sprout className="w-5 h-5 text-emerald-700 shrink-0" />
          <p className="text-sm">
            Nenhuma microárea encontrada neste filtro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredMicroareas.map((area) => {
            const vis = getMicroareaStatusVisual(area.status);
            const StatusIcon = vis.Icon;
            const isSelected = area.id === selectedMicroareaId;

            return (
              <div
                key={area.id}
                className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'bg-emerald-50/70 border-emerald-600'
                    : 'bg-slate-50/70 border-slate-200/80'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm sm:text-base font-semibold text-slate-900">
                      {area.name}
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${vis.textColor}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {vis.label}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {area.sector} ·{' '}
                    <MapPin className="w-3 h-3 inline -mt-0.5" />{' '}
                    {area.latitude.toFixed(4)}, {area.longitude.toFixed(4)}
                  </p>

                  <p className="text-xs sm:text-sm text-slate-700 leading-snug">
                    {area.lastReportSummary}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectMicroareaForReport(area.id)}
                  className="w-full min-h-[42px] px-3 py-1.5 bg-white hover:bg-emerald-700 hover:text-white text-emerald-900 border border-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Mic className="w-3.5 h-3.5 shrink-0" />
                  Gravar relato neste local
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
