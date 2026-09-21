// Cloudflare Pages Function
// POST /api/infinitepay/payment-check — consulta o status do pagamento na InfinitePay.
// G4: o handle vem do servidor (env), nunca do navegador.
// Env: INFINITEPAY_HANDLE (ex: michelrsouza)

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const limpar = (v, limite = 64) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, limite);

export const onRequestPost = async ({ request, env }) => {
  const handle = limpar(env.INFINITEPAY_HANDLE, 40);
  if (!handle) return json({ paid: false, erro: "INFINITEPAY_HANDLE não configurado no Cloudflare." });

  try {
    const corpo = await request.json();
    const orderNsu = limpar(corpo.orderNsu);
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
};
