import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AgronomicAnalysisPayload {
  pragaDoenca: string;
  contagemPopulosional: string;
  tratamentoAtual: string;
  eficiencia: 'Eficiente' | 'Parcial' | 'Ineficiente';
  nivelAcao: 'Baixa' | 'Média' | 'Crítica/Urgente';
  recomendacaoSolucao: string;
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeEfficiency(raw: unknown): 'Eficiente' | 'Parcial' | 'Ineficiente' {
  const norm = normalizeText(String(raw || ''));
  if (norm.includes('ineficiente') || norm.includes('nao') || norm.includes('ruim')) {
    return 'Ineficiente';
  }
  if (norm.includes('eficiente') && !norm.includes('parcial')) {
    return 'Eficiente';
  }
  return 'Parcial';
}

function normalizeActionLevel(
  raw: unknown,
  eficiencia: 'Eficiente' | 'Parcial' | 'Ineficiente'
): 'Baixa' | 'Média' | 'Crítica/Urgente' {
  if (eficiencia === 'Ineficiente') return 'Crítica/Urgente';
  const norm = normalizeText(String(raw || ''));
  if (norm.includes('crit') || norm.includes('urg') || norm.includes('alt')) {
    return 'Crítica/Urgente';
  }
  if (norm.includes('medi')) return 'Média';
  return 'Baixa';
}

function buildLocalFallbackAnalysis(textoDoRelato: string): AgronomicAnalysisPayload {
  const norm = normalizeText(textoDoRelato);

  let pragaDoenca = 'Ocorrência fitossanitária em verificação';
  if (norm.includes('lagarta')) pragaDoenca = 'Ataque de lagarta nas folhas';
  else if (norm.includes('pulgao')) pragaDoenca = 'Infestação de pulgão';
  else if (norm.includes('mosca branca')) pragaDoenca = 'Infestação de mosca-branca';
  else if (norm.includes('mildio')) pragaDoenca = 'Suspeita de míldio foliar';
  else if (norm.includes('fungo') || norm.includes('mancha')) pragaDoenca = 'Manchas fúngicas foliares';
  else if (norm.includes('broca')) pragaDoenca = 'Ataque de broca';
  else if (norm.includes('amarel')) pragaDoenca = 'Amarelecimento / estresse nutricional';
  else if (textoDoRelato.trim().length > 0) {
    pragaDoenca = textoDoRelato.trim().slice(0, 120);
  }

  let contagemPopulosional = 'Intensidade moderada observada em campo';
  if (
    norm.includes('muit') ||
    norm.includes('alta') ||
    norm.includes('forte') ||
    norm.includes('infest') ||
    norm.includes('bastante')
  ) {
    contagemPopulosional = 'Alta intensidade / múltiplos focos';
  } else if (norm.includes('pouco') || norm.includes('baixa') || norm.includes('inicio')) {
    contagemPopulosional = 'Baixa intensidade / início de foco';
  }

  let tratamentoAtual = 'Nenhum combate aplicado ainda';
  if (norm.includes('neem')) tratamentoAtual = 'Óleo de Neem';
  else if (norm.includes('bordalesa')) tratamentoAtual = 'Calda Bordalesa';
  else if (norm.includes('bacillus') || /\bbt\b/.test(norm)) {
    tratamentoAtual = 'Bacillus thuringiensis (Bt)';
  } else if (norm.includes('enxofre')) tratamentoAtual = 'Enxofre agrícola';

  let eficiencia: 'Eficiente' | 'Parcial' | 'Ineficiente' = 'Parcial';
  if (
    norm.includes('ineficiente') ||
    norm.includes('nao resolveu') ||
    norm.includes('nao funcion') ||
    norm.includes('piorou') ||
    norm.includes('sem efeito')
  ) {
    eficiencia = 'Ineficiente';
  } else if (norm.includes('eficiente') || norm.includes('melhorou') || norm.includes('controlado')) {
    eficiencia = 'Eficiente';
  }

  const nivelAcao = normalizeActionLevel(
    eficiencia === 'Ineficiente' || norm.includes('urgente') ? 'Crítica/Urgente' : 'Média',
    eficiencia
  );

  let recomendacaoSolucao =
    'Monitorar canteiro nas próximas 24h e registrar evolução da área afetada.';
  if (eficiencia === 'Ineficiente') {
    recomendacaoSolucao =
      'Substituir o manejo atual imediatamente, aplicar controle específico (ex: Bt para lagartas ou cúprico para fungos) no fim da tarde e isolar foco.';
  } else if (norm.includes('lagarta')) {
    recomendacaoSolucao =
      'Pulverizar Bacillus thuringiensis (Bt) no fim da tarde visando a face inferior das folhas.';
  } else if (norm.includes('fungo') || norm.includes('mildio') || norm.includes('mancha')) {
    recomendacaoSolucao =
      'Remover folhas baixeiras muito afetadas, evitar irrigação vespertina e melhorar ventilação.';
  }

  return {
    pragaDoenca,
    contagemPopulosional,
    tratamentoAtual,
    eficiencia,
    nivelAcao,
    recomendacaoSolucao,
  };
}

function extractJsonObject(rawContent: string): Record<string, unknown> {
  const cleaned = rawContent
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as Record<string, unknown>;
    }
    throw new Error('JSON inválido retornado pelo modelo.');
  }
}

async function analyzeWithOpenRouter(
  textoDoRelato: string,
  microarea?: string
): Promise<{ analysis: AgronomicAnalysisPayload; provider: 'openrouter' | 'fallback'; warning?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_OPENROUTER_API_KEY' || apiKey === 'cole_sua_chave_aqui') {
    return {
      analysis: buildLocalFallbackAnalysis(textoDoRelato),
      provider: 'fallback',
      warning:
        'OPENROUTER_API_KEY não configurada nos Secrets; aplicada análise agronômica local.',
    };
  }

  const promptDoSistema = `
Você é um assistente agronômico especialista no cinturão verde de hortaliças de Mogi das Cruzes (Alto Tietê).
Analise o relato do produtor rural e retorne um JSON estrito com os seguintes campos:
- "pragaDoenca": Nome da praga ou doença identificada.
- "contagemPopulosional": Intensidade ou quantidade relatada.
- "tratamentoAtual": O que ele está usando para combater (ou "Nenhum combate aplicado ainda").
- "eficiencia": Avalie exatamente como "Eficiente", "Parcial" ou "Ineficiente".
- "nivelAcao": Classifique a urgência exatamente como "Baixa", "Média" ou "Crítica/Urgente". Se eficiencia for "Ineficiente", nivelAcao deve ser obrigatoriamente "Crítica/Urgente".
- "recomendacaoSolucao": O que deve ser feito para melhorar o manejo.
Retorne apenas JSON válido em português do Brasil, sem texto adicional.
`.trim();

  const userMessage = microarea
    ? `Microárea: ${microarea}\nRelato do produtor: ${textoDoRelato}`
    : textoDoRelato;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);

  const callOpenRouter = async (useResponseFormat: boolean) => {
    const payload: Record<string, unknown> = {
      model: 'meta-llama/llama-3-8b-instruct:free',
      messages: [
        { role: 'system', content: promptDoSistema },
        { role: 'user', content: userMessage },
      ],
    };
    if (useResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }

    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://gestao-verde.app',
        'X-Title': 'Gestão Verde SaaS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  };

  try {
    let resposta = await callOpenRouter(true);
    if (resposta.status === 400) {
      resposta = await callOpenRouter(false);
    }

    if (!resposta.ok) {
      throw new Error(`OpenRouter retornou status ${resposta.status}`);
    }

    const dados = (await resposta.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const rawContent = dados?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Resposta vazia do OpenRouter.');
    }

    const parsed = extractJsonObject(rawContent);
    const eficiencia = normalizeEfficiency(parsed.eficiencia);
    const nivelAcao = normalizeActionLevel(parsed.nivelAcao, eficiencia);

    const fallback = buildLocalFallbackAnalysis(textoDoRelato);

    return {
      provider: 'openrouter',
      analysis: {
        pragaDoenca: String(parsed.pragaDoenca || fallback.pragaDoenca).slice(0, 160),
        contagemPopulosional: String(
          parsed.contagemPopulosional || fallback.contagemPopulosional
        ).slice(0, 120),
        tratamentoAtual: String(parsed.tratamentoAtual || fallback.tratamentoAtual).slice(0, 200),
        eficiencia,
        nivelAcao,
        recomendacaoSolucao: String(
          parsed.recomendacaoSolucao || fallback.recomendacaoSolucao
        ).slice(0, 240),
      },
    };
  } catch (err) {
    console.error('Erro ao processar IA no OpenRouter:', err instanceof Error ? err.message : err);
    return {
      analysis: buildLocalFallbackAnalysis(textoDoRelato),
      provider: 'fallback',
      warning: 'Serviço OpenRouter indisponível no momento; aplicada análise agronômica local.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '64kb' }));

  app.post('/api/analyze-report', async (req: Request, res: Response) => {
    const body = (req.body || {}) as { textoDoRelato?: unknown; microarea?: unknown };
    const textoDoRelato = typeof body.textoDoRelato === 'string' ? body.textoDoRelato.trim() : '';
    const microarea = typeof body.microarea === 'string' ? body.microarea.trim() : undefined;

    if (textoDoRelato.length < 3) {
      res.status(400).json({ error: 'Informe um relato com pelo menos 3 caracteres.' });
      return;
    }

    const result = await analyzeWithOpenRouter(textoDoRelato.slice(0, 2000), microarea);
    res.json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build não encontrado.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gestão Verde server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
