import { app } from './firebase-config.js';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  setMaxUploadRetryTime,
  setMaxOperationRetryTime,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';

const storage = getStorage(app);
setMaxUploadRetryTime(storage, 90_000);
setMaxOperationRetryTime(storage, 5 * 60_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_UPLOAD_ATTEMPTS = 6;

async function uploadWithBackoff(file, path, metadata = {}, options = {}) {
  const { attempt = 0, onStateChange, onRetry } = options;
  const storageRef = typeof path === 'string' ? ref(storage, path) : path;
  const delay = Math.min(2000 * 2 ** attempt, 20_000);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, metadata);
    task.on(
      'state_changed',
      (snapshot) => {
        if (typeof onStateChange === 'function') {
          try {
            onStateChange(snapshot);
          } catch (callbackError) {
            console.warn(
              'Erro ao notificar progresso do upload:',
              callbackError,
            );
          }
        }
      },
      async (error) => {
        const message = `${error?.message || ''} ${error?.serverResponse || ''}`;
        const is503 =
          message.includes('503') ||
          error?.code === 'storage/retry-limit-exceeded';

        if (is503 && attempt < MAX_UPLOAD_ATTEMPTS) {
          task.cancel();
          if (typeof onRetry === 'function') {
            try {
              onRetry({
                attempt: attempt + 1,
                delay,
                error,
                maxAttempts: MAX_UPLOAD_ATTEMPTS,
              });
            } catch (callbackError) {
              console.warn(
                'Erro ao notificar retentativa de upload:',
                callbackError,
              );
            }
          }
          await sleep(delay);
          try {
            const snapshot = await uploadWithBackoff(file, path, metadata, {
              attempt: attempt + 1,
              onStateChange,
              onRetry,
            });
            resolve(snapshot);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          reject(error);
        }
      },
      () => resolve(task.snapshot),
    );
  });
}

function deleteFromStorage(path) {
  if (!path) return Promise.resolve();
  const storageRef = typeof path === 'string' ? ref(storage, path) : path;
  return deleteObject(storageRef);
}

export {
  storage,
  ref,
  getDownloadURL,
  uploadWithBackoff,
  deleteFromStorage,
  MAX_UPLOAD_ATTEMPTS,
};
