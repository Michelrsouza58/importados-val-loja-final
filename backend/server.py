import os
import re
import json
import html
import urllib.request
import urllib.error
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


class ItemPedido(BaseModel):
    title: str
    quantity: int = Field(gt=0, le=50)
    unit_price: float = Field(gt=0)


class PreferenciaRequest(BaseModel):
    items: list[ItemPedido]
    payerEmail: Optional[str] = ""
    origin: Optional[str] = ""
    orderNsu: Optional[str] = ""


def _http_json(url: str, method: str = "GET", payload: dict | None = None, headers: dict | None = None, timeout: int = 20):
    dados = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=dados, method=method)
    req.add_header("Content-Type", "application/json")
    for chave, valor in (headers or {}).items():
        req.add_header(chave, valor)
    with urllib.request.urlopen(req, timeout=timeout) as resposta:
        return json.loads(resposta.read().decode("utf-8"))


def _token_do_firebase() -> str:
    """Lê o token do Mercado Pago salvo no painel admin (configuracoes/pagamentos)."""
    db_url = os.environ.get("FIREBASE_DB_URL", "")
    if not db_url:
        return ""
    try:
        dados = _http_json(f"{db_url.rstrip('/')}/configuracoes/pagamentos.json")
        return str((dados or {}).get("mercadoPagoAccessToken") or "")
    except Exception:
        return ""


@app.post("/api/mercadopago/create-preference")
async def criar_preferencia(req: PreferenciaRequest):
    token = os.environ.get("MP_ACCESS_TOKEN", "") or _token_do_firebase()
    if not token:
        return {
            "error": "O Mercado Pago ainda não foi configurado. Defina o Access Token no painel admin (aba Pagamentos) ou na variável MP_ACCESS_TOKEN."
        }

    total = round(sum(i.unit_price * i.quantity for i in req.items), 2)
    origem = (req.origin or "").rstrip("/")

    preferencia = {
        "items": [
            {
                "title": item.title[:120],
                "quantity": item.quantity,
                "currency_id": "BRL",
                "unit_price": round(item.unit_price, 2),
            }
            for item in req.items
        ],
        "external_reference": (req.orderNsu or "")[:64],
    }
    if origem:
        preferencia["back_urls"] = {
            "success": f"{origem}/meus-pedidos",
            "failure": f"{origem}/meus-pedidos",
            "pending": f"{origem}/meus-pedidos",
        }
        preferencia["auto_return"] = "approved"
    if req.payerEmail:
        preferencia["payer"] = {"email": req.payerEmail}

    try:
        resposta = _http_json(
            "https://api.mercadopago.com/checkout/preferences",
            method="POST",
            payload=preferencia,
            headers={"Authorization": f"Bearer {token}"},
        )
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="ignore")[:300]
        return {"error": f"Mercado Pago recusou a preferência ({erro.code}). Verifique o token. {detalhe}"}
    except Exception as erro:
        return {"error": "Falha de conexão com o Mercado Pago. Tente novamente."}

    init_point = resposta.get("init_point") or resposta.get("sandbox_init_point") or ""
    if not init_point:
        return {"error": "Mercado Pago não retornou o link de pagamento."}

    return {"initPoint": init_point, "preferenceId": resposta.get("id", ""), "total": total}


# ─── E-MAILS: notificação de novos pedidos/encomendas para as administradoras ───

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Importados da Val")


class ItemNotificado(BaseModel):
    Nome: str = ""
    Variante: str = ""
    Quantidade: int = Field(default=1, ge=1, le=99)
    PrecoReal: float = Field(default=0, ge=0)
    SobreEncomenda: bool = False


class NotificarPedidoRequest(BaseModel):
    tipo: str = "pedido"
    numero: str = ""
    clienteEmail: str = ""
    itens: list[ItemNotificado] = []
    total: float = Field(default=0, ge=0)
    cupom: str = ""
    dataHora: str = ""


def destinatarios_admin() -> list[str]:
    """G4: os destinatários vêm SEMPRE de registros no servidor (env/painel), nunca do cliente."""
    destinos: list[str] = []

    valor_env = os.environ.get("ADMIN_EMAILS", "")
    for parte in re.split(r"[,;\s]+", valor_env):
        if "@" in parte:
            destinos.append(parte.strip().lower())

    db_url = os.environ.get("FIREBASE_DB_URL", "")
    if db_url:
        try:
            dados = _http_json(f"{db_url.rstrip('/')}/configuracoes/admins.json")
            if isinstance(dados, list):
                destinos.extend(str(e).strip().lower() for e in dados if e and "@" in str(e))
            elif isinstance(dados, dict):
                destinos.extend(str(e).strip().lower() for e in dados.values() if e and "@" in str(e))
        except Exception:
            pass

    unicos = sorted(set(d for d in destinos if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", d)))
    return unicos[:10]


def _enviar_email(to: str, subject: str, email_html: str):
    payload = {"to": [to], "subject": subject, "html": email_html, "from_name": EMAIL_FROM_NAME}
    req = urllib.request.Request(
        f"{EMAIL_BASE_URL}/api/v1/email/send",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
    )
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Email-Key", EMAIL_KEY)
    with urllib.request.urlopen(req, timeout=30) as resposta:
        return json.loads(resposta.read().decode("utf-8"))


@app.post("/api/emails/pedido")
async def notificar_pedido(req: NotificarPedidoRequest):
    if not EMAIL_KEY:
        return {"status": "indisponivel", "detail": "Envio de e-mail não configurado."}

    destinos = destinatarios_admin()
    if not destinos:
        return {"status": "sem-destinatarios", "detail": "Nenhum e-mail de administrador configurado."}

    numero = re.sub(r"[^A-Za-z0-9#-]", "", req.numero)[:32] or "---"
    eh_encomenda = req.tipo == "encomenda"
    assunto = (
        f"Nova encomenda — {EMAIL_FROM_NAME}" if eh_encomenda else f"Novo pedido {numero} — {EMAIL_FROM_NAME}"
    )

    linhas = ""
    for item in req.itens[:30]:
        nome = html.escape((item.Nome or "Item")[:80] + (f" · {item.Variante}" if item.Variante else ""))
        obs = " <em>(sob encomenda)</em>" if item.SobreEncomenda else ""
        linhas += (
            f"<tr><td style='padding:6px 0;color:#2C1D1D'>{nome}{obs}</td>"
            f"<td style='padding:6px 0;text-align:right;color:#2C1D1D'>{item.Quantidade}x</td>"
            f"<td style='padding:6px 0;text-align:right;color:#2C1D1D'>R$ {item.PrecoReal:.2f}</td></tr>"
        )

    cupom_linha = (
        f"<p style='margin:4px 0;color:#2C1D1D'>Cupom aplicado: <strong>{html.escape(req.cupom[:24])}</strong></p>"
        if req.cupom
        else ""
    )

    email_html = (
        f"<table role='presentation' width='100%' style='background:#FAF9F6;padding:24px'>"
        f"<tr><td><table role='presentation' width='100%' style='max-width:560px;background:#FFFFFF;"
        f"border-radius:12px;padding:24px;font-family:Arial,sans-serif'>"
        f"<tr><td style='padding-bottom:12px'>"
        f"<h2 style='margin:0;color:#B76E79;font-size:18px'>{html.escape(EMAIL_FROM_NAME)}</h2>"
        f"<p style='margin:4px 0 0;color:#6E5B5B;font-size:13px'>"
        f"{'Nova encomenda registrada' if eh_encomenda else 'Novo pedido registrado'} em {html.escape(req.dataHora[:40])}</p>"
        f"</td></tr>"
        f"<tr><td style='border-top:1px solid #eee;padding:12px 0'>"
        f"<p style='margin:4px 0;color:#2C1D1D'>Pedido: <strong>{numero}</strong></p>"
        f"<p style='margin:4px 0;color:#2C1D1D'>Cliente: {html.escape((req.clienteEmail or '')[:80])}</p>"
        f"{cupom_linha}"
        f"</td></tr>"
        f"<tr><td style='border-top:1px solid #eee'><table role='presentation' width='100%'>{linhas}"
        f"<tr><td style='padding-top:10px;color:#2C1D1D'><strong>Total</strong></td>"
        f"<td style='padding-top:10px;text-align:right;color:#B76E79'><strong>R$ {req.total:.2f}</strong></td></tr>"
        f"</table></td></tr>"
        f"<tr><td style='border-top:1px solid #eee;padding-top:12px'>"
        f"<p style='margin:0;font-size:12px;color:#888'>Enviado por {html.escape(EMAIL_FROM_NAME)}. "
        f"Nunca pedimos senha ou dados de cartão por e-mail.</p>"
        f"</td></tr>"
        f"</table></td></tr></table>"
    )

    resultados = {}
    for destino in destinos:
        try:
            _enviar_email(destino, assunto, email_html)
            resultados[destino] = "ok"
        except Exception as erro:
            resultados[destino] = f"falha: {erro}"

    return {"status": "processado", "assunto": assunto, "resultados": resultados}
