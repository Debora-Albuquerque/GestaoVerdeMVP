import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  MapPin,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Sprout,
  Square,
  X,
} from 'lucide-react';
import type { Microarea, Severity, TreatmentEfficiency } from '../types';
import {
  analisarRelatoComIA,
  classifyEfficiencyFromSpeech,
  classifyGuidedWizardReport,
  getCategoryLabel,
  getEfficiencyLabel,
  mapAiEfficiencyToInternal,
} from '../utils/agronomy';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

type WizardStep = 1 | 2 | 3 | 4 | 'review';

interface FieldVoiceSectionProps {
  isAuthenticated: boolean;
  microareas: Microarea[];
  selectedMicroareaId: string;
  onSelectMicroarea: (id: string) => void;
  activeCoords: { latitude: number; longitude: number; label: string };
  onCaptureGps: () => Promise<{ latitude: number; longitude: number } | null>;
  gpsLoading: boolean;
  showNewForm: boolean;
  onToggleNewForm: (open: boolean) => void;
  onSaveReport: (payload: {
    microarea: Microarea;
    transcript: string;
    pestProblem: string;
    pestCount: string;
    currentTreatment: string;
    treatmentEfficiency: TreatmentEfficiency;
    recommendedSolution: string;
    latitude: number;
    longitude: number;
  }) => Promise<void>;
  onCreateMicroarea: (payload: {
    name: string;
    crop: string;
    sector: string;
    latitude: number;
    longitude: number;
  }) => Promise<string>;
  onSeedStarters: () => Promise<void>;
}

const STEP_META: Record<
  1 | 2 | 3 | 4,
  { shortTitle: string; question: string; placeholder: string; voiceExample: string }
> = {
  1: {
    shortTitle: 'Praga',
    question: 'Qual é a praga ou doença?',
    placeholder: 'Ex: Lagarta nas folhas do repolho, míldio, pulgão...',
    voiceExample: 'Fale o problema visto no canteiro (ex: "Lagarta nas folhas basais").',
  },
  2: {
    shortTitle: 'Contagem',
    question: 'Quantos insetos ou qual a intensidade?',
    placeholder: 'Ex: Mais de 15 lagartas por metro, intensidade alta...',
    voiceExample: 'Informe quantidade aproximada ou intensidade (ex: "Cerca de 10 por planta, alta").',
  },
  3: {
    shortTitle: 'Combate',
    question: 'Como está sendo combatida?',
    placeholder: 'Ex: Óleo de Neem há 5 dias, calda bordalesa, nenhum...',
    voiceExample: 'Diga o defensivo, calda ou manejo já aplicado (ou "Nenhum combate ainda").',
  },
  4: {
    shortTitle: 'Eficiência',
    question: 'O combate está eficiente?',
    placeholder: 'Ex: Ineficiente, parcial ou eficiente...',
    voiceExample: 'Fale "Eficiente", "Parcial" ou "Ineficiente" (ou toque na opção abaixo).',
  },
};

function severityBadgeUi(severity: Severity): { label: string; textColor: string; boxClasses: string } {
  if (severity === 'urgente') {
    return {
      label: 'Urgente',
      textColor: 'text-red-800',
      boxClasses: 'bg-red-50 border-red-200 text-red-900',
    };
  }
  if (severity === 'media') {
    return {
      label: 'Média',
      textColor: 'text-amber-800',
      boxClasses: 'bg-amber-50 border-amber-200 text-amber-900',
    };
  }
  return {
    label: 'Baixa',
    textColor: 'text-emerald-800',
    boxClasses: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  };
}

function efficiencyDotClass(eff: TreatmentEfficiency): string {
  if (eff === 'eficiente') return 'bg-emerald-500';
  if (eff === 'parcial') return 'bg-amber-500';
  return 'bg-red-600';
}

export function FieldVoiceSection({
  isAuthenticated,
  microareas,
  selectedMicroareaId,
  onSelectMicroarea,
  activeCoords,
  onCaptureGps,
  gpsLoading,
  showNewForm,
  onToggleNewForm,
  onSaveReport,
  onCreateMicroarea,
  onSeedStarters,
}: FieldVoiceSectionProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [pestProblem, setPestProblem] = useState('');
  const [pestCount, setPestCount] = useState('');
  const [currentTreatment, setCurrentTreatment] = useState('');
  const [treatmentEfficiency, setTreatmentEfficiency] =
    useState<TreatmentEfficiency | null>(null);
  const [efficiencySpeechNote, setEfficiencySpeechNote] = useState('');
  const [recommendedSolution, setRecommendedSolution] = useState('');

  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCrop, setNewCrop] = useState('');
  const [newSector, setNewSector] = useState('Canteiro Aberto');
  const [creatingArea, setCreatingArea] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recordingStepRef = useRef<1 | 2 | 3 | 4>(1);
  const manualSolutionEditedRef = useRef(false);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const selectedMicroarea = useMemo(
    () => microareas.find((m) => m.id === selectedMicroareaId) || microareas[0] || null,
    [microareas, selectedMicroareaId]
  );

  // Valores efetivos considerando a fala em andamento (interimText)
  const effectiveProblem =
    isRecording && recordingStepRef.current === 1
      ? [pestProblem.trim(), interimText.trim()].filter(Boolean).join(' ')
      : pestProblem;
  const effectiveCount =
    isRecording && recordingStepRef.current === 2
      ? [pestCount.trim(), interimText.trim()].filter(Boolean).join(' ')
      : pestCount;
  const effectiveTreatment =
    isRecording && recordingStepRef.current === 3
      ? [currentTreatment.trim(), interimText.trim()].filter(Boolean).join(' ')
      : currentTreatment;
  const effectiveEfficiencyNote =
    isRecording && recordingStepRef.current === 4
      ? [efficiencySpeechNote.trim(), interimText.trim()].filter(Boolean).join(' ')
      : efficiencySpeechNote;

  const resolvedEfficiency: TreatmentEfficiency = treatmentEfficiency || 'parcial';

  const wizardClassification = useMemo(
    () =>
      classifyGuidedWizardReport({
        pestProblem: effectiveProblem,
        pestCount: effectiveCount,
        currentTreatment: effectiveTreatment,
        treatmentEfficiency: resolvedEfficiency,
      }),
    [effectiveProblem, effectiveCount, effectiveTreatment, resolvedEfficiency]
  );

  useEffect(() => {
    if (!manualSolutionEditedRef.current && wizardClassification.suggestedSolution) {
      setRecommendedSolution(wizardClassification.suggestedSolution);
    }
  }, [wizardClassification.suggestedSolution]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, []);

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop error
      }
    }
    setIsRecording(false);
    setInterimText('');
  };

  const appendFinalTranscriptToStep = (targetStep: 1 | 2 | 3 | 4, text: string) => {
    const clean = text.trim();
    if (!clean) return;

    if (targetStep === 1) {
      setPestProblem((prev) => [prev.trim(), clean].filter(Boolean).join(' '));
    } else if (targetStep === 2) {
      setPestCount((prev) => [prev.trim(), clean].filter(Boolean).join(' '));
    } else if (targetStep === 3) {
      setCurrentTreatment((prev) => [prev.trim(), clean].filter(Boolean).join(' '));
    } else if (targetStep === 4) {
      setEfficiencySpeechNote((prev) => {
        const merged = [prev.trim(), clean].filter(Boolean).join(' ');
        const detected = classifyEfficiencyFromSpeech(merged);
        if (detected) {
          setTreatmentEfficiency(detected);
        }
        return merged;
      });
    }
  };

  const startVoiceRecording = (targetStep: 1 | 2 | 3 | 4) => {
    setSpeechError(null);
    setSaveFeedback(null);

    if (!speechSupported) {
      setSpeechError(
        'Seu navegador não suporta reconhecimento de voz nativo. Preencha ou toque nas opções abaixo.'
      );
      return;
    }

    const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechCtor) return;

    try {
      const recognition = new SpeechCtor();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recordingStepRef.current = targetStep;

      recognition.onresult = (event) => {
        let finalAdded = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalAdded += piece + ' ';
          } else {
            interim += piece;
          }
        }

        if (finalAdded.trim()) {
          appendFinalTranscriptToStep(recordingStepRef.current, finalAdded);
        }
        setInterimText(interim);

        if (recordingStepRef.current === 4 && interim.trim()) {
          const previewEff = classifyEfficiencyFromSpeech(interim);
          if (previewEff) setTreatmentEfficiency(previewEff);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setSpeechError(
            'Permissão de microfone negada. Autorize o microfone no navegador para gravar por voz.'
          );
        } else if (event.error === 'no-speech') {
          setSpeechError('Nenhuma fala detectada. Fale próximo ao microfone do celular.');
        } else if (event.error !== 'aborted') {
          setSpeechError(`Erro na captação de voz (${event.error}).`);
        }
        setIsRecording(false);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsRecording(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch {
      setSpeechError('Não foi possível iniciar o microfone neste dispositivo.');
      setIsRecording(false);
    }
  };

  const handleToggleVoice = (targetStep: 1 | 2 | 3 | 4) => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording(targetStep);
    }
  };

  const resetWizard = () => {
    if (isRecording) stopVoiceRecording();
    setStep(1);
    setPestProblem('');
    setPestCount('');
    setCurrentTreatment('');
    setTreatmentEfficiency(null);
    setEfficiencySpeechNote('');
    setRecommendedSolution('');
    setAiFeedback(null);
    setSpeechError(null);
    manualSolutionEditedRef.current = false;
  };

  const goToStep = (nextStep: WizardStep) => {
    if (isRecording) stopVoiceRecording();
    setSpeechError(null);
    setStep(nextStep);
  };

  const handleAiAnalyze = async (sourceText: string, mode: 'fromStep1' | 'fromReview') => {
    const cleanText = sourceText.trim();
    setSpeechError(null);
    setSaveFeedback(null);
    setAiFeedback(null);

    if (cleanText.length < 3) {
      setSpeechError('Descreva ou grave o relato antes de solicitar a análise agronômica por IA.');
      return;
    }

    if (isRecording) stopVoiceRecording();

    setAiAnalyzing(true);
    try {
      const result = await analisarRelatoComIA(cleanText, selectedMicroarea?.name);
      const { analysis, provider, warning } = result;
      const mappedEff = mapAiEfficiencyToInternal(analysis.eficiencia);

      if (mode === 'fromStep1') {
        setPestProblem(analysis.pragaDoenca);
        setPestCount(analysis.contagemPopulosional);
        setCurrentTreatment(analysis.tratamentoAtual);
        setTreatmentEfficiency(mappedEff);
        manualSolutionEditedRef.current = true;
        setRecommendedSolution(analysis.recomendacaoSolucao);
        setStep('review');
      } else {
        if (!pestProblem.trim()) setPestProblem(analysis.pragaDoenca);
        if (!pestCount.trim()) setPestCount(analysis.contagemPopulosional);
        if (!currentTreatment.trim()) setCurrentTreatment(analysis.tratamentoAtual);
        if (!treatmentEfficiency) setTreatmentEfficiency(mappedEff);
        manualSolutionEditedRef.current = true;
        setRecommendedSolution(analysis.recomendacaoSolucao);
      }

      setAiFeedback(
        provider === 'openrouter'
          ? 'Análise agronômica aplicada via IA OpenRouter.'
          : warning || 'Análise aplicada pelo motor agronômico local.'
      );
    } catch (err) {
      setSpeechError(
        err instanceof Error ? err.message : 'Não foi possível analisar o relato com IA.'
      );
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleNextFromStep = (currentStep: 1 | 2 | 3 | 4) => {
    setSpeechError(null);
    if (isRecording) stopVoiceRecording();

    if (currentStep === 1) {
      if (effectiveProblem.trim().length < 2) {
        setSpeechError('Etapa 1: Informe ou grave qual é a praga ou doença identificada.');
        return;
      }
      goToStep(2);
      return;
    }

    if (currentStep === 2) {
      if (effectiveCount.trim().length < 2) {
        setSpeechError('Etapa 2: Informe ou grave a contagem ou intensidade da ocorrência.');
        return;
      }
      goToStep(3);
      return;
    }

    if (currentStep === 3) {
      if (effectiveTreatment.trim().length < 2) {
        setSpeechError('Etapa 3: Informe ou grave como está sendo combatida (ou toque em Nenhum combate).');
        return;
      }
      goToStep(4);
      return;
    }

    if (!treatmentEfficiency) {
      setSpeechError('Etapa 4: Fale ou selecione se o combate está Eficiente, Parcial ou Ineficiente.');
      return;
    }
    goToStep('review');
  };

  const consolidatedTranscript = useMemo(() => {
    const areaName = selectedMicroarea?.name || 'Microárea';
    const effLabel = treatmentEfficiency ? getEfficiencyLabel(treatmentEfficiency) : 'Parcial';
    const sevLabel = severityBadgeUi(wizardClassification.severity).label;
    return (
      `${areaName} | Praga: ${effectiveProblem.trim() || '-'} | ` +
      `Contagem: ${effectiveCount.trim() || '-'} | ` +
      `Combate: ${effectiveTreatment.trim() || '-'} | ` +
      `Eficiência: ${effLabel} | Severidade: ${sevLabel}`
    );
  }, [
    selectedMicroarea,
    effectiveProblem,
    effectiveCount,
    effectiveTreatment,
    treatmentEfficiency,
    wizardClassification.severity,
  ]);

  const handleSendToCloud = async () => {
    setSaveFeedback(null);
    setSpeechError(null);

    if (!selectedMicroarea) {
      setSpeechError('Selecione ou cadastre uma microárea antes de enviar o relato.');
      return;
    }

    const cleanProblem = effectiveProblem.trim();
    const cleanCount = effectiveCount.trim();
    const cleanTreatment = effectiveTreatment.trim();
    const cleanEfficiency: TreatmentEfficiency = treatmentEfficiency || 'parcial';
    const cleanSolution =
      recommendedSolution.trim() || wizardClassification.suggestedSolution;

    if (cleanProblem.length < 2 || cleanCount.length < 2 || cleanTreatment.length < 2) {
      setSpeechError('Complete as etapas 1, 2 e 3 antes de enviar para a nuvem.');
      return;
    }

    if (isRecording) stopVoiceRecording();

    setSaving(true);
    try {
      await onSaveReport({
        microarea: selectedMicroarea,
        transcript: consolidatedTranscript,
        pestProblem: cleanProblem,
        pestCount: cleanCount,
        currentTreatment: cleanTreatment,
        treatmentEfficiency: cleanEfficiency,
        recommendedSolution: cleanSolution,
        latitude: activeCoords.latitude,
        longitude: activeCoords.longitude,
      });
      resetWizard();
      setSaveFeedback(
        isAuthenticated
          ? `Relato consolidado enviado para a nuvem (${selectedMicroarea.name}).`
          : `Relato salvo no painel (${selectedMicroarea.name}).`
      );
    } catch (err) {
      setSpeechError(err instanceof Error ? err.message : 'Erro ao enviar relato.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAreaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2 || newCrop.trim().length < 2) {
      setSpeechError('Informe o nome da microárea e a hortaliça cultivada.');
      return;
    }

    setCreatingArea(true);
    setSpeechError(null);
    try {
      const gps = await onCaptureGps();
      const createdId = await onCreateMicroarea({
        name: newName.trim(),
        crop: newCrop.trim(),
        sector: newSector,
        latitude: gps?.latitude ?? activeCoords.latitude,
        longitude: gps?.longitude ?? activeCoords.longitude,
      });
      onSelectMicroarea(createdId);
      setNewName('');
      setNewCrop('');
      onToggleNewForm(false);
      setSaveFeedback('Nova microárea cadastrada com GPS.');
    } catch (err) {
      setSpeechError(err instanceof Error ? err.message : 'Erro ao cadastrar microárea.');
    } finally {
      setCreatingArea(false);
    }
  };

  const handleSeedClick = async () => {
    setSeeding(true);
    try {
      await onSeedStarters();
      setSaveFeedback('4 microáreas de Mogi das Cruzes adicionadas ao seu painel.');
    } catch (err) {
      setSpeechError(
        err instanceof Error ? err.message : 'Erro ao carregar canteiros iniciais.'
      );
    } finally {
      setSeeding(false);
    }
  };

  const sevUi = severityBadgeUi(wizardClassification.severity);
  const progressPercent = step === 'review' ? 100 : (step / 4) * 100;

  return (
    <section
      id="campo"
      aria-labelledby="campo-heading"
      className="scroll-mt-16 bg-white border border-emerald-900/15 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4"
    >
      {/* Cabeçalho do Módulo de Campo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-emerald-700">
            Assistente de Voz Guiado · GPS e Microárea
          </p>
          <h2 id="campo-heading" className="text-lg sm:text-xl font-semibold text-slate-900">
            Registro em 4 Etapas
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onToggleNewForm(!showNewForm)}
          className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          {showNewForm ? <X className="w-4 h-4 shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
          {showNewForm ? 'Fechar' : 'Nova Microárea'}
        </button>
      </div>

      {/* Formulário inline opcional de Nova Microárea */}
      {showNewForm && (
        <form
          onSubmit={handleCreateAreaSubmit}
          className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
        >
          <p className="text-sm font-semibold text-slate-900">
            Cadastrar Microárea vinculada ao GPS
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label htmlFor="area-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nome do local
              </label>
              <input
                id="area-name"
                type="text"
                required
                placeholder="Ex: Canteiro 1 - Repolho"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="area-crop" className="block text-xs font-medium text-slate-700 mb-1">
                Hortaliça
              </label>
              <input
                id="area-crop"
                type="text"
                required
                placeholder="Ex: Repolho, Alface, Couve"
                value={newCrop}
                onChange={(e) => setNewCrop(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="area-sector" className="block text-xs font-medium text-slate-700 mb-1">
                Setor / Ambiente
              </label>
              <select
                id="area-sector"
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="Canteiro Aberto">Canteiro Aberto</option>
                <option value="Estufa Protegida">Estufa Protegida</option>
                <option value="Várzea Baixa">Várzea Baixa</option>
                <option value="Área Alta">Área Alta</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-slate-600 font-mono tabular-nums">
              GPS: {activeCoords.latitude.toFixed(4)}, {activeCoords.longitude.toFixed(4)}
            </span>
            <button
              type="submit"
              disabled={creatingArea}
              className="min-h-[44px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
              {creatingArea ? 'Salvando...' : 'Salvar Microárea'}
            </button>
          </div>
        </form>
      )}

      {/* Seletor da Microárea + GPS */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
        <div className="sm:col-span-7">
          <label
            htmlFor="microarea-select"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Microárea monitorada
          </label>
          {isAuthenticated && microareas.length === 0 ? (
            <button
              type="button"
              onClick={handleSeedClick}
              disabled={seeding}
              className="w-full min-h-[46px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <Sprout className="w-4 h-4 shrink-0" />
              {seeding ? 'Criando canteiros...' : 'Carregar 4 canteiros modelo (Mogi)'}
            </button>
          ) : (
            <select
              id="microarea-select"
              value={selectedMicroarea?.id || ''}
              onChange={(e) => onSelectMicroarea(e.target.value)}
              disabled={microareas.length === 0}
              className="w-full min-h-[46px] px-3.5 py-2 text-base font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60"
            >
              {microareas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.sector})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="sm:col-span-5">
          <button
            type="button"
            onClick={() => onCaptureGps()}
            disabled={gpsLoading}
            className="w-full min-h-[46px] px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between gap-2 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 whitespace-nowrap">
              <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
              {gpsLoading ? 'Localizando...' : 'GPS Campo'}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600 truncate">
              {activeCoords.latitude.toFixed(4)}, {activeCoords.longitude.toFixed(4)}
            </span>
          </button>
        </div>
      </div>

      {/* Wizard Guiado por Voz (4 Etapas + Revisão Final) */}
      <div className="p-3.5 sm:p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-4">
        {/* Barra de Progresso e Navegação entre Etapas */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-900">
              {step === 'review'
                ? 'Revisão Final · Pronto para Enviar'
                : `Passo ${step} de 4 · ${STEP_META[step].shortTitle}`}
            </span>
            <button
              type="button"
              onClick={resetWizard}
              className="text-xs font-medium text-slate-600 hover:text-emerald-800 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Recomeçar
            </button>
          </div>

          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full bg-emerald-100 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-emerald-700 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-0.5">
            {([1, 2, 3, 4] as const).map((idx) => {
              const isCurrent = step === idx;
              const isDone =
                (idx === 1 && effectiveProblem.trim().length >= 2) ||
                (idx === 2 && effectiveCount.trim().length >= 2) ||
                (idx === 3 && effectiveTreatment.trim().length >= 2) ||
                (idx === 4 && treatmentEfficiency !== null);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => goToStep(idx)}
                  className={`min-h-[34px] px-1.5 py-1 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors border ${
                    isCurrent
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : isDone
                        ? 'bg-white text-emerald-900 border-emerald-300'
                        : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white'
                  }`}
                >
                  {isDone && !isCurrent && <Check className="w-3 h-3 text-emerald-700 shrink-0" />}
                  <span className="truncate">
                    {idx}. {STEP_META[idx].shortTitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo Dinâmico da Etapa Ativa (1 a 4) */}
        {step !== 'review' ? (
          <div className="bg-white border border-emerald-200/80 rounded-2xl p-3.5 sm:p-4 space-y-3.5">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Etapa {step} de 4
              </p>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {STEP_META[step].question}
              </h3>
              <p className="text-xs text-slate-500">{STEP_META[step].voiceExample}</p>
            </div>

            {/* Botão Grande de Microfone para a Etapa Atual */}
            <button
              type="button"
              onClick={() => handleToggleVoice(step)}
              className={`w-full py-4 sm:py-5 px-4 rounded-2xl text-base sm:text-lg font-bold shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
                isRecording
                  ? 'bg-red-700 hover:bg-red-800 text-white'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white'
              }`}
            >
              {isRecording ? (
                <Square className="w-6 h-6 fill-current shrink-0" />
              ) : (
                <Mic className="w-6 h-6 shrink-0" />
              )}
              <span>
                {isRecording
                  ? `Ouvindo Etapa ${step}... Toque para parar`
                  : `Gravar Resposta (Etapa ${step})`}
              </span>
            </button>

            {/* Campo da Etapa 1: Praga ou Doença */}
            {step === 1 && (
              <div className="space-y-2">
                <label htmlFor="wizard-step-1" className="block text-xs font-semibold text-slate-700">
                  Praga ou doença identificada
                </label>
                <textarea
                  id="wizard-step-1"
                  rows={2}
                  maxLength={160}
                  value={effectiveProblem}
                  onChange={(e) => {
                    if (!isRecording) setPestProblem(e.target.value);
                  }}
                  placeholder={STEP_META[1].placeholder}
                  className="w-full p-3 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
              </div>
            )}

            {/* Campo da Etapa 2: Contagem / Intensidade */}
            {step === 2 && (
              <div className="space-y-2">
                <label htmlFor="wizard-step-2" className="block text-xs font-semibold text-slate-700">
                  Contagem ou intensidade observada
                </label>
                <input
                  id="wizard-step-2"
                  type="text"
                  maxLength={120}
                  value={effectiveCount}
                  onChange={(e) => {
                    if (!isRecording) setPestCount(e.target.value);
                  }}
                  placeholder={STEP_META[2].placeholder}
                  className="w-full min-h-[46px] px-3 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Baixa (1 a 3 focos)',
                    'Média (4 a 10 focos)',
                    'Alta (+10 focos / infestação)',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPestCount(preset)}
                      className="min-h-[34px] px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 border border-slate-200 rounded-lg transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Campo da Etapa 3: Combate Atual */}
            {step === 3 && (
              <div className="space-y-2">
                <label htmlFor="wizard-step-3" className="block text-xs font-semibold text-slate-700">
                  Como está sendo combatida atualmente
                </label>
                <input
                  id="wizard-step-3"
                  type="text"
                  maxLength={200}
                  value={effectiveTreatment}
                  onChange={(e) => {
                    if (!isRecording) setCurrentTreatment(e.target.value);
                  }}
                  placeholder={STEP_META[3].placeholder}
                  className="w-full min-h-[46px] px-3 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Nenhum combate aplicado ainda',
                    'Óleo de Neem',
                    'Calda Bordalesa',
                    'Bacillus thuringiensis (Bt)',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCurrentTreatment(preset)}
                      className="min-h-[34px] px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 border border-slate-200 rounded-lg transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Campo da Etapa 4: Eficiência do Combate */}
            {step === 4 && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      {
                        key: 'eficiente',
                        label: 'Eficiente',
                        desc: 'Controlando bem',
                        activeClasses: 'bg-emerald-50 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600',
                      },
                      {
                        key: 'parcial',
                        label: 'Parcial',
                        desc: 'Reduziu pouco',
                        activeClasses: 'bg-amber-50 border-amber-500 text-amber-950 ring-1 ring-amber-500',
                      },
                      {
                        key: 'ineficiente',
                        label: 'Ineficiente',
                        desc: 'Sem resultado',
                        activeClasses: 'bg-red-50 border-red-600 text-red-950 ring-1 ring-red-600',
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = treatmentEfficiency === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setTreatmentEfficiency(opt.key)}
                        className={`min-h-[54px] p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                          selected
                            ? opt.activeClasses
                            : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-white'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-3 h-3 rounded-full shrink-0 ${efficiencyDotClass(opt.key)}`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold leading-tight">{opt.label}</p>
                          <p className="text-[11px] opacity-80">{opt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {effectiveEfficiencyNote && (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    Fala detectada: &ldquo;{effectiveEfficiencyNote}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Botões de Navegação da Etapa */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => goToStep((step - 1) as 1 | 2 | 3)}
                  className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                  Voltar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAiAnalyze(effectiveProblem, 'fromStep1')}
                  disabled={aiAnalyzing || effectiveProblem.trim().length < 3}
                  className="min-h-[44px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 shrink-0 text-emerald-700" />
                  <span>
                    {aiAnalyzing ? 'Analisando relato...' : 'Preencher etapas com IA'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNextFromStep(step)}
                className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors sm:ml-auto"
              >
                <span>{step === 4 ? 'Revisar Relato' : 'Próximo Passo'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        ) : (
          /* Etapa Final: Revisão e Envio em um Relato Consolidado */
          <div className="bg-white border border-emerald-300 rounded-2xl p-3.5 sm:p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  Revisão do Relato Consolidado
                </h3>
              </div>
              <span className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${sevUi.boxClasses}`}>
                Severidade Automática: {sevUi.label}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="wizard-solution"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Solução / Ação Recomendada (editável)
                </label>
                <button
                  type="button"
                  onClick={() => handleAiAnalyze(consolidatedTranscript, 'fromReview')}
                  disabled={aiAnalyzing}
                  className="min-h-[36px] px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                  <span>{aiAnalyzing ? 'Refinando...' : 'Refinar com IA'}</span>
                </button>
              </div>
              <textarea
                id="wizard-solution"
                rows={2}
                maxLength={240}
                value={recommendedSolution}
                onChange={(e) => {
                  manualSolutionEditedRef.current = true;
                  setRecommendedSolution(e.target.value);
                }}
                className="w-full p-3 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => goToStep(4)}
                className="min-h-[46px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                Voltar e Editar
              </button>

              <button
                type="button"
                onClick={handleSendToCloud}
                disabled={saving}
                className="flex-1 min-h-[48px] px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm sm:text-base font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>{saving ? 'Enviando para a nuvem...' : 'Enviar Relato para a Nuvem'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Card de Pré-visualização em Tempo Real */}
        <div className="bg-white/95 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-800">
              Pré-visualização em tempo real
            </p>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {getCategoryLabel(wizardClassification.category)}
            </span>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
              <dt className="text-[11px] font-semibold text-slate-500">Microárea</dt>
              <dd className="text-slate-900 font-semibold truncate mt-0.5">
                {selectedMicroarea?.name || 'Selecione acima'}
              </dd>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
              <dt className="text-[11px] font-semibold text-slate-500">1. Praga / Doença</dt>
              <dd className="text-slate-900 font-medium break-words mt-0.5">
                {effectiveProblem.trim() || <span className="text-slate-400">Etapa 1...</span>}
              </dd>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
              <dt className="text-[11px] font-semibold text-slate-500">2. Contagem</dt>
              <dd className="text-slate-900 font-medium break-words mt-0.5">
                {effectiveCount.trim() || <span className="text-slate-400">Etapa 2...</span>}
              </dd>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
              <dt className="text-[11px] font-semibold text-slate-500">3. Combate Atual</dt>
              <dd className="text-slate-900 font-medium break-words mt-0.5">
                {effectiveTreatment.trim() || <span className="text-slate-400">Etapa 3...</span>}
              </dd>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
              <dt className="text-[11px] font-semibold text-slate-500">4. Eficiência</dt>
              <dd className="text-slate-900 font-semibold mt-0.5 flex items-center gap-1.5">
                {treatmentEfficiency ? (
                  <>
                    <span
                      aria-hidden="true"
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${efficiencyDotClass(treatmentEfficiency)}`}
                    />
                    <span>{getEfficiencyLabel(treatmentEfficiency)}</span>
                  </>
                ) : (
                  <span className="text-slate-400 font-normal">Etapa 4...</span>
                )}
              </dd>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
              <dt className="text-[11px] font-semibold text-slate-500">Severidade Auto</dt>
              <dd className={`font-bold mt-0.5 ${sevUi.textColor}`}>{sevUi.label}</dd>
            </div>
          </dl>
        </div>

        {speechError && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900">
            {speechError}
          </div>
        )}

        {aiFeedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{aiFeedback}</span>
          </div>
        )}

        {saveFeedback && (
          <div className="p-3 rounded-xl bg-emerald-100/70 border border-emerald-300 text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{saveFeedback}</span>
          </div>
        )}
      </div>
    </section>
  );
}
