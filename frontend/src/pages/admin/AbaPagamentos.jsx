// src/pages/admin/AbaPagamentos.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref, set } from "firebase/database";
import { toast } from "sonner";
import { FiSave, FiInfo, FiLink2, FiCheckCircle, FiAlertTriangle, FiXCircle } from "react-icons/fi";
import apiBase from "../../lib/apiBase";

const ROTULO_FONTE = {
  "variavel-de-ambiente": "variável MP_ACCESS_TOKEN",
  "chave-de-servico": "chave de serviço (FIREBASE_SERVICE_ACCOUNT)",
  "usuario-de-sistema": "usuário de sistema (FIREBASE_SYSTEM_EMAIL/PASS)",
  "leitura-anonima": "leitura anônima",
};

const FORM_VAZIO = () => ({
  infinitepayHandle: "",
  infinitepayWebhookUrl: "",
  infinitepayWebhookN8n: "",
  mercadoPagoAccessToken: "",
  mercadoPagoPublicKey: "",
});

export default function AbaPagamentos({ config }) {
  const [form, setForm] = useState({
    infinitepayHandle: config.pagamentos.infinitepayHandle || "",
    infinitepayWebhookUrl: config.pagamentos.infinitepayWebhookUrl || "",
    infinitepayWebhookN8n: config.pagamentos.infinitepayWebhookN8n || "",
    mercadoPagoAccessToken: config.pagamentos.mercadoPagoAccessToken || "",
    mercadoPagoPublicKey: config.pagamentos.mercadoPagoPublicKey || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [testeToken, setTesteToken] = useState(null);
  const [testando, setTestando] = useState(false);
  const [statusServidor, setStatusServidor] = useState(null);

  // Diagnóstico: o servidor consegue ler o token do Mercado Pago salvo aqui no Firebase?
  useEffect(() => {
    let ativo = true;
    fetch(`${apiBase}/api/mercadopago/status-servidor`)
      .then((r) => r.json())
      .then((d) => { if (ativo) setStatusServidor(d || { encontrado: false }); })
      .catch(() => { if (ativo) setStatusServidor({ encontrado: false, erro: true }); });
    return () => { ativo = false; };
  }, []);

  const testarToken = async () => {
    setTestando(true);
    setTesteToken(null);
    try {
      const resposta = await fetch(`${apiBase}/api/mercadopago/validar-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: form.mercadoPagoAccessToken }),
      });
      const dados = await resposta.json();
      setTesteToken(dados || { valida: false, erro: "Resposta vazia do servidor." });
    } catch (e) {
      setTesteToken({ valida: false, erro: "Falha de conexão. Tente novamente." });
    }
    setTestando(false);
  };

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await set(ref(db, "configuracoes/pagamentos"), form);
      toast.success("Credenciais de pagamento salvas no banco!");
    } catch (erro) {
      const motivo = (erro && (erro.code || erro.message)) || "erro desconhecido";
      if (String(motivo).includes("permission")) {
        toast.error("O Firebase recusou a escrita (permission denied). Aplique as regras do README-DEPLOY (seção 3) com uma conta logada.");
      } else {
        toast.error(`Falha ao salvar: ${motivo}`);
      }
    } finally {
      setSalvando(false);
    }
  };

  const campoClasse =
    "w-full px-4 py-2.5 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso font-mono";

  return (
    <div data-testid="admin-aba-pagamentos">
      <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg">
        <h2 className="font-display text-xl font-bold text-espresso">Credenciais de pagamento</h2>
        <p className="text-[11px] text-espresso/50 mt-2">
          Preencha e atualize quando quiser — tudo é salvo no banco e o site passa a usar imediatamente.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-creme/50 border border-pessego/20 rounded-2xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-espresso/60">InfinitePay — Pix</h3>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Sua @handle (sem o $)</label>
              <input
                value={form.infinitepayHandle}
                onChange={(e) => set("infinitepayHandle", e.target.value)}
                className={campoClasse}
                placeholder="ex: minhaloja"
                data-testid="admin-pagamentos-infinitepay-handle"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50 flex items-center gap-1.5">
                <FiLink2 className="text-gold" size={11} /> Webhook de pagamento (InfinitePay → ActivePieces)
              </label>
              <input
                value={form.infinitepayWebhookUrl}
                onChange={(e) => set("infinitepayWebhookUrl", e.target.value)}
                className={campoClasse}
                placeholder="https://cloud.activepieces.com/api/v1/webhooks/..."
                data-testid="admin-pagamentos-infinitepay-webhook-url"
              />
              <p className="text-[10px] text-espresso/40">
                A URL que a InfinitePay avisa quando o pagamento cai (seu fluxo do ActivePieces). O site envia esta URL
                automaticamente em cada checkout criado (campo webhook_url) — não precisa cadastrar em outro lugar.
                Vale para os checkouts gerados depois de salvar.
              </p>
            </div>
            <div className="flex gap-2 bg-gold/10 border border-gold/30 rounded-xl p-3" data-testid="admin-pagamentos-aviso-pix">
              <FiInfo className="text-gold shrink-0 mt-0.5" size={13} />
              <p className="text-[10px] text-espresso/70 leading-relaxed">
                <strong>Somente Pix:</strong> as formas de pagamento do checkout são definidas na sua conta InfinitePay
                (a API não permite escolher por pedido). No App InfinitePay: <strong>Vendas › Checkout › Configurações ›
                Meios de Pagamento</strong> → desative <strong>Cartão de crédito</strong> e deixe só o Pix.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Webhook para CRIAR o link (n8n — opcional)</label>
              <input
                value={form.infinitepayWebhookN8n}
                onChange={(e) => set("infinitepayWebhookN8n", e.target.value)}
                className={campoClasse}
                placeholder="https://...app.n8n.cloud/webhook/checkout"
                data-testid="admin-pagamentos-infinitepay-webhook"
              />
              <p className="text-[10px] text-espresso/40">
                Diferente do campo de cima: este é chamado NA HORA da compra para gerar o link de checkout. Se vazio,
                o site chama a InfinitePay direto. Deixe vazio se você usa ActivePieces apenas para o aviso de pagamento.
              </p>
            </div>
          </div>

          <div className="bg-creme/50 border border-pessego/20 rounded-2xl p-5 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-espresso/60">Mercado Pago — Cartão</h3>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Access Token (o único campo necessário)</label>
              <input
                type="password"
                value={form.mercadoPagoAccessToken}
                onChange={(e) => set("mercadoPagoAccessToken", e.target.value)}
                className={campoClasse}
                placeholder="APP_USR-..."
                data-testid="admin-pagamentos-mp-token"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Public Key (opcional)</label>
              <input
                value={form.mercadoPagoPublicKey}
                onChange={(e) => set("mercadoPagoPublicKey", e.target.value)}
                className={campoClasse}
                placeholder="APP_USR-..."
                data-testid="admin-pagamentos-mp-publickey"
              />
            </div>
            <button
              onClick={testarToken}
              disabled={testando || !form.mercadoPagoAccessToken.trim()}
              className="w-full flex items-center justify-center gap-2 bg-espresso hover:bg-ink disabled:bg-espresso/20 disabled:cursor-not-allowed text-creme py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
              data-testid="admin-pagamentos-mp-testar"
            >
              {testando ? "Testando..." : "Testar credenciais"}
            </button>
            {testeToken && (
              <div
                data-testid="admin-pagamentos-mp-resultado-teste"
                className={`flex items-start gap-2 rounded-xl p-3 border ${
                  testeToken.valida && testeToken.tipo === "producao"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : testeToken.valida
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {testeToken.valida && testeToken.tipo === "producao" && <FiCheckCircle className="shrink-0 mt-0.5" size={13} />}
                {testeToken.valida && testeToken.tipo === "teste" && <FiAlertTriangle className="shrink-0 mt-0.5" size={13} />}
                {!testeToken.valida && <FiXCircle className="shrink-0 mt-0.5" size={13} />}
                <p className="text-[10px] leading-relaxed">
                  {testeToken.valida && testeToken.tipo === "producao" &&
                    `Token de PRODUÇÃO válido — conta ${testeToken.conta}. Pronto para vender de verdade.`}
                  {testeToken.valida && testeToken.tipo === "teste" &&
                    `Token de TESTE válido (${testeToken.conta}) — só aceita usuários e cartões de teste do Mercado Pago. Para vender de verdade, troque pelo token de produção (APP_USR-...) em developers.mercadopago.com › Credenciais › aba Produção.`}
                  {!testeToken.valida && testeToken.erro}
                </p>
              </div>
            )}
            <div
              data-testid="admin-pagamentos-mp-status-servidor"
              className={`flex items-start gap-2 rounded-xl p-3 border ${
                statusServidor && statusServidor.encontrado
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}
            >
              {statusServidor && statusServidor.encontrado ? (
                <FiCheckCircle className="shrink-0 mt-0.5" size={13} />
              ) : (
                <FiAlertTriangle className="shrink-0 mt-0.5" size={13} />
              )}
              <p className="text-[10px] leading-relaxed">
                {statusServidor === null
                  ? "Verificando se o servidor consegue ler o token salvo..."
                  : statusServidor.encontrado
                  ? `O servidor consegue ler o token salvo (fonte: ${ROTULO_FONTE[statusServidor.fonte] || statusServidor.fonte}). O pagamento com cartão pode funcionar.`
                  : statusServidor.erro
                  ? "Não foi possível consultar o servidor agora."
                  : "O servidor NÃO consegue ler o token salvo aqui — por isso o cartão falha mesmo com o token preenchido. No Cloudflare › Settings › Variables and Secrets, cadastre FIREBASE_SERVICE_ACCOUNT (JSON da chave de serviço) OU FIREBASE_SYSTEM_EMAIL + FIREBASE_SYSTEM_PASS (o mesmo usuário de sistema do fluxo ActivePieces) e publique de novo. Veja o passo a passo no README-DEPLOY, seção 5."}
              </p>
            </div>
            <div className="flex items-start gap-2 bg-gold/10 border border-gold/30 rounded-xl p-3">
              <FiInfo className="text-gold shrink-0 mt-0.5" size={13} />
              <p className="text-[10px] text-espresso/70 leading-relaxed">
                No checkout com cartão só o <strong>Access Token</strong> é usado — a Public Key fica opcional aqui.
                O token pode ser de <strong>qualquer conta</strong> (mesmo de outra pessoa): o dinheiro cai na conta
                dona do token. Use o de <strong>produção (APP_USR-...)</strong> para vender de verdade; o de teste
                (TEST-...) só aceita cartões de teste. Obtenha em developers.mercadopago.com › Sua aplicação ›
                Credenciais.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={salvar}
          disabled={salvando}
          className="mt-8 w-full md:w-auto flex items-center justify-center gap-2 bg-espresso hover:bg-ink text-creme px-8 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-md transition-all"
          data-testid="admin-pagamentos-salvar-botao"
        >
          <FiSave size={13} /> {salvando ? "Salvando..." : "Salvar Credenciais"}
        </button>
      </div>
    </div>
  );
}
