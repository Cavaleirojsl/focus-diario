# FOCUS — Diário de Evolução

O **FOCUS** é um diário pessoal de atividades criado para ajudar a organizar objetivos, acompanhar resultados e aprender com a própria rotina. A proposta é registrar o que você pretendia fazer, observar o que funcionou e decidir qual será o próximo passo — sem transformar dificuldades em motivo para desistir.

> **Status:** em desenvolvimento. Confira o código e a versão publicada para saber quais recursos já estão disponíveis.

## ✨ Sobre o projeto

O FOCUS pretende reunir em um só lugar o registro de atividades, o histórico de resultados e indicadores de evolução. A ideia central é que produtividade não significa acertar sempre: registrar dificuldades também ajuda a ajustar o plano e continuar avançando.

## Recursos planejados

- Cadastro e edição de atividades.
- Descrição e categorização das atividades.
- Estados como pendente, concluída com sucesso ou não realizada.
- Histórico por dia, semana e mês.
- Painel com indicadores e gráficos.
- Metas e mensagens de incentivo.
- Exportação de dados para backup.
- Futuras possibilidades: calendário, diário de reflexão, conquistas, instalação como PWA e sincronização entre dispositivos.

**Atenção:** esta lista descreve a proposta do projeto. Nem todos os recursos planejados necessariamente estão implementados na versão atual.

## 🧰 Tecnologias

- **HTML5** — estrutura da interface.
- **CSS3** — estilos e adaptação a diferentes telas.
- **JavaScript** — interações e regras da aplicação.
- **Chart.js** — gráficos, quando carregado pela CDN.
- **localStorage** — armazenamento local no navegador, na versão sem backend.
- **GitHub Pages** — opção para publicar o site estático.

## 📁 Estrutura esperada

```text
focus-diario/
├── index.html
├── README.md
├── css/
│   └── style.css
└── js/
    └── app.js
```

A estrutura pode mudar durante o desenvolvimento. Confira os arquivos existentes no repositório.

## 🚀 Como executar

### Abrir localmente

1. Baixe ou clone o repositório.
2. Abra `index.html` em um navegador moderno.
3. Para desenvolver e testar com mais consistência, use um servidor local compatível com seu ambiente.

Se houver bibliotecas externas por CDN, recursos como gráficos poderão depender de conexão com a internet.

### Publicar com GitHub Pages

1. Envie os arquivos para um repositório no GitHub.
2. Abra **Settings** do repositório.
3. Entre em **Pages**.
4. Em **Build and deployment**, escolha a publicação a partir de uma branch.
5. Selecione a branch principal (por exemplo, `main`) e a pasta raiz (`/root`), caso `index.html` esteja na raiz.
6. Salve e aguarde a publicação.
7. Acesse a URL indicada na seção Pages.

Use caminhos relativos corretos para CSS, JavaScript e imagens. Por exemplo: `css/style.css` e `js/app.js`. Caminhos que começam com `/` podem falhar em sites publicados em subdiretórios.

## 💾 Armazenamento e privacidade

Na versão que utiliza `localStorage`, os registros ficam salvos no navegador e no dispositivo usados. Portanto:

- os dados não são sincronizados automaticamente entre aparelhos;
- limpar os dados do navegador/site pode apagar os registros;
- abrir o projeto em outro navegador ou aparelho não garante que os dados estejam disponíveis;
- publicar no GitHub Pages não cria, por si só, contas de usuário nem banco de dados.

Faça backups quando a exportação estiver disponível. Evite registrar informações pessoais sensíveis que não sejam necessárias.

## 🧭 Princípios do FOCUS

- Incentivar consistência sem exigir perfeição.
- Tratar dificuldades como informações úteis para ajustar o plano.
- Mostrar estatísticas transparentes, calculadas a partir dos dados reais.
- Manter a interface clara e confortável no celular.
- Respeitar a privacidade e explicar as limitações.
- Manter o código simples e fácil de evoluir.

## 🛠️ Próximas etapas

1. Refinar o design e a experiência em celulares.
2. Melhorar o painel principal e os gráficos.
3. Adicionar calendário com histórico diário.
4. Incluir reflexões e análise de dificuldades.
5. Desenvolver metas, níveis e conquistas saudáveis.
6. Avaliar banco de dados, login e sincronização.
7. Avaliar suporte a PWA e funcionamento offline.

Essas etapas são planos, não garantias de que já estejam disponíveis.

## 🤝 Sugestões e contribuições

Sugestões são bem-vindas. Ao propor melhorias, explique o problema, descreva o comportamento esperado e considere acessibilidade, privacidade e uso em celulares. Quando o funcionamento mudar, atualize esta documentação.

## 📄 Licença

Este repositório ainda não declara uma licença específica. Para permitir reutilização e contribuições públicas de forma clara, escolha uma licença apropriada e adicione o arquivo correspondente.

---

**FOCUS — Diário de Evolução**  
*Um passo de cada vez. Aprenda com o processo e continue avançando.*
