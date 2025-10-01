// --- Firebase init ---
const firebaseConfig = {
  apiKey: "AIzaSyC78l9b2DTNj64y_0fbRKofNupO6NHDmeo",
  authDomain: "matheus-35023.firebaseapp.com",
  projectId: "matheus-35023",
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const els = {
  loginBox: document.getElementById("loginBox"),
  app: document.getElementById("app"),
  authEmail: document.getElementById("authEmail"),
  authPass: document.getElementById("authPass"),
  doLogin: document.getElementById("doLogin"),

  loja: document.getElementById("loja"),
  linkLoja: document.getElementById("linkLoja"),
  outrasLojas: document.getElementById("outrasLojas"),
  contatoTel: document.getElementById("contatoTel"),
  ddi: document.getElementById("ddi"),
  telefone: document.getElementById("telefone"),
  responsavel: document.getElementById("responsavel"),
  modeloLogistico: document.getElementById("modeloLogistico"),
  descricao: document.getElementById("descricao"),
  autoSend: document.getElementById("autoSend"),

  preencher: document.getElementById("preencher"),
  preencherEnviar: document.getElementById("preencherEnviar"),
};

function ui(authenticated) {
  els.loginBox.style.display = authenticated ? "none" : "";
  els.app.style.display = authenticated ? "" : "none";
}

els.doLogin.onclick = async () => {
  await auth.signInWithEmailAndPassword(els.authEmail.value, els.authPass.value);
};

auth.onAuthStateChanged(async (user) => {
  ui(!!user);
  if (!user) return;

  // carrega lojas
  const snap = await db.collection("usuarios").doc(user.uid).collection("lojas").get();
  els.loja.innerHTML = "";
  snap.forEach(doc => {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.data().linkLoja || doc.id;
    els.loja.appendChild(opt);
  });

  if (els.loja.options.length) {
    await loadLoja(els.loja.value);
  }

  els.loja.onchange = () => loadLoja(els.loja.value);
});

async function loadLoja(id) {
  const user = auth.currentUser;
  const doc = await db.collection("usuarios").doc(user.uid).collection("lojas").doc(id).get();
  const d = doc.data() || {};

  els.linkLoja.value = d.linkLoja || "";
  els.outrasLojas.value = d.temOutrasLojasMesmoEndereco ? "Sim" : "Não";
  els.contatoTel.value = d.aceitaContatoPorTelefone ? "Sim" : "Não";
  els.ddi.value = d.ddi || "+55";
  els.telefone.value = d.telefone || "";
  els.responsavel.value = d.nomeResponsavel || "";
  els.modeloLogistico.value = d.modeloLogistico || "";
  els.descricao.value = d.descricaoProblemaPadrao || "";
}

function currentPayload() {
  return {
    linkLoja: els.linkLoja.value.trim(),
    temOutrasLojasMesmoEndereco: els.outrasLojas.value === "Sim",
    aceitaContatoPorTelefone: els.contatoTel.value === "Sim",
    ddi: els.ddi.value.trim() || "+55",
    telefone: els.telefone.value.replace(/\D+/g, ""),
    nomeResponsavel: els.responsavel.value.trim(),
    modeloLogistico: els.modeloLogistico.value.trim(),
    descricao: els.descricao.value.trim(),
    autoSend: els.autoSend.checked
  };
}

async function sendToContent(payload, alsoSend) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, {
    type: "SHOPEE_HOTLINE_AUTOFILL",
    payload: { ...payload, submit: !!alsoSend }
  });
}

els.preencher.onclick = () => sendToContent(currentPayload(), false);
els.preencherEnviar.onclick = () => sendToContent(currentPayload(), true);
