// Cloudflare Pages Function
// POST /api/mercadopago/create-preference
// Cria a preferência de pagamento do Mercado Pago (Checkout Pro) no servidor,
// para que o Access Token nunca fique exposto no navegador.
//
// Token resolvido nesta ordem:
//   1. env.MP_ACCESS_TOKEN (opcional)
//   2. o token salvo na aba Pagamentos do painel admin (lido com a chave de serviço)

import { tokenMercadoPago, DB_PADRAO } from "../../utils/firebase.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function tokenDoFirebaseAnonimo(env) {
  try {
    const resposta = await fetch(`${(env.FIREBASE_DB_URL || DB_PADRAO).replace(/\/$/, "")}/configuracoes/pagamentos.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return "";
    const dados = await resposta.json();
    return String((dados && dados.mercadoPagoAccessToken) || "");
  } catch {
    return "";
  }
}

export const onRequestPost = async ({ request, env }) => {
  try {
    const corpo = await request.json();
    const items = Array.isArray(corpo.items) ? corpo.items : [];
    if (items.length === 0 || items.length > 30) return json({ error: "Carrinho inválido." }, 400);

    for (const item of items) {
      if (!item.title || !(Number(item.quantity) > 0) || !(Number(item.unit_price) > 0)) {
        return json({ error: "Item inválido no carrinho." }, 400);
      }
    }

    let token = await tokenMercadoPago(env);
    if (!token) token = await tokenDoFirebaseAnonimo(env);
    if (!token) {
      return json(
        { error: "O Mercado Pago ainda não foi configurado. Salve o Access Token na aba Pagamentos do painel admin (ou na variável MP_ACCESS_TOKEN)." },
        400
      );
    }

    const origem = String(corpo.origin || "").replace(/\/$/, "");
    const preferencia = {
      items: items.slice(0, 30).map((item) => ({
        title: String(item.title).slice(0, 120),
        quantity: Math.min(50, Math.floor(Number(item.quantity))),
        currency_id: "BRL",
        unit_price: Math.round(Number(item.unit_price) * 100) / 100,
      })),
      external_reference: String(corpo.orderNsu || "").slice(0, 64),
    };
    if (origem) {
      preferencia.back_urls = {
        success: `${origem}/meus-pedidos`,
        failure: `${origem}/meus-pedidos`,
        pending: `${origem}/meus-pedidos`,
      };
      preferencia.auto_return = "approved";
    }
    if (corpo.payerEmail) preferencia.payer = { email: String(corpo.payerEmail).slice(0, 120) };

    const mpResposta = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(preferencia),
      signal: AbortSignal.timeout(15000),
    });

    if (!mpResposta.ok) {
      const detalhe = await mpResposta.text();
      return json({ error: `Mercado Pago recusou a preferência (${mpResposta.status}). Verifique o token. ${detalhe.slice(0, 200)}` }, 502);
    }

    const mp = await mpResposta.json();
    const initPoint = mp.init_point || mp.sandbox_init_point;
    if (!initPoint) return json({ error: "Mercado Pago não retornou o link de pagamento." }, 502);

    return json({ initPoint, preferenceId: mp.id || "" });
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
};
