/* FOCUS — lógica da aplicação
   Os dados ficam no navegador. Exporte um JSON para criar uma cópia de segurança. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "focus-diario-v1";
  const BACKUP_KEY = "focus-diario-ultimo-backup";
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dateLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  let store = { tasks: [], goals: [], recurring: [], notes: {}, moods: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Array.isArray(parsed.tasks)) store.tasks = parsed.tasks;
    if (Array.isArray(parsed.goals)) store.goals = parsed.goals;
    if (Array.isArray(parsed.recurring)) store.recurring = parsed.recurring;
    if (parsed.notes && typeof parsed.notes === "object" && !Array.isArray(parsed.notes)) store.notes = parsed.notes;
    if (parsed.moods && typeof parsed.moods === "object" && !Array.isArray(parsed.moods)) store.moods = parsed.moods;
  } catch (error) {
    console.warn("Não foi possível ler os dados guardados.", error);
  }
  let selectedPeriod = "day";
  let selectedDate = todayKey();
  let editingId = null;
  let editingGoalId = null;
  let activityChart = null;
  let historyChart = null;
  let toastTimer = null;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      showToast("Não foi possível salvar. Exporte os dados e verifique o espaço do navegador.");
      return false;
    }
  }
  function showToast(message, action) {
    const toast = $("toast");
    toast.replaceChildren();
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(text);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toast-action";
      button.textContent = action.label;
      button.addEventListener("click", () => { clearTimeout(toastTimer); toast.hidden = true; action.onClick(); });
      toast.append(button);
    }
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, action ? 7000 : 2600);
  }
  function getLastBackup() {
    try {
      const value = Number(localStorage.getItem(BACKUP_KEY));
      return value > 0 ? value : null;
    } catch (error) {
      return null;
    }
  }
  function renderBackupNote() {
    const note = $("backup-note");
    if (!note) return;
    const last = getLastBackup();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    const needsBackup = store.tasks.length > 0 && (last === null || days >= 7);
    note.classList.toggle("warn", needsBackup);
    if (last === null) {
      note.textContent = store.tasks.length
        ? "Você ainda não fez backup. Exporte seus dados para não perdê-los."
        : "Nenhum backup feito ainda.";
    } else if (days === 0) {
      note.textContent = "Último backup: hoje.";
    } else {
      note.textContent = `Último backup: há ${days} dia(s).${needsBackup ? " Hora de exportar de novo." : ""}`;
    }
  }
  const VALID_STATUS = ["pending", "success", "failure"];
  const FAILURE_REASONS = ["Falta de tempo", "Cansaço", "Esqueci", "Falta de motivação", "Imprevisto", "Tarefa difícil", "Outro"];
  const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^\d{2}:\d{2}$/;
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  function cleanTask(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";
    if (!name || typeof raw.date !== "string" || !DATE_PATTERN.test(raw.date)) return null;
    const status = VALID_STATUS.includes(raw.status) ? raw.status : "pending";
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      name,
      category: typeof raw.category === "string" && raw.category.trim() ? raw.category.trim().slice(0, 50) : "Outro",
      description: typeof raw.description === "string" ? raw.description.trim().slice(0, 500) : "",
      status,
      failureReason: status === "failure" && typeof raw.failureReason === "string" ? raw.failureReason.trim().slice(0, 40) : "",
      date: raw.date,
      time: typeof raw.time === "string" && TIME_PATTERN.test(raw.time) ? raw.time : ""
    };
  }
  function cleanGoal(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
    if (!name) return null;
    const goal = {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      name,
      done: raw.done === true
    };
    const target = Number(raw.target);
    if (Number.isInteger(target) && target >= 1 && target <= 999) {
      goal.target = target;
      goal.period = raw.period === "month" ? "month" : "week";
      goal.category = typeof raw.category === "string" ? raw.category.slice(0, 50) : "";
    }
    return goal;
  }
  function cleanRecurring(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";
    const days = Array.isArray(raw.days) ? Array.from(new Set(raw.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))) : [];
    if (!name || !days.length) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      name,
      category: typeof raw.category === "string" && raw.category.trim() ? raw.category.trim().slice(0, 50) : "Outro",
      days,
      startDate: typeof raw.startDate === "string" && DATE_PATTERN.test(raw.startDate) ? raw.startDate : todayKey(),
      lastRun: typeof raw.lastRun === "string" && DATE_PATTERN.test(raw.lastRun) ? raw.lastRun : ""
    };
  }
  function cleanMood(raw) {
    if (!raw || typeof raw !== "object") return null;
    const entry = {};
    ["mood", "energy"].forEach((field) => {
      const value = Number(raw[field]);
      if (Number.isInteger(value) && value >= 1 && value <= 5) entry[field] = value;
    });
    return Object.keys(entry).length ? entry : null;
  }
  function importData(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Arquivo grande demais para ser um backup do FOCUS."); return; }
    const reader = new FileReader();
    reader.onerror = () => showToast("Não foi possível ler o arquivo.");
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (error) {
        showToast("Arquivo inválido: não é um JSON.");
        return;
      }
      const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
      if (!isObject(data) || (!Array.isArray(data.tasks) && !Array.isArray(data.goals) && !Array.isArray(data.recurring) && !isObject(data.notes) && !isObject(data.moods))) {
        showToast("Esse arquivo não parece um backup do FOCUS.");
        return;
      }
      const mergeList = (items, clean, current) => {
        const known = new Set(current.map((item) => item.id));
        const added = [];
        (Array.isArray(items) ? items : []).forEach((raw) => {
          const item = clean(raw);
          if (item && !known.has(item.id)) { known.add(item.id); added.push(item); }
        });
        return added;
      };
      const newTasks = mergeList(data.tasks, cleanTask, store.tasks);
      const newGoals = mergeList(data.goals, cleanGoal, store.goals);
      const newRecurring = mergeList(data.recurring, cleanRecurring, store.recurring);
      const newNotes = {};
      if (isObject(data.notes)) {
        Object.entries(data.notes).forEach(([date, text]) => {
          if (DATE_PATTERN.test(date) && typeof text === "string" && text.trim() && !store.notes[date]) newNotes[date] = text.trim().slice(0, 1000);
        });
      }
      const newMoods = {};
      if (isObject(data.moods)) {
        Object.entries(data.moods).forEach(([date, raw]) => {
          const entry = cleanMood(raw);
          if (DATE_PATTERN.test(date) && entry && !store.moods[date]) newMoods[date] = entry;
        });
      }
      const extras = Object.keys(newNotes).length + Object.keys(newMoods).length;
      if (!newTasks.length && !newGoals.length && !newRecurring.length && !extras) {
        showToast("Nada novo para importar: esses dados já estão aqui.");
        return;
      }
      if (!confirm(`Importar ${newTasks.length} tarefa(s), ${newGoals.length} objetivo(s), ${newRecurring.length} recorrência(s) e ${extras} registro(s) de nota/humor? Seus dados atuais serão mantidos.`)) return;
      const previous = { tasks: store.tasks, goals: store.goals, recurring: store.recurring, notes: store.notes, moods: store.moods };
      store.tasks = store.tasks.concat(newTasks).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      store.goals = store.goals.concat(newGoals);
      store.recurring = store.recurring.concat(newRecurring);
      store.notes = { ...store.notes, ...newNotes };
      store.moods = { ...store.moods, ...newMoods };
      if (!save()) {
        Object.assign(store, previous);
        return;
      }
      renderAll();
      showToast(`Importado: ${newTasks.length} tarefa(s), ${newGoals.length} objetivo(s), ${newRecurring.length} recorrência(s).`);
    };
    reader.readAsText(file);
  }
  function toKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function shiftDate(key, days) {
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + days);
    return toKey(date);
  }
  function selectedDayName() {
    const today = todayKey();
    if (selectedDate === today) return "hoje";
    if (selectedDate === shiftDate(today, -1)) return "ontem";
    return new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  }
  function getSelectedDayTasks() {
    return store.tasks.filter((task) => task.date === selectedDate);
  }
  function periodStart() {
    const date = new Date();
    if (selectedPeriod === "week") date.setDate(date.getDate() - 6);
    if (selectedPeriod === "month") date.setDate(1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function getPeriodTasks() {
    const start = periodStart();
    return store.tasks.filter((task) => task.date >= start && task.date <= todayKey());
  }
  function countStatuses(tasks) {
    return {
      success: tasks.filter((task) => task.status === "success").length,
      failure: tasks.filter((task) => task.status === "failure").length,
      pending: tasks.filter((task) => task.status === "pending").length
    };
  }
  function statusLabel(status) {
    return { success: "SUCESSO", failure: "FALHA", pending: "PENDENTE" }[status] || "PENDENTE";
  }
  function taskMarkup(task) {
    const icon = task.status === "success" ? "✓" : task.status === "failure" ? "!" : "◷";
    return `
      <article class="task">
        <div class="task-icon" aria-hidden="true">${icon}</div>
        <div class="task-main">
          <div class="task-meta"><span class="task-title">${escapeHTML(task.name)}</span><span class="tag">${escapeHTML(task.category)}</span></div>
          <p class="task-description">${escapeHTML(task.description || "Sem descrição adicionada.")}</p>
          ${task.status === "failure" && task.failureReason ? `<small class="failure-reason">Motivo: ${escapeHTML(task.failureReason)}</small>` : ""}
          <small class="muted">${dateLabel(task.date)}${task.time ? ` · ${escapeHTML(task.time)}` : ""}</small>
        </div>
        <div class="task-actions">
          <button class="status ${task.status}" data-status="${escapeHTML(task.id)}" type="button" aria-label="Alterar status de ${escapeHTML(task.name)}">${statusLabel(task.status)}</button>
          <button class="mini-button" data-edit="${escapeHTML(task.id)}" type="button">Editar</button>
          <button class="mini-button" data-delete="${escapeHTML(task.id)}" type="button">Excluir</button>
        </div>
      </article>`;
  }
  const normalizeText = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function renderAllTasks() {
    const categorySelect = $("filter-category");
    const chosen = categorySelect.value;
    const categories = Array.from(new Set(
      Array.from($("task-category").options).map((option) => option.value).concat(store.tasks.map((task) => task.category))
    )).sort((a, b) => a.localeCompare(b, "pt-BR"));
    categorySelect.replaceChildren(new Option("Todas as categorias", ""), ...categories.map((name) => new Option(name, name)));
    categorySelect.value = categories.includes(chosen) ? chosen : "";
    const text = normalizeText($("filter-text").value.trim());
    const status = $("filter-status").value;
    const category = categorySelect.value;
    const filtered = store.tasks.filter((task) => {
      if (status && task.status !== status) return false;
      if (category && task.category !== category) return false;
      return !text || normalizeText(`${task.name} ${task.description} ${task.category}`).includes(text);
    });
    $("filter-count").textContent = store.tasks.length ? `Mostrando ${filtered.length} de ${store.tasks.length} tarefa(s).` : "";
    $("all-task-list").innerHTML = filtered.length
      ? filtered.slice().reverse().map(taskMarkup).join("")
      : `<div class="empty">${store.tasks.length ? "Nenhuma tarefa encontrada com esses filtros." : "Ainda não há tarefas registradas."}</div>`;
  }
  function renderTasks() {
    const today = getSelectedDayTasks();
    const isToday = selectedDate === todayKey();
    $("task-heading").textContent = `Minhas tarefas de ${selectedDayName()}`;
    $("day-label").textContent = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "");
    $("day-next").disabled = isToday;
    $("day-today").disabled = isToday;
    $("task-list").innerHTML = today.length
      ? today.slice().reverse().map(taskMarkup).join("")
      : `<div class="empty">${isToday ? "Nenhuma atividade registrada hoje. Adicione sua primeira tarefa acima ✦" : "Nenhuma atividade registrada neste dia. Você pode adicionar tarefas acima ou copiar as do dia anterior."}</div>`;
    $("task-count").textContent = `${today.filter((task) => task.status !== "pending").length} de ${today.length} avaliadas`;
    renderAllTasks();
    renderCheckin();
  }
  function renderSummary() {
    const tasks = getPeriodTasks();
    const counts = countStatuses(tasks);
    const evaluated = counts.success + counts.failure;
    const rate = evaluated ? Math.round((counts.success / evaluated) * 100) : 0;
    $("success-count").textContent = counts.success;
    $("failure-count").textContent = counts.failure;
    $("completed-count").textContent = `${evaluated}/${tasks.length}`;
    $("success-rate").textContent = evaluated ? `${rate}%` : "—";
    $("donut").style.background = evaluated
      ? `conic-gradient(var(--green) 0deg ${rate * 3.6}deg, var(--red) ${rate * 3.6}deg 360deg)`
      : "conic-gradient(#252844 0deg 360deg)";

    let title, message;
    if (!tasks.length) {
      title = "Comece pequeno ✦";
      message = "Adicione uma atividade e registre como foi. O importante é acompanhar sua evolução, não ser perfeito.";
    } else if (!evaluated) {
      title = "Hora de avaliar ✦";
      message = "Você já registrou atividades. Marque sucesso ou falha quando fizer sentido, sem se julgar antes de olhar os fatos.";
    } else if (rate >= 80) {
      title = "Excelente consistência! ✦";
      message = `Você teve ${rate}% de sucesso neste período. Reconheça seu esforço e mantenha um ritmo sustentável.`;
    } else if (rate >= 50) {
      title = "Você está construindo progresso ✦";
      message = `Sua taxa está em ${rate}%. Observe o que funcionou e escolha um pequeno ajuste para a próxima atividade.`;
    } else {
      title = "Uma falha não define você ✦";
      message = `Sua taxa está em ${rate}%. Veja o que dificultou as tarefas, reduza o próximo passo e tente novamente. Registrar também é evoluir.`;
    }
    $("message-title").textContent = title;
    $("message-text").textContent = message;

    const categories = {};
    tasks.forEach((task) => {
      const name = task.category || "Outro";
      if (!categories[name]) categories[name] = { success: 0, failure: 0, total: 0 };
      categories[name].total += 1;
      if (task.status === "success") categories[name].success += 1;
      if (task.status === "failure") categories[name].failure += 1;
    });
    const rows = Object.entries(categories).sort((a, b) => b[1].total - a[1].total).slice(0, 7);
    $("category-bars").innerHTML = rows.length ? rows.map(([name, value]) => {
      const evaluatedCategory = value.success + value.failure;
      const percent = evaluatedCategory ? Math.round(value.success / evaluatedCategory * 100) : 0;
      const fillColor = evaluatedCategory && percent < 50 ? "var(--red)" : "var(--cyan)";
      return `<div class="category-row"><span>${escapeHTML(name)}</span><div class="bar"><div class="bar-fill" style="width:${percent}%;background:${fillColor}"></div></div><strong>${evaluatedCategory ? percent + "%" : "—"}</strong></div>`;
    }).join("") : '<div class="empty">Suas categorias aparecerão aqui.</div>';
  }
  function buildChartData(tasks) {
    const labels = [];
    const successes = [];
    const failures = [];
    if (selectedPeriod === "day") {
      for (let hour = 0; hour < 24; hour += 3) {
        const label = `${String(hour).padStart(2, "0")}h`;
        labels.push(label);
        const group = tasks.filter((task) => {
          const taskHour = Number((task.time || "12:00").split(":")[0]);
          return Math.floor(taskHour / 3) === hour / 3;
        });
        successes.push(group.filter((task) => task.status === "success").length);
        failures.push(group.filter((task) => task.status === "failure").length);
      }
    } else {
      const start = new Date(`${periodStart()}T12:00:00`);
      const end = new Date(`${todayKey()}T12:00:00`);
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        labels.push(selectedPeriod === "week"
          ? cursor.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
          : String(cursor.getDate()));
        const group = tasks.filter((task) => task.date === key);
        successes.push(group.filter((task) => task.status === "success").length);
        failures.push(group.filter((task) => task.status === "failure").length);
      }
    }
    return { labels, successes, failures };
  }
  function renderChart(canvasId, tasks, isHistory = false) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
    const existing = isHistory ? historyChart : activityChart;
    if (existing) existing.destroy();
    const values = buildChartData(tasks);
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: values.labels,
        datasets: [
          { label: "Sucessos", data: values.successes, backgroundColor: "#24e6a0", borderRadius: 4 },
          { label: "Falhas", data: values.failures, backgroundColor: "#ff426d", borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#c8c9e8", usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: "#17182c", titleColor: "#fff", bodyColor: "#ddd" }
        },
        scales: {
          x: { ticks: { color: "#9ba3c9", maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: "#9ba3c9", precision: 0 }, grid: { color: "#242744" } }
        }
      }
    });
    if (isHistory) historyChart = chart; else activityChart = chart;
  }
  function calculateStreaks() {
    const today = todayKey();
    const days = Array.from(new Set(store.tasks.filter((task) => task.status !== "pending" && task.date <= today).map((task) => task.date))).sort();
    const daySet = new Set(days);
    let cursor = daySet.has(today) ? today : shiftDate(today, -1);
    let current = 0;
    while (daySet.has(cursor)) { current += 1; cursor = shiftDate(cursor, -1); }
    let best = 0;
    let run = 0;
    let previous = null;
    days.forEach((day) => {
      run = previous && shiftDate(previous, 1) === day ? run + 1 : 1;
      best = Math.max(best, run);
      previous = day;
    });
    return { current, best, todayDone: daySet.has(today) };
  }
  function weekRate(counts) {
    const evaluated = counts.success + counts.failure;
    return evaluated ? Math.round(counts.success / evaluated * 100) : null;
  }
  function renderConsistency() {
    const streak = calculateStreaks();
    $("streak-current").textContent = streak.current;
    $("streak-best").textContent = streak.best;
    $("streak-note").textContent = streak.current === 0
      ? "Sem sequência ativa. Avalie ao menos uma tarefa hoje para começar uma."
      : streak.todayDone ? "Hoje já conta! Volte amanhã para continuar a sequência." : "Avalie uma tarefa hoje para manter sua sequência.";
    const today = todayKey();
    const inRange = (from, to) => store.tasks.filter((task) => task.date >= from && task.date <= to);
    const now = countStatuses(inRange(shiftDate(today, -6), today));
    const before = countStatuses(inRange(shiftDate(today, -13), shiftDate(today, -7)));
    const nowRate = weekRate(now);
    const beforeRate = weekRate(before);
    $("week-now-rate").textContent = nowRate === null ? "—" : `${nowRate}%`;
    $("week-prev-rate").textContent = beforeRate === null ? "—" : `${beforeRate}%`;
    $("week-now-detail").textContent = `${now.success} sucesso(s) · ${now.failure} falha(s)`;
    $("week-prev-detail").textContent = `${before.success} sucesso(s) · ${before.failure} falha(s)`;
    let note;
    if (nowRate === null || beforeRate === null) {
      note = "Faltam tarefas avaliadas em uma das semanas para comparar.";
    } else if (nowRate > beforeRate) {
      note = `Você subiu ${nowRate - beforeRate} pontos percentuais em relação aos 7 dias anteriores. Bom ritmo!`;
    } else if (nowRate < beforeRate) {
      note = `A taxa caiu ${beforeRate - nowRate} pontos percentuais. Oscilar é normal: veja o que mudou e ajuste um detalhe.`;
    } else {
      note = "Sua taxa ficou igual à dos 7 dias anteriores. Consistência também é resultado.";
    }
    $("week-compare-note").textContent = note;
  }
  function renderInsights() {
    const today = todayKey();
    const since = shiftDate(today, -29);
    const recent = store.tasks.filter((task) => task.date >= since && task.date <= today);
    const byCategory = {};
    recent.forEach((task) => {
      if (task.status === "pending") return;
      const item = byCategory[task.category] || (byCategory[task.category] = { success: 0, failure: 0 });
      item[task.status] += 1;
    });
    const ranked = Object.entries(byCategory)
      .map(([name, item]) => ({ name, success: item.success, total: item.success + item.failure }))
      .filter((item) => item.total >= 3)
      .map((item) => ({ ...item, rate: Math.round(item.success / item.total * 100) }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total);
    $("insight-category").textContent = !ranked.length
      ? "Poucos dados: avalie ao menos 3 tarefas em uma categoria para ver este insight."
      : ranked[0].rate >= 80
        ? `Tudo indo bem: até a categoria mais baixa, ${ranked[0].name}, está com ${ranked[0].rate}% de sucesso.`
        : `${ranked[0].name} está com ${ranked[0].rate}% de sucesso (${ranked[0].success} de ${ranked[0].total}). Vale observar o que dificulta e ajustar um detalhe.`;

    const byWeekday = Array.from({ length: 7 }, () => ({ success: 0, failure: 0 }));
    store.tasks.forEach((task) => {
      if (task.status === "pending" || task.date > today) return;
      byWeekday[new Date(`${task.date}T12:00:00`).getDay()][task.status] += 1;
    });
    const days = byWeekday
      .map((item, index) => ({ index, total: item.success + item.failure, rate: Math.round(item.success / ((item.success + item.failure) || 1) * 100) }))
      .filter((item) => item.total >= 3)
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
    if (!days.length) {
      $("insight-weekday").textContent = "Poucos dados: avalie ao menos 3 tarefas no mesmo dia da semana.";
    } else if (days.length === 1 || days[0].rate === days[days.length - 1].rate) {
      $("insight-weekday").textContent = days.length === 1
        ? `Melhor dia até agora: ${WEEKDAY_NAMES[days[0].index]} (${days[0].rate}%).`
        : "Seu desempenho está parecido em todos os dias da semana.";
    } else {
      const best = days[0];
      const worst = days[days.length - 1];
      $("insight-weekday").textContent = `Melhor dia: ${WEEKDAY_NAMES[best.index]} (${best.rate}%) · Mais difícil: ${WEEKDAY_NAMES[worst.index]} (${worst.rate}%).`;
    }

    const failures = recent.filter((task) => task.status === "failure");
    const reasonCount = {};
    failures.forEach((task) => { if (task.failureReason) reasonCount[task.failureReason] = (reasonCount[task.failureReason] || 0) + 1; });
    const withReason = Object.values(reasonCount).reduce((sum, value) => sum + value, 0);
    const rows = Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
      const percent = Math.round(count / withReason * 100);
      return `<div class="category-row"><span>${escapeHTML(name)}</span><div class="bar"><div class="bar-fill" style="width:${percent}%;background:var(--red)"></div></div><strong>${count}</strong></div>`;
    });
    const without = failures.length - withReason;
    $("failure-reasons").innerHTML = failures.length
      ? rows.join("") + (without ? `<p class="muted small">Sem motivo anotado: ${without}.</p>` : "")
      : '<p class="muted">Nenhuma falha nos últimos 30 dias.</p>';

    const byDate = {};
    store.tasks.forEach((task) => {
      if (task.status === "pending") return;
      const item = byDate[task.date] || (byDate[task.date] = { success: 0, failure: 0 });
      item[task.status] += 1;
    });
    const first = shiftDate(today, -83);
    const cells = Array.from({ length: new Date(`${first}T12:00:00`).getDay() }, () => '<span class="heat-cell heat-empty"></span>');
    for (let i = 0; i < 84; i += 1) {
      const day = shiftDate(first, i);
      const item = byDate[day];
      const total = item ? item.success + item.failure : 0;
      const rate = total ? item.success / total * 100 : null;
      const level = rate === null ? "none" : rate >= 80 ? "high" : rate >= 50 ? "mid" : "low";
      const label = `${dateLabel(day)}: ${total ? `${item.success} sucesso(s), ${item.failure} falha(s)` : "sem avaliação"}`;
      cells.push(`<span class="heat-cell heat-${level}" title="${label}"></span>`);
    }
    $("heatmap").innerHTML = cells.join("");
  }
  function renderStatistics() {
    const counts = countStatuses(store.tasks);
    const evaluated = counts.success + counts.failure;
    $("total-success").textContent = counts.success;
    $("total-failure").textContent = counts.failure;
    $("total-rate").textContent = evaluated ? `${Math.round(counts.success / evaluated * 100)}%` : "—";
    renderConsistency();
    renderInsights();
    renderLevelInsights();
    $("statistics-period").textContent = { day: "Hoje", week: "Últimos 7 dias", month: "Este mês" }[selectedPeriod];
    const tasks = getPeriodTasks();
    $("history-list").innerHTML = tasks.length ? tasks.slice().reverse().slice(0, 30).map((task) => `
      <div class="history-row">
        <div><strong>${escapeHTML(task.name)}</strong><br><small>${dateLabel(task.date)} · ${escapeHTML(task.category)} · ${escapeHTML(task.description || "Sem descrição")}</small></div>
        <span class="status ${task.status}">${statusLabel(task.status)}</span>
      </div>`).join("") : '<div class="empty">Sem registros neste período.</div>';
    requestAnimationFrame(() => renderChart("history-chart", tasks, true));
  }
  function goalProgress(goal) {
    const today = todayKey();
    const start = goal.period === "month" ? `${today.slice(0, 8)}01` : shiftDate(today, -6);
    const done = store.tasks.filter((task) => task.status === "success" && task.date >= start && task.date <= today && (!goal.category || task.category === goal.category)).length;
    return { done, percent: Math.min(100, Math.round(done / goal.target * 100)) };
  }
  function goalMarkup(goal) {
    const id = escapeHTML(goal.id);
    if (!goal.target) {
      return `
      <div class="history-row">
        <label class="goal-label"><input type="checkbox" data-goal="${id}" ${goal.done ? "checked" : ""}><span>${escapeHTML(goal.name)}</span></label>
        <div class="goal-actions"><button class="mini-button" type="button" data-goal-edit="${id}">Editar</button><button class="mini-button" type="button" data-goal-delete="${id}">Excluir</button></div>
      </div>`;
    }
    const progress = goalProgress(goal);
    const reached = progress.percent >= 100;
    const scope = `${goal.category ? escapeHTML(goal.category) : "Qualquer categoria"} · ${goal.period === "month" ? "este mês" : "últimos 7 dias"}`;
    return `
      <div class="history-row goal-row">
        <div class="goal-info">
          <strong>${escapeHTML(goal.name)}</strong>
          <small class="muted">${scope}</small>
          <div class="goal-progress">
            <div class="bar"><div class="bar-fill" style="width:${progress.percent}%;background:${reached ? "var(--green)" : "var(--cyan)"}"></div></div>
            <span>${progress.done} de ${goal.target} · ${progress.percent}%${reached ? " ✓ meta batida" : ""}</span>
          </div>
        </div>
        <div class="goal-actions"><button class="mini-button" type="button" data-goal-edit="${id}">Editar</button><button class="mini-button" type="button" data-goal-delete="${id}">Excluir</button></div>
      </div>`;
  }
  function renderGoals() {
    const categorySelect = $("goal-category");
    if (!categorySelect.options.length) {
      categorySelect.replaceChildren(new Option("Qualquer categoria", ""), ...Array.from($("task-category").options).map((option) => new Option(option.value, option.value)));
    }
    $("goal-list").innerHTML = store.goals.length
      ? store.goals.map(goalMarkup).join("")
      : '<div class="empty">Nenhum objetivo ainda. Escolha uma pequena meta para começar.</div>';
  }
  const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function applyRecurring() {
    const today = todayKey();
    const earliest = shiftDate(today, -60);
    let changed = false;
    let added = false;
    store.recurring.forEach((rule) => {
      if (!rule || rule.lastRun === today || !Array.isArray(rule.days)) return;
      let day = rule.lastRun ? shiftDate(rule.lastRun, 1) : (rule.startDate || today);
      if (day < earliest) day = earliest;
      while (day <= today) {
        const weekday = new Date(`${day}T12:00:00`).getDay();
        const exists = store.tasks.some((task) => task.date === day && task.name === rule.name && task.category === rule.category);
        if (rule.days.includes(weekday) && !exists) {
          store.tasks.push({ id: newId(), name: rule.name, category: rule.category, description: "", status: "pending", failureReason: "", date: day, time: "" });
          added = true;
        }
        day = shiftDate(day, 1);
      }
      rule.lastRun = today;
      changed = true;
    });
    if (added) store.tasks.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (changed) save();
  }
  function renderRecurring() {
    const select = $("recurring-category");
    if (!select.options.length) {
      select.replaceChildren(...Array.from($("task-category").options).map((option) => new Option(option.value, option.value)));
    }
    $("recurring-list").innerHTML = store.recurring.length ? store.recurring.map((rule) => {
      const label = rule.days.length === 7 ? "Todos os dias" : rule.days.slice().sort((a, b) => a - b).map((day) => WEEKDAY_SHORT[day]).join(", ");
      return `
      <div class="history-row">
        <div><strong>${escapeHTML(rule.name)}</strong><br><small class="muted">${escapeHTML(rule.category)} · ${label}</small></div>
        <button class="mini-button" type="button" data-recurring-delete="${escapeHTML(rule.id)}">Excluir</button>
      </div>`;
    }).join("") : '<div class="empty">Nenhuma tarefa recorrente ainda. Crie uma para não precisar repetir o que você faz sempre.</div>';
  }
  function renderCheckin() {
    const label = selectedDayName();
    $("checkin-label").textContent = label;
    $("note-label").textContent = label;
    const entry = store.moods[selectedDate] || {};
    document.querySelectorAll("#mood-scale button").forEach((button) => button.setAttribute("aria-pressed", String(entry.mood === Number(button.dataset.mood))));
    document.querySelectorAll("#energy-scale button").forEach((button) => button.setAttribute("aria-pressed", String(entry.energy === Number(button.dataset.energy))));
    $("day-note").value = store.notes[selectedDate] || "";
  }
  function levelInsight(field, noun, high, low) {
    const byDate = {};
    store.tasks.forEach((task) => {
      if (task.status === "pending") return;
      const item = byDate[task.date] || (byDate[task.date] = { success: 0, failure: 0 });
      item[task.status] += 1;
    });
    const groups = { high: { success: 0, total: 0, days: 0 }, low: { success: 0, total: 0, days: 0 } };
    Object.entries(store.moods).forEach(([date, entry]) => {
      const value = entry && entry[field];
      const item = byDate[date];
      if (!value || !item) return;
      const group = value >= 4 ? groups.high : value <= 2 ? groups.low : null;
      if (!group) return;
      group.success += item.success;
      group.total += item.success + item.failure;
      group.days += 1;
    });
    if (groups.high.days < 3 || groups.low.days < 3) {
      return `Registre ${noun} em pelo menos 3 dias ${high.plural} (4–5) e 3 dias ${low.plural} (1–2), com tarefas avaliadas, para ver a relação com seu desempenho.`;
    }
    const rate = (group) => Math.round(group.success / group.total * 100);
    return `Com ${noun} ${high.single} (4–5): ${rate(groups.high)}% de sucesso em ${groups.high.days} dias · com ${noun} ${low.single} (1–2): ${rate(groups.low)}% em ${groups.low.days} dias.`;
  }
  function renderLevelInsights() {
    $("insight-mood").textContent = levelInsight("mood", "humor", { single: "alto", plural: "altos" }, { single: "baixo", plural: "baixos" });
    $("insight-energy").textContent = levelInsight("energy", "energia", { single: "alta", plural: "altas" }, { single: "baixa", plural: "baixas" });
  }
  function renderAll() {
    applyRecurring();
    renderTasks();
    renderSummary();
    renderStatistics();
    renderGoals();
    renderRecurring();
    renderBackupNote();
    requestAnimationFrame(() => renderChart("activity-chart", getPeriodTasks()));
  }
  function updateTaskStatus(id) {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) return;
    task.status = { pending: "success", success: "failure", failure: "pending" }[task.status] || "pending";
    if (task.status !== "failure") task.failureReason = "";
    save(); renderAll();
    if (task.status === "failure") {
      showToast("Status: falha. Quer anotar o motivo?", { label: "Anotar", onClick: () => editTask(id) });
    } else {
      showToast(`Status atualizado: ${statusLabel(task.status).toLowerCase()}.`);
    }
  }
  function editTask(id) {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) return;
    editingId = id;
    const select = $("edit-category");
    select.innerHTML = $("task-category").innerHTML;
    if (!Array.from(select.options).some((option) => option.value === task.category)) {
      const extra = document.createElement("option");
      extra.textContent = task.category;
      select.appendChild(extra);
    }
    select.value = task.category;
    $("edit-name").value = task.name;
    $("edit-description").value = task.description || "";
    $("edit-reason-group").hidden = task.status !== "failure";
    const reasonSelect = $("edit-reason");
    reasonSelect.replaceChildren(new Option("Sem motivo anotado", ""), ...FAILURE_REASONS.map((reason) => new Option(reason, reason)));
    if (task.failureReason && !FAILURE_REASONS.includes(task.failureReason)) reasonSelect.append(new Option(task.failureReason, task.failureReason));
    reasonSelect.value = task.failureReason || "";
    const dialog = $("edit-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    $("edit-name").focus();
  }
  function closeEditDialog() {
    const dialog = $("edit-dialog");
    if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
    editingId = null;
  }
  function deleteTask(id) {
    const index = store.tasks.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = store.tasks.splice(index, 1);
    save(); renderAll();
    showToast("Atividade excluída.", { label: "Desfazer", onClick: () => {
      if (store.tasks.some((task) => task.id === removed.id)) return;
      store.tasks.splice(Math.min(index, store.tasks.length), 0, removed);
      save(); renderAll(); showToast("Atividade restaurada.");
    } });
  }

  function changeDay(days) {
    const next = shiftDate(selectedDate, days);
    if (next > todayKey()) return;
    selectedDate = next;
    renderTasks();
  }
  function copyPreviousDay() {
    const source = store.tasks.filter((task) => task.date === shiftDate(selectedDate, -1));
    if (!source.length) { showToast("Não há tarefas no dia anterior para copiar."); return; }
    const normalize = (task) => `${task.name.trim().toLowerCase()}|${task.category}`;
    const existing = new Set(getSelectedDayTasks().map(normalize));
    const copies = [];
    source.forEach((task) => {
      const key = normalize(task);
      if (existing.has(key)) return;
      existing.add(key);
      copies.push({
        id: newId(),
        name: task.name,
        category: task.category,
        description: "",
        status: "pending",
        date: selectedDate,
        time: selectedDate === todayKey() ? new Date().toTimeString().slice(0, 5) : ""
      });
    });
    if (!copies.length) { showToast("Essas tarefas já estão neste dia."); return; }
    store.tasks.push(...copies);
    if (!save()) { store.tasks = store.tasks.slice(0, store.tasks.length - copies.length); return; }
    renderAll();
    showToast(`${copies.length} tarefa(s) copiada(s) como pendentes.`);
  }
  $("edit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const task = store.tasks.find((item) => item.id === editingId);
    if (!task) { closeEditDialog(); return; }
    const name = $("edit-name").value.trim();
    if (!name) return;
    task.name = name.slice(0, 100);
    task.category = $("edit-category").value;
    task.description = $("edit-description").value.trim().slice(0, 500);
    task.failureReason = task.status === "failure" ? $("edit-reason").value : "";
    save();
    closeEditDialog();
    renderAll();
    showToast("Atividade atualizada.");
  });
  $("edit-cancel").addEventListener("click", closeEditDialog);
  $("edit-dialog").addEventListener("close", () => { editingId = null; });
  $("edit-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeEditDialog();
  });
  $("filter-text").addEventListener("input", renderAllTasks);
  $("filter-status").addEventListener("change", renderAllTasks);
  $("filter-category").addEventListener("change", renderAllTasks);
  $("filter-clear").addEventListener("click", () => {
    $("filter-text").value = "";
    $("filter-status").value = "";
    $("filter-category").value = "";
    renderAllTasks();
  });
  $("day-prev").addEventListener("click", () => changeDay(-1));
  $("day-next").addEventListener("click", () => changeDay(1));
  $("day-today").addEventListener("click", () => { selectedDate = todayKey(); renderTasks(); });
  $("day-repeat").addEventListener("click", copyPreviousDay);

  $("task-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("task-name").value.trim();
    if (!name) return;
    const now = new Date();
    store.tasks.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      name: name.slice(0, 100),
      category: $("task-category").value,
      description: $("task-description").value.trim().slice(0, 500),
      status: "pending",
      date: selectedDate,
      time: selectedDate === todayKey() ? now.toTimeString().slice(0, 5) : ""
    });
    save(); $("task-form").reset(); renderAll(); showToast("Atividade adicionada!");
  });

  document.addEventListener("click", (event) => {
    const status = event.target.closest("[data-status]");
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (status) updateTaskStatus(status.dataset.status);
    if (edit) editTask(edit.dataset.edit);
    if (remove) deleteTask(remove.dataset.delete);
  });

  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPeriod = button.dataset.period;
      document.querySelectorAll("[data-period]").forEach((item) => item.classList.toggle("active", item === button));
      renderAll();
    });
  });
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.page;
      document.querySelectorAll("[data-page]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${target}`));
      if (target === "estatisticas") renderStatistics();
    });
  });
  function resetGoalForm() {
    editingGoalId = null;
    $("goal-name").value = "";
    $("goal-target").value = "";
    $("goal-period").value = "week";
    $("goal-category").value = "";
    $("goal-submit").textContent = "Adicionar";
    $("goal-cancel").hidden = true;
  }
  function startGoalEdit(id) {
    const goal = store.goals.find((item) => item.id === id);
    if (!goal) return;
    editingGoalId = id;
    $("goal-name").value = goal.name;
    $("goal-target").value = goal.target || "";
    $("goal-period").value = goal.period === "month" ? "month" : "week";
    $("goal-category").value = goal.category || "";
    $("goal-submit").textContent = "Salvar alterações";
    $("goal-cancel").hidden = false;
    $("goal-name").focus();
    $("goal-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("goal-cancel").addEventListener("click", resetGoalForm);
  $("recurring-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("recurring-name").value.trim();
    if (!name) return;
    const days = Array.from(document.querySelectorAll("#recurring-form .day-picker input:checked")).map((input) => Number(input.value));
    if (!days.length) { showToast("Escolha pelo menos um dia da semana."); return; }
    store.recurring.push({ id: newId(), name: name.slice(0, 100), category: $("recurring-category").value, days, startDate: todayKey(), lastRun: "" });
    $("recurring-name").value = "";
    document.querySelectorAll("#recurring-form .day-picker input").forEach((input) => { input.checked = false; });
    save(); renderAll();
    showToast("Recorrência criada. As tarefas aparecem sozinhas nos dias escolhidos.");
  });
  $("recurring-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-recurring-delete]");
    if (!button) return;
    const index = store.recurring.findIndex((rule) => rule.id === button.dataset.recurringDelete);
    if (index === -1) return;
    const [removed] = store.recurring.splice(index, 1);
    save(); renderRecurring();
    showToast("Recorrência removida. As tarefas já criadas continuam.", { label: "Desfazer", onClick: () => {
      if (store.recurring.some((rule) => rule.id === removed.id)) return;
      store.recurring.splice(Math.min(index, store.recurring.length), 0, removed);
      save(); renderRecurring(); showToast("Recorrência restaurada.");
    } });
  });
  function setScale(field, value) {
    const entry = store.moods[selectedDate] || (store.moods[selectedDate] = {});
    if (entry[field] === value) delete entry[field]; else entry[field] = value;
    if (!Object.keys(entry).length) delete store.moods[selectedDate];
    save(); renderCheckin(); renderStatistics();
  }
  $("mood-scale").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mood]");
    if (button) setScale("mood", Number(button.dataset.mood));
  });
  $("energy-scale").addEventListener("click", (event) => {
    const button = event.target.closest("[data-energy]");
    if (button) setScale("energy", Number(button.dataset.energy));
  });
  function saveNote(silent) {
    const text = $("day-note").value.trim().slice(0, 1000);
    if (text) store.notes[selectedDate] = text; else delete store.notes[selectedDate];
    save();
    if (!silent) showToast("Nota salva.");
  }
  $("day-note").addEventListener("change", () => saveNote(true));
  $("day-note-save").addEventListener("click", () => saveNote(false));
  $("goal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("goal-name").value.trim();
    if (!name) return;
    const targetText = $("goal-target").value.trim();
    let target = null;
    if (targetText) {
      target = Number(targetText);
      if (!Number.isInteger(target) || target < 1 || target > 999) { showToast("A meta precisa ser um número inteiro entre 1 e 999."); return; }
    }
    const editing = editingGoalId ? store.goals.find((item) => item.id === editingGoalId) : null;
    const goal = editing || { id: newId(), name: "", done: false };
    goal.name = name.slice(0, 120);
    if (target) {
      goal.target = target;
      goal.period = $("goal-period").value === "month" ? "month" : "week";
      goal.category = $("goal-category").value;
    } else {
      delete goal.target;
      delete goal.period;
      delete goal.category;
    }
    if (!editing) store.goals.push(goal);
    save(); resetGoalForm(); renderGoals();
    showToast(editing ? "Objetivo atualizado." : "Objetivo criado!");
  });
  $("goal-list").addEventListener("change", (event) => {
    const id = event.target.dataset.goal;
    if (!id) return;
    const goal = store.goals.find((item) => item.id === id);
    if (goal) { goal.done = event.target.checked; save(); renderGoals(); }
  });
  $("goal-list").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-goal-edit]");
    if (editButton) { startGoalEdit(editButton.dataset.goalEdit); return; }
    const button = event.target.closest("[data-goal-delete]");
    if (!button) return;
    const index = store.goals.findIndex((goal) => goal.id === button.dataset.goalDelete);
    if (index === -1) return;
    const [removed] = store.goals.splice(index, 1);
    if (editingGoalId === removed.id) resetGoalForm();
    save(); renderGoals();
    showToast("Objetivo removido.", { label: "Desfazer", onClick: () => {
      if (store.goals.some((goal) => goal.id === removed.id)) return;
      store.goals.splice(Math.min(index, store.goals.length), 0, removed);
      save(); renderGoals(); showToast("Objetivo restaurado.");
    } });
  });
  $("export-button").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...store }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "focus-backup.json"; link.click();
    URL.revokeObjectURL(url);
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch (error) { /* sem espaço: ignora */ }
    renderBackupNote();
    showToast("Exportação iniciada.");
  });
  $("import-button").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (event) => {
    importData(event.target.files[0]);
    event.target.value = "";
  });

  const now = new Date();
  $("current-date").textContent = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("greeting").textContent = `${now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite"}! Vamos evoluir hoje.`;
  window.addEventListener("resize", () => {
    if (activityChart) activityChart.resize();
    if (historyChart) historyChart.resize();
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  renderAll();
})();
