// src/lib/configuracoes.js
import { useEffect, useState } from "react";
import { db, OWNER_EMAIL } from "./firebase";
import { ref, onValue } from "firebase/database";

// Taxas oficiais do Link de Pagamento da InfinitePay (Recebimento D+1) — padrão
export const TAXAS_PADRAO = {
  1: 4.2, 2: 6.09, 3: 7.01, 4: 7.91, 5: 8.8, 6: 9.67,
  7: 12.59, 8: 13.42, 9: 14.25, 10: 15.06, 11: 15.87, 12: 16.66,
};

export const CONFIG_PADRAO = {
  financeiro: {
    taxas: { ...TAXAS_PADRAO },
    descontoPix: 0,
    maxParcelas: 12,
  },
  pagamentos: {
    infinitepayHandle: "michelrsouza",
    infinitepayWebhookN8n: "",
    mercadoPagoAccessToken: "",
    mercadoPagoPublicKey: "",
  },
  admins: [],
  vitrine: { heroKey: "", destaques: [], heroCupomCodigo: "", heroCupomRotulo: "" },
};

function mesclarConfig(dados) {
  const d = dados || {};
  return {
    financeiro: {
      ...CONFIG_PADRAO.financeiro,
      ...(d.financeiro || {}),
      taxas: { ...TAXAS_PADRAO, ...((d.financeiro && d.financeiro.taxas) || {}) },
    },
    pagamentos: { ...CONFIG_PADRAO.pagamentos, ...(d.pagamentos || {}) },
    admins: Array.isArray(d.admins) ? d.admins : (d.admins ? Object.values(d.admins) : []),
    vitrine: { ...CONFIG_PADRAO.vitrine, ...(d.vitrine || {}) },
  };
}

export function useConfiguracoes() {
  const [config, setConfig] = useState(mesclarConfig(null));
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const cfgRef = ref(db, "configuracoes");
    const unsubscribe = onValue(
      cfgRef,
      (snapshot) => {
        setConfig(mesclarConfig(snapshot.exists() ? snapshot.val() : null));
        setCarregando(false);
      },
      () => {
        // Sem permissão de leitura: mantém os padrões (o painel admin grava com auth)
        setCarregando(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { config, carregando };
}

export function listaAdmins(config) {
  const emails = new Set([OWNER_EMAIL.toLowerCase()]);
  (config.admins || []).forEach((e) => {
    if (e) emails.add(String(e).toLowerCase());
  });
  return Array.from(emails);
}

export function ehAdmin(usuario, config) {
  if (!usuario || !usuario.email) return false;
  return listaAdmins(config).includes(String(usuario.email).toLowerCase());
}
