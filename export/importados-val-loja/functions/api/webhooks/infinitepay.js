// Pages Function — adaptador fino (a lógica vive em server/infinitepay.js)
import { webhookInfinitepay } from "../../../server/infinitepay.js";

export const onRequestPost = (ctx) => webhookInfinitepay(ctx.request, ctx.env, ctx);
