import {
  getStorage,
  ref,
  uploadBytesResumable,
  setMaxUploadRetryTime,
  setMaxOperationRetryTime,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';

const configuredStorages = new WeakSet();

function ensureStorageConfigured(storage) {
  if (!configuredStorages.has(storage)) {
    setMaxUploadRetryTime(storage, 90_000);
    setMaxOperationRetryTime(storage, 5 * 60_000);
    configuredStorages.add(storage);
  }
}

export function getConfiguredStorage(app) {
  const storage = getStorage(app);
  ensureStorageConfigured(storage);
  return storage;
}

const MAX_ATTEMPTS = 6;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStorageError(error) {
  if (!error) return false;
  const message =
    `${error.message || ''} ${error.serverResponse || ''}`.toLowerCase();
  return (
    error.code === 'storage/retry-limit-exceeded' ||
    error.code === 'storage/unknown' ||
    message.includes('503') ||
    message.includes('temporarily') ||
    message.includes('timeout')
  );
}

export async function uploadFileWithRetry(
  storage,
  path,
  file,
  metadata = {},
  attempt = 0,
) {
  ensureStorageConfigured(storage);
  const meta = { ...metadata };
  if (!meta.contentType) {
    const inferredType =
      (file && typeof file.type === 'string' && file.type) ||
      (file?.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '') ||
      'application/octet-stream';
    meta.contentType = inferredType;
  }

  const storageRef = ref(storage, path);

  try {
    const snapshot = await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, meta);
      task.on(
        'state_changed',
        null,
        (error) => reject(error),
        () => resolve(task.snapshot),
      );
    });
    return snapshot;
  } catch (error) {
    if (attempt < MAX_ATTEMPTS && isTransientStorageError(error)) {
      const waitTime = Math.min(2000 * 2 ** attempt, 20_000);
      await sleep(waitTime);
      return uploadFileWithRetry(storage, path, file, meta, attempt + 1);
    }
    throw error;
  }
}
