// src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCarrinho } from "../context/CarrinhoContext";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useConfiguracoes, ehAdmin } from "../lib/configuracoes";
import { brl } from "../lib/formato";
import logoVal from "../assets/logo-val.png";
import { FiUser, FiShoppingBag, FiLogOut, FiPackage, FiMenu, FiX, FiSettings } from "react-icons/fi";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItens, valorTotal, setCarrinhoAberto } = useCarrinho();
  const { config } = useConfiguracoes();

  const [usuario, setUsuario] = useState(null);
  const [menuPerfilAberto, setMenuPerfilAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUsuario(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    setMenuAberto(false);
    setMenuPerfilAberto(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuAberto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAberto]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMenuPerfilAberto(false);
      setMenuAberto(false);
      navigate("/");
    } catch (error) {}
  };

  const admin = ehAdmin(usuario, config);
  const links = [
    { para: "/", rotulo: "Início" },
    { para: "/catalogo", rotulo: "Catálogo" },
    { para: "/meus-pedidos", rotulo: "Meus Pedidos" },
  ];

  return (
    <>
      <nav
      className="fixed top-0 left-0 right-0 h-16 z-40 bg-creme/95 backdrop-blur-md border-b border-espresso/10 flex items-center justify-between px-4 sm:px-6"
      data-testid="navbar-principal"
    >
      <div className="flex items-center gap-1.5 sm:gap-4">
        <button
          onClick={() => setMenuAberto(true)}
          className="md:hidden p-1.5 sm:p-2 text-espresso hover:text-rose transition-colors"
          aria-label="Abrir menu"
          data-testid="navbar-menu-mobile-botao"
        >
          <FiMenu size={22} />
        </button>
        <Link to="/" className="focus:outline-none flex items-center gap-1.5 sm:gap-2" data-testid="navbar-logo">
          <img src={logoVal} alt="Logo Importados da Val" className="w-7 h-7 md:w-9 md:h-9 object-contain" data-testid="navbar-logo-imagem" />
          <span className="font-display italic text-[15px] sm:text-2xl text-espresso tracking-tight whitespace-nowrap">
            Importados <span className="text-rose">da Val</span>
          </span>
        </Link>
      </div>

      <div className="hidden md:flex items-center gap-8">
        {links.map((l) => (
          <Link
            key={l.para}
            to={l.para}
            className={`text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors hover:text-rose ${
              location.pathname === l.para ? "text-rose" : "text-espresso/70"
            }`}
          >
            {l.rotulo}
          </Link>
        ))}
        {admin && (
          <Link
            to="/admin"
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold hover:text-rose transition-colors"
            data-testid="navbar-link-admin"
          >
            Painel Admin
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {usuario ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuPerfilAberto(!menuPerfilAberto)}
              className="p-1.5 text-espresso hover:text-rose transition-colors"
              aria-label="Menu da conta"
              data-testid="navbar-perfil-botao"
            >
              <FiUser size={19} />
            </button>
            {menuPerfilAberto && (
              <div className="absolute right-0 mt-3 w-56 bg-white border border-espresso/10 rounded-2xl shadow-xl py-2 z-50">
                <div className="px-4 py-3 border-b border-espresso/5">
                  <p className="text-[10px] uppercase tracking-wider text-espresso/40">Conta</p>
                  <p className="text-xs font-semibold text-espresso truncate mt-0.5">{usuario.email}</p>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => { navigate("/meus-pedidos"); setMenuPerfilAberto(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs text-espresso hover:bg-creme rounded-xl transition-all font-medium"
                    data-testid="navbar-menu-meus-pedidos"
                  >
                    <FiPackage size={14} /> Meus Pedidos
                  </button>
                  {admin && (
                    <button
                      onClick={() => { navigate("/admin"); setMenuPerfilAberto(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs text-espresso hover:bg-creme rounded-xl transition-all font-medium"
                      data-testid="navbar-menu-admin"
                    >
                      <FiSettings size={14} /> Painel Admin
                    </button>
                  )}
                </div>
                <div className="border-t border-espresso/5 p-1.5">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs text-rose hover:bg-rose/5 rounded-xl transition-all font-semibold"
                    data-testid="navbar-menu-sair"
                  >
                    <FiLogOut size={14} /> Sair da Conta
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => navigate("/login")}
            className="text-[10px] font-bold text-espresso tracking-widest uppercase hover:text-rose border border-espresso/15 px-4 py-1.5 rounded-full transition-all bg-white"
            data-testid="navbar-botao-entrar"
          >
            Entrar
          </button>
        )}

        <button onClick={() => setCarrinhoAberto(true)} className="flex items-center gap-2 group" data-testid="navbar-sacola-botao">
          <span className="relative p-0.5">
            <FiShoppingBag size={20} className="text-espresso group-hover:text-rose transition-colors" />
            {totalItens > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 bg-rose text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                data-testid="navbar-sacola-contador"
              >
                {totalItens}
              </span>
            )}
          </span>
          {totalItens > 0 && (
            <span className="hidden md:inline text-[11px] font-semibold text-rose font-mono" data-testid="navbar-sacola-total">
              {brl(valorTotal)}
            </span>
          )}
        </button>
      </div>

      {/* ─── MENU MOBILE ─── (renderizado FORA da navbar abaixo) */}
    </nav>

      <AnimatePresence>
        {menuAberto && (
          <div className="fixed inset-0 z-50 md:hidden" data-testid="menu-mobile">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-espresso/50 backdrop-blur-sm"
              onClick={() => setMenuAberto(false)}
              data-testid="menu-mobile-fundo"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-creme border-r border-espresso/10 shadow-2xl flex flex-col"
              data-testid="menu-mobile-painel"
            >
              <div className="flex items-center justify-between p-5 bg-white border-b border-espresso/10">
                <span className="font-display italic text-xl text-espresso">
                  Importados <span className="text-rose">da Val</span>
                </span>
                <button
                  onClick={() => setMenuAberto(false)}
                  className="p-2 rounded-full hover:bg-creme text-espresso"
                  aria-label="Fechar menu"
                  data-testid="navbar-menu-mobile-fechar"
                >
                  <FiX size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-1">
                {links.map((l) => (
                  <Link
                    key={l.para}
                    to={l.para}
                    className={`block px-4 py-4 rounded-2xl font-display italic text-2xl transition-colors ${
                      location.pathname === l.para ? "bg-white text-rose" : "text-espresso hover:bg-white"
                    }`}
                    data-testid={`navbar-mobile-${l.para.replace("/", "") || "inicio"}`}
                  >
                    {l.rotulo}
                  </Link>
                ))}
                {admin && (
                  <Link
                    to="/admin"
                    className="block px-4 py-4 rounded-2xl font-display italic text-2xl text-gold hover:bg-white transition-colors"
                    data-testid="navbar-mobile-admin"
                  >
                    Painel Admin
                  </Link>
                )}
              </div>

              <div className="p-5 bg-white border-t border-espresso/10">
                {usuario ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-espresso/50 truncate">{usuario.email}</p>
                    <button
                      onClick={handleLogout}
                      className="shrink-0 flex items-center gap-2 bg-rose/5 border border-rose/20 text-rose px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest"
                      data-testid="navbar-mobile-sair"
                    >
                      <FiLogOut size={12} /> Sair
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigate("/login")}
                    className="w-full bg-rose hover:bg-rosedark text-white py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all"
                    data-testid="navbar-mobile-entrar"
                  >
                    Entrar / Cadastrar
                  </button>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
