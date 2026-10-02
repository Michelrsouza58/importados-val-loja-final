// Serverless: Mercado Pago (Checkout Pro + confirmação de pagamento)

import { tokenMercadoPago, fonteDoTokenMercadoPago, DB_PADRAO } from "./util/firebase.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const limpar = (v, limite = 64) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, limite);

export async function criarPreferencia(request, env) {
  try {
    const corpo = await request.json();
    const items = Array.isArray(corpo.items) ? corpo.items : [];
    if (items.length === 0 || items.length > 30) return json({ error: "Carrinho inválido." }, 400);

    for (const item of items) {
      if (!item.title || !(Number(item.quantity) > 0) || !(Number(item.unit_price) > 0)) {
        return json({ error: "Item inválido no carrinho." }, 400);
      }
    }

    // tokenMercadoPago já tenta: variável de ambiente → chave de serviço → usuário de sistema → leitura anônima
    const token = await tokenMercadoPago(env);
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
}

export async function confirmarPagamento(request, env) {
  let token;
  try {
    token = await tokenMercadoPago(env);
  } catch {
    token = "";
  }
  if (!token) return json({ verificado: false, motivo: "sem-token" });

  try {
    const corpo = await request.json();
    const paymentId = limpar(corpo.paymentId);
    if (!paymentId) return json({ verificado: false, motivo: "payment-id-invalido" });

    const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok) return json({ verificado: false, motivo: `mp-status-${resposta.status}` });

    const pagamento = await resposta.json();
    const statusMp = String(pagamento.status || "");
    const referencia = String(pagamento.external_reference || "");
    const orderNsu = limpar(corpo.orderNsu);
    const bateRef = !orderNsu || limpar(referencia) === orderNsu;
    return json({ verificado: statusMp === "approved" && bateRef, statusMp, referencia });
  } catch {
    return json({ verificado: false, motivo: "conexao" });
  }
}

// Testa um Access Token do Mercado Pago enviado pelo painel admin (nunca devolve o token).
// Diz se é válido, se é de produção ou de teste e de qual conta é.
export async function validarToken(request, env) {
  let corpo = {};
  try {
    corpo = await request.json();
  } catch {}
  const token = String(corpo.accessToken || "").trim();
  if (!token) return json({ valida: false, erro: "Preencha o Access Token antes de testar." });

  try {
    const resposta = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok) {
      const detalhe = await resposta.text();
      const motivo =
        resposta.status === 401 || resposta.status === 403
          ? "Token recusado pelo Mercado Pago. Copie novamente de developers.mercadopago.com › Sua aplicação › Credenciais."
          : `Mercado Pago respondeu ${resposta.status}. ${detalhe.slice(0, 140)}`;
      return json({ valida: false, erro: motivo });
    }
    const usuario = await resposta.json();
    return json({
      valida: true,
      tipo: token.startsWith("TEST-") ? "teste" : "producao",
      conta: String(usuario.email || usuario.nickname || "").slice(0, 80),
    });
  } catch {
    return json({ valida: false, erro: "Falha de conexão com o Mercado Pago. Tente novamente." });
  }
}

// Diagnóstico para o painel admin: o servidor consegue ler o token salvo no Firebase?
export async function statusServidor(request, env) {
  const resultado = await fonteDoTokenMercadoPago(env);
  return json(resultado);
}
