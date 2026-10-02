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


WEB_API_KEY_PADRAO = "AIzaSyAxBK6w5g_bP_HJv7N8JFGo1somSGPHYIU"  # chave web pública (já vai no bundle do site)
_sistema_cache = {"token": None, "expira": 0}


def _entrar_usuario_sistema() -> str:
    """Login por Firebase Auth REST com o usuário de sistema (FIREBASE_SYSTEM_EMAIL/PASS)."""
    import time

    agora = int(time.time())
    if _sistema_cache["token"] and _sistema_cache["expira"] > agora + 60:
        return _sistema_cache["token"]
    email = os.environ.get("FIREBASE_SYSTEM_EMAIL", "")
    senha = os.environ.get("FIREBASE_SYSTEM_PASS", "")
    if not email or not senha:
        return ""
    api_key = os.environ.get("FIREBASE_WEB_API_KEY", "") or WEB_API_KEY_PADRAO
    try:
        dados = _http_json(
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}",
            method="POST",
            payload={"email": email, "password": senha, "returnSecureToken": True},
        )
        token_id = str(dados.get("idToken") or "")
        if token_id:
            _sistema_cache["token"] = token_id
            _sistema_cache["expira"] = agora + min(int(dados.get("expiresIn") or 3600), 3300)
        return token_id
    except Exception:
        return ""


def _ler_pagamentos_com_sistema(db_url: str) -> str:
    token_id = _entrar_usuario_sistema()
    if not token_id:
        return ""
    try:
        dados = _http_json(f"{db_url.rstrip('/')}/configuracoes/pagamentos.json?auth={token_id}")
        return str((dados or {}).get("mercadoPagoAccessToken") or "")
    except Exception:
        return ""


def _token_do_firebase() -> str:
    """Lê o token do Mercado Pago salvo no painel admin (configuracoes/pagamentos).
    Tenta usuário de sistema (autenticado) e, por último, leitura anônima (se as regras permitirem)."""
    db_url = os.environ.get("FIREBASE_DB_URL", "")
    if not db_url:
        return ""
    do_sistema = _ler_pagamentos_com_sistema(db_url)
    if do_sistema:
        return do_sistema
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


class ValidarTokenRequest(BaseModel):
    accessToken: str = ""


@app.post("/api/mercadopago/validar-token")
async def mercadopago_validar_token(req: ValidarTokenRequest):
    """Testa um Access Token do Mercado Pago enviado pelo painel admin (nunca devolve o token)."""
    token = (req.accessToken or "").strip()
    if not token:
        return {"valida": False, "erro": "Preencha o Access Token antes de testar."}
    try:
        usuario = _http_json(
            "https://api.mercadopago.com/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    except urllib.error.HTTPError as erro:
        if erro.code in (401, 403):
            return {"valida": False, "erro": "Token recusado pelo Mercado Pago. Copie novamente de developers.mercadopago.com › Sua aplicação › Credenciais."}
        return {"valida": False, "erro": f"Mercado Pago respondeu {erro.code}. Verifique o token."}
    except Exception:
        return {"valida": False, "erro": "Falha de conexão com o Mercado Pago. Tente novamente."}
    return {
        "valida": True,
        "tipo": "teste" if token.startswith("TEST-") else "producao",
        "conta": str((usuario or {}).get("email") or (usuario or {}).get("nickname") or "")[:80],
    }


@app.get("/api/mercadopago/status-servidor")
async def mercadopago_status_servidor():
    """Diagnóstico: de onde o servidor consegue ler o token salvo no painel admin."""
    db_url = os.environ.get("FIREBASE_DB_URL", "")
    if os.environ.get("MP_ACCESS_TOKEN", ""):
        return {"encontrado": True, "fonte": "variavel-de-ambiente"}
    if db_url:
        if _ler_pagamentos_com_sistema(db_url):
            return {"encontrado": True, "fonte": "usuario-de-sistema"}
        try:
            dados = _http_json(f"{db_url.rstrip('/')}/configuracoes/pagamentos.json")
            if (dados or {}).get("mercadoPagoAccessToken"):
                return {"encontrado": True, "fonte": "leitura-anonima"}
        except Exception:
            pass
    return {"encontrado": False, "fonte": ""}


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
    admins: list[str] = []
    itens: list[ItemNotificado] = []
    total: float = Field(default=0, ge=0)
    cupom: str = ""
    dataHora: str = ""


def destinatarios_admin(admins_extra=None) -> list[str]:
    """G4: os destinatários vêm SEMPRE de registros no servidor (env/painel), nunca do cliente."""
    destinos: list[str] = []

    valor_env = os.environ.get("ADMIN_EMAILS", "")
    for parte in re.split(r"[,;\s]+", valor_env):
        if "@" in parte:
            destinos.append(parte.strip().lower())

    # Lista enviada pela sessão logada (vinda da aba Administradores do painel)
    for email in (admins_extra or [])[:10]:
        texto = str(email or "").strip().lower()
        if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", texto):
            destinos.append(texto)

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


def _tabela_pedido(subtitulo: str, numero: str, cliente_email: str, linhas: str, cupom_linha: str, total: float) -> str:
    marca = html.escape(EMAIL_FROM_NAME)
    return (
        f"<table role='presentation' width='100%' style='background:#FAF9F6;padding:24px'>"
        f"<tr><td><table role='presentation' width='100%' style='max-width:560px;background:#FFFFFF;"
        f"border-radius:12px;padding:24px;font-family:Arial,sans-serif'>"
        f"<tr><td style='padding-bottom:12px'>"
        f"<h2 style='margin:0;color:#B76E79;font-size:18px'>{marca}</h2>"
        f"<p style='margin:4px 0 0;color:#6E5B5B;font-size:13px'>{subtitulo}</p>"
        f"</td></tr>"
        f"<tr><td style='border-top:1px solid #eee;padding:12px 0'>"
        f"<p style='margin:4px 0;color:#2C1D1D'>Pedido: <strong>{numero}</strong></p>"
        f"<p style='margin:4px 0;color:#2C1D1D'>Cliente: {html.escape((cliente_email or '')[:80])}</p>"
        f"{cupom_linha}"
        f"</td></tr>"
        f"<tr><td style='border-top:1px solid #eee'><table role='presentation' width='100%'>{linhas}"
        f"<tr><td style='padding-top:10px;color:#2C1D1D'><strong>Total</strong></td>"
        f"<td style='padding-top:10px;text-align:right;color:#B76E79'><strong>R$ {total:.2f}</strong></td></tr>"
        f"</table></td></tr>"
        f"<tr><td style='border-top:1px solid #eee;padding-top:12px'>"
        f"<p style='margin:0;font-size:12px;color:#888'>Enviado por {marca}. "
        f"Nunca pedimos senha ou dados de cartão por e-mail.</p>"
        f"</td></tr>"
        f"</table></td></tr></table>"
    )


@app.post("/api/emails/pedido")
async def notificar_pedido(req: NotificarPedidoRequest):
    if not EMAIL_KEY:
        return {"status": "indisponivel", "detail": "Envio de e-mail não configurado."}

    destinos = destinatarios_admin(req.admins)
    if not destinos:
        return {"status": "sem-destinatarios", "detail": "Nenhum e-mail de administrador configurado."}

    numero = re.sub(r"[^A-Za-z0-9#-]", "", req.numero)[:32] or "---"
    eh_encomenda = req.tipo == "encomenda"

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

    # 1) Aviso para as administradoras
    assunto = (
        f"Nova encomenda — {EMAIL_FROM_NAME}" if eh_encomenda else f"Novo pedido {numero} — {EMAIL_FROM_NAME}"
    )
    email_html = _tabela_pedido(
        subtitulo=f"{'Nova encomenda registrada' if eh_encomenda else 'Novo pedido registrado'} em {html.escape(req.dataHora[:40])}",
        numero=numero,
        cliente_email=req.clienteEmail,
        linhas=linhas,
        cupom_linha=cupom_linha,
        total=req.total,
    )

    resultados = {}
    for destino in destinos:
        try:
            _enviar_email(destino, assunto, email_html)
            resultados[destino] = "ok"
        except Exception as erro:
            resultados[destino] = f"falha: {erro}"

    # 2) Comprovante para a cliente
    comprovante_para: list[str] = []
    cliente_email = (req.clienteEmail or "").strip().lower()
    if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", cliente_email):
        assunto_cliente = (
            f"Comprovante da encomenda — {EMAIL_FROM_NAME}"
            if eh_encomenda
            else f"Comprovante do pedido {numero} — {EMAIL_FROM_NAME}"
        )
        saudacao = (
            "Olá! Registramos sua encomenda e a Val fará a importação na próxima remessa. Obrigada pela confiança!"
            if eh_encomenda
            else "Olá! Recebemos seu pedido e já estamos cuidando de cada detalhe. Obrigada pela confiança!"
        )
        email_html_cliente = _tabela_pedido(
            subtitulo=html.escape(saudacao[:120]),
            numero=numero,
            cliente_email=cliente_email,
            linhas=linhas,
            cupom_linha=cupom_linha,
            total=req.total,
        )
        try:
            _enviar_email(cliente_email, assunto_cliente, email_html_cliente)
            comprovante_para.append(cliente_email)
        except Exception as erro:
            resultados[f"cliente:{cliente_email}"] = f"falha: {erro}"

    return {"status": "processado", "assunto": assunto, "resultados": resultados, "comprovantePara": comprovante_para}


# ─── CONFIRMAÇÃO AUTOMÁTICA DE PAGAMENTOS ───

INFINITEPAY_HANDLE = os.environ.get("INFINITEPAY_HANDLE", "") or "michelrsouza"  # handle público da loja


def _limpar_id(valor: str, limite: int = 64) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", str(valor or ""))[:limite]


class PaymentCheckRequest(BaseModel):
    orderNsu: str
    slug: str = ""
    transactionNsu: str = ""
    handle: str = ""


class ConfirmarMPRequest(BaseModel):
    paymentId: str
    orderNsu: str = ""


@app.post("/api/infinitepay/payment-check")
async def infinitepay_payment_check(req: PaymentCheckRequest):
    """Consulta POST /payment_check na InfinitePay. Preferência pelo handle do servidor; o do cliente é público."""
    handle = _limpar_id(INFINITEPAY_HANDLE, 40) or _limpar_id(req.handle, 40)
    order_nsu = _limpar_id(req.orderNsu)
    if not handle or not order_nsu:
        return {"paid": False, "erro": "Configuração da InfinitePay ausente (INFINITEPAY_HANDLE) ou pedido sem NSU."}

    payload = {"handle": handle, "order_nsu": order_nsu}
    slug = _limpar_id(req.slug)
    transaction = _limpar_id(req.transactionNsu)
    if slug:
        payload["slug"] = slug
    if transaction:
        payload["transaction_nsu"] = transaction

    try:
        resposta = _http_json("https://api.checkout.infinitepay.io/payment_check", method="POST", payload=payload)
        pago = resposta.get("success") is True and resposta.get("paid") is True
        return {"paid": pago, "captureMethod": resposta.get("capture_method", ""), "resposta": resposta}
    except urllib.error.HTTPError:
        return {"paid": False, "erro": "InfinitePay não encontrou esse pagamento ainda."}
    except Exception:
        return {"paid": False, "erro": "Falha de conexão com a InfinitePay."}


@app.post("/api/mercadopago/confirmar-pagamento")
async def mercadopago_confirmar(req: ConfirmarMPRequest):
    token = os.environ.get("MP_ACCESS_TOKEN", "") or _token_do_firebase()
    if not token:
        return {"verificado": False, "motivo": "sem-token"}
    payment_id = _limpar_id(req.paymentId)
    if not payment_id:
        return {"verificado": False, "motivo": "payment-id-invalido"}
    try:
        pagamento = _http_json(
            f"https://api.mercadopago.com/v1/payments/{payment_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    except urllib.error.HTTPError as erro:
        return {"verificado": False, "motivo": f"mp-status-{erro.code}"}
    except Exception:
        return {"verificado": False, "motivo": "conexao"}

    status_mp = str(pagamento.get("status", ""))
    referencia = str(pagamento.get("external_reference", "") or "")
    bate_ref = (not req.orderNsu) or (_limpar_id(referencia) == _limpar_id(req.orderNsu))
    return {"verificado": status_mp == "approved" and bate_ref, "statusMp": status_mp, "referencia": referencia}
