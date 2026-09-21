# Importados da Val — Loja (Cloudflare Pages)

Loja redesignada em nível premium: home cinematográfica, catálogo com variantes
(ex.: Body Splash Aroma 1 / Aroma 2), sacola com **Pix (InfinitePay)** e
**Cartão (Mercado Pago)**, e **Painel Admin** completo.

## 1. Publicar no Cloudflare Pages

1. Suba esta pasta no seu repositório GitHub (substitua os arquivos antigos).
2. Cloudflare > Workers & Pages > **Create application > Pages > Connect to Git**.
3. Build command: `npm run build` — Output directory: `dist`.
4. (A cada `git push` o site atualiza sozinho.)

## 2. "As variáveis aparecem bloqueadas?" — leia aqui

Onde ficam ( painel atual da Cloudflare ):

1. **Workers & Pages** > clique no **NOME do seu projeto** (na lista, não dentro
   de um deploy específico — a tela de um deploy é só leitura).
2. Aba **Settings** > role até **Variables and Secrets** > **Add**.
3. Tipo: **Secret** · Ambiente: **Production** (depois repita em **Preview**).

Se mesmo assim o botão estiver travado, cadastre o secret pelo terminal
(uma linha, ele pede o valor para colar):

```bash
npx wrangler pages secret put FIREBASE_SERVICE_ACCOUNT --project-name=NOME-DO-SEU-PROJETO
```

E enquanto o secret não estiver no ar, a loja continua vendendo sem travar:
- **Pix** segue direto pela InfinitePay (confirmação ao retornar + webhook quando ativar);
- **Cartão** cai automaticamente para o checkout da InfinitePay (que também aceita
  cartão) até o token do Mercado Pago ficar disponível.

## 3. Configurar o Firebase (importante!)

O Realtime Database atual está **negando leitura** — por isso o catálogo não
carrega. Em Firebase Console > Realtime Database > Rules, cole:

```json
{
  "rules": {
    "items": { ".read": true, ".write": "auth != null" },
    "clientes": { ".read": "auth != null", "$uid": { ".write": "auth != null && auth.uid === $uid" } },
    "carrinho": { "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" } },
    "pedidos": { ".read": "auth != null", ".write": "auth != null" },
    "encomendas": { ".read": "auth != null", ".write": "auth != null" },
    "cupons": { ".read": "auth != null", ".write": "auth != null" },
    "configuracoes": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

Depois, em **Authentication > Settings > Authorized domains**, adicione o
domínio do Cloudflare (ex: `importados-val.pages.dev`) e seu domínio próprio.

## 4. Painel Admin

Acesse `seusite.com/admin` e entre com o e-mail liberado
(michelrobertoeletro@gmail.com já vem como dona da loja) e a senha criada no
Firebase Authentication.

- **Produtos**: cadastrar/editar com fotos (upload para o Firebase Storage ou
  URL) e **variantes** (Aroma 1, Aroma 2...) — cada tipo com foto, preço e estoque.
- **Pedidos**: ver e atualizar status.
- **Financeiro**: taxas de parcelamento (1x a 12x), desconto do Pix e máximo de parcelas.
- **Pagamentos**: handle da InfinitePay, webhook do n8n (opcional) e token do Mercado Pago.
- **Administradores**: adicionar/remover e-mails de acesso.

## 5. Pagamentos

**Pix — InfinitePay (direto):** só precisa da sua @handle na aba Pagamentos.
O site cria o link de checkout e o cliente paga no app do banco. Se quiser usar
seu fluxo do n8n, cole a URL do webhook no campo indicado.

**Cartão — Mercado Pago (Checkout Pro):** o cliente é levado ao checkout
seguro do Mercado Pago. O token vem da aba Pagamentos do painel admin —
você só precisa cadastrar **um único secret** no Cloudflare:

- Cloudflare > **Workers & Pages** > abra seu projeto > **Settings** >
  **Variables and Secrets** > **Add**:
  - Tipo: **Secret** — Nome: `FIREBASE_SERVICE_ACCOUNT`
  - Valor: o conteúdo inteiro do JSON gerado em Firebase Console >
    Project Settings (engrenagem) > **Service accounts** > **Generate new
    private key**
  - Importante: salve para o ambiente **Production** (e de preferência também
    em Preview).
- Essa chave permite que as funções do site leiam o token do Mercado Pago e os
  e-mails administradores direto do seu painel admin — nada mais para configurar.
- Opcional: `MP_ACCESS_TOKEN` (fixa o token por fora), `INFINITEPAY_HANDLE`,
  `ADMIN_EMAILS`, `FIREBASE_DB_URL` — todos têm padrão ou vêm do painel.

> Sobre "site estático não aceita variáveis": o site em si não usa variáveis
> mesmo — quem usa são as **funções serverless** que acompanham o deploy na
> pasta `functions/`. Elas aparecem automaticamente quando o projeto é criado
> pelo GitHub, e as variáveis/secrets ficam em Settings > Variables and Secrets.
> Se você subiu o site por upload direto de arquivos, reconecte pelo GitHub
> (passo 1) para as funções existirem.

Para testar antes de ir para produção, use o token de TESTE do Mercado Pago e
os cartões de teste oficiais (Mastercard 5031 4332 1540 6351, CVV 123, validade
11/30, titular APRO, CPF 12345678909).

## 6. Webhook da InfinitePay — status "Pago" automático

Para o pedido virar "Pago" sozinho quando o Pix cair, use a função que já vai
no repositório (nada de worker separado):

1. Cloudflare > seu projeto Pages > Settings > Variables and Secrets (Encrypt):
   - `FIREBASE_SERVICE_ACCOUNT` = conteúdo inteiro do JSON da chave de serviço
     (mesmo secret da seção do Mercado Pago — só ele é obrigatório).
   - `INFINITEPAY_HANDLE` (opcional): sua @handle — se não existir, o webhook
     aceita a handle que a própria InfinitePay envia no corpo.
2. No app da InfinitePay, cadastre a URL do webhook:
   `https://SEU-SITE.pages.dev/api/webhooks/infinitepay`
3. Pronto: o webhook confere o pagamento, acha o pedido certo (pronta entrega
   ou encomenda) e grava `Status: "Pago"`.

Se preferir manter o worker separado em workers.dev, use o arquivo
`webhook-worker-exemplo.js` como base (a versão antiga não salvava porque o
Firebase exige autenticação para escrever, o caminho pedidos/{nsu} não existe —
o NSU fica dentro do registro — e os campos são com maiúsculas).

## 7. Estrutura

- `src/` — site (React + Tailwind + Firebase)
- `functions/` — Cloudflare Pages Functions (servidor do Mercado Pago)
- `public/` — estáticos (favicon)
