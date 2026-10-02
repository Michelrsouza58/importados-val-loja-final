// Pages Function — adaptador fino (a lógica vive em server/mercadopago.js)
import { statusServidor } from "../../../server/mercadopago.js";

export const onRequestGet = ({ request, env }) => statusServidor(request, env);
