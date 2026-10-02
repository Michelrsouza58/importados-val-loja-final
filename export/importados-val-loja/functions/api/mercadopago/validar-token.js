// Pages Function — adaptador fino (a lógica vive em server/mercadopago.js)
import { validarToken } from "../../../server/mercadopago.js";

export const onRequestPost = ({ request, env }) => validarToken(request, env);
