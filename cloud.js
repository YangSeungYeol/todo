"use strict";

const TodoCloud = (() => {
  const priorities = ["high", "medium", "low"];
  class StaleSessionError extends Error { constructor() { super("STALE_SESSION"); } }
  function normalizeLegacy(value) {
    if (!Array.isArray(value) || value.length > 1000) throw new Error("가져올 파일은 할 일 배열이어야 하며 최대 1,000개까지 지원해요.");
    const ids = new Set();
    return value.map((todo) => {
      if (!todo || typeof todo.id !== "string" || !todo.id.trim() || ids.has(todo.id) ||
        typeof todo.text !== "string" || !todo.text.trim() || [...todo.text.trim()].length > 200 ||
        typeof todo.completed !== "boolean") throw new Error("기존 목록에 잘못되거나 중복된 항목이 있어요. 원본을 확인해주세요.");
      ids.add(todo.id);
      return { id: todo.id, text: todo.text.trim(), completed: todo.completed,
        priority: priorities.includes(todo.priority) ? todo.priority : "medium" };
    });
  }
  function errorMessage(error) {
    const message = error?.message || "";
    if (/VERSION_CONFLICT|TODO_NOT_FOUND|INVALID_TARGET/.test(message)) return "다른 곳에서 목록이 바뀌었어요. 새로고침한 후 다시 시도해주세요.";
    if (/AUTH_REQUIRED|JWT|session/i.test(message)) return "로그인 상태를 확인하고 다시 로그인해주세요.";
    return "클라우드 요청에 실패했어요. 변경이 반영되었을 수 있으니 새로고침으로 확인해주세요.";
  }
  function createCloudStore(client, { timeoutMs = 15000 } = {}) {
    let user = null, todos = [], loaded = false, busy = false, needsRefresh = false;
    let epoch = 0, request = 0;
    const listeners = new Set();
    const snapshot = () => ({ user: user ? { ...user } : null, todos: todos.map((todo) => ({ ...todo })), loaded, busy, needsRefresh, epoch });
    const notify = () => listeners.forEach((listener) => listener(snapshot()));
    const assertCurrent = (generation) => { if (generation !== epoch) throw new StaleSessionError(); };
    async function bounded(query) {
      let timer;
      try {
        return await Promise.race([query, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), timeoutMs);
        })]);
      } finally { clearTimeout(timer); }
    }
    async function read(generation, ticket) {
      const rows = [];
      const owner = user.id;
      let after = null;
      while (true) {
        let query = client.from("todos").select("id,user_id,text,completed,priority,position,version,created_at,updated_at")
          .eq("user_id", owner).order("id").limit(500);
        if (after !== null) query = query.gt("id", after);
        const { data, error } = await bounded(query);
        assertCurrent(generation);
        if (ticket !== request) throw new StaleSessionError();
        if (error) throw error;
        if (!Array.isArray(data) || data.some((row) => row.user_id !== owner)) throw new Error("INVALID_OWNER_RESPONSE");
        rows.push(...data);
        if (data.length < 500) break;
        const next = data.at(-1).id;
        if (after !== null && next <= after) throw new Error("INVALID_PAGE");
        after = next;
      }
      todos = rows.sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) ||
        a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      loaded = true;
      needsRefresh = false;
    }
    async function refresh() {
      if (!user || busy) return false;
      const generation = epoch, ticket = ++request;
      busy = true; notify();
      try { await read(generation, ticket); return true; }
      catch (error) { assertCurrent(generation); needsRefresh = true; throw error; }
      finally { if (generation === epoch) { busy = false; notify(); } }
    }
    async function mutate(name, parameters) {
      if (!user || !loaded || busy || needsRefresh) throw new Error("NOT_READY");
      const generation = epoch, ticket = ++request;
      busy = true; notify();
      try {
        const { error } = await bounded(client.rpc(name, parameters));
        assertCurrent(generation);
        if (error) throw error;
        await read(generation, ticket);
        return true;
      } catch (error) { assertCurrent(generation); needsRefresh = true; throw error; }
      finally { if (generation === epoch) { busy = false; notify(); } }
    }
    function currentTodo(id) {
      const todo = todos.find((item) => item.id === id);
      if (!todo) throw new Error("TODO_NOT_FOUND");
      return todo;
    }
    return {
      snapshot,
      getTodos: () => snapshot().todos,
      subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
      setUser(next) {
        if (next?.id && next.id === user?.id) return false;
        user = next ? { id: next.id, email: next.email || "" } : null;
        epoch++; request++; todos = []; loaded = busy = needsRefresh = false; notify(); return true;
      },
      refresh,
      async add(text, priority = "medium") {
        if (typeof text !== "string" || !text.trim() || [...text.trim()].length > 200 || !priorities.includes(priority)) return false;
        return mutate("add_todo", { p_text: text.trim(), p_priority: priority });
      },
      toggle(id) { const todo = currentTodo(id); return mutate("set_todo_completed", { p_todo_id: id, p_completed: !todo.completed, p_expected_version: todo.version }); },
      remove(id) { const todo = currentTodo(id); return mutate("delete_todo", { p_todo_id: id, p_expected_version: todo.version }); },
      moveTodo(id, priority, beforeId = null) {
        const todo = currentTodo(id);
        if (!priorities.includes(priority) || beforeId === id || (beforeId !== null && !todos.some((item) => item.id === beforeId && item.priority === priority))) return Promise.resolve(false);
        return mutate("move_todo", { p_todo_id: id, p_target_priority: priority, p_before_id: beforeId, p_expected_version: todo.version });
      },
      setPriority(id, priority) { return currentTodo(id).priority === priority ? Promise.resolve(false) : this.moveTodo(id, priority); },
      importTodos(value) { return mutate("import_todos", { p_items: normalizeLegacy(value) }); },
    };
  }
  return { createCloudStore, normalizeLegacy, errorMessage, StaleSessionError };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TodoCloud;
