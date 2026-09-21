// Pages Function — adaptador fino (a lógica vive em server/mercadopago.js)
import { confirmarPagamento } from "../../../server/mercadopago.js";

export const onRequestPost = ({ request, env }) => confirmarPagamento(request, env);
