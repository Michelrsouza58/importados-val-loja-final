# PRD — Importados da Val (Redesign + Admin + Pagamentos)

## Problema original
Cliente já tinha um site de vendas 100% front-end (Vite + React + Firebase RTDB) hospedado no Cloudflare Pages e pediu: visual mais moderno e profissional, mais conversão/vendas, redesign completo impactante, pagamento com Mercado Pago (cartão) e InfinitePay (só Pix), e um painel de administrador para cadastrar produtos (com múltiplos tipos por produto, ex.: bodysplash Aroma 1/2, cada um com foto e quantidade), ajustar parâmetros financeiros, preencher/trocar credenciais de pagamento e gerenciar e-mails de administradores.

## Arquitetura
- Frontend: React 19 + Tailwind (v3 compartilhado) + framer-motion + lenis + Firebase SDK (Auth + Realtime Database + Storage).
- Dados: RTDB do cliente (items, clientes, carrinho, pedidos, encomendas, configuracoes). Fallback demo quando a leitura é negada pelas regras.
- Pagamentos: InfinitePay Checkout via API pública (handle, POST /links — Pix); Mercado Pago Checkout Pro via endpoint serverless (FastAPI no preview; Cloudflare Pages Function no deploy — functions/api/mercadopago/create-preference.js).
- Deploy alvo: Cloudflare Pages (estático + Functions). Export em /app/export/importados-val-loja e zip baixável em /importados-val-atualizado.zip.

## Personas
- Val (dona): cadastra produtos/variantes, ajusta taxas, acompanha pedidos, troca credenciais.
- Cliente final (mulher, BR): descobre na home, filtra no catálogo, escolhe aroma, paga por Pix ou cartão.

## Implementado (2026-09-21)
- Home cinematográfica: hero cinético com reveal mascarado linha a linha, parallax + tilt 3D no produto, badges flutuantes, marquee editorial, manifesto numerado (01/02/03), destaques, CTA final, footer.
- Catálogo: busca, filtros de categoria e disponibilidade, cards com badge de variantes, modal com seletor de tipos (troca foto/preço/estoque), simulação de parcelas com taxas reais.
- Sacola: itens com variante, seleção de itens, subtotal, cupom de desconto, desconto Pix configurável, checkout Pix (InfinitePay direto ou via n8n) e cartão (Mercado Pago), registro de pedidos/encomendas no RTDB.
- Cupons: cadastro no admin (código, % ou valor fixo, limite de usos, ativo), validação na sacola, incremento atômico de uso via runTransaction, desconto aplicado nos dois métodos de pagamento e registrado no pedido.
- Códigos de produto automáticos IV000001+ (contador configuracoes/ultimoCodigoProduto via runTransaction).
- Menu mobile corrigido: gaveta esquerda com fundo sólido renderizada FORA da navbar (o backdrop-blur da navbar criava containing block e espremia o menu fixo em 63px — causa do "fundo transparente" reportado).
- Login/cadastro de cliente + Meus Pedidos (pagar novamente, cancelar).
- Painel Admin (/admin): login Firebase, gate por lista de admins (dona michelrobertoeletro@gmail.com fixa), abas Produtos (CRUD + variantes + upload Storage), Vitrine (escolha do produto da foto de abertura + destaques "Amados e requisitados"), Pedidos (status + cupom + edição de itens com recálculo do total), Cupons, Financeiro (taxas 1–12x, desconto Pix, máx. parcelas), Pagamentos (handle InfinitePay, webhook n8n, token/public key MP), Administradores (add/remove).
- E-mails automáticos: todo pedido/encomenda dispara aviso para os e-mails administradores E comprovante para a cliente (endpoint /api/emails/pedido, destinatários vindos do servidor: ADMIN_EMAILS + painel de admins; template fixo com dados escapados; função equivalente no Cloudflare functions/api/emails/pedido.js). Testes reais enviados com sucesso para michelrobertoeletro@gmail.com.
- Pop-up de detalhes do pedido em Meus Pedidos: clicar no pedido abre modal com código, cliente, pagamento, data, cupom, itens e total; clicar na foto/nome do item abre o modal do produto (igual ao catálogo) — itens sem produto no catálogo mostram aviso.
- Logo própria da marca (monograma V em degradê rose-gold com brilho, fundo transparente) na navbar e como favicon da aba do navegador (CRA + export).
- Vitrine com destaque comercial: o produto escolhido para a abertura ganha cartão com preço e botão "Ver produto" (abre o modal), e o admin pode habilitar um selo de cupom sobre a imagem (escolhe qual cupom ativo exibir + rótulo automático, ex.: "10% OFF").
- Confirmação automática de pagamento: ao voltar do checkout (ou por consulta periódica a cada 20s), o status do pedido muda sozinho para "Pago" — Pix via POST /payment_check da InfinitePay (identificadores salvos no pedido; handle vem do servidor) e cartão via verificação server-side do pagamento no Mercado Pago (GET /v1/payments). Endpoints: /api/infinitepay/payment-check e /api/mercadopago/confirmar-pagamento (FastAPI + Pages Functions equivalentes). Testado: consulta real responde paid:false para pagamento inexistente e "sem-token" tratado com elegância no MP.
- Webhook da InfinitePay: função /api/webhooks/infinitepay (e worker independente de exemplo) que recebe o aviso da InfinitePay, verifica o pagamento, localiza o registro certo por NSU em pedidos E encomendas e grava Status "Pago" autenticada via service account (JWT RS256 → OAuth2 → REST), idempotente e respondendo <1s. Causas do worker antigo quebrado corrigidas: escrita anônima negada pelas regras, caminho pedidos/{nsu} inexistente (NSU fica dentro do registro) e campos em minúsculas. Frontend filtra nós órfãos criados pelo worker antigo.
- Admin refinado: barra de busca na aba Produtos (nome/código) e nos Pedidos (nº do pedido, nome do cliente via cadastro, e-mail); edição de produto por clique em qualquer parte do card (lixeira flutuante com stopPropagation); parcelamento sem juros por pedido (campo SemJuros, selo no admin e condição especial exibida à cliente no pop-up); Financeiro com painel de números (faturamento recebido, aguardando pagamento, gastos, lucro) e lançamentos de gastos (nó gastos) — taxas movidas para o fim da página.
- Export Cloudflare: projeto Vite equivalente + Pages Functions (Mercado Pago + e-mails) + README-DEPLOY (regras do RTDB, domínios autorizados, variáveis de segredo).

## Pendências / Backlog
- P0: cliente aplicar as regras do RTDB e publicar (README-DEPLOY); adicionar domínio do Cloudflare nos domínios autorizados do Firebase Auth.
- P0: token do Mercado Pago real (variável MP_ACCESS_TOKEN no Cloudflare ou aba Pagamentos) — checkout de cartão só funciona depois.
- P1: webhook/consulta de confirmação de pagamento (payment_check InfinitePay, GET /v1/payments MP) para marcar pedido como Pago automaticamente.
- P1: envio de comprovante/e-mail no pedido aprovado.
- P2: cupons de desconto, frete calculado, WhatsApp flutuante, fotos por variantes no catálogo (miniaturas).

## Credenciais de teste
- Não há contas de teste locais; admin usa Firebase Auth do cliente (michelrobertoeletro@gmail.com + senha do próprio Firebase). Em /app/memory/test_credentials.md consta apenas essa referência.
