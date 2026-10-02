// Autenticação Firebase por chave de serviço + leituras como admin.
// Compartilhado pelo worker.js (Workers) e pelas Pages Functions.

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

export function dbDe(env) {
  return env.FIREBASE_DB_URL || DB_PADRAO;
}

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

// ─── Usuário de sistema (Firebase Auth REST) — alternativa simples à chave de serviço ───
export const WEB_API_KEY_PADRAO = "AIzaSyAxBK6w5g_bP_HJv7N8JFGo1somSGPHYIU";

let sistemaCache = { token: null, expira: 0 };

async function entrarUsuarioSistema(env) {
  const agora = Math.floor(Date.now() / 1000);
  if (sistemaCache.token && sistemaCache.expira > agora + 60) return sistemaCache.token;
  const email = env.FIREBASE_SYSTEM_EMAIL || "";
  const senha = env.FIREBASE_SYSTEM_PASS || "";
  if (!email || !senha) return "";
  try {
    const resposta = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_WEB_API_KEY || WEB_API_KEY_PADRAO}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!resposta.ok) return "";
    const dados = await resposta.json();
    if (!dados.idToken) return "";
    sistemaCache = { token: dados.idToken, expira: agora + Math.min(Number(dados.expiresIn || 3600), 3300) };
    return sistemaCache.token;
  } catch {
    return "";
  }
}

async function lerAnonimo(env, caminho) {
  try {
    const resposta = await fetch(`${dbDe(env)}/${caminho}.json`, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

async function lerPagamentosComoSistema(env) {
  const idSistema = await entrarUsuarioSistema(env);
  if (!idSistema) return null;
  try {
    const resposta = await fetch(`${dbDe(env)}/configuracoes/pagamentos.json?auth=${idSistema}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

// Token do Mercado Pago: variável de ambiente OU o salvo na aba Pagamentos do painel admin
// (lido com chave de serviço, usuário de sistema ou, em último caso, leitura anônima).
export async function tokenMercadoPago(env) {
  if (env.MP_ACCESS_TOKEN) return env.MP_ACCESS_TOKEN;
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const pagamentos = await lerComoAdmin(env, "configuracoes/pagamentos");
    if (pagamentos && pagamentos.mercadoPagoAccessToken) return String(pagamentos.mercadoPagoAccessToken);
  }
  const doSistema = await lerPagamentosComoSistema(env);
  if (doSistema && doSistema.mercadoPagoAccessToken) return String(doSistema.mercadoPagoAccessToken);
  const publico = await lerAnonimo(env, "configuracoes/pagamentos");
  if (publico && publico.mercadoPagoAccessToken) return String(publico.mercadoPagoAccessToken);
  return "";
}

// Diagnóstico (usado pelo painel admin): de onde o servidor consegue ler o token.
// Nunca devolve o token em si, só a origem.
export async function fonteDoTokenMercadoPago(env) {
  if (env.MP_ACCESS_TOKEN) return { encontrado: true, fonte: "variavel-de-ambiente" };
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const pagamentos = await lerComoAdmin(env, "configuracoes/pagamentos");
    if (pagamentos && pagamentos.mercadoPagoAccessToken) return { encontrado: true, fonte: "chave-de-servico" };
  }
  const doSistema = await lerPagamentosComoSistema(env);
  if (doSistema && doSistema.mercadoPagoAccessToken) return { encontrado: true, fonte: "usuario-de-sistema" };
  const publico = await lerAnonimo(env, "configuracoes/pagamentos");
  if (publico && publico.mercadoPagoAccessToken) return { encontrado: true, fonte: "leitura-anonima" };
  return { encontrado: false, fonte: "" };
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
