import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  setMaxUploadRetryTime,
  setMaxOperationRetryTime,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';
import { app } from './firebase-config.js';

const STORAGE_BUCKET_URL = 'gs://matheus-35023.appspot.com';
const storage = getStorage(app, STORAGE_BUCKET_URL);

setMaxUploadRetryTime(storage, 10 * 60 * 1000);
setMaxOperationRetryTime(storage, 2 * 60 * 1000);

export function sanitizeFileName(name = '') {
  const base =
    typeof name === 'string' && name.trim() ? name.trim() : 'arquivo.pdf';
  return base.replace(/[^\w.\-]+/g, '_');
}

function toPdfBlob(fileOrBlob) {
  if (!fileOrBlob) {
    throw new Error('Arquivo PDF inválido.');
  }
  if (fileOrBlob instanceof Blob) {
    if (fileOrBlob.type === 'application/pdf') {
      return fileOrBlob;
    }
    return new Blob([fileOrBlob], { type: 'application/pdf' });
  }
  return new Blob([fileOrBlob], { type: 'application/pdf' });
}

export function uploadPdf(fileOrBlob, options = {}) {
  const { path, metadata = {}, onProgress } = options;
  const blob = toPdfBlob(fileOrBlob);
  const defaultName =
    fileOrBlob && typeof fileOrBlob.name === 'string'
      ? fileOrBlob.name
      : 'arquivo.pdf';
  const targetPath =
    path || `pdfs/${Date.now()}_${sanitizeFileName(defaultName)}`;
  const storageRef = ref(storage, targetPath);
  const uploadTask = uploadBytesResumable(storageRef, blob, {
    contentType: 'application/pdf',
    ...metadata,
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (typeof onProgress === 'function' && snapshot) {
          onProgress(snapshot);
        }
      },
      (error) => {
        if (
          error &&
          (error.code === 'storage/retry-limit-exceeded' ||
            error.code === 'storage/unknown')
        ) {
          try {
            uploadTask.resume?.();
            return;
          } catch (resumeError) {
            console.warn(
              'Não foi possível retomar upload automaticamente:',
              resumeError,
            );
          }
        }
        reject(error);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve({
          url,
          path: uploadTask.snapshot.ref.fullPath,
          ref: uploadTask.snapshot.ref,
        });
      },
    );
  });
}

export { storage };
