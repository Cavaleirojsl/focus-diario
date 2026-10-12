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

  let store = { tasks: [], goals: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Array.isArray(parsed.tasks)) store.tasks = parsed.tasks;
    if (Array.isArray(parsed.goals)) store.goals = parsed.goals;
  } catch (error) {
    console.warn("Não foi possível ler os dados guardados.", error);
  }
  let selectedPeriod = "day";
  let selectedDate = todayKey();
  let editingId = null;
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
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
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
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^\d{2}:\d{2}$/;
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  function cleanTask(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";
    if (!name || typeof raw.date !== "string" || !DATE_PATTERN.test(raw.date)) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      name,
      category: typeof raw.category === "string" && raw.category.trim() ? raw.category.trim().slice(0, 50) : "Outro",
      description: typeof raw.description === "string" ? raw.description.trim().slice(0, 500) : "",
      status: VALID_STATUS.includes(raw.status) ? raw.status : "pending",
      date: raw.date,
      time: typeof raw.time === "string" && TIME_PATTERN.test(raw.time) ? raw.time : ""
    };
  }
  function cleanGoal(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
    if (!name) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      name,
      done: raw.done === true
    };
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
      if (!data || (!Array.isArray(data.tasks) && !Array.isArray(data.goals))) {
        showToast("Esse arquivo não parece um backup do FOCUS.");
        return;
      }
      const knownTasks = new Set(store.tasks.map((task) => task.id));
      const knownGoals = new Set(store.goals.map((goal) => goal.id));
      const newTasks = [];
      (Array.isArray(data.tasks) ? data.tasks : []).forEach((raw) => {
        const task = cleanTask(raw);
        if (task && !knownTasks.has(task.id)) { knownTasks.add(task.id); newTasks.push(task); }
      });
      const newGoals = [];
      (Array.isArray(data.goals) ? data.goals : []).forEach((raw) => {
        const goal = cleanGoal(raw);
        if (goal && !knownGoals.has(goal.id)) { knownGoals.add(goal.id); newGoals.push(goal); }
      });
      if (!newTasks.length && !newGoals.length) {
        showToast("Nada novo para importar: esses dados já estão aqui.");
        return;
      }
      if (!confirm(`Importar ${newTasks.length} tarefa(s) e ${newGoals.length} objetivo(s) novos? Seus dados atuais serão mantidos.`)) return;
      const previous = { tasks: store.tasks, goals: store.goals };
      store.tasks = store.tasks.concat(newTasks).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      store.goals = store.goals.concat(newGoals);
      if (!save()) {
        store.tasks = previous.tasks;
        store.goals = previous.goals;
        return;
      }
      renderAll();
      showToast(`Importado: ${newTasks.length} tarefa(s) e ${newGoals.length} objetivo(s).`);
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
          <small class="muted">${dateLabel(task.date)}${task.time ? ` · ${escapeHTML(task.time)}` : ""}</small>
        </div>
        <div class="task-actions">
          <button class="status ${task.status}" data-status="${escapeHTML(task.id)}" type="button" aria-label="Alterar status de ${escapeHTML(task.name)}">${statusLabel(task.status)}</button>
          <button class="mini-button" data-edit="${escapeHTML(task.id)}" type="button">Editar</button>
          <button class="mini-button" data-delete="${escapeHTML(task.id)}" type="button">Excluir</button>
        </div>
      </article>`;
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
    $("all-task-list").innerHTML = store.tasks.length
      ? store.tasks.slice().reverse().map(taskMarkup).join("")
      : '<div class="empty">Ainda não há tarefas registradas.</div>';
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
  function renderStatistics() {
    const counts = countStatuses(store.tasks);
    const evaluated = counts.success + counts.failure;
    $("total-success").textContent = counts.success;
    $("total-failure").textContent = counts.failure;
    $("total-rate").textContent = evaluated ? `${Math.round(counts.success / evaluated * 100)}%` : "—";
    renderConsistency();
    $("statistics-period").textContent = { day: "Hoje", week: "Últimos 7 dias", month: "Este mês" }[selectedPeriod];
    const tasks = getPeriodTasks();
    $("history-list").innerHTML = tasks.length ? tasks.slice().reverse().slice(0, 30).map((task) => `
      <div class="history-row">
        <div><strong>${escapeHTML(task.name)}</strong><br><small>${dateLabel(task.date)} · ${escapeHTML(task.category)} · ${escapeHTML(task.description || "Sem descrição")}</small></div>
        <span class="status ${task.status}">${statusLabel(task.status)}</span>
      </div>`).join("") : '<div class="empty">Sem registros neste período.</div>';
    requestAnimationFrame(() => renderChart("history-chart", tasks, true));
  }
  function renderGoals() {
    $("goal-list").innerHTML = store.goals.length ? store.goals.map((goal) => `
      <div class="history-row">
        <label class="goal-label"><input type="checkbox" data-goal="${escapeHTML(goal.id)}" ${goal.done ? "checked" : ""}><span>${escapeHTML(goal.name)}</span></label>
        <button class="mini-button" type="button" data-goal-delete="${escapeHTML(goal.id)}">Excluir</button>
      </div>`).join("") : '<div class="empty">Nenhum objetivo ainda. Escolha uma pequena meta para começar.</div>';
  }
  function renderAll() {
    renderTasks();
    renderSummary();
    renderStatistics();
    renderGoals();
    renderBackupNote();
    requestAnimationFrame(() => renderChart("activity-chart", getPeriodTasks()));
  }
  function updateTaskStatus(id) {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) return;
    task.status = { pending: "success", success: "failure", failure: "pending" }[task.status] || "pending";
    save(); renderAll();
    showToast(`Status atualizado: ${statusLabel(task.status).toLowerCase()}.`);
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
    const task = store.tasks.find((item) => item.id === id);
    if (!task || !confirm(`Excluir a atividade "${task.name}"?`)) return;
    store.tasks = store.tasks.filter((item) => item.id !== id);
    save(); renderAll(); showToast("Atividade excluída.");
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
  $("goal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("goal-name").value.trim();
    if (!name) return;
    store.goals.push({ id: `${Date.now()}-${Math.random()}`, name: name.slice(0, 120), done: false });
    save(); $("goal-name").value = ""; renderGoals(); showToast("Objetivo criado!");
  });
  $("goal-list").addEventListener("change", (event) => {
    const id = event.target.dataset.goal;
    if (!id) return;
    const goal = store.goals.find((item) => item.id === id);
    if (goal) { goal.done = event.target.checked; save(); renderGoals(); }
  });
  $("goal-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-goal-delete]");
    if (!button) return;
    store.goals = store.goals.filter((goal) => goal.id !== button.dataset.goalDelete);
    save(); renderGoals(); showToast("Objetivo removido.");
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
  renderAll();
})();
