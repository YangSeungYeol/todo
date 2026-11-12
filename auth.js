"use strict";

const TodoAuth = (() => {
  class AuthError extends Error {
    constructor(message, field = null) { super(message); this.field = field; }
  }
  function passwordError(password, confirmation) {
    if (typeof password !== "string" || [...password].length < 8) return new AuthError("비밀번호는 8자 이상 입력해주세요.", "password");
    if (password !== confirmation) return new AuthError("비밀번호 확인이 일치하지 않아요.", "confirmation");
    return null;
  }
  function readable(error) {
    const messages = {
      invalid_credentials: "이메일 또는 비밀번호를 확인해주세요. GitHub로만 가입했다면 먼저 GitHub로 로그인해 이메일용 비밀번호를 설정해주세요.",
      email_not_confirmed: "이메일 인증이 필요해요. 받은 메일의 인증 링크를 확인해주세요.",
      user_already_exists: "가입을 진행할 수 없어요. 기존 계정이 있다면 로그인해주세요.",
      weak_password: "비밀번호가 계정의 보안 조건을 충족하지 못했어요. 더 길고 복잡한 비밀번호를 사용해주세요.",
      email_address_invalid: "올바른 이메일 주소를 입력해주세요.",
      email_address_not_authorized: "확인 메일을 보낼 수 없는 주소예요. 서비스 관리자의 이메일 발송 설정 확인이 필요해요.",
      signup_disabled: "현재 회원가입이 비활성화되어 있어요. 서비스 관리자에게 확인해주세요.",
      email_provider_disabled: "이메일 로그인이 비활성화되어 있어요. 서비스 관리자에게 확인해주세요.",
      over_email_send_rate_limit: "확인 메일 발송 횟수를 초과했어요. 잠시 후 다시 시도해주세요.",
      over_request_rate_limit: "요청이 많아요. 잠시 후 다시 시도해주세요.",
      reauthentication_needed: "비밀번호를 설정하려면 다시 로그인해주세요.",
      same_password: "기존 비밀번호와 다른 비밀번호를 입력해주세요.",
    };
    return new AuthError(Object.hasOwn(messages, error?.code) ? messages[error.code] : "인증 요청을 처리하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.");
  }
  function createEmailAuth(client, redirectUrl) {
    let busy = false;
    async function perform(action) {
      if (busy) throw new AuthError("인증 요청을 처리 중이에요. 잠시 기다려주세요.");
      busy = true;
      try {
        const result = await action();
        if (result.error) throw readable(result.error);
        return result.data;
      } catch (error) { throw error instanceof AuthError ? error : readable(error); }
      finally { busy = false; }
    }
    function credentials(email, password) {
      const address = typeof email === "string" ? email.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new AuthError("올바른 이메일 주소를 입력해주세요.", "email");
      if (typeof password !== "string" || !password) throw new AuthError("비밀번호를 입력해주세요.", "password");
      return { email: address, password };
    }
    return {
      get busy() { return busy; },
      async signUp(email, password, confirmation) {
        const values = credentials(email, password);
        const error = passwordError(password, confirmation);
        if (error) throw error;
        const data = await perform(() => client.auth.signUp({ ...values, options: { emailRedirectTo: redirectUrl } }));
        return { signedIn: !!data?.session, requiresEmailConfirmation: !data?.session };
      },
      async signIn(email, password) {
        const data = await perform(() => client.auth.signInWithPassword(credentials(email, password)));
        if (!data?.session) throw new AuthError("로그인 상태를 확인하지 못했어요. 다시 시도해주세요.");
        return { signedIn: true };
      },
      async setPassword(password, confirmation) {
        const error = passwordError(password, confirmation);
        if (error) throw error;
        await perform(() => client.auth.updateUser({ password }));
        return { updated: true };
      },
    };
  }
  // Display only identities linked to this app session. Do not infer the
  // current github.com browser session or use profile text for authorization.
  function getGitHubAccount(user) {
    const identity = Array.isArray(user?.identities)
      ? user.identities.find((item) => item?.provider === "github") : null;
    if (!identity) return null;
    const text = (value) => typeof value === "string" ? value.trim() : "";
    return {
      username: text(identity.identity_data?.preferred_username) || text(identity.identity_data?.user_name),
      email: text(user.email),
    };
  }
  function createGitHubAccountDisplay() {
    let connected = null;
    let previous = null;
    return {
      update(user) {
        connected = getGitHubAccount(user);
        if (connected) previous = { ...connected };
        else if (user) previous = null;
      },
      snapshot() {
        const account = connected || previous;
        return { account: account ? { ...account } : null, source: connected ? "connected" : previous ? "previous" : "none" };
      },
    };
  }
  async function signInWithGitHub(client, redirectUrl) {
    const { error } = await client.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirectUrl, queryParams: { prompt: "select_account" } },
    });
    if (error) throw readable(error);
  }
  return { createEmailAuth, signInWithGitHub, getGitHubAccount, createGitHubAccountDisplay, AuthError };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TodoAuth;
