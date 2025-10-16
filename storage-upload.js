import { getApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  setMaxUploadRetryTime,
  setMaxOperationRetryTime,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';

const DEFAULT_BUCKET = 'gs://matheus-35023.appspot.com';
const storageCache = new Map();

function ensureStorage(bucket = DEFAULT_BUCKET) {
  const key = bucket || 'default';
  if (!storageCache.has(key)) {
    const app = getApp();
    const storage = bucket ? getStorage(app, bucket) : getStorage(app);
    setMaxUploadRetryTime(storage, 10 * 60 * 1000);
    setMaxOperationRetryTime(storage, 2 * 60 * 1000);
    storageCache.set(key, storage);
  }
  return storageCache.get(key);
}

export function uploadPdfResumable(fileOrBlob, path, options = {}) {
  if (!fileOrBlob) {
    return Promise.reject(new Error('Nenhum arquivo informado para upload.'));
  }
  if (!path) {
    return Promise.reject(
      new Error('O caminho de armazenamento é obrigatório.'),
    );
  }
  const { onProgress, metadata } = options;
  const storage = ensureStorage(options.bucket || DEFAULT_BUCKET);
  const meta = { contentType: 'application/pdf', ...(metadata || {}) };
  const ref = storageRef(storage, path);
  const task = uploadBytesResumable(ref, fileOrBlob, meta);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (typeof onProgress === 'function' && snapshot?.totalBytes) {
          const percent = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          );
          try {
            onProgress({ snapshot, percent });
          } catch (progressErr) {
            console.warn('Upload progress callback error:', progressErr);
          }
        }
      },
      (error) => {
        if (
          error?.code === 'storage/retry-limit-exceeded' ||
          error?.code === 'storage/unknown'
        ) {
          try {
            task.resume?.();
          } catch (_) {
            // ignore resume errors
          }
        }
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            url,
            fullPath: task.snapshot.ref.fullPath,
            ref: task.snapshot.ref,
          });
        } catch (urlError) {
          reject(urlError);
        }
      },
    );
  });
}

if (typeof window !== 'undefined') {
  window.uploadPdfResumable = uploadPdfResumable;
}
