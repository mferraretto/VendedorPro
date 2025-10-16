# Firebase Admin Setup

As funções Cloud Functions agora usam o Firebase Admin SDK com uma conta de serviço.

Defina uma das variáveis de ambiente abaixo antes de executar os comandos de desenvolvimento ou deploy:

- `FIREBASE_SERVICE_ACCOUNT_KEY`: conteúdo JSON da conta de serviço (pode ser em formato JSON bruto ou Base64).
- `FIREBASE_SERVICE_ACCOUNT_FILE`: caminho para um arquivo `.json` contendo a conta de serviço.

Variáveis opcionais para sobrescrever configurações detectadas automaticamente:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_DATABASE_URL`

Caso nenhuma credencial seja informada, o SDK tentará usar `applicationDefault()`.
