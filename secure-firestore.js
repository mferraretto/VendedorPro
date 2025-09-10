import { encryptString, decryptString } from './crypto.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
function buildRef(db, collectionPath, id) {
  const segments = collectionPath.split('/').filter(Boolean);
  return doc(db, ...segments, id);
}

export async function saveSecureDoc(db, collectionName, id, data, passphrase) {
 // Store the UID outside the encrypted payload so we can query by owner
  const { uid, ...rest } = data || {};
  const encrypted = await encryptString(JSON.stringify(rest), passphrase);
  const payload = { encrypted };
  if (uid) payload.uid = uid;
  const ref = buildRef(db, collectionName, id);
  await setDoc(ref, payload);
}

export async function loadSecureDoc(db, collectionName, id, passphrase) {
 if (!id) {
    console.warn('⚠️ ID do documento não foi fornecido para a coleção:', collectionName);
    return null;
  }
  const ref = buildRef(db, collectionName, id);
  const snap = await getDoc(ref);
  // Firestore SDKs vary between an `exists` boolean property and an
  // `exists()` method. Handle both to avoid runtime errors.
  const snapExists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
  if (!snapExists) return null;

  const { encrypted, encryptedData, uid, ...rest } = snap.data();
  const payload = encrypted || encryptedData;

  if (!payload) {
    return Object.keys(rest).length ? { ...rest, ...(uid && { uid }) } : null;
  }

  try {
    let jsonStr;

    if (typeof payload === 'string') {
      // Remove aspas extras e desserializa corretamente
      jsonStr = payload.trim();

      // 🔧 Corrige casos onde o JSON foi salvo como string com escapes
      if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
        jsonStr = JSON.parse(jsonStr); // Remove aspas + parses internos
      }
    } else {
      jsonStr = JSON.stringify(payload); // Já é objeto válido
    }

    console.log('📄 Documento:', id);
    console.log('🧪 JSON para descriptografar:', jsonStr);

    const plaintext = await decryptString(jsonStr, passphrase);
    const data = JSON.parse(plaintext);

    if (uid && !data.uid) data.uid = uid;
    return data;
  } catch (err) {
    console.warn('🔐 Erro ao descriptografar documento:', id, err.message);
    if (Object.keys(rest).length) {
      return { ...rest, ...(uid && { uid }) };
    }
    return null;
  }
}

export async function loadSecureDocFromSnap(docSnap, passphrase) {
  // Support both Firestore v9 `exists()` method and SDKs that expose
  // an `exists` boolean property.
  const snapExists = docSnap && (typeof docSnap.exists === 'function' ? docSnap.exists() : docSnap.exists);
  if (!snapExists) return null;

  const { encrypted, encryptedData, uid, ...rest } = docSnap.data();
  const payload = encrypted || encryptedData;

  if (!payload) {
    return Object.keys(rest).length ? { ...rest, ...(uid && { uid }) } : null;
  }

  try {
    let jsonStr;

    if (typeof payload === 'string') {
      jsonStr = payload.trim();

      if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
        jsonStr = JSON.parse(jsonStr);
      }
    } else {
      jsonStr = JSON.stringify(payload);
    }

    console.log('📄 Documento:', docSnap.id);
    console.log('🧪 JSON para descriptografar:', jsonStr);

    const plaintext = await decryptString(jsonStr, passphrase);
    const data = JSON.parse(plaintext);

    if (uid && !data.uid) data.uid = uid;
    return data;
  } catch (err) {
    console.warn('🔐 Erro ao descriptografar documento:', docSnap.id, err.message);
    if (Object.keys(rest).length) {
      return { ...rest, ...(uid && { uid }) };
    }
    return null;
  }
}


// Helpers enforcing the standard `uid/<uid>/collection` pattern
export async function setDocWithCopy(ref, data, uid, responsavelUid) {
  await setDoc(ref, data);
  const respUid = responsavelUid || (typeof window !== 'undefined' && window.responsavelFinanceiro?.uid);
  if (respUid && respUid !== uid) {
    const segments = ref.path.split('/');
    const relative = segments.slice(2).join('/');
    const copyRef = doc(ref.firestore, `uid/${respUid}/uid/${uid}/${relative}`);
    await setDoc(copyRef, data);
  }
}

export async function saveUserDoc(db, uid, collection, id, data, passphrase, responsavelUid) {
  await saveSecureDoc(db, `uid/${uid}/${collection}`, id, { ...data, uid }, passphrase);
  const respUid = responsavelUid || (typeof window !== 'undefined' && window.responsavelFinanceiro?.uid);
  if (respUid && respUid !== uid) {
    await saveSecureDoc(db, `uid/${respUid}/uid/${uid}/${collection}`, id, { ...data, uid }, passphrase);
  }
}

export async function loadUserDoc(db, uid, collection, id, passphrase) {
  return loadSecureDoc(db, `uid/${uid}/${collection}`, id, passphrase);
}
