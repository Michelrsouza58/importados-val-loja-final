// src/lib/cupons.js
import { db } from "./firebase";
import { ref, get, runTransaction } from "firebase/database";

export function cupomKey(codigo) {
  return String(codigo || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export async function buscarCupom(codigo) {
  const key = cupomKey(codigo);
  if (!key) return { ok: false, erro: "Digite um código de cupom." };
  try {
    const snap = await get(ref(db, `cupons/${key}`));
    if (!snap.exists()) return { ok: false, erro: "Cupom não encontrado." };
    const c = snap.val();
    if (c.Ativo === false) return { ok: false, erro: "Este cupom está desativado." };
    const max = Number(c.MaxUsos || 0);
    const usados = Number(c.Usados || 0);
    if (max > 0 && usados >= max) return { ok: false, erro: "Este cupom esgotou o limite de usos." };
    const valor = Number(c.Valor || 0);
    if (!(valor > 0)) return { ok: false, erro: "Cupom inválido." };
    return { ok: true, cupom: { Key: key, Codigo: c.Codigo || key, Tipo: c.Tipo === "valor" ? "valor" : "percentual", Valor: valor } };
  } catch (erro) {
    return { ok: false, erro: "Não foi possível validar o cupom agora. Tente novamente." };
  }
}

export async function registrarUsoCupom(key) {
  if (!key) return;
  try {
    await runTransaction(ref(db, `cupons/${key}/Usados`), (atual) => (atual === null ? 1 : atual + 1));
  } catch (erro) {}
}

// Desconto em R$ que o cupom dá sobre um subtotal
export function calcularDescontoCupom(cupom, subtotal) {
  if (!cupom || !(subtotal > 0)) return 0;
  const bruto = cupom.Tipo === "valor" ? cupom.Valor : subtotal * (cupom.Valor / 100);
  return Math.min(bruto, subtotal);
}
