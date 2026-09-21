// Código para o passo "Code by ActivePieces" no seu fluxo.
// Recebe o webhook da InfinitePay, autentica no Firebase com um usuário de sistema
// e marca o pedido/encomenda certo como Pago.
//
// Antes de usar:
//   1. Firebase Console > Authentication > Add user:
//        e-mail: webhook@sistema-importadosval.com  (pode ser o que quiser)
//        senha:  crie uma senha forte
//   2. Troque EMAIL e SENHA abaixo pelos dados desse usuário.
//   3. No passo Code do ActivePieces, mapeie o input "body" com o corpo do webhook.

export const code = async (inputs) => {
  const dados = inputs.body || inputs;
  const orderNsu = String(dados.order_nsu || "").replace(/[^A-Za-z0-9_-]/g, "");

  const AUTH_KEY = "AIzaSyAxBK6w5g_bP_HJv7N8JFGo1somSGPHYIU"; // chave web do Firebase (pública)
  const EMAIL = "webhook@sistema-importadosval.com"; // usuário criado no Authentication
  const SENHA = "TROQUE-ESTA-SENHA";
  const DB = "https://importadosval-bbcec-default-rtdb.firebaseio.com";

  if (!orderNsu) return { ok: false, motivo: "order_nsu ausente no webhook" };
  const pago =
    dados.paid === true ||
    dados.status === "paid" ||
    dados.payment_status === "paid" ||
    Number(dados.paid_amount || dados.amount || 0) > 0;
  if (!pago) return { ok: false, motivo: "webhook sem confirmação de pagamento" };

  // 1. Autentica (token válido por 1 hora)
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${AUTH_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA, returnSecureToken: true }),
  });
  const sessao = await login.json();
  if (!sessao.idToken) return { ok: false, motivo: "falha no login do Firebase", detalhe: sessao.error && sessao.error.message };
  const auth = `?auth=${sessao.idToken}`;

  const agora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date());
  const transacao = String(dados.transaction_nsu || "").slice(0, 80);
  let atualizados = 0;

  // 2. Pedidos de pronta entrega (consulta indexada por NumeroPedidoLimpo)
  const respostaPedidos = await fetch(`${DB}/pedidos.json?orderBy="NumeroPedidoLimpo"&equalTo="${orderNsu}"${auth}`);
  const pedidos = await respostaPedidos.json();
  for (const [chave, pedido] of Object.entries(pedidos || {})) {
    if (pedido && pedido.Status === "Aguardando Pagamento") {
      await fetch(`${DB}/pedidos/${chave}.json${auth}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Status: "Pago", PagoEm: agora, "PagamentoInfinitePay/transaction_nsu": transacao }),
      });
      atualizados++;
    }
  }

  // 3. Encomendas (ficam por cliente: encomendas/{uid}/{lote})
  const respostaEncomendas = await fetch(`${DB}/encomendas.json${auth}`);
  const encomendas = await respostaEncomendas.json();
  for (const [uid, lotes] of Object.entries(encomendas || {})) {
    for (const [lote, item] of Object.entries(lotes || {})) {
      const id = String((item && item.PagamentoInfinitePay && item.PagamentoInfinitePay.order_nsu) || lote).replace(/[^A-Za-z0-9_-]/g, "");
      if (id === orderNsu && item && item.Status === "Aguardando Pagamento") {
        await fetch(`${DB}/encomendas/${uid}/${lote}.json${auth}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Status: "Pago", PagoEm: agora, "PagamentoInfinitePay/transaction_nsu": transacao }),
        });
        atualizados++;
      }
    }
  }

  return { ok: true, atualizados, orderNsu };
};
