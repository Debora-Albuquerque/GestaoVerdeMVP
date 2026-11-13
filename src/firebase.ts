import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  ClassificationResult,
  FieldReport,
  Microarea,
  MicroareaStatus,
  ProducerProfile,
  Severity,
  TreatmentEfficiency,
} from './types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path: path?.split('/')[0] ?? null,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Verifique sua configuração do Firebase: cliente offline.');
      return false;
    }
    return true;
  }
}

export function mapAuthErrorToPortuguese(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/invalid-email':
      return 'O e-mail informado não tem um formato válido.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta cadastrada com este e-mail. Use o botão Entrar.';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.';
    case 'auth/popup-closed-by-user':
      return 'O acesso com Google foi cancelado antes de concluir.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups ou entre com e-mail e senha.';
    case 'auth/operation-not-allowed':
      return 'O login com E-mail e Senha precisa estar ativado no Firebase Console (Authentication → Sign-in method).';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet para autenticar. Verifique seu sinal.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Não foi possível concluir a autenticação.';
  }
}

export async function signInProducerWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureProducerProfile(result.user);
  return result.user;
}

export async function signInProducerWithEmail(
  email: string,
  password: string
): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureProducerProfile(result.user);
  return result.user;
}

export async function registerProducerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanName = sanitizeText(displayName || '', 100);
  if (cleanName) {
    try {
      await updateProfile(result.user, { displayName: cleanName });
    } catch {
      // ignora erro não-crítico ao atualizar displayName
    }
  }
  await ensureProducerProfile(result.user, cleanName);
  return result.user;
}

export async function signOutProducer(): Promise<void> {
  await signOut(auth);
}

function sanitizeText(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function clampCoord(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value.toFixed(6))));
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  return Date.now();
}

export async function ensureProducerProfile(
  user: User,
  preferredName?: string
): Promise<ProducerProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const derivedName =
    sanitizeText(preferredName || '', 100) ||
    sanitizeText(user.displayName || '', 100) ||
    sanitizeText(user.email?.split('@')[0] || '', 100) ||
    'Produtor Rural';

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid),
        displayName: String(data.displayName || derivedName),
        farmName: String(data.farmName || 'Sítio Alto Tietê'),
        region: String(data.region || 'Mogi das Cruzes - SP'),
      };
    }

    const profile: ProducerProfile = {
      uid: user.uid,
      displayName: derivedName,
      farmName: 'Sítio Cinturão Verde',
      region: 'Mogi das Cruzes - SP',
    };

    await setDoc(ref, {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeMicroareas(
  ownerId: string,
  onData: (items: Microarea[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'microareas';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Microarea[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId),
            name: String(data.name),
            crop: String(data.crop),
            sector: String(data.sector),
            status: (data.status as MicroareaStatus) || 'saudavel',
            latitude: Number(data.latitude ?? -23.5228),
            longitude: Number(data.longitude ?? -46.1883),
            lastReportSummary: String(data.lastReportSummary || ''),
            lastSeverity: (data.lastSeverity as Microarea['lastSeverity']) || 'nenhuma',
            createdAtMs: timestampToMs(data.createdAt),
            updatedAtMs: timestampToMs(data.updatedAt),
          };
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export function subscribeFieldReports(
  ownerId: string,
  onData: (items: FieldReport[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'reports';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FieldReport[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId),
            microareaId: String(data.microareaId),
            microareaName: String(data.microareaName),
            crop: String(data.crop),
            transcript: String(data.transcript),
            pestProblem: String(data.pestProblem || 'Não informado'),
            pestCount: String(data.pestCount || 'Não informada'),
            currentTreatment: String(data.currentTreatment || 'Nenhum tratamento informado'),
            treatmentEfficiency:
              (data.treatmentEfficiency as TreatmentEfficiency) || 'parcial',
            recommendedSolution: String(data.recommendedSolution || 'Monitoramento contínuo'),
            severity: (data.severity as Severity) || 'baixa',
            category: (data.category as FieldReport['category']) || 'geral',
            detectedKeywords: Array.isArray(data.detectedKeywords)
              ? data.detectedKeywords.map((item) => String(item))
              : [],
            latitude: Number(data.latitude ?? -23.5228),
            longitude: Number(data.longitude ?? -46.1883),
            resolved: Boolean(data.resolved),
            seasonMonth: String(data.seasonMonth || ''),
            createdAtMs: timestampToMs(data.createdAt),
            updatedAtMs: timestampToMs(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function createMicroarea(input: {
  ownerId: string;
  name: string;
  crop: string;
  sector: string;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const colRef = collection(db, 'microareas');
  const newRef = doc(colRef);
  const path = `microareas/${newRef.id}`;

  const cleanName = sanitizeText(input.name, 80);
  const cleanCrop = sanitizeText(input.crop, 50);
  const cleanSector = sanitizeText(input.sector, 40);

  if (cleanName.length < 2 || cleanCrop.length < 2 || cleanSector.length < 2) {
    throw new Error('Preencha nome da microárea, cultura e setor (mínimo 2 caracteres).');
  }

  try {
    await setDoc(newRef, {
      ownerId: input.ownerId,
      name: cleanName,
      crop: cleanCrop,
      sector: cleanSector,
      status: 'saudavel',
      latitude: clampCoord(input.latitude, -90, 90, -23.5228),
      longitude: clampCoord(input.longitude, -180, 180, -46.1883),
      lastReportSummary: 'Microárea cadastrada e pronta para monitoramento.',
      lastSeverity: 'nenhuma',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function seedStarterMicroareas(ownerId: string): Promise<void> {
  const starters = [
    {
      name: 'Canteiro 1 - Repolho',
      crop: 'Repolho',
      sector: 'Várzea Baixa',
      status: 'critico' as MicroareaStatus,
      lastSeverity: 'urgente' as const,
      lastReportSummary:
        'Ataque forte de lagarta nas folhas basais, perfurações visíveis e umidade alta acumulada.',
      latitude: -23.5219,
      longitude: -46.1872,
      initialReport: {
        transcript:
          'Praga: Lagarta-das-crucíferas | Contagem: +15 lagartas por metro (alta) | Combate: Óleo de Neem preventivo | Eficiência: Ineficiente',
        pestProblem: 'Lagarta-das-crucíferas e perfurações foliares',
        pestCount: 'Mais de 15 lagartas por metro (intensidade alta)',
        currentTreatment: 'Óleo de Neem preventivo (aplicado há 7 dias)',
        treatmentEfficiency: 'ineficiente' as TreatmentEfficiency,
        recommendedSolution: 'Aplicar Bacillus thuringiensis (Bt) no fim da tarde e revisar bordadura',
        severity: 'urgente' as Severity,
        category: 'praga' as const,
        keywords: ['lagarta', 'umidade'],
      },
    },
    {
      name: 'Estufa B - Alface Crespa',
      crop: 'Alface Crespa',
      sector: 'Setor Norte',
      status: 'atencao' as MicroareaStatus,
      lastSeverity: 'media' as const,
      lastReportSummary:
        'Início de pontas amarelas nas folhas, provável excesso de irrigação ou variação térmica.',
      latitude: -23.5225,
      longitude: -46.1881,
      initialReport: {
        transcript:
          'Praga/Problema: Queima de borda | Contagem: Focos isolados em 2 bancadas (média) | Combate: Ajuste de irrigação | Eficiência: Parcial',
        pestProblem: 'Queima de borda / estresse hídrico',
        pestCount: 'Focos isolados em 2 bancadas (intensidade média)',
        currentTreatment: 'Irrigação por gotejamento 2x ao dia',
        treatmentEfficiency: 'parcial' as TreatmentEfficiency,
        recommendedSolution: 'Reduzir turno de rega vespertina e ajustar adubação com cálcio',
        severity: 'media' as Severity,
        category: 'nutricao' as const,
        keywords: ['folha amarelada', 'irrigação'],
      },
    },
    {
      name: 'Talhão 3 - Couve Manteiga',
      crop: 'Couve Manteiga',
      sector: 'Área Alta',
      status: 'saudavel' as MicroareaStatus,
      lastSeverity: 'baixa' as const,
      lastReportSummary: 'Talhão saudável, folhas firmes e sem presença de pragas.',
      latitude: -23.5234,
      longitude: -46.189,
      initialReport: null,
    },
    {
      name: 'Estufa A - Tomate Cereja',
      crop: 'Tomate Cereja',
      sector: 'Setor Sul',
      status: 'critico' as MicroareaStatus,
      lastSeverity: 'urgente' as const,
      lastReportSummary:
        'Manchas escuras nas folhas inferiores com previsão de chuva de 100%, alto risco de fungo.',
      latitude: -23.5241,
      longitude: -46.1864,
      initialReport: {
        transcript:
          'Doença: Pinta-preta / Alternária | Contagem: +20 plantas afetadas (alta) | Combate: Calda bordalesa | Eficiência: Ineficiente',
        pestProblem: 'Pinta-preta / Alternária foliar',
        pestCount: 'Mais de 20 plantas com folhas baixeiras manchadas',
        currentTreatment: 'Calda bordalesa aplicada há 10 dias',
        treatmentEfficiency: 'ineficiente' as TreatmentEfficiency,
        recommendedSolution: 'Retirar folhas baixeiras afetadas, ventilar estufa e aplicar fungicida cúprico',
        severity: 'urgente' as Severity,
        category: 'doenca' as const,
        keywords: ['mancha escura', 'fungo'],
      },
    },
  ];

  const batchAreas = writeBatch(db);
  const createdRefs: { id: string; item: (typeof starters)[number] }[] = [];

  for (const item of starters) {
    const newRef = doc(collection(db, 'microareas'));
    createdRefs.push({ id: newRef.id, item });
    batchAreas.set(newRef, {
      ownerId,
      name: item.name,
      crop: item.crop,
      sector: item.sector,
      status: item.status,
      latitude: item.latitude,
      longitude: item.longitude,
      lastReportSummary: item.lastReportSummary,
      lastSeverity: item.lastSeverity,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batchAreas.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'microareas');
  }

  const now = new Date();
  const seasonMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const batchReports = writeBatch(db);

  for (const entry of createdRefs) {
    if (!entry.item.initialReport) continue;
    const reportRef = doc(collection(db, 'reports'));
    batchReports.set(reportRef, {
      ownerId,
      microareaId: entry.id,
      microareaName: entry.item.name,
      crop: entry.item.crop,
      transcript: entry.item.initialReport.transcript,
      pestProblem: entry.item.initialReport.pestProblem,
      pestCount: entry.item.initialReport.pestCount,
      currentTreatment: entry.item.initialReport.currentTreatment,
      treatmentEfficiency: entry.item.initialReport.treatmentEfficiency,
      recommendedSolution: entry.item.initialReport.recommendedSolution,
      severity: entry.item.initialReport.severity,
      category: entry.item.initialReport.category,
      detectedKeywords: entry.item.initialReport.keywords,
      latitude: entry.item.latitude,
      longitude: entry.item.longitude,
      resolved: false,
      seasonMonth,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batchReports.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'reports');
  }
}

function severityToStatus(severity: Severity): MicroareaStatus {
  if (severity === 'urgente') return 'critico';
  if (severity === 'media') return 'atencao';
  return 'saudavel';
}

export async function saveFieldReportAndSyncMicroarea(input: {
  ownerId: string;
  microarea: Microarea;
  transcript: string;
  pestProblem: string;
  pestCount: string;
  currentTreatment: string;
  treatmentEfficiency: TreatmentEfficiency;
  recommendedSolution: string;
  classification: ClassificationResult;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const cleanTranscript = sanitizeText(input.transcript, 1000);
  const cleanProblem = sanitizeText(input.pestProblem, 160);
  const cleanCount = sanitizeText(input.pestCount, 120);
  const cleanTreatment = sanitizeText(input.currentTreatment, 200);
  const cleanSolution = sanitizeText(input.recommendedSolution, 240);

  if (cleanTranscript.length < 3) {
    throw new Error('O relato precisa ter pelo menos 3 caracteres.');
  }
  if (
    cleanProblem.length < 2 ||
    cleanCount.length < 2 ||
    cleanTreatment.length < 2 ||
    cleanSolution.length < 2
  ) {
    throw new Error('Preencha Praga, Contagem/Intensidade, Combate Atual e Solução.');
  }

  const now = new Date();
  const seasonMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const keywords = input.classification.detectedKeywords
    .map((kw) => sanitizeText(kw, 40))
    .filter((kw) => kw.length > 0)
    .slice(0, 10);

  const reportRef = doc(collection(db, 'reports'));
  const microareaRef = doc(db, 'microareas', input.microarea.id);

  const batch = writeBatch(db);
  batch.set(reportRef, {
    ownerId: input.ownerId,
    microareaId: input.microarea.id,
    microareaName: sanitizeText(input.microarea.name, 80),
    crop: sanitizeText(input.microarea.crop, 50),
    transcript: cleanTranscript,
    pestProblem: cleanProblem,
    pestCount: cleanCount,
    currentTreatment: cleanTreatment,
    treatmentEfficiency: input.treatmentEfficiency,
    recommendedSolution: cleanSolution,
    severity: input.classification.severity,
    category: input.classification.category,
    detectedKeywords: keywords,
    latitude: clampCoord(input.latitude, -90, 90, input.microarea.latitude),
    longitude: clampCoord(input.longitude, -180, 180, input.microarea.longitude),
    resolved: false,
    seasonMonth,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(microareaRef, {
    status: severityToStatus(input.classification.severity),
    lastReportSummary: sanitizeText(`${cleanProblem} (${cleanCount}) — ${cleanSolution}`, 240),
    lastSeverity: input.classification.severity,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return reportRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reports/${reportRef.id}`);
  }
}

export async function resolveFieldReport(
  report: FieldReport,
  remainingOpenForMicroarea: FieldReport[]
): Promise<void> {
  const reportRef = doc(db, 'reports', report.id);
  const microareaRef = doc(db, 'microareas', report.microareaId);

  const highestRemaining = remainingOpenForMicroarea.reduce<Severity | null>((acc, item) => {
    if (item.severity === 'urgente') return 'urgente';
    if (item.severity === 'media' && acc !== 'urgente') return 'media';
    if (!acc) return item.severity;
    return acc;
  }, null);

  const nextStatus: MicroareaStatus = highestRemaining
    ? severityToStatus(highestRemaining)
    : 'saudavel';
  const nextSeverity: Microarea['lastSeverity'] = highestRemaining ?? 'nenhuma';
  const nextSummary =
    remainingOpenForMicroarea[0]?.transcript.slice(0, 240) ||
    'Ocorrência tratada e microárea estabilizada.';

  const batch = writeBatch(db);
  batch.update(reportRef, {
    resolved: true,
    updatedAt: serverTimestamp(),
  });
  batch.update(microareaRef, {
    status: nextStatus,
    lastSeverity: nextSeverity,
    lastReportSummary: nextSummary,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${report.id}`);
  }
}

export async function removeMicroarea(microareaId: string): Promise<void> {
  const path = `microareas/${microareaId}`;
  try {
    await deleteDoc(doc(db, 'microareas', microareaId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
