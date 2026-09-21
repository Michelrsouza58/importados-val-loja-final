// Worker principal do Cloudflare.
// Este arquivo é o que destrava as variáveis e secrets: com um script no Worker,
// a área "Settings > Variables and Secrets" passa a aceitar cadastro.
//
// Rotas /api/* → funções serverless (pasta server/). Todo o resto → site (pasta dist/).

import { criarPreferencia, confirmarPagamento } from "./server/mercadopago.js";
import { paymentCheck, webhookInfinitepay } from "./server/infinitepay.js";
import { emailsPedido } from "./server/emails.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rota = url.pathname.replace(/\/+$/, "");

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (rota === "/api/health") return Response.json({ status: "ok" });
      if (rota === "/api/mercadopago/create-preference" && request.method === "POST")
        return await criarPreferencia(request, env);
      if (rota === "/api/mercadopago/confirmar-pagamento" && request.method === "POST")
        return await confirmarPagamento(request, env);
      if (rota === "/api/infinitepay/payment-check" && request.method === "POST")
        return await paymentCheck(request, env);
      if (rota === "/api/emails/pedido" && request.method === "POST")
        return await emailsPedido(request, env);
      if (rota === "/api/webhooks/infinitepay" && request.method === "POST")
        return await webhookInfinitepay(request, env, ctx);
      return Response.json({ error: "Rota não encontrada" }, { status: 404 });
    } catch (erro) {
      return Response.json({ error: "Erro interno no servidor" }, { status: 500 });
    }
  },
};
