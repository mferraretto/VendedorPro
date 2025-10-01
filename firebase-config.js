import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js';
import {
  getFirestore,
  enableIndexedDbPersistence,
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

export const APP_CHECK_SITE_KEY = '6Lf-MdsrAAAAAFxy7VBRagVA41djogpm2DC0f0xk';

// Initialize Firebase app once and enable offline persistence
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
// Best-effort enable persistence; ignore if not supported or already enabled
enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Firestore persistence not enabled:', err.code);
});
const auth = getAuth(app);

let appCheckInstance = null;

export function ensureAppCheck(currentApp = app) {
  const browserScope =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : null;
  if (appCheckInstance || !browserScope) {
    return appCheckInstance;
  }
  if (!currentApp) {
    return null;
  }
  appCheckInstance = initializeAppCheck(currentApp, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

const appCheck = typeof window !== 'undefined' ? ensureAppCheck(app) : null;

function setupCompatAppCheck() {
  if (typeof window === 'undefined') {
    return;
  }

  const compat = window.firebase;
  if (!compat?.initializeApp) {
    if (!window.__appCheckCompatRetryScheduled) {
      window.__appCheckCompatRetryScheduled = true;
      setTimeout(() => {
        window.__appCheckCompatRetryScheduled = false;
        setupCompatAppCheck();
      }, 0);
    }
    return;
  }

  if (!compat.__appCheckWrapped) {
    const originalInitializeApp = compat.initializeApp.bind(compat);
    compat.initializeApp = (...args) => {
      const compatApp = originalInitializeApp(...args);
      ensureAppCheck(compatApp);
      return compatApp;
    };
    compat.__appCheckWrapped = true;
  }

  if (compat.apps?.length) {
    try {
      ensureAppCheck(compat.app());
    } catch (error) {
      console.warn('Failed to activate App Check for compat app:', error);
    }
  }
}

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
  window.appCheck = appCheck;
  window.ensureAppCheck = ensureAppCheck;
  setupCompatAppCheck();
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
    appCheck,
    ensureAppCheck,
    APP_CHECK_SITE_KEY,
    setPassphrase,
    getPassphrase,
    clearPassphrase,
  };
}

export { app, db, auth, appCheck };
