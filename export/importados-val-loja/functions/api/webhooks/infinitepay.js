// Cloudflare Pages Function
// POST /api/webhooks/infinitepay — webhook oficial da InfinitePay.
// Confere o pagamento, localiza o pedido certo no Realtime Database e marca como Pago.
//
// Secrets (Cloudflare > Settings > Variables and Secrets, tipo Encrypt):
//   INFINITEPAY_HANDLE       — sua @handle (ex: michelrsouza)
//   FIREBASE_SERVICE_ACCOUNT — conteúdo inteiro do JSON da chave de serviço
//                              (Firebase Console > Project Settings > Service accounts
//                              > Generate new private key) — pode ser o JSON cru ou em base64
//
// URL para cadastrar no app da InfinitePay:
//   https://SEU-SITE.pages.dev/api/webhooks/infinitepay

const DB_PADRAO = "https://importadosval-bbcec-default-rtdb.firebaseio.com";

let tokenCache = { token: null, expira: 0 };

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function base64UrlDoJson(objeto) {
  return b64url(new TextEncoder().encode(JSON.stringify(objeto)));
}

async function obterTokenDeAcesso(env) {
  const agora = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.expira > agora + 60) return tokenCache.token;

  const cru = env.FIREBASE_SERVICE_ACCOUNT || "";
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

async function pagamentoVerificado(env, corpo) {
  const handle = String(env.INFINITEPAY_HANDLE || "").replace(/^\$/, "");
  const orderNsu = String(corpo.order_nsu || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (!handle || !orderNsu) return false;

  const payload = { handle, order_nsu: orderNsu };
  if (corpo.slug) payload.slug = String(corpo.slug).slice(0, 80);
  if (corpo.transaction_nsu) payload.transaction_nsu = String(corpo.transaction_nsu).slice(0, 80);

  try {
    const resposta = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(9000),
    });
    if (resposta.ok) {
      const dados = await resposta.json();
      if (dados.success === true) return dados.paid === true;
    }
  } catch (erro) {
    // segue para a verificação do próprio webhook
  }

  // Fallback: webhook autêntico da InfinitePay (server-to-server, com handle e valor)
  const handleBate = !corpo.handle || String(corpo.handle).replace(/^\$/, "") === handle;
  const pago = corpo.paid === true || corpo.status === "paid" || corpo.payment_status === "paid";
  const temValor = Number(corpo.paid_amount || corpo.amount || 0) > 0;
  return handleBate && pago && temValor;
}

export const onRequestPost = async ({ request, env, ctx }) => {
  if (!env.INFINITEPAY_HANDLE || !env.FIREBASE_SERVICE_ACCOUNT) {
    return Response.json({ success: false, error: "Webhook não configurado" }, { status: 200 });
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const orderNsu = String(corpo.order_nsu || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (!orderNsu) return Response.json({ error: "order_nsu não informado" }, { status: 400 });

  // Responde 200 rápido e processa em segundo plano (a InfinitePay exige resposta < 1s)
  ctx.waitUntil(
    (async () => {
      try {
        if (!(await pagamentoVerificado(env, corpo))) return;

        const token = await obterTokenDeAcesso(env);
        const db = env.FIREBASE_DB_URL || DB_PADRAO;
        const agora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date());
        const transacao = String(corpo.transaction_nsu || "").slice(0, 80);
        const slug = String(corpo.slug || "").slice(0, 80);

        const patch = (caminho) =>
          fetch(`${db}/${caminho}.json?access_token=${token}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              Status: "Pago",
              PagoEm: agora,
              "PagamentoInfinitePay/order_nsu": orderNsu,
              "PagamentoInfinitePay/transaction_nsu": transacao,
              "PagamentoInfinitePay/slug": slug,
            }),
          });

        // 1) Pedidos de pronta entrega (procura o pedido certo pelo NSU)
        const pedidos = await (await fetch(`${db}/pedidos.json?access_token=${token}`)).json();
        for (const [chave, pedido] of Object.entries(pedidos || {})) {
          if (!pedido || pedido.Status !== "Aguardando Pagamento") continue;
          const id = String(pedido.NumeroPedidoLimpo || (pedido.PagamentoInfinitePay && pedido.PagamentoInfinitePay.order_nsu) || chave).replace(/[^A-Za-z0-9_-]/g, "");
          if (id === orderNsu) await patch(`pedidos/${chave}`);
        }

        // 2) Encomendas (ficam por cliente: encomendas/{uid}/{lote})
        const encomendas = await (await fetch(`${db}/encomendas.json?access_token=${token}`)).json();
        for (const [uid, lotes] of Object.entries(encomendas || {})) {
          for (const [lote, encomenda] of Object.entries(lotes || {})) {
            if (!encomenda || encomenda.Status !== "Aguardando Pagamento") continue;
            const id = String((encomenda.PagamentoInfinitePay && encomenda.PagamentoInfinitePay.order_nsu) || lote).replace(/[^A-Za-z0-9_-]/g, "");
            if (id === orderNsu) await patch(`encomendas/${uid}/${lote}`);
          }
        }
      } catch (erro) {
        console.error("webhook infinitepay:", erro);
      }
    })()
  );

  return Response.json({ success: true }, { status: 200, headers: { "Content-Type": "application/json" } });
};
