// Cloudflare Pages Function
// POST /api/mercadopago/confirmar-pagamento — verifica no servidor se o pagamento MP foi aprovado.
// Env: MP_ACCESS_TOKEN

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const limpar = (v, limite = 64) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, limite);

export const onRequestPost = async ({ request, env }) => {
  const token = env.MP_ACCESS_TOKEN || "";
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
};
