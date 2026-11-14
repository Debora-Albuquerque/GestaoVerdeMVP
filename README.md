# Gestão Verde

Aplicação web para apoiar o monitoramento de hortas e propriedades agrícolas, com foco em produtores de hortaliças do Alto Tietê e de Mogi das Cruzes (SP). O MVP reúne registros de campo, acompanhamento de ocorrências e informações de clima em um painel.

## O que a aplicação oferece

- **Acesso do produtor:** cadastro e login com Google ou e-mail e senha. Os dados da propriedade são associados à conta autenticada.
- **Microáreas:** consulta e cadastro de canteiros ou setores, com cultura, localização e situação. Uma conta nova recebe quatro microáreas de exemplo.
- **Relatos de campo:** formulário guiado para registrar praga ou doença, intensidade, manejo atual e eficiência. É possível ditar as respostas usando o reconhecimento de voz do navegador, quando disponível.
- **Análise do relato:** classificação local por palavras-chave e sugestões de manejo. No servidor, é possível habilitar análise generativa pelo OpenRouter; sem esse serviço, a aplicação usa a análise local.
- **Prioridades:** painel de ocorrências abertas ordenadas por gravidade, com opção para marcá-las como resolvidas.
- **Clima e risco fitossanitário:** previsão para a localização escolhida, com opção de usar o GPS do dispositivo. Os dados meteorológicos vêm da API Open-Meteo.
- **Histórico e sazonalidade:** resumo de ocorrências por período, cultura e categoria, com exportação do histórico em CSV.

As classificações e recomendações servem como apoio ao monitoramento; não substituem a avaliação de um profissional agrônomo.

## Tecnologias

- React, TypeScript, Vite e Tailwind CSS
- Firebase Authentication e Cloud Firestore
- Express para servir a aplicação e disponibilizar a rota de análise
- OpenRouter para análise generativa opcional
- Open-Meteo para previsão do tempo

## Executar localmente

Pré-requisito: [Bun](https://bun.sh/).

```bash
bun install
bun run dev
```

Abra <http://localhost:3000>. O comando inicia o servidor Express com o Vite em modo de desenvolvimento.

### Firebase

A aplicação usa a configuração em [`firebase-applet-config.json`](./firebase-applet-config.json). Para autenticação e persistência funcionarem, configure no projeto Firebase correspondente:

1. Ative Google e E-mail/Senha em **Authentication → Sign-in method**.
2. Autorize o domínio usado para acessar a aplicação em **Authentication → Settings → Authorized domains**.
3. Ative o Cloud Firestore e configure regras que restrinjam a leitura e a gravação dos documentos ao respectivo produtor autenticado.

O cliente usa as coleções `users`, `microareas` e `reports`. Revise as regras do Firestore antes de usar dados reais.

### Análise generativa opcional

No desenvolvimento local, a rota Express pode usar o OpenRouter. Defina `OPENROUTER_API_KEY` no ambiente do servidor; `APP_URL` é opcional e identifica a aplicação nas requisições ao provedor. Sem uma chave válida, a análise local por palavras-chave continua disponível.

Não coloque chaves de provedores em arquivos servidos ao navegador nem as publique no repositório.

## Verificações

```bash
bun run lint
bun run build
```

Para gerar localmente o build com o caminho-base do GitHub Pages:

```bash
bun run build --mode github-pages
```

## GitHub Pages

O workflow [deploy-pages.yml](./.github/workflows/deploy-pages.yml) executa lint e build e publica o site após um push para `main`; também pode ser iniciado manualmente pelo GitHub Actions. Na primeira publicação, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**.

O GitHub Pages hospeda somente os arquivos estáticos: não executa o servidor Express nem a rota `/api/analyze-report`. Nesse modo, a análise do relato usa o classificador local por palavras-chave. Autenticação e dados ainda dependem da configuração do Firebase, e a previsão continua dependendo da API Open-Meteo.
