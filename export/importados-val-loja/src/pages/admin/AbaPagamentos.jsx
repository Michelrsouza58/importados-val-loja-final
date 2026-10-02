// src/pages/admin/AbaPagamentos.jsx
import React, { useState } from "react";
import { db } from "../../lib/firebase";
import { ref, set as setFirebase } from "firebase/database"; // 1. Renomeado a importação para evitar conflito
import { toast } from "sonner";
import { FiSave, FiInfo, FiLink2 } from "react-icons/fi";

export default function AbaPagamentos({ config }) {
  const [form, setForm] = useState({
    infinitepayHandle: config?.pagamentos?.infinitepayHandle || "",
    infinitepayWebhookUrl: config?.pagamentos?.infinitepayWebhookUrl || "",
    infinitepayWebhookN8n: config?.pagamentos?.infinitepayWebhookN8n || "",
    mercadoPagoAccessToken: config?.pagamentos?.mercadoPagoAccessToken || "",
    mercadoPagoPublicKey: config?.pagamentos?.mercadoPagoPublicKey || "",
  });
  const [salvando, setSalvando] = useState(false);

  // 2. Renomeado a função do state para atualizarCampo
  const atualizarCampo = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    setSalvando(true);
    try {
      // 3. Agora chama a função de escrita do Firebase do jeito certo
      await setFirebase(ref(db, "configuracoes/pagamentos"), form);
      toast.success("Credenciais de pagamento salvas no banco!");
    } catch (erro) {
      const motivo = (erro && (erro.code || erro.message)) || "erro desconhecido";
      if (String(motivo).includes("permission")) {
        toast.error("O Firebase recusou a escrita (permission denied). Aplique as regras do README-DEPLOY com uma conta logada.");
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
                onChange={(e) => atualizarCampo("infinitepayHandle", e.target.value)}
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
                onChange={(e) => atualizarCampo("infinitepayWebhookUrl", e.target.value)}
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
                onChange={(e) => atualizarCampo("infinitepayWebhookN8n", e.target.value)}
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Access Token (produção ou teste)</label>
              <input
                type="password"
                value={form.mercadoPagoAccessToken}
                onChange={(e) => atualizarCampo("mercadoPagoAccessToken", e.target.value)}
                className={campoClasse}
                placeholder="APP_USR-..."
                data-testid="admin-pagamentos-mp-token"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Public Key (opcional)</label>
              <input
                value={form.mercadoPagoPublicKey}
                onChange={(e) => atualizarCampo("mercadoPagoPublicKey", e.target.value)}
                className={campoClasse}
                placeholder="APP_USR-..."
                data-testid="admin-pagamentos-mp-publickey"
              />
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <FiInfo className="text-amber-700 shrink-0 mt-0.5" size={13} />
              <p className="text-[10px] text-amber-800 leading-relaxed">
                Obtenha em developers.mercadopago.com &gt; Sua aplicação &gt; Credenciais.
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
