# Centifolio

주식 이야기를 나누는 커뮤니티와 관심종목·수동 포트폴리오를 연결하는 앱. 현재 구현·배포 범위는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)를 참고한다.

[GitHub 저장소](https://github.com/lluvia373/centifolio) · [공개 웹](https://centifolio.stock-web-demo.workers.dev/)

## 문서 안내

| 내용 | 파일 |
| --- | --- |
| 작업·문서 작성 규칙 | [AGENTS.md](./AGENTS.md) |
| 기능·저장·계산 기준 | [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) |
| 구현·검증·배포·남은 작업 | [PROJECT_STATUS.md](./PROJECT_STATUS.md) |
| Cloudflare 배포·로그인 설정 | [CLOUDFLARE.md](./CLOUDFLARE.md) |
| 승인 로고·자산·재생성 | [BRAND.md](./BRAND.md) |

사업 계획은 로컬 전용 BUSINESS_MODEL.md에서 관리하며 공개 저장소에 포함하지 않는다. 파일이 없는 환경은 위 공개 문서를 따른다.

## 로컬 실행

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

http://127.0.0.1:3000 에서 확인한다. 의존성·명령은 [package.json](./package.json), 설치 버전은 [package-lock.json](./package-lock.json)이 기준이다.

계정 연결 없이 로컬 저장 모드로 시작할 수 있다. Google 로그인은 [.env.example](./.env.example)과 [연결 절차](./CLOUDFLARE.md#supabase-연결)를 따른다.

## 검증

```sh
npm run lint
npx tsc --noEmit
node --test tests/*.test.mjs
npm run build
npm run build:cloudflare
```

계산 전후 재현: `node tests/performance.test.mjs --benchmark` (실측 출력은 work/performance-benchmark.json). 고정 입력·기준 구현은 tests/reference, 이번 측정값은 [benchmark fixture](./tests/fixtures/performance-benchmark.json)에 있다.

브라우저 격리 검증은 `node tests/prepare-browser-qa.mjs` 후 `npm --prefix work/refactor-qa run dev -- --port 3001`로 실행한다. 실제 환경 변수와 계정 없이 QA 시세를 사용하는 별도 앱이며 `/qa-fixture`에서 테스트 백업·Worker 계산을 실행한다. `/qa-mobile`은 390px 프레임이다. 이 파일들은 공개 앱에 포함되지 않는다.

실제 검증 결과와 한계는 [PROJECT_STATUS.md](./PROJECT_STATUS.md#코드-구조-검토)에 기록한다. 운영 DB 증분 변경·복구는 [CLOUDFLARE.md](./CLOUDFLARE.md)를 따른다.

Windows에서 실제 PostgreSQL 두 연결의 저장 경합은 다음 별도 검사로 재현한다. 앱 의존성은 바꾸지 않으며 DB는 127.0.0.1:55439에서 실행 후 종료된다. 생성된 격리 데이터는 Git 제외 work 폴더에 남는다.

```sh
npm install --prefix work/pg-runtime embedded-postgres@18.4.0-beta.17 pg@8.23.0
node tests/postgres-concurrency.mjs
```

Windows에서 실제 PostgreSQL 두 연결의 저장 경합은 다음 별도 검사로 재현한다. 앱 의존성은 바꾸지 않으며 DB는 127.0.0.1:55439에서 실행 후 종료된다. 생성된 격리 데이터는 Git 제외 work 폴더에 남는다.

```sh
npm install --prefix work/pg-runtime embedded-postgres@18.4.0-beta.17 pg@8.20.0
node tests/postgres-concurrency.mjs
```
