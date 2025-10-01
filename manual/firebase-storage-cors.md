# Configuração de CORS para o Firebase Storage

Para liberar o download e upload de arquivos do bucket `matheus-35023.appspot.com` a partir do domínio `https://www.provendedor.com.br`, é necessário aplicar a política de CORS abaixo usando a ferramenta `gsutil`.

## Passos

1. Instale e autentique o SDK do Google Cloud se ainda não estiver configurado.
2. No diretório raiz do projeto, aplique a política executando:
   ```bash
   gsutil cors set firebase-storage-cors.json gs://matheus-35023.appspot.com
   ```
3. Aguarde alguns minutos para a propagação e repita o fluxo no site hospedado em `www.provendedor.com.br`.

## Política utilizada

O arquivo [`firebase-storage-cors.json`](../firebase-storage-cors.json) contém:

```json
[
  {
    "origin": ["https://www.provendedor.com.br"],
    "method": ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "x-goog-meta-owner"]
  }
]
```

Essa configuração garante que o bucket aceite requisições pré-flight (OPTIONS) e métodos utilizados pela aplicação sem bloquear o navegador.
