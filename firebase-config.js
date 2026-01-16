import {
  initializeApp,
  getApps,
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
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
  storageBucket: 'matheus-35023.appspot.com',
  messagingSenderId: '1011113149395',
  appId: '1:1011113149395:web:c1f449e0e974ca8ecb2526',
  databaseURL: 'https://matheus-35023.firebaseio.com',
};

export const labelsPdfStorageBucket = 'gs://matheus-35023';

// Initialize Firebase app once and enable offline persistence
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
// Best-effort enable persistence; ignore if not supported or already enabled
enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Firestore persistence not enabled:', err.code);
});
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
  window.labelsPdfStorageBucket = labelsPdfStorageBucket;
}

// Export for module environments
if (typeof module !== 'undefined') {
  module.exports = {
    firebaseConfig,
    app,
    db,
    auth,
    labelsPdfStorageBucket,
    setPassphrase,
    getPassphrase,
    clearPassphrase,
  };
}

export { app, db, auth };
