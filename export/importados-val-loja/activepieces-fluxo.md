# Fluxo ActivePieces — marcar pedido como Pago quando o Pix cair

## O caminho dos dados

```
Cliente paga o Pix
   → InfinitePay dispara o webhook
      → https://cloud.activepieces.com/api/v1/webhooks/DB3qZw3dDzYwUMLaICej2
         → seu fluxo no ActivePieces
            → Firebase: Status do pedido vira "Pago"
```

## Montando o fluxo (5 minutos)

1. **Trigger — Webhook**: já criado (a URL acima é o seu trigger). Cole essa URL
   em **Admin › Pagamentos › Webhook de pagamento (InfinitePay → ActivePieces)** e
   salve. **Não existe cadastro de webhook no app da InfinitePay**: a InfinitePay só
   chama a URL que vem no campo `webhook_url` de cada checkout criado — e o site
   agora envia essa URL automaticamente em todo checkout Pix. Checkouts gerados
   *antes* de salvar a URL não disparam o webhook.
   Use a URL de produção (`.../webhooks/ID`, sem `/test`) e deixe o fluxo
   **publicado/ligado** no ActivePieces.

   O corpo que a InfinitePay envia quando o pagamento é aprovado:
   `{"invoice_slug","amount","paid_amount","installments","capture_method","transaction_nsu","order_nsu","receipt_url","items"}`

2. **Passo — Code by ActivePieces**: cole o conteúdo de `activepieces-code.js`.
   No campo de inputs, adicione um input chamado `body` e mapeie com o payload
   do trigger (o corpo inteiro do webhook).

3. **Antes de testar, faça os 2 preparos:**
   - Firebase Console > **Authentication > Add user**:
     e-mail `webhook@sistema-importadosval.com` + senha forte.
     Troque `EMAIL` e `SENHA` no código por esses valores.
   - Firebase Console > **Realtime Database > Rules**: inclua o índice de busca
     na regra dos pedidos (o código consulta por número do pedido):

     ```json
     "pedidos": { ".read": "auth != null", ".write": "auth != null", ".indexOn": ["NumeroPedidoLimpo"] },
     ```

4. **Teste**: gere um checkout de teste no site (sacola > Pagar com Pix), pague
   (ou simule o webhook pelo botão "Test flow" do ActivePieces com um corpo tipo
   `{"order_nsu":"0000001","paid_amount":100}`), e veja o pedido virar "Pago"
   no painel admin e na conta da cliente.

## O que o código faz

- Confere se o webhook realmente indica pagamento (`paid` / `paid_amount`);
- Autentica no Firebase com o usuário de sistema (as regras exigem login para escrever);
- Localiza o pedido **pelo número dentro do registro** (`NumeroPedidoLimpo`) —
  nunca por `pedidos/{nsu}`, que não existe;
- Marca **Status: "Pago"** (maiúsculas, como o site lê) com data/hora de SP e
  guarda o `transaction_nsu`;
- Cobre também **encomendas** (encomendas/{cliente}/{lote}), casos de carrinhos
  mistos (pronta entrega + encomenda no mesmo pagamento);
- É seguro reexecutar: só altera pedidos que ainda estão "Aguardando Pagamento".

## Não esqueça

- Depois de ativar, você pode **desligar a confirmação por retorno**: o webhook
  cobre tudo. O site continua confirmando pelo retorno da cliente e pela consulta
  periódica como plano B.
- Se um pedido não virar "Pago", olhe o histórico da execução no ActivePieces —
  o código devolve `{ ok, motivo }` apontando o que faltou.

## Cartão (Mercado Pago) sem secrets no Cloudflare

O caminho padrão do cartão (função do site) precisa que o servidor consiga ler o
Access Token salvo no painel — e isso pede secret no Cloudflare. Como o seu projeto
**não aceita variáveis/secrets**, use o ActivePieces nos dois pontos, igual ao Pix:

```
Sacola → PAGAR com Cartão
   → site envia a sacola para o fluxo "criar pagamento" (ActivePieces)
      → lê o Access Token do painel (Firebase) → cria o link no Mercado Pago
         → devolve o link → o site leva a cliente ao checkout do Mercado Pago

Cliente paga o cartão → Mercado Pago avisa o fluxo "pagamento aprovado" (ActivePieces)
      → confere o pagamento → pedido vira "Pago" no Firebase
```

### Fluxo 1 — "criar pagamento" (obrigatório para este caminho)

1. **Trigger — Webhook**: crie o fluxo, copie a URL e cole em **Admin ›
   Pagamentos › Webhook para CRIAR o pagamento com cartão** e salve.
2. **Passo — Code by ActivePieces**: cole o conteúdo de `activepieces-cartao.js`.
   Crie o input `body` mapeado com o corpo do webhook (a sacola enviada pelo site).
3. **EMAIL/SENHA no código**: o MESMO usuário de sistema do fluxo do Pix.
4. Deixe o fluxo **publicado/ligado**.

### Fluxo 2 — "pagamento aprovado" (o pedido vira "Pago" sozinho)

1. **Trigger — Webhook**: crie o segundo fluxo, copie a URL e cole em **Admin ›
   Pagamentos › Webhook de pagamento aprovado (Mercado Pago)** e salve.
2. **Passo — Code by ActivePieces**: cole o conteúdo de `activepieces-mp-pago.js`
   (input `body` = corpo do webhook).
3. Pronto: o link criado pelo Fluxo 1 já leva essa URL embutida (campo
   `notification_url`) — **nada para cadastrar no Mercado Pago**.

### O que os códigos fazem

- **Fluxo 1**: valida a sacola, autentica no Firebase (usuário de sistema), lê
  `configuracoes/pagamentos/mercadoPagoAccessToken`, cria a preferência com retorno
  para "Meus Pedidos", `external_reference` = nº do pedido e embute a URL do Fluxo 2;
- **Fluxo 2**: recebe a notificação, consulta o pagamento na API do Mercado Pago
  com o mesmo token e só marca "Pago" se `status === "approved"` — cobre pedidos
  (pelo número) e encomendas (por `PagamentoMercadoPago.orderNsu`);
- Os dois são seguros para reexecutar (só mexem no que está "Aguardando Pagamento")
  e devolvem `{ ok, motivo }` no histórico de execução para diagnóstico.

### Se o site disser "sem o link de pagamento"

O site espera que a resposta do Fluxo 1 tenha `{ url }`. Se o ActivePieces não
devolver a saída do Code automaticamente, adicione no fim do fluxo uma ação
"Respond to Webhook" (ou equivalente) devolvendo o resultado do Code.

## Checkout somente Pix

A API da InfinitePay **não aceita** escolher a forma de pagamento por pedido — o
checkout mostra o que está ligado na sua conta. No **App InfinitePay › Vendas ›
Checkout › Configurações › Meios de Pagamento**, desative **Cartão de crédito** e
deixe só o Pix (vale na hora, inclusive para links já gerados).
