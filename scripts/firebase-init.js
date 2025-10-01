import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { APP_CHECK_SITE_KEY, ensureAppCheck } from '../firebase-config.js';

// Configuração Firebase
const firebaseConfig = {
  apiKey: "AIzaSyC78l9b2DTNj64y_0fbRKofNupO6NHDmeo",
  authDomain: "matheus-35023.firebaseapp.com",
  projectId: "matheus-35023",
  storageBucket: "matheus-35023.appspot.com",
  messagingSenderId: "1011113149395",
  appId: "1:1011113149395:web:c1f449e0e974ca8ecb2526"
};

// Inicializa Firebase
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
ensureAppCheck(app) ?? initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
const db = getFirestore(app);

// 🔁 Exporte tudo que o background precisa:
export { db, collection, doc, setDoc };
