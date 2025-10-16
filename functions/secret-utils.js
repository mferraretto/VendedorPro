import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { getApp } from "firebase-admin/app";

const client = new SecretManagerServiceClient();

function getProjectId() {
  // tenta detectar do ambiente
  const pid =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    getApp().options.projectId;
  if (!pid) throw new Error("Não foi possível detectar o projectId.");
  return pid;
}

export async function ensureUserSecret(uid) {
  const projectId = getProjectId();
  const secretId = `tiny_token_${uid}`;
  const [exists] = await client.getSecret({ name: `projects/${projectId}/secrets/${secretId}` })
    .then(() => [true]).catch(() => [false]);
  if (!exists) {
    await client.createSecret({
      parent: `projects/${projectId}`,
      secret: { name: `projects/${projectId}/secrets/${secretId}`, replication: { automatic: {} } },
      secretId
    });
  }
  return `projects/${projectId}/secrets/${secretId}`;
}

export async function storeUserTinyToken(uid, token) {
  const name = await ensureUserSecret(uid);
  const [version] = await client.addSecretVersion({
    parent: name,
    payload: { data: Buffer.from(token, "utf8") }
  });
  return version.name; // ex: projects/.../secrets/tiny_token_UID/versions/3
}

export async function getUserTinyToken(uid) {
  const projectId = getProjectId();
  const secretId = `tiny_token_${uid}`;
  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;
  const [access] = await client.accessSecretVersion({ name });
  const payload = access.payload?.data?.toString("utf8");
  if (!payload) throw new Error("Token Tiny não encontrado para este usuário.");
  return payload;
}

export async function destroyUserTinyToken(uid) {
  const projectId = getProjectId();
  const name = `projects/${projectId}/secrets/tiny_token_${uid}`;
  // Desabilita todas as versões (opcionalmente, pode destruir)
  // Aqui vamos destruir o secret todo:
  await client.deleteSecret({ name });
}
