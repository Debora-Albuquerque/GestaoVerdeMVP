import type {
  FieldReport,
  Microarea,
  MicroareaStatus,
  ReportCategory,
  Severity,
  TreatmentEfficiency,
} from '../types';
import { classifyFieldReport } from './agronomy';

const LS_MICROAREAS_KEY = 'gestao_verde_microareas';
const LS_REPORTS_KEY = 'gestao_verde_relatos';

export interface RawDemoMicroarea {
  id: string;
  nome: string;
  local: string;
  status: string;
  severidade: string;
  latitude?: number;
  longitude?: number;
  lastReportSummary?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface RawDemoReport {
  id: string;
  microarea: string;
  microareaId?: string;
  texto: string;
  praga?: string;
  contagem?: string;
  tratamentoAtual?: string;
  eficiencia?: TreatmentEfficiency;
  solucao?: string;
  severidade: string;
  categoria: string;
  data: string;
  resolvido: boolean;
  detectedKeywords?: string[];
  latitude?: number;
  longitude?: number;
}

export const dadosFicticiosIniciais: {
  microareas: RawDemoMicroarea[];
  relatos: RawDemoReport[];
} = {
  microareas: [
    {
      id: '1',
      nome: 'Canteiro 1 - Repolho',
      local: 'Várzea Baixa',
      status: 'Crítica',
      severidade: 'Urgente',
      latitude: -23.5219,
      longitude: -46.1872,
    },
    {
      id: '2',
      nome: 'Estufa B - Alface Crespa',
      local: 'Setor Norte',
      status: 'Em Atenção',
      severidade: 'Média',
      latitude: -23.5225,
      longitude: -46.1881,
    },
    {
      id: '3',
      nome: 'Talhão 3 - Couve Manteiga',
      local: 'Área Alta',
      status: 'Saudável',
      severidade: 'Baixa',
      latitude: -23.5234,
      longitude: -46.189,
    },
    {
      id: '4',
      nome: 'Estufa A - Tomate Cereja',
      local: 'Setor Sul',
      status: 'Crítica',
      severidade: 'Urgente',
      latitude: -23.5241,
      longitude: -46.1864,
    },
  ],
  relatos: [
    {
      id: 'r1',
      microarea: 'Canteiro 1 - Repolho',
      microareaId: '1',
      texto:
        'Ataque forte de lagarta nas folhas basais, perfurações visíveis e umidade alta acumulada.',
      praga: 'Lagarta-das-crucíferas e perfurações foliares',
      tratamentoAtual: 'Óleo de Neem preventivo (aplicado há 7 dias)',
      solucao: 'Aplicar Bacillus thuringiensis (Bt) no fim da tarde e revisar bordadura',
      severidade: 'Urgente',
      categoria: 'Praga / Insetos',
      data: '2026-11-13 08:30',
      resolvido: false,
    },
    {
      id: 'r2',
      microarea: 'Estufa B - Alface Crespa',
      microareaId: '2',
      texto:
        'Início de pontas amarelas nas folhas, provável excesso de irrigação ou variação térmica.',
      praga: 'Queima de borda / estresse hídrico',
      tratamentoAtual: 'Irrigação por gotejamento 2x ao dia',
      solucao: 'Reduzir turno de rega vespertina e ajustar adubação com cálcio',
      severidade: 'Média',
      categoria: 'Nutrição / Clima',
      data: '2026-11-12 14:15',
      resolvido: false,
    },
    {
      id: 'r3',
      microarea: 'Estufa A - Tomate Cereja',
      microareaId: '4',
      texto:
        'Manchas escuras nas folhas inferiores com previsão de chuva de 100%, alto risco de fungo.',
      praga: 'Pinta-preta / Alternária foliar',
      tratamentoAtual: 'Calda bordalesa aplicada há 10 dias',
      solucao: 'Retirar folhas baixeiras afetadas, ventilar estufa e aplicar fungicida cúprico',
      severidade: 'Urgente',
      categoria: 'Doença / Fúngica',
      data: '2026-11-13 10:00',
      resolvido: false,
    },
  ],
};

function mapStatusToInternal(status: string): MicroareaStatus {
  const s = status.toLowerCase();
  if (s.includes('crít') || s.includes('crit')) return 'critico';
  if (s.includes('aten')) return 'atencao';
  return 'saudavel';
}

function mapStatusToLabel(status: MicroareaStatus): string {
  if (status === 'critico') return 'Crítica';
  if (status === 'atencao') return 'Em Atenção';
  return 'Saudável';
}

function mapSeverityToInternal(sev: string): Severity {
  const s = sev.toLowerCase();
  if (s.includes('urg')) return 'urgente';
  if (s.includes('méd') || s.includes('med')) return 'media';
  return 'baixa';
}

function mapSeverityToLabel(sev: Severity): string {
  if (sev === 'urgente') return 'Urgente';
  if (sev === 'media') return 'Média';
  return 'Baixa';
}

function mapCategoryToInternal(cat: string): ReportCategory {
  const c = cat.toLowerCase();
  if (c.includes('praga') || c.includes('inset')) return 'praga';
  if (c.includes('doen') || c.includes('fung')) return 'doenca';
  if (c.includes('irrig')) return 'irrigacao';
  if (c.includes('nutri')) return 'nutricao';
  if (c.includes('clim')) return 'clima';
  return 'geral';
}

function extractCropFromName(nome: string): string {
  const parts = nome.split('-');
  if (parts.length > 1) {
    return parts.slice(1).join('-').trim();
  }
  return nome.trim();
}

function parseDateMs(dateStr: string): number {
  const isoCandidate = dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
  const parsed = Date.parse(isoCandidate);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function inicializarDadosDemo(): {
  microareas: Microarea[];
  reports: FieldReport[];
} {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (!localStorage.getItem(LS_MICROAREAS_KEY)) {
      localStorage.setItem(
        LS_MICROAREAS_KEY,
        JSON.stringify(dadosFicticiosIniciais.microareas)
      );
    }
    if (!localStorage.getItem(LS_REPORTS_KEY)) {
      localStorage.setItem(
        LS_REPORTS_KEY,
        JSON.stringify(dadosFicticiosIniciais.relatos)
      );
    }
  }

  return loadDemoData();
}

export function loadDemoData(): {
  microareas: Microarea[];
  reports: FieldReport[];
} {
  let rawAreas: RawDemoMicroarea[] = dadosFicticiosIniciais.microareas;
  let rawReports: RawDemoReport[] = dadosFicticiosIniciais.relatos;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const storedAreas = localStorage.getItem(LS_MICROAREAS_KEY);
      if (storedAreas) rawAreas = JSON.parse(storedAreas);
      const storedReports = localStorage.getItem(LS_REPORTS_KEY);
      if (storedReports) rawReports = JSON.parse(storedReports);
    } catch {
      rawAreas = dadosFicticiosIniciais.microareas;
      rawReports = dadosFicticiosIniciais.relatos;
    }
  }

  const areaByName = new Map<string, RawDemoMicroarea>();
  rawAreas.forEach((a) => areaByName.set(a.nome, a));

  const demoFallbackById = new Map<string, RawDemoReport>();
  dadosFicticiosIniciais.relatos.forEach((r) => demoFallbackById.set(r.id, r));

  const reports: FieldReport[] = rawReports
    .map((r) => {
      const areaMatch = areaByName.get(r.microarea);
      const createdAtMs = parseDateMs(r.data);
      const dt = new Date(createdAtMs);
      const seasonMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const autoClass = classifyFieldReport(r.texto);
      const seedMatch = demoFallbackById.get(r.id);

      return {
        id: r.id,
        ownerId: 'demo',
        microareaId: r.microareaId || areaMatch?.id || r.microarea,
        microareaName: r.microarea,
        crop: extractCropFromName(r.microarea),
        transcript: r.texto,
        pestProblem: r.praga || seedMatch?.praga || autoClass.suggestedProblem || 'Não informado',
        pestCount: r.contagem || seedMatch?.contagem || 'Não informada',
        currentTreatment:
          r.tratamentoAtual ||
          seedMatch?.tratamentoAtual ||
          autoClass.suggestedTreatment ||
          'Nenhum tratamento aplicado',
        treatmentEfficiency: r.eficiencia || seedMatch?.eficiencia || 'parcial',
        recommendedSolution:
          r.solucao ||
          seedMatch?.solucao ||
          autoClass.suggestedSolution ||
          'Monitorar evolução em campo',
        severity: mapSeverityToInternal(r.severidade),
        category: mapCategoryToInternal(r.categoria),
        detectedKeywords: r.detectedKeywords ?? autoClass.detectedKeywords,
        latitude: r.latitude ?? areaMatch?.latitude ?? -23.5228,
        longitude: r.longitude ?? areaMatch?.longitude ?? -46.1883,
        resolved: Boolean(r.resolvido),
        seasonMonth,
        createdAtMs,
        updatedAtMs: createdAtMs,
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const microareas: Microarea[] = rawAreas.map((a, idx) => {
    const latestReport = reports.find(
      (r) => r.microareaId === a.id || r.microareaName === a.nome
    );
    const fallbackSummary =
      a.lastReportSummary ||
      latestReport?.transcript ||
      'Canteiro monitorado sem ocorrências pendentes.';

    return {
      id: a.id,
      ownerId: 'demo',
      name: a.nome,
      crop: extractCropFromName(a.nome),
      sector: a.local,
      status: mapStatusToInternal(a.status),
      latitude: a.latitude ?? -23.5219 - idx * 0.0007,
      longitude: a.longitude ?? -46.1872 - idx * 0.0005,
      lastReportSummary: fallbackSummary,
      lastSeverity: mapSeverityToInternal(a.severidade),
      createdAtMs: a.createdAtMs ?? Date.now() - (idx + 1) * 3600000,
      updatedAtMs: a.updatedAtMs ?? latestReport?.createdAtMs ?? Date.now(),
    };
  });

  return { microareas, reports };
}

export function saveDemoMicroareas(microareas: Microarea[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const raw: RawDemoMicroarea[] = microareas.map((m) => ({
    id: m.id,
    nome: m.name,
    local: m.sector,
    status: mapStatusToLabel(m.status),
    severidade: m.lastSeverity === 'nenhuma' ? 'Baixa' : mapSeverityToLabel(m.lastSeverity),
    latitude: m.latitude,
    longitude: m.longitude,
    lastReportSummary: m.lastReportSummary,
    createdAtMs: m.createdAtMs,
    updatedAtMs: m.updatedAtMs,
  }));
  localStorage.setItem(LS_MICROAREAS_KEY, JSON.stringify(raw));
}

export function saveDemoReports(reports: FieldReport[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const raw: RawDemoReport[] = reports.map((r) => {
    const dt = new Date(r.createdAtMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const formattedDate = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return {
      id: r.id,
      microarea: r.microareaName,
      microareaId: r.microareaId,
      texto: r.transcript,
      praga: r.pestProblem,
      contagem: r.pestCount,
      tratamentoAtual: r.currentTreatment,
      eficiencia: r.treatmentEfficiency,
      solucao: r.recommendedSolution,
      severidade: mapSeverityToLabel(r.severity),
      categoria: r.category,
      data: formattedDate,
      resolvido: r.resolved,
      detectedKeywords: r.detectedKeywords,
      latitude: r.latitude,
      longitude: r.longitude,
    };
  });
  localStorage.setItem(LS_REPORTS_KEY, JSON.stringify(raw));
}
