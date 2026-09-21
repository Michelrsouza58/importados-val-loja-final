// Pages Function — adaptador fino (a lógica vive em server/emails.js)
import { emailsPedido } from "../../../server/emails.js";

export const onRequestPost = ({ request, env }) => emailsPedido(request, env);
