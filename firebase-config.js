// Firebase configuration
// Fill these values via environment variables or a protected configuration not checked into version control.
const firebaseConfig = {
      apiKey: "AIzaSyC78l9b2DTNj64y_0fbRKofNupO6NHDmeo",
      authDomain: "matheus-35023.firebaseapp.com",
      projectId: "matheus-35023",
      storageBucket: "matheus-35023.appspot.com",
      messagingSenderId: "1011113149395",
      appId: "1:1011113149395:web:c1f449e0e974ca8ecb2526",
      databaseURL: "https://matheus-35023.firebaseio.com"
   };

// Utility functions for storing the passphrase securely
function setPassphrase(pass) {
  if (typeof localStorage !== 'undefined' && pass) {
    localStorage.setItem('sistemaPassphrase', pass);
  }
}

function getPassphrase() {
  return typeof localStorage !== 'undefined'
    ? localStorage.getItem('sistemaPassphrase')
    : null;
}

function clearPassphrase() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('sistemaPassphrase');
  }
}

// Expose to global scope for inline scripts
if (typeof window !== 'undefined') {
  window.firebaseConfig = firebaseConfig;
      window.setPassphrase = setPassphrase;
  window.getPassphrase = getPassphrase;
  window.clearPassphrase = clearPassphrase;
}

// Export for module environments
if (typeof module !== 'undefined') {
 module.exports = {
    firebaseConfig,
    setPassphrase,
    getPassphrase,
    clearPassphrase
  };
}
