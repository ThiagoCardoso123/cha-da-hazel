# Chá da Hazel

Aplicação web para usar ao vivo no chá de bebê: os convidados participam pelo celular, os pais aprovam e comandam pelo painel, e a TV mostra o **Jardim da Hazel** em tempo real.

| Endereço | Para quem | O que faz |
|---|---|---|
| `/` | Convidados (celular) | Recado, álbum, palpites e quiz |
| `/tv` | Computador ligado à TV | Jardim ao vivo, álbum, quiz, palpites e encerramento |
| `/admin` | Pais (celular) | Aprovar conteúdo, trocar o modo da TV, conduzir o quiz, exportar |

Guia do dia da festa: [`docs/OPERACAO.md`](docs/OPERACAO.md). O que foi testado e como: [`docs/VERIFICACOES.md`](docs/VERIFICACOES.md).

## Stack e decisões

- **React 18 + TypeScript + Vite**, **Tailwind CSS v4**, **Supabase** (Postgres, Auth, Storage, Realtime).
- **Sem biblioteca de animação**: são poucas animações (flor nascendo, cartão de recado, trocas de modo) e CSS dá conta, com `prefers-reduced-motion` respeitado.
- **Sem biblioteca de rotas**: são três endereços fixos, resolvidos em `src/main.tsx`.
- **Ilustrações em SVG** feitas no código (`src/art/Art.tsx`), com filtro de aquarela e grão de papel. Nenhuma imagem pesada, vídeo ou 3D.
- **Toda a regra de negócio fica no banco** (`supabase/migrations/0001_cha_da_hazel.sql`): convidados não escrevem em tabela nenhuma diretamente, só chamam funções que validam tudo no servidor.

## Instalação (uns 20 minutos)

### 1. Criar o projeto no Supabase

1. Crie um projeto em <https://supabase.com> (o plano gratuito atende uma festa).
2. **Authentication → Sign In / Providers**: ative **Allow anonymous sign-ins**. É o que permite entrar sem cadastro.
3. **Authentication → Rate Limits**: aumente o limite de **logins anônimos** (o padrão é 30 por hora *por endereço IP*, e todo o Wi-Fi da festa conta como um IP só). Coloque um valor folgado, por exemplo 300. **Sem isso, o 31º convidado no mesmo Wi-Fi não consegue entrar.** Confira esse ajuste no painel antes do evento.
4. **SQL Editor**: cole e rode o arquivo `supabase/migrations/0001_cha_da_hazel.sql` inteiro, uma única vez. Ele cria tabelas, permissões, funções, o bucket privado de fotos e liga o tempo real.

### 2. Criar o administrador inicial

1. **Authentication → Users → Add user → Create new user**: informe e-mail e senha fortes e marque *Auto Confirm User*. Repita para o segundo responsável, se quiser.
2. No **SQL Editor**, marque cada um como administrador:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'voce@exemplo.com';
   ```

Ter uma conta não dá poder nenhum: só quem está em `public.admins` aprova conteúdo ou controla a TV. (Se entrar em `/admin` com um usuário ainda não marcado, a própria tela mostra o comando SQL pronto.)

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com os valores de **Project Settings → API**:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=chave anon (ou publishable)
VITE_PUBLIC_URL=https://endereco-final-do-site
```

Nenhuma delas é segredo. A chave `service_role`/`secret` **não** é usada e não deve ir para o frontend.

### 4. Rodar e publicar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # checa tipos e gera dist/
```

Publicação (Vercel, Netlify ou Cloudflare Pages): importe o repositório, comando de build `npm run build`, pasta `dist`, e cadastre as três variáveis. O projeto já inclui `vercel.json` e `public/_redirects` para que `/tv` e `/admin` abram direto. Depois de publicar, ajuste `VITE_PUBLIC_URL` para o endereço final (é ele que vira QR Code) e publique de novo. Um endereço curto facilita para quem digitar.

### 5. Ensaio antes da festa

Faça o roteiro de [`docs/OPERACAO.md`](docs/OPERACAO.md) com dois celulares e a TV pelo menos um dia antes. Projetos gratuitos do Supabase são pausados após uma semana sem uso: abra o painel do Supabase na véspera para confirmar que está ativo.

## Como o acesso é limitado

- **Convidados**: precisam do **código do evento**. Ele já vai dentro do QR Code; quem digita o endereço informa o código mostrado na TV. Oito tentativas erradas bloqueiam aquela sessão por 10 minutos. O código pode ser trocado em *Painel → TV*.
- **TV**: `/tv` só funciona depois de apresentar a **chave da TV** (link gerado em *Painel → TV → Ligar a TV*). A chave sai do endereço assim que a tela é pareada e pode ser trocada a qualquer momento, o que desconecta TVs antigas.
- **O que cada um enxerga** (garantido por RLS no banco, não pela interface):
  - convidado: só os próprios recados, fotos, palpite e voto;
  - TV: só recados e fotos **aprovados**, os girassóis e totais agregados (nunca votos ou palpites individuais);
  - pais: tudo.
- **Fotos**: ficam em bucket privado. Não existe galeria pública nem endereço permanente; a TV e o painel usam links assinados que expiram em 1 hora. Fotos pendentes só são visíveis para quem enviou e para os pais.
- **Resposta do quiz**: fica em tabela que só os pais leem. A linha pública da rodada só recebe a resposta e o resultado no momento em que os pais revelam, então nem consultas nem eventos de tempo real a expõem antes.
- **Depois do evento**: nada fica público automaticamente. Os pais podem liberar (e fechar de novo) uma versão de leitura, visível apenas para quem participou, no próprio celular.

### Limitação assumida

Sem cadastro, o controle é **por sessão/aparelho**, não por pessoa. Quem limpar os dados do navegador ou usar outro aparelho entra como novo participante e pode votar ou palpitar de novo. Para uma festa entre amigos e família, isso foi preferido a exigir login. Nomes e conteúdos só chegam à TV depois de aprovados pelos pais; ao corrigir o nome, o girassol já plantado só muda quando um novo recado for aprovado.

## Limites contra excesso

| Item | Limite |
|---|---|
| Recado | 280 caracteres; 3 por minuto; 30 por participante |
| Foto | reduzida no celular para até 1600 px (JPEG, em geral 200–500 KB); servidor aceita só JPEG até 4 MB; 6 por minuto; 40 por participante |
| Palpite | 1 por participante, editável enquanto aberto |
| Voto | 1 por participante por rodada, dentro do prazo do servidor |

Plano gratuito do Supabase (confira os valores atuais em supabase.com/pricing): 200 conexões simultâneas de tempo real, 1 GB de arquivos e 5 GB de tráfego por mês. Cada celular, o painel e a TV usam uma conexão.

## Exportar as lembranças

Em *Painel → Evento → Guardar as lembranças*: recados e palpites em CSV (UTF-8 com BOM e ponto e vírgula, abre com acentos no Excel) e fotos aprovadas em um `.zip` com `legendas.csv`. Alternativa para todas as fotos, inclusive pendentes: Supabase → Storage → `hazel-photos`.

## Estrutura

```
supabase/migrations/0001_cha_da_hazel.sql   esquema, RLS, funções, storage, realtime
supabase/tests/                             verificações do banco (Postgres local descartável)
src/lib/api.ts                              única porta para o Supabase
src/lib/useLive.ts                          estado ao vivo, reconexão e relógio do servidor
src/lib/util.ts                             textos de erro, compressão de foto, CSV, zip
src/art/Art.tsx                             girassol, arco-íris e filtros de aquarela
src/guest/                                  experiência dos convidados
src/tv/                                     Jardim da Hazel e demais modos da TV
src/admin/                                  painel dos pais
```

Não há modo de demonstração nem dados fictícios: o banco começa vazio, apenas com as cinco perguntas sugeridas, cadastradas como **enquete** (sem resposta certa). Para transformar uma delas em quiz, edite no painel e marque a alternativa correta.
