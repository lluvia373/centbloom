# Centifolio

공개 시장 정보와 투자 읽을거리에서 관심종목·개인 포트폴리오로 이어지는 앱. 첫 공개 버전에는 회원 토론을 포함하지 않는다. 현재 구현·배포 범위는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)를 참고한다.

[GitHub 저장소](https://github.com/lluvia373/centifolio) · [공개 웹](https://centifolio.stock-web-demo.workers.dev/)

## 문서 안내

| 내용 | 파일 |
| --- | --- |
| 작업·문서 작성 규칙 | [AGENTS.md](./AGENTS.md) |
| 코드 지도·파일 역할·기능 추가 방법 | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| 거래소 일정 근거·지원 범위 | [MARKET_CALENDARS.md](./MARKET_CALENDARS.md) |
| 현재 제품 결정·범위·변경 이력 | [DECISIONS.md](./DECISIONS.md) |
| 기능·저장·계산 기준 | [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) |
| 구현·검증·배포·남은 작업 | [PROJECT_STATUS.md](./PROJECT_STATUS.md) |
| 구글 검색 조사·유입 계획 | [SEO_PLAN.md](./SEO_PLAN.md) |
| Cloudflare 배포·로그인 설정 | [CLOUDFLARE.md](./CLOUDFLARE.md) |
| 승인 로고·자산·재생성 | [BRAND.md](./BRAND.md) |
| 화면 문구·글꼴·크기·색상·간격·이미지·디자인 검사 | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| 공개 홈 경쟁 서비스 조사·회원 전환 제안 | [PUBLIC_HOME_RESEARCH.md](./PUBLIC_HOME_RESEARCH.md) |

사업 계획은 로컬 전용 BUSINESS_MODEL.md에서 관리하며 공개 저장소에 포함하지 않는다. 파일이 없는 환경은 위 공개 문서를 따른다.

코드를 수정할 때는 PROJECT_STATUS의 현재 상태/제약을 확인하고 [작업별 시작점](./DEVELOPMENT.md#작업별-시작점)에서 담당 파일과 테스트를 선택한다. [확장 절차](./DEVELOPMENT.md#코드-추가수정-절차)·[파일 역할](./DEVELOPMENT.md#파일-역할)을 필요할 때 읽고, 전체 소스나 과거 기록을 반복해서 읽지 않는다.

## 로컬 실행

프로젝트 루트에서 `npm run dev -- --hostname localhost --port 2000`으로 실행한다. 별도의 내부 작업 폴더는 사용하지 않는다.

## 로컬 실행

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

http://127.0.0.1:3000 에서 확인한다. 의존성·명령은 [package.json](./package.json), 설치 버전은 [package-lock.json](./package-lock.json)이 기준이다.

계정 연결 없이 로컬 저장 모드로 시작할 수 있다. Google 로그인은 [.env.example](./.env.example)과 [연결 절차](./CLOUDFLARE.md#supabase-연결)를 따른다.

## 검증

문서만 변경할 때는 `npm run check:docs`로 관리 목록·상대 링크·제목 앵커·사업 문서 Git 추적 여부를 검사한다. `npm run lint`도 이 검사를 먼저 실행한다. 문서 역할과 결정의 모순은 별도로 검토한다.

화면 변경은 `npm run check:design`으로 새 스타일 위반을 확인한다(lint에도 포함). `npm run audit:design`은 기존 미정리까지 포함해 전부 검사하며, 남아 있으면 실패한다. 기준·예외·수정 방법은 [디자인 기준](./DESIGN_SYSTEM.md#작성과-검사)을 따른다.

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
