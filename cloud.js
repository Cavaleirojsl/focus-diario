/* FOCUS — conta e nuvem (Supabase): login, cadastro, sair e sincronização dos dados.
   A chave abaixo é a chave PUBLICÁVEL: ela pode ficar no site. Nunca coloque aqui a chave "secret".
   Segurança: cada pessoa só lê e grava a própria linha, garantido pelas regras (RLS) do banco. */
(() => {
  "use strict";

  const SUPABASE_URL = "https://gxkruhpgbmvfxxhrkwrr.supabase.co";
  const SUPABASE_KEY = "sb_publishable_SG_FJk4tgjIRcPLr4YIMSw_C7d5owSu";
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.104.0/dist/umd/supabase.js";
  const META_KEY = "focus-diario-sync";

  const byId = (id) => document.getElementById(id);
  let client = null;
  let busy = false;
  let currentUser = null;
  let syncing = false;
  let syncAgain = false;
  let syncTimer = null;
  let changeCount = 0;

  /* ---------- Mensagens ---------- */
  function friendlyError(error) {
    const code = String((error && error.code) || "");
    const text = String((error && error.message) || "").toLowerCase();
    if (code === "invalid_credentials" || text.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
    if (code === "email_not_confirmed" || text.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos e tente de novo.";
    if (code === "user_already_exists" || text.includes("already registered")) return "Esse e-mail já tem conta. Use Entrar.";
    if (code === "weak_password" || text.includes("password should be")) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    if (code.includes("rate_limit") || text.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (code === "signup_disabled") return "Os cadastros estão desativados no momento.";
    if (code === "validation_failed" && text.includes("provider")) return "O login com Google ainda não foi ativado no Supabase. Siga o passo a passo de configuração.";
    if (text.includes("provider is not enabled") || text.includes("unsupported provider")) return "O login com Google ainda não foi ativado no Supabase. Siga o passo a passo de configuração.";
    if (text.includes("failed to fetch") || text.includes("network")) return "Sem conexão com o serviço. Verifique sua internet.";
    return "Não foi possível concluir. Tente novamente em instantes.";
  }

  function syncErrorText(error) {
    const code = String((error && error.code) || "");
    const text = String((error && error.message) || "").toLowerCase();
    if (text.includes("failed to fetch") || text.includes("network") || text.includes("load failed")) return "Sem conexão. Suas alterações ficam salvas aqui e serão enviadas quando a internet voltar.";
    if (code === "PGRST205" || code === "42P01") return "A tabela da nuvem ainda não foi criada. Rode o SQL do passo 1 no Supabase.";
    if (code === "42501") return "A nuvem recusou o acesso. Saia e entre de novo na conta.";
    if (code === "23514") return "Seus dados passaram do limite de 3 MB da nuvem. Exporte um backup e arquive tarefas antigas.";
    return "Não foi possível sincronizar agora. Tentaremos de novo em instantes.";
  }

  function setStatus(message, isError) {
    const element = byId("account-status");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("warn", Boolean(isError));
  }

  function setSync(message, isError) {
    const element = byId("sync-status");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("warn", Boolean(isError));
  }

  const clock = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const stamp = (text) => `${text} às ${clock()}.`;

  function setBusy(value) {
    busy = value;
    ["auth-signin", "auth-signup", "auth-google", "auth-signout", "sync-now", "cloud-delete"].forEach((id) => {
      const button = byId(id);
      if (button) button.disabled = value;
    });
  }

  /* ---------- Controle local da sincronização ---------- */
  function readMeta() {
    try {
      const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
      return meta && typeof meta === "object" ? meta : {};
    } catch (error) {
      return {};
    }
  }
  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (error) { /* sem espaço: ignora */ }
  }
  function markDirty() {
    changeCount += 1;
    const meta = readMeta();
    meta.dirty = true;
    writeMeta(meta);
  }
  function snapshot() {
    return { count: changeCount, data: window.FocusApp.getData() };
  }

  /* ---------- Sincronização ---------- */
  function scheduleSync(delay) {
    if (!currentUser || !client) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay);
  }

  async function pushRow(userId, expectedUpdatedAt, message) {
    const { count, data } = snapshot();
    const { data: updated, error } = await client
      .from("diary_data")
      .update({ data })
      .eq("user_id", userId)
      .eq("updated_at", expectedUpdatedAt)
      .select("updated_at");
    if (error) throw error;
    if (!updated || !updated.length) return null; // outro aparelho gravou no meio: tenta de novo
    writeMeta({ userId, lastSync: updated[0].updated_at, hadSync: true, dirty: count !== changeCount });
    return stamp(message);
  }

  async function syncOnce() {
    const app = window.FocusApp;
    const userId = currentUser.id;
    const { data: row, error } = await client.from("diary_data").select("data, updated_at").eq("user_id", userId).maybeSingle();
    if (error) throw error;

    let meta = readMeta();
    if (meta.userId !== userId) meta = { userId, lastSync: null, hadSync: false, dirty: true };

    if (!row) {
      const { count, data } = snapshot();
      if (app.isEmpty(data)) {
        writeMeta({ userId, lastSync: null, hadSync: true, dirty: false });
        return "Conectado. Ainda não há dados para sincronizar.";
      }
      const { data: created, error: insertError } = await client.from("diary_data").insert({ user_id: userId, data }).select("updated_at").single();
      if (insertError) {
        if (insertError.code === "23505") return null; // outro aparelho criou antes: tenta de novo
        throw insertError;
      }
      writeMeta({ userId, lastSync: created.updated_at, hadSync: true, dirty: count !== changeCount });
      return stamp("Dados enviados para a nuvem");
    }

    const remote = app.normalize(row.data);
    const remoteChanged = meta.lastSync !== row.updated_at;

    if (!remoteChanged) {
      if (!meta.dirty) return stamp("Tudo sincronizado");
      return pushRow(userId, row.updated_at, "Alterações enviadas");
    }

    if (!meta.dirty && meta.hadSync) {
      // só a nuvem mudou: traz os dados novos
      writeMeta({ userId, lastSync: row.updated_at, hadSync: true, dirty: false });
      app.applyData(remote);
      return stamp("Dados atualizados com a nuvem");
    }

    // primeira sincronização ou mudanças nos dois lados: combina sem apagar nada
    const merged = app.merge(app.getData(), remote);
    writeMeta({ userId, lastSync: meta.lastSync, hadSync: meta.hadSync, dirty: true });
    app.applyData(merged);
    return pushRow(userId, row.updated_at, "Dados combinados com a nuvem");
  }

  async function syncNow() {
    if (!client || !currentUser || !window.FocusApp) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    setSync("Sincronizando…", false);
    try {
      let outcome = null;
      for (let attempt = 0; attempt < 3 && !outcome; attempt += 1) outcome = await syncOnce();
      if (!outcome) throw new Error("conflict");
      setSync(outcome, false);
    } catch (error) {
      setSync(syncErrorText(error), true);
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(800); }
    }
  }

  async function deleteCloudAndSignOut() {
    if (busy || !client || !currentUser) return;
    if (!window.confirm("Apagar seus dados da nuvem e sair da conta? Os dados deste aparelho continuam salvos.")) return;
    setBusy(true);
    try {
      const { error } = await client.from("diary_data").delete().eq("user_id", currentUser.id);
      if (error) throw error;
      writeMeta({ userId: currentUser.id, lastSync: null, hadSync: false, dirty: true });
      await client.auth.signOut();
      setStatus("Dados da nuvem apagados. Os do aparelho foram mantidos.", false);
    } catch (error) {
      setSync(syncErrorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Tela de conta ---------- */
  function render(session) {
    const form = byId("auth-form");
    const box = byId("auth-session");
    if (!form || !box) return;
    const user = session && session.user;
    const previousId = currentUser && currentUser.id;
    currentUser = user || null;
    form.hidden = Boolean(user);
    box.hidden = !user;
    byId("sync-box").hidden = !user;
    if (user) {
      byId("auth-user").textContent = user.email || "conta sem e-mail";
      setStatus("Conectado.", false);
      if (user.id !== previousId) scheduleSync(300);
    } else {
      clearTimeout(syncTimer);
      if (client) setStatus("Entre ou crie uma conta para usar a nuvem.", false);
    }
  }

  function readCredentials() {
    return { email: byId("auth-email").value.trim(), password: byId("auth-password").value };
  }

  async function signIn(event) {
    event.preventDefault();
    if (busy) return;
    if (!client) { setStatus("O serviço de login ainda não carregou. Aguarde ou verifique a internet.", true); return; }
    const { email, password } = readCredentials();
    if (!email || !password) { setStatus("Preencha e-mail e senha.", true); return; }
    setBusy(true);
    setStatus("Entrando...", false);
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      byId("auth-password").value = "";
    } catch (error) {
      setStatus(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  function returnUrl() {
    return `${location.origin}${location.pathname.replace(/index\.html$/, "")}`;
  }

  async function signInWithGoogle() {
    if (busy) return;
    if (!client) { setStatus("O serviço de login ainda não carregou. Aguarde ou verifique a internet.", true); return; }
    setBusy(true);
    setStatus("Abrindo o login do Google...", false);
    try {
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnUrl() } });
      if (error) throw error;
      // sem erro: o navegador segue para a página do Google
    } catch (error) {
      setStatus(friendlyError(error), true);
      setBusy(false);
    }
  }

  async function signUp() {
    if (busy) return;
    if (!client) { setStatus("O serviço de login ainda não carregou. Aguarde ou verifique a internet.", true); return; }
    const { email, password } = readCredentials();
    if (!email || !byId("auth-email").checkValidity()) { setStatus("Digite um e-mail válido.", true); return; }
    if (password.length < 8) { setStatus("A senha precisa ter pelo menos 8 caracteres.", true); return; }
    setBusy(true);
    setStatus("Criando conta...", false);
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: returnUrl() }
      });
      if (error) throw error;
      byId("auth-password").value = "";
      setStatus(data && data.session
        ? "Conta criada e conectada."
        : "Enviamos um e-mail de confirmação. Abra o link e depois volte aqui para entrar.", false);
    } catch (error) {
      setStatus(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy || !client) return;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setStatus(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Início ---------- */
  function loadSdk() {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      try {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        client.auth.onAuthStateChange((_event, session) => render(session));
        client.auth.getSession().then(({ data }) => render(data.session)).catch(() => render(null));
        window.FocusCloud = { getClient: () => client, syncNow };
      } catch (error) {
        setStatus("Não foi possível iniciar o serviço de login.", true);
      }
    };
    script.onerror = () => setStatus("Não foi possível carregar o serviço de login. Ele precisa de internet.", true);
    document.head.appendChild(script);
  }

  function start() {
    if (!byId("auth-form")) return;
    byId("auth-form").addEventListener("submit", signIn);
    byId("auth-signup").addEventListener("click", signUp);
    if (byId("auth-google")) byId("auth-google").addEventListener("click", signInWithGoogle);
    window.addEventListener("pageshow", (event) => { if (event.persisted) setBusy(false); });
    byId("auth-signout").addEventListener("click", signOut);
    byId("sync-now").addEventListener("click", syncNow);
    byId("cloud-delete").addEventListener("click", deleteCloudAndSignOut);
    if (window.FocusApp) window.FocusApp.onChange(() => { markDirty(); scheduleSync(3000); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleSync(400); });
    window.addEventListener("online", () => scheduleSync(600));
    setInterval(() => { if (document.visibilityState === "visible") scheduleSync(200); }, 300000);
    render(null);
    setStatus("Carregando o serviço de login...", false);
    loadSdk();
  }

  start();
})();
