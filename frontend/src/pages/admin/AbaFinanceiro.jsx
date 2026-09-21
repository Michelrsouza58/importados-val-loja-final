// src/pages/admin/AbaFinanceiro.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref as dbRef, onValue, set as dbSet, remove, push } from "firebase/database";
import { toast } from "sonner";
import { TAXAS_PADRAO } from "../../lib/configuracoes";
import { brl, valorParcela } from "../../lib/formato";
import { FiSave, FiTrash2, FiPlus, FiShoppingBag, FiClock, FiTrendingDown, FiDollarSign } from "react-icons/fi";

const STATUS_PAGO = ["Pago", "Enviado", "Entregue"];

export default function AbaFinanceiro({ config }) {
  const [taxas, setTaxas] = useState(() => {
    const t = {};
    for (let i = 1; i <= 12; i++) t[i] = String(config.financeiro.taxas[i] ?? "");
    return t;
  });
  const [descontoPix, setDescontoPix] = useState(String(config.financeiro.descontoPix ?? 0));
  const [maxParcelas, setMaxParcelas] = useState(String(config.financeiro.maxParcelas || 12));
  const [salvando, setSalvando] = useState(false);

  const [pedidos, setPedidos] = useState([]);
  const [encomendas, setEncomendas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [gastoDescricao, setGastoDescricao] = useState("");
  const [gastoValor, setGastoValor] = useState("");

  useEffect(() => {
    const unsubPedidos = onValue(
      dbRef(db, "pedidos"),
      (snapshot) => {
        if (snapshot.exists()) setPedidos(Object.entries(snapshot.val()).map(([k, v]) => ({ FirebaseKey: k, ...v })));
        else setPedidos([]);
      },
      () => setPedidos([])
    );

    const unsubEncomendas = onValue(
      dbRef(db, "encomendas"),
      (snapshot) => {
        let lista = [];
        if (snapshot.exists()) {
          const dados = snapshot.val();
          lista = Object.entries(dados).flatMap(([uid, lotes]) =>
            Object.entries(lotes || {}).map(([k, v]) => ({ FirebaseKey: k, ...v }))
          );
        }
        setEncomendas(lista);
      },
      () => setEncomendas([])
    );

    const unsubGastos = onValue(
      dbRef(db, "gastos"),
      (snapshot) => {
        if (snapshot.exists()) {
          setGastos(Object.entries(snapshot.val()).map(([k, v]) => ({ FirebaseKey: k, ...v })).reverse());
        } else {
          setGastos([]);
        }
      },
      () => setGastos([])
    );

    return () => {
      unsubPedidos();
      unsubEncomendas();
      unsubGastos();
    };
  }, []);

  const valorDe = (itens) =>
    (itens || []).reduce((soma, i) => soma + Number(i.PrecoReal) * Number(i.Quantidade || 0), 0);

  const totalDe = (item) => Number(item.ValorTotal || 0) || valorDe(item.Itens);

  const pedidosPagos = [...pedidos, ...encomendas].filter((p) => STATUS_PAGO.includes(p.Status || ""));
  const faturamento = pedidosPagos.reduce((s, p) => s + totalDe(p), 0);
  const pendente = [...pedidos, ...encomendas]
    .filter((p) => (p.Status || "") === "Aguardando Pagamento")
    .reduce((s, p) => s + totalDe(p), 0);
  const totalGastos = gastos.reduce((s, g) => s + Number(g.Valor || 0), 0);
  const lucro = faturamento - totalGastos;

  const setTaxa = (parcela, valor) => setTaxas((t) => ({ ...t, [parcela]: valor }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const taxasNum = {};
      for (let i = 1; i <= 12; i++) {
        taxasNum[i] = Number(String(taxas[i]).replace(",", ".")) || 0;
      }
      await dbSet(dbRef(db, "configuracoes/financeiro"), {
        taxas: taxasNum,
        descontoPix: Number(String(descontoPix).replace(",", ".")) || 0,
        maxParcelas: Math.min(12, Math.max(1, Number(maxParcelas) || 12)),
      });
      toast.success("Parâmetros financeiros salvos!");
    } catch (erro) {
      toast.error("Falha ao salvar. Verifique as regras de escrita do Firebase.");
    } finally {
      setSalvando(false);
    }
  };

  const adicionarGasto = async () => {
    const valor = Number(String(gastoValor).replace(",", ".")) || 0;
    if (!gastoDescricao.trim() || !(valor > 0)) {
      toast.error("Informe a descrição e o valor do gasto.");
      return;
    }
    try {
      await dbSet(push(dbRef(db, "gastos")), {
        Descricao: gastoDescricao.trim().slice(0, 80),
        Valor: valor,
        Data: new Date().toLocaleDateString("pt-BR"),
      });
      setGastoDescricao("");
      setGastoValor("");
      toast.success("Gasto registrado!");
    } catch (erro) {
      toast.error("Falha ao registrar o gasto.");
    }
  };

  const removerGasto = async (gasto) => {
    if (!window.confirm(`Remover o gasto "${gasto.Descricao}"?`)) return;
    try {
      await remove(dbRef(db, `gastos/${gasto.FirebaseKey}`));
      toast.success("Gasto removido.");
    } catch (erro) {
      toast.error("Falha ao remover.");
    }
  };

  const campoClasse =
    "w-full px-3 py-2 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso font-mono";

  const cartao = [
    { rotulo: "Faturamento (recebido)", valor: faturamento, detalhe: `${pedidosPagos.length} pedido(s) pago(s)`, icone: FiShoppingBag, cor: "text-emerald-700", teste: "admin-fin-faturamento" },
    { rotulo: "Aguardando pagamento", valor: pendente, detalhe: "pedidos em aberto", icone: FiClock, cor: "text-amber-700", teste: "admin-fin-pendente" },
    { rotulo: "Gastos", valor: totalGastos, detalhe: `${gastos.length} lançamento(s)`, icone: FiTrendingDown, cor: "text-rose", teste: "admin-fin-gastos" },
  ];

  return (
    <div data-testid="admin-aba-financeiro">
      {/* ─── NÚMEROS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {cartao.map((c) => {
          const Icone = c.icone;
          return (
            <div key={c.rotulo} className="bg-white rounded-2xl border border-pessego/20 p-4 md:p-5 shadow-sm" data-testid={c.teste}>
              <div className="flex items-center gap-2 mb-2">
                <Icone className={c.cor} size={14} />
                <p className="text-[9px] font-bold uppercase tracking-widest text-espresso/40 leading-tight">{c.rotulo}</p>
              </div>
              <p className={`font-display font-black text-lg md:text-2xl ${c.cor}`}>{brl(c.valor)}</p>
              <p className="text-[10px] text-espresso/40 mt-1">{c.detalhe}</p>
            </div>
          );
        })}
        <div className="bg-espresso rounded-2xl p-4 md:p-5 shadow-md col-span-2 lg:col-span-1" data-testid="admin-fin-lucro">
          <div className="flex items-center gap-2 mb-2">
            <FiDollarSign className="text-gold" size={14} />
            <p className="text-[9px] font-bold uppercase tracking-widest text-creme/50 leading-tight">Lucro (recebido − gastos)</p>
          </div>
          <p className={`font-display font-black text-lg md:text-2xl ${lucro >= 0 ? "text-gold" : "text-rose"}`}>{brl(lucro)}</p>
          <p className="text-[10px] text-creme/40 mt-1">atualiza sozinho com vendas e gastos</p>
        </div>
      </div>

      {/* ─── GASTOS ─── */}
      <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg mb-6" data-testid="admin-gastos-card">
        <h2 className="font-display text-xl font-bold text-espresso">Gastos da loja</h2>
        <p className="text-[11px] text-espresso/50 mt-1 mb-6">
          Registre aqui os custos (fornecedor, envio, embalagem...) para o lucro ficar certo.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            value={gastoDescricao}
            onChange={(e) => setGastoDescricao(e.target.value)}
            placeholder="O que foi gasto? Ex: embalagens"
            className="flex-1 px-4 py-2.5 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso"
            data-testid="admin-gasto-descricao"
          />
          <input
            value={gastoValor}
            onChange={(e) => setGastoValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarGasto()}
            inputMode="decimal"
            placeholder="R$ 0,00"
            className="sm:w-32 px-4 py-2.5 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso font-mono"
            data-testid="admin-gasto-valor"
          />
          <button
            onClick={adicionarGasto}
            className="shrink-0 flex items-center justify-center gap-2 bg-rose hover:bg-rosedark text-white px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-md transition-all"
            data-testid="admin-gasto-adicionar"
          >
            <FiPlus size={13} /> Lançar
          </button>
        </div>

        {gastos.length === 0 ? (
          <p className="text-[11px] text-espresso/35 italic text-center py-4">Nenhum gasto lançado ainda.</p>
        ) : (
          <div className="space-y-2">
            {gastos.slice(0, 12).map((gasto) => (
              <div key={gasto.FirebaseKey} className="flex items-center justify-between gap-3 bg-creme/50 border border-espresso/5 rounded-xl px-4 py-2.5" data-testid={`admin-gasto-linha-${gasto.FirebaseKey}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-espresso truncate">{gasto.Descricao}</p>
                  <p className="text-[10px] text-espresso/40">{gasto.Data}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-rose">−{brl(gasto.Valor)}</span>
                  <button onClick={() => removerGasto(gasto)} className="p-1.5 rounded-lg border border-rose/20 text-rose hover:bg-rose/5" aria-label="Remover gasto" data-testid={`admin-gasto-remover-${gasto.FirebaseKey}`}>
                    <FiTrash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── PARÂMETROS DE COBRANÇA (taxas embaixo) ─── */}
      <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg">
        <h2 className="font-display text-xl font-bold text-espresso">Parâmetros de cobrança</h2>
        <p className="text-[11px] text-espresso/50 mt-2 mb-8">
          Desconto do Pix, máximo de parcelas e — mais abaixo — a tabela de taxas de parcelamento que o cliente
          vê na loja.
        </p>

        <div className="grid grid-cols-2 gap-4 max-w-md mb-10">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Desconto no Pix (%)</label>
            <input
              value={descontoPix}
              onChange={(e) => setDescontoPix(e.target.value)}
              className={campoClasse}
              inputMode="decimal"
              placeholder="0"
              data-testid="admin-financeiro-desconto-pix"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Máx. parcelas (cartão)</label>
            <input
              value={maxParcelas}
              onChange={(e) => setMaxParcelas(e.target.value)}
              className={campoClasse}
              inputMode="numeric"
              placeholder="12"
              data-testid="admin-financeiro-max-parcelas"
            />
          </div>
        </div>

        <div className="border-t border-espresso/5 pt-8">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-espresso/50 mb-4">
            Taxas por parcela (acréscimo em % — InfinitePay)
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <div key={n} className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-espresso/40">{n}x</label>
                <input
                  value={taxas[n]}
                  onChange={(e) => setTaxa(n, e.target.value)}
                  className={campoClasse}
                  inputMode="decimal"
                  placeholder="0.00"
                  data-testid={`admin-financeiro-taxa-${n}x`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-creme/70 border border-pessego/20 rounded-2xl p-5 mt-8 max-w-md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-espresso/50 mb-3">Pré-visualização</p>
          <p className="text-xs text-espresso/60">
            Um produto de <strong className="font-mono">{brl(100)}</strong> fica:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-espresso/60">
            <li>
              No Pix: <strong className="font-mono text-emerald-700">{brl(100 * (1 - (Number(String(descontoPix).replace(",", ".")) || 0) / 100))}</strong>{" "}
              (com desconto)
            </li>
            <li>
              Em 3x: <strong className="font-mono">{brl(valorParcela(100, 3, { 3: Number(String(taxas[3]).replace(",", ".")) || 0 }))}</strong> por mês
            </li>
            <li>
              Em 12x: <strong className="font-mono">{brl(valorParcela(100, 12, { 12: Number(String(taxas[12]).replace(",", ".")) || 0 }))}</strong> por mês
            </li>
          </ul>
        </div>

        <button
          onClick={salvar}
          disabled={salvando}
          className="mt-8 w-full md:w-auto flex items-center justify-center gap-2 bg-espresso hover:bg-ink text-creme px-8 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-md transition-all"
          data-testid="admin-financeiro-salvar-botao"
        >
          <FiSave size={13} /> {salvando ? "Salvando..." : "Salvar Parâmetros"}
        </button>
      </div>
    </div>
  );
}
