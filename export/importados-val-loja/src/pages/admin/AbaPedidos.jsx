// src/pages/admin/AbaPedidos.jsx
import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, update } from "firebase/database";
import { toast } from "sonner";
import { brl } from "../../lib/formato";
import apiBase from "../../lib/apiBase";
import { FiShoppingBag, FiBox, FiMinus, FiPlus, FiTrash2, FiSearch, FiStar } from "react-icons/fi";

const STATUS = ["Aguardando Pagamento", "Pago", "Enviado", "Entregue", "Cancelado"];

export default function AbaPedidos() {
  const [aba, setAba] = useState("pedidos");
  const [pedidos, setPedidos] = useState([]);
  const [encomendas, setEncomendas] = useState([]);
  const [clientes, setClientes] = useState({});
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const pedidosRef = ref(db, "pedidos");
    const unsubPedidos = onValue(
      pedidosRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const lista = Object.entries(snapshot.val())
            .map(([key, valores]) => ({ FirebaseKey: key, ...valores }))
            .filter((p) => p && (p.Itens || p.NumeroPedido));
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

    const clientesRef = ref(db, "clientes");
    const unsubClientes = onValue(
      clientesRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const mapa = {};
          Object.entries(snapshot.val()).forEach(([uid, valores]) => {
            mapa[uid] = (valores && valores.Nome) || "";
          });
          setClientes(mapa);
        } else {
          setClientes({});
        }
      },
      () => setClientes({})
    );

    return () => {
      unsubPedidos();
      unsubEncomendas();
      unsubClientes();
    };
  }, []);

  // ─── CONFERÊNCIA AUTOMÁTICA DE PIX PENDENTES (não depende do webhook) ───
  // A cada 30s (e ao abrir o painel), pergunta direto à InfinitePay se os Pix
  // "Aguardando Pagamento" já caíram e marca "Pago" na hora.
  const conferindoRef = useRef(false);

  useEffect(() => {
    const conferir = async () => {
      if (conferindoRef.current) return;
      const separar = (lista) =>
        lista.filter(
          (p) =>
            (p.Status || "") === "Aguardando Pagamento" &&
            String(p.MetodoPagamento || "").includes("InfinitePay") &&
            p.PagamentoInfinitePay &&
            (p.PagamentoInfinitePay.slug || p.PagamentoInfinitePay.transaction_nsu || p.PagamentoInfinitePay.order_nsu)
        );
      const pendentesPedidos = separar(pedidos);
      const pendentesEncomendas = separar(encomendas);
      if (pendentesPedidos.length === 0 && pendentesEncomendas.length === 0) return;

      conferindoRef.current = true;
      const checar = async (item, marcar) => {
        try {
          const resposta = await fetch(`${apiBase}/api/infinitepay/payment-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderNsu: (item.PagamentoInfinitePay && item.PagamentoInfinitePay.order_nsu) || item.NumeroPedidoLimpo || "",
              slug: (item.PagamentoInfinitePay && item.PagamentoInfinitePay.slug) || "",
              transactionNsu: (item.PagamentoInfinitePay && item.PagamentoInfinitePay.transaction_nsu) || "",
            }),
          });
          const dados = await resposta.json();
          if (dados.paid) await marcar();
        } catch (e) {}
      };

      try {
        for (const item of pendentesPedidos.slice(0, 5)) {
          await checar(item, async () => {
            await update(ref(db, `pedidos/${item.FirebaseKey}`), { Status: "Pago", PagoEm: new Date().toLocaleString("pt-BR") });
            toast.success(`Pix do pedido ${item.NumeroPedido || ""} confirmado — status atualizado para Pago.`);
          });
        }
        for (const item of pendentesEncomendas.slice(0, 5)) {
          await checar(item, async () => {
            await update(ref(db, `encomendas/${item.UsuarioId}/${item.FirebaseKey}`), { Status: "Pago", PagoEm: new Date().toLocaleString("pt-BR") });
            toast.success(`Pix da encomenda confirmado — status atualizado para Pago.`);
          });
        }
      } finally {
        conferindoRef.current = false;
      }
    };
    conferir();
    const intervalo = setInterval(conferir, 30000);
    return () => clearInterval(intervalo);
  }, [pedidos, encomendas]);

  const nomeDe = (item) => (item.UsuarioId && clientes[item.UsuarioId]) || "";

  const mudarStatus = async (tipo, item, novoStatus) => {
    try {
      const rota = tipo === "pedidos" ? `pedidos/${item.FirebaseKey}` : `encomendas/${item.UsuarioId}/${item.FirebaseKey}`;
      await update(ref(db, rota), { Status: novoStatus });
      toast.success("Status atualizado.");
    } catch (erro) {
      toast.error("Falha ao atualizar status.");
    }
  };

  const salvarItens = async (tipo, item, novosItens) => {
    const valorTotal = Math.round(novosItens.reduce((s, i) => s + Number(i.PrecoReal) * Number(i.Quantidade || 0), 0) * 100) / 100;
    try {
      const rota = tipo === "pedidos" ? `pedidos/${item.FirebaseKey}` : `encomendas/${item.UsuarioId}/${item.FirebaseKey}`;
      await update(ref(db, rota), { Itens: novosItens, ValorTotal: valorTotal });
    } catch (erro) {
      toast.error("Falha ao editar o pedido. Verifique as regras de escrita do Firebase.");
    }
  };

  const mudarQuantidade = (tipo, item, idx, delta) => {
    const itens = (item.Itens || []).map((it, i) =>
      i === idx ? { ...it, Quantidade: Math.max(1, Number(it.Quantidade || 1) + delta) } : it
    );
    salvarItens(tipo, item, itens);
  };

  const removerItem = (tipo, item, idx) => {
    const itens = (item.Itens || []).filter((_, i) => i !== idx);
    if (itens.length === 0) {
      toast.error("O pedido precisa de pelo menos um item — cancele o pedido se necessário.");
      return;
    }
    salvarItens(tipo, item, itens);
  };

  const salvarSemJuros = async (item, valor) => {
    const n = Math.max(0, Math.min(12, Number(valor) || 0));
    try {
      const rota = aba === "pedidos" ? `pedidos/${item.FirebaseKey}` : `encomendas/${item.UsuarioId}/${item.FirebaseKey}`;
      await update(ref(db, rota), { SemJuros: n });
      if (n > 0) toast.success(`Condição especial salva: até ${n}x sem juros.`);
    } catch (erro) {
      toast.error("Falha ao salvar o parcelamento sem juros.");
    }
  };

  const lista = aba === "pedidos" ? pedidos : encomendas;

  const listaFiltrada = lista.filter((item) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    const numero = String(item.NumeroPedido || item.CodigoVisual || item.FirebaseKey).toLowerCase();
    const email = String(item.UsuarioEmail || "").toLowerCase();
    const nome = String(nomeDe(item)).toLowerCase();
    return numero.includes(termo) || email.includes(termo) || nome.includes(termo);
  });

  return (
    <div data-testid="admin-aba-pedidos">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-espresso">
            {aba === "pedidos" ? `Pronta Entrega (${pedidos.length})` : `Encomendas (${encomendas.length})`}
          </h2>
          <p className="text-[11px] text-espresso/50 mt-1">
            Ajuste quantidades e remova itens direto daqui — o total é recalculado sozinho.
          </p>
        </div>
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

      <div className="max-w-md relative mb-4">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-rose" size={13} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nº do pedido, nome ou e-mail..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso"
          data-testid="admin-pedidos-busca"
        />
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
          {listaFiltrada.map((item) => (
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

              <div className="space-y-2">
                {(item.Itens || []).map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 text-[11px]" data-testid={`admin-pedido-item-${item.FirebaseKey}-${idx}`}>
                    <span className="truncate text-espresso/70 flex-1 min-w-0">
                      <strong className="font-mono text-espresso/40">#{idx + 1}</strong>{" "}
                      <strong className="font-mono">{i.Quantidade}x</strong> {i.Nome}
                      {i.Variante ? ` · ${i.Variante}` : ""}
                    </span>
                    <span className="font-mono text-espresso/40 shrink-0">{brl(Number(i.PrecoReal) * Number(i.Quantidade || 1))}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button onClick={() => mudarQuantidade(aba, item, idx, -1)} className="p-1.5 rounded-lg border border-espresso/10 text-espresso/50 hover:text-rose hover:border-rose/40" aria-label="Diminuir quantidade" data-testid={`admin-pedido-item-diminuir-${item.FirebaseKey}-${idx}`}>
                        <FiMinus size={10} />
                      </button>
                      <button onClick={() => mudarQuantidade(aba, item, idx, 1)} className="p-1.5 rounded-lg border border-espresso/10 text-espresso/50 hover:text-rose hover:border-rose/40" aria-label="Aumentar quantidade" data-testid={`admin-pedido-item-aumentar-${item.FirebaseKey}-${idx}`}>
                        <FiPlus size={10} />
                      </button>
                      <button onClick={() => removerItem(aba, item, idx)} className="p-1.5 rounded-lg border border-rose/20 text-rose hover:bg-rose/5" aria-label="Remover item" data-testid={`admin-pedido-item-remover-${item.FirebaseKey}-${idx}`}>
                        <FiTrash2 size={10} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center gap-3 pt-3 mt-3 border-t border-espresso/5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="text-[9px] uppercase tracking-widest text-espresso/40">{item.MetodoPagamento || "—"}</span>
                  <label className="flex items-center gap-1.5 text-[10px] text-espresso/50 font-semibold whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    Sem juros até
                    <input
                      type="number"
                      min={0}
                      max={12}
                      defaultValue={item.SemJuros || ""}
                      onBlur={(e) => salvarSemJuros(item, e.target.value)}
                      placeholder="0"
                      className="w-12 px-2 py-1 bg-creme border border-pessego/30 rounded-lg text-[11px] font-mono text-espresso focus:outline-none focus:border-rose text-center"
                      data-testid={`admin-pedido-semjuros-${item.FirebaseKey}`}
                    />
                    x
                  </label>
                </div>
                <span className="text-sm font-display font-black text-rose" data-testid={`admin-pedido-total-${item.FirebaseKey}`}>{brl(item.ValorTotal || 0)}</span>
              </div>
              {Number(item.SemJuros) > 0 && (
                <span className="flex items-center gap-1.5 text-[10px] text-gold font-bold uppercase tracking-widest mt-2" data-testid={`admin-pedido-semjuros-selo-${item.FirebaseKey}`}>
                  <FiStar size={10} /> Condição especial: até {item.SemJuros}x sem juros
                </span>
              )}
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
