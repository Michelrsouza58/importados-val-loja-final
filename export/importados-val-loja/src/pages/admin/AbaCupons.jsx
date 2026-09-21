// src/pages/admin/AbaCupons.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref as dbRef, onValue, set as dbSet, remove, get } from "firebase/database";
import { toast } from "sonner";
import { cupomKey } from "../../lib/cupons";
import { FiPlus, FiTrash2, FiEdit2, FiTag, FiX } from "react-icons/fi";

const FORM_VAZIO = () => ({ key: null, Codigo: "", Tipo: "percentual", Valor: "", MaxUsos: "", Usados: 0, Ativo: true });

export default function AbaCupons() {
  const [cupons, setCupons] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const cuponsRef = dbRef(db, "cupons");
    const unsub = onValue(
      cuponsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCupons(Object.entries(snapshot.val()).map(([chave, valores]) => ({ Key: chave, ...valores })));
        } else {
          setCupons([]);
        }
        setCarregando(false);
      },
      () => {
        toast.error("Sem permissão para ler cupons — verifique as regras do Firebase.");
        setCarregando(false);
      }
    );
    return () => unsub();
  }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    const key = cupomKey(form.Codigo);
    if (!key) {
      toast.error("Informe o código do cupom (letras e números).");
      return;
    }
    const valor = Number(String(form.Valor).replace(",", "."));
    if (!(valor > 0)) {
      toast.error("Informe o valor do desconto.");
      return;
    }
    if (!form.key) {
      try {
        const existe = await get(dbRef(db, `cupons/${key}`));
        if (existe.exists()) {
          toast.error("Já existe um cupom com esse código.");
          return;
        }
      } catch (erro) {}
    }
    setSalvando(true);
    try {
      await dbSet(dbRef(db, `cupons/${key}`), {
        Codigo: key,
        Tipo: form.Tipo,
        Valor: valor,
        MaxUsos: Math.max(0, Number(form.MaxUsos) || 0),
        Usados: Number(form.Usados) || 0,
        Ativo: !!form.Ativo,
      });
      toast.success(form.key ? "Cupom atualizado!" : "Cupom criado!");
      setForm(null);
    } catch (erro) {
      toast.error("Falha ao salvar o cupom. Verifique as regras de escrita do Firebase.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (cupom) => {
    if (!window.confirm(`Excluir o cupom ${cupom.Codigo}?`)) return;
    try {
      await remove(dbRef(db, `cupons/${cupom.Key}`));
      toast.success("Cupom excluído.");
    } catch (erro) {
      toast.error("Falha ao excluir.");
    }
  };

  const campoClasse =
    "w-full px-4 py-2.5 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs text-espresso";

  return (
    <div data-testid="admin-aba-cupons">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-espresso">Cupons de desconto ({cupons.length})</h2>
          <p className="text-[11px] text-espresso/50 mt-1">
            O cliente aplica o cupom na sacola, na hora do pagamento. O limite de usos é controlado automaticamente.
          </p>
        </div>
        <button
          onClick={() => setForm(FORM_VAZIO())}
          className="flex items-center gap-2 bg-rose hover:bg-rosedark text-white px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md transition-all"
          data-testid="admin-cupom-novo-botao"
        >
          <FiPlus size={13} /> Novo Cupom
        </button>
      </div>

      {form && (
        <div className="bg-white rounded-3xl border border-pessego/30 p-6 md:p-8 shadow-lg mb-8" data-testid="admin-cupom-form">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display font-bold text-espresso">{form.key ? "Editar cupom" : "Novo cupom"}</h3>
            <button onClick={() => setForm(null)} className="p-2 hover:bg-creme rounded-full text-espresso/50" aria-label="Fechar" data-testid="admin-cupom-form-fechar">
              <FiX size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Código *</label>
              <input
                value={form.Codigo}
                onChange={(e) => set("Codigo", e.target.value.toUpperCase())}
                disabled={!!form.key}
                className={`${campoClasse} font-mono uppercase`}
                placeholder="Ex: VALBEMVINDA10"
                data-testid="admin-cupom-codigo"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Tipo</label>
              <select value={form.Tipo} onChange={(e) => set("Tipo", e.target.value)} className={campoClasse} data-testid="admin-cupom-tipo">
                <option value="percentual">% de desconto</option>
                <option value="valor">Valor fixo (R$)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">
                {form.Tipo === "percentual" ? "Desconto (%)" : "Desconto (R$)"}
              </label>
              <input
                value={form.Valor}
                onChange={(e) => set("Valor", e.target.value)}
                className={`${campoClasse} font-mono`}
                placeholder={form.Tipo === "percentual" ? "10" : "15.00"}
                data-testid="admin-cupom-valor"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-espresso/50">Limite de usos</label>
              <input
                value={form.MaxUsos}
                onChange={(e) => set("MaxUsos", e.target.value)}
                className={`${campoClasse} font-mono`}
                placeholder="0 ou vazio = ilimitado"
                data-testid="admin-cupom-maxusos"
              />
            </div>
            <div className="space-y-1.5 flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-espresso font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.Ativo}
                  onChange={(e) => set("Ativo", e.target.checked)}
                  className="w-4 h-4 accent-rose"
                  data-testid="admin-cupom-ativo"
                />
                Cupom ativo
              </label>
            </div>
          </div>

          <button
            onClick={salvar}
            disabled={salvando}
            className="mt-6 w-full md:w-auto bg-rose hover:bg-rosedark disabled:bg-rose/40 text-white px-8 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-md transition-all"
            data-testid="admin-cupom-salvar-botao"
          >
            {salvando ? "Salvando..." : form.key ? "Salvar Alterações" : "Criar Cupom"}
          </button>
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cupons.length === 0 ? (
        <div className="bg-white rounded-3xl border border-pessego/20 p-12 text-center" data-testid="admin-cupons-vazio">
          <FiTag className="mx-auto text-espresso/20 mb-3" size={28} />
          <p className="text-xs uppercase tracking-wider text-espresso/50 font-bold">Nenhum cupom cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cupons.map((cupom) => {
            const max = Number(cupom.MaxUsos || 0);
            const usados = Number(cupom.Usados || 0);
            const esgotado = max > 0 && usados >= max;
            return (
              <div
                key={cupom.Key}
                className="bg-white rounded-2xl border border-pessego/20 p-4 flex flex-wrap items-center gap-4 shadow-sm"
                data-testid={`admin-cupom-linha-${cupom.Key}`}
              >
                <div className="w-10 h-10 rounded-xl bg-creme border border-pessego/20 flex items-center justify-center shrink-0">
                  <FiTag className={cupom.Ativo ? "text-rose" : "text-espresso/25"} size={16} />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-mono font-bold text-espresso">{cupom.Codigo}</p>
                  <p className="text-[10px] text-espresso/40 mt-0.5">
                    {cupom.Tipo === "percentual" ? `${Number(cupom.Valor)}% de desconto` : `R$ ${Number(cupom.Valor).toFixed(2)} de desconto`}
                    {" · "}usos: {usados}
                    {max > 0 ? `/${max}` : " (sem limite)"}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase border ${
                    !cupom.Ativo
                      ? "bg-espresso/5 border-espresso/10 text-espresso/40"
                      : esgotado
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  }`}
                >
                  {!cupom.Ativo ? "Desativado" : esgotado ? "Esgotado" : "Ativo"}
                </span>
                <button
                  onClick={() => setForm({
                    key: cupom.Key,
                    Codigo: cupom.Codigo,
                    Tipo: cupom.Tipo || "percentual",
                    Valor: String(cupom.Valor),
                    MaxUsos: String(cupom.MaxUsos || 0),
                    Usados: Number(cupom.Usados || 0),
                    Ativo: cupom.Ativo !== false,
                  })}
                  className="p-2.5 rounded-xl border border-espresso/10 text-espresso/60 hover:text-rose hover:border-rose/40 transition-all"
                  aria-label="Editar cupom"
                  data-testid={`admin-cupom-editar-${cupom.Key}`}
                >
                  <FiEdit2 size={14} />
                </button>
                <button
                  onClick={() => excluir(cupom)}
                  className="p-2.5 rounded-xl border border-rose/20 text-rose hover:bg-rose/5 transition-all"
                  aria-label="Excluir cupom"
                  data-testid={`admin-cupom-excluir-${cupom.Key}`}
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
