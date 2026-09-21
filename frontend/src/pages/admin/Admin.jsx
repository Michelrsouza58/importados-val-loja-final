// src/pages/admin/Admin.jsx
import React, { useState, useEffect } from "react";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { toast } from "sonner";
import { useConfiguracoes, ehAdmin } from "../../lib/configuracoes";
import AbaProdutos from "./AbaProdutos";
import AbaCupons from "./AbaCupons";
import AbaFinanceiro from "./AbaFinanceiro";
import AbaPagamentos from "./AbaPagamentos";
import AbaAdmins from "./AbaAdmins";
import AbaPedidos from "./AbaPedidos";
import { FiMail, FiLock, FiLogOut, FiPackage, FiDollarSign, FiCreditCard, FiUsers, FiShoppingBag, FiTag } from "react-icons/fi";

const ABAS = [
  { chave: "produtos", rotulo: "Produtos", icone: FiPackage, componente: AbaProdutos },
  { chave: "pedidos", rotulo: "Pedidos", icone: FiShoppingBag, componente: AbaPedidos },
  { chave: "cupons", rotulo: "Cupons", icone: FiTag, componente: AbaCupons },
  { chave: "financeiro", rotulo: "Financeiro", icone: FiDollarSign, componente: AbaFinanceiro },
  { chave: "pagamentos", rotulo: "Pagamentos", icone: FiCreditCard, componente: AbaPagamentos },
  { chave: "admins", rotulo: "Administradores", icone: FiUsers, componente: AbaAdmins },
];

export default function Admin() {
  const [usuario, setUsuario] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState("produtos");
  const { config, carregando } = useConfiguracoes();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setCarregandoAuth(false);
    });
    return () => unsub();
  }, []);

  const entrar = async (e) => {
    e.preventDefault();
    if (!email || !senha) {
      toast.error("Preencha e-mail e senha.");
      return;
    }
    setEntrando(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (error) {
      if (error.code === "auth/unauthorized-domain")
        toast.error("Este domínio não está autorizado no Firebase. Adicione-o em Authentication > Settings > Authorized domains.");
      else if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential")
        toast.error("E-mail ou senha incorretos.");
      else toast.error("Não foi possível entrar. Verifique os dados.");
    } finally {
      setEntrando(false);
    }
  };

  const autorizado = ehAdmin(usuario, config);

  return (
    <div className="min-h-screen bg-creme pt-24 pb-20" data-testid="pagina-admin">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-8">
          <p className="uppercase tracking-[0.3em] text-[11px] font-semibold text-rose mb-2">Área restrita</p>
          <h1 className="font-display italic text-4xl text-espresso">Painel da Val</h1>
        </div>

        {carregandoAuth || carregando ? (
          <div className="flex justify-center py-24">
            <div className="w-6 h-6 border-2 border-rose border-t-transparent rounded-full animate-spin" data-testid="admin-carregando" />
          </div>
        ) : !usuario ? (
          <div className="max-w-md mx-auto bg-white rounded-3xl border border-pessego/20 p-8 shadow-lg" data-testid="admin-login-card">
            <h2 className="font-display text-xl font-bold text-espresso text-center">Entrar como administrador</h2>
            <p className="text-[11px] text-espresso/50 text-center mt-2 mb-6">
              Use o e-mail e a senha cadastrados no Firebase Authentication.
            </p>
            <form onSubmit={entrar} className="space-y-4">
              <div className="relative">
                <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-rose" size={14} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="w-full pl-11 pr-4 py-3 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs"
                  data-testid="admin-login-email"
                />
              </div>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-rose" size={14} />
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-creme/60 border border-pessego/30 rounded-xl focus:outline-none focus:border-rose text-xs"
                  data-testid="admin-login-senha"
                />
              </div>
              <button
                type="submit"
                disabled={entrando}
                className="w-full bg-espresso hover:bg-ink text-creme py-3.5 rounded-xl text-xs font-bold uppercase tracking-[0.2em] transition-all shadow-md"
                data-testid="admin-login-botao"
              >
                {entrando ? "Entrando..." : "Entrar no Painel"}
              </button>
            </form>
          </div>
        ) : !autorizado ? (
          <div className="max-w-md mx-auto bg-white rounded-3xl border border-pessego/20 p-8 shadow-lg text-center" data-testid="admin-sem-permissao">
            <h2 className="font-display text-xl font-bold text-espresso">Sem permissão</h2>
            <p className="text-xs text-espresso/50 mt-3">
              A conta <strong>{usuario.email}</strong> não está na lista de administradores.
              Peça para a dona da loja adicionar seu e-mail na aba Administradores.
            </p>
            <button
              onClick={() => signOut(auth)}
              className="mt-6 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-rose"
              data-testid="admin-sair-sem-permissao"
            >
              <FiLogOut size={13} /> Sair
            </button>
          </div>
        ) : (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-8">
              {ABAS.map((aba) => {
                const Icone = aba.icone;
                const ativa = abaAtiva === aba.chave;
                return (
                  <button
                    key={aba.chave}
                    onClick={() => setAbaAtiva(aba.chave)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap transition-all ${
                      ativa
                        ? "bg-espresso text-creme border-espresso shadow-sm"
                        : "bg-white text-espresso/50 border-pessego/20 hover:border-rose hover:text-rose"
                    }`}
                    data-testid={`admin-aba-${aba.chave}`}
                  >
                    <Icone size={13} /> {aba.rotulo}
                  </button>
                );
              })}
            </div>

            {ABAS.map((aba) => {
              const Componente = aba.componente;
              return abaAtiva === aba.chave ? (
                <div key={aba.chave} data-testid={`admin-conteudo-${aba.chave}`}>
                  <Componente config={config} usuario={usuario} />
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
