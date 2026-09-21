// Cloudflare Pages Function
// POST /api/emails/pedido — notifica as administradoras sobre novo pedido/encomenda.
//
// Credenciais (Cloudflare > Settings > Variables and Secrets):
//   EMERGENT_EMAIL_KEY — chave de e-mail do app (gerenciada pela plataforma Emergent)
//   EMAIL_FROM_NAME    — "Importados da Val"
//   ADMIN_EMAILS       — e-mails separados por vírgula (reserva, se o painel não responder)
//   FIREBASE_DB_URL    — ex: https://importadosval-bbcec-default-rtdb.firebaseio.com
//                        (lê a lista de admins do painel, se as regras permitirem)

const EMAIL_BASE_URL = "https://integrations.emergentagent.com";

const esc = (t) =>
  String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function lerAdmins(env) {
  const destinos = [];
  (env.ADMIN_EMAILS || "").split(/[,;\s]+/).forEach((parte) => {
    if (parte.includes("@")) destinos.push(parte.trim().toLowerCase());
  });
  if (env.FIREBASE_DB_URL) {
    try {
      const resposta = await fetch(`${env.FIREBASE_DB_URL.replace(/\/$/, "")}/configuracoes/admins.json`, { signal: AbortSignal.timeout(8000) });
      if (resposta.ok) {
        const dados = await resposta.json();
        if (Array.isArray(dados)) destinos.push(...dados.filter(Boolean).map((e) => String(e).toLowerCase()));
        else if (dados && typeof dados === "object") destinos.push(...Object.values(dados).filter(Boolean).map((e) => String(e).toLowerCase()));
      }
    } catch {}
  }
  return [...new Set(destinos.filter((d) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d)))].slice(0, 10);
}

export const onRequestPost = async ({ request, env }) => {
  try {
    if (!env.EMERGENT_EMAIL_KEY) return Response.json({ status: "indisponivel" });

    const corpo = await request.json();
    const destinos = await lerAdmins(env);
    if (destinos.length === 0) return Response.json({ status: "sem-destinatarios" });

    const numero = String(corpo.numero || "").replace(/[^A-Za-z0-9#-]/g, "").slice(0, 32) || "---";
    const encomenda = corpo.tipo === "encomenda";
    const assunto = encomenda ? `Nova encomenda — ${env.EMAIL_FROM_NAME || "Importados da Val"}` : `Novo pedido ${numero} — ${env.EMAIL_FROM_NAME || "Importados da Val"}`;

    const itens = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 30) : [];
    const linhas = itens
      .map((item) => {
        const nome = esc((item.Nome || "Item").slice(0, 80) + (item.Variante ? ` · ${item.Variante}` : ""));
        const obs = item.SobreEncomenda ? " <em>(sob encomenda)</em>" : "";
        const qtd = Math.min(99, Math.max(1, Math.floor(Number(item.Quantidade) || 1)));
        const preco = Math.max(0, Number(item.PrecoReal) || 0);
        return `<tr><td style='padding:6px 0;color:#2C1D1D'>${nome}${obs}</td><td style='padding:6px 0;text-align:right;color:#2C1D1D'>${qtd}x</td><td style='padding:6px 0;text-align:right;color:#2C1D1D'>R$ ${preco.toFixed(2)}</td></tr>`;
      })
      .join("");

    const marca = esc(env.EMAIL_FROM_NAME || "Importados da Val");
    const total = Math.max(0, Number(corpo.total) || 0);
    const cupom = String(corpo.cupom || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
    const cupomLinha = cupom ? `<p style='margin:4px 0;color:#2C1D1D'>Cupom aplicado: <strong>${esc(cupom)}</strong></p>` : "";

    const emailHtml =
      `<table role='presentation' width='100%' style='background:#FAF9F6;padding:24px'><tr><td>` +
      `<table role='presentation' width='100%' style='max-width:560px;background:#FFFFFF;border-radius:12px;padding:24px;font-family:Arial,sans-serif'>` +
      `<tr><td style='padding-bottom:12px'><h2 style='margin:0;color:#B76E79;font-size:18px'>${marca}</h2>` +
      `<p style='margin:4px 0 0;color:#6E5B5B;font-size:13px'>${encomenda ? "Nova encomenda registrada" : "Novo pedido registrado"} em ${esc(String(corpo.dataHora || "").slice(0, 40))}</p></td></tr>` +
      `<tr><td style='border-top:1px solid #eee;padding:12px 0'><p style='margin:4px 0;color:#2C1D1D'>Pedido: <strong>${esc(numero)}</strong></p>` +
      `<p style='margin:4px 0;color:#2C1D1D'>Cliente: ${esc(String(corpo.clienteEmail || "").slice(0, 80))}</p>${cupomLinha}</td></tr>` +
      `<tr><td style='border-top:1px solid #eee'><table role='presentation' width='100%'>${linhas}` +
      `<tr><td style='padding-top:10px;color:#2C1D1D'><strong>Total</strong></td><td style='padding-top:10px;text-align:right;color:#B76E79'><strong>R$ ${total.toFixed(2)}</strong></td></tr>` +
      `</table></td></tr>` +
      `<tr><td style='border-top:1px solid #eee;padding-top:12px'><p style='margin:0;font-size:12px;color:#888'>Enviado por ${marca}. Nunca pedimos senha ou dados de cartão por e-mail.</p></td></tr>` +
      `</table></td></tr></table>`;

    const resultados = {};
    for (const destino of destinos) {
      try {
        const resposta = await fetch(`${EMAIL_BASE_URL}/api/v1/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Email-Key": env.EMERGENT_EMAIL_KEY },
          body: JSON.stringify({ to: [destino], subject: assunto, html: emailHtml, from_name: env.EMAIL_FROM_NAME || "Importados da Val" }),
          signal: AbortSignal.timeout(20000),
        });
        resultados[destino] = resposta.ok ? "ok" : `falha: ${resposta.status}`;
      } catch (erro) {
        resultados[destino] = "falha";
      }
    }
    return Response.json({ status: "processado", assunto, resultados });
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
};
