import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { APP_CHECK_SITE_KEY, ensureAppCheck } from '../firebase-config.js';

const firebaseConfig = {
  apiKey: "AIzaSyC78l9b2DTNj64y_0fbRKofNupO6NHDmeo",
  authDomain: "matheus-35023.firebaseapp.com",
  projectId: "matheus-35023",
  storageBucket: "matheus-35023.appspot.com",
  messagingSenderId: "1011113149395",
  appId: "1:1011113149395:web:c1f449e0e974ca8ecb2526"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
ensureAppCheck(app) ?? initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
const auth = getAuth(app);

const loginSection = document.getElementById('loginSection');
const userSection = document.getElementById('userSection');
const userInfo = document.getElementById('userInfo');

function showUser(user) {
  loginSection.style.display = 'none';
  userSection.style.display = 'block';
  userInfo.textContent = user.email;
}

function showLogin() {
  loginSection.style.display = 'block';
  userSection.style.display = 'none';
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    showUser(user);
  } else {
    showLogin();
  }
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const passphrase = document.getElementById('passphrase').value;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await chrome.storage.local.set({ uid: cred.user.uid, passphrase });
    showUser(cred.user);
  } catch (e) {
    alert('Erro ao logar: ' + e.message);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  await chrome.storage.local.clear();
  showLogin();
});

document.getElementById('collectBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});
