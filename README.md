# Saúde Municipal

Plataforma mobile-first (PWA) para Secretarias Municipais de Saúde.
HTML + CSS + JavaScript puro, com Firebase (Auth, Firestore, Storage, Functions, Hosting, FCM) e Groq por trás de uma Cloud Function.

- App do paciente: `index.html`, `login.html`, `cadastro.html`, `app/*`
- Painel da Secretaria: `admin/*`
- Regras de segurança: `firestore.rules` e `storage.rules`
- Backend: `functions/` (JavaScript)

---

## 1. Antes de tudo: configurar o Console do Firebase (projeto `chamados-hopital`)

1. **Authentication → Método de login → ativar "E-mail/senha".**
   Sem isso, o cadastro falha com "Login por e-mail e senha não está ativado".
2. **Firestore Database → criar banco** (modo produção). Anote a **região** do banco.
3. **Storage → começar** (cria o bucket `chamados-hopital.firebasestorage.app`).
4. **Plano Blaze** é necessário só para as Cloud Functions (IA, login por CPF, push e lembretes).
   O fluxo principal (cadastro, solicitação, upload, análise, regulação, fila e agendamento) funciona sem Functions.

## 2. Região das Functions (importante)

Coloque a mesma região do seu banco Firestore em **dois lugares**:

- `functions/config.js` → `REGION`
- `js/firebase-config.js` → `FUNCTIONS_REGION`

Banco em São Paulo → `southamerica-east1` (padrão já configurado). Banco em `nam5` → `us-central1`.

## 3. Publicar

Você precisa do Firebase CLI e de ter feito login nele (`firebase login`).

```bash
cd functions && npm install && cd ..
```

```bash
firebase deploy --only firestore:rules,storage
```

No primeiro deploy do Storage, o CLI pergunta se pode dar ao Storage permissão para ler o Firestore. **Responda que sim**, porque as regras do Storage dependem disso.

```bash
firebase functions:secrets:set GROQ_API_KEY
```

```bash
firebase deploy
```

Se `npm install` reclamar de permissão no `~/.npm`, corrija com `sudo chown -R $(id -u):$(id -g) ~/.npm`.

## 4. Criar o primeiro administrador

1. Console → Authentication → **Adicionar usuário** (e-mail e senha). Copie o **UID**.
2. Console → Firestore → coleção `users` → documento com **ID = UID**:

| campo            | tipo    | valor              |
|------------------|---------|--------------------|
| `municipalityId` | string  | `municipio001`     |
| `role`           | string  | `ADMIN`            |
| `active`         | boolean | `true`             |
| `name`           | string  | seu nome           |
| `email`          | string  | o e-mail           |

3. Entre em `/admin/login.html` → **Configurações → Criar dados iniciais** (procedimentos, unidades e artigos da IA).
4. Os demais servidores são criados em **Usuários**. Cada um recebe um e-mail para definir a própria senha.

## 5. Rodar localmente com emuladores (recomendado para desenvolver)

```bash
firebase emulators:start
```

Abra `http://127.0.0.1:5050/index.html?emulator=1`. O parâmetro liga os emuladores, e o navegador lembra a escolha.
Para voltar ao Firebase real, abra qualquer página com `?emulator=0`.
Para testar a IA no emulador, crie `functions/.secret.local` com `GROQ_API_KEY=sua_chave` (esse arquivo não vai para o Git).

> Nunca abra os arquivos com duplo clique (`file://`): módulos JavaScript precisam de um servidor.
> A porta 5000 é ocupada pelo AirPlay no macOS, por isso o Hosting local usa a porta 5050.

## 6. Notificações push (opcional)

Console → Configurações do projeto → Cloud Messaging → **Certificados push da Web** → gerar o par de chaves.
Cole a chave pública em `VAPID_KEY` (`js/firebase-config.js`). Enquanto ela estiver vazia, o app usa apenas os avisos internos.
No iPhone, o push só funciona com o app adicionado à tela inicial.

## Decisões técnicas que evitam erros comuns

- **Uma única versão do SDK** (12.4.0), importada somente por `js/lib/*.js`, para não haver mistura de versões.
- **Consultas sem índice composto**: apenas filtros de igualdade, com ordenação feita no navegador. Não aparece o erro "The query requires an index".
- **Gravações em lote (writeBatch)**: solicitação + documentos + histórico + auditoria + aviso são gravados juntos ou nada é gravado. As regras usam `getAfter()` para validar lotes.
- **CPF único** garantido pela coleção `cpfIndex` e pelas regras. O login por CPF passa pela função `resolveLoginEmail`.
- **Chave da Groq somente no Secret Manager.** O navegador chama `assistantChat`, que verifica o paciente e envia à IA apenas os dados dele.
- **Prioridade** só pode ser alterada pelos perfis REGULATOR, MANAGER, ADMIN e SUPER_ADMIN (regra no banco, não só na tela).
- **Service worker "rede primeiro"**: o celular não fica preso em versões antigas depois de uma atualização.

## Limites conhecidos do MVP

- As listas do painel carregam todas as solicitações do município e filtram no navegador. Isso funciona bem até alguns milhares de registros; depois, use paginação e índices compostos.
- `resolveLoginEmail` informa se um CPF tem cadastro. Antes de produção, ative o **App Check** para limitar abusos.
- A criação de servidores acontece no navegador, usando uma instância secundária do Firebase. Em uma versão futura, ela pode virar uma Cloud Function com Admin SDK.
