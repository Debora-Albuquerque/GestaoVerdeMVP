import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AlertCircle,
  BarChart3,
  Eye,
  EyeOff,
  ListChecks,
  Lock,
  LogOut,
  Mail,
  Mic,
  Plus,
  Sprout,
  User as UserIcon,
} from 'lucide-react';
import {
  auth,
  createMicroarea,
  ensureProducerProfile,
  mapAuthErrorToPortuguese,
  registerProducerWithEmail,
  removeMicroarea,
  resolveFieldReport,
  saveFieldReportAndSyncMicroarea,
  seedStarterMicroareas,
  signInProducerWithEmail,
  signInProducerWithGoogle,
  signOutProducer,
  subscribeFieldReports,
  subscribeMicroareas,
  testFirestoreConnection,
} from './firebase';
import { classifyGuidedWizardReport, MOGI_COORDS } from './utils/agronomy';
import type { FieldReport, Microarea, MicroareaStatus, TreatmentEfficiency } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WeatherSection } from './components/WeatherSection';
import { FieldVoiceSection } from './components/FieldVoiceSection';
import {
  MicroareasPanel,
  PriorityKpiGrid,
  PriorityQueuePanel,
} from './components/PriorityDashboard';
import { SeasonalityReport } from './components/SeasonalityReport';

type WorkspaceTab = 'prioridades' | 'microareas' | 'sazonalidade';

function GoogleMark() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFFFFF"
        d="M21.8 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.05-4.4 3.05-7.48z"
      />
      <path
        fill="#FFFFFF"
        fillOpacity="0.9"
        d="M12 22c2.75 0 5.06-.91 6.75-2.47l-3.3-2.56c-.91.61-2.08.98-3.45.98-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64A10 10 0 0 0 12 22z"
      />
      <path
        fill="#FFFFFF"
        fillOpacity="0.82"
        d="M6.3 13.75A6.01 6.01 0 0 1 6 12c0-.61.11-1.2.3-1.75V7.61H2.89A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.39l3.23-2.64z"
      />
      <path
        fill="#FFFFFF"
        d="M12 6.05c1.5 0 2.84.51 3.9 1.53l2.92-2.92C17.05 3.01 14.74 2 12 2A10 10 0 0 0 2.89 7.61l3.41 2.64c.8-2.41 3.05-4.2 5.7-4.2z"
      />
    </svg>
  );
}

function GestaoVerdeContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [microareas, setMicroareas] = useState<Microarea[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [autoSeeding, setAutoSeeding] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [selectedMicroareaId, setSelectedMicroareaId] = useState<string>('');
  const [activeCoords, setActiveCoords] = useState(MOGI_COORDS);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [showNewAreaForm, setShowNewAreaForm] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('prioridades');
  const [areaStatusFilter, setAreaStatusFilter] = useState<'todas' | MicroareaStatus>('todas');

  const autoSeededUidsRef = useRef<Set<string>>(new Set());
  const seedingLockRef = useRef(false);

  const openReportsCount = useMemo(
    () => reports.filter((r) => !r.resolved).length,
    [reports]
  );

  // Testar conexão Firestore no boot e ouvir estado de autenticação
  useEffect(() => {
    testFirestoreConnection();

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAvatarFailed(false);
      setAuthReady(true);

      if (nextUser) {
        try {
          await ensureProducerProfile(nextUser);
        } catch (err) {
          console.error('Erro ao verificar perfil:', err);
        }
      } else {
        setMicroareas([]);
        setReports([]);
        setSelectedMicroareaId('');
        setLoadingData(false);
        setAutoSeeding(false);
        setDataError(null);
      }
    });

    return () => unsub();
  }, []);

  // Ouvir microáreas e relatos em tempo real quando autenticado + auto-seed em conta vazia
  useEffect(() => {
    if (!authReady || !user) return;

    setLoadingData(true);
    setDataError(null);

    let microLoaded = false;
    let reportsLoaded = false;

    const markLoaded = () => {
      if (microLoaded && reportsLoaded) setLoadingData(false);
    };

    const unsubMicro = subscribeMicroareas(
      user.uid,
      (items) => {
        setMicroareas(items);
        setSelectedMicroareaId((prev) => {
          if (prev && items.some((m) => m.id === prev)) return prev;
          return items[0]?.id || '';
        });
        microLoaded = true;
        markLoaded();

        // Carregar automaticamente os dados iniciais de demonstração caso a conta seja nova e vazia
        if (
          items.length === 0 &&
          !autoSeededUidsRef.current.has(user.uid) &&
          !seedingLockRef.current
        ) {
          seedingLockRef.current = true;
          autoSeededUidsRef.current.add(user.uid);
          setAutoSeeding(true);
          seedStarterMicroareas(user.uid)
            .catch((err) => {
              setDataError(
                err instanceof Error
                  ? err.message
                  : 'Não foi possível preparar os canteiros iniciais.'
              );
            })
            .finally(() => {
              seedingLockRef.current = false;
              setAutoSeeding(false);
            });
        }
      },
      (err) => {
        setDataError(err.message);
        setLoadingData(false);
      }
    );

    const unsubReports = subscribeFieldReports(
      user.uid,
      (items) => {
        setReports(items);
        reportsLoaded = true;
        markLoaded();
      },
      (err) => {
        setDataError(err.message);
        setLoadingData(false);
      }
    );

    return () => {
      unsubMicro();
      unsubReports();
    };
  }, [authReady, user]);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInProducerWithGoogle();
    } catch (err) {
      setAuthError(mapAuthErrorToPortuguese(err));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleEmailAuthSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setAuthError(null);

      const cleanEmail = authEmail.trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setAuthError('Informe um e-mail válido para continuar.');
        return;
      }

      if (!authPassword) {
        setAuthError('Digite sua senha para continuar.');
        return;
      }

      if (authMode === 'register' && authPassword.length < 6) {
        setAuthError('A senha deve ter pelo menos 6 caracteres para criar a conta.');
        return;
      }

      setAuthBusy(true);
      try {
        if (authMode === 'register') {
          await registerProducerWithEmail(cleanEmail, authPassword, authName);
        } else {
          await signInProducerWithEmail(cleanEmail, authPassword);
        }
        setAuthPassword('');
      } catch (err) {
        setAuthError(mapAuthErrorToPortuguese(err));
      } finally {
        setAuthBusy(false);
      }
    },
    [authEmail, authPassword, authMode, authName]
  );

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    await signOutProducer();
  }, []);

  const handleCaptureGps = useCallback(async (): Promise<{
    latitude: number;
    longitude: number;
  } | null> => {
    if (!navigator.geolocation) {
      return null;
    }

    setGpsLoading(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
          };
          setActiveCoords({
            ...coords,
            label: 'GPS Atual da Propriedade',
          });
          setGpsLoading(false);
          resolve(coords);
        },
        () => {
          setGpsLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }, []);

  const handleSaveReport = useCallback(
    async (payload: {
      microarea: Microarea;
      transcript: string;
      pestProblem: string;
      pestCount: string;
      currentTreatment: string;
      treatmentEfficiency: TreatmentEfficiency;
      recommendedSolution: string;
      latitude: number;
      longitude: number;
    }) => {
      if (!user) {
        throw new Error('Faça login para salvar seu relato na nuvem.');
      }

      const classification = classifyGuidedWizardReport({
        pestProblem: payload.pestProblem,
        pestCount: payload.pestCount,
        currentTreatment: payload.currentTreatment,
        treatmentEfficiency: payload.treatmentEfficiency,
      });

      await saveFieldReportAndSyncMicroarea({
        ownerId: user.uid,
        microarea: payload.microarea,
        transcript: payload.transcript,
        pestProblem: payload.pestProblem,
        pestCount: payload.pestCount,
        currentTreatment: payload.currentTreatment,
        treatmentEfficiency: payload.treatmentEfficiency,
        recommendedSolution: payload.recommendedSolution,
        classification,
        latitude: payload.latitude,
        longitude: payload.longitude,
      });
    },
    [user]
  );

  const handleCreateMicroarea = useCallback(
    async (payload: {
      name: string;
      crop: string;
      sector: string;
      latitude: number;
      longitude: number;
    }) => {
      if (!user) {
        throw new Error('Faça login com Google para cadastrar microáreas.');
      }
      return createMicroarea({
        ownerId: user.uid,
        ...payload,
      });
    },
    [user]
  );

  const handleSeedStarters = useCallback(async () => {
    if (user) {
      await seedStarterMicroareas(user.uid);
    }
  }, [user]);

  const handleResolveReport = useCallback(
    async (report: FieldReport) => {
      if (!user) return;
      const remaining = reports.filter(
        (r) =>
          !r.resolved &&
          r.id !== report.id &&
          r.microareaId === report.microareaId
      );
      await resolveFieldReport(report, remaining);
    },
    [user, reports]
  );

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelectMicroareaAndScroll = useCallback((microareaId: string) => {
    setSelectedMicroareaId(microareaId);
    scrollToElement('campo');
  }, []);

  const handleKpiFilterClick = useCallback((status: 'todas' | MicroareaStatus) => {
    setAreaStatusFilter(status);
    setActiveTab('microareas');
    scrollToElement('painel-abas');
  }, []);

  void removeMicroarea;

  // Estado inicial enquanto o Firebase Auth verifica a sessão
  if (!authReady) {
    return (
      <div className="min-h-dvh w-full bg-[#F4F8F5] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-sm">
            <Sprout className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-emerald-950">Gestão Verde</p>
          <p className="text-xs text-slate-600">Verificando sessão segura...</p>
        </div>
      </div>
    );
  }

  // 1. Tela de Login Inicial Dedicada (Auth Gate) — Autenticação Dupla (Google + E-mail/Senha)
  if (!user) {
    return (
      <div className="min-h-dvh w-full overflow-x-hidden bg-[#F4F8F5] text-slate-900 flex flex-col items-center justify-center px-3 sm:px-6 py-6 sm:py-8">
        <main className="w-full max-w-md bg-white border border-emerald-900/15 rounded-3xl shadow-sm p-5 sm:p-7 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Sprout className="w-6 h-6" />
            </div>

            <div className="space-y-0.5">
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-emerald-950">
                Gestão Verde
              </h1>
              <p className="text-xs font-medium text-emerald-800">
                Monitoramento Agrícola · Alto Tietê e Mogi das Cruzes
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Acesse sua propriedade para acompanhar o clima, gravar relatos por voz no campo e gerenciar prioridades diárias na nuvem.
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Opção 1 (Social): Entrar com Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authBusy}
            className="w-full min-h-[48px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white text-sm sm:text-base font-semibold rounded-2xl shadow-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-60"
          >
            <GoogleMark />
            <span>{authBusy ? 'Conectando...' : 'Entrar com Google'}</span>
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="shrink mx-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              ou com e-mail e senha
            </span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          {/* Opção 2 (Credenciais): E-mail e Senha */}
          <form onSubmit={handleEmailAuthSubmit} noValidate className="space-y-3">
            {authMode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do produtor (opcional)
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Ex: João da Silva"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="produtor@sitio.com.br"
                  value={authEmail}
                  onChange={(e) => {
                    setAuthEmail(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  required
                  placeholder={authMode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  className="w-full min-h-[44px] pl-10 pr-11 py-2 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full min-h-[48px] px-4 py-2.5 bg-slate-900 hover:bg-slate-950 text-white text-sm sm:text-base font-semibold rounded-2xl shadow-sm transition-colors disabled:opacity-60"
            >
              {authBusy
                ? authMode === 'register'
                  ? 'Criando conta...'
                  : 'Entrando...'
                : authMode === 'register'
                  ? 'Criar Conta Nova'
                  : 'Entrar'}
            </button>
          </form>

          <div className="text-center pt-1 space-y-2">
            <p className="text-xs sm:text-sm text-slate-600">
              {authMode === 'login' ? (
                <>
                  Ainda não tem conta?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                    }}
                    className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                  >
                    Criar Conta Nova
                  </button>
                </>
              ) : (
                <>
                  Já possui cadastro?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                    className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                  >
                    Entrar com sua conta
                  </button>
                </>
              )}
            </p>
            <p className="text-[11px] text-slate-500">
              Seus canteiros e relatos são isolados com segurança pelo seu login. Contas novas recebem 4 áreas modelo do Alto Tietê.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Produtor Rural';
  const firstName = displayName.split(' ')[0];
  const initialLetter = firstName.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#F4F8F5] text-slate-900 pb-8">
      {/* 1. Cabeçalho Fixo (Navbar Minimalista com Foto e Nome do Produtor) */}
      <header className="sticky top-0 z-30 h-14 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="w-full max-w-5xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <a
              href="#clima"
              className="text-base sm:text-lg font-bold font-display tracking-tight text-emerald-900 whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Sprout className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>Gestão Verde</span>
            </a>
            <span className="hidden sm:inline text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline text-xs font-medium text-slate-500 truncate">
              Alto Tietê
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {user.photoURL && !avatarFailed ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-8 h-8 rounded-full object-cover border border-emerald-200 shrink-0"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="w-8 h-8 rounded-full bg-emerald-700 text-white text-xs font-bold flex items-center justify-center shrink-0"
                >
                  {initialLetter}
                </span>
              )}
              <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate max-w-[110px] sm:max-w-[180px]">
                {firstName}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-red-50 hover:text-red-800 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-3.5 sm:pt-5 space-y-3.5 sm:space-y-4">
        {(authError || dataError) && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900"
          >
            {authError || dataError}
          </div>
        )}

        {autoSeeding && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-950">
            Preparando seus 4 canteiros modelo do Alto Tietê no Firebase...
          </div>
        )}

        {/* 2. Seção de Clima Compacta no Topo (Card Unificado) */}
        <WeatherSection
          activeCoords={activeCoords}
          onUseCurrentGps={handleCaptureGps}
          gpsLoading={gpsLoading}
        />

        {/* 3. Guia Rápido de Atalhos (grid-cols-2 no celular) */}
        <nav
          aria-label="Atalhos rápidos"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5"
        >
          <button
            type="button"
            onClick={() => {
              setShowNewAreaForm(false);
              scrollToElement('campo');
            }}
            className="min-h-[48px] px-3 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl shadow-sm text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>Relato por Voz</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('prioridades');
              scrollToElement('painel-abas');
            }}
            className={`min-h-[48px] px-3 py-2.5 rounded-2xl shadow-sm border text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'prioridades'
                ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>Prioridades ({openReportsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('sazonalidade');
              scrollToElement('painel-abas');
            }}
            className={`min-h-[48px] px-3 py-2.5 rounded-2xl shadow-sm border text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'sazonalidade'
                ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>Relatórios</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowNewAreaForm(true);
              scrollToElement('campo');
            }}
            className="min-h-[48px] px-3 py-2.5 bg-white hover:bg-emerald-50 border border-slate-200/80 rounded-2xl shadow-sm text-sm font-semibold text-emerald-900 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>Nova Microárea</span>
          </button>
        </nav>

        {/* 4. Módulo de Campo Destacado (O Coração do App) */}
        <FieldVoiceSection
          isAuthenticated={Boolean(user)}
          microareas={microareas}
          selectedMicroareaId={selectedMicroareaId}
          onSelectMicroarea={setSelectedMicroareaId}
          activeCoords={activeCoords}
          onCaptureGps={handleCaptureGps}
          gpsLoading={gpsLoading}
          showNewForm={showNewAreaForm}
          onToggleNewForm={setShowNewAreaForm}
          onSaveReport={handleSaveReport}
          onCreateMicroarea={handleCreateMicroarea}
          onSeedStarters={handleSeedStarters}
        />

        {/* 5. Dashboard de Indicadores em Grid Compacto (4 Cards) */}
        <PriorityKpiGrid
          microareas={microareas}
          activeStatusFilter={activeTab === 'microareas' ? areaStatusFilter : 'todas'}
          onSelectStatusFilter={handleKpiFilterClick}
        />

        {/* 6. Fila de Prioridades e Abas Ocultas/Alternáveis */}
        <section
          id="painel-abas"
          aria-label="Painel de prioridades, microáreas e relatórios"
          className="scroll-mt-16 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden"
        >
          {/* Barra de Abas Limpa e Responsiva */}
          <div className="p-3.5 sm:px-5 sm:py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div role="tablist" aria-label="Visualizações do painel" className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'prioridades'}
                onClick={() => setActiveTab('prioridades')}
                className={`min-h-[42px] px-1.5 sm:px-3.5 py-1.5 text-[11px] sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  activeTab === 'prioridades'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <ListChecks className="w-4 h-4 shrink-0 hidden sm:inline" />
                <span className="truncate">Prioridades ({openReportsCount})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'microareas'}
                onClick={() => setActiveTab('microareas')}
                className={`min-h-[42px] px-1.5 sm:px-3.5 py-1.5 text-[11px] sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  activeTab === 'microareas'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <Sprout className="w-4 h-4 shrink-0 hidden sm:inline" />
                <span className="truncate">Locais ({microareas.length})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'sazonalidade'}
                onClick={() => setActiveTab('sazonalidade')}
                className={`min-h-[42px] px-1.5 sm:px-3.5 py-1.5 text-[11px] sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  activeTab === 'sazonalidade'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0 hidden sm:inline" />
                <span className="truncate">Relatórios</span>
              </button>
            </div>

            <span className="text-[11px] text-slate-500">
              Sincronizado na nuvem · UID isolado
            </span>
          </div>

          <div className="p-4 sm:p-5">
            {activeTab === 'prioridades' && (
              <PriorityQueuePanel
                loadingData={loadingData}
                reports={reports}
                onResolveReport={handleResolveReport}
              />
            )}

            {activeTab === 'microareas' && (
              <MicroareasPanel
                microareas={microareas}
                selectedMicroareaId={selectedMicroareaId}
                statusFilter={areaStatusFilter}
                onChangeFilter={setAreaStatusFilter}
                onSelectMicroareaForReport={handleSelectMicroareaAndScroll}
              />
            )}

            {activeTab === 'sazonalidade' && (
              <SeasonalityReport reports={reports} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestaoVerdeContent />
    </ErrorBoundary>
  );
}
