import {
  ref,
  uploadBytesResumable,
  setMaxUploadRetryTime,
  setMaxOperationRetryTime,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';

const configuredStorages = new WeakSet();

const DEFAULT_CHUNK_RETRY_TIME = 90_000;
const DEFAULT_OPERATION_RETRY_TIME = 5 * 60_000;

export function configureStorageRetries(
  storage,
  {
    chunkRetryTime = DEFAULT_CHUNK_RETRY_TIME,
    operationRetryTime = DEFAULT_OPERATION_RETRY_TIME,
  } = {},
) {
  if (!storage || configuredStorages.has(storage)) {
    return;
  }
  setMaxUploadRetryTime(storage, chunkRetryTime);
  setMaxOperationRetryTime(storage, operationRetryTime);
  configuredStorages.add(storage);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessContentType(file) {
  if (file?.type) {
    return file.type;
  }
  const name = typeof file?.name === 'string' ? file.name.toLowerCase() : '';
  if (name.endsWith('.pdf')) {
    return 'application/pdf';
  }
  return 'application/octet-stream';
}

export async function uploadWithRetry(storage, path, file, metadata = {}) {
  if (!storage) {
    throw new Error('Instância do Storage é obrigatória.');
  }
  if (!path) {
    throw new Error('O caminho do arquivo é obrigatório.');
  }
  if (!file) {
    throw new Error('É necessário informar um arquivo para upload.');
  }

  const meta = {
    contentType: guessContentType(file),
    ...metadata,
  };

  const maxAttempts = 6;
  const backoff = (attempt) => Math.min(2000 * 2 ** attempt, 20000);
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const snapshot = await new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(ref(storage, path), file, meta);
        uploadTask.on(
          'state_changed',
          null,
          (error) => reject(error),
          () => resolve(uploadTask.snapshot),
        );
      });
      return snapshot;
    } catch (error) {
      lastError = error;
      const message = `${error?.message || ''} ${error?.serverResponse || ''}`;
      const shouldRetry =
        String(message).includes('503') ||
        error?.code === 'storage/retry-limit-exceeded';
      if (!shouldRetry || attempt === maxAttempts - 1) {
        break;
      }
      await sleep(backoff(attempt));
    }
  }

  throw lastError || new Error('Falha ao enviar arquivo para o Storage.');
}
