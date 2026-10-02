// Código para o passo "Code by ActivePieces" — o EQUIVALENTE do seu webhook do Pix,
// mas para o CARTÃO (Mercado Pago). A diferença: o Mercado Pago não envia o número
// do pedido no aviso — ele envia o ID do pagamento. Então o código consulta o
// Mercado Pago, confere se foi aprovado e aí marca o pedido como Pago do mesmo jeito.
//
// Montagem (passo a passo em activepieces-fluxo.md, seção "Cartão sem secrets"):
//   1. Trigger — Webhook: copie a URL do fluxo e cole em Admin › Pagamentos ›
//      "Webhook de pagamento aprovado (Mercado Pago)".
//   2. Passo — Code by ActivePieces: cole este código e crie o input `body`
//      mapeado com o corpo do webhook (a notificação do Mercado Pago).
//   3. EMAIL/SENHA: o MESMO usuário de sistema do seu fluxo do Pix.
//
// No Mercado Pago não precisa cadastrar notificação em lugar nenhum: a URL deste
// fluxo já vai embutida dentro de cada link de pagamento criado (notification_url).

export const code = async (inputs) => {
  const dados = inputs.body || inputs;
  const paymentId = String((dados.data && dados.data.id) || dados.id || "").replace(/[^0-9]/g, "");
  const AUTH_KEY = "AIzaSyAxBK6w5g_bP_HJv7N8JFGo1somSGPHYIU";
  const EMAIL = "webhook@sistema-importadosval.com";
  const SENHA = "TROQUE-ESTA-SENHA";
  const DB = "https://importadosval-bbcec-default-rtdb.firebaseio.com";

  if (!paymentId) return { ok: false, motivo: "notificação sem id de pagamento" };

  // 1. Autentica no Firebase (igual ao seu fluxo do Pix)
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${AUTH_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA, returnSecureToken: true }),
  });
  const sessao = await login.json();
  if (!sessao.idToken) return { ok: false, motivo: "Falha no login do Firebase", erro: sessao.error?.message };

  const auth = `?auth=${sessao.idToken}`;
  const agora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date());

  // 2. Lê o token do Mercado Pago salvo na aba Pagamentos do painel
  const resToken = await fetch(`${DB}/configuracoes/pagamentos/mercadoPagoAccessToken.json${auth}`);
  const token = String((await resToken.json()) || "").trim();
  if (!token) return { ok: false, motivo: "Mercado Pago sem Access Token — salve na aba Pagamentos do painel." };

  // 3. Consulta o pagamento direto no Mercado Pago
  const resPagamento = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resPagamento.ok) return { ok: false, motivo: `Mercado Pago recusou a consulta (${resPagamento.status})` };
  const pagamento = await resPagamento.json();
  if (String(pagamento.status || "") !== "approved") {
    return { ok: false, motivo: `pagamento ainda não aprovado (${pagamento.status || "sem status"})` };
  }
  const orderNsu = String(pagamento.external_reference || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!orderNsu) return { ok: false, motivo: "pagamento sem external_reference (número do pedido)" };

  // 4. Busca os pedidos no Firebase (igual ao seu fluxo do Pix)
  const resBusca = await fetch(`${DB}/pedidos.json${auth}`);
  const pedidos = await resBusca.json();
  if (!pedidos || (pedidos.error && typeof pedidos.error === "string")) {
    return { ok: false, motivo: "Erro na resposta do Firebase", erro: pedidos?.error };
  }
  let chaveAlvo = null;
  for (const [chave, pedido] of Object.entries(pedidos)) {
    if (chave === "error" || !pedido || typeof pedido !== "object") continue;
    const numLimpo = String(pedido.NumeroPedidoLimpo || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (numLimpo === orderNsu || Number(numLimpo) === Number(orderNsu)) {
      chaveAlvo = chave;
      break;
    }
  }

  // 5. Atualiza o pedido encontrado no Firebase Realtime Database
  if (chaveAlvo) {
    const patchRes = await fetch(`${DB}/pedidos/${chaveAlvo}.json${auth}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Status: "Pago",
        PagoEm: agora,
        "PagamentoMercadoPago/payment_id": paymentId,
      }),
    });
    const resultadoPatch = await patchRes.json();
    return {
      ok: true,
      mensagem: "Pedido atualizado com sucesso!",
      chaveAtualizada: chaveAlvo,
      orderNsu: orderNsu,
      respostaFirebase: resultadoPatch,
    };
  }

  // 6. Não achou pedido? Pode ser encomenda (encomendas/{cliente}/{lote})
  const resEncomendas = await fetch(`${DB}/encomendas.json${auth}`);
  const encomendas = await resEncomendas.json();
  for (const [uid, lotes] of Object.entries(encomendas || {})) {
    for (const [lote, item] of Object.entries(lotes || {})) {
      const id = String((item && item.PagamentoMercadoPago && item.PagamentoMercadoPago.orderNsu) || lote).replace(/[^A-Za-z0-9_-]/g, "");
      if ((id === orderNsu || Number(id) === Number(orderNsu)) && item && item.Status === "Aguardando Pagamento") {
        const patchRes = await fetch(`${DB}/encomendas/${uid}/${lote}.json${auth}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Status: "Pago",
            PagoEm: agora,
            "PagamentoMercadoPago/payment_id": paymentId,
          }),
        });
        await patchRes.json();
        return { ok: true, mensagem: "Encomenda atualizada com sucesso!", orderNsu: orderNsu };
      }
    }
  }

  return {
    ok: false,
    motivo: `Nenhum pedido com o número '${orderNsu}' foi encontrado na base.`,
  };
};
