// Código para o passo "Code by ActivePieces" — marcar o pedido como Pago quando
// o Mercado Pago aprovar o pagamento com cartão (igual ao fluxo do Pix).
//
// Montagem (passo a passo completo em activepieces-fluxo.md, seção "Cartão sem secrets"):
//   1. Trigger — Webhook: copie a URL do fluxo e cole em Admin › Pagamentos ›
//      "Webhook de pagamento aprovado (Mercado Pago)". O link de pagamento criado
//      pelo outro fluxo já leva essa URL embutida automaticamente.
//   2. Passo — Code by ActivePieces: cole este código e crie o input `body`
//      mapeado com o corpo do webhook (a notificação do Mercado Pago).
//   3. EMAIL/SENHA: o MESMO usuário de sistema do fluxo do Pix.
//
// No Mercado Pago (developers.mercadopago.com › Sua aplicação › Webhooks/Notificações),
// nada precisa ser cadastrado: a URL de aviso vai dentro de cada link criado
// (campo notification_url).

export const code = async (inputs) => {
  const dados = inputs.body || inputs;

  const AUTH_KEY = "AIzaSyAxBK6w5g_bP_HJv7N8JFGo1somSGPHYIU"; // chave web do Firebase (pública)
  const EMAIL = "webhook@sistema-importadosval.com"; // usuário criado no Authentication (o mesmo do fluxo do Pix)
  const SENHA = "TROQUE-ESTA-SENHA";
  const DB = "https://importadosval-bbcec-default-rtdb.firebaseio.com";

  const paymentId = String((dados.data && dados.data.id) || dados.id || "").replace(/[^0-9]/g, "");
  if (!paymentId) return { ok: false, motivo: "notificação sem id de pagamento" };

  // 1. Autentica no Firebase com o usuário de sistema e lê o token do Mercado Pago
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${AUTH_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA, returnSecureToken: true }),
  });
  const sessao = await login.json();
  if (!sessao.idToken) return { ok: false, motivo: "falha no login do Firebase", detalhe: sessao.error && sessao.error.message };
  const auth = `?auth=${sessao.idToken}`;

  const respostaToken = await fetch(`${DB}/configuracoes/pagamentos/mercadoPagoAccessToken.json${auth}`);
  const token = String((await respostaToken.json()) || "").trim();
  if (!token) return { ok: false, motivo: "Mercado Pago sem Access Token — salve na aba Pagamentos do painel." };

  // 2. Confere o pagamento direto com o Mercado Pago
  const respostaPagamento = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respostaPagamento.ok) return { ok: false, motivo: `Mercado Pago recusou a consulta (${respostaPagamento.status})` };
  const pagamento = await respostaPagamento.json();
  if (String(pagamento.status || "") !== "approved") {
    return { ok: false, motivo: `pagamento ainda não aprovado (${pagamento.status || "sem status"})` };
  }
  const referencia = String(pagamento.external_reference || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!referencia) return { ok: false, motivo: "pagamento sem external_reference" };

  const agora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date());
  let atualizados = 0;

  // 3. Pedidos de pronta entrega (consulta indexada por NumeroPedidoLimpo)
  const respostaPedidos = await fetch(`${DB}/pedidos.json?orderBy="NumeroPedidoLimpo"&equalTo="${referencia}"${auth}`);
  const pedidos = await respostaPedidos.json();
  for (const [chave, pedido] of Object.entries(pedidos || {})) {
    if (pedido && pedido.Status === "Aguardando Pagamento") {
      await fetch(`${DB}/pedidos/${chave}.json${auth}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Status: "Pago", PagoEm: agora, "PagamentoMercadoPago/payment_id": paymentId }),
      });
      atualizados++;
    }
  }

  // 4. Encomendas (ficam por cliente: encomendas/{uid}/{lote})
  const respostaEncomendas = await fetch(`${DB}/encomendas.json${auth}`);
  const encomendas = await respostaEncomendas.json();
  for (const [uid, lotes] of Object.entries(encomendas || {})) {
    for (const [lote, item] of Object.entries(lotes || {})) {
      const id = String((item && item.PagamentoMercadoPago && item.PagamentoMercadoPago.orderNsu) || "").replace(/[^A-Za-z0-9_-]/g, "");
      if (id === referencia && item && item.Status === "Aguardando Pagamento") {
        await fetch(`${DB}/encomendas/${uid}/${lote}.json${auth}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Status: "Pago", PagoEm: agora, "PagamentoMercadoPago/payment_id": paymentId }),
        });
        atualizados++;
      }
    }
  }

  return { ok: true, atualizados, referencia };
};
