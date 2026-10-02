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
import { FiX, FiPlus, FiMinus, FiTrash2, FiCreditCard, FiChevronRight, FiTag, FiZap, FiArrowLeft, FiCheckCircle } from "react-icons/fi";

const API_INFINITEPAY = "https://api.checkout.infinitepay.io/links";

export default function CarrinhoGaveta() {
  const navigate = useNavigate();
  const [processando, setProcessando] = useState(null);
  const [selecionados, setSelecionados] = useState({});
  const [etapa, setEtapa] = useState("carrinho"); // carrinho | pagamento
  const [metodo, setMetodo] = useState("pix");
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

  useEffect(() => {
    if (!carrinhoAberto) setEtapa("carrinho");
  }, [carrinhoAberto]);

  if (!carrinhoAberto) return null;

  const toggleSelecao = (item) => {
    const chave = `${item.Id}__${item.varianteId || "base"}`;
    setSelecionados((prev) => ({ ...prev, [chave]: !prev[chave] }));
  };

  const itensAtivos = carrinho.filter((i) => selecionados[`${i.Id}__${i.varianteId || "base"}`] !== false);
  const subtotal = itensAtivos.reduce((s, i) => s + i.precoUnit * i.quantidadeCarrinho, 0);

  // O cupom só vale para pagamento via Pix
  const cupomValido = metodo === "pix" ? cupomAplicado : null;
  const descontoCupomVal = calcularDescontoCupom(cupomValido, subtotal);
  const subtotalComCupom = subtotal - descontoCupomVal;
  const totalPix = subtotalComCupom * (1 - Number(config.financeiro.descontoPix || 0) / 100);
  const totalCartao = subtotalComCupom;
  const descontoPix = Number(config.financeiro.descontoPix || 0);
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

  const registrarPedidos = async (metodoEscolhido) => {
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

    const cupomAtivo = metodoEscolhido === "pix" ? cupomAplicado : null;
    const descontoCupomDoMetodo = calcularDescontoCupom(cupomAtivo, subtotal);
    const fator = subtotal > 0 ? (subtotal - descontoCupomDoMetodo) / subtotal : 1;

    const precoAjustado = (i) => Math.round(i.precoUnit * fator * 100) / 100;
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
          MetodoPagamento: metodoEscolhido === "pix" ? "InfinitePay Pix" : "Mercado Pago",
          Cupom: cupomAtivo ? cupomAtivo.Codigo : null,
          ValorCupom: Math.round(descontoCupomDoMetodo * 100) / 100,
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
          MetodoPagamento: metodoEscolhido === "pix" ? "InfinitePay Pix" : "Mercado Pago",
          Cupom: cupomAtivo ? cupomAtivo.Codigo : null,
          ValorCupom: Math.round(descontoCupomDoMetodo * 100) / 100,
          DataEncomenda: new Date().toLocaleDateString("pt-BR"),
          HoraEncomenda: new Date().toLocaleTimeString("pt-BR"),
          Status: "Aguardando Pagamento",
          Itens: itensDe(encomenda),
        });
        encomendaCriadaPath = `encomendas/${usuario.uid}/${loteRef.key}`;
        nsu = (loteRef.key || nsu).replace(/[^a-zA-Z0-9]/g, "");
      }
    } catch (erro) {
      toast.error(`Falha ao registrar o pedido: ${String((erro && (erro.code || erro.message)) || erro).slice(0, 90)}. Se for "permission denied", aplique as regras do README.`);
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
          cupom: cupomAtivo ? cupomAtivo.Codigo : "",
          dataHora: new Date().toLocaleString("pt-BR"),
        }),
      }).catch(() => {});
    } catch (e) {}

    return { nsu, itensAjustados, valorTotalAjustado, pedidoKey: pedidoCriadoKey, encomendaPath: encomendaCriadaPath, cupomAtivo };
  };

  // URL do webhook salva em Admin > Pagamentos ("URL ActivePieces"). Só https é aceita.
  const webhookInfinitePay = () => {
    const urlWebhook = String(config.pagamentos.infinitepayWebhookUrl || "").trim();
    return /^https:\/\/\S+$/i.test(urlWebhook) ? { webhook_url: urlWebhook } : {};
  };

  const pagarPix = async () => {
    setProcessando("pix");
    try {
      const compra = await registrarPedidos("pix");
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
      // A InfinitePay só chama o webhook se a URL for enviada NA CRIAÇÃO de cada link (campo webhook_url).
      const payloadLink = {
        handle,
        redirect_url: window.location.origin + "/meus-pedidos",
        order_nsu: compra.nsu,
        items,
        ...webhookInfinitePay(),
      };

      let url = null;
      if (webhookN8n) {
        try {
          const resposta = await fetch(webhookN8n, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadLink),
          });
          const dados = await resposta.json();
          url = (dados && (dados.url || (dados.body && dados.body.url) || (dados.data && dados.data.url))) || null;
        } catch (e) {
          url = null;
        }
      }
      if (!url) {
        // Direto na InfinitePay (o caminho padrão)
        const resposta = await fetch(API_INFINITEPAY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadLink),
        });
        if (!resposta.ok) throw new Error("InfinitePay recusou o checkout");
        const dados = await resposta.json();
        url = dados.url || dados.checkout_url || null;
      }
      if (!url) throw new Error("Sem URL de checkout");

      // Guarda os identificadores do pagamento no pedido para confirmar depois
      try {
        const dadosLink = null;
        const ids = { order_nsu: compra.nsu, slug: "", transaction_nsu: "", salvoEm: Date.now() };
        if (compra.pedidoKey) await update(ref(db, `pedidos/${compra.pedidoKey}`), { PagamentoInfinitePay: ids });
        if (compra.encomendaPath) await update(ref(db, compra.encomendaPath), { PagamentoInfinitePay: ids });
      } catch (e) {}

      itensAtivos.forEach((i) => removerDoCarrinho(i));
      await registrarUsoCupom(compra.cupomAtivo ? compra.cupomAtivo.Key : null);
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
      const compra = await registrarPedidos("cartao");
      if (!compra) return;

      try {
        const corpoMP = {
          items: compra.itensAjustados.map((i) => ({
            title: (i.Variante ? `${i.Nome} - ${i.Variante}` : i.Nome).toUpperCase(),
            quantity: i.Quantidade,
            unit_price: Number(i.PrecoReal),
          })),
          payerEmail: (auth.currentUser && auth.currentUser.email) || "",
          origin: window.location.origin,
          orderNsu: compra.nsu,
        };

        // Sem secrets no Cloudflare? Um fluxo do ActivePieces cria o pagamento:
        // lê o Access Token salvo no painel (Firebase) e devolve { url }.
        const webhookCriar = String(config.pagamentos.mercadoPagoWebhookCriar || "").trim();
        let initPoint = null;
        if (/^https:\/\//i.test(webhookCriar)) {
          const respostaFluxo = await fetch(webhookCriar, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpoMP),
          });
          const dadosFluxo = await respostaFluxo.json();
          initPoint =
            (dadosFluxo &&
              (dadosFluxo.url ||
                dadosFluxo.initPoint ||
                dadosFluxo.init_point ||
                (dadosFluxo.body && dadosFluxo.body.url) ||
                (dadosFluxo.data && dadosFluxo.data.url))) ||
            null;
          if (!initPoint) throw new Error("O fluxo do ActivePieces respondeu, mas sem o link de pagamento.");
        } else {
          const resposta = await fetch(`${apiBase}/api/mercadopago/create-preference`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpoMP),
          });
          const dados = await resposta.json();
          if (!resposta.ok || !dados.initPoint) {
            throw new Error(dados.error || "Falha ao iniciar pagamento");
          }
          initPoint = dados.initPoint;
        }

        // Liga o pagamento MP aos registros do pedido (para confirmar o status depois)
        try {
          const idsMP = { orderNsu: compra.nsu, salvoEm: Date.now() };
          if (compra.pedidoKey) await update(ref(db, `pedidos/${compra.pedidoKey}`), { PagamentoMercadoPago: idsMP });
          if (compra.encomendaPath) await update(ref(db, compra.encomendaPath), { PagamentoMercadoPago: idsMP });
        } catch (e) {}

        itensAtivos.forEach((i) => removerDoCarrinho(i));
        setCarrinhoAberto(false);
        window.location.assign(initPoint);
        return;
      } catch (erroMP) {
        const mensagem = String(erroMP.message || "");
        const semConfiguracao = mensagem.includes("não foi configurado") || mensagem.includes("sem-token");
        if (!semConfiguracao) {
          toast.error(mensagem || "Não foi possível iniciar o pagamento com cartão.");
          return;
        }
        // Mercado Pago ainda não configurado. A InfinitePay da loja é SOMENTE Pix,
        // então não redirecionamos o cartão para lá: cancela o registro e orienta a cliente.
        try {
          const correcao = { Status: "Cancelado", MotivoCancelamento: "Cartão indisponível (Mercado Pago não configurado)" };
          if (compra.pedidoKey) await update(ref(db, `pedidos/${compra.pedidoKey}`), correcao);
          if (compra.encomendaPath) await update(ref(db, compra.encomendaPath), correcao);
        } catch (e) {}
        toast.error("Pagamento com cartão indisponível no momento. Por favor, finalize com Pix.");
        setMetodo("pix");
        return;
      }
    } catch (erro) {
      toast.error(erro.message || "Não foi possível iniciar o pagamento com cartão.");
    } finally {
      setProcessando(null);
    }
  };

  const aoPagar = () => (metodo === "pix" ? pagarPix() : pagarCartao());

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
              <div className="flex items-center gap-3">
                {etapa === "pagamento" && (
                  <button onClick={() => setEtapa("carrinho")} className="p-1.5 rounded-full hover:bg-creme text-espresso" aria-label="Voltar para a sacola" data-testid="checkout-voltar-botao">
                    <FiArrowLeft size={17} />
                  </button>
                )}
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-espresso" data-testid="sacola-titulo">
                  {etapa === "carrinho" ? `Sua Sacola (${carrinho.length})` : "Finalizar Compra"}
                </h2>
              </div>
              <button onClick={() => setCarrinhoAberto(false)} className="p-1.5 rounded-full hover:bg-creme text-espresso" aria-label="Fechar sacola" data-testid="sacola-fechar">
                <FiX size={18} />
              </button>
            </div>

            {/* ─── ETAPA 1: CARRINHO ─── */}
            {etapa === "carrinho" && (
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
            )}

            {/* ─── ETAPA 2: PAGAMENTO ─── */}
            {etapa === "pagamento" && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-2" data-testid="checkout-resumo-itens">
                  {itensAtivos.map((item) => {
                    const chave = `${item.Id}__${item.varianteId || "base"}`;
                    return (
                      <div key={chave} className="flex items-center gap-3 bg-white border border-espresso/5 rounded-xl px-3 py-2">
                        <div className="w-9 h-11 bg-creme rounded-lg overflow-hidden border border-espresso/5 shrink-0">
                          {item.FotoUrl && <img src={item.FotoUrl} alt={item.Nome} className="w-full h-full object-cover" />}
                        </div>
                        <p className="flex-1 text-[10px] font-bold text-espresso uppercase tracking-wide truncate">
                          {item.quantidadeCarrinho}x {item.Nome}
                          {item.varianteNome && <span className="text-rose"> · {item.varianteNome}</span>}
                        </p>
                        <span className="text-[11px] font-mono text-espresso/50 shrink-0">
                          {brl(item.precoUnit * item.quantidadeCarrinho)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-espresso/40 mb-2.5">Forma de pagamento</p>
                  <div className="space-y-2.5">
                    <button
                      onClick={() => setMetodo("pix")}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${metodo === "pix" ? "border-rose bg-rose/5 shadow-sm" : "border-espresso/10 bg-white hover:border-pessego"}`}
                      data-testid="checkout-metodo-pix"
                    >
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${metodo === "pix" ? "bg-rose text-white" : "bg-creme text-espresso/50"}`}>
                        <FiZap size={16} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-xs font-bold text-espresso uppercase tracking-wide">Pix · InfinitePay</span>
                        <span className="block text-[10px] text-espresso/45 mt-0.5">
                          {descontoPix > 0 ? `Com ${descontoPix}% de desconto · aprovação imediata` : "Aprovação imediata"}
                        </span>
                      </span>
                      {metodo === "pix" && <FiCheckCircle className="text-rose shrink-0" size={16} />}
                    </button>

                    <button
                      onClick={() => setMetodo("cartao")}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${metodo === "cartao" ? "border-rose bg-rose/5 shadow-sm" : "border-espresso/10 bg-white hover:border-pessego"}`}
                      data-testid="checkout-metodo-cartao"
                    >
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${metodo === "cartao" ? "bg-rose text-white" : "bg-creme text-espresso/50"}`}>
                        <FiCreditCard size={16} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-xs font-bold text-espresso uppercase tracking-wide">Cartão · Mercado Pago</span>
                        <span className="block text-[10px] text-espresso/45 mt-0.5">Até {maxParcelas}x no cartão de crédito</span>
                      </span>
                      {metodo === "cartao" && <FiCheckCircle className="text-rose shrink-0" size={16} />}
                    </button>
                  </div>
                </div>

                {metodo === "pix" ? (
                  cupomAplicado ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5" data-testid="sacola-cupom-ativo">
                      <div className="flex items-center gap-2.5">
                        <FiTag className="text-emerald-700" size={14} />
                        <div>
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Cupom {cupomAplicado.Codigo}</p>
                          <p className="text-[10px] text-emerald-700">−{brl(descontoCupomVal)} de desconto no Pix</p>
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
                          placeholder="Cupom de desconto (só no Pix)"
                          className="flex-1 px-4 py-2.5 bg-white border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs font-mono uppercase text-espresso placeholder:normal-case placeholder:font-sans"
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
                  )
                ) : (
                  <div className="flex items-center gap-2 bg-creme/70 border border-espresso/5 rounded-xl px-4 py-2.5" data-testid="checkout-cupom-indisponivel">
                    <FiTag className="text-espresso/30 shrink-0" size={13} />
                    <p className="text-[10px] text-espresso/45">
                      {cupomAplicado
                        ? `O cupom ${cupomAplicado.Codigo} vale apenas para pagamento via Pix.`
                        : "Cupons são válidos apenas para pagamento via Pix."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ─── RODAPÉ CONTEXTO-DEPENDENTE ─── */}
            <div className="p-5 bg-white border-t border-pessego/20 shadow-sm space-y-3">
              {etapa === "carrinho" ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-espresso/50">Subtotal selecionado</span>
                    <span className="text-lg font-display font-black text-rose" data-testid="sacola-subtotal">{brl(subtotal)}</span>
                  </div>
                  <button
                    onClick={() => setEtapa("pagamento")}
                    disabled={itensAtivos.length === 0}
                    className="w-full bg-espresso hover:bg-ink disabled:bg-espresso/20 text-creme py-4 rounded-2xl text-xs font-bold uppercase tracking-[0.25em] transition-all shadow-md"
                    data-testid="sacola-comprar-botao"
                  >
                    Comprar
                  </button>
                  <p className="text-center text-[9px] text-espresso/35 uppercase tracking-widest">
                    Pix com {descontoPix > 0 ? `${descontoPix}% off` : "desconto"} · Cartão em até {maxParcelas}x
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-espresso/50">
                      <span className="uppercase tracking-widest font-semibold">Itens</span>
                      <span className="font-mono">{brl(subtotal)}</span>
                    </div>
                    {metodo === "pix" && descontoCupomVal > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700" data-testid="sacola-linha-cupom">
                        <span className="uppercase tracking-widest font-semibold">Cupom {cupomAplicado.Codigo}</span>
                        <span className="font-mono font-bold">−{brl(descontoCupomVal)}</span>
                      </div>
                    )}
                    {metodo === "pix" && descontoPix > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700">
                        <span className="uppercase tracking-widest font-semibold">Desconto do Pix ({descontoPix}%)</span>
                        <span className="font-mono font-bold">−{brl(subtotalComCupom - totalPix)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-semibold uppercase tracking-widest text-espresso/50">Total a pagar</span>
                      <span className="text-xl font-display font-black text-rose" data-testid="checkout-total">
                        {brl(metodo === "pix" ? totalPix : totalCartao)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={aoPagar}
                    disabled={itensAtivos.length === 0 || processando !== null}
                    className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-[0.25em] transition-all shadow-md flex items-center justify-center gap-2 ${
                      metodo === "pix" ? "bg-espresso hover:bg-ink text-creme" : "bg-rose hover:bg-rosedark text-white"
                    } disabled:opacity-50`}
                    data-testid="checkout-pagar-botao"
                  >
                    {processando ? (
                      <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        {metodo === "pix" ? (
                          <><FiZap size={14} /> Pagar com Pix · {brl(totalPix)}</>
                        ) : (
                          <><FiCreditCard size={14} /> Pagar com Cartão · {brl(totalCartao)}</>
                        )}
                        <FiChevronRight size={14} />
                      </>
                    )}
                  </button>
                  <p className="text-center text-[9px] text-espresso/35 uppercase tracking-widest">
                    {metodo === "pix" ? "Você será levada ao checkout seguro da InfinitePay" : "Você será levada ao checkout seguro do Mercado Pago"}
                  </p>
                </>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
