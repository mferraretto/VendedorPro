import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

// Firebase configuration
// Fill these values via environment variables or a protected configuration not checked into version control.
export const firebaseConfig = {
  apiKey: 'AIzaSyC78l9b2DTNj64y_0fbRKofNupO6NHDmeo',
  authDomain: 'matheus-35023.firebaseapp.com',
  projectId: 'matheus-35023',
  storageBucket: 'matheus-35023.firebasestorage.app',
  messagingSenderId: '1011113149395',
  appId: '1:1011113149395:web:c1f449e0e974ca8ecb2526',
  databaseURL: 'https://matheus-35023.firebaseio.com',
};

// Initialize Firebase app once and enable offline persistence
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

function configureFirestore(appInstance) {
  const hasNewPersistenceApi =
    typeof initializeFirestore === 'function' &&
    typeof persistentLocalCache === 'function';

  if (!hasNewPersistenceApi) {
    return getFirestore(appInstance);
  }

  const initializeWithSettings = (settings) => {
    try {
      return initializeFirestore(appInstance, settings);
    } catch (error) {
      if (error?.code === 'already-initialized') {
        return getFirestore(appInstance);
      }
      throw error;
    }
  };

  const buildPersistentCache = () => {
    try {
      if (typeof persistentSingleTabManager === 'function') {
        return persistentLocalCache({ tabManager: persistentSingleTabManager() });
      }
      return persistentLocalCache();
    } catch (error) {
      console.warn('Não foi possível configurar o cache persistente do Firestore:', error);
      return null;
    }
  };

  try {
    const persistentCache = buildPersistentCache();
    if (persistentCache) {
      return initializeWithSettings({ localCache: persistentCache });
    }
    if (typeof memoryLocalCache === 'function') {
      return initializeWithSettings({ localCache: memoryLocalCache() });
    }
  } catch (error) {
    if (error?.code === 'failed-precondition' || error?.code === 'unimplemented') {
      console.warn(
        'Cache persistente do Firestore indisponível neste navegador. Usando cache em memória.',
        error.code,
      );
      if (typeof memoryLocalCache === 'function') {
        try {
          return initializeWithSettings({ localCache: memoryLocalCache() });
        } catch (memoryError) {
          console.warn('Falha ao configurar o cache em memória do Firestore:', memoryError);
        }
      }
      return getFirestore(appInstance);
    }

    console.warn('Firestore persistence not enabled:', error?.code || error);
    return getFirestore(appInstance);
  }

  // Se chegamos aqui é porque não foi possível criar o cache persistente, então usamos o padrão.
  return getFirestore(appInstance);
}

const db = configureFirestore(app);
const auth = getAuth(app);

// Utility functions for storing the passphrase securely
export function setPassphrase(pass) {
  if (typeof localStorage !== 'undefined' && pass) {
    localStorage.setItem('sistemaPassphrase', pass);
  }
}

export function getPassphrase() {
  return typeof localStorage !== 'undefined'
    ? localStorage.getItem('sistemaPassphrase')
    : null;
}

export function clearPassphrase() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('sistemaPassphrase');
  }
}

// Expose to global scope for inline scripts
if (typeof window !== 'undefined') {
  window.firebaseConfig = firebaseConfig;
  window.firebaseApp = app;
  window.db = db;
  window.auth = auth;
  window.setPassphrase = setPassphrase;
  window.getPassphrase = getPassphrase;
  window.clearPassphrase = clearPassphrase;
}

// Export for module environments
if (typeof module !== 'undefined') {
  module.exports = {
    firebaseConfig,
    app,
    db,
    auth,
    setPassphrase,
    getPassphrase,
    clearPassphrase,
  };
}

export { app, db, auth };
