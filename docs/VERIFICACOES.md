# Verificações dos fluxos principais

## O que foi executado, e o que não foi

O ambiente em que este projeto foi escrito não tinha acesso à internet nem a um projeto Supabase. Por isso:

**Executado de verdade**

- A migração SQL completa, em um PostgreSQL 16 local com um simulador mínimo do Supabase (papéis `anon`/`authenticated`, `auth.uid()`, `storage.objects`). As 102 verificações de `supabase/tests/01_verificacoes.sql` passaram.
- Checagem de tipos (`tsc`, modo estrito) de todo o código em `src/`, usando declarações reduzidas de React e supabase-js.
- A interface real (este mesmo código, empacotado) em Chrome automatizado, com celular, painel e TV abertos ao mesmo tempo, ligada ao banco local por um substituto do cliente `supabase-js`. Todas as regras exercitadas são as funções e políticas reais da migração.

**Não executado aqui (confirme no ensaio)**

- `npm install` e `vite build` com as dependências reais.
- O cliente `supabase-js` verdadeiro: login anônimo, Realtime por WebSocket, upload no Storage e links assinados. No teste, o tempo real foi imitado por consultas repetidas; o código de produção assina `postgres_changes` e mantém a consulta de segurança a cada 15–20 s.
- A biblioteca `qrcode.react` (as imagens em `docs/telas` mostram um padrão de enfeite no lugar do QR real) e as fontes do Google (as imagens usam fonte substituta).
- Celulares reais (câmera, HEIC do iPhone, teclado).

O roteiro manual abaixo cobre exatamente esses pontos.

## Resultados automatizados

### Banco (`supabase/tests/01_verificacoes.sql`)

- Sem sessão não se lê nem executa nada.
- Código errado é recusado; 8 erros bloqueiam a sessão; entrar duas vezes não duplica participante.
- Convidado não insere nem altera tabelas, não aprova, não muda a TV, não lê segredos, perguntas, gabarito, palpites ou votos alheios.
- Reenvio do mesmo recado ou foto (mesmo id) não duplica.
- Upload só na própria pasta, com nome `<uuid>.jpg`, com álbum aberto; foto sem arquivo é recusada.
- TV só enxerga aprovados; arquivo pendente é invisível para TV e outros convidados.
- Um girassol por participante; some se todos os recados dele saírem; corrigir o nome não altera a TV sem nova aprovação.
- Palpite único por sessão, com validação de faixa; resumo só para TV e pais.
- Quiz: uma rodada por vez; voto único; opção inválida recusada; voto após o encerramento ou após o prazo do servidor recusado; resposta e resultado ausentes da linha pública até a revelação; enquete sem resposta certa.
- Atividade fechada e evento encerrado bloqueiam envios, votos e uploads, preservando o conteúdo.
- Lembranças: só após liberação, só aprovados, só para quem participou.
- Trocar a chave desconecta a TV antiga.

Concorrência (execução paralela): 120 chamadas simultâneas de voto de 40 participantes resultaram em exatamente 40 votos e `total_votes = 40`; 6 aprovações simultâneas do mesmo recado criaram 1 girassol e 1 aviso de conteúdo.

### Navegador (celular 390×844, TV 1920×1080)

Moderação
- TV sem chave pede pareamento; pareada, remove a chave do endereço.
- Recado pendente não aparece na TV; aprovado, faz nascer o girassol e abre o cartão; o celular do autor passa a mostrar “Aprovado para a TV”.
- Recado recusado nunca chega à TV; o autor vê “Não será exibido”.
- Toque duplo em “Enviar recado” grava uma vez.
- Foto de 3000×4000 saiu do celular como 1200×1600 com menos de 400 KB; aprovada, apareceu no álbum inteira, sem corte.

Votação
- Abrir a rodada levou a TV ao quiz e abriu a pergunta no celular que estava na tela inicial; quem estava em outra atividade recebeu um aviso, sem perder o que fazia.
- Contagem igual no celular e na TV (29 s e 29 s na mesma leitura).
- Um voto por participante; recarregar a página recupera o voto.
- Antes da revelação, nem TV nem banco público têm a resposta; depois, a TV destaca a correta e nunca mostra nomes de quem votou.

Reconexão
- Sem internet, o envio mostra erro com “Tentar de novo”, não afirma sucesso, mantém o texto e nada é gravado; o indicador “Reconectando…” aparece após alguns segundos.
- O rascunho sobrevive a recarregar a página; o reenvio grava uma vez.
- TV offline mantém a tela e avisa; ao voltar, assume o modo atual e mostra o que foi aprovado durante a queda.

Sincronização e persistência
- Trocas de modo no painel chegam à TV (jardim, álbum, quiz, palpites, encerramento).
- 30 aprovações em rajada: jardim com 2 páginas, sem nomes sobrepostos; recarregar a TV mantém jardim e sessão.
- Encerrar o evento leva a TV ao encerramento e bloqueia os convidados; lembranças só aparecem após liberação.
- Exportações: CSV com BOM e acentos corretos; `.zip` íntegro com fotos e `legendas.csv`.

## Roteiro manual para o ensaio (15 minutos)

Use dois celulares (A e B), o painel e a TV.

1. **Entrada**: A lê o QR Code e entra só com o nome. B digita o endereço e o código da TV.
2. **Moderação**: A envia recado e foto (tirada na hora) com legenda. Confirme que nada aparece na TV. Aprove no painel: o girassol nasce, o cartão aparece, e a foto entra no modo Álbum. Use “Retirar da TV” em um item e veja sair.
3. **Tempo real**: troque os modos no painel e veja a TV mudar em 1–2 segundos. Se levar ~15 s, o tempo real não conectou (confira se a migração rodou até o fim, inclusive a última instrução `alter publication`).
4. **Quiz**: transforme uma pergunta em quiz com resposta certa. Coloque no ar, vote com A e B, compare a contagem regressiva nas três telas, encerre e revele.
5. **Reconexão**: com A, escreva um recado, ative o modo avião, toque em enviar (deve aparecer erro e o texto ficar), desative e toque em “Tentar de novo”. Recarregue a TV durante uma rodada: ela volta no mesmo estado.
6. **iPhone**: envie uma foto da galeria (HEIC) e confirme a prévia.
7. **Limite de entrada**: se esperam mais de 30 convidados no mesmo Wi-Fi, confirme o ajuste de *Rate Limits* descrito no README.
8. **Fim**: encerre o evento, baixe os CSV e o `.zip`, e reabra o evento para o dia da festa. Para começar limpo, apague os dados de teste no SQL Editor:

   ```sql
   truncate public.quiz_votes, public.quiz_round_keys, public.quiz_rounds, public.guesses,
            public.garden_flowers, public.photos, public.messages, public.participants,
            public.tv_devices, public.access_attempts cascade;
   update public.event set is_closed = false, guest_gallery_enabled = false,
          tv_mode = 'garden', current_round_id = null where id = 1;
   ```

   (As fotos de teste podem ser apagadas em Storage → `hazel-photos`.)

## Rodar os testes do banco

Em um Postgres local e descartável (nunca no projeto real):

```bash
createdb hazel_teste
psql -d hazel_teste -f supabase/tests/00_simula_supabase.sql
psql -d hazel_teste -f supabase/migrations/0001_cha_da_hazel.sql
psql -d hazel_teste -f supabase/tests/01_verificacoes.sql   # termina com "TODAS AS VERIFICACOES PASSARAM"
```
