// src/pages/MeusPedidos.jsx
import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../lib/firebase";
import { ref, onValue, update, get } from "firebase/database";
import apiBase from "../lib/apiBase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useConfiguracoes } from "../lib/configuracoes";
import { useProdutos } from "../lib/produtos";
import Footer from "./Footer";
import PedidoModal from "../components/PedidoModal";
import ProdutoModal from "../components/ProdutoModal";
import { brl } from "../lib/formato";
import { FiPackage, FiBox, FiCreditCard, FiTrash2, FiChevronRight } from "react-icons/fi";

export default function MeusPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [encomendas, setEncomendas] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState("pronta-entrega");
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [processandoAcao, setProcessandoAcao] = useState(null);
  const [pedidoAberto, setPedidoAberto] = useState(null);
  const [produtoModalAberto, setProdutoModalAberto] = useState(null);
  const navigate = useNavigate();
  const { config } = useConfiguracoes();
  const { produtos } = useProdutos();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setUsuario(user);
      else navigate("/login");
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!usuario) return;
    setCarregando(true);

    const pedidosRef = ref(db, "pedidos");
    const unsubscribePedidos = onValue(
      pedidosRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const lista = Object.entries(snapshot.val()).map(([key, valores]) => ({ FirebaseKey: key, ...valores }));
          const meus = lista.filter((p) => p.UsuarioId === usuario.uid);
          meus.sort((a, b) => String(b.NumeroPedido || "").localeCompare(String(a.NumeroPedido || "")));
          setPedidos(meus);
        } else {
          setPedidos([]);
        }
      },
      () => setPedidos([])
    );

    const encomendasRef = ref(db, `encomendas/${usuario.uid}`);
    const unsubscribeEncomendas = onValue(
      encomendasRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const lista = Object.entries(snapshot.val()).map(([key, valores]) => ({
            FirebaseKey: key,
            CodigoVisual: valores.LoteId ? `#ENC-${valores.LoteId.substring(1, 7).toUpperCase()}` : `#ENC-${key.substring(1, 7).toUpperCase()}`,
            ...valores,
          }));
          lista.sort((a, b) => String(b.DataEncomenda || "").localeCompare(String(a.DataEncomenda || "")));
          setEncomendas(lista);
        } else {
          setEncomendas([]);
        }
        setCarregando(false);
      },
      () => {
        setEncomendas([]);
        setCarregando(false);
      }
    );

    return () => {
      unsubscribePedidos();
      unsubscribeEncomendas();
    };
  }, [usuario]);

  // ─── CONFIRMAÇÃO AUTOMÁTICA DE PAGAMENTOS ───
  const marcarPagoRef = useRef(null);

  const marcarPago = async (nsuBruto) => {
    const limpo = String(nsuBruto || "").replace(/[^a-zA-Z0-9]/g, "");
    if (!limpo || !usuario) return false;
    const idDoRegistro = (registro, chave) =>
      String(
        (registro.PagamentoInfinitePay && registro.PagamentoInfinitePay.order_nsu) ||
          (registro.PagamentoMercadoPago && registro.PagamentoMercadoPago.orderNsu) ||
          registro.NumeroPedidoLimpo ||
          chave
      ).replace(/[^a-zA-Z0-9]/g, "");
    try {
      let mudou = false;
      const snapPedidos = await get(ref(db, "pedidos"));
      if (snapPedidos.exists()) {
        for (const [chave, registro] of Object.entries(snapPedidos.val())) {
          if (
            registro &&
            registro.UsuarioId === usuario.uid &&
            (registro.Status || "") === "Aguardando Pagamento" &&
            idDoRegistro(registro, chave) === limpo
          ) {
            await update(ref(db, `pedidos/${chave}`), { Status: "Pago", PagoEm: new Date().toLocaleString("pt-BR") });
            mudou = true;
          }
        }
      }
      const snapEncomendas = await get(ref(db, `encomendas/${usuario.uid}`));
      if (snapEncomendas.exists()) {
        for (const [chave, registro] of Object.entries(snapEncomendas.val())) {
          if (registro && (registro.Status || "") === "Aguardando Pagamento" && idDoRegistro(registro, chave) === limpo) {
            await update(ref(db, `encomendas/${usuario.uid}/${chave}`), {
              Status: "Pago",
              PagoEm: new Date().toLocaleString("pt-BR"),
            });
            mudou = true;
          }
        }
      }
      return mudou;
    } catch (erro) {
      return false;
    }
  };
  marcarPagoRef.current = marcarPago;

  const salvarIdentificadores = async (nsuBruto, slug, transactionNsu) => {
    const limpo = String(nsuBruto || "").replace(/[^a-zA-Z0-9]/g, "");
    if (!limpo || !usuario) return;
    const atualizar = async (rota, registro) => {
      const atual = registro.PagamentoInfinitePay || {};
      await update(ref(db, rota), {
        PagamentoInfinitePay: { order_nsu: limpo, slug: slug || atual.slug || "", transaction_nsu: transactionNsu || atual.transaction_nsu || "" },
      });
    };
    try {
      const snapPedidos = await get(ref(db, "pedidos"));
      if (snapPedidos.exists()) {
        for (const [chave, registro] of Object.entries(snapPedidos.val())) {
          if (registro && registro.UsuarioId === usuario.uid) {
            const id = String(registro.PagamentoInfinitePay?.order_nsu || registro.NumeroPedidoLimpo || chave).replace(/[^a-zA-Z0-9]/g, "");
            if (id === limpo) await atualizar(`pedidos/${chave}`, registro);
          }
        }
      }
      const snapEncomendas = await get(ref(db, `encomendas/${usuario.uid}`));
      if (snapEncomendas.exists()) {
        for (const [chave, registro] of Object.entries(snapEncomendas.val())) {
          if (registro) {
            const id = String(registro.PagamentoInfinitePay?.order_nsu || chave).replace(/[^a-zA-Z0-9]/g, "");
            if (id === limpo) await atualizar(`encomendas/${usuario.uid}/${chave}`, registro);
          }
        }
      }
    } catch (erro) {}
  };

  // Confirma ao voltar dos checkouts (parâmetros na URL)
  useEffect(() => {
    if (!usuario) return;
    const params = new URLSearchParams(window.location.search);
    const nsuIP = params.get("order_nsu");
    const slugIP = params.get("slug");
    const txIP = params.get("transaction_nsu");
    const statusMP = params.get("collection_status") || params.get("status");
    const refMP = params.get("external_reference");
    const paymentIdMP = params.get("payment_id") || params.get("paymentId") || "";

    if (nsuIP && (slugIP || txIP)) {
      window.history.replaceState({}, "", window.location.pathname);
      (async () => {
        await salvarIdentificadores(nsuIP, slugIP, txIP);
        try {
          const resposta = await fetch(`${apiBase}/api/infinitepay/payment-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderNsu: nsuIP, slug: slugIP || "", transactionNsu: txIP || "" }),
          });
          const dados = await resposta.json();
          if (dados.paid && (await marcarPagoRef.current(nsuIP))) {
            toast.success("Pagamento confirmado! Pedido marcado como pago.");
          }
        } catch (erro) {}
      })();
      return;
    }

    if (statusMP && refMP) {
      window.history.replaceState({}, "", window.location.pathname);
      (async () => {
        let verificado = false;
        if (paymentIdMP) {
          try {
            const resposta = await fetch(`${apiBase}/api/mercadopago/confirmar-pagamento`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentId: paymentIdMP, orderNsu: refMP }),
            });
            const dados = await resposta.json();
            verificado = dados.verificado === true || dados.motivo === "sem-token";
          } catch (erro) {}
        }
        if (verificado || !paymentIdMP) {
          if (await marcarPagoRef.current(refMP)) {
            toast.success("Pagamento confirmado! Pedido marcado como pago.");
          }
        } else {
          toast.info("Ainda não conseguimos confirmar esse pagamento — pode levar alguns minutos.");
        }
      })();
    }
  }, [usuario]);

  // Consulta periódica: pega Pix pago depois que a cliente saiu da página
  useEffect(() => {
    if (!usuario) return;
    const pendentes = [...pedidos, ...encomendas].filter(
      (p) =>
        (p.Status || "") === "Aguardando Pagamento" &&
        String(p.MetodoPagamento || "").includes("InfinitePay") &&
        p.PagamentoInfinitePay &&
        p.PagamentoInfinitePay.slug
    );
    if (pendentes.length === 0) return;

    let ativo = true;
    const checar = async () => {
      for (const item of pendentes.slice(0, 5)) {
        if (!ativo) return;
        try {
          const resposta = await fetch(`${apiBase}/api/infinitepay/payment-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderNsu: item.PagamentoInfinitePay.order_nsu,
              slug: item.PagamentoInfinitePay.slug || "",
              transactionNsu: item.PagamentoInfinitePay.transaction_nsu || "",
            }),
          });
          const dados = await resposta.json();
          if (dados.paid && (await marcarPagoRef.current(item.PagamentoInfinitePay.order_nsu))) {
            toast.success("Pagamento do Pix confirmado! Pedido marcado como pago.");
            return;
          }
        } catch (erro) {}
      }
    };
    checar();
    const intervalo = setInterval(checar, 20000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [usuario, pedidos, encomendas]);

  const handleCancelar = async (firebaseKey, tipo) => {
    if (!window.confirm("Deseja realmente cancelar esta solicitação?")) return;
    setProcessandoAcao(firebaseKey);
    try {
      const rota = tipo === "pedido" ? `pedidos/${firebaseKey}` : `encomendas/${usuario.uid}/${firebaseKey}`;
      await update(ref(db, rota), { Status: "Cancelado" });
    } catch (erro) {
      toast.error("Não foi possível cancelar. Tente novamente.");
    } finally {
      setProcessandoAcao(null);
    }
  };

  const handlePagarNovamente = async (pedido) => {
    setProcessandoAcao(pedido.FirebaseKey);
    try {
      const handle = config.pagamentos.infinitepayHandle || "michelrsouza";
      const payload = {
        handle,
        redirect_url: window.location.origin + "/meus-pedidos",
        order_nsu: pedido.NumeroPedidoLimpo || pedido.FirebaseKey.replace(/[^a-zA-Z0-9]/g, ""),
        items: (pedido.Itens || []).map((item) => {
          const nome = (item.Variante ? `${item.Nome} - ${item.Variante}` : item.Nome).toUpperCase();
          return { name: nome, description: nome, price: Math.round(Number(item.PrecoReal) * 100), quantity: item.Quantidade };
        }),
      };
      const resposta = await fetch("https://api.checkout.infinitepay.io/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resposta.ok) throw new Error("Erro na InfinitePay");
      const dados = await resposta.json();
      if (dados.url) {
        try {
          await update(ref(db, `pedidos/${pedido.FirebaseKey}`), {
            PagamentoInfinitePay: {
              order_nsu: payload.order_nsu,
              slug: dados.slug || dados.invoice_slug || "",
              transaction_nsu: dados.transaction_nsu || "",
              salvoEm: Date.now(),
            },
          });
        } catch (e) {}
        window.location.href = dados.url;
      } else toast.error("Não foi possível recuperar o link de pagamento.");
    } catch (erro) {
      toast.error("Falha ao conectar com a InfinitePay. Tente mais tarde.");
    } finally {
      setProcessandoAcao(null);
    }
  };

  return (
    <div className="min-h-screen bg-creme pt-24 pb-24" data-testid="pagina-meus-pedidos">
      <div className="pt-6 pb-8 px-4 text-center">
        <p className="uppercase tracking-[0.3em] text-[11px] font-semibold text-rose mb-3">Acompanhe tudo</p>
        <h1 className="text-3xl md:text-4xl font-display italic text-espresso tracking-tight">
          Meus <span className="text-rose">Pedidos</span>
        </h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 mb-8">
        <div className="flex bg-white border border-pessego/20 p-1.5 rounded-2xl shadow-sm">
          {[
            { chave: "pronta-entrega", rotulo: "Pronta Entrega", icone: FiPackage, total: pedidos.length, teste: "pedidos-aba-pronta" },
            { chave: "encomendas", rotulo: "Encomendas", icone: FiBox, total: encomendas.length, teste: "pedidos-aba-encomendas" },
          ].map((aba) => {
            const Icone = aba.icone;
            return (
              <button
                key={aba.chave}
                onClick={() => setAbaAtiva(aba.chave)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                  abaAtiva === aba.chave ? "bg-rose text-white shadow-md" : "text-espresso hover:bg-creme"
                }`}
                data-testid={aba.teste}
              >
                <Icone size={13} /> {aba.rotulo} ({aba.total})
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-espresso/40 uppercase tracking-widest mt-2">Sincronizando histórico...</span>
          </div>
        ) : (
          <>
            {abaAtiva === "pronta-entrega" &&
              (pedidos.length === 0 ? (
                <div className="text-center py-16 bg-white border border-pessego/20 rounded-3xl p-8 shadow-sm" data-testid="pedidos-vazio">
                  <p className="text-xs uppercase tracking-wider text-espresso font-bold">Nenhum pedido de pronta entrega.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {pedidos.map((pedido) => {
                    const aguardando = pedido.Status === "Aguardando Pagamento";
                    const cancelado = pedido.Status === "Cancelado";
                    return (
                      <div
                        key={pedido.FirebaseKey}
                        onClick={() => setPedidoAberto({ pedido, tipo: "pedidos" })}
                        className={`bg-white rounded-3xl border p-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow ${cancelado ? "border-espresso/10 bg-espresso/5" : "border-pessego/20"}`}
                        data-testid={`pedido-card-${pedido.FirebaseKey}`}
                      >
                        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-espresso/5 pb-4 mb-4">
                          <div>
                            <span className="text-xs font-bold text-espresso tracking-wider block font-mono">ID: {pedido.NumeroPedido}</span>
                            <span className="text-[10px] text-espresso/40 mt-0.5 block">
                              {pedido.DataPedido} às {pedido.HoraPedido} · {pedido.MetodoPagamento || "InfinitePay"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase border ${
                                cancelado
                                  ? "bg-rose/5 border-rose/20 text-rose"
                                  : aguardando
                                  ? "bg-amber-50 border-amber-200 text-amber-700"
                                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
                              }`}
                              data-testid={`pedido-status-${pedido.FirebaseKey}`}
                            >
                              {pedido.Status || "Pendente"}
                            </span>
                            <FiChevronRight className="text-espresso/30" size={14} />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {(pedido.Itens || []).slice(0, 3).map((item, index) => (
                            <div key={index} className="flex justify-between items-center text-xs">
                              <div className="text-espresso/70 truncate max-w-[75%]">
                                <span className="font-bold text-espresso font-mono bg-creme border border-espresso/5 px-1.5 py-0.5 rounded mr-2">
                                  {item.Quantidade}x
                                </span>
                                <span className={`uppercase tracking-wide text-[11px] ${cancelado ? "line-through text-espresso/40" : ""}`}>
                                  {item.Nome}
                                  {item.Variante ? ` · ${item.Variante}` : ""}
                                </span>
                              </div>
                              <span className="text-espresso/40 font-mono">{brl(item.PrecoReal * item.Quantidade)}</span>
                            </div>
                          ))}
                          {(pedido.Itens || []).length > 3 && (
                            <p className="text-[10px] text-rose font-bold uppercase tracking-widest">
                              + {(pedido.Itens.length - 3)} item(ns) — ver detalhes
                            </p>
                          )}
                        </div>

                        <div className="mt-5 pt-4 border-t border-espresso/5 flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-espresso/50">Total</span>
                          <span className={`text-base font-display font-black ${cancelado ? "text-espresso/30 line-through" : "text-rose"}`}>
                            {brl(pedido.ValorTotal)}
                          </span>
                        </div>

                        {aguardando && (
                          <div className="mt-4 pt-4 border-t border-dashed border-espresso/10 flex gap-3" onClick={(e) => e.stopPropagation()}>
                            <button
                              disabled={processandoAcao !== null}
                              onClick={() => handlePagarNovamente(pedido)}
                              className="flex-1 bg-espresso hover:bg-ink text-creme py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                              data-testid={`pedido-pagar-${pedido.FirebaseKey}`}
                            >
                              <FiCreditCard size={12} /> Pagar Agora
                            </button>
                            <button
                              disabled={processandoAcao !== null}
                              onClick={() => handleCancelar(pedido.FirebaseKey, "pedido")}
                              className="px-4 border border-rose/30 hover:bg-rose/5 text-rose py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                              data-testid={`pedido-cancelar-${pedido.FirebaseKey}`}
                            >
                              <FiTrash2 size={12} /> Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

            {abaAtiva === "encomendas" &&
              (encomendas.length === 0 ? (
                <div className="text-center py-16 bg-white border border-pessego/20 rounded-3xl p-8 shadow-sm" data-testid="encomendas-vazio">
                  <p className="text-xs uppercase tracking-wider text-espresso font-bold">Você não possui solicitações de encomendas.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {encomendas.map((encomenda) => {
                    const aguardando = encomenda.Status === "Aguardando Pagamento";
                    const cancelado = encomenda.Status === "Cancelado";
                    return (
                      <div
                        key={encomenda.FirebaseKey}
                        onClick={() => setPedidoAberto({ pedido: encomenda, tipo: "encomendas" })}
                        className={`bg-white rounded-3xl border p-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow ${cancelado ? "border-espresso/10 bg-espresso/5" : "border-amber-200/60"}`}
                        data-testid={`encomenda-card-${encomenda.FirebaseKey}`}
                      >
                        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-amber-100 pb-4 mb-4">
                          <div>
                            <span className="text-xs font-bold text-amber-900 tracking-wider block font-mono">CÓD: {encomenda.CodigoVisual}</span>
                            <span className="text-[10px] text-espresso/40 mt-0.5 block">
                              Solicitado em {encomenda.DataEncomenda} às {encomenda.HoraEncomenda}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase border bg-amber-50 border-amber-200 text-amber-800">
                              {encomenda.Status || "Aguardando Compra"}
                            </span>
                            <FiChevronRight className="text-espresso/30" size={14} />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {(encomenda.Itens || []).map((item, index) => (
                            <div key={index} className="flex justify-between items-center text-xs">
                              <div className="text-espresso/70 truncate max-w-[75%]">
                                <span className="font-bold text-amber-800 font-mono bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded mr-2">
                                  {item.Quantidade}x
                                </span>
                                <span className="uppercase tracking-wide text-[11px] text-espresso/80">
                                  {item.Nome}
                                  {item.Variante ? ` · ${item.Variante}` : ""}
                                </span>
                              </div>
                              <span className="text-espresso/40 font-mono">{brl(Number(item.PrecoReal) * Number(item.Quantidade || 1))}</span>
                            </div>
                          ))}
                        </div>

                        {aguardando && (
                          <div className="mt-4 pt-3 border-t border-dashed border-amber-100 flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <button
                              disabled={processandoAcao !== null}
                              onClick={() => handleCancelar(encomenda.FirebaseKey, "encomenda")}
                              className="w-full border border-rose/30 hover:bg-rose/5 text-rose py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                              data-testid={`encomenda-cancelar-${encomenda.FirebaseKey}`}
                            >
                              <FiTrash2 size={12} /> Cancelar Solicitação
                            </button>
                          </div>
                        )}

                        {!cancelado && !aguardando && (
                          <div className="mt-4 bg-amber-50/50 rounded-xl p-3 border border-amber-100/50 text-center">
                            <p className="text-[10px] text-amber-800 italic">
                              A Val foi notificada sobre este item e o trará na próxima remessa importada!
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </>
        )}
      </div>

      {pedidoAberto && (
        <PedidoModal
          pedido={pedidoAberto.pedido}
          tipo={pedidoAberto.tipo}
          produtos={produtos}
          onFechar={() => setPedidoAberto(null)}
          aoAbrirProduto={(produto) => setProdutoModalAberto(produto)}
        />
      )}

      {produtoModalAberto && (
        <ProdutoModal produto={produtoModalAberto} onFechar={() => setProdutoModalAberto(null)} />
      )}

      <Footer />
    </div>
  );
}
