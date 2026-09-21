// Utilitário compartilhado das Pages Functions.
// Autentica no Firebase Realtime Database com a chave de serviço (secret único
// obrigatório) para ler configurações do painel admin e gravar com autoridade.

export const DB_PADRAO = "https://importadosval-bbcec-default-rtdb.firebaseio.com";

let tokenCache = { token: null, expira: 0 };

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function base64UrlDoJson(objeto) {
  return b64url(new TextEncoder().encode(JSON.stringify(objeto)));
}

export async function obterTokenDeAcesso(env) {
  const agora = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.expira > agora + 60) return tokenCache.token;

  const cru = env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!cru) throw new Error("FIREBASE_SERVICE_ACCOUNT não configurado");
  const textoJson = cru.trim().startsWith("{") ? cru : atob(cru);
  const sa = JSON.parse(textoJson);

  const pem = String(sa.private_key || "").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bytesChave = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("pkcs8", bytesChave, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);

  const cabecalho = base64UrlDoJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlDoJson({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  });
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(`${cabecalho}.${claims}`));
  const jwt = `${cabecalho}.${claims}.${b64url(new Uint8Array(assinatura))}`;

  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const dados = await resposta.json();
  if (!dados.access_token) throw new Error("Falha ao autenticar no Google");
  tokenCache = { token: dados.access_token, expira: agora + (dados.expires_in || 3600) };
  return tokenCache.token;
}

function dbDe(env) {
  return env.FIREBASE_DB_URL || DB_PADRAO;
}

// Lê nós do Realtime Database como administradora (burla as regras com credencial de serviço)
export async function lerComoAdmin(env, caminho) {
  try {
    const token = await obterTokenDeAcesso(env);
    const resposta = await fetch(`${dbDe(env)}/${caminho}.json?access_token=${token}`, { signal: AbortSignal.timeout(9000) });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

// Token do Mercado Pago: variável de ambiente OU o salvo na aba Pagamentos do painel admin
export async function tokenMercadoPago(env) {
  if (env.MP_ACCESS_TOKEN) return env.MP_ACCESS_TOKEN;
  if (!env.FIREBASE_SERVICE_ACCOUNT) return "";
  const pagamentos = await lerComoAdmin(env, "configuracoes/pagamentos");
  return String((pagamentos && pagamentos.mercadoPagoAccessToken) || "");
}

// Lista de e-mails administradores: env OU painel admin
export async function adminsDoServidor(env) {
  const lista = [];
  (env.ADMIN_EMAILS || "").split(/[,;\s]+/).forEach((parte) => {
    if (parte.includes("@")) lista.push(parte.trim().toLowerCase());
  });
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const admins = await lerComoAdmin(env, "configuracoes/admins");
    const valores = Array.isArray(admins) ? admins : admins && typeof admins === "object" ? Object.values(admins) : [];
    valores.forEach((e) => {
      if (e && String(e).includes("@")) lista.push(String(e).trim().toLowerCase());
    });
  }
  return [...new Set(lista.filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0, 10);
}
