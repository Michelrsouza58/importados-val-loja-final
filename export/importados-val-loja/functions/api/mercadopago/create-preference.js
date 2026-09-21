// Pages Function — adaptador fino (a lógica vive em server/mercadopago.js)
import { criarPreferencia } from "../../../server/mercadopago.js";

export const onRequestPost = ({ request, env }) => criarPreferencia(request, env);
