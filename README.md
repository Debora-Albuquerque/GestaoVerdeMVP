# Gestão Verde MVP

## Publicação no GitHub Pages

O workflow em `.github/workflows/deploy-pages.yml` publica o site ao receber um push na branch `main`. Na primeira publicação, configure **Settings → Pages → Build and deployment → Source → GitHub Actions** no repositório.

URL esperada: <https://debora-albuquerque.github.io/GestaoVerdeMVP/>.

O build do Pages usa análise agronômica local por palavras-chave; ele não chama o servidor Node nem a IA generativa. A previsão do tempo continua dependendo da API pública Open-Meteo.

## Configuração do Firebase para a demonstração

Antes de testar login e dados:

1. Em **Firebase Console → Authentication → Sign-in method**, habilite os provedores que serão demonstrados.
2. Em **Authentication → Settings → Authorized domains**, adicione `debora-albuquerque.github.io`.
3. Confirme que o Firestore está ativo e que as regras do projeto correspondem a `firestore.rules`.

O arquivo `firebase-applet-config.json` contém configuração pública do cliente; o acesso aos dados deve permanecer protegido pelas regras do Firestore.
