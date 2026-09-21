// src/pages/admin/AbaVitrine.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref as dbRef, onValue, set as dbSet } from "firebase/database";
import { toast } from "sonner";
import { normalizarProduto } from "../../lib/produtos";
import { FiImage, FiStar, FiSave, FiCheck } from "react-icons/fi";

export default function AbaVitrine({ config }) {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [heroKey, setHeroKey] = useState((config.vitrine && config.vitrine.heroKey) || "");
  const [destaques, setDestaques] = useState((config.vitrine && config.vitrine.destaques) || []);
  const [salvando, setSalvando] = useState(false);

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
      () => {
        toast.error("Sem permissão para ler produtos — verifique as regras do Firebase.");
        setCarregando(false);
      }
    );
    return () => unsub();
  }, []);

  const fotoDe = (produto) =>
    (produto && (produto.FotoUrl || (produto.Variantes[0] && produto.Variantes[0].FotoUrl))) || "";

  const alternarDestaque = (chave) => {
    setDestaques((atual) => {
      if (atual.includes(chave)) return atual.filter((k) => k !== chave);
      if (atual.length >= 4) {
        toast.error("Escolha até 4 produtos para os destaques.");
        return atual;
      }
      return [...atual, chave];
    });
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await dbSet(dbRef(db, "configuracoes/vitrine"), { heroKey, destaques });
      toast.success("Vitrine atualizada! A home já mostra as suas escolhas.");
    } catch (erro) {
      toast.error("Falha ao salvar. Verifique as regras de escrita do Firebase.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div data-testid="admin-aba-vitrine">
      <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg mb-6">
        <div className="flex items-center gap-3 mb-1">
          <FiImage className="text-rose" size={18} />
          <h2 className="font-display text-xl font-bold text-espresso">Imagem de abertura do site</h2>
        </div>
        <p className="text-[11px] text-espresso/50 mb-6">
          Escolha qual produto cadastrado aparece na foto grande do início do site. Se nenhum for escolhido,
          mantemos a imagem padrão.
        </p>

        {carregando ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" />
          </div>
        ) : produtos.length === 0 ? (
          <p className="text-xs text-espresso/40 italic py-6 text-center">Cadastre produtos primeiro (aba Produtos).</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            <button
              onClick={() => setHeroKey("")}
              className={`rounded-2xl border-2 overflow-hidden transition-all bg-creme aspect-[3/4] flex flex-col items-center justify-center gap-2 ${
                heroKey === "" ? "border-rose" : "border-espresso/10 hover:border-pessego"
              }`}
              data-testid="vitrine-hero-padrao"
            >
              <FiImage className="text-espresso/30" size={20} />
              <span className="text-[9px] font-bold uppercase tracking-widest text-espresso/40 px-2 text-center">
                Imagem padrão
              </span>
            </button>
            {produtos.map((produto) => {
              const foto = fotoDe(produto);
              const escolhido = heroKey === produto.FirebaseKey;
              return (
                <button
                  key={produto.FirebaseKey}
                  onClick={() => setHeroKey(produto.FirebaseKey)}
                  className={`relative rounded-2xl border-2 overflow-hidden aspect-[3/4] bg-creme transition-all ${
                    escolhido ? "border-rose shadow-md" : "border-espresso/10 hover:border-pessego"
                  }`}
                  data-testid={`vitrine-hero-${produto.FirebaseKey}`}
                >
                  {foto ? (
                    <img src={foto} alt={produto.Nome} className="w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] uppercase tracking-widest text-espresso/25">
                      Sem foto
                    </span>
                  )}
                  {escolhido && (
                    <span className="absolute top-1.5 right-1.5 bg-rose text-white rounded-full p-1">
                      <FiCheck size={10} />
                    </span>
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-espresso/70 text-creme text-[8px] font-semibold uppercase tracking-wide px-1.5 py-1 truncate text-left">
                    {produto.Nome}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-1">
          <FiStar className="text-gold" size={18} />
          <h2 className="font-display text-xl font-bold text-espresso">
            Amados e requisitados ({destaques.length}/4)
          </h2>
        </div>
        <p className="text-[11px] text-espresso/50 mb-6">
          Marque até 4 produtos para a seção de destaques da home. Sem seleção, mostramos os 4 primeiros do
          catálogo.
        </p>

        {carregando ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" />
          </div>
        ) : produtos.length === 0 ? (
          <p className="text-xs text-espresso/40 italic py-6 text-center">Cadastre produtos primeiro (aba Produtos).</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {produtos.map((produto) => {
              const foto = fotoDe(produto);
              const indice = destaques.indexOf(produto.FirebaseKey);
              const escolhido = indice !== -1;
              return (
                <button
                  key={produto.FirebaseKey}
                  onClick={() => alternarDestaque(produto.FirebaseKey)}
                  className={`relative rounded-2xl border-2 overflow-hidden aspect-[3/4] bg-creme transition-all ${
                    escolhido ? "border-gold shadow-md" : "border-espresso/10 hover:border-pessego"
                  }`}
                  data-testid={`vitrine-destaque-${produto.FirebaseKey}`}
                >
                  {foto ? (
                    <img src={foto} alt={produto.Nome} className="w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] uppercase tracking-widest text-espresso/25">
                      Sem foto
                    </span>
                  )}
                  {escolhido && (
                    <span className="absolute top-1.5 right-1.5 bg-gold text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-bold">
                      {indice + 1}
                    </span>
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-espresso/70 text-creme text-[8px] font-semibold uppercase tracking-wide px-1.5 py-1 truncate text-left">
                    {produto.Nome}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={salvar}
        disabled={salvando}
        className="mt-8 w-full md:w-auto flex items-center justify-center gap-2 bg-espresso hover:bg-ink text-creme px-8 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-md transition-all"
        data-testid="vitrine-salvar-botao"
      >
        <FiSave size={13} /> {salvando ? "Salvando..." : "Salvar Vitrine"}
      </button>
    </div>
  );
}
