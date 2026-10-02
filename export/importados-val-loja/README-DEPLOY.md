# Importados da Val — Loja (Cloudflare)

Loja redesignada em nível premium: home cinematográfica, catálogo com variantes
(ex.: Body Splash Aroma 1 / Aroma 2), sacola com **Pix (InfinitePay)** e
**Cartão (Mercado Pago)**, e **Painel Admin** completo.

O deploy usa o modelo **Worker com script** (`worker.js` + `wrangler.jsonc`):
é esse script que serve as rotas `/api/*` **e** o site — e é ele que libera a
área de **Variables and Secrets** no painel (Worker "só de arquivos estáticos"
não aceita variáveis, como você viu na tela).

## 1. Publicar no Cloudflare (Workers com script)

1. Suba esta pasta no seu repositório GitHub (substitua os arquivos antigos).
2. Seu projeto já está conectado (importados-val-loja-final) — no próximo
   `git push` o Cloudflare roda `npm run build` e publica o Worker com o
   script (`worker.js`) + o site (`dist`) + as rotas `/api/*`.
3. O endereço do site fica em `...workers.dev` (ou no domínio próprio em
   Domains).

## 2. "As variáveis aparecem bloqueadas?" — resolvido pelo worker.js

A mensagem *"Variables cannot be added to a Worker that only has static
assets"* aparecia porque o Worker não tinha script nenhum. **Com este pacote
isso deixa de existir**: o `worker.js` (raiz) + `wrangler.jsonc` fazem o
Worker ter script — e a área passa a aceitar cadastro.

Depois de subir este pacote (push no GitHub):

1. **Workers & Pages** > abra **importados-val-loja-final** > **Settings** >
   **Variables and Secrets** > **Add**:
   - Tipo: **Secret** — Nome: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: o conteúdo inteiro do JSON gerado em Firebase Console >
     Project Settings (engrenagem) > **Service accounts** > **Generate new
     private key**
2. Essa chave permite que as funções leiam o token do Mercado Pago e os
   e-mails administradores direto do painel admin — nada mais para configurar.
3. Opcional: `MP_ACCESS_TOKEN`, `INFINITEPAY_HANDLE`, `ADMIN_EMAILS`,
   `FIREBASE_DB_URL` — todos têm padrão ou vêm do painel.

Se o botão ainda estiver travado, cadastre pelo terminal (uma linha):

```bash
npx wrangler pages secret put FIREBASE_SERVICE_ACCOUNT --project-name=importados-val-loja-final
```

E enquanto o secret não estiver no ar, a loja continua vendendo sem travar:
- **Pix** segue direto pela InfinitePay (confirmação ao retornar + webhook quando ativar);
- **Cartão** só funciona pelo Mercado Pago. Sem token do Mercado Pago, o site avisa
  a cliente para pagar com Pix (a InfinitePay da loja é somente Pix).

**Importante**: adicione o domínio do Worker (ex:
`importados-val-loja-final.sua-conta.workers.dev`) em Firebase Console >
Authentication > Settings > **Authorized domains**.

## 3. Configurar o Firebase (importante!)

O Realtime Database atual está **negando leitura** — por isso o catálogo não
carrega. Em Firebase Console > Realtime Database > Rules, cole:

```json
{
  "rules": {
    "items": { ".read": true, ".write": "auth != null" },
    "clientes": { ".read": "auth != null", "$uid": { ".write": "auth != null && auth.uid === $uid" } },
    "carrinho": { "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" } },
    "pedidos": { ".read": "auth != null", ".write": "auth != null", ".indexOn": ["NumeroPedidoLimpo"] },
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

**Somente Pix:** a API da InfinitePay não permite escolher a forma de pagamento
por pedido — o checkout exibe o que está ligado na conta. No App InfinitePay ›
Vendas › Checkout › Configurações › Meios de Pagamento, desative Cartão de crédito.

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
- **Alternativa mais simples à chave de serviço:** em vez do JSON gigante, cadastre
  DOIS secrets curtos — `FIREBASE_SYSTEM_EMAIL` e `FIREBASE_SYSTEM_PASS` — usando o
  MESMO usuário de sistema do fluxo ActivePieces (`webhook@sistema-importadosval.com`
  e a senha dele). As funções fazem login no Firebase com esse usuário e leem o token
  salvo na aba Pagamentos.
- Opcional: `MP_ACCESS_TOKEN` (fixa o token por fora), `INFINITEPAY_HANDLE`,
  `ADMIN_EMAILS`, `FIREBASE_DB_URL` — todos têm padrão ou vêm do painel.
- **Como conferir se ficou certo:** abra o painel admin › **Pagamentos**. A caixinha
  do Mercado Pago mostra "O servidor consegue ler o token salvo" (verde) ou exatamente
  o que falta configurar (amarelo). Use o botão **Testar credenciais** para validar o
  token direto com o Mercado Pago — ele diz se é de **produção** (APP_USR-, aceita
  vendas reais) ou de **teste** (TEST-, só cartões de teste) e de qual conta é.
  Enquanto a caixinha estiver amarela, o cartão falha mesmo com o token preenchido —
  é isso que estava acontecendo: as regras do Firebase escondem o `pagamentos` de
  quem não está autenticado, então o servidor precisa de um dos secrets acima.

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
2. Cole a URL abaixo em **Admin › Pagamentos › Webhook de pagamento** (no lugar da
   URL do ActivePieces, se quiser usar esta função em vez do ActivePieces):
   `https://importados-val-loja-final.SUA-CONTA.workers.dev/api/webhooks/infinitepay`
   A InfinitePay não tem cadastro de webhook no app: o site envia essa URL no
   campo `webhook_url` de cada checkout criado.
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
