# Cloudflare Workers 배포

최종 수정: 2026-09-05

Next.js App Router와 주가 API를 Cloudflare Workers/OpenNext에서 실행하기 위한 설정·배포 절차입니다. 실제 배포 완료 여부와 검증 기록은 [PROJECT_STATUS.md](./PROJECT_STATUS.md#환경별-진행-상태), 문서 수정 규칙은 [AGENTS.md](./AGENTS.md#문서-관리-기준)에서 관리합니다.

## 준비

- Node.js 22 이상과 npm
- Centifolio를 배포할 Cloudflare 계정
- `npm ci`
- 최초 한 번 `npx wrangler login`

## 실행 명령

```sh
npm run dev
npm run build:cloudflare
npm run preview:cloudflare
npm run deploy:cloudflare
```

`dev`는 기존 Next.js 개발 서버입니다. `preview:cloudflare`는 배포용 빌드를 만든 뒤 Workers 런타임에서 실행합니다. `deploy:cloudflare`는 빌드 후 [wrangler.jsonc](./wrangler.jsonc)의 Worker에 배포합니다. 처음 연결하는 계정에 같은 이름의 앱이 있다면 덮어쓰기 전에 프로젝트를 확인해야 합니다.

의존성 버전과 명령은 [package.json](./package.json), 설치 버전은 [package-lock.json](./package-lock.json)을 기준으로 합니다. Windows 로컬 검증의 대상 버전과 결과는 [PROJECT_STATUS.md](./PROJECT_STATUS.md#검증-기록)에 보존합니다.

## Supabase 연결

다음 공개 환경 변수는 **빌드 시점**에 필요합니다. 로컬에서는 Git에서 제외되는 `.env.local`에 설정하고, Cloudflare Git 자동 배포를 사용할 때는 Workers Builds의 빌드 변수에 설정합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

브라우저에 전달되는 값이므로 publishable 키만 사용합니다. `service_role`이나 비밀 키를 넣지 않습니다. 값을 변경하면 다시 빌드하고 배포해야 합니다. 변수가 없으면 앱은 기존 로컬 저장 모드로 동작합니다.

Google 로그인에는 활성 Supabase 프로젝트와 Google 제공자 설정이 필요합니다. Supabase Auth의 Site URL/Redirect URLs에는 실제 앱 주소를 설정합니다. 로컬 실행 시 사용하는 `http://127.0.0.1:3000`, Cloudflare 배포 후 실제 공개 주소를 각각 확인합니다. Google OAuth의 승인된 리디렉션 URI는 앱 주소와 구분하여 Supabase 대시보드에서 확인한 `/auth/v1/callback` 주소를 사용합니다.

## 저장소와 확인 기준

생성물·로컬 비밀 설정의 제외 기준은 [.gitignore](./.gitignore)입니다. 실제 `.env.local`과 비밀 키는 커밋하지 않습니다. 추적 중인 [.env.example](./.env.example)은 값 없는 설정 예시로 유지합니다.

배포 절차를 수행한 뒤 결과·공개 URL·남은 문제는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)에 반영합니다. 이 문서에 진행 일지를 중복해서 쌓지 않습니다.

참고: [Cloudflare Next.js 안내](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [OpenNext 시작하기](https://opennext.js.org/cloudflare/get-started), [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)
