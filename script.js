"use strict";

const STORAGE_KEY = "daily-todo-list:v1";
const MAX_TODO_LENGTH = 200;
const PRIORITIES = Object.freeze({ high: "높음", medium: "중간", low: "낮음" });
const isPriority = (value) => typeof value === "string" && Object.hasOwn(PRIORITIES, value);

// Array order is the manual order within each priority. Reading never rewrites old data.
function createTodoStore(storage) {
  let todos = [];
  let storageError = !storage;
  try {
    const saved = storage && storage.getItem(STORAGE_KEY);
    if (saved !== null && saved !== undefined) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Invalid saved list");
      const ids = new Set();
      todos = parsed.filter((todo) => {
        if (!todo || typeof todo.id !== "string" || !todo.id ||
          typeof todo.text !== "string" || !todo.text.trim() ||
          todo.text.length > MAX_TODO_LENGTH || typeof todo.completed !== "boolean" ||
          ids.has(todo.id)) return false;
        ids.add(todo.id);
        return true;
      }).map(({ id, text, completed, priority }) => ({
        id, text, completed, priority: isPriority(priority) ? priority : "medium",
      }));
    }
  } catch { storageError = true; }

  function save() {
    try {
      if (!storage) throw new Error("Storage unavailable");
      storage.setItem(STORAGE_KEY, JSON.stringify(todos));
      storageError = false;
    } catch { storageError = true; }
  }

  function moveTodo(id, targetPriority, beforeId = null) {
    const todo = todos.find((item) => item.id === id);
    if (!todo || !isPriority(targetPriority) || beforeId === id) return false;
    const before = beforeId === null ? null : todos.find((item) => item.id === beforeId);
    if (beforeId !== null && (!before || before.priority !== targetPriority)) return false;
    const remaining = todos.filter((item) => item.id !== id);
    let index;
    if (before) index = remaining.findIndex((item) => item.id === beforeId);
    else {
      const last = remaining.findLastIndex((item) => item.priority === targetPriority);
      index = last === -1 ? remaining.length : last + 1;
    }
    const moved = { ...todo, priority: targetPriority };
    remaining.splice(index, 0, moved);
    if (todo.priority === targetPriority &&
      remaining.every((item, i) => item.id === todos[i].id)) return false;
    todos = remaining;
    save();
    return true;
  }

  return {
    getTodos() { return todos.map((todo) => ({ ...todo })); },
    get storageError() { return storageError; },
    add(text, priority = "medium") {
      if (typeof text !== "string" || !isPriority(priority)) return false;
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > MAX_TODO_LENGTH) return false;
      let id;
      do {
        id = typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      } while (todos.some((todo) => todo.id === id));
      todos.push({ id, text: trimmed, completed: false, priority });
      save();
      return true;
    },
    toggle(id) {
      const todo = todos.find((item) => item.id === id);
      if (!todo) return false;
      todo.completed = !todo.completed;
      save();
      return true;
    },
    remove(id) {
      const index = todos.findIndex((todo) => todo.id === id);
      if (index === -1) return false;
      todos.splice(index, 1);
      save();
      return true;
    },
    setPriority(id, priority) {
      const todo = todos.find((item) => item.id === id);
      if (!todo || !isPriority(priority)) return false;
      if (todo.priority === priority) return true;
      return moveTodo(id, priority);
    },
    moveTodo,
  };
}

// Geometry is separate from pointer handling so the insertion rules can be tested.
function getDropTarget(zones, x, y, draggedId) {
  const zone = zones.find(({ rect }) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  if (!zone) return null;
  const before = zone.items.find(({ id, rect }) =>
    id !== draggedId && y < (rect.top + rect.bottom) / 2);
  return { priority: zone.priority, beforeId: before ? before.id : null };
}

function createDragController(root, onDrop, announce) {
  let gesture = null;
  let timer = null;
  let frame = null;
  let preview = null;
  let marker = null;

  function targetAt(x, y) {
    return getDropTarget([...root.querySelectorAll(".priority-column")].map((column) => ({
      priority: column.dataset.priority,
      rect: column.getBoundingClientRect(),
      items: [...column.querySelectorAll(".todo-item")].map((item) => ({
        id: item.dataset.id, rect: item.getBoundingClientRect(),
      })),
    })), x, y, gesture.id);
  }

  function cleanup() {
    const previous = gesture;
    gesture = null;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    preview?.remove();
    marker?.remove();
    preview = marker = null;
    root.querySelectorAll(".is-dragging, .is-drop-target").forEach((element) =>
      element.classList.remove("is-dragging", "is-drop-target"));
    document.body.classList.remove("dragging");
    if (previous?.handle.hasPointerCapture(previous.pointerId)) {
      previous.handle.releasePointerCapture(previous.pointerId);
    }
    return previous;
  }

  function cancel(notify = true) {
    const previous = cleanup();
    if (previous?.active) {
      previous.handle.focus({ preventScroll: true });
      if (notify) announce("이동을 취소했어요. 기존 순서를 유지합니다.");
    }
  }

  function position() {
    if (!gesture?.active) return;
    const previewX = Math.max(0, Math.min(window.innerWidth - gesture.width, gesture.x - gesture.offsetX));
    preview.style.transform = `translate(${previewX}px, ${gesture.y - 20}px)`;
    const target = targetAt(gesture.x, gesture.y);
    root.querySelectorAll(".is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));
    marker.hidden = !target;
    if (!target) return;
    const column = root.querySelector(`[data-priority="${target.priority}"]`);
    column.classList.add("is-drop-target");
    const list = column.querySelector(".priority-list");
    const items = [...list.querySelectorAll(".todo-item")].filter((item) => item.dataset.id !== gesture.id);
    const before = items.find((item) => item.dataset.id === target.beforeId);
    const rect = list.getBoundingClientRect();
    const y = before ? before.getBoundingClientRect().top - 5
      : items.length ? items.at(-1).getBoundingClientRect().bottom + 5 : rect.top + 18;
    marker.style.width = `${rect.width}px`;
    marker.style.transform = `translate(${rect.left}px, ${y}px)`;
  }

  function tick() {
    if (!gesture?.active) return;
    // Scroll the page, including between vertically stacked mobile columns.
    const edge = 64;
    const delta = gesture.y < edge ? -Math.ceil((edge - gesture.y) / 5)
      : gesture.y > innerHeight - edge ? Math.ceil((gesture.y - innerHeight + edge) / 5) : 0;
    if (delta) window.scrollBy(0, Math.max(-16, Math.min(16, delta)));
    position();
    frame = requestAnimationFrame(tick);
  }

  function begin() {
    if (!gesture || gesture.active) return;
    gesture.active = true;
    gesture.item.classList.add("is-dragging");
    document.body.classList.add("dragging");
    preview = document.createElement("div");
    preview.className = "drag-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.textContent = gesture.item.querySelector(".todo-text").textContent;
    preview.style.width = `${gesture.item.getBoundingClientRect().width}px`;
    marker = document.createElement("div");
    marker.className = "drop-marker";
    marker.setAttribute("aria-hidden", "true");
    document.body.append(preview, marker);
    announce("이동을 시작했어요. 원하는 위치에 놓으세요. Escape로 취소할 수 있어요.");
    position();
    frame = requestAnimationFrame(tick);
  }

  root.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle || gesture || event.isPrimary === false || event.button !== 0) return;
    const item = handle.closest(".todo-item");
    gesture = {
      id: item.dataset.id, item, handle, pointerId: event.pointerId,
      pointerType: event.pointerType, active: false,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - item.getBoundingClientRect().left,
      width: item.getBoundingClientRect().width,
    };
    handle.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") timer = setTimeout(begin, 250);
  });

  root.addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-drag-handle]")) event.preventDefault();
  });

  document.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (!gesture.active) {
      const distance = Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY);
      if (gesture.pointerType === "touch") {
        if (distance > 8) cancel(false);
        return;
      }
      if (distance < 6) return;
      begin();
    }
    if (event.cancelable) event.preventDefault();
    position();
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const target = gesture.active ? targetAt(event.clientX, event.clientY) : null;
    const previous = cleanup();
    if (!previous.active) return;
    if (target) onDrop(previous.id, target);
    else {
      previous.handle.focus({ preventScroll: true });
      announce("이동을 취소했어요. 기존 순서를 유지합니다.");
    }
  });
  document.addEventListener("pointercancel", (event) => {
    if (gesture?.pointerId === event.pointerId) cancel();
  });
  root.addEventListener("lostpointercapture", (event) => {
    if (gesture?.pointerId === event.pointerId) cancel();
  });
  document.addEventListener("keydown", (event) => {
    if (gesture && event.key === "Escape") { event.preventDefault(); cancel(); }
  });
  window.addEventListener("blur", () => cancel());
  window.addEventListener("resize", () => cancel());
  return { cancel };
}

async function initializeApp() {
  let store;
  let client;
  let legacy = null;
  let authReady = false;
  let handlersReady = false;
  let emailAuth;
  let emailBusy = false;
  let authMode = "login";
  let githubDisplay;
  const status = document.getElementById("cloud-status");
  const cloudError = document.getElementById("cloud-error");
  const login = document.getElementById("login-button");
  const logout = document.getElementById("logout-button");
  const refresh = document.getElementById("refresh-button");
  const githubDialog = document.getElementById("github-account-dialog");
  function renderGitHubAccount() {
    const view = githubDisplay?.snapshot() || { account: null, source: "none" };
    const label = view.source === "connected" ? "앱에 연결된 GitHub 계정" : "이 페이지에서 마지막으로 확인한 GitHub 계정";
    const name = view.account?.username ? `@${view.account.username}` : "계정 이름 정보가 없어요";
    const email = view.account?.email ? `앱 이메일: ${view.account.email}` : "";
    document.getElementById("github-account-summary").hidden = !view.account;
    document.getElementById("github-account-source").textContent = label;
    document.getElementById("github-account-name").textContent = name;
    document.getElementById("github-account-email").textContent = email;
    document.getElementById("github-account-email").hidden = !email;
    document.getElementById("github-dialog-source").textContent = view.account ? label : "앱에서 확인한 GitHub 계정 정보가 없어요.";
    document.getElementById("github-dialog-account").textContent = view.account ? name : "GitHub 화면에서 계정을 선택해주세요.";
    document.getElementById("github-dialog-email").textContent = email;
    document.getElementById("github-dialog-email").hidden = !email;
    return view;
  }
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authConfirm = document.getElementById("auth-confirm");
  const authInfo = document.getElementById("auth-info");
  const passwordForm = document.getElementById("password-settings-form");
  const accountPassword = document.getElementById("account-password");
  const accountConfirm = document.getElementById("account-password-confirm");
  function info(message) { authInfo.textContent = message; authInfo.hidden = !message; }
  function clearPasswords() { for (const field of [authPassword, authConfirm, accountPassword, accountConfirm]) field.value = ""; }
  function setAuthMode(mode) {
    authMode = mode;
    clearPasswords();
    showError(""); info("");
    const signingUp = mode === "signup";
    document.getElementById("email-login-mode").setAttribute("aria-pressed", String(!signingUp));
    document.getElementById("email-signup-mode").setAttribute("aria-pressed", String(signingUp));
    document.getElementById("auth-confirm-field").hidden = !signingUp;
    authConfirm.required = signingUp;
    authPassword.autocomplete = signingUp ? "new-password" : "current-password";
    document.getElementById("email-auth-submit").textContent = signingUp ? "회원가입" : "이메일로 로그인";
    document.getElementById("auth-help").textContent = signingUp ? "비밀번호는 8자 이상으로 입력해주세요. 가입 후 확인 메일의 인증을 완료해주세요." : "가입한 이메일과 비밀번호로 로그인하세요.";
    render(); authEmail.focus();
  }
  function showError(message) { cloudError.textContent = message; cloudError.hidden = !message; }
  try { legacy = window.localStorage.getItem(STORAGE_KEY); } catch { /* Cloud storage does not depend on legacy storage. */ }
  const exportButton = document.getElementById("export-button");
  exportButton.hidden = !legacy;
  exportButton.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([legacy], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "todo-local-backup.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const input = document.getElementById("todo-input");
  const newPriority = document.getElementById("new-priority");
  const error = document.getElementById("input-error");
  const board = document.getElementById("todo-board");
  const announcer = document.getElementById("announcer");
  const cards = new Map();
  let dragController;
  const announce = (message) => { announcer.textContent = message; };

  function iconButton(label, icon, control) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.dataset.control = control;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = icon;
    return button;
  }

  function focusCard(id, control = "check") {
    cards.get(id)?.querySelector(`[data-control="${control}"]`)?.focus({ preventScroll: true });
  }

  async function run(action, message, focusId, control) {
    const generation = store.snapshot().epoch;
    showError("");
    try {
      const changed = await action();
      if (store.snapshot().epoch !== generation) return false;
      if (changed) { if (focusId) focusCard(focusId, control); if (message) announce(message); }
      return changed;
    } catch (error) {
      if (store.snapshot().epoch === generation) showError(TodoCloud.errorMessage(error));
      return false;
    }
  }

  function render(focusId, control) {
    const state = store.snapshot();
    const writable = handlersReady && !emailBusy && !!state.user && state.loaded && !state.busy && !state.needsRefresh;
    document.getElementById("workspace").hidden = !state.user || !state.loaded;
    document.querySelectorAll("#todo-form input, #todo-form select, #todo-form button").forEach((element) => { element.disabled = !writable; });
    board.inert = !writable;
    board.setAttribute("aria-busy", String(state.busy));
    const githubView = renderGitHubAccount();
    login.hidden = !!state.user && githubView.source !== "connected";
    login.textContent = state.user ? "GitHub 계정 선택" : "GitHub로 로그인";
    login.disabled = !authReady || !handlersReady || emailBusy || state.busy;
    logout.hidden = !state.user;
    logout.disabled = state.busy || !handlersReady || emailBusy;
    refresh.hidden = !state.user;
    refresh.disabled = state.busy || !handlersReady || emailBusy;
    const authEnabled = authReady && handlersReady && !emailBusy;
    document.getElementById("email-auth-panel").hidden = !!state.user;
    document.querySelectorAll("#email-auth-panel input, #email-auth-panel button").forEach((element) => { element.disabled = !authEnabled; });
    authConfirm.disabled = !authEnabled || authMode !== "signup";
    document.getElementById("session-note").hidden = !state.user;
    document.getElementById("password-panel").hidden = !state.user;
    document.querySelectorAll("#password-panel input, #password-panel button").forEach((element) => { element.disabled = !authEnabled || state.busy || !state.user?.email; });
    document.getElementById("email-auth-form").setAttribute("aria-busy", String(emailBusy));
    document.getElementById("import-panel").hidden = !state.user || !state.loaded;
    document.querySelectorAll("#import-panel button, #import-panel input").forEach((element) => { element.disabled = !writable; });
    document.getElementById("import-local-button").hidden = !legacy;
    status.textContent = !authReady || !handlersReady ? "로그인 상태를 확인하고 있어요." : !state.user ? "이메일로 로그인하거나 회원가입해 개인 목록을 시작하세요." :
      state.busy ? "클라우드와 동기화하고 있어요…" : `${state.user.email || "로그인한 사용자"} · 개인 목록${state.needsRefresh ? " · 새로고침이 필요해요" : ""}`;
    document.getElementById("save-hint").hidden = !state.user || !state.loaded;
    dragController?.cancel(false);
    cards.clear();
    const todos = store.getTodos();
    for (const [priority, name] of Object.entries(PRIORITIES)) {
      const column = board.querySelector(`[data-priority="${priority}"]`);
      const list = column.querySelector(".priority-list");
      const group = todos.filter((todo) => todo.priority === priority);
      list.replaceChildren();
      column.querySelector(".column-count").textContent = String(group.length);
      column.querySelector(".group-empty").hidden = group.length > 0;
      for (const [index, todo] of group.entries()) {
        const item = document.createElement("li");
        item.className = `todo-item${todo.completed ? " is-completed" : ""}`;
        item.dataset.id = todo.id;
        const top = document.createElement("div");
        top.className = "task-top";
        const label = document.createElement("label");
        label.className = "todo-label";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "todo-checkbox";
        checkbox.dataset.control = "check";
        checkbox.checked = todo.completed;
        const text = document.createElement("span");
        text.className = "todo-text";
        text.textContent = todo.text;
        label.append(checkbox, text);
        const handle = iconButton(`${todo.text} 드래그 이동`, "⠿", "drag");
        handle.classList.add("drag-handle");
        handle.dataset.dragHandle = "";
        handle.setAttribute("aria-describedby", "drag-help");
        top.append(label, handle);
        const bottom = document.createElement("div");
        bottom.className = "task-bottom";
        const select = document.createElement("select");
        select.className = "priority-select";
        select.dataset.control = "priority";
        select.setAttribute("aria-label", `${todo.text} 우선순위`);
        for (const [value, caption] of Object.entries(PRIORITIES)) {
          select.add(new Option(caption, value));
        }
        select.value = priority;
        select.addEventListener("change", () => {
          const next = select.value;
          run(() => store.setPriority(todo.id, next), `${todo.text}: ${PRIORITIES[next]} 등급의 마지막으로 이동했어요.`, todo.id, "priority");
        });
        const actions = document.createElement("div");
        actions.className = "task-actions";
        for (const [direction, symbol, caption] of [[-1, "↑", "위로"], [1, "↓", "아래로"]]) {
          const button = iconButton(`${todo.text} ${caption} 이동`, symbol, direction === -1 ? "up" : "down");
          button.disabled = direction === -1 ? index === 0 : index === group.length - 1;
          button.addEventListener("click", () => {
            const beforeId = direction === -1 ? group[index - 1].id : group[index + 2]?.id ?? null;
            const atEdge = direction === -1 ? index === 1 : index === group.length - 2;
            run(() => store.moveTodo(todo.id, priority, beforeId), `${todo.text}: ${name} 등급에서 ${caption} 이동했어요.`,
              todo.id, atEdge ? "drag" : direction === -1 ? "up" : "down");
          });
          actions.append(button);
        }
        const remove = iconButton(`${todo.text} 삭제`, "×", "delete");
        remove.classList.add("delete-button");
        remove.addEventListener("click", async () => {
          if (await run(() => store.remove(todo.id), `${todo.text}: 삭제했어요.`)) {
            const remaining = store.getTodos().filter((entry) => entry.priority === priority);
            if (remaining.length) focusCard(remaining[Math.min(index, remaining.length - 1)].id);
            else input.focus();
          }
        });
        checkbox.addEventListener("change", () => {
          const completed = checkbox.checked;
          run(() => store.toggle(todo.id), `${todo.text}: ${completed ? "완료" : "미완료"}로 변경했어요.`, todo.id);
        });
        actions.append(remove);
        bottom.append(select, actions);
        item.append(top, bottom);
        list.append(item);
        cards.set(todo.id, item);
      }
    }
    document.getElementById("empty-state").hidden = todos.length > 0;
    document.getElementById("total-count").textContent = String(todos.length);
    document.getElementById("completion-count").textContent = `${todos.filter((todo) => todo.completed).length}개 완료`;
    if (focusId) focusCard(focusId, control);
  }

  document.getElementById("todo-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const state = store.snapshot();
    if (!state.user || !state.loaded || state.busy || state.needsRefresh) return;
    if (!input.value.trim() || [...input.value.trim()].length > MAX_TODO_LENGTH) {
      error.textContent = input.value.trim() ? `할 일은 ${MAX_TODO_LENGTH}자 이내로 적어주세요.` : "할 일을 먼저 적어주세요.";
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    if (await run(() => store.add(input.value, newPriority.value), `${PRIORITIES[newPriority.value]} 등급에 할 일을 추가했어요.`)) {
      input.value = "";
      input.removeAttribute("aria-invalid");
      error.hidden = true;
      input.focus();
    }
  });
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    error.hidden = true;
  });
  try {
    if (!/^https?:$/.test(window.location.protocol)) throw new Error("HTTP_REQUIRED");
    const config = window.TODO_CONFIG;
    if (!config?.supabaseUrl?.startsWith("https://") || !config.supabasePublishableKey?.startsWith("sb_publishable_")) throw new Error("CONFIG");
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    githubDisplay = TodoAuth.createGitHubAccountDisplay();
    emailAuth = TodoAuth.createEmailAuth(client, new URL("./", window.location.href).href);
    store = TodoCloud.createCloudStore(client);
    store.subscribe(() => render());
    dragController = createDragController(board, (id, target) => {
      run(() => store.moveTodo(id, target.priority, target.beforeId), `${PRIORITIES[target.priority]} 등급의 선택한 위치로 이동했어요.`, id, "drag");
    }, announce);
    const refreshList = () => run(() => store.refresh());
    const applyUser = (user) => {
      authReady = true;
      githubDisplay.update(user);
      const changed = store.setUser(user);
      if (changed && githubDialog.open) githubDialog.close();
      if (changed) {
        input.value = ""; error.hidden = true; input.removeAttribute("aria-invalid");
        clearPasswords(); authEmail.value = ""; info("");
        passwordForm.hidden = true;
        document.getElementById("password-settings-toggle").setAttribute("aria-expanded", "false");
      }
      render();
      if (changed && user) setTimeout(refreshList, 0);
    };
    let authEvents = 0;
    client.auth.onAuthStateChange((_event, session) => {
      authEvents++;
      showError("");
      applyUser(session?.user || null);
    });
    const initial = authEvents;
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      applyUser(null);
      const returnUrl = new URL(window.location.href);
      for (const key of ["code", "error", "error_code", "error_description"]) returnUrl.searchParams.delete(key);
      window.history.replaceState(null, "", returnUrl.pathname + returnUrl.search);
      showError("로그인 상태나 인증 링크를 처리하지 못했어요. 가입한 브라우저에서 메일을 열거나 이메일로 다시 로그인해주세요.");
    } else if (authEvents === initial) applyUser(data.session?.user || null);
    document.getElementById("email-login-mode").addEventListener("click", () => setAuthMode("login"));
    document.getElementById("email-signup-mode").addEventListener("click", () => setAuthMode("signup"));
    document.getElementById("email-auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (emailBusy || !handlersReady || store.snapshot().user) return;
      const mode = authMode;
      emailBusy = true; showError(""); info(""); render();
      try {
        const result = mode === "signup"
          ? await emailAuth.signUp(authEmail.value, authPassword.value, authConfirm.value)
          : await emailAuth.signIn(authEmail.value, authPassword.value);
        info(result.requiresEmailConfirmation
          ? "회원가입 요청을 처리했어요. 받은 메일에서 인증한 후 로그인해주세요. 이미 가입한 이메일이라면 로그인 화면을 이용해주세요." : "로그인했어요.");
      } catch (error) {
        showError(error.message);
        const field = { email: authEmail, password: authPassword, confirmation: authConfirm }[error.field];
        emailBusy = false; render(); field?.focus();
      } finally { emailBusy = false; clearPasswords(); render(); }
    });
    document.getElementById("password-settings-toggle").addEventListener("click", (event) => {
      passwordForm.hidden = !passwordForm.hidden;
      clearPasswords(); showError(""); info("");
      event.currentTarget.setAttribute("aria-expanded", String(!passwordForm.hidden));
      if (!passwordForm.hidden) accountPassword.focus();
    });
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (emailBusy || !store.snapshot().user || store.snapshot().busy) return;
      const generation = store.snapshot().epoch;
      emailBusy = true; showError(""); info(""); render();
      try {
        await emailAuth.setPassword(accountPassword.value, accountConfirm.value);
        if (store.snapshot().epoch === generation) info("비밀번호를 설정했어요. 다음부터 현재 이메일과 비밀번호로 로그인할 수 있어요.");
      } catch (error) { if (store.snapshot().epoch === generation) showError(error.message); }
      finally { emailBusy = false; clearPasswords(); render(); }
    });
    login.addEventListener("click", () => {
      if (emailBusy || store.snapshot().busy) return;
      showError("");
      renderGitHubAccount();
      if (!githubDialog.open) githubDialog.showModal();
    });
    document.getElementById("github-dialog-cancel").addEventListener("click", () => githubDialog.close());
    document.getElementById("github-dialog-continue").addEventListener("click", async () => {
      if (emailBusy || store.snapshot().busy) return;
      githubDialog.close();
      emailBusy = true; showError(""); render();
      try {
        const redirect = new URL("./", window.location.href).href;
        await TodoAuth.signInWithGitHub(client, redirect);
      } catch { showError("로그인을 시작하지 못했어요. GitHub 로그인 설정과 연결을 확인해주세요."); }
      finally { emailBusy = false; render(); }
    });
    logout.addEventListener("click", async () => {
      clearPasswords();
      logout.disabled = true;
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        setAuthMode("login");
      } catch { showError("로그아웃하지 못했어요. 연결을 확인하고 다시 시도해주세요."); render(); }
    });
    refresh.addEventListener("click", refreshList);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && store.snapshot().user && !store.snapshot().busy) refreshList();
    });
    async function importValue(value) {
      try {
        const items = TodoCloud.normalizeLegacy(value);
        if (!window.confirm(`${items.length}개 항목을 현재 로그인한 계정으로 가져올까요? 원본은 보존됩니다.`)) return;
        await run(() => store.importTodos(items), "기존 목록을 클라우드에 가져왔어요.");
      } catch (error) { showError(error.message); }
    }
    document.getElementById("import-local-button").addEventListener("click", () => {
      try { importValue(JSON.parse(legacy)); } catch { showError("기존 목록의 JSON 형식을 확인해주세요."); }
    });
    const file = document.getElementById("import-file");
    document.getElementById("import-file-button").addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const selected = file.files[0];
      file.value = "";
      if (!selected) return;
      if (selected.size > 2 * 1024 * 1024) { showError("가져올 파일은 2MB 이하여야 해요."); return; }
      try { await importValue(JSON.parse(await selected.text())); }
      catch { showError("JSON 파일을 읽지 못했어요. 파일 형식을 확인해주세요."); }
    });
    handlersReady = true;
    render();
  } catch {
    authReady = false;
    store?.setUser(null);
    document.getElementById("workspace").hidden = true;
    login.disabled = true;
    status.textContent = window.location.protocol === "file:"
      ? "클라우드 연결은 http://localhost:8000/ 또는 배포 주소에서 실행해주세요."
      : "클라우드 연결을 준비하지 못했어요. 연결 설정과 네트워크를 확인한 후 새로고침해주세요.";
  }
}

if (typeof document !== "undefined") initializeApp();
if (typeof module !== "undefined" && module.exports) {
  module.exports = { createTodoStore, getDropTarget, STORAGE_KEY, PRIORITIES };
}
