# Cloudflare Workers 배포

현재 배포·환경 설정·복구 절차. 현재 승인 범위는 원본 main의 모든 변경이며, 이전 일부 파일 임시 후보가 아니라 원본에서 전체 pre-push 검사 후 GitHub 푸시·자동 배포를 진행한다. 검사·운영 DB 적용·푸시·배포의 완료 여부는 [PROJECT_STATUS](./PROJECT_STATUS.md#환경별-진행-상태)에서 확인하며 실행 결과와 이력을 여기에 누적하지 않는다.

Next.js·API를 Workers/OpenNext에서 실행한다. 실제 배포 상태는 [PROJECT_STATUS.md](./PROJECT_STATUS.md#환경별-진행-상태).

## 준비와 실행

Node.js 24.19.0·npm·Cloudflare 계정을 기준으로 한다. 로컬 푸시 검사도 자동 배포의 Node 버전과 맞춘다. Node 22.14.0에서는 TypeScript 파일을 직접 불러오는 기존 테스트가 실행되지 않으므로 검사 생략이나 코드 우회로 해결하지 않는다.

```sh
npm ci
npx wrangler login
```

아래는 순서대로 실행하는 단계가 아니라 용도별 선택 명령이다. `preview`와 `deploy`는 빌드를 포함하므로 `build`를 먼저 실행하지 않는다. 기본 배포는 승인된 GitHub 푸시 이후 자동 배포이며, 로컬에서 아래 세 명령을 연달아 실행하지 않는다.

| 목적 | 명령 |
| --- | --- |
| Cloudflare 빌드만 확인하도록 요청받은 경우 | `npm run build:cloudflare` |
| Workers 환경에서만 확인할 문제가 있는 경우 | `npm run preview:cloudflare` |
| 자동 배포 대신 직접 배포하도록 명시적으로 승인받은 경우 | `npm run deploy:cloudflare` |

- 로그인은 최초 연결 시 수행한다. 로컬 Next.js 개발은 `npm run dev`. Windows 기본 로그인 저장소는 `%APPDATA%/xdg.config/.wrangler`다. `XDG_CONFIG_HOME`을 별도 위치로 바꾸려면 실제 로그인 설정이 있는지 확인한다. 빈 폴더를 지정하면 원격 AI 프록시 인증이 실패한다. 대상 계정은 `wrangler.jsonc`의 account_id를 확인한다.
- preview는 빌드 후 로컬 Workers 실행, deploy는 빌드 후 [wrangler.jsonc](./wrangler.jsonc)의 Worker에 배포한다. 업로드 전에 대상 계정·Worker를 확인한다.
- 명령·의존성 기준은 [package.json](./package.json)·[package-lock.json](./package-lock.json). 검증 기록은 [PROJECT_STATUS.md](./PROJECT_STATUS.md#검증-기록).

## 센트블룸 주소와 이전 주소 종료

- 공개 주소는 https://centbloom.stock-web-demo.workers.dev 이다. .com은 구매·연결하지 않았다.
- 이전 centifolio Worker와 연결된 배포·버전·Git Builds는 삭제했으며 다시 배포하지 않는다. 계정 거래·DB·브라우저 저장 데이터와 이전 브랜드 데이터 호환은 별도이므로 보존한다. 이전 주소의 로컬 노트·관심종목은 새 주소로 자동 이전되지 않는다.
- 실제 서비스 Auth Site URL과 공개 Redirect URL은 센트블룸을 사용한다. 이전 공개 주소는 제거했다. 실제 서비스에 남은 localhost·127.0.0.1 허용 목록은 이번 로컬 작업에서 수정하지 않았으며, 새 개발 코드는 실제 저장소에 연결하지 않는다. 개발 로그인은 [별도 시험용 설정](#로컬-google-로그인)을 따른다.
- Git Builds: centbloom만 npm run lint, 전체 테스트, build:cloudflare를 거쳐 opennextjs-cloudflare deploy --keep-vars를 실행한다. 기존 Supabase 공개 빌드 값·NODE_VERSION=24.19.0을 유지한다.
- 로컬 전체 검사는 [README 검증](./README.md#검증)에 따라 pre-push 훅에 모으며 개발 중에는 변경 부분만 빠르게 확인한다. 배포 CI의 prepare는 로컬 훅 설치를 건너뛴다. 배포 환경에서 하는 검사와 OpenNext 빌드는 환경이 다른 필수 확인이므로 로컬 중복 검사로 간주해 제거하지 않는다.

## 문서 전용 변경

- 앱에서 사용하지 않는 루트 개발 문서만 바뀌면 로컬 pre-push는 문서 연결 검사만 실행한다. 정확한 허용 목록은 [deployment-docs-only.json](./scripts/deployment-docs-only.json) 하나로 관리한다. `.md` 전체·폴더 전체를 제외하지 않는다. 화면에서 읽거나 빌드 입력으로 쓰게 된 문서는 목록과 원격 제외 설정에서 먼저 제거한다.
- 훅은 마지막 커밋만 보지 않고 푸시 대상의 **원격 기준 커밋부터 현재 HEAD까지** 비교한다. 코드·설정·검사기·의존성·SQL·허용 목록 자체가 섞이면 기존 전체 검사를 유지한다. 새 브랜치·태그·원격 기준 부재·비정상 이력·차이 확인 실패·빈 차이는 전체 검사로 돌아간다. 미커밋 변경 차단은 문서 전용 푸시에도 적용하고, 수동 `npm run check:push`는 항상 전체 검사다.
- Cloudflare의 centbloom → Settings → Build → Build watch paths에서 Includes는 `*`, Excludes는 JSON의 정확한 파일 경로로 맞춘다. 기존 빌드·배포 명령, 브랜치, 캐시, 환경 변수·권한은 바꾸지 않는다. 제외 설정은 Git 파일 변경만으로 적용되지 않으므로 저장 뒤 재조회하고 실제 적용 여부는 [진행판](./PROJECT_STATUS.md#환경별-진행-상태)에 기록한다.
- [Cloudflare 경로 판정](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)은 제외되지 않은 변경이 하나라도 있으면 빌드한다. 빈 변경 이벤트·3,000개 이상 파일·20개 이상 커밋은 경로 판정을 생략하고 빌드하므로 모든 문서 푸시의 생략을 보장하지 않는다. 수동 재배포는 이 최적화와 별개다.
- 배포 후 결과 문서만 갱신할 때는 문서 검사·저장으로 끝내며, 새 앱 배포를 기다리거나 완료 보고를 위해 상태 문서를 다시 반복 갱신하지 않는다. 배포 설정 자체를 고친 커밋은 문서 전용이 아니므로 전체 검사 대상이다. 검사 로그는 성공 요약과 실패한 부분만 확인하고 동일 조건의 성공 검사를 수동으로 반복하지 않는다. 토큰·시간 절감률은 실측 없이 주장하지 않는다.

## 기업 자료 로컬 평가

FMP는 **로컬 평가용·기본 꺼짐**이며 Cloudflare 설정/스케줄러를 변경하지 않는다. [공급 명세](./PRODUCT_SPEC.md#기업-자료-공급-전환)를 먼저 확인한다. Node 24+에서 Git 제외 `.env.development.local`에 `FMP_API_KEY`와 `FMP_EVALUATION_ENABLED=true`를 설정한다. 공개 변수(`NEXT_PUBLIC_`)로 만들지 않는다. 무료 평가 키는 공개 서비스 표시·실시간 이용 권한을 대신하지 않는다.

```sh
npm run market:prepare:company -- --symbols=AAPL,MSFT --requests=20
npm run market:prepare:company -- --symbols=AAPL,MSFT --audit
```

- 종목당 기업 정보·현재 시세·일별 이력·배당·실적 5개 경로를 호출한다. 배당·실적은 무료 계정이 허용한 `limit=5`로 요청한다. 명시한 공급원 종목 코드만 처리하며 시장별 자동 매핑은 미검증이다. 기본 20회/실행(최대 4종목의 5종 자료), 재시작에도 보존하는 최대 200회/UTC 날짜 예산을 적용한다. 다른 도구의 같은 키 사용량은 포함하지 않으므로 공급원의 남은 한도를 보장하지 않는다. `--audit`은 외부 호출 없이 저장된 결과만 점검한다.
- `work/company-data/fmp/<종목>.json`과 `coverage.json`은 Git 제외 비공개 평가 파일이다. 기존 정상 자료는 실패/부분/모호한 정정에 덮어쓰지 않는다. 같은 수집기의 동시 실행을 막고 파일을 원자적으로 교체한다. `coverage.json`의 성공은 전체 종목·실시간·화면 표시 완료 판정이 아니다. 요청 자료 미확보는 종료 코드 2, 설정/파일 검사 오류는 1로 구분한다.
- 앱이 개발 모드이고 평가 플래그가 켜져야 준비된 배당·실적을 읽는다. 공개 폴더에 복사하거나 생산 빌드에서 파일을 읽지 않는다. 키/플래그 변경 후 개발 서버의 환경 설정 다시 읽기를 확인하고, 반영되지 않을 때만 재시작한다. 현재 가격·차트의 기존 공급원은 자동 전환하지 않으며 FMP 원자료를 개인 예상 배당에 합치는 작업도 별도다. 공급 확인 전 운영 배포·정기 수집·유료 전환 없음.

## 일별 환율 공통 저장소

- 기존 NEWS_CACHE 바인딩 안의 `fx:ecb-krw:v1:` 전용 키를 사용한다. 뉴스 키·개인 계좌·Supabase 테이블을 수정하지 않으며 새로운 유료 서비스나 저장소를 개설하지 않는다. 운영 KV 사용량은 기존 계정 할당량과 합산된다.
- 첫 조회 또는 배포 후 정기 실행이 ECB 전체 XML을 읽어 연도별 원화 환율 묶음을 저장한다. 연도별 저장 성공 후 완료 색인을 기록하며 원본 자료·키에 만료를 두지 않는다. 이후 기존 5분 cron이 갱신 필요를 확인하되 실제 최근 90일 수집은 최소 1시간 간격이다. 마지막 저장 발표일이 85일 이상 오래됐으면 전체 이력으로 재수집해 장기 중단 공백을 복구한다. 로컬 next dev는 요청 시 준비·갱신하고 정기 실행은 하지 않는다.
- 운영 데이터는 Cloudflare KV에, 개발 데이터는 OpenNext의 로컬 KV에 저장된다. 로컬에서 준비한 데이터가 운영에 이미 반영됐다는 뜻은 아니다. 스토어 바인딩 없이 메모리만으로 동작하면서 영구 저장됐다고 보고하는 대체 동작은 없다.
- ECB 수집 실패 시 기존 정상 이력은 유지하며 자료가 없는 평가일만 오류로 처리한다. 저장 도중 실패한 최초 수집은 완료로 표시하지 않는다. KV는 지역별 전파 지연과 동시 갱신 경합이 가능한 저장소이며 전역 원자적 거래를 보장하지 않는다. 조회 때 날짜·통화·휴일·유효값을 다시 검사한다. 최근 정정은 90일 범위에서 갱신하며 더 오래된 공급자 정정 자동 동기화는 미지원이다.
- 출처·사용 기준(2026-09-21 확인): [ECB 일별 기준환율](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), [전체 XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml), [90일 XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml), [ECB 이용 조건](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html). ECB 출처·자체 원화 환산 방식은 계산 명세와 API의 출처·기준 통화 메타데이터에 보존한다. 제품 화면의 간결한 표시는 [기간 성과 디자인](./DESIGN_SYSTEM.md#보유자산-세부-다듬기-검토)을 따르며 공급처 설명·기준일 목록을 반복하지 않는다. 실제 환전 거래용 가격으로 보장하지 않으며 유료화 시 무료 원자료 안내 조건을 다시 검토한다. 사업 문서 원본이 없는 현재 환경에서는 별도 사업·최종 운영 비용 검토는 미완료다.

## 뉴스 제목 자동 번역

- wrangler.jsonc의 NEWS_AI 바인딩을 사용한다. 모델은 [Cloudflare GPT OSS 120B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)이며 공개 기사 제목만 전송한다. 개인 거래/계정 정보·기사 본문은 전송하지 않는다. 별도 OpenAI API 키는 사용하지 않는다.
- 로컬 next dev는 OpenNext의 개발 프록시를 초기화한다. Wrangler 로그인에 AI 권한이 필요하고 remote 바인딩이므로 **로컬 번역도 실제 Cloudflare AI 사용량**에 포함된다. 생산 빌드는 이 개발 프록시를 시작하지 않는다. 공급 오류/사용량 한도/바인딩 미설정 시 원문 뉴스는 유지한다.
- 동시 추론·출력 한도·작업 마감·캐시·재시도 기준은 [번역 명세](./PRODUCT_SPEC.md#주요뉴스와-번역)를 따른다. 운영에서는 캐시 적중·할당량 초과·실제 사용량을 확인한다. 대기 종료나 소비자 취소가 이미 전송한 추론까지 중단하지 않으므로 사용량을 요청 대기 시간만으로 계산하지 않는다.
- 성공한 제목 번역은 KV로 인스턴스 간 공유한다. 지역별 전파 지연·동시 미수집 제목의 중복 추론 가능성은 남는다. [Workers AI 요금](https://developers.cloudflare.com/workers-ai/platform/pricing/) 기준으로 계정 대시보드 사용량을 확인하며 무제한 무료로 표현하지 않는다.
- 롤백은 PROJECT_STATUS에서 확인한 정상 Worker 버전으로 복귀하고 정기 수집 트리거를 비활성화한다. 뉴스 KV는 보존하며 원문 데이터·운영 DB를 수정하지 않는다.

## AdSense 연결 준비

공개 화면은 광고 위치와 개발 전용 미리보기 상태이며 운영 빌드에서는 숨긴다. `/portfolio`의 예약 영역·조건부 송출 코드는 [AdSense 연결](#adsense-연결)을 따른다. 실제 publisher/slot ID·ads.txt·송출은 미연결이다.

1. AdSense 계정에서 사용할 공개 도메인의 사이트 승인 상태를 확인한다. [D010](./DECISIONS.md#현재-유효한-결정)에 따라 오른쪽 사이드 광고를 사용하고 추가 광고도 도입하되, 추가 페이지·위치·개수·모바일 형식은 아직 미정이다. 현재 본문 하단 3개와 포트폴리오 예약 영역을 확정 배치로 간주하지 않는다. 추가 배치는 결정 후 [광고 명세](./PRODUCT_SPEC.md#광고-배치)를 갱신하고 필요한 단위만 발급한다.
2. 확정된 수동 배치가 있으면 발급받은 publisher ID와 단위 ID로 features/ads의 같은 AdSlot 경계에 송출을 연결한다. 계정이 제공하는 정확한 ads.txt 항목을 public/ads.txt에 등록한다. 현재는 값을 추정해 파일/환경변수를 만들지 않았다.
3. 사이드 광고는 오른쪽만 사용하도록 자동 광고의 사이드 레일 설정을 연결한다. 왼쪽 광고는 활성화하지 않으며 SideRailPreview의 오른쪽 박스에 수동 광고를 넣지 않는다. 로컬 박스는 공식 사이드 레일의 위치 예시이며 실제 노출/크기는 Google이 결정한다. 실제 데스크톱에서 사이드바·본문·닫기 버튼을 가리지 않는지 확인하고 공간이 부족하면 사이드 광고를 숨기거나 해당 경로를 제외한다. 자동 광고의 개인 자산/거래/노트/설정 경로 제외와 SPA 경로 이동 시 해제도 검증한다. 자동 본문/앵커/전면 광고가 기존 배치 외에 중복 추가되지 않게 설정한다. 개인정보 고지·필요한 동의 설정과 광고의 공개 표시 조건을 실제 배포 대상 기준으로 확인한다.
4. 로컬/테스트 트래픽은 계속 미리보기만 사용한다. 실제 슬롯은 공유 스크립트 1회 로드·가시 영역/유효 너비 확인·단위당 1회 초기화·미충전/오류 처리를 검증한 뒤 사용자 배포 지시에 따라 공개한다.
5. 실제 서비스의 단위별 노출·뷰어빌리티·RPM과 콘텐츠 사용/로딩 성능을 비교한다. 배치만으로 수익이 발생했다고 기록하지 않는다.

근거: Google [사이드 레일](https://support.google.com/adsense/answer/16531757), [좌우 설정](https://support.google.com/adsense/answer/9305577), [수동 sticky 조건](https://support.google.com/adsense/answer/10734935), [가시성과 수익](https://support.google.com/adsense/answer/4510652), [광고 배치 정책](https://support.google.com/adsense/answer/1346295?hl=en), [반응형 크기 변경 안내](https://support.google.com/adsense/answer/9183363?hl=en). 2026-09-06 확인. 현재 미리보기 CSS는 실제 광고 코드가 아니며 연결 때 Google 허용 형식을 적용해야 한다.

## Supabase 연결

**빌드 시점**에 필요한 공개 변수다. Git 자동 배포는 Workers Builds에 실제 서비스 값을 설정한다. 로컬 시험 값은 생산 빌드에 자동 포함되지 않는 `.env.development.local`에만 둔다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

- 브라우저 공개 값이므로 publishable 키만 사용한다. `service_role`·비밀 키 금지. 로컬 값 변경 후 개발 서버를 다시 시작하고, 배포 빌드 값 변경은 재빌드·재배포가 필요하다. URL과 키가 모두 없을 때만 기존 브라우저 저장 모드이며, 일부 누락·잘못된 키·잘못된 프로젝트 연결은 오류로 중단한다.
- 실제 서비스 Google 로그인은 실제 서비스 Supabase Google 제공자와 `https://centbloom.stock-web-demo.workers.dev` 반환 주소를 사용한다. 로컬 개발용 Google 프로젝트/키와 혼용하지 않는다.
- Google OAuth 리디렉션 URI는 앱 주소가 아니라 Supabase 대시보드의 `/auth/v1/callback` 주소다.

### 로컬 Google 로그인

**목표:** `http://localhost:3000`에서 평소 Google 계정으로 로그인하되, 거래·관심종목은 실제 사이트와 다른 시험용 저장소에 보관한다. 같은 이메일을 사용해도 두 프로젝트의 계정·자료는 별개다. 외부 Google 설정과 실제 왕복 완료 여부는 [T02·T04](./PROJECT_STATUS.md#작업별-진행판)를 먼저 확인한다.

| 구분 | 실제 사이트 | 내 컴퓨터 시험 |
| --- | --- | --- |
| Supabase 프로젝트 | centbloom · `cvuqzetasndsjtpaqbmr` | centbloom-dev · `tocdnobpkbpczjzbenbd` |
| 주소 | `https://centbloom.stock-web-demo.workers.dev` | `http://localhost:3000` |
| 설정 위치 | Workers Builds의 공개 URL·키 | Git 제외 `.env.development.local` |
| 자료 | 실제 계정 기록 | 빈 저장소에서 시작. 실제 계정·거래·관심목록은 복사하지 않음 |

#### 최초 연결

1. 시험용 Supabase에 거래·관심목록·구루 저장/알림의 기존 스키마를 준비한다. 누락됐던 최초 스키마 두 파일은 실제 서비스의 migration 기록에서 복원했으며 새로운 구조로 바꾼 것이 아니다. `20260809042243_create_portfolio_storage` → `20260809114515_add_portfolio_performance_snapshots` → `atomic_portfolio_ledger` → `account_watchlists` → `guru_notifications` 순서를 따른다. 미연결 경제 캘린더 migration은 이 로그인 시험에 적용하지 않는다. 사용자 데이터 덤프·실제 계정 복제·가짜 영구 기록을 넣지 않는다.
2. Google Cloud 시험용 프로젝트는 `Centbloom Development` · `centbloom-development`다. 결제 계정 없이 만들었으며, Google Auth Platform의 같은 앱 이름·외부 시험 대상·사용자 승인 정책 동의까지 저장했다. 로그인에 필요한 `openid`·이메일·프로필만 사용하며 Gmail/Drive 권한을 추가하지 않는다. 필요한 시험 사용자를 등록한다.
3. 그 프로젝트에서 웹 애플리케이션용 OAuth 클라이언트를 만든다. 자바스크립트 출처는 `http://localhost:3000`, 승인된 리디렉션 URI는 `https://tocdnobpkbpczjzbenbd.supabase.co/auth/v1/callback`이다. **기존 실제 서비스 클라이언트는 수정하지 않는다.** 발급된 Client ID·Client Secret은 시험용 Supabase의 Authentication → Sign In / Providers → Google에 직접 입력·저장한다. Client ID는 앞의 숫자와 하이픈까지 포함한 전체 값을 복사한다. `Google · Enabled` 확인은 활성화 확인일 뿐이며 실제 로그인 왕복 성공과 구분한다. 비밀키는 대화·Git·브라우저 공개 변수에 넣지 않는다.
4. 시험용 Supabase Auth의 Site URL은 `http://localhost:3000`을 사용한다. 현재는 이 주소 하나로 시험한다. 다른 포트·127.0.0.1·휴대폰 LAN 주소를 쓰려면 Google/Supabase 반환 허용 목록을 먼저 일치시킨다. 전체 주소를 허용하는 와일드카드는 사용하지 않는다.
5. 저장소 루트 `.env.development.local`에 시험용 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF=tocdnobpkbpczjzbenbd`를 넣고 `npm run dev -- --hostname localhost --port 3000`으로 실행한다. 이 Mac에는 시험용 공개 연결 값을 준비했다. 파일은 Git 제외이므로 다른 PC에서는 별도로 설정한다. Google 비밀키·관리자 키는 이 파일에 필요하지 않다.

#### 사용하는 방법

1. `http://localhost:3000`에서 우상단 로그인 또는 관심 저장/거래 기록을 누른다.
2. Google 계정을 선택한다. 처음이면 **시험용 계정**이 만들어지고 시작했던 종목/행동으로 돌아온다.
3. 화면의 계정을 확인하고 직접 저장을 누른다. 새로고침·로그아웃 후 재로그인으로 유지되는지 확인한다. 시험용 거래 수정/삭제도 여기서만 한다. 실제 사이트에서 시험 삭제를 하지 않는다.
4. 기존 비로그인 로컬 시험 자료는 삭제·자동 업로드하지 않는다. 개발 프로젝트 접두어 안의 별도 브라우저 기록을 쓰므로 예전 8종목이 새 계정에 자동으로 나타나지 않는 것이 정상이다. 필요하면 기존 자료를 백업한 뒤 명시적 가져오기를 사용한다. 투자 노트는 아직 해당 계정·해당 브라우저에만 저장하며 기기 간 동기화를 보장하지 않는다.

#### 분리와 실패 기준

- 로컬·개발 실행에서 실제 서비스 프로젝트를 사용하거나 시험용 ID와 URL이 다르면 SDK 연결·하위 저장 화면을 차단한다. 배포 주소에 시험용 프로젝트를 넣어도 차단한다. 공개 키 형식 확인은 서버의 키 유효성/권한 검증을 대신하지 않는다.
- 개발 프로젝트가 지정된 경우 거래 캐시·대기/복구·성과 사본·관심목록·노트·통화·최근 검색·로그인 복귀를 프로젝트별로 분리한다. 운영과 설정 없는 기존 로컬 키는 보존한다. 오류를 무시하고 다른 저장소나 비회원 저장으로 성공 처리하지 않는다.
- 시험용 DB의 관리 도구 적용 시각과 원본 SQL 파일의 과거 버전 이름은 다를 수 있다. 같은 이름·내용의 다섯 변경이 적용됐는지 먼저 대조하며, 버전 차이만 보고 전체 재적용·초기화·이력 덮어쓰기를 하지 않는다.
- Google 제공자 미설정·반환 주소 오류는 설정을 고친 뒤 다시 로그인한다. 로그인 성공으로 자동 저장하지 않으며 취소·실패·계정 전환 시 원래 계정에 저장됐다고 표시하지 않는다.
- 개발 저장소는 현재 무료 요금제로 개설했다. 유료 전환·새 비용은 별도 승인 대상이다. 무료 프로젝트의 비활성 일시 정지·백업 제한을 실제 서비스 안정성 보장으로 해석하지 않는다.

근거(2026-09-24 확인): [Supabase Google 연결](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google 개발·실제 서비스 프로젝트 분리 정책](https://developers.google.com/identity/protocols/oauth2/policies), [요금·프로젝트 한도](https://supabase.com/docs/guides/platform/billing-on-supabase). 코드/검사 시작점은 [로그인 연결](./DEVELOPMENT.md#로그인-복귀구루알림의-시작점)을 따른다.

구루/앱 안 알림의 [증분 SQL](./supabase/migrations/20260923030710_guru_notifications.sql)은 원본 main 전체 배포 범위에 포함하며 운영 centbloom에 적용하고 스키마·RLS·함수/직접 쓰기 권한을 확인했다. 상세 근거와 남은 보안 경고는 [진행 상태](./PROJECT_STATUS.md#검증-기록)의 기존 알림 행을 따른다. 실제 계정 쓰기·다중 기기는 미검증이다. GitHub/Cloudflare 앱 배포만으로 DB 변경이 적용되지는 않으므로 기존 `auth.users`와 계정 관심목록 migration 이후의 적용 여부, RLS·계정별 읽기/저장·영수증·복구를 별도로 확인한다. 공개 사건 기록 함수는 신뢰된 서버 `service_role`에만 허용하고 브라우저에는 권한/비밀 키를 주지 않는다. 현재 수집기/예약 실행/메일·푸시 공급은 연결하지 않았으며 앱·DB 배포를 사건 자동 수집 완료로 해석하지 않는다.

## AdSense 연결

`/portfolio`는 기본적으로 광고 예약 영역을 표시하며 실제 광고 요청은 비활성이다. 아래는 기존 코드의 연결 방법이며 이 위치의 최종 채택은 미정이다. 배치가 확정되면 아래 공개 변수를 **빌드 시점**에 설정한다.

```dotenv
NEXT_PUBLIC_ADSENSE_CLIENT_ID=
NEXT_PUBLIC_ADSENSE_PORTFOLIO_SLOT=
NEXT_PUBLIC_ADSENSE_PORTFOLIO_ENABLED=false
```

1. AdSense에서 사이트 승인과 디스플레이 광고 단위 발급을 완료한 뒤 `ca-pub-…` 게시자 ID와 `data-ad-slot` 값을 넣는다. ads.txt 항목은 계정에서 제시한 값으로 설정/검증한다.
2. [로그인 보호 페이지 광고 안내](https://support.google.com/adsense/answer/161351?hl=ko)에 따라 광고 크롤러 접근을 준비한다. 현재 Google 로그인만으로 이 조건이 해결됐다고 간주하지 않는다. 실제 개인 계정의 로그인 정보/투자 기록을 제공하거나 인증을 우회하지 않고 별도 접근 설계를 검토한다.
3. 개인정보/쿠키 고지와 적용 지역의 동의 설정을 확인한 후 `NEXT_PUBLIC_ADSENSE_PORTFOLIO_ENABLED=true`로 바꾸고 재빌드·배포한다. 개발 모드는 `data-adtest=on`을 사용한다.
4. 공개 사이트에서 실제 송출·모바일 배치·크롤러 오류를 확인한다. 모의 광고 검사는 실제 승인/송출 검증이 아니다. 중단은 활성화 변수를 false로 변경 후 재빌드·배포한다.

## 거래 저장 원자성 업데이트

[마이그레이션](./supabase/migrations/20260905225656_atomic_portfolio_ledger.sql)은 기존 거래·설정·스냅샷 테이블용 증분 변경이다. 운영 적용 버전·검증 상태는 [PROJECT_STATUS](./PROJECT_STATUS.md#환경별-진행-상태)를 따른다. 새 프로젝트 전체 초기 스키마가 아니며 이미 적용된 파일을 다시 실행하지 않는다.

1. 프로젝트 ID·migration 이력·테이블 컬럼/제약·소유자 RLS를 확인한다. 다른 미적용 변경을 함께 실행하지 않는다. 기존 환율·초과 매도·같은 날짜/생성시각 거래의 순서를 점검한다.
2. 해당 마이그레이션은 같은 트랜잭션에서 세 테이블의 쓰기를 잠시 잠그고, 기존 값을 centbloom_release_backup 스키마에 복사한 뒤 DDL을 적용한다. 이 스키마는 Data API에 노출하지 않고 public/anon/authenticated/service_role의 접근을 취소한다. 백업 테이블은 RLS를 켜고 사용자 정책을 만들지 않는다. 개인 기록을 PC로 반출하지 않는다. 이 사본은 마이그레이션 복구용이며 DB 전체 손실에 대비한 별도 백업을 대신하지 않는다.
3. 격리 SQL 테스트와 실제 PostgreSQL 두 연결 검사로 원자적 교체·실패·RLS·40001 충돌·응답 유실 재시도·롤백 후 사본 보존을 검증한다. [합성 계정 SQL](./supabase/tests/atomic-ledger-smoke.sql)은 격리 DB용이며 운영에서 자동 실행하지 않는다.
4. 운영 적용은 연결된 Supabase 관리 도구의 apply_migration 또는 CLI에서 대상 SQL을 확인한 뒤 수행한다. 관리 도구가 발급한 migration 버전과 저장소 파일 이름을 일치시킨다. CLI를 사용할 때도 migration list → db push --dry-run으로 확인하고, 과거 원격 이력이 로컬에 없는 이 저장소에서 전체 push를 무조건 실행하지 않는다.
5. 운영에는 원본/사본 비교 결과와 함수 실행 권한을 읽기 전용으로 확인한다. 앱 빌드·배포 후 공개 페이지/API를 검증한다. 실제 로그인 후 쓰기·다중 기기 검증은 별도 결과로 기록하고 격리 테스트로 대체했다고 표시하지 않는다.

복구: 우선 앱의 거래 쓰기를 중단하고 정상 버전과 DB 백업을 확보한다. 거래 데이터 자체를 되돌릴 필요가 없으면 [스키마 롤백](./supabase/rollback/atomic_portfolio_ledger.sql)을 관리 연결에서 실행할 수 있다. 이 파일은 거래 행을 삭제하지 않지만 revision·안정 정렬·요청 영수증을 제거한다. **먼저 영수증과 각 브라우저의 미확인 요청을 보존·정리하고 모든 새 쓰기 클라이언트를 중단해야 한다.** 영수증 삭제 후 미확인 요청을 재전송하면 중복 실행 위험이 있다. 롤백 후 자동으로 이전 쓰기 방식을 재개하지 말고 동시성 문제를 해소한 버전을 사용한다. 실제 데이터 복원은 백업 시점 이후 정상 거래와 대조한 별도 절차다. advisory lock 트리거는 auth.uid 없는 직접 거래 DML을 거부하므로 관리 작업은 점검 시간에 수행한다.

### 여러 포트폴리오·가격 알림 연결 — 미적용

이번 구현은 로컬 파일만 변경했다. [포트폴리오 migration](./supabase/migrations/20260924035408_multi_portfolio_workspace.sql)과 [가격 알림 migration](./supabase/migrations/20260924035345_watchlist_price_alerts.sql)은 개발/운영 DB에 아직 적용하지 않았으며, Git 푸시만으로 적용되지 않는다. 이후 연결을 승인받으면 먼저 프로젝트와 적용 이력을 확인해 해당 두 변경만 적용한다. 기존 거래 ID·수량·가격·건수와 기본 포트폴리오 귀속을 전후 대조하고 반복 이관·계정별 권한·원자적 이동/삭제를 확인한다. 기존 migration 전체 재실행은 하지 않는다.

가격 확인 API는 같은 프로젝트의 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`가 필요하며 공개 환경변수·브라우저·Git에 넣지 않는다. 실제 로그인 계정에서 조건 저장→정상 시세 기준 상태→경계 통과→한 번 배달→읽음→재진입을 검증한 뒤 연결 완료로 표시한다. 운영 비접속 알림은 별도의 수집 스케줄러·실제 무료 공급 최신성/권리·실패 감시 검증 전 보장하지 않는다. 현재 브라우저 확인 요청은 운영 예약 수집을 대체하지 않는다. [좁은 검사와 구현 시작점](./DEVELOPMENT.md#여러-포트폴리오가격-알림의-시작점), [현재 상태](./PROJECT_STATUS.md#작업별-진행판)를 따른다.

## 관심종목 계정 저장

[관심종목 migration](./supabase/migrations/20260912112710_account_watchlists.sql)은 기존 Supabase 프로젝트에 관심종목/요청 영수증 테이블과 계정 RPC만 추가한다. 기존 거래·노트는 바꾸지 않는다. 적용 여부·실계정 검증은 [현재 상태](./PROJECT_STATUS.md#환경별-진행-상태)를 따른다. 전체 migration 일괄 적용 대신 원격 이력을 대조하고 해당 변경만 적용하며, 관리 도구가 발급한 버전과 로컬 파일 이름을 맞춘다. 이미 적용된 SQL은 재실행하지 않는다.

사용자 행은 소유자 RLS를 적용하고 익명 접근을 차단한다. 삭제 표식과 요청 영수증은 오래된 기기 이관/응답 유실 재시도에 필요하므로 임의 삭제하지 않는다. 앱 되돌리기 시에도 서버 기록을 보존하고 브라우저의 이전 사본으로 서버 전체를 덮어쓰지 않는다. 실제 추가·목표가·삭제·재접속·다중 기기는 별도 검증한다.

## 저장소와 확인 기준

- 실제 `.env.local`·비밀 키는 커밋하지 않는다. [.env.example](./.env.example)은 값 없는 예시, 생성물 제외는 [.gitignore](./.gitignore)를 따른다.
- 배포 후 공개 URL·대상 버전·실제 응답·남은 문제를 PROJECT_STATUS.md에 기록한다. Git 푸시나 로컬 빌드만으로 배포 완료라 하지 않는다.

공식 참고: [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) · [OpenNext](https://opennext.js.org/cloudflare/get-started) · [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 경제 캘린더 결과 수집 — 준비 상태

실제 자동 수신·운영 테이블·수집 프로세스는 미연결이다. 등록 일정·수동 확인 결과와 자동 공급을 구분하며 현재 화면 범위는 [캘린더 명세](./PRODUCT_SPEC.md#증시-캘린더와-발표-상세), 연결·검증 상태는 PROJECT_STATUS를 따른다. 아래 공급자 자료의 확인일은 2026-09-06이며 계약 전에 다시 확인한다.

| 후보 | 확인된 적합성 | 남은 확인 |
| --- | --- | --- |
| Trading Economics (우선 검토) | [공식 스키마](https://docs.tradingeconomics.com/economic_calendar/schema/)에 CalendarID, UTC 발표시각, Actual, Forecast(컨센서스), Previous, Revised(이전치 수정 전), Symbol, LastUpdate가 명시돼 있다. [기간별 조회](https://docs.tradingeconomics.com/economic_calendar/country/)와 [스트리밍](https://docs.tradingeconomics.com/economic_calendar/streaming/)을 제공하며 현재 어댑터는 이 계약을 따른다. | API 키·선택 국가/이력 범위·공개 웹 표시/누적 보관 권한·실측 지연·취소/동일 시각 수정 정책·견적 확인 필요. [가격 페이지](https://tradingeconomics.com/api/pricing.aspx)에서 현재 고정 금액을 확인하지 못했으므로 금액은 기재하지 않는다. |
| Financial Modeling Prep | [경제 일정 API](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)가 있다. 주가와 여러 데이터 API를 함께 검토할 때 비교 후보. | 공개 문서에서 현 응답 전체·안정적인 발표 ID/수정 이력·컨센서스 범위를 확인하지 못했다. 샘플 응답·상업용 견적을 받은 후 결정한다. 현재 어댑터는 미구현. |
| 발표기관 원문 | BLS·BEA·연준·Census 일정은 현재 25개 등록 항목의 확인 출처다. | 지금 연결한 일정표만으로 컨센서스/결과 수집·장기 이력이 제공되는 것은 아니다. 발표기관별 수집은 별도 구현이 필요하다. |

견적 요청 범위: 미국 우선(한국·일본·홍콩·중국 확장 비용 별도), 실제치·시장 컨센서스·이전치·수정치, 지표별 안정적 ID와 단위/기준 기간, 최소 5년 이력, 공개 웹 표시와 수집 자료 보관, 속보 지연과 요청 제한. 현재 수집안은 5분마다 지난달/이번달/다음달 3회 조회로 하루 약 864회이며 UI 조회는 공급 API 호출을 추가하지 않는다. 이는 비용 확인용 예상 요청 수로 실제 지연·요금 측정값이 아니다.

### 활성화 순서

1. 공급 계약/키를 확보하고 테스트 환경에 [마이그레이션](./supabase/migrations/20260906140000_economic_calendar.sql)을 적용한다. 신규 경제 데이터만 생성하며 사용자 거래 테이블을 변경하지 않는다. 먼저 `node --test tests/sql-economic-calendar.test.mjs`로 로컬 Postgres 호환 검증을 실행한다.
2. 서버 전용 환경에 `TRADING_ECONOMICS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, 충분히 긴 무작위 `CALENDAR_SYNC_SECRET`, `CALENDAR_ARCHIVE_ENABLED=true`를 설정한다. 기존 Supabase URL/publishable key도 필요하다. 비밀 키에 NEXT_PUBLIC 접두사를 붙이지 않는다. 로컬의 .env.local과 배포 비밀 설정은 별개이며 키를 Git에 넣지 않는다.
3. 로컬 서버가 실행 중일 때 `node --env-file=.env.local scripts/sync-economic-calendar.mjs --month=2026-09`로 한 달을 수집한다. 수신→완료 표시→예상/실제/이전치→같은 seriesKey의 과거 결과를 공급 샘플과 대조한다. 과거 월은 해당 옵션으로 순차 보충한다.
4. 자동 수집은 `node --env-file=.env.local scripts/sync-economic-calendar.mjs --watch`를 지속 실행한다. `CALENDAR_SYNC_BASE_URL` 기본값은 localhost:3000. 배포 후에는 별도 상시 프로세스/스케줄러가 필요하며 사용자 브라우저의 열림 여부와 분리한다. 현재 이 프로세스는 실행하지 않았다. 지난달보다 오래된 지표의 추가 수정은 과거 월을 다시 수집해야 한다.
5. 실제 수신/수정/저장 실패를 검증한 다음에만 운영 DB 마이그레이션·환경 설정·수집 프로세스·공개 배포를 승인 범위에 따라 활성화한다. 읽기 GET은 저장소만 조회하고, 쓰기는 별도 비밀 토큰이 필요한 POST /api/calendar/sync만 허용한다. 키 없는 상태에서 401/503을 반환하며 데모 자격 증명을 자동 사용하지 않는다.

원자적 배치 저장, 발표 ID 중복 제거, 공급자 갱신 시각이 오래된 응답 차단, 숫자 0 보존을 적용한다. 최신 값과 수정 원문은 별도 테이블에 보관한다. 동일한 공급자 갱신 시각에 내용만 달라지면 버전 원문은 추가 보관하되 기존 최신 값을 자동 교체하지 않는다. Forecast와 TEForecast를 섞지 않는다. 과거 화면의 예상치는 공급자가 반환해 저장한 컨센서스이며 실제 발표 직전의 수치를 포착했다고 보장하지 않는다.

문제 발생 시 수집 프로세스를 먼저 종료하고 CALENDAR_ARCHIVE_ENABLED를 끈다. [복구 SQL](./supabase/rollback/economic_calendar.sql)은 읽기/수집 권한만 회수하고 이미 쌓인 기록을 삭제하지 않는다. 서비스 재개는 데이터 검증 뒤 권한을 복구해 진행한다. 공급자 취소/철회가 실제치 없는 응답만으로 표현되면 기존 완료 값을 지우지 않으므로 명시적인 취소 상태 제공 여부를 계약 검증에서 확인한다.

## 뉴스 미리 준비

- `wrangler.jsonc`의 `NEWS_CACHE` KV와 `custom-worker.ts`의 5분 Scheduled Handler를 사용한다. 홈 뉴스와 변화 카드의 종목별 조사는 독립적으로 실행하며 OpenNext fetch 처리를 유지한다. 운영 namespace ID는 설정 파일, 실제 활성 버전과 수집 검증은 PROJECT_STATUS를 따른다. 로컬은 로컬 저장소를 사용한다.
- 개발 서버가 실행된 상태에서 `npm run news:prepare -- AAPL`로 홈 변화 카드·홈 뉴스와 지정 종목 뉴스를 준비한다. `npm run news:prepare -- --watch AAPL`은 브라우저 방문 없이 로컬 3000에 5분마다 준비 요청을 보낸다. 개발 서버가 닫히면 연결 실패 시 종료한다. 운영에서는 이 PC 프로세스가 아니라 Scheduled Handler를 사용한다.
- 첫 수집·번역이 끝나야 빠른 최초 표시가 가능하다. 운영 전 홈과 주요 종목을 준비한 후 확인한다. KV 지역별 갱신 전파·최초 읽기 지연이 있어 0.5초를 저장소 설정만으로 보장하지 않는다. 모은 목록 6시간·성공 제목 7일 보존, 실제 수집 5분/화면 확인 1분을 구분한다. KV 읽기/쓰기·AI 사용량은 운영 활성화 전에 요금과 한도를 확인한다.

## 공개 시세 사전 준비

**현재 로컬 구현, 운영 비활성.** 새 리소스 생성·요금제 변경·운영 바인딩·배포를 하지 않았다. 개발 서버는 최근 조회된 종목을 자체 예약 실행으로 준비한다. 운영 후보는 `custom-worker.ts`가 내보내는 `MarketQuotes` Durable Object이며 KV의 지역별 전파에 현재가를 의존하지 않는다. 알고리즘·보관 기준은 [제품 명세](./PRODUCT_SPEC.md#화면-간-재사용과-서버-준비), 검증 상태는 PROJECT_STATUS를 따른다.

- 공유 대상은 공개 종목별 현재가뿐이다. 가격은 메모리 최대 256개·원본 수신부터 30초, 사전 준비는 최근 5분 수요 중 50개까지다. 저장소에는 공개 종목과 마지막 조회 시각, 공급 제한 종료 시각만 남긴다. 계정·거래·보유 수량·계산 결과는 보내거나 저장하지 않는다. 재시작 시 가격은 다시 준비해야 한다.
- 내부 바인딩 전용 `POST /quotes`는 외부 공개 API로 연결하지 않는다. `public-quotes-v1` 한 개체가 공유 수요를 처리한다. 갱신은 필요한 종목만, 실패 시 정상값으로 덮어쓰지 않으며 429의 Retry-After를 지킨다. 5분간 요청이 없으면 다음 수집을 중단한다. 기존 뉴스/일별 환율의 5분 Cron은 변경하지 않는다.
- **활성화 전:** 시세 표시·단기 보관·선제 수집 권리 확인, 실제 계정의 Workers/DO 무료 한도 및 기존 사용량 확인, SQLite DO 생성/재시작/알람·호출량·한국 접근 지연을 검증한 뒤 별도 배포 승인을 받는다. 준비 50개는 비용 상한 보장이 아니며 방문 시 추가 조회·FX 하위 요청·기존 수집량도 계산해야 한다.
- **설정안(미적용):** `wrangler.jsonc`의 `durable_objects.bindings`에 `{ "name": "MARKET_QUOTES", "class_name": "MarketQuotes" }`, 새 `migrations` 항목에 `{ "tag": "market-quotes-v1", "new_sqlite_classes": ["MarketQuotes"] }`를 추가한다. 승인된 운영 환경에 서버 변수 `MARKET_PREPARATION_ENABLED="true"`를 설정한다. 런타임의 `process.env`와 Cloudflare 바인딩 양쪽에서 활성 값을 확인해야 연결한다. NEXT_PUBLIC 변수나 브라우저 비밀 키는 쓰지 않는다.
- **중단:** 활성 변수를 끄면 읽기는 기존 서버 인스턴스별 경로로 돌아간다. 새 수요가 끊긴 개체는 최대 5분 수요 만료 후 수집을 멈춘다. 즉시 수집 중단이 필요하면 개체 알람도 제거해야 한다. 저장된 개인 기록을 삭제할 필요는 없다.
- **비용 판단:** 한 묶음을 25초마다 하루 종일 준비한다는 단순 계산은 하루 3,456회 실행이다(실측 아님). 실제 횟수는 수요 도착·실패·통화별 하위 요청과 저장/알람 쓰기에 따라 다르다. 무료 DO는 SQLite만 지원하며 공식 한도는 일 100,000 요청·13,000 GB-s, 저장소 일 5,000,000 행 읽기·100,000 행 쓰기다. 현재 계정의 잔여량/다른 기능과 합쳐 검증하기 전 무료로 계속 유지된다고 확정하지 않는다. 한 개체 위치는 지연을 추가할 수도 있어 전체 화면 거의 즉시 달성 근거로 쓰지 않는다.

공식 근거(2026-09-23 확인): [알람·재시도](https://developers.cloudflare.com/durable-objects/api/alarms/), [무료 범위·저장소 과금](https://developers.cloudflare.com/durable-objects/platform/pricing/), [개체 위치](https://developers.cloudflare.com/durable-objects/reference/data-location/).
- Windows에서는 일반 Next 빌드에 `--skipNextBuild`를 바로 적용하면 standalone 산출물이 없어 실패하므로 OpenNext 전체 빌드 또는 OpenNext와 같은 `NEXT_PRIVATE_STANDALONE=true` 빌드를 사용한다.
- 작업별 시간 제한은 [뉴스 명세](./PRODUCT_SPEC.md#주요뉴스와-번역)와 [Cloudflare 실행 제한](https://developers.cloudflare.com/workers/platform/limits/#duration)을 대조한다. 수집 주기·KV 갱신·장기 안정성·여러 지역 속도의 실제 확인 결과는 [현재 제약](./PROJECT_STATUS.md#현재-제약)을 따른다.
