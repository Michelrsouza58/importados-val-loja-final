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

## Checkout somente Pix

A API da InfinitePay **não aceita** escolher a forma de pagamento por pedido — o
checkout mostra o que está ligado na sua conta. No **App InfinitePay › Vendas ›
Checkout › Configurações › Meios de Pagamento**, desative **Cartão de crédito** e
deixe só o Pix (vale na hora, inclusive para links já gerados).
