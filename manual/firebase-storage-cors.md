# Configurando CORS para o Firebase Storage

Algumas páginas do VendedorPro enviam PDFs diretamente para o Firebase Storage. Quando o bucket não está configurado para aceitar requisições vindas do domínio do sistema, o navegador bloqueia o envio e mostra um erro como:

```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/v0/b/<bucket>/o?...' from origin 'https://www.provendedor.com.br' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
```

Esse erro aparece porque o **preflight** `OPTIONS` enviado pelo navegador não recebe uma resposta com status `200` e com os cabeçalhos `Access-Control-Allow-Origin` e `Access-Control-Allow-Methods` apropriados. Para resolver é necessário definir uma política de CORS para o bucket do Firebase Storage autorizando o domínio do sistema.

## Passos para configurar

1. [Instale e autentique o Google Cloud CLI](https://cloud.google.com/sdk/docs/install) caso ainda não possua o `gcloud`/`gsutil` configurados.
2. Gere um arquivo `cors.json` com a política desejada. Exemplo liberando os domínios de produção e homologação:

    ```json
    [
      {
        "origin": ["https://www.provendedor.com.br", "https://app.provendedor.com.br"],
        "method": ["GET", "HEAD", "PUT", "POST", "OPTIONS"],
        "responseHeader": ["Authorization", "Content-Type", "x-goog-resumable"],
        "maxAgeSeconds": 3600
      }
    ]
    ```

3. Aplique o arquivo ao bucket do projeto:

    ```bash
    gsutil cors set cors.json gs://matheus-35023.appspot.com
    ```

4. Aguarde alguns minutos e tente o envio novamente.

> **Importante:** Essa configuração é feita por bucket. Se houver buckets diferentes para ambientes distintos, repita o processo para cada um deles.

## Diagnóstico rápido

As páginas atualizadas exibem uma mensagem explicando quando o problema estiver relacionado a CORS. Caso o erro persista mesmo após a configuração, verifique:

- Se o usuário está autenticado e possui permissão de escrita conforme as regras do Storage.
- Se há algum proxy (Cloudflare, por exemplo) alterando os cabeçalhos de resposta.
- Se o domínio utilizado na aplicação corresponde exatamente ao listado na política de CORS (incluindo protocolo e subdomínio).

Com a política ajustada o upload volta a funcionar normalmente e o navegador deixa de bloquear a requisição.
