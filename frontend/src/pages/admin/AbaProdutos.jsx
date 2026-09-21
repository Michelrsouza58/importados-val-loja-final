// src/pages/admin/AbaProdutos.jsx
import React, { useState, useEffect } from "react";
import { db, storage } from "../../lib/firebase";
import { ref as dbRef, onValue, set as dbSet, remove, push, get, runTransaction } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { CATEGORIAS, normalizarProduto } from "../../lib/produtos";
import { brl } from "../../lib/formato";
import { FiPlus, FiTrash2, FiImage, FiX, FiSearch } from "react-icons/fi";

const FORM_VAZIO = () => ({
  key: null,
  Nome: "",
  Categoria: "Perfumaria",
  PrecoReal: "",
  Descricao: "",
  CodigoBarras: "",
  QuantidadeEstoque: "",
  FotoUrl: "",
  Variantes: [],
});

export default function AbaProdutos() {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [busca, setBusca] = useState("");

  const produtosFiltrados = produtos.filter((p) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return (
      p.Nome.toLowerCase().includes(termo) ||
      String(p.CodigoBarras).toLowerCase().includes(termo)
    );
  });

  useEffect(() => {
    const produtosRef = dbRef(db, "items");
    const unsub = onValue(
      produtosRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProdutos(Object.entries(snapshot.val()).map(([chave, valores]) => normalizarProduto(chave, valores)));
        } else {
          setProdutos([]);
        }
        setCarregando(false);
      },
      (erro) => {
        toast.error("Sem permissão de leitura no Firebase — verifique as regras do Realtime Database.");
        setCarregando(false);
      }
    );
    return () => unsub();
  }, []);

  const abrirNovo = async () => {
    setForm(FORM_VAZIO());
    try {
      const snap = await get(dbRef(db, "configuracoes/ultimoCodigoProduto"));
      const atual = Number(snap.val() || 0);
      setForm((f) => ({ ...f, CodigoBarras: `IV${String(atual + 1).padStart(6, "0")}` }));
    } catch (erro) {}
  };

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const setVariante = (idx, campo, valor) =>
    setForm((f) => ({
      ...f,
      Variantes: f.Variantes.map((v, i) => (i === idx ? { ...v, [campo]: valor } : v)),
    }));

  const removerVariante = (idx) =>
    setForm((f) => ({ ...f, Variantes: f.Variantes.filter((_, i) => i !== idx) }));

  const adicionarVariante = () =>
    setForm((f) => ({ ...f, Variantes: [...f.Variantes, { Nome: "", FotoUrl: "", Preco: "", QuantidadeEstoque: "" }] }));

  const subirImagem = async (arquivo, destino) => {
    if (!arquivo) return;
    setSubindo(true);
    try {
      const caminho = `produtos/${Date.now()}_${arquivo.name.replace(/\s+/g, "_")}`;
      const r = storageRef(storage, caminho);
      await uploadBytes(r, arquivo);
      const url = await getDownloadURL(r);
      destino(url);
      toast.success("Imagem enviada para o Firebase Storage.");
    } catch (erro) {
      toast.error("Falha no upload (verifique as regras do Storage). Cole a URL da imagem manualmente.");
    } finally {
      setSubindo(false);
    }
  };

  const salvar = async () => {
    if (!form.Nome.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    setSalvando(true);
    try {
      let codigoFinal = form.CodigoBarras.trim();
      if (!form.key) {
        if (!codigoFinal) {
          const resultado = await runTransaction(dbRef(db, "configuracoes/ultimoCodigoProduto"), (atual) => (atual === null ? 1 : atual + 1));
          codigoFinal = `IV${String(resultado.snapshot.val()).padStart(6, "0")}`;
        } else {
          try {
            await runTransaction(dbRef(db, "configuracoes/ultimoCodigoProduto"), (atual) => (atual === null ? 1 : atual + 1));
          } catch (erro) {}
        }
      }

      const variantesObj = {};
      form.Variantes.forEach((v) => {
        if (v.Nome && v.Nome.trim()) {
          const chave = `v${Math.random().toString(36).substring(2, 8)}`;
          variantesObj[chave] = {
            Nome: v.Nome.trim(),
            FotoUrl: v.FotoUrl || "",
            Preco: Number(v.Preco) || 0,
            QuantidadeEstoque: Number(v.QuantidadeEstoque) || 0,
          };
        }
      });

      const dados = {
        Nome: form.Nome.trim(),
        Categoria: form.Categoria,
        PrecoReal: Number(String(form.PrecoReal).replace(",", ".")) || 0,
        Descricao: form.Descricao || "",
        CodigoBarras: codigoFinal || "---",
        QuantidadeEstoque: Number(form.QuantidadeEstoque) || 0,
        FotoUrl: form.FotoUrl || "",
        Variantes: variantesObj,
      };

      if (form.key) {
        await dbSet(dbRef(db, `items/${form.key}`), dados);
      } else {
        await dbSet(push(dbRef(db, "items")), dados);
      }
      toast.success(form.key ? "Produto atualizado!" : "Produto cadastrado!");
      setForm(null);
    } catch (erro) {
      toast.error("Falha ao salvar: verifique as regras de escrita do Realtime Database.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (produto) => {
    if (!window.confirm(`Excluir "${produto.Nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove(dbRef(db, `items/${produto.FirebaseKey}`));
      toast.success("Produto excluído.");
    } catch (erro) {
      toast.error("Falha ao excluir. Verifique as regras do Firebase.");
    }
  };

  const editar = (produto) => {
    setForm({
      key: produto.FirebaseKey,
      Nome: produto.Nome,
      Categoria: produto.Categoria,
      PrecoReal: String(produto.PrecoReal),
      Descricao: produto.Descricao === "Nenhuma descrição informada para este produto." ? "" : produto.Descricao,
      CodigoBarras: produto.CodigoBarras === "---" ? "" : produto.CodigoBarras,
      QuantidadeEstoque: String(produto.QuantidadeEstoque),
      FotoUrl: produto.FotoUrl,
      Variantes: produto.Variantes.map((v) => ({
        Nome: v.Nome,
        FotoUrl: v.FotoUrl,
        Preco: v.Preco ? String(v.Preco) : "",
        QuantidadeEstoque: String(v.QuantidadeEstoque),
      })),
    });
  };

  const campoClasse =
    "w-full px-4 py-2.5 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso";

  return (
    <div data-testid="admin-aba-produtos">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-espresso">Produtos ({produtos.length})</h2>
        <button
          onClick={() => setForm(FORM_VAZIO())}
          className="hidden md:flex md:items-center md:gap-2 bg-rose hover:bg-rosedark text-white px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md transition-all"
          data-testid="admin-produto-novo-botao"
        >
          <FiPlus size={13} /> Novo Produto
        </button>
        <button
          onClick={abrirNovo}
          className="flex md:hidden items-center gap-2 bg-rose hover:bg-rosedark text-white px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md transition-all"
          data-testid="admin-produto-novo-botao-mobile"
        >
          <FiPlus size={13} /> Novo Produto
        </button>
      </div>

      <div className="max-w-sm relative mb-6">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-rose" size={13} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código (IV000001)..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso"
          data-testid="admin-produtos-busca"
        />
      </div>

      {form && (
        <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg mb-8" data-testid="admin-produto-form">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display font-bold text-espresso">{form.key ? "Editar produto" : "Novo produto"}</h3>
            <button onClick={() => setForm(null)} className="p-2 hover:bg-creme rounded-full text-espresso/50" aria-label="Fechar formulário" data-testid="admin-produto-form-fechar">
              <FiX size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Nome *</label>
              <input value={form.Nome} onChange={(e) => set("Nome", e.target.value)} className={campoClasse} placeholder="Ex: Body Splash Premium 250ml" data-testid="admin-produto-nome" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Categoria</label>
              <select value={form.Categoria} onChange={(e) => set("Categoria", e.target.value)} className={campoClasse} data-testid="admin-produto-categoria">
                {CATEGORIAS.filter((c) => c !== "Todos").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Preço (R$)</label>
              <input value={form.PrecoReal} onChange={(e) => set("PrecoReal", e.target.value)} className={campoClasse} placeholder="79.90" data-testid="admin-produto-preco" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Estoque (0 = sob encomenda)</label>
              <input value={form.QuantidadeEstoque} onChange={(e) => set("QuantidadeEstoque", e.target.value)} className={campoClasse} placeholder="10" data-testid="admin-produto-estoque" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Código do produto (IV000001)</label>
              <input value={form.CodigoBarras} onChange={(e) => set("CodigoBarras", e.target.value.toUpperCase())} className={`${campoClasse} font-mono uppercase`} placeholder="IV000001 — gerado automaticamente" data-testid="admin-produto-codigo" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Foto principal (URL ou upload)</label>
              <div className="flex gap-2">
                <input value={form.FotoUrl} onChange={(e) => set("FotoUrl", e.target.value)} className={campoClasse} placeholder="https://..." data-testid="admin-produto-foto-url" />
                <label className="shrink-0 flex items-center justify-center px-3 rounded-xl bg-espresso text-creme cursor-pointer hover:bg-ink transition-colors">
                  <FiImage size={15} />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => subirImagem(e.target.files[0], (url) => set("FotoUrl", url))} data-testid="admin-produto-foto-upload" />
                </label>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Descrição</label>
              <textarea value={form.Descricao} onChange={(e) => set("Descricao", e.target.value)} rows={3} className={campoClasse} placeholder="Descreva o produto..." data-testid="admin-produto-descricao" />
            </div>
          </div>

          <div className="mt-6 border-t border-espresso/5 pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Tipos / Variantes do produto</label>
                <p className="text-[10px] text-espresso/40 mt-0.5">Ex: Aroma 1, Aroma 2 — cada tipo pode ter foto, preço e estoque próprios.</p>
              </div>
              <button
                onClick={adicionarVariante}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-rose hover:text-rosedark"
                data-testid="admin-produto-variante-add"
              >
                <FiPlus size={12} /> Adicionar tipo
              </button>
            </div>

            {form.Variantes.length === 0 && (
              <p className="text-[11px] text-espresso/35 italic">Sem variantes — o cliente compra o produto direto.</p>
            )}

            <div className="space-y-3">
              {form.Variantes.map((v, idx) => (
                <div key={idx} className="bg-creme/60 border border-pessego/20 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end" data-testid="admin-produto-variante-linha">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-espresso/40">Nome do tipo</label>
                    <input value={v.Nome} onChange={(e) => setVariante(idx, "Nome", e.target.value)} className={campoClasse} placeholder="Aroma 1" data-testid={`admin-variante-nome-${idx}`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-espresso/40">Preço (opcional)</label>
                    <input value={v.Preco} onChange={(e) => setVariante(idx, "Preco", e.target.value)} className={campoClasse} placeholder="Vazio = preço principal" data-testid={`admin-variante-preco-${idx}`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-espresso/40">Estoque</label>
                    <input value={v.QuantidadeEstoque} onChange={(e) => setVariante(idx, "QuantidadeEstoque", e.target.value)} className={campoClasse} placeholder="0" data-testid={`admin-variante-estoque-${idx}`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-espresso/40">Foto do tipo</label>
                    <div className="flex gap-2">
                      <input value={v.FotoUrl} onChange={(e) => setVariante(idx, "FotoUrl", e.target.value)} className={campoClasse} placeholder="URL da foto" data-testid={`admin-variante-foto-${idx}`} />
                      <label className="shrink-0 flex items-center justify-center px-3 rounded-xl bg-espresso text-creme cursor-pointer hover:bg-ink transition-colors">
                        <FiImage size={14} />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => subirImagem(e.target.files[0], (url) => setVariante(idx, "FotoUrl", url))} />
                      </label>
                      <button onClick={() => removerVariante(idx)} className="shrink-0 px-3 rounded-xl border border-rose/30 text-rose hover:bg-rose/5" aria-label="Remover variante">
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={salvar}
              disabled={salvando || subindo}
              className="flex-1 bg-rose hover:bg-rosedark disabled:bg-rose/40 text-white py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-md transition-all"
              data-testid="admin-produto-salvar-botao"
            >
              {salvando ? "Salvando..." : form.key ? "Salvar Alterações" : "Cadastrar Produto"}
            </button>
            <button
              onClick={() => setForm(null)}
              className="px-6 border border-espresso/15 text-espresso/60 hover:bg-creme rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all"
              data-testid="admin-produto-cancelar-botao"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" />
        </div>
      ) : produtos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-pessego/20 p-12 text-center" data-testid="admin-produtos-vazio">
          <p className="text-xs uppercase tracking-wider text-espresso/50 font-bold">Nenhum produto cadastrado ainda.</p>
          <p className="text-[11px] text-espresso/40 mt-2">Clique em "Novo Produto" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {produtosFiltrados.map((produto) => (
            <div
              key={produto.FirebaseKey}
              onClick={() => editar(produto)}
              className="bg-white rounded-2xl border border-pessego/20 p-4 flex items-center gap-4 shadow-sm relative cursor-pointer hover:border-rose/50 hover:shadow-md transition-all"
              data-testid={`admin-produto-linha-${produto.FirebaseKey}`}
            >
              <div className="w-14 h-16 bg-creme rounded-xl overflow-hidden border border-espresso/5 shrink-0">
                {produto.FotoUrl && <img src={produto.FotoUrl} alt={produto.Nome} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-espresso uppercase tracking-wide truncate">{produto.Nome}</h4>
                <p className="text-[10px] text-espresso/40 mt-0.5">
                  {produto.Categoria} · {produto.Variantes.length > 0 ? `${produto.Variantes.length} tipo(s)` : "sem variantes"} ·{" "}
                  estoque {produto.QuantidadeEstoque}
                </p>
                <p className="text-xs font-mono font-bold text-rose mt-1">{brl(produto.PrecoReal)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); excluir(produto); }}
                className="absolute top-3 right-3 p-2 rounded-xl bg-white border border-rose/20 text-rose hover:bg-rose/5 shadow-sm transition-all"
                aria-label="Excluir"
                data-testid={`admin-produto-excluir-${produto.FirebaseKey}`}
              >
                <FiTrash2 size={13} />
              </button>
            </div>
          ))}
          {produtosFiltrados.length === 0 && produtos.length > 0 && (
            <p className="text-center text-xs text-espresso/40 py-8 italic" data-testid="admin-produtos-busca-vazia">
              Nenhum produto encontrado com "{busca}".
            </p>
          )}
        </div>
      )}
    </div>
  );
}
