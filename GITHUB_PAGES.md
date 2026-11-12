# GitHub Pages + Supabase 공개 배포

이 문서는 사용자가 순서대로 실행하는 배포 절차다. GitHub 계정은 **YangSeungYeol**, 저장소는 **todo**를 사용한다. 백엔드는 확인된 기존 Supabase 프로젝트를 유지하고 프론트엔드만 GitHub Pages에 게시한다.

## 1. 최종 구성과 바로가기

| 용도 | 주소 |
|---|---|
| 공개 프론트엔드 — 배포 후 접속 | [https://yangseungyeol.github.io/todo/](https://yangseungyeol.github.io/todo/) |
| GitHub 저장소 | [YangSeungYeol/todo](https://github.com/YangSeungYeol/todo) |
| Pages 설정 | [저장소 Settings → Pages](https://github.com/YangSeungYeol/todo/settings/pages) |
| GitHub 저장소 설정 | [저장소 Settings](https://github.com/YangSeungYeol/todo/settings) |
| Git 원격 — SSH 인증 | `git@github.com:YangSeungYeol/todo.git` |
| Supabase API | `https://jmteohphohvjokpthusa.supabase.co` |
| Supabase 관리 화면 | [todo 프로젝트 Dashboard](https://supabase.com/dashboard/project/jmteohphohvjokpthusa) |
| Supabase 로그인 복귀 주소 설정 | [Authentication → URL Configuration](https://supabase.com/dashboard/project/jmteohphohvjokpthusa/auth/url-configuration) |
| Supabase 로그인 Provider 설정 | [Authentication → Sign In / Providers](https://supabase.com/dashboard/project/jmteohphohvjokpthusa/auth/providers) |

```text
이용자 브라우저
  ├── GitHub Pages: HTML·CSS·JavaScript 다운로드
  └── Supabase: 로그인·개인 목록 조회/저장
```

누구나 프론트엔드 URL에 접속하고 Supabase API와 통신할 수 있게 한다. **할 일 데이터는 로그인한 본인만 접근**하도록 기존 RLS를 유지한다. 공개 배포를 위해 테이블을 전체 공개하거나 RLS를 끄지 않는다. Supabase URL은 API 주소이며, 사용자에게 안내할 앱 주소는 위 GitHub Pages URL이다.

### 이번 배포 방식

- 게시 소스: **Deploy from a branch**
- 브랜치: **main**
- 폴더: **/ (root)**
- 사용자 정의 `.github/workflows/*.yml`: 작성하지 않음
- npm 설치·번들 빌드: 필요 없음
- `.nojekyll`: 빈 파일로 추가하여 Jekyll 처리를 생략

브랜치 게시도 GitHub 내부에서는 Pages 배포 작업을 실행하며 Actions 화면에 자동 기록이 나타날 수 있다. 직접 Actions 워크플로를 만드는 방식과는 다르다. **Actions 기능 자체를 끄는 절차는 진행하지 않는다.** [GitHub 공식 게시 소스 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 2. Supabase의 운영 주소 설정

먼저 [Supabase URL Configuration](https://supabase.com/dashboard/project/jmteohphohvjokpthusa/auth/url-configuration)을 열어 아래 값을 저장한다. 이미 같으면 유지한다.

| 설정 | 입력값 |
|---|---|
| Site URL | `https://yangseungyeol.github.io/todo/` |
| Redirect URLs — 운영 | `https://yangseungyeol.github.io/todo/` |
| Redirect URLs — 로컬 개발 유지 | `http://localhost:8000/` |

운영 주소의 **`/todo/`와 마지막 `/`까지 포함**한다. 이 앱은 로그인과 이메일 인증 후 현재 앱 폴더로 돌아오므로 별도 `/auth/callback` 페이지를 GitHub Pages에 만들 필요가 없다. [Supabase Redirect URL 안내](https://supabase.com/docs/guides/auth/redirect-urls)

[GitHub OAuth Apps](https://github.com/settings/developers)에서 기존 ‘오늘 할일’ 앱의 설정도 확인한다.

| GitHub OAuth App 설정 | 값 |
|---|---|
| Homepage URL | `https://yangseungyeol.github.io/todo/` |
| Authorization callback URL / 인증 리다이렉트 URL | `https://jmteohphohvjokpthusa.supabase.co/auth/v1/callback` |

**OAuth callback은 Supabase 주소로 유지한다.** GitHub Pages 주소는 Supabase의 앱 복귀 주소에 넣는다. 기존 OAuth Client ID·Secret은 그대로 사용하며 로그인 설정을 다시 생성할 필요는 없다. [GitHub 로그인 공식 안내](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)

이메일 가입을 공개 운영한다면 [Provider 설정](https://supabase.com/dashboard/project/jmteohphohvjokpthusa/auth/providers)의 Email 활성화와 확인 메일 발송 설정도 확인한다. 일반 가입자에게 확인 메일을 보내려면 Custom SMTP가 필요하다. [Supabase 이메일 발송 안내](https://supabase.com/docs/guides/auth/auth-smtp)

## 3. 공개 저장소 준비와 SSH 인증

1. [저장소](https://github.com/YangSeungYeol/todo)를 연다.
2. 저장소가 없다면 [New repository](https://github.com/new)에서 Owner **YangSeungYeol**, 이름 **todo**, Visibility **Public**으로 만든다.
3. 기존 저장소가 Private이면 [Settings](https://github.com/YangSeungYeol/todo/settings) → General → Danger Zone → Change repository visibility에서 공개할 내용을 확인하고 **Public**으로 변경한다. 이미 Public이면 생략한다.

이 문서는 GitHub Free에서도 사용할 수 있는 공개 저장소를 기준으로 한다. [GitHub Pages 저장소 조건](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

이후 명령은 **사용자 PC의 WSL/Linux 터미널 또는 VS Code 터미널**에서 실행한다. SSH 인증을 확인한다.

```bash
ssh -T git@github.com
```

응답에 `Hi YangSeungYeol!`과 인증 성공 메시지가 있으면 진행한다. GitHub는 셸 접속을 제공하지 않아 인증 성공이어도 종료 코드가 1일 수 있다. 처음 접속하는 경우 표시된 지문을 공식 안내와 확인한다. [SSH 연결 확인](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)

`Permission denied (publickey)`가 나오면 [GitHub SSH keys](https://github.com/settings/keys)에 공개키를 등록한다. 자세한 키 생성·등록 명령은 [SSH 키 생성·등록 공식 안내](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)를 따른다.

## 4. 배포할 프론트엔드 확인

원본 앱 폴더는 다음 경로를 기준으로 한다.

```text
/home/ubuntu/work/vibe-coding/todo
```

필수 파일은 아래 **6개**다. HTML의 스크립트 순서도 유지한다.

```text
index.html
style.css
config.js
cloud.js
auth.js
script.js
```

- `config.js`: 현재 Supabase 프로젝트 URL과 **Publishable key** 설정.
- `cloud.js`: 개인 목록 조회·저장.
- `auth.js`: 이메일 가입·로그인과 비밀번호 설정.
- `script.js`: 화면과 동작, 버전 고정된 Supabase SDK CDN 로딩.

Publishable key는 공개 브라우저용이므로 RLS와 함께 사용할 수 있다. `secret`, `service_role`, DB 암호, GitHub OAuth Client Secret은 배포 파일에 포함하지 않는다. 정적 Pages에서는 `.env`를 올려도 비밀 설정을 숨길 수 없다. [Supabase API 키 안내](https://supabase.com/docs/guides/getting-started/api-keys)

원본 폴더에서 테스트한다. 이 검증에만 Node.js가 필요하며 방문자가 앱을 사용할 때는 필요 없다.

```bash
cd /home/ubuntu/work/vibe-coding/todo
node tests/todo.test.cjs
node tests/drag.test.cjs
node tests/cloud.test.cjs
node tests/auth.test.cjs
node --check cloud.js
node --check auth.js
node --check script.js
```

현재 유닛 테스트는 72개다. 로컬 브라우저에서도 이메일 가입·로그인, GitHub 보조 로그인, 항목 추가·완료·삭제·등급 이동이 동작하는지 확인한 뒤 게시한다.

## 5. 원격 저장소를 복제하고 프론트엔드 업로드

기존 원격 이력을 유지하고, 원본 앱 폴더의 Git 상태에 영향을 주지 않도록 **다른 폴더에 원격 저장소를 복제**하는 절차를 사용한다. 아래의 `todo-pages`는 PC 안의 폴더 이름이며 GitHub 저장소 이름은 계속 `todo`다.

### 5-1. 저장소 복제

`todo-pages` 폴더가 아직 없을 때 실행한다.

```bash
cd /home/ubuntu/work/vibe-coding
git clone git@github.com:YangSeungYeol/todo.git todo-pages
cd todo-pages
git remote -v
git branch --show-current
```

이미 이 폴더에 같은 저장소를 복제했다면 clone은 생략하고 해당 폴더에서 진행한다. `git remote -v`의 주소가 `git@github.com:YangSeungYeol/todo.git`인지 확인한다.

현재 브랜치가 `main`이면 그대로 진행한다. 다른 브랜치라면:

- `main`이 이미 있으면 `git switch main`.
- `main`이 없다면 `git switch -c main`으로 현재 원격 이력에서 새 브랜치를 만든다.

기존 `main`을 재사용하는 경우, 작업 폴더가 깨끗한 상태에서 `git pull --no-rebase origin main`으로 최신 내용을 받는다. 새 빈 저장소는 아직 원격 `main`이 없으므로 최초 pull을 생략한다.

Git 작성자 설정이 없는 경우에만 아래를 실행한다. `YOUR_GITHUB_EMAIL`은 [GitHub 이메일 설정](https://github.com/settings/emails)의 본인 이메일 또는 noreply 주소로 바꾼다.

```bash
git config user.name "YangSeungYeol"
git config user.email "YOUR_GITHUB_EMAIL"
git config pull.rebase false
```

### 5-2. 프론트엔드 파일 복사

배포용 `todo-pages` 폴더에서 실행한다. 원본 경로가 다르면 명령의 원본 경로를 바꾼다.

```bash
cp /home/ubuntu/work/vibe-coding/todo/index.html .
cp /home/ubuntu/work/vibe-coding/todo/style.css .
cp /home/ubuntu/work/vibe-coding/todo/config.js .
cp /home/ubuntu/work/vibe-coding/todo/cloud.js .
cp /home/ubuntu/work/vibe-coding/todo/auth.js .
cp /home/ubuntu/work/vibe-coding/todo/script.js .
cp /home/ubuntu/work/vibe-coding/todo/GITHUB_PAGES.md .
touch .nojekyll
```

이 과정에서 원본 `.git` 폴더는 복사하지 않는다. 기존 원격 저장소의 다른 추적 파일은 그대로 남으므로, 저장소 루트에 이미 올라간 파일도 공개 대상으로 검토한다.

최소 게시 구조:

```text
todo/                         # GitHub 저장소의 main 루트
├── .nojekyll
├── index.html
├── style.css
├── config.js
├── cloud.js
├── auth.js
├── script.js
└── GITHUB_PAGES.md
```

Supabase의 DB·Auth는 기존 프로젝트가 제공한다. 프론트엔드 게시를 위해 SQL을 다시 적용하거나 별도 백엔드 서버를 띄우지 않는다.

### 5-3. 커밋·푸시

```bash
git add index.html style.css config.js cloud.js auth.js script.js .nojekyll GITHUB_PAGES.md
git diff --cached --stat
git commit -m "Publish todo frontend on GitHub Pages"
git push -u origin main
```

`git diff --cached --stat`에서 업로드할 파일을 확인한다. 이미 같은 내용이라 커밋할 변경이 없으면 새 커밋은 생략한다. 푸시가 원격 변경 때문에 거절되면 `git pull --no-rebase origin main`으로 병합하고 충돌 해결·검증 후 다시 푸시한다. 강제 푸시와 rebase는 사용하지 않는다.

푸시 후 [원격 main 파일 목록](https://github.com/YangSeungYeol/todo/tree/main)에서 `index.html`과 다른 필수 파일이 루트에 있는지 확인한다.

## 6. 브랜치 게시 활성화

[GitHub Pages 설정](https://github.com/YangSeungYeol/todo/settings/pages)을 열고 아래와 같이 저장한다.

| 설정 | 선택 |
|---|---|
| Build and deployment → Source | **Deploy from a branch** |
| Branch | **main** |
| Folder | **/ (root)** |
| 적용 | **Save** |

Source를 **GitHub Actions**로 선택하거나 워크플로 템플릿을 생성하지 않는다. 원격에 최초 `main` 푸시가 끝나야 브랜치를 선택할 수 있다.

완료 후 같은 화면의 **Visit site**로 접속한다. 변경 반영에는 수 분이 걸릴 수 있다. 진행 상태·오류가 필요하면 [GitHub 자동 Pages 게시 기록](https://github.com/YangSeungYeol/todo/actions)을 확인한다. 이 기록을 보기 위해 YAML을 작성할 필요는 없다. [공식 브랜치 게시 절차](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

접속 주소:

**[https://yangseungyeol.github.io/todo/](https://yangseungyeol.github.io/todo/)**

HTTPS 설정 항목이 보이면 **Enforce HTTPS**를 활성화한다. 앱 주소는 위 `https://` 주소로 공유한다.

## 7. 공개 주소에서 프론트엔드·백엔드 함께 확인

시크릿 창이나 다른 기기에서 공개 앱 주소를 열어 확인한다. localhost에서 사용하던 로그인 세션은 새 Pages 주소로 자동 이전되지 않으므로 다시 로그인한다.

1. 탭·화면 제목이 **오늘 할일**이고 이메일 로그인·회원가입 화면이 나타난다.
2. 이메일로 로그인한다. 신규 가입은 확인 메일 인증을 완료한다.
3. GitHub 로그인도 확인한다. 로그인 후 `localhost`가 아닌 **`https://yangseungyeol.github.io/todo/`**로 돌아오는지 확인한다.
4. 할 일 추가·완료·삭제, 우선순위 변경과 드래그 이동을 확인한다.
5. 새로고침 또는 다른 기기에서 같은 계정으로 로그인했을 때 저장 내용이 보이는지 확인한다. 다른 기기 변경은 해당 화면을 새로고침해 확인한다.
6. 다른 계정으로 로그인하면 기존 사용자 목록이 보이지 않는지 확인한다.
7. 브라우저 개발자 도구의 Network에서 정적 파일이 Pages에서 로드되고 데이터 요청이 `jmteohphohvjokpthusa.supabase.co`로 전달되는지 확인한다.

이 과정까지 정상이어야 공개 프론트엔드와 클라우드 백엔드 연결을 확인한 것으로 본다. 백엔드 데이터 자체를 익명 사용자에게 공개하는 구성은 아니다.

## 8. 이후 프론트엔드 업데이트

원본 앱 수정·테스트 후 배포용 `todo-pages` 폴더에서 진행한다.

```bash
cd /home/ubuntu/work/vibe-coding/todo-pages
git switch main
git status
git pull --no-rebase origin main
```

작업 중인 변경이 있으면 먼저 커밋하거나 임시 보관한다. 이어서 **5-2의 복사 명령**을 다시 실행하고 커밋·푸시한다.

```bash
git add index.html style.css config.js cloud.js auth.js script.js .nojekyll GITHUB_PAGES.md
git diff --cached --stat
git commit -m "Update todo frontend"
git push origin main
```

Pages 설정을 다시 만들 필요는 없다. 같은 게시 브랜치에 푸시하면 새 내용으로 게시된다. [최근 커밋](https://github.com/YangSeungYeol/todo/commits/main/)과 [게시 결과](https://github.com/YangSeungYeol/todo/settings/pages)를 확인하고 브라우저를 강력 새로고침한다.

## 9. 문제가 생겼을 때

| 증상 | 확인할 항목·링크 |
|---|---|
| Pages가 404 | [Pages 설정](https://github.com/YangSeungYeol/todo/settings/pages)의 `main`·`/ (root)`, [원격 루트](https://github.com/YangSeungYeol/todo/tree/main)의 `index.html` 존재, 게시 성공 여부를 확인한다. |
| 화면은 뜨지만 로그인·버튼이 작동하지 않음 | `config.js`, `cloud.js`, `auth.js`, `script.js`가 모두 올라갔는지와 개발자 도구의 파일 404·CDN 로딩 오류를 확인한다. |
| 로그인 후 localhost나 잘못된 주소로 돌아감 | [Supabase URL Configuration](https://supabase.com/dashboard/project/jmteohphohvjokpthusa/auth/url-configuration)의 Site URL·Redirect URLs를 위 표대로 맞추고 앱에서 로그인을 새로 시작한다. |
| GitHub가 같은 계정으로 바로 연결됨 | 최신 `auth.js`·`script.js`가 배포되었는지 확인한다. 버튼을 누르면 앱에 연결된 GitHub 계정 확인창이 먼저 열린다. ‘GitHub에서 계정 선택’을 누르면 `prompt=select_account`로 계정 선택을 요청한다. 로그아웃 뒤 표시되는 계정은 같은 페이지에서 마지막으로 확인한 정보다. 기존 GitHub 세션이 있으므로 매번 비밀번호 입력을 요구하지는 않는다. |
| GitHub 인증 화면이 404 | [OAuth Apps](https://github.com/settings/developers)의 발급 Client ID가 [Supabase Provider](https://supabase.com/dashboard/project/jmteohphohvjokpthusa/auth/providers)에 들어가 있는지 확인한다. `YangSeungYeol` 사용자 이름을 Client ID로 넣지 않는다. |
| 회원가입 확인 메일이 오지 않음 | Email Provider·Confirm email과 [이메일 발송 설정](https://supabase.com/docs/guides/auth/auth-smtp)을 확인한다. |
| 로그인은 되지만 목록 요청 실패 | 공개 `config.js`의 프로젝트와 실제 DB 프로젝트가 같은지, 기존 RPC·RLS가 적용되어 있는지 확인한다. 프로젝트의 [Supabase 관리 화면](https://supabase.com/dashboard/project/jmteohphohvjokpthusa)과 [RLS 공식 안내](https://supabase.com/docs/guides/database/postgres/row-level-security)를 참고한다. |
| 새 수정 내용이 보이지 않음 | [main 최신 커밋](https://github.com/YangSeungYeol/todo/commits/main/)과 Pages 게시 상태를 확인한 뒤 강력 새로고침한다. |
| SSH 푸시 오류 | [SSH 연결 공식 안내](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)와 `ssh -T git@github.com` 인증 계정을 확인한다. |

이 문서는 작업 절차를 정리한 것이며, 작성 시점에 실제 원격 저장소·Pages 설정을 변경하거나 배포 완료를 확인한 것은 아니다.
