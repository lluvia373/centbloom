# Centbloom

공개 시장 정보와 투자 읽을거리에서 관심종목·개인 포트폴리오로 이어지는 앱. 첫 공개 버전에는 회원 토론을 포함하지 않는다. 현재 구현·배포 범위는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)를 참고한다.

[GitHub 저장소](https://github.com/lluvia373/centbloom) · [공개 웹](https://centbloom.stock-web-demo.workers.dev/)

## 문서 안내

새 기능이나 수정 작업은 [현재 상태](./PROJECT_STATUS.md#환경별-진행-상태)를 확인한 뒤 아래 안내로 시작한다. 기능명 또는 코드 경로를 넣으면 읽을 명세·디자인·수정 위치·검증이 함께 나온다. 새 기능의 기록 위치와 완료 절차도 [DEVELOPMENT](./DEVELOPMENT.md#코드-추가수정-절차)에 있다.

```sh
npm run docs:guide -- 관심종목
npm run docs:guide -- src/features/watchlist/WatchStockButton.tsx
```

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

기본 작업 위치는 각 PC의 centbloom 원본 저장소의 로컬 `main`이다. 사용자가 해당 작업에 브랜치를 명시하면 같은 원본의 로컬 브랜치를 사용한다. 시작·수정·최종 보고 전에 실제 경로와 브랜치가 요청에 맞는지 확인하고 보고 첫 줄에 작업 브랜치를 표시한다. 명령·불일치/충돌 처리 기준은 [AGENTS 작업 원칙](./AGENTS.md#작업응답-원칙)을 따른다. 커밋·푸시·배포는 사용자 지시 범위에서 진행한다.

```sh
npm ci
npm run dev -- --hostname localhost --port 3000
```

http://localhost:3000 에서 확인한다. 의존성·명령은 [package.json](./package.json), 설치 버전은 [package-lock.json](./package-lock.json)이 기준이다.

계정 연결 없이 로컬 저장 모드로 시작할 수 있다. Google 로그인은 [.env.example](./.env.example)과 [연결 절차](./CLOUDFLARE.md#supabase-연결)를 따른다.

## 검증

**개발 중에는 검사를 기본 실행하지 않고, 푸시 직전에 모아서 실행한다.** 오류 해결에 필요한 최소 확인이나 사용자가 요청한 검사만 개발 중에 수행한다. 문서·테스트 수정은 구현과 함께 하며 아직 실행하지 않은 검사는 푸시 검증 대기로 기록한다. 파일 저장·개발 서버 시작·커밋에는 검사 훅을 두지 않는다.

각 PC에서 Git clone/pull로 최신 main을 받은 뒤 `npm ci`를 실행하면 prepare가 [푸시 훅](./.githooks/pre-push)을 자동 등록한다. ZIP 다운로드에는 Git 정보가 없어 훅을 등록할 수 없다. 현재 체크아웃에서 수동 등록하려면 `npm run hooks:install` 또는 `node tests/install-git-hooks.mjs`를 실행한다. 기존 다른 훅 설정이 있으면 덮어쓰지 않고 안내한다. CI와 Git 없는 배포 소스에서는 등록을 건너뛴다.

| 시점 | 실행 내용 |
| --- | --- |
| 개발 중 | 구현·문서 갱신. `docs:guide`는 검사 없이 기능 안내만 조회 |
| `git push` 직전 | 문서 연결 → 새 디자인 위반 → ESLint → 순환 참조 → 전체 기능/DB 테스트 → Next.js 생산 빌드(타입 검사 포함) |
| 검사 실패 | 푸시 중단. 문제를 수정·커밋하고 다시 푸시 |
| 푸시 이후 | 기존 Cloudflare 자동 배포에서 배포 환경 검사·OpenNext 빌드 수행. 운영 계정·실제 광고·브라우저 사용성 확인은 별도 |

검사 대상과 전송 코드가 같도록 현재 HEAD의 커밋만 검사한다. 커밋하지 않은 추적/미추적 파일이 있거나 다른 커밋을 전송하려 하면 중단한다(Git 제외 파일은 제외). 검사 중 코드가 바뀌어도 중단한다. 원격 참조 삭제나 보낼 변경이 없는 경우에는 검사를 생략한다. 전체 검사 명령 `npm run check:push`도 같은 조건으로 검사만 수행하며 커밋·푸시·배포를 실행하지 않는다.

문서 검사는 관리 목록·상대 링크·제목 앵커·기능별 명세/디자인/코드/검증 연결과 로컬 사업 검토값을 확인한다. 새 기능 폴더·페이지·API의 안내 등록이 빠지면 실패한다. 문장 의미·기존 파일 내부 기능 추가·화면 품질까지 자동 판단하지 않으므로 담당 문서 갱신은 에이전트의 [완료 절차](./DEVELOPMENT.md#코드-추가수정-절차)에 유지한다.

개별 진단이 필요하면 기존 `npm run lint`, `npm run check:docs`, `npm run check:design`, `node --test tests/*.test.mjs`를 사용할 수 있다. `npm run audit:design`은 기존 미정리까지 포함해 검사하므로 푸시 기본 검사가 아니다. 새 위반 0과 전체 준수를 구분한다. 실제 PostgreSQL 두 연결·브라우저·성능 실측은 아래 별도 절차를 필요할 때 실행한다.

계산 전후 재현: `node tests/performance.test.mjs --benchmark` (실측 출력은 work/performance-benchmark.json). 고정 입력·기준 구현은 tests/reference, 이번 측정값은 [benchmark fixture](./tests/fixtures/performance-benchmark.json)에 있다.

브라우저 격리 검증은 `node tests/prepare-browser-qa.mjs` 후 `npm --prefix work/refactor-qa run dev -- --port 3001`로 실행한다. 실제 환경 변수와 계정 없이 QA 시세를 사용하는 별도 앱이며 `/qa-fixture`에서 테스트 백업·Worker 계산을 실행한다. `/qa-mobile`은 390px 프레임이다. 이 파일들은 검증용 생성물이며 구현은 로컬 main 원본에서만 수정한다. 사용자에게 보여주는 최신 화면은 `localhost:3000`이다. 검증용 생성물은 공개 앱에 포함되지 않는다.

실제 검증 결과와 한계는 [PROJECT_STATUS.md](./PROJECT_STATUS.md#코드-구조-검토)에 기록한다. 운영 DB 증분 변경·복구는 [CLOUDFLARE.md](./CLOUDFLARE.md)를 따른다.

Windows에서 실제 PostgreSQL 두 연결의 저장 경합은 다음 별도 검사로 재현한다. 앱 의존성은 바꾸지 않으며 DB는 127.0.0.1:55439에서 실행 후 종료된다. 생성된 격리 데이터는 Git 제외 work 폴더에 남는다.

```sh
npm install --prefix work/pg-runtime embedded-postgres@18.4.0-beta.17 pg@8.23.0
node tests/postgres-concurrency.mjs
```
