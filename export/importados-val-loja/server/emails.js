// Serverless: e-mails (aviso às administradoras + comprovante à cliente)

import { adminsDoServidor } from "./util/firebase.js";

const EMAIL_BASE_URL = "https://integrations.emergentagent.com";

const esc = (t) =>
  String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function emailsPedido(request, env) {
  if (!env.EMERGENT_EMAIL_KEY) return Response.json({ status: "indisponivel" });

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  let destinos = [];
  try {
    destinos = await adminsDoServidor(env);
  } catch (erro) {
    destinos = [];
  }
  if (Array.isArray(corpo.admins)) {
    corpo.admins.slice(0, 10).forEach((e) => {
      const texto = String(e || "").trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto) && !destinos.includes(texto)) destinos.push(texto);
    });
    destinos = destinos.slice(0, 10);
  }
  if (destinos.length === 0) return Response.json({ status: "sem-destinatarios" });

  const numero = String(corpo.numero || "").replace(/[^A-Za-z0-9#-]/g, "").slice(0, 32) || "---";
  const encomenda = corpo.tipo === "encomenda";
  const marca = esc(env.EMAIL_FROM_NAME || "Importados da Val");
  const assunto = encomenda ? `Nova encomenda — ${env.EMAIL_FROM_NAME || "Importados da Val"}` : `Novo pedido ${esc(numero)} — ${env.EMAIL_FROM_NAME || "Importados da Val"}`;

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

  const total = Math.max(0, Number(corpo.total) || 0);
  const cupom = String(corpo.cupom || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  const cupomLinha = cupom ? `<p style='margin:4px 0;color:#2C1D1D'>Cupom aplicado: <strong>${esc(cupom)}</strong></p>` : "";

  const tabela = (subtitulo) =>
    `<table role='presentation' width='100%' style='background:#FAF9F6;padding:24px'><tr><td>` +
    `<table role='presentation' width='100%' style='max-width:560px;background:#FFFFFF;border-radius:12px;padding:24px;font-family:Arial,sans-serif'>` +
    `<tr><td style='padding-bottom:12px'><h2 style='margin:0;color:#B76E79;font-size:18px'>${marca}</h2>` +
    `<p style='margin:4px 0 0;color:#6E5B5B;font-size:13px'>${subtitulo}</p></td></tr>` +
    `<tr><td style='border-top:1px solid #eee;padding:12px 0'><p style='margin:4px 0;color:#2C1D1D'>Pedido: <strong>${esc(numero)}</strong></p>` +
    `<p style='margin:4px 0;color:#2C1D1D'>Cliente: ${esc(String(corpo.clienteEmail || "").slice(0, 80))}</p>${cupomLinha}</td></tr>` +
    `<tr><td style='border-top:1px solid #eee'><table role='presentation' width='100%'>${linhas}` +
    `<tr><td style='padding-top:10px;color:#2C1D1D'><strong>Total</strong></td><td style='padding-top:10px;text-align:right;color:#B76E79'><strong>R$ ${total.toFixed(2)}</strong></td></tr>` +
    `</table></td></tr>` +
    `<tr><td style='border-top:1px solid #eee;padding-top:12px'><p style='margin:0;font-size:12px;color:#888'>Enviado por ${marca}. Nunca pedimos senha ou dados de cartão por e-mail.</p></td></tr>` +
    `</table></td></tr></table>`;

  const enviar = async (para, assuntoEmail, htmlEmail) => {
    const resposta = await fetch(`${EMAIL_BASE_URL}/api/v1/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Email-Key": env.EMERGENT_EMAIL_KEY },
      body: JSON.stringify({ to: [para], subject: assuntoEmail, html: htmlEmail, from_name: env.EMAIL_FROM_NAME || "Importados da Val" }),
      signal: AbortSignal.timeout(20000),
    });
    return resposta.ok;
  };

  const resultados = {};
  for (const destino of destinos) {
    try {
      const ok = await enviar(destino, assunto, tabela(esc(`${encomenda ? "Nova encomenda registrada" : "Novo pedido registrado"} em ${String(corpo.dataHora || "").slice(0, 40)}`)));
      resultados[destino] = ok ? "ok" : "falha";
    } catch {
      resultados[destino] = "falha";
    }
  }

  const comprovantePara = [];
  const clienteEmail = String(corpo.clienteEmail || "").trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clienteEmail)) {
    const assuntoCliente = encomenda ? `Comprovante da encomenda — ${env.EMAIL_FROM_NAME || "Importados da Val"}` : `Comprovante do pedido ${esc(numero)} — ${env.EMAIL_FROM_NAME || "Importados da Val"}`;
    const saudacao = encomenda
      ? "Olá! Registramos sua encomenda e a Val fará a importação na próxima remessa. Obrigada pela confiança!"
      : "Olá! Recebemos seu pedido e já estamos cuidando de cada detalhe. Obrigada pela confiança!";
    try {
      const ok = await enviar(clienteEmail, assuntoCliente, tabela(esc(saudacao.slice(0, 120))));
      if (ok) comprovantePara.push(clienteEmail);
      else resultados[`cliente:${clienteEmail}`] = "falha";
    } catch {
      resultados[`cliente:${clienteEmail}`] = "falha";
    }
  }

  return Response.json({ status: "processado", assunto, resultados, comprovantePara });
}
