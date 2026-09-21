// src/pages/Home.jsx
import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { useProdutos, precoEfetivo } from "../lib/produtos";
import { brl } from "../lib/formato";
import { Reveal, LinhaReveal } from "../components/Reveal";
import Marquee from "../components/Marquee";
import { FiArrowRight, FiArrowUpRight, FiCheckCircle, FiStar } from "react-icons/fi";

const FOTO_HERO =
  "https://images.pexels.com/photos/13875786/pexels-photo-13875786.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Home() {
  const { produtos } = useProdutos();
  const secaoHero = useRef(null);
  const scrollY = useScroll();
  const parallaxY = useTransform(scrollY.scrollY, [0, 600], [0, 60]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), { stiffness: 60, damping: 15 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-6, 6]), { stiffness: 60, damping: 15 });

  const aoMover = (e) => {
    const rect = secaoHero.current ? secaoHero.current.getBoundingClientRect() : { width: 1, height: 1, left: 0, top: 0 };
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const destaques = produtos.slice(0, 4);

  return (
    <div>
      {/* ─── HERO CINÉTICO ─── */}
      <section
        ref={secaoHero}
        onMouseMove={aoMover}
        className="relative min-h-screen flex items-center overflow-hidden pt-16"
        data-testid="hero-principal"
      >
        <div className="absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full bg-pessego/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-40 w-[460px] h-[460px] rounded-full bg-rose/10 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12 items-center py-16">
          <div className="md:col-span-7">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="uppercase tracking-[0.3em] text-[11px] font-semibold text-rose mb-6"
              data-testid="hero-eyebrow"
            >
              Cosméticos & Importados de Qualidade
            </motion.p>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.06] text-espresso">
              <LinhaReveal delay={0.25}>O melhor da beleza</LinhaReveal>
              <LinhaReveal delay={0.4}>
                <em className="text-rose">mundial,</em> escolhido
              </LinhaReveal>
              <LinhaReveal delay={0.55}>a dedo para você.</LinhaReveal>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.85 }}
              className="text-sm sm:text-base text-espresso/60 leading-relaxed mt-6 max-w-md"
              data-testid="hero-subtitulo"
            >
              Perfumes, body splash, maquiagem e skincare importados — com curadoria da Val,
              pronta entrega e encomendas direto da próxima remessa.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1 }}
              className="flex flex-wrap items-center gap-4 mt-10"
            >
              <Link
                to="/catalogo"
                className="group bg-espresso text-creme pl-8 pr-6 py-4 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] flex items-center gap-3 hover:bg-ink transition-all shadow-lg hover:shadow-xl"
                data-testid="hero-cta-botao"
              >
                Explorar Catálogo
                <FiArrowRight className="group-hover:translate-x-1 transition-transform" size={15} />
              </Link>
              <a
                href="#manifesto"
                className="text-[11px] font-bold uppercase tracking-[0.2em] text-espresso border-b-2 border-rose pb-1 hover:text-rose transition-colors"
                data-testid="hero-cta-manifesto"
              >
                Conheça a Val
              </a>
            </motion.div>
          </div>

          <div className="md:col-span-5 relative" style={{ perspective: "1000px" }}>
            <motion.div style={{ y: parallaxY, rotateX, rotateY, transformStyle: "preserve-3d" }} className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-rose/30 via-pessego/20 to-transparent blur-2xl rounded-full scale-110" />
              <div className="relative rounded-t-[999px] rounded-b-[2rem] overflow-hidden border border-pessego/40 shadow-2xl aspect-[4/5] bg-creme" data-testid="hero-imagem-quadro">
                <img src={FOTO_HERO} alt="Perfume importado em destaque" className="w-full h-full object-cover" />
              </div>

              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-6 top-16 bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-2.5"
                data-testid="hero-badge-original"
              >
                <FiCheckCircle className="text-rose" size={16} />
                <div>
                  <p className="text-[10px] font-bold text-espresso uppercase tracking-wider">100% Originais</p>
                  <p className="text-[9px] text-espresso/50">Curadoria importada</p>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                className="absolute -right-4 bottom-14 bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-2.5"
                data-testid="hero-badge-entrega"
              >
                <FiStar className="text-gold" size={16} />
                <div>
                  <p className="text-[10px] font-bold text-espresso uppercase tracking-wider">Pronta Entrega</p>
                  <p className="text-[9px] text-espresso/50">& Encomendas</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      <Marquee />

      {/* ─── MANIFESTO NUMERADO ─── */}
      <section id="manifesto" className="bg-ink text-creme py-24 md:py-32" data-testid="secao-manifesto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="uppercase tracking-[0.3em] text-[11px] font-semibold text-gold mb-4" data-testid="manifesto-eyebrow">
              O manifesto da Val
            </p>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight max-w-2xl">
              Beleza não se compra por impulso. <em className="text-rose">Se escolhe com critério.</em>
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 mt-16">
            {[
              {
                numero: "01",
                titulo: "Curadoria com critério",
                texto: "Cada perfume, batom e skincare é escolhido a dedo pela Val antes de entrar na loja. Nada chega aqui por acaso.",
              },
              {
                numero: "02",
                titulo: "Importação sem complicação",
                texto: "Não encontrou em estoque? Nós importamos direto para você na próxima remessa.",
              },
              {
                numero: "03",
                titulo: "Experiência boutique",
                texto: "Atendimento próximo de quem entende e ama cosméticos: do primeiro clique até a entrega nas suas mãos.",
              },
            ].map((cap, i) => (
              <Reveal key={cap.numero} delay={i * 0.15} className="border-t border-white/10 pt-8">
                <span className="font-display italic text-5xl text-rose/80" data-testid={`manifesto-numero-${cap.numero}`}>
                  {cap.numero}
                </span>
                <h3 className="font-display text-xl sm:text-2xl font-semibold mt-6 text-creme">{cap.titulo}</h3>
                <p className="text-sm text-creme/60 leading-relaxed mt-4">{cap.texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DESTAQUES ─── */}
      <section className="py-24 md:py-32 bg-creme" data-testid="secao-destaques">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="flex items-end justify-between flex-wrap gap-6 mb-12">
            <div>
              <p className="uppercase tracking-[0.3em] text-[11px] font-semibold text-rose mb-3">Destaques da temporada</p>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-espresso">
                Amados <em className="text-rose">e requisitados</em>
              </h2>
            </div>
            <Link
              to="/catalogo"
              className="group text-[11px] font-bold uppercase tracking-[0.2em] text-espresso flex items-center gap-2 hover:text-rose transition-colors"
              data-testid="destaques-ver-todos"
            >
              Ver todos <FiArrowUpRight className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" size={14} />
            </Link>
          </Reveal>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
            {destaques.map((prod, i) => (
              <Reveal key={prod.Id} delay={i * 0.1}>
                <Link
                  to="/catalogo"
                  className="group block bg-white rounded-3xl border border-espresso/5 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500"
                  data-testid={`destaque-card-${i}`}
                >
                  <div className="aspect-[3/4] overflow-hidden bg-creme relative">
                    {prod.FotoUrl ? (
                      <img src={prod.FotoUrl} alt={prod.Nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-espresso/0 to-espresso/0 group-hover:from-espresso/20 transition-all duration-500" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-espresso line-clamp-2 leading-tight min-h-[28px]">
                      {prod.Nome}
                    </h3>
                    <p className="font-display font-bold text-rose mt-2 text-sm md:text-base" data-testid={`destaque-preco-${i}`}>
                      {brl(precoEfetivo(prod, null))}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="py-24 md:py-32 bg-creme" data-testid="secao-cta-final">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <p className="uppercase tracking-[0.3em] text-[11px] font-semibold text-rose mb-6">Sua próxima favorita está aqui</p>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-espresso leading-[1.08]">
              Pronta para se <em className="text-rose">apaixonar</em>?
            </h2>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-3 bg-rose hover:bg-rosedark text-white px-10 py-4 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] mt-10 shadow-lg hover:shadow-xl transition-all"
              data-testid="cta-final-botao"
            >
              Ver Catálogo Completo <FiArrowRight size={15} />
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
