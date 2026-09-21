// Serverless: InfinitePay (consulta de pagamento + webhook oficial)

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const limpar = (v, limite = 64) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, limite);

export async function paymentCheck(request, env) {
  try {
    const corpo = await request.json();
    const handle = limpar(env.INFINITEPAY_HANDLE, 40) || limpar(corpo.handle, 40);
    const orderNsu = limpar(corpo.orderNsu);
    if (!handle) return json({ paid: false, erro: "Informe o INFINITEPAY_HANDLE no Cloudflare ou no painel admin." });
    if (!orderNsu) return json({ paid: false, erro: "Pedido sem NSU." });

    const payload = { handle, order_nsu: orderNsu };
    const slug = limpar(corpo.slug);
    const transaction = limpar(corpo.transactionNsu);
    if (slug) payload.slug = slug;
    if (transaction) payload.transaction_nsu = transaction;

    const resposta = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!resposta.ok) return json({ paid: false, erro: "InfinitePay não encontrou esse pagamento ainda." });
    const dados = await resposta.json();
    return json({ paid: dados.success === true && dados.paid === true, captureMethod: dados.capture_method || "", resposta: dados });
  } catch {
    return json({ paid: false, erro: "Falha de conexão com a InfinitePay." });
  }
}

async function pagamentoVerificado(env, corpo) {
  const handle = String(env.INFINITEPAY_HANDLE || corpo.handle || "").replace(/^\$/, "");
  const orderNsu = limpar(corpo.order_nsu);
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
  } catch (erro) {}

  const handleBate = !corpo.handle || String(corpo.handle).replace(/^\$/, "") === handle;
  const pago = corpo.paid === true || corpo.status === "paid" || corpo.payment_status === "paid";
  const temValor = Number(corpo.paid_amount || corpo.amount || 0) > 0;
  return handleBate && pago && temValor;
}

export async function webhookInfinitepay(request, env, ctx) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ success: false, error: "Webhook não configurado: cadastre o secret FIREBASE_SERVICE_ACCOUNT (README-DEPLOY, seção 2)" });
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const orderNsu = limpar(corpo.order_nsu);
  if (!orderNsu) return json({ error: "order_nsu não informado" }, 400);

  const processar = async () => {
    try {
      if (!(await pagamentoVerificado(env, corpo))) return;

      const { obterTokenDeAcesso, dbDe } = await import("./util/firebase.js");
      const token = await obterTokenDeAcesso(env);
      const db = dbDe(env);
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

      const pedidos = await (await fetch(`${db}/pedidos.json?access_token=${token}`)).json();
      for (const [chave, pedido] of Object.entries(pedidos || {})) {
        if (!pedido || pedido.Status !== "Aguardando Pagamento") continue;
        const id = String(pedido.NumeroPedidoLimpo || (pedido.PagamentoInfinitePay && pedido.PagamentoInfinitePay.order_nsu) || chave).replace(/[^A-Za-z0-9_-]/g, "");
        if (id === orderNsu) await patch(`pedidos/${chave}`);
      }

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
  };

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(processar());
  } else {
    await processar();
  }

  return json({ success: true });
}
