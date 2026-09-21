// Pages Function — adaptador fino (a lógica vive em server/infinitepay.js)
import { paymentCheck } from "../../../server/infinitepay.js";

export const onRequestPost = ({ request, env }) => paymentCheck(request, env);
