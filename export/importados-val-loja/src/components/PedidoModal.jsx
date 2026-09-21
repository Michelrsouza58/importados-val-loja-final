// src/components/PedidoModal.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { brl } from "../lib/formato";
import { FiX, FiTag, FiChevronRight, FiStar } from "react-icons/fi";

export default function PedidoModal({ pedido, tipo, produtos, onFechar, aoAbrirProduto }) {
  if (!pedido) return null;

  const numero =
    tipo === "pedidos"
      ? pedido.NumeroPedido || `#${pedido.FirebaseKey}`
      : pedido.CodigoVisual || `ENC-${pedido.FirebaseKey.substring(0, 7).toUpperCase()}`;

  const status = pedido.Status || "Aguardando Pagamento";
  const cancelado = status === "Cancelado";
  const aguardando = status === "Aguardando Pagamento";

  const statusClasse = cancelado
    ? "bg-rose/5 border-rose/20 text-rose"
    : aguardando
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700";

  const encontrarProduto = (item) =>
    produtos.find((p) => p.Id === item.Id || p.FirebaseKey === item.Id) || null;

  const abrirProduto = (item) => {
    const produto = encontrarProduto(item);
    if (produto) {
      aoAbrirProduto(produto);
    } else {
      toast.info("Este produto não está mais no catálogo.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-espresso/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        onClick={onFechar}
        data-testid="pedido-modal-fundo"
      >
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-pessego/20 overflow-hidden max-h-[92vh] my-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
          data-testid="pedido-modal-conteudo"
        >
          <div className="p-5 md:p-6 border-b border-espresso/5 bg-creme/60 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-espresso/40">Detalhes do pedido</p>
              <h2 className="font-display text-2xl font-bold text-espresso font-mono mt-1" data-testid="pedido-modal-numero">
                {numero}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase border ${statusClasse}`} data-testid="pedido-modal-status">
                {status}
              </span>
              <button onClick={onFechar} className="p-2 rounded-full hover:bg-white text-espresso" aria-label="Fechar detalhes" data-testid="pedido-modal-fechar">
                <FiX size={18} />
              </button>
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-creme/60 rounded-xl px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-espresso/40 mb-1">Cliente</p>
                <p className="text-espresso font-semibold truncate" data-testid="pedido-modal-cliente">{pedido.UsuarioEmail || "—"}</p>
              </div>
              <div className="bg-creme/60 rounded-xl px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-espresso/40 mb-1">Pagamento</p>
                <p className="text-espresso font-semibold" data-testid="pedido-modal-metodo">{pedido.MetodoPagamento || "—"}</p>
              </div>
              <div className="bg-creme/60 rounded-xl px-4 py-3 col-span-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-espresso/40 mb-1">Data</p>
                <p className="text-espresso font-semibold" data-testid="pedido-modal-data">
                  {pedido.DataPedido || pedido.DataEncomenda || "—"} {pedido.HoraPedido || pedido.HoraEncomenda || ""}
                </p>
              </div>
            </div>

            {pedido.Cupom && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5" data-testid="pedido-modal-cupom">
                <FiTag className="text-emerald-700" size={13} />
                <p className="text-[11px] text-emerald-800 font-semibold">
                  Cupom {pedido.Cupom} · desconto de {brl(pedido.ValorCupom || 0)}
                </p>
              </div>
            )}

            {Number(pedido.SemJuros) > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5" data-testid="pedido-modal-semjuros">
                <FiStar className="text-amber-600 shrink-0" size={13} />
                <p className="text-[11px] text-amber-800 font-semibold">
                  Condição especial da Val: pague em até {pedido.SemJuros}x sem juros!
                </p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-espresso/40 mb-2">
                Itens — toque no produto para ver os detalhes
              </p>
              <div className="space-y-2">
                {(pedido.Itens || []).map((item, idx) => {
                  const produto = produtos.find((p) => p.Id === item.Id || p.FirebaseKey === item.Id) || null;
                  const foto = produto ? produto.FotoUrl : "";
                  return (
                    <button
                      key={idx}
                      onClick={() => abrirProduto(item)}
                      className="w-full flex items-center gap-3 bg-creme/50 hover:bg-creme border border-espresso/5 hover:border-pessego/40 rounded-2xl p-3 text-left transition-all group"
                      data-testid={`pedido-modal-item-${idx}`}
                    >
                      <div className="w-12 h-14 rounded-xl overflow-hidden bg-creme border border-espresso/5 shrink-0">
                        {foto ? (
                          <img src={foto} alt={item.Nome} className="w-full h-full object-cover" />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-[8px] uppercase tracking-widest text-espresso/25">Sem foto</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-espresso uppercase tracking-wide truncate group-hover:text-rose transition-colors" data-testid={`pedido-modal-item-nome-${idx}`}>
                          {item.Nome}
                          {item.Variante ? <span className="text-rose"> · {item.Variante}</span> : ""}
                        </p>
                        <p className="text-[10px] text-espresso/40 mt-0.5 font-mono">
                          {item.Quantidade}x {brl(item.PrecoReal)}
                          {item.SobreEncomenda ? " · sob encomenda" : ""}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-espresso/60 shrink-0">
                        {brl(Number(item.PrecoReal) * Number(item.Quantidade || 1))}
                      </span>
                      {produto && <FiChevronRight className="text-espresso/30 shrink-0" size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-espresso/5">
              <span className="text-xs font-bold uppercase tracking-widest text-espresso/50">Total do pedido</span>
              <span className="text-xl font-display font-black text-rose" data-testid="pedido-modal-total">{brl(pedido.ValorTotal || 0)}</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
