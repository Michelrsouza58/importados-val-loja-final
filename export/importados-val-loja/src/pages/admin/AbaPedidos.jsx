// src/pages/admin/AbaPedidos.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, update } from "firebase/database";
import { toast } from "sonner";
import { brl } from "../../lib/formato";
import { FiShoppingBag, FiBox } from "react-icons/fi";

const STATUS = ["Aguardando Pagamento", "Pago", "Enviado", "Entregue", "Cancelado"];

export default function AbaPedidos() {
  const [aba, setAba] = useState("pedidos");
  const [pedidos, setPedidos] = useState([]);
  const [encomendas, setEncomendas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const pedidosRef = ref(db, "pedidos");
    const unsubPedidos = onValue(
      pedidosRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const lista = Object.entries(snapshot.val()).map(([key, valores]) => ({ FirebaseKey: key, ...valores }));
          lista.reverse();
          setPedidos(lista);
        } else setPedidos([]);
      },
      () => setPedidos([])
    );

    const encomendasRef = ref(db, "encomendas");
    const unsubEncomendas = onValue(
      encomendasRef,
      (snapshot) => {
        let lista = [];
        if (snapshot.exists()) {
          const dados = snapshot.val();
          lista = Object.entries(dados).flatMap(([uid, lotes]) =>
            Object.entries(lotes || {}).map(([key, valores]) => ({ FirebaseKey: key, UsuarioId: uid, ...valores }))
          );
          lista.reverse();
        }
        setEncomendas(lista);
        setCarregando(false);
      },
      () => {
        setEncomendas([]);
        setCarregando(false);
      }
    );

    return () => {
      unsubPedidos();
      unsubEncomendas();
    };
  }, []);

  const mudarStatus = async (tipo, item, novoStatus) => {
    try {
      const rota = tipo === "pedidos" ? `pedidos/${item.FirebaseKey}` : `encomendas/${item.UsuarioId}/${item.FirebaseKey}`;
      await update(ref(db, rota), { Status: novoStatus });
      toast.success("Status atualizado.");
    } catch (erro) {
      toast.error("Falha ao atualizar status.");
    }
  };

  const lista = aba === "pedidos" ? pedidos : encomendas;

  return (
    <div data-testid="admin-aba-pedidos">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-xl font-bold text-espresso">
          {aba === "pedidos" ? `Pronta Entrega (${pedidos.length})` : `Encomendas (${encomendas.length})`}
        </h2>
        <div className="flex bg-white border border-pessego/20 p-1 rounded-xl">
          {[
            { chave: "pedidos", rotulo: "Pronta Entrega", icone: FiShoppingBag },
            { chave: "encomendas", rotulo: "Encomendas", icone: FiBox },
          ].map((t) => {
            const Icone = t.icone;
            return (
              <button
                key={t.chave}
                onClick={() => setAba(t.chave)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                  aba === t.chave ? "bg-rose text-white" : "text-espresso/50 hover:text-rose"
                }`}
                data-testid={`admin-pedidos-aba-${t.chave}`}
              >
                <Icone size={11} /> {t.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="bg-white rounded-3xl border border-pessego/20 p-12 text-center" data-testid="admin-pedidos-vazio">
          <p className="text-xs uppercase tracking-wider text-espresso/50 font-bold">Nada por aqui ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((item) => (
            <div key={item.FirebaseKey} className="bg-white rounded-2xl border border-pessego/20 p-5 shadow-sm" data-testid={`admin-pedido-card-${item.FirebaseKey}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-espresso/5 pb-3 mb-3">
                <div>
                  <p className="text-xs font-bold text-espresso font-mono">
                    {aba === "pedidos" ? item.NumeroPedido || item.FirebaseKey : `ENC ${item.CodigoVisual || item.FirebaseKey.substring(0, 7)}`}
                  </p>
                  <p className="text-[10px] text-espresso/40 mt-0.5">
                    {item.UsuarioEmail || item.UsuarioId} · {item.DataPedido || item.DataEncomenda} {item.HoraPedido || item.HoraEncomenda || ""}
                  </p>
                </div>
                <select
                  value={item.Status || "Aguardando Pagamento"}
                  onChange={(e) => mudarStatus(aba, item, e.target.value)}
                  className="px-3 py-2 bg-creme border border-pessego/30 rounded-xl text-[10px] font-bold uppercase tracking-wider text-espresso focus:outline-none focus:border-rose"
                  data-testid={`admin-pedido-status-${item.FirebaseKey}`}
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                {(item.Itens || []).map((i, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] text-espresso/60">
                    <span className="truncate">
                      <strong className="font-mono">{i.Quantidade}x</strong> {i.Nome}
                      {i.Variante ? ` · ${i.Variante}` : ""}
                    </span>
                    <span className="font-mono text-espresso/40">{brl(Number(i.PrecoReal) * Number(i.Quantidade || 1))}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-3 mt-3 border-t border-espresso/5">
                <span className="text-[9px] uppercase tracking-widest text-espresso/40">{item.MetodoPagamento || "—"}</span>
                <span className="text-sm font-display font-black text-rose">{brl(item.ValorTotal || 0)}</span>
              </div>
              {item.Cupom && (
                <div className="flex justify-between items-center text-[10px] text-emerald-700 pt-1" data-testid={`admin-pedido-cupom-${item.FirebaseKey}`}>
                  <span className="uppercase tracking-widest font-semibold">Cupom {item.Cupom}</span>
                  <span className="font-mono font-bold">−{brl(item.ValorCupom || 0)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
