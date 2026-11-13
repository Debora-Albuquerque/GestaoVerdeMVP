import type {
  ClassificationResult,
  FieldReport,
  PhytosanitaryAlert,
  ReportCategory,
  Severity,
  TreatmentEfficiency,
  WeatherDay,
  WeatherSnapshot,
} from '../types';

export const MOGI_COORDS = {
  latitude: -23.5228,
  longitude: -46.1883,
  label: 'Mogi das Cruzes · Alto Tietê (SP)',
};

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface KeywordRule {
  term: string;
  label: string;
  category: ReportCategory;
}

const URGENT_RULES: KeywordRule[] = [
  { term: 'urgente', label: 'urgente', category: 'geral' },
  { term: 'grave', label: 'grave', category: 'geral' },
  { term: 'infestacao', label: 'infestação', category: 'praga' },
  { term: 'podridao', label: 'podridão', category: 'doenca' },
  { term: 'murcha', label: 'murcha', category: 'doenca' },
  { term: 'murchando', label: 'murchando', category: 'doenca' },
  { term: 'lagarta', label: 'lagarta', category: 'praga' },
  { term: 'pulgao', label: 'pulgão', category: 'praga' },
  { term: 'mosca branca', label: 'mosca branca', category: 'praga' },
  { term: 'traca', label: 'traça-das-crucíferas', category: 'praga' },
  { term: 'mildio', label: 'míldio', category: 'doenca' },
  { term: 'fungo', label: 'fungo', category: 'doenca' },
  { term: 'queima', label: 'queima foliar', category: 'doenca' },
  { term: 'alagou', label: 'alagamento', category: 'clima' },
  { term: 'alagado', label: 'alagamento', category: 'clima' },
  { term: 'morrendo', label: 'morte de planta', category: 'doenca' },
  { term: 'perda', label: 'risco de perda', category: 'geral' },
  { term: 'praga', label: 'praga', category: 'praga' },
  { term: 'mancha escura', label: 'mancha escura', category: 'doenca' },
  { term: 'bacteriose', label: 'bacteriose', category: 'doenca' },
];

const MEDIUM_RULES: KeywordRule[] = [
  { term: 'atencao', label: 'atenção', category: 'geral' },
  { term: 'amarel', label: 'folha amarelada', category: 'nutricao' },
  { term: 'seco', label: 'solo seco', category: 'irrigacao' },
  { term: 'seca', label: 'falta de água', category: 'irrigacao' },
  { term: 'furada', label: 'folha furada', category: 'praga' },
  { term: 'lesma', label: 'lesma', category: 'praga' },
  { term: 'caracol', label: 'caracol', category: 'praga' },
  { term: 'formiga', label: 'formiga', category: 'praga' },
  { term: 'acaro', label: 'ácaro', category: 'praga' },
  { term: 'tripes', label: 'tripes', category: 'praga' },
  { term: 'irrigacao', label: 'irrigação', category: 'irrigacao' },
  { term: 'gotejamento', label: 'gotejamento', category: 'irrigacao' },
  { term: 'entupido', label: 'bico entupido', category: 'irrigacao' },
  { term: 'umidade', label: 'umidade', category: 'clima' },
  { term: 'adubo', label: 'adubação', category: 'nutricao' },
  { term: 'deficiencia', label: 'deficiência nutricional', category: 'nutricao' },
  { term: 'mancha', label: 'mancha foliar', category: 'doenca' },
  { term: 'bicho', label: 'inseto', category: 'praga' },
  { term: 'vento', label: 'vento forte', category: 'clima' },
  { term: 'geada', label: 'frio intenso', category: 'clima' },
];

const LOW_RULES: KeywordRule[] = [
  { term: 'normal', label: 'normal', category: 'geral' },
  { term: 'saudavel', label: 'saudável', category: 'geral' },
  { term: 'colheita', label: 'ponto de colheita', category: 'geral' },
  { term: 'limpo', label: 'canteiro limpo', category: 'geral' },
  { term: 'adubacao', label: 'adubação preventiva', category: 'nutricao' },
  { term: 'revisao', label: 'revisão de rotina', category: 'geral' },
];

export function classifyFieldReport(transcript: string): ClassificationResult {
  const normalized = normalizeText(transcript);
  const detected: string[] = [];
  const categoryScore: Record<ReportCategory, number> = {
    praga: 0,
    doenca: 0,
    irrigacao: 0,
    clima: 0,
    nutricao: 0,
    geral: 0,
  };

  let urgentHits = 0;
  let mediumHits = 0;

  for (const rule of URGENT_RULES) {
    if (normalized.includes(rule.term)) {
      urgentHits += 1;
      categoryScore[rule.category] += 3;
      if (!detected.includes(rule.label)) detected.push(rule.label);
    }
  }

  for (const rule of MEDIUM_RULES) {
    if (normalized.includes(rule.term)) {
      mediumHits += 1;
      categoryScore[rule.category] += 2;
      if (!detected.includes(rule.label)) detected.push(rule.label);
    }
  }

  for (const rule of LOW_RULES) {
    if (normalized.includes(rule.term)) {
      categoryScore[rule.category] += 1;
      if (!detected.includes(rule.label)) detected.push(rule.label);
    }
  }

  let severity: Severity = 'baixa';
  if (urgentHits > 0) {
    severity = 'urgente';
  } else if (mediumHits > 0) {
    severity = 'media';
  }

  let topCategory: ReportCategory = 'geral';
  let bestScore = 0;
  (Object.keys(categoryScore) as ReportCategory[]).forEach((cat) => {
    if (cat !== 'geral' && categoryScore[cat] > bestScore) {
      bestScore = categoryScore[cat];
      topCategory = cat;
    }
  });

  const extracted = extractAgronomyDetails(transcript, topCategory, detected);

  return {
    severity,
    category: topCategory,
    detectedKeywords: detected.slice(0, 10),
    suggestedProblem: extracted.problem,
    suggestedTreatment: extracted.treatment,
    suggestedSolution: extracted.solution,
  };
}

function capitalizeFirst(str: string): string {
  const clean = str.trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function extractClauseAfterMarkers(rawText: string, markers: RegExp[]): string {
  for (const regex of markers) {
    const match = rawText.match(regex);
    if (match && match[1]) {
      const cleaned = match[1].replace(/^[:\-\s]+/, '').trim();
      if (cleaned.length >= 2) {
        return capitalizeFirst(cleaned.slice(0, 180));
      }
    }
  }
  return '';
}

function extractAgronomyDetails(
  transcript: string,
  category: ReportCategory,
  detectedKeywords: string[]
): { problem: string; treatment: string; solution: string } {
  const clean = transcript.trim();
  if (!clean) {
    return { problem: '', treatment: '', solution: '' };
  }

  // 1. Praga / Problema Identificado
  let problem = extractClauseAfterMarkers(clean, [
    /(?:praga|problema(?:\s+identificado)?|ocorr[eê]ncia)\s*(?::|é|de)?\s*([^.,;\n]+)/i,
  ]);

  if (!problem) {
    const specificPests = detectedKeywords.filter(
      (kw) => !['urgente', 'grave', 'atenção', 'normal', 'saudável', 'revisão de rotina'].includes(kw)
    );
    if (specificPests.length > 0) {
      problem = capitalizeFirst(specificPests.slice(0, 3).join(' e '));
    } else if (normalizeText(clean).includes('broca')) {
      problem = 'Ataque de broca';
    } else if (clean.length >= 3) {
      problem = capitalizeFirst(clean.split(/[.,;\n]/)[0].slice(0, 120));
    }
  }

  // 2. Tratamento Atual
  let treatment = extractClauseAfterMarkers(clean, [
    /(?:tratamento\s+atual|j[aá]\s+(?:apliquei|passei|usei)|estou\s+(?:usando|aplicando|passando)|em\s+uso|apliquei|usando)\s*(?::|o|a)?\s*([^.,;\n]+)/i,
  ]);

  if (!treatment) {
    const norm = normalizeText(clean);
    if (norm.includes('nenhum tratamento') || norm.includes('sem tratamento')) {
      treatment = 'Nenhum tratamento aplicado ainda';
    } else if (norm.includes('oleo de neem') || norm.includes('neem')) {
      treatment = 'Óleo de Neem';
    } else if (norm.includes('calda bordalesa') || norm.includes('bordalesa')) {
      treatment = 'Calda Bordalesa';
    } else if (norm.includes('bacillus') || /\bbt\b/.test(norm)) {
      treatment = 'Bacillus thuringiensis (Bt)';
    } else if (norm.includes('enxofre')) {
      treatment = 'Enxofre agrícola';
    }
  }

  // 3. Solução / Ação Recomendada
  let solution = extractClauseAfterMarkers(clean, [
    /(?:solu[çc][aã]o(?:\s+recomendada)?|a[çc][aã]o\s+recomendada|precisa(?:\s+de)?|recomendo|fazer)\s*(?::|é)?\s*([^.,;\n]+)/i,
  ]);

  if (!solution) {
    const norm = normalizeText(clean);
    if (norm.includes('lagarta') || norm.includes('broca') || norm.includes('traca')) {
      solution = 'Aplicar controle biológico (Bt) no fim da tarde e revisar bordadura';
    } else if (norm.includes('pulgao') || norm.includes('mosca branca') || norm.includes('tripes') || norm.includes('acaro')) {
      solution = 'Pulverizar óleo de neem ou inseticida seletivo na face inferior das folhas';
    } else if (norm.includes('mildio') || norm.includes('fungo') || norm.includes('mancha') || norm.includes('podridao')) {
      solution = 'Remover folhas afetadas, reforçar ventilação e aplicar fungicida cúprico';
    } else if (category === 'irrigacao') {
      solution = 'Revisar pressão do gotejamento, limpar bicos entupidos e ajustar turno de rega';
    } else if (category === 'nutricao') {
      solution = 'Realizar adubação foliar equilibrada e verificar pH/drenagem do canteiro';
    } else if (category === 'clima') {
      solution = 'Desobstruir valetas de drenagem e monitorar umidade nas próximas 24h';
    } else {
      solution = 'Monitorar evolução do canteiro na próxima ronda diária';
    }
  }

  return {
    problem: problem.slice(0, 160),
    treatment: treatment.slice(0, 200),
    solution: solution.slice(0, 240),
  };
}

export function classifyEfficiencyFromSpeech(text: string): TreatmentEfficiency | null {
  const norm = normalizeText(text).trim();
  if (!norm) return null;

  if (
    norm.includes('ineficiente') ||
    norm.includes('nao funciona') ||
    norm.includes('nao esta funcionando') ||
    norm.includes('nao esta eficiente') ||
    norm.includes('nao resolveu') ||
    norm.includes('sem efeito') ||
    norm.includes('piorou') ||
    norm.includes('ruim') ||
    norm.includes('nenhum resultado') ||
    norm.includes('fraco') ||
    /\bnao\b/.test(norm)
  ) {
    return 'ineficiente';
  }

  if (
    norm.includes('parcial') ||
    norm.includes('mais ou menos') ||
    norm.includes('pouco') ||
    norm.includes('metade') ||
    norm.includes('devagar') ||
    norm.includes('medio') ||
    norm.includes('media')
  ) {
    return 'parcial';
  }

  if (
    norm.includes('eficiente') ||
    norm.includes('funcionando') ||
    norm.includes('funcionou') ||
    norm.includes('resolveu') ||
    norm.includes('melhorou') ||
    norm.includes('controlado') ||
    norm.includes('otimo') ||
    norm.includes('bom') ||
    /\bsim\b/.test(norm)
  ) {
    return 'eficiente';
  }

  return null;
}

export function getEfficiencyLabel(efficiency: TreatmentEfficiency): string {
  if (efficiency === 'eficiente') return 'Eficiente';
  if (efficiency === 'parcial') return 'Parcial';
  return 'Ineficiente';
}

export function classifyGuidedWizardReport(input: {
  pestProblem: string;
  pestCount: string;
  currentTreatment: string;
  treatmentEfficiency: TreatmentEfficiency;
}): ClassificationResult {
  const combined = `${input.pestProblem} ${input.pestCount} ${input.currentTreatment}`.trim();
  const base = classifyFieldReport(combined);
  const normCount = normalizeText(input.pestCount);

  const highIntensity =
    normCount.includes('alt') ||
    normCount.includes('muit') ||
    normCount.includes('bastante') ||
    normCount.includes('forte') ||
    normCount.includes('infest') ||
    normCount.includes('generaliz') ||
    normCount.includes('sever');

  const mediumIntensity =
    normCount.includes('medi') ||
    normCount.includes('moderad') ||
    normCount.includes('vari') ||
    normCount.includes('algum');

  let severity: Severity = base.severity;

  if (input.treatmentEfficiency === 'ineficiente') {
    severity = 'urgente';
  } else if (input.treatmentEfficiency === 'parcial') {
    if (highIntensity || base.severity === 'urgente') {
      severity = 'urgente';
    } else if (mediumIntensity || base.severity === 'media' || input.pestProblem.trim()) {
      severity = 'media';
    }
  } else {
    if (highIntensity && base.severity === 'urgente') {
      severity = 'media';
    } else {
      severity = base.severity === 'urgente' ? 'media' : 'baixa';
    }
  }

  const cleanTreatment = input.currentTreatment.trim() || 'manejo atual';
  let suggestedSolution = base.suggestedSolution;
  if (input.treatmentEfficiency === 'ineficiente') {
    suggestedSolution = `Substituir ${cleanTreatment}, aplicar controle específico para ${input.pestProblem.trim() || 'o foco'} e isolar áreas vizinhas`;
  } else if (input.treatmentEfficiency === 'parcial') {
    suggestedSolution = `Reforçar ${cleanTreatment} nas horas frescas, ajustar cobertura e reavaliar em 48h`;
  } else {
    suggestedSolution = `Manter ${cleanTreatment} conforme cronograma e seguir vistoria preventiva`;
  }

  return {
    severity,
    category: base.category,
    detectedKeywords: base.detectedKeywords,
    suggestedProblem: input.pestProblem.trim().slice(0, 160),
    suggestedTreatment: cleanTreatment.slice(0, 200),
    suggestedSolution: suggestedSolution.slice(0, 240),
  };
}

export interface AiAgronomicAnalysis {
  pragaDoenca: string;
  contagemPopulosional: string;
  tratamentoAtual: string;
  eficiencia: 'Eficiente' | 'Parcial' | 'Ineficiente';
  nivelAcao: 'Baixa' | 'Média' | 'Crítica/Urgente';
  recomendacaoSolucao: string;
}

export interface AiAnalysisResponse {
  analysis: AiAgronomicAnalysis;
  provider: 'openrouter' | 'fallback';
  warning?: string;
}

export function mapAiEfficiencyToInternal(
  raw: AiAgronomicAnalysis['eficiencia'] | string
): TreatmentEfficiency {
  const norm = normalizeText(String(raw || ''));
  if (norm.includes('ineficiente')) return 'ineficiente';
  if (norm.includes('eficiente') && !norm.includes('parcial')) return 'eficiente';
  return 'parcial';
}

export async function analisarRelatoComIA(
  textoDoRelato: string,
  microarea?: string
): Promise<AiAnalysisResponse> {
  const cleanText = textoDoRelato.trim();
  if (cleanText.length < 3) {
    throw new Error('Informe ou grave pelo menos 3 caracteres antes de analisar com IA.');
  }

  const response = await fetch('/api/analyze-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      textoDoRelato: cleanText,
      microarea,
    }),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Falha ao analisar relato (${response.status}).`);
  }

  return (await response.json()) as AiAnalysisResponse;
}


function wmoCodeToPt(code: number): string {
  if (code === 0) return 'Céu limpo';
  if (code === 1 || code === 2) return 'Poucas nuvens';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Neblina úmida';
  if (code >= 51 && code <= 57) return 'Garoa fina';
  if (code >= 61 && code <= 65) return 'Chuva';
  if (code >= 80 && code <= 82) return 'Pancadas de chuva';
  if (code >= 95) return 'Tempestade';
  return 'Tempo instável';
}

function formatDayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Hoje';
  if (index === 1) return 'Amanhã';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export async function fetchMogiWeather(
  latitude = MOGI_COORDS.latitude,
  longitude = MOGI_COORDS.longitude,
  locationLabel = MOGI_COORDS.label
): Promise<WeatherSnapshot> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(latitude.toFixed(4))}` +
    `&longitude=${encodeURIComponent(longitude.toFixed(4))}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_probability_max,weather_code` +
    `&timezone=America%2FSao_Paulo&forecast_days=3`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao consultar previsão do tempo (${response.status}).`);
  }

  const data = await response.json();
  const times: string[] = data?.daily?.time || [];
  const tempMax: number[] = data?.daily?.temperature_2m_max || [];
  const tempMin: number[] = data?.daily?.temperature_2m_min || [];
  const humidityMean: number[] = data?.daily?.relative_humidity_2m_mean || [];
  const precipProb: number[] = data?.daily?.precipitation_probability_max || [];
  const codes: number[] = data?.daily?.weather_code || [];

  const days: WeatherDay[] = times.slice(0, 3).map((dateStr, idx) => ({
    date: dateStr,
    label: formatDayLabel(dateStr, idx),
    tempMin: Math.round(tempMin[idx] ?? 16),
    tempMax: Math.round(tempMax[idx] ?? 24),
    humidityMean: Math.round(humidityMean[idx] ?? 75),
    precipitationProb: Math.round(precipProb[idx] ?? 20),
    weatherCode: Number(codes[idx] ?? 2),
    conditionText: wmoCodeToPt(Number(codes[idx] ?? 2)),
  }));

  return {
    locationLabel,
    latitude,
    longitude,
    currentTemp: Math.round(data?.current?.temperature_2m ?? days[0]?.tempMax ?? 22),
    currentHumidity: Math.round(data?.current?.relative_humidity_2m ?? days[0]?.humidityMean ?? 74),
    currentCondition: wmoCodeToPt(Number(data?.current?.weather_code ?? 2)),
    fetchedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    days,
  };
}

export function evaluatePhytosanitaryRisk(snapshot: WeatherSnapshot): PhytosanitaryAlert {
  const maxHumidity = Math.max(...snapshot.days.map((d) => d.humidityMean), snapshot.currentHumidity);
  const maxTemp = Math.max(...snapshot.days.map((d) => d.tempMax), snapshot.currentTemp);
  const maxRainProb = Math.max(...snapshot.days.map((d) => d.precipitationProb));

  const factors: string[] = [];

  if (maxHumidity >= 80 && maxTemp >= 18) {
    factors.push(`Umidade prevista de até ${maxHumidity}%`);
    if (maxRainProb >= 55) {
      factors.push(`Chuva provável (${maxRainProb}%)`);
    }
    return {
      level: 'alto',
      title: 'Alerta Fitossanitário: Alto risco de fungos e podridão',
      recommendation:
        'Umidade elevada favorece Míldio, Alternária e Podridão Mole em repolho, alface e couve. Evite irrigar no fim da tarde e priorize inspeção nas áreas de várzea e estufas.',
      factors,
    };
  }

  if (maxTemp >= 28 && maxHumidity < 65) {
    factors.push(`Máxima prevista de ${maxTemp}°C`);
    factors.push(`Umidade reduzida`);
    return {
      level: 'alto',
      title: 'Alerta Fitossanitário: Calor seco favorece pragas sugadoras',
      recommendation:
        'Clima quente e mais seco aumenta incidência de Pulgão, Tripes e Ácaro-rajado. Verifique face inferior das folhas e reforce o turno de irrigação nas horas frescas.',
      factors,
    };
  }

  if (maxRainProb >= 65) {
    factors.push(`Probabilidade de chuva de ${maxRainProb}%`);
    return {
      level: 'moderado',
      title: 'Atenção: Chuva prevista nos próximos dias',
      recommendation:
        'Risco moderado de encharcamento em canteiros baixos e escorrimento de nutrientes. Revise drenagem das valetas antes da chuva.',
      factors,
    };
  }

  if (maxHumidity >= 72) {
    factors.push(`Umidade média até ${maxHumidity}%`);
    return {
      level: 'moderado',
      title: 'Monitoramento Preventivo: Umidade típica do Alto Tietê',
      recommendation:
        'Condição moderada para doenças foliares em culturas adensadas. Mantenha ventilação nas estufas e monitore sinais iniciais de manchas.',
      factors,
    };
  }

  return {
    level: 'baixo',
    title: 'Condição Favorável para Manejo em Campo',
    recommendation:
      'Temperatura e umidade equilibradas para hortaliças nos próximos 3 dias. Boa janela para tratos culturais, adubação de cobertura e colheita.',
    factors: [`Máxima até ${maxTemp}°C`, `Umidade até ${maxHumidity}%`],
  };
}

export interface SeasonalityReportData {
  totalReports: number;
  urgentCount: number;
  mediumCount: number;
  lowCount: number;
  resolvedCount: number;
  byMonth: { month: string; label: string; total: number; urgent: number }[];
  byCrop: { crop: string; total: number; urgent: number }[];
  byCategory: { category: ReportCategory; label: string; total: number }[];
  insight: string;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  praga: 'Pragas (lagarta, pulgão, lesma)',
  doenca: 'Doenças fúngicas / bacterianas',
  irrigacao: 'Irrigação e solo',
  clima: 'Impacto climático / chuva',
  nutricao: 'Nutrição e amarelecimento',
  geral: 'Manejo geral / rotina',
};

export function getCategoryLabel(category: ReportCategory): string {
  return CATEGORY_LABELS[category] || 'Manejo geral';
}

export function buildSeasonalitySummary(
  reports: FieldReport[],
  periodDays: 7 | 30 | 365
): SeasonalityReportData {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const filtered =
    periodDays === 365 ? reports : reports.filter((r) => r.createdAtMs >= cutoff);

  const monthMap = new Map<string, { total: number; urgent: number }>();
  const cropMap = new Map<string, { total: number; urgent: number }>();
  const catMap = new Map<ReportCategory, number>();

  let urgentCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let resolvedCount = 0;

  for (const r of filtered) {
    if (r.severity === 'urgente') urgentCount += 1;
    else if (r.severity === 'media') mediumCount += 1;
    else lowCount += 1;

    if (r.resolved) resolvedCount += 1;

    const mKey = r.seasonMonth || 'Atual';
    const prevM = monthMap.get(mKey) || { total: 0, urgent: 0 };
    monthMap.set(mKey, {
      total: prevM.total + 1,
      urgent: prevM.urgent + (r.severity === 'urgente' ? 1 : 0),
    });

    const prevC = cropMap.get(r.crop) || { total: 0, urgent: 0 };
    cropMap.set(r.crop, {
      total: prevC.total + 1,
      urgent: prevC.urgent + (r.severity === 'urgente' ? 1 : 0),
    });

    catMap.set(r.category, (catMap.get(r.category) || 0) + 1);
  }

  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, counts]) => {
      const [y, m] = month.split('-');
      const label =
        y && m
          ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', {
              month: 'short',
              year: '2-digit',
            })
          : month;
      return { month, label, ...counts };
    });

  const byCrop = Array.from(cropMap.entries())
    .map(([crop, counts]) => ({ crop, ...counts }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const byCategory = Array.from(catMap.entries())
    .map(([category, total]) => ({
      category,
      label: CATEGORY_LABELS[category],
      total,
    }))
    .sort((a, b) => b.total - a.total);

  let insight =
    'Ainda não há ocorrências suficientes no período selecionado para apontar tendências sazonais.';
  if (filtered.length > 0) {
    const topCrop = byCrop[0];
    const topCat = byCategory[0];
    insight =
      `No período analisado (${filtered.length} registros), a principal frente de risco foi ` +
      `"${topCat?.label ?? 'Manejo geral'}"` +
      (topCrop ? `, com maior recorrência na cultura de ${topCrop.crop} (${topCrop.total} registros).` : '.') +
      (urgentCount > 0
        ? ` Houve ${urgentCount} ocorrência(s) urgente(s) — recomenda-se reforçar prevenção antes dos picos de umidade.`
        : ' Nenhuma ocorrência urgente foi registrada neste recorte.');
  }

  return {
    totalReports: filtered.length,
    urgentCount,
    mediumCount,
    lowCount,
    resolvedCount,
    byMonth,
    byCrop,
    byCategory,
    insight,
  };
}

export function exportSeasonalityCsv(reports: FieldReport[]): void {
  const headers = [
    'Data',
    'Mes_Safra',
    'Microarea',
    'Cultura',
    'Severidade',
    'Categoria',
    'Praga_Doenca',
    'Contagem_Intensidade',
    'Combate_Atual',
    'Eficiencia_Combate',
    'Solucao_Recomendada',
    'Status',
    'Latitude',
    'Longitude',
    'Relato_Consolidado',
  ];

  const rows = reports.map((r) => [
    new Date(r.createdAtMs).toLocaleString('pt-BR'),
    r.seasonMonth,
    `"${r.microareaName.replace(/"/g, '""')}"`,
    `"${r.crop.replace(/"/g, '""')}"`,
    r.severity.toUpperCase(),
    r.category,
    `"${(r.pestProblem || '').replace(/"/g, '""')}"`,
    `"${(r.pestCount || '').replace(/"/g, '""')}"`,
    `"${(r.currentTreatment || '').replace(/"/g, '""')}"`,
    getEfficiencyLabel(r.treatmentEfficiency || 'parcial'),
    `"${(r.recommendedSolution || '').replace(/"/g, '""')}"`,
    r.resolved ? 'Resolvido' : 'Em aberto',
    r.latitude.toFixed(6),
    r.longitude.toFixed(6),
    `"${r.transcript.replace(/"/g, '""')}"`,
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gestao-verde-sazonalidade-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
