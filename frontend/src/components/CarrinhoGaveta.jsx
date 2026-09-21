// src/components/CarrinhoGaveta.jsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCarrinho } from "../context/CarrinhoContext";
import { db, auth } from "../lib/firebase";
import { ref, runTransaction, set, push, update } from "firebase/database";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useConfiguracoes, listaAdmins } from "../lib/configuracoes";
import { buscarCupom, registrarUsoCupom, calcularDescontoCupom } from "../lib/cupons";
import { brl } from "../lib/formato";
import apiBase from "../lib/apiBase";
import { FiX, FiPlus, FiMinus, FiTrash2, FiCreditCard, FiChevronRight, FiTag } from "react-icons/fi";

const API_INFINITEPAY = "https://api.checkout.infinitepay.io/links";

export default function CarrinhoGaveta() {
  const navigate = useNavigate();
  const [processando, setProcessando] = useState(null);
  const [selecionados, setSelecionados] = useState({});
  const [cupomInput, setCupomInput] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState(null);
  const [cupomErro, setCupomErro] = useState("");
  const [aplicandoCupom, setAplicandoCupom] = useState(false);
  const { config } = useConfiguracoes();

  const {
    carrinho,
    carrinhoAberto,
    setCarrinhoAberto,
    atualizarQuantidade,
    removerDoCarrinho,
  } = useCarrinho();

  useEffect(() => {
    const novos = { ...selecionados };
    carrinho.forEach((item) => {
      const chave = `${item.Id}__${item.varianteId || "base"}`;
      if (novos[chave] === undefined) novos[chave] = true;
    });
    setSelecionados(novos);
  }, [carrinho]);

  if (!carrinhoAberto) return null;

  const toggleSelecao = (item) => {
    const chave = `${item.Id}__${item.varianteId || "base"}`;
    setSelecionados((prev) => ({ ...prev, [chave]: !prev[chave] }));
  };

  const itensAtivos = carrinho.filter((i) => selecionados[`${i.Id}__${i.varianteId || "base"}`] !== false);
  const subtotal = itensAtivos.reduce((s, i) => s + i.precoUnit * i.quantidadeCarrinho, 0);

  const descontoPix = Number(config.financeiro.descontoPix || 0);
  const descontoCupomVal = calcularDescontoCupom(cupomAplicado, subtotal);
  const subtotalComCupom = subtotal - descontoCupomVal;
  const fatorDesconto = subtotal > 0 ? subtotalComCupom / subtotal : 1;
  const totalPix = subtotalComCupom * (1 - descontoPix / 100);
  const totalCartao = subtotalComCupom;
  const maxParcelas = Number(config.financeiro.maxParcelas || 12);

  const aplicarCupom = async () => {
    if (!cupomInput.trim()) {
      setCupomErro("Digite o código do cupom.");
      return;
    }
    setAplicandoCupom(true);
    setCupomErro("");
    const resultado = await buscarCupom(cupomInput);
    if (resultado.ok) {
      setCupomAplicado(resultado.cupom);
      setCupomInput("");
      toast.success(`Cupom ${resultado.cupom.Codigo} aplicado!`);
    } else {
      setCupomErro(resultado.erro);
    }
    setAplicandoCupom(false);
  };

  const removerCupom = () => {
    setCupomAplicado(null);
    setCupomErro("");
  };

  const registrarPedidos = async (metodo) => {
    const usuario = auth.currentUser;
    if (!usuario) {
      toast.error("Entre com sua conta para finalizar a compra");
      navigate("/login");
      return null;
    }
    if (itensAtivos.length === 0) {
      toast.error("Selecione pelo menos um item com o checkbox");
      return null;
    }

    const precoAjustado = (i) => Math.round(i.precoUnit * fatorDesconto * 100) / 100;
    const itensDe = (lista) => lista.map((i) => ({
      Id: i.Id,
      Nome: i.Nome,
      Variante: i.varianteNome || "",
      PrecoReal: precoAjustado(i),
      Quantidade: i.quantidadeCarrinho,
      SobreEncomenda: Number(i.QuantidadeEstoque) <= 0,
    }));
    const itensAjustados = itensDe(itensAtivos);
    const valorTotalAjustado = Math.round(itensAjustados.reduce((s, i) => s + i.PrecoReal * i.Quantidade, 0) * 100) / 100;

    const pronta = itensAtivos.filter((i) => Number(i.QuantidadeEstoque) > 0);
    const encomenda = itensAtivos.filter((i) => Number(i.QuantidadeEstoque) <= 0);

    let nsu = `ENC${Date.now().toString().substring(8)}`;
    let pedidoCriadoKey = null;
    let encomendaCriadaPath = null;
    try {
      if (pronta.length > 0) {
        const contadorRef = ref(db, "configuracoes/ultimoPedidoId");
        const resultado = await runTransaction(contadorRef, (atual) => (atual === null ? 1 : atual + 1));
        const idLimpo = String(resultado.snapshot.val()).padStart(7, "0");
        nsu = idLimpo;
        const pedidoRef = push(ref(db, "pedidos"));
        await set(pedidoRef, {
          NumeroPedido: `#${idLimpo}`,
          NumeroPedidoLimpo: idLimpo,
          UsuarioId: usuario.uid,
          UsuarioEmail: usuario.email,
          MetodoPagamento: metodo,
          Cupom: cupomAplicado ? cupomAplicado.Codigo : null,
          ValorCupom: Math.round(descontoCupomVal * 100) / 100,
          Itens: itensDe(pronta),
          ValorTotal: Math.round(pronta.reduce((s, i) => s + precoAjustado(i) * i.quantidadeCarrinho, 0) * 100) / 100,
          DataPedido: new Date().toLocaleDateString("pt-BR"),
          HoraPedido: new Date().toLocaleTimeString("pt-BR"),
          Status: "Aguardando Pagamento",
        });
        pedidoCriadoKey = pedidoRef.key;
      }
      if (encomenda.length > 0) {
        const loteRef = push(ref(db, `encomendas/${usuario.uid}`));
        await set(loteRef, {
          LoteId: loteRef.key,
          UsuarioEmail: usuario.email,
          MetodoPagamento: metodo,
          Cupom: cupomAplicado ? cupomAplicado.Codigo : null,
          ValorCupom: Math.round(descontoCupomVal * 100) / 100,
          DataEncomenda: new Date().toLocaleDateString("pt-BR"),
          HoraEncomenda: new Date().toLocaleTimeString("pt-BR"),
          Status: "Aguardando Pagamento",
          Itens: itensDe(encomenda),
        });
        nsu = (loteRef.key || nsu).replace(/[^a-zA-Z0-9]/g, "");
        encomendaCriadaPath = `encomendas/${usuario.uid}/${loteRef.key}`;
      }
    } catch (erro) {
      toast.error("Falha ao registrar o pedido. Verifique sua conexão e tente novamente.");
      return null;
    }
    // Avisa as administradoras por e-mail (melhor esforço, sem bloquear o pagamento)
    try {
      fetch(`${apiBase}/api/emails/pedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: pronta.length > 0 ? "pedido" : "encomenda",
          numero: nsu,
          clienteEmail: usuario.email,
          admins: listaAdmins(config),
          itens: itensAjustados,
          total: valorTotalAjustado,
          cupom: cupomAplicado ? cupomAplicado.Codigo : "",
          dataHora: new Date().toLocaleString("pt-BR"),
        }),
      }).catch(() => {});
    } catch (e) {}

    return { nsu, itensAjustados, valorTotalAjustado, pedidoKey: pedidoCriadoKey, encomendaPath: encomendaCriadaPath };
  };

  const pagarPix = async () => {
    setProcessando("pix");
    try {
      const compra = await registrarPedidos("InfinitePay Pix");
      if (!compra) return;

      const nomeItem = (i) => (i.Variante ? `${i.Nome} - ${i.Variante}` : i.Nome).toUpperCase();
      const items = compra.itensAjustados.map((i) => ({
        name: nomeItem(i),
        description: nomeItem(i),
        price: Math.round(i.PrecoReal * (1 - descontoPix / 100) * 100),
        quantity: i.Quantidade,
      }));

      const handle = config.pagamentos.infinitepayHandle || "michelrsouza";
      const webhookN8n = config.pagamentos.infinitepayWebhookN8n;

      let url = null;
      if (webhookN8n) {
        const resposta = await fetch(webhookN8n, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, redirect_url: window.location.origin + "/meus-pedidos", order_nsu: compra.nsu, items }),
        });
        const dados = await resposta.json();
        url = (dados && (dados.url || (dados.body && dados.body.url) || (dados.data && dados.data.url))) || null;
      } else {
        const resposta = await fetch(API_INFINITEPAY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, redirect_url: window.location.origin + "/meus-pedidos", order_nsu: compra.nsu, items }),
        });
        if (!resposta.ok) throw new Error("InfinitePay recusou o checkout");
        const dados = await resposta.json();
        url = dados.url || dados.checkout_url || null;
        // Guarda os identificadores do pagamento no pedido para confirmar depois
        if (url) {
          try {
            const ids = {
              order_nsu: compra.nsu,
              slug: dados.slug || dados.invoice_slug || "",
              transaction_nsu: dados.transaction_nsu || "",
              salvoEm: Date.now(),
            };
            if (compra.pedidoKey) await update(ref(db, `pedidos/${compra.pedidoKey}`), { PagamentoInfinitePay: ids });
            if (compra.encomendaPath) await update(ref(db, compra.encomendaPath), { PagamentoInfinitePay: ids });
          } catch (e) {}
        }
      }

      if (!url) throw new Error("Sem URL de checkout");

      itensAtivos.forEach((i) => removerDoCarrinho(i));
      await registrarUsoCupom(cupomAplicado ? cupomAplicado.Key : null);
      setCarrinhoAberto(false);
      window.location.href = url;
    } catch (erro) {
      toast.error("Não foi possível abrir o pagamento por Pix. Tente novamente.");
    } finally {
      setProcessando(null);
    }
  };

  const pagarCartao = async () => {
    setProcessando("cartao");
    try {
      const compra = await registrarPedidos("Mercado Pago");
      if (!compra) return;

      let caiuParaInfinitePay = false;
      try {
        const resposta = await fetch(`${apiBase}/api/mercadopago/create-preference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: compra.itensAjustados.map((i) => ({
              title: (i.Variante ? `${i.Nome} - ${i.Variante}` : i.Nome).toUpperCase(),
              quantity: i.Quantidade,
              unit_price: Number(i.PrecoReal),
            })),
            payerEmail: (auth.currentUser && auth.currentUser.email) || "",
            origin: window.location.origin,
            orderNsu: compra.nsu,
          }),
        });
        const dados = await resposta.json();
        if (!resposta.ok || !dados.initPoint) {
          throw new Error(dados.error || "Falha ao iniciar pagamento");
        }

        // Liga o pagamento MP aos registros do pedido (para confirmar o status depois)
        try {
          const idsMP = { orderNsu: compra.nsu, salvoEm: Date.now() };
          if (compra.pedidoKey) await update(ref(db, `pedidos/${compra.pedidoKey}`), { PagamentoMercadoPago: idsMP });
          if (compra.encomendaPath) await update(ref(db, compra.encomendaPath), { PagamentoMercadoPago: idsMP });
        } catch (e) {}

        itensAtivos.forEach((i) => removerDoCarrinho(i));
        await registrarUsoCupom(cupomAplicado ? cupomAplicado.Key : null);
        setCarrinhoAberto(false);
        window.location.assign(dados.initPoint);
        return;
      } catch (erroMP) {
        const mensagem = String(erroMP.message || "");
        const semConfiguracao = mensagem.includes("não foi configurado") || mensagem.includes("sem-token");
        if (!semConfiguracao) {
          toast.error(mensagem || "Não foi possível iniciar o pagamento com cartão.");
          return;
        }
        caiuParaInfinitePay = true;
        // Mercado Pago ainda não configurado: o checkout da InfinitePay também aceita cartão
        try {
          const correcao = { MetodoPagamento: "Cartão — InfinitePay" };
          if (compra.pedidoKey) await update(ref(db, `pedidos/${compra.pedidoKey}`), correcao);
          if (compra.encomendaPath) await update(ref(db, compra.encomendaPath), correcao);
        } catch (e) {}
        toast.info("Mercado Pago ainda não configurado — seguindo com cartão via InfinitePay.");
      }

      const nomeItem = (i) => (i.Variante ? `${i.Nome} - ${i.Variante}` : i.Nome).toUpperCase();
      const items = compra.itensAjustados.map((i) => ({
        name: nomeItem(i),
        description: nomeItem(i),
        price: Math.round(i.PrecoReal * (1 - descontoPix / 100) * 100),
        quantity: i.Quantidade,
      }));
      const handle = config.pagamentos.infinitepayHandle || "michelrsouza";
      const webhookN8n = config.pagamentos.infinitepayWebhookN8n;

      let url = null;
      if (webhookN8n) {
        const resposta = await fetch(webhookN8n, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, redirect_url: window.location.origin + "/meus-pedidos", order_nsu: compra.nsu, items }),
        });
        const dados = await resposta.json();
        url = (dados && (dados.url || (dados.body && dados.body.url) || (dados.data && dados.data.url))) || null;
      } else {
        const resposta = await fetch(API_INFINITEPAY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, redirect_url: window.location.origin + "/meus-pedidos", order_nsu: compra.nsu, items }),
        });
        if (!resposta.ok) throw new Error("InfinitePay recusou o checkout");
        const dados = await resposta.json();
        url = dados.url || dados.checkout_url || null;
      }
      if (!url) throw new Error("Sem URL de checkout");

      itensAtivos.forEach((i) => removerDoCarrinho(i));
      await registrarUsoCupom(cupomAplicado ? cupomAplicado.Key : null);
      setCarrinhoAberto(false);
      window.location.href = url;
    } catch (erro) {
      toast.error(erro.message || "Não foi possível iniciar o pagamento com cartão.");
    } finally {
      setProcessando(null);
    }
  };

  return (
    <AnimatePresence>
      {carrinhoAberto && (
        <div className="fixed inset-0 z-50 overflow-hidden" data-testid="sacola-gaveta">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-espresso/40 backdrop-blur-sm"
            onClick={() => setCarrinhoAberto(false)}
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className="absolute inset-y-0 right-0 w-screen max-w-md bg-creme shadow-2xl border-l border-pessego/30 flex flex-col"
            data-testid="sacola-painel"
          >
            <div className="p-5 border-b border-pessego/20 bg-white flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-espresso" data-testid="sacola-titulo">
                Sua Sacola ({carrinho.length})
              </h2>
              <button onClick={() => setCarrinhoAberto(false)} className="p-1.5 rounded-full hover:bg-creme text-espresso" aria-label="Fechar sacola" data-testid="sacola-fechar">
                <FiX size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {carrinho.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-espresso/40 p-6" data-testid="sacola-vazia">
                  <p className="font-display italic text-2xl text-espresso/30 mb-2">Sua sacola está vazia</p>
                  <button onClick={() => { setCarrinhoAberto(false); navigate("/catalogo"); }} className="text-[11px] font-bold uppercase tracking-widest text-rose mt-2" data-testid="sacola-ver-catalogo">
                    Ver catálogo
                  </button>
                </div>
              ) : (
                carrinho.map((item) => {
                  const chave = `${item.Id}__${item.varianteId || "base"}`;
                  const encomenda = Number(item.QuantidadeEstoque) <= 0;
                  const marcado = selecionados[chave] !== false;
                  return (
                    <div
                      key={chave}
                      className={`flex items-center gap-3 bg-white p-3 rounded-2xl border shadow-sm transition-all ${
                        marcado ? (encomenda ? "border-amber-200" : "border-pessego/40") : "border-espresso/5 opacity-60"
                      }`}
                      data-testid="sacola-item"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggleSelecao(item)}
                        className="w-4 h-4 rounded-md accent-rose cursor-pointer"
                        aria-label={`Selecionar ${item.Nome}`}
                      />
                      <div className="w-16 h-20 bg-creme rounded-xl overflow-hidden border border-espresso/5 shrink-0">
                        {item.FotoUrl && <img src={item.FotoUrl} alt={item.Nome} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-espresso uppercase tracking-wide truncate" data-testid="sacola-item-nome">
                          {item.Nome}
                          {item.varianteNome && <span className="text-rose"> · {item.varianteNome}</span>}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs font-mono font-bold text-rose">{brl(item.precoUnit)}</p>
                          {encomenda && (
                            <span className="text-[8px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter">
                              Encomenda
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center border border-pessego/30 rounded-full bg-creme">
                            <button onClick={() => atualizarQuantidade(item, item.quantidadeCarrinho - 1)} className="px-2 py-1 text-espresso/50 hover:text-rose" aria-label="Diminuir quantidade" data-testid="sacola-item-diminuir">
                              <FiMinus size={10} />
                            </button>
                            <span className="text-xs font-bold px-1 font-mono text-espresso">{item.quantidadeCarrinho}</span>
                            <button onClick={() => atualizarQuantidade(item, item.quantidadeCarrinho + 1)} className="px-2 py-1 text-espresso/50 hover:text-rose" aria-label="Aumentar quantidade" data-testid="sacola-item-aumentar">
                              <FiPlus size={10} />
                            </button>
                          </div>
                          <button onClick={() => removerDoCarrinho(item)} className="text-espresso/25 hover:text-rose transition-colors" aria-label="Remover item" data-testid="sacola-item-remover">
                            <FiTrash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-5 bg-white border-t border-pessego/20 shadow-sm space-y-3">
              {cupomAplicado ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5" data-testid="sacola-cupom-ativo">
                  <div className="flex items-center gap-2.5">
                    <FiTag className="text-emerald-700" size={14} />
                    <div>
                      <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Cupom {cupomAplicado.Codigo}</p>
                      <p className="text-[10px] text-emerald-700">−{brl(descontoCupomVal)} de desconto</p>
                    </div>
                  </div>
                  <button onClick={removerCupom} className="p-1.5 rounded-full hover:bg-emerald-100 text-emerald-700" aria-label="Remover cupom" data-testid="sacola-cupom-remover">
                    <FiX size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      value={cupomInput}
                      onChange={(e) => setCupomInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && aplicarCupom()}
                      placeholder="Cupom de desconto"
                      className="flex-1 px-4 py-2.5 bg-creme border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs font-mono uppercase text-espresso placeholder:normal-case placeholder:font-sans"
                      data-testid="sacola-cupom-input"
                    />
                    <button
                      onClick={aplicarCupom}
                      disabled={aplicandoCupom || itensAtivos.length === 0}
                      className="shrink-0 px-5 py-2.5 bg-espresso hover:bg-ink disabled:bg-espresso/20 text-creme rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                      data-testid="sacola-cupom-aplicar"
                    >
                      {aplicandoCupom ? "..." : "Aplicar"}
                    </button>
                  </div>
                  {cupomErro && <p className="text-[10px] text-rose mt-1.5 font-semibold" data-testid="sacola-cupom-erro">{cupomErro}</p>}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-espresso/50">Subtotal</span>
                <span className="text-lg font-display font-black text-rose" data-testid="sacola-subtotal">{brl(subtotal)}</span>
              </div>
              {descontoCupomVal > 0 && (
                <div className="flex items-center justify-between text-[11px] text-emerald-700" data-testid="sacola-linha-cupom">
                  <span className="uppercase tracking-widest font-semibold">Cupom {cupomAplicado.Codigo}</span>
                  <span className="font-mono font-bold">−{brl(descontoCupomVal)}</span>
                </div>
              )}
              {descontoPix > 0 && (
                <div className="flex items-center justify-between text-[11px] text-emerald-700">
                  <span className="uppercase tracking-widest font-semibold">No Pix ({descontoPix}% off)</span>
                  <span className="font-mono font-bold" data-testid="sacola-subtotal-pix">{brl(totalPix)}</span>
                </div>
              )}
              <button
                onClick={pagarPix}
                disabled={itensAtivos.length === 0 || processando !== null}
                className="w-full bg-espresso hover:bg-ink disabled:bg-espresso/20 text-creme py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] transition-all shadow-md flex items-center justify-center gap-2"
                data-testid="checkout-pix-botao"
              >
                {processando === "pix" ? (
                  <span className="w-4 h-4 border-2 border-creme border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Pagar com Pix · {brl(totalPix)} <FiChevronRight size={14} />
                  </>
                )}
              </button>
              <button
                onClick={pagarCartao}
                disabled={itensAtivos.length === 0 || processando !== null}
                className="w-full bg-rose hover:bg-rosedark disabled:bg-rose/30 text-white py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] transition-all shadow-md flex items-center justify-center gap-2"
                data-testid="checkout-cartao-botao"
              >
                {processando === "cartao" ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <FiCreditCard size={13} /> Pagar com Cartão · {brl(totalCartao)}
                  </>
                )}
              </button>
              <p className="text-center text-[9px] text-espresso/35 uppercase tracking-widest">
                Cartão em até {maxParcelas}x · Pix via InfinitePay · Cartão via Mercado Pago
              </p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
