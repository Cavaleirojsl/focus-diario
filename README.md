# FOCUS — Diário de Evolução

Aplicação web de organização pessoal para registrar atividades, marcar sucessos/falhas, escrever descrições, acompanhar gráficos por dia/semana/mês e manter objetivos.

## Estrutura

- `index.html` — estrutura da página.
- `css/style.css` — visual responsivo.
- `js/app.js` — lógica, gráficos e armazenamento local.

## Executar

Abra `index.html` em um navegador. A biblioteca Chart.js é carregada por CDN, então os gráficos precisam de conexão com a internet.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub chamado `focus-diario`.
2. Envie `index.html`, `css/style.css`, `js/app.js` e `README.md`, mantendo as pastas.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`, depois salve.
6. Aguarde a publicação e abra o endereço indicado pelo GitHub Pages.

## Dados e privacidade

As tarefas e os objetivos são guardados em `localStorage` no navegador deste aparelho. Não há servidor ou sincronização entre aparelhos nesta versão. Use o botão de exportação para salvar um backup JSON. Limpar os dados do navegador pode apagar os registros locais.

## Próximas evoluções

Para uma aplicação multiaparelho, com login e sincronização, será necessário adicionar backend e banco de dados (por exemplo, Supabase ou Firebase), além de regras de segurança.
