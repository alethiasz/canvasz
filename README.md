# canvasz

Canvas infinito para gerenciar projetos: notas, pastas navegáveis entrando no
canvas de cada uma, e arquivos de qualquer formato — visualizáveis tanto no
modo canvas quanto no modo arquivo.

> Estado atual: completo em relação ao plano — pastas, notas, arquivos, busca,
> lixeira, export e backup.

## Como usar

### Modo canvas

- **+ pasta**, **+ nota** e **+ arquivo** criam um card no centro da vista.
- **Arraste arquivos** para o canvas — qualquer formato, quantos quiser. Imagens
  viram miniatura no card; o resto vira card com ícone, tamanho e download.
- **Duplo clique** numa pasta entra nela — cada pasta é um canvas próprio, com
  seus próprios desenhos. Duplo clique numa nota abre o modo arquivo.
- **Arraste um card sobre uma pasta** para mover o item para dentro dela: a
  pasta se destaca e o card sai deste canvas, porque agora vive no canvas dela.
- A **trilha** no topo (`raiz › Projeto › Sub`) volta para qualquer nível;
  **↑ subir** vai um nível acima.
- O **✎** em qualquer card renomeia; **Delete** manda o item (e tudo dentro)
  para a lixeira, e **Ctrl+Z** traz de volta.
- Cards e desenhos convivem: arraste, ligue com setas, rabisque em volta.

### Lixeira, export e atalhos

- **🗑** abre a lixeira. Apagar manda para lá (com tudo que estava dentro);
  de lá dá para **restaurar** ou **apagar de vez** — e só aí os arquivos saem
  do disco, se nenhum outro item ainda usar o mesmo conteúdo.
- **↓ exportar** baixa a pasta atual como `.zip`: notas viram `.md` na mesma
  hierarquia e os arquivos vão com o nome original. Na raiz, exporta tudo.
- Atalhos: **Cmd/Ctrl+K** busca · **Alt+↑** sobe um nível · **Ctrl+Z** desfaz
  no canvas, inclusive um apagamento.

### Busca (Cmd+K / Ctrl+K)

De qualquer tela, inclusive digitando no editor. Busca em títulos, no corpo das
notas e **dentro dos arquivos** — o texto de PDFs e DOCX é extraído em segundo
plano no upload e indexado junto.

- **⏎** abre (nota e arquivo no modo arquivo, pasta no canvas).
- **⇧⏎** vai até o canvas da pasta e **enquadra o card** do resultado.

### Modo arquivo

- Barra lateral com a árvore inteira; clicar numa nota abre, numa pasta vai
  para o canvas dela. **Arraste** um item sobre uma pasta para movê-lo, ou
  solte na área vazia para mandar de volta à raiz.
- Editor Markdown (CodeMirror) com **editar / dividido / ler**. Salva sozinho
  meio segundo depois que você para de digitar.
- **`[[Título]]`** liga notas. Se a nota não existir, o link aparece em laranja
  e clicar nele **cria a nota** já com esse nome.
- **Arraste ou cole um arquivo dentro do editor** para anexá-lo à nota: imagem
  entra embutida, qualquer outro formato vira um anexo clicável.
- Abrir um arquivo mostra a visualização certa: imagem, vídeo e áudio tocam ali
  (com navegação por Range), PDF abre embutido, texto e código aparecem crus.
  Formato desconhecido nunca é recusado — vira card com botão de baixar.

## Rodar com Docker (qualquer PC)

Só precisa de Docker com Compose:

```bash
docker compose up
```

Abra <http://localhost:8787>. Para rodar em segundo plano, `docker compose up -d`;
para parar, `docker compose down`.

Seus dados ficam em **`./data`** no host — banco SQLite e arquivos enviados.
`docker compose down` não apaga nada; apagar `./data` apaga tudo.

### Detalhes que costumam dar dor de cabeça (e aqui não dão)

- **Permissões**: o container herda o dono de `./data` e roda com esse usuário,
  nunca como root. Seus arquivos continuam seus, seja qual for o seu `id -u`.
  Se `./data` não existir na primeira execução, o Docker a cria como root e o
  container cai no padrão `PUID`/`PGID` = 1000; nesse caso, copie `.env.example`
  para `.env` e ajuste com a saída de `id -u` e `id -g`.
- **Porta ocupada**: defina `CANVASZ_PORT` no `.env`.

## Levar seu conteúdo para o GitHub

Seu conteúdo mora em `data/`, que é um **repositório próprio e privado** —
separado do código, para que as notas não acabem numa vitrine pública.

Configure uma vez:

```bash
npm run sync:init          # cria o repo privado e prepara data/
npm run sync               # envia seu conteúdo
```

Depois, `npm run sync` é o comando único: ele consolida o banco, atualiza o
espelho em markdown, faz o commit, puxa o que veio de outro PC e envia.

Em outro computador:

```bash
git clone https://github.com/<você>/canvasz.git
cd canvasz
git clone https://github.com/<você>/canvasz-data.git data
docker compose up
```

### O que vai junto

| o quê | onde | serve para |
| --- | --- | --- |
| `canvasz.db` | banco inteiro, inclusive os desenhos | a fonte da verdade |
| `blobs/` | os arquivos enviados, pelo SHA-256 | conteúdo original |
| `notes/` | espelho das notas em `.md` | ler pelo site do GitHub, ver os diffs |

O `notes/` é regerado a cada sincronia a partir do banco. É ele que faz um
commit mostrar *o que* você escreveu, em vez de "arquivo binário mudou" — e é
a sua garantia de continuar com as notas mesmo sem o canvasz um dia.

### Um PC de cada vez

O banco é um arquivo binário: **o git não consegue mesclar duas versões dele**.
Se você escrever no PC A e no PC B sem sincronizar entre um e outro, o `sync`
para e exige uma escolha, em vez de descartar algo por conta própria:

```
npm run sync -- --keep-mine     mantém o deste PC, descarta o remoto
npm run sync -- --keep-theirs   mantém o remoto, descarta o deste PC
```

Por isso o hábito: sincronizar ao sentar e ao levantar. `npm run backup` antes,
se estiver na dúvida.

### Backup

```bash
npm run backup                      # sem Docker
docker compose exec app npm run backup   # com Docker
```

Grava em `backups/canvasz-<data>/` uma cópia do banco feita com `VACUUM INTO`
— consistente mesmo com o app rodando e escrevendo, o que copiar o `.db` à mão
não garante — mais os arquivos enviados. Para restaurar: pare o app e copie o
conteúdo de volta para `data/`.

Também dá para levar tudo embora em formato aberto pelo **↓ exportar** na raiz:
um `.zip` com as notas em `.md` e os arquivos originais.

## Rodar sem Docker (desenvolvimento)

Precisa de **Node >= 22.12** (a versão fixada está em `.nvmrc`; `nvm use` a adota):

```bash
npm install
npm run dev
```

Sobe o Vite em <http://localhost:5173> e a API em <http://localhost:8787>, com o
mesmo diretório `./data` usado pelo Docker — dá para alternar entre os dois.

| Comando            | O que faz                                   |
| ------------------ | ------------------------------------------- |
| `npm run dev`      | Vite + API com recarregamento               |
| `npm run build`    | Compila o front em `dist/`                  |
| `npm start`        | Serve front e API juntos (modo produção)    |
| `npm run typecheck`| Checagem de tipos                           |
| `npm test`         | Testes (API, mime, wikilinks)               |
| `npm run backup`   | Cópia consistente de `data/`                |

## Arquitetura em uma frase

O tldraw é a camada de visualização de geometria e desenho livre; o **SQLite é a
fonte da verdade do conteúdo**. Cada pasta é um documento tldraw próprio,
carregado sob demanda ao entrar nela.

- `server/` — API Hono, SQLite (`better-sqlite3`), migrations em `server/migrations/`
- `server/blobs.ts` — arquivos gravados em fluxo e endereçados por SHA-256, com
  deduplicação: subir o mesmo arquivo duas vezes ocupa espaço uma vez só
- `server/searchIndex.ts` — índice FTS5; `server/extract.ts` extrai texto de
  PDF e DOCX numa fila em processo, depois da resposta do upload
- `src/canvas/` — canvas tldraw, persistência e shapes customizados
- `src/canvas/shapes/index.ts` — **leia o comentário antes de mexer**: `createTLStore`
  não mescla os shape utils padrão, ao contrário do componente `<Tldraw>`

O backend roda TypeScript direto no Node 24 (type stripping), sem passo de
compilação nem `tsx` na imagem de produção.

Os testes exercitam a API inteira em memória via `app.request()` do Hono —
sem porta, sem espera, sem servidor órfão. `server/testHarness.ts` monta um
SQLite descartável por arquivo de teste.

## Licença do tldraw

O SDK do tldraw não é MIT. O uso pessoal é gratuito, mas mantém a marca d'água
"made with tldraw" no canvas; removê-la exige licença comercial paga.
# canvasz
