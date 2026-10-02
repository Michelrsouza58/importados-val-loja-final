// Código para o passo "Code by ActivePieces" — CRIAR o pagamento com cartão (Mercado Pago).
// É o caminho para quem NÃO pode cadastrar variáveis/secrets no Cloudflare:
// o site envia a sacola para o fluxo, o fluxo lê o Access Token do Mercado Pago
// salvo na aba Pagamentos do painel (Firebase) e devolve o link de pagamento pronto.
//
// Montagem (passo a passo completo em activepieces-fluxo.md, seção "Cartão sem secrets"):
//   1. Trigger — Webhook: copie a URL do fluxo e cole em Admin › Pagamentos ›
//      "Webhook para CRIAR o pagamento com cartão".
//   2. Passo — Code by ActivePieces: cole este código e crie o input `body`
//      mapeado com o corpo do webhook (a sacola enviada pelo site).
//   3. EMAIL/SENHA: o MESMO usuário de sistema do fluxo do Pix.

export const code = async (inputs) => {
  const dados = inputs.body || inputs;

  const AUTH_KEY = "AIzaSyAxBK6w5g_bP_HJv7N8JFGo1somSGPHYIU"; // chave web do Firebase (pública)
  const EMAIL = "webhook@sistema-importadosval.com"; // usuário criado no Authentication (o mesmo do fluxo do Pix)
  const SENHA = "TROQUE-ESTA-SENHA";
  const DB = "https://importadosval-bbcec-default-rtdb.firebaseio.com";

  const items = (Array.isArray(dados.items) ? dados.items : [])
    .filter((i) => i && i.title && Number(i.quantity) > 0 && Number(i.unit_price) > 0)
    .slice(0, 30)
    .map((i) => ({
      title: String(i.title).slice(0, 120),
      quantity: Math.min(50, Math.floor(Number(i.quantity))),
      currency_id: "BRL",
      unit_price: Math.round(Number(i.unit_price) * 100) / 100,
    }));
  if (items.length === 0) return { ok: false, motivo: "sacola vazia ou inválida" };

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

  // 2. Monta a preferência (Checkout Pro) com retorno para "Meus Pedidos"
  const origem = String(dados.origin || "").replace(/\/$/, "");
  const preferencia = { items, external_reference: String(dados.orderNsu || "").slice(0, 64) };
  if (origem) {
    preferencia.back_urls = {
      success: `${origem}/meus-pedidos`,
      failure: `${origem}/meus-pedidos`,
      pending: `${origem}/meus-pedidos`,
    };
    preferencia.auto_return = "approved";
  }
  if (dados.payerEmail) preferencia.payer = { email: String(dados.payerEmail).slice(0, 120) };

  // 3. Se existe fluxo de "pagamento aprovado", já embute a URL de aviso no link
  const respostaAviso = await fetch(`${DB}/configuracoes/pagamentos/mercadoPagoWebhookPago.json${auth}`);
  const urlAviso = String((await respostaAviso.json()) || "").trim();
  if (/^https:\/\//i.test(urlAviso)) preferencia.notification_url = urlAviso;

  const respostaMP = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(preferencia),
  });
  const mp = await respostaMP.json();
  if (!respostaMP.ok) {
    return { ok: false, motivo: "Mercado Pago recusou a preferência", detalhe: JSON.stringify(mp).slice(0, 200) };
  }
  const url = mp.init_point || mp.sandbox_init_point || "";
  if (!url) return { ok: false, motivo: "Mercado Pago não devolveu o link de pagamento." };

  return { ok: true, url, preferenceId: mp.id || "" };
};
