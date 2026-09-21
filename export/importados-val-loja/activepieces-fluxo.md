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

1. **Trigger — Webhook**: já criado (a URL acima é o seu trigger). No app da
   InfinitePay, cadastre essa URL como webhook (mesmo lugar onde você configurou
   o checkout).

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
