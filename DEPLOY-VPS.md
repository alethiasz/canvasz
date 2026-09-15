# Publicar o canvasz numa VPS (junto de outra aplicação)

Este guia coloca o canvasz no ar em `http://IP-DA-VPS:PORTA`, aberto para
qualquer pessoa com o link ver **e editar**, sem login. Ele roda num container
próprio, numa porta própria e num diretório próprio — não mexe na outra
aplicação nem no painel (Coolify, EasyPanel ou o Docker da Hostinger).

> **Leia antes: o que "todo mundo edita" significa na prática**
>
> - **Qualquer pessoa pode apagar tudo**, inclusive "apagar de vez" pela
>   lixeira, que remove os arquivos do disco. O backup automático do passo 7
>   é o que te protege disso — não pule.
> - **Não há tempo real.** Quem está com a página aberta só vê o que os outros
>   mudaram ao recarregar.
> - **Duas pessoas no mesmo canvas ao mesmo tempo:** vale o último salvamento.
>   O desenho de uma sobrescreve o da outra, sem aviso. O mesmo vale para uma
>   nota editada por duas pessoas juntas.
> - **Sem HTTPS**, o tráfego não é criptografado, e o navegador desliga algumas
>   APIs. Criar, desenhar, enviar arquivos, editar notas e buscar foram
>   testados assim e funcionam. Copiar e colar formas dentro do canvas depende
>   da área de transferência, que o navegador bloqueia fora de HTTPS — pode não
>   funcionar.
> - Esta cópia é **separada** da que está no seu PC: o `npm run sync` não fala
>   com a VPS.

---

## 1. Entrar na VPS e conferir o Docker

```bash
ssh root@IP-DA-VPS
docker compose version
```

Se o segundo comando responder com uma versão, siga. Painéis como Coolify e
EasyPanel já instalam o Docker; se não houver, instale pelo painel da Hostinger
ou com `curl -fsSL https://get.docker.com | sh`.

## 2. Escolher uma porta livre

A outra aplicação e o painel já ocupam algumas portas. Confira se a 8787 está
livre:

```bash
ss -ltnp | grep -E ':8787\b' || echo "8787 livre"
```

Se estiver ocupada, escolha outra (ex.: 8788) e use-a no passo 4.

## 3. Baixar o canvasz

```bash
git clone https://github.com/alethiasz/canvasz.git /opt/canvasz
cd /opt/canvasz
```

## 4. Configurar

```bash
cp .env.example .env
nano .env
```

Ajuste o que precisar:

| variável | para quê | padrão |
| --- | --- | --- |
| `CANVASZ_PORT` | porta do link público | `8787` |
| `CANVASZ_MAX_UPLOAD_MB` | tamanho máximo de cada arquivo enviado | `500` |
| `CANVASZ_BACKUP_KEEP` | quantos backups guardar | `0` (todos) |

O limite de upload existe porque o disco é dividido com a outra aplicação: um
único envio gigante encheria o disco e derrubaria as duas.

## 5. (Opcional) Levar o conteúdo que você já tem

Pule se quiser começar vazio. No **seu PC**, na pasta do canvasz:

```bash
npm run backup
scp -r backups/canvasz-*/. root@IP-DA-VPS:/opt/canvasz/data/
```

O `npm run backup` gera uma cópia consistente do banco; copiar o `data/`
direto, com o app aberto, pode levar um banco corrompido. Se houver mais de um
backup em `backups/`, troque o `*` pelo mais recente.

## 6. Subir

Na VPS:

```bash
cd /opt/canvasz
docker compose up -d --build
curl http://localhost:8787/api/health   # troque 8787 se mudou a porta
```

A resposta tem que ser `{"ok":true}`. O primeiro build demora alguns minutos.
Se ele morrer no meio numa VPS com pouca memória, crie swap e tente de novo:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

### Liberar a porta

No painel da Hostinger: **VPS → Segurança → Firewall**. Se houver regras
ativas, adicione uma aceitando **TCP** na porta escolhida. Depois, do seu PC,
abra `http://IP-DA-VPS:8787` — esse é o link para compartilhar.

## 7. Backup automático (não pule)

Com edição aberta, o backup é a única forma de desfazer um estrago. Na VPS:

```bash
crontab -e
```

E adicione a linha abaixo (todo dia às 3h, guardando os 14 mais recentes):

```
0 3 * * * cd /opt/canvasz && docker compose exec -T -e CANVASZ_BACKUP_KEEP=14 app npm run backup >> /var/log/canvasz-backup.log 2>&1
```

Os backups ficam em `/opt/canvasz/backups/`. Para restaurar um:

```bash
cd /opt/canvasz
docker compose down
rm -rf data/canvasz.db* data/blobs
cp -r backups/canvasz-AAAA-MM-DDTHH-MM-SS/. data/
docker compose up -d
```

## Atualizar para uma versão nova

```bash
cd /opt/canvasz
git pull
docker compose up -d --build
```

Os dados em `data/` não são tocados.

## Pelo painel, em vez do terminal

Coolify e EasyPanel conseguem publicar a partir do repositório
(`https://github.com/alethiasz/canvasz`) usando o `compose.yaml`. Se for por
esse caminho, confira duas coisas no painel: que `/app/data` está num
**volume persistente** (sem isso, cada deploy apaga todo o conteúdo) e que a
porta publicada não colide com a outra aplicação. O caminho pelo terminal acima
é o que foi testado.
