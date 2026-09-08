<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 작업·응답 원칙

- 개발 완료 후 Codex 오른쪽 패널이나 인앱 브라우저에 미리보기 페이지를 자동으로 열지 않는다. 사용자에게 URL만 제공하며 화면을 열어달라는 명시적 요청이 있을 때만 연다. 브라우저 검증은 보이지 않는 창으로 실행한다.

- **개발 대화와 제품 화면을 구분한다.** 사용자에게 보고할 작업 내용·구현 사정·제안·예정 작업을 페이지나 목업의 문구로 넣지 않는다. 화면에는 실제 서비스 사용자의 행동·상태 판단에 필요한 내용만 둔다. 상세 기준은 [화면 문구](./DESIGN_SYSTEM.md#화면-문구)를 따른다.
- **대화와 문서는 요점만 쓴다.** 결과·핵심 이유·다음 행동을 먼저 제시하고 반복 설명, 대화 경위, 장황한 배경은 생략한다.
- 조사·개발·테스트·초안·정리 등 직접 할 수 있는 일은 수행한다. 사용자에게는 본인 인증·개인적 사실 확인·최종 결정 등 대체 불가능한 행동만 요청한다.
- 실행 계획은 **기한·만들 기능/결과물·완료 기준·담당·필요한 결정**으로 제시한다. 개발 우선순위나 범위의 결정이 필요하면 준비된 작업 지시를 보여주고 해당 결정만 요청한다. 이미 승인된 작업은 다시 묻지 않는다.
- 다른 작업에 새 요구를 전달하기 전 진행 상태를 확인하고 **해당 전달에 대한 사용자 승인**을 받는다. 기능 논의·문서 반영을 전달/착수 승인으로 해석하지 않는다. 기존 승인 범위는 유지하되 새 요구는 계획에 보관한다.
- 공개 정보로 확인할 일반 수요·경쟁 서비스 조사는 직접 한다. 사용자의 조사·인터뷰나 외부 게시를 개발 착수 조건으로 만들지 않는다. 실제 제품의 이용·재방문 검증은 출시 후 실제 자료로 한다.
- 요약해도 확정 결정, 데이터·계산 의미, 실행 명령, 미해결 문제, 검증 범위는 지우거나 바꾸지 않는다.
- **모든 구현·수정은 `C:\Users\proje\Desktop\개인용\centbloom`의 로컬 `main`에서 진행한다.** 시작할 때 실제 저장소 루트·브랜치를 확인하며 별도 작업 브랜치·Git worktree를 만들지 않는다. 사용자 확인 주소는 이 루트에서 실행하는 `http://localhost:3000`이다.
- 이전 문서·스킬의 권장 방식·프로젝트 설정이 로컬 main 작업 원칙과 충돌하면 이 사용자 지시를 적용하고 해당 프로젝트 항목을 같은 작업에서 수정한다. 이미 승인된 이 원칙을 다시 확인받지 않는다. 다른 작업자의 변경을 덮어쓰거나 강제 초기화하지 않는다.
- 다른 작업자의 변경을 보존하고 요청과 무관한 코드·설정을 수정하지 않는다. 커밋·푸시·배포는 해당 사용자 지시를 따른다.
- 사용하지 않는 개발 도구의 전용 지침·설정 파일을 추가하지 않는다.

## 문서 관리 기준

| 내용 | 기준 파일 |
| --- | --- |
| 사업 목표·수익모델·실행 기한·실적 | 로컬 전용 BUSINESS_MODEL.md |
| 현재 제품 결정·변경 이력 | [DECISIONS.md](./DECISIONS.md) |
| 거래소 일정 근거·지원 범위 | [MARKET_CALENDARS.md](./MARKET_CALENDARS.md) |
| 공개 홈 경쟁 서비스 조사 | [PUBLIC_HOME_RESEARCH.md](./PUBLIC_HOME_RESEARCH.md) |
| 기능·저장·계산 의미 | [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) |
| 구현·검증·배포 상태·남은 문제 | [PROJECT_STATUS.md](./PROJECT_STATUS.md) |
| 검색 유입 전략·조사 근거·우선순위 | [SEO_PLAN.md](./SEO_PLAN.md) |
| 배포·환경 설정 절차 | [CLOUDFLARE.md](./CLOUDFLARE.md) |
| 승인 브랜드·로고 자산 | [BRAND.md](./BRAND.md) |
| 화면 문구·글꼴·크기·색상·간격·이미지·검사 기준 | [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| 소개·시작·문서 안내 | [README.md](./README.md) |
| 코드 지도·파일 책임·확장/검증 경로 | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| 작업·문서 작성 규칙 | 이 AGENTS.md |

1. 시작할 때 README의 문서 안내·PROJECT_STATUS의 환경별 진행 상태/현재 제약/다음 작업을 읽는다. 코드 작업은 DEVELOPMENT의 작업별 시작점에서 관련 파일과 테스트를 선택하고 해당 PRODUCT_SPEC 절을 읽는다. 검색 노출·콘텐츠 유입 작업은 SEO_PLAN의 관련 절을 먼저 확인한다. 과거 검증 전체·무관한 기능·생성물은 관련 있을 때만 확장해서 읽는다. 수정 직전에 다시 확인해 동시 작업 변경을 보존한다.
2. 최신 사용자 지시를 우선한다. 결정·제안·검증 사실·미확인을 구분하고, 명세와 코드의 불일치는 PROJECT_STATUS에 적는다.
3. 작성 전에 기준표에서 담당 문서를 선택하고 **기존 항목을 수정·통합한다.** 기존 역할에 담을 수 없는 내용만 새 문서로 분리하며 역할·관리 범위·관련 문서를 먼저 정한다. 계획 전체, 날짜별 복제본, 대화록을 누적하지 않는다. 상세는 한 파일에만 두고 다른 문서에서는 링크한다.
4. 현재 결정·상태·다음 행동에 필요한 내용만 남긴다. 지난 작업 과정·중복 검증은 요약하고 재현 자료는 기존 코드·manifest·Git 이력을 참조한다. 확정 실적·미달 판정은 보존한다.
5. 검증은 날짜·환경·대상 버전/범위·결과·남은 한계를 짧게 적는다. 과거 검증을 현재 재검증으로, 로컬 성공을 공개 배포 성공으로 표현하지 않는다.
6. 문서를 신설·이름 변경·역할 변경하면 이 AGENTS의 기준표, README 안내, 관련 참조를 함께 갱신한다. 문서 변경 완료 보고 전에 `npm run check:docs`를 통과해야 한다. 이 검사는 관리 목록·상대 링크·Markdown 제목 앵커·사업 문서 Git 추적 여부·로컬 사업 문서의 제품 결정 검토값을 확인하며 `npm run lint`에도 포함된다. 역할 중복·결정 모순·명령의 의미는 직접 검토한다. 버전·설정 값은 package.json·package-lock.json·wrangler.jsonc가 기준이다.
7. BUSINESS_MODEL.md는 공개 저장소에 넣지 않는다. 제품 방향·출시 범위를 변경하면 DECISIONS → PRODUCT_SPEC/PROJECT_STATUS → SEO_PLAN·사업 문서의 수익 가설/기한/출시 조건/측정을 같은 작업에서 대조한다. 사업 문서가 있으면 내용 검토 후에만 상단 `business-model-decisions-sha256` 주석을 검사가 제시한 SHA-256 값으로 갱신하고 `npm run check:docs`를 통과시킨다. 값만 바꿔 우회하지 않는다. 없으면 개인 계획을 추정·재생성하지 않고 완료 보고에 사업 문서 미검토를 명시하며, 원본 작업공간에 통합할 때 다시 확인한다. 이 검사는 결정 변경 후 검토 누락을 감지하며 내용의 의미까지 검증하지는 않는다. 사업 검토 때 다음 검토일과 지난 검토 누락도 확인한다.
8. 전략·근거·공통 기준은 담당 문서에, 개별 실행 범위·완료 조건·진행 상태는 GitHub 이슈에 둔다. 이슈는 기준 문서를 링크하고 본문 전체를 복제하지 않는다. 작업 완료 시 바뀐 기준과 PROJECT_STATUS의 구현·검증 현황을 갱신한다. 이슈 등록을 개발 착수 승인으로 해석하지 않는다.

## 코드 변경 안내

파일 책임·공개 사용 창구·코드 추가 절차는 [DEVELOPMENT.md](./DEVELOPMENT.md)를 따른다. 페이지/Provider는 조립, 훅은 구독/수명, 계산은 순수 모듈, 저장은 저장소에 둔다. 기존 모듈을 수정하고 별도 저장 경로·폴링·중복 구현을 덧붙이지 않는다. 경로·책임·공개 창구를 바꾸면 코드 지도도 같은 변경에서 갱신한다.

화면·스타일 작업은 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)를 먼저 읽고 공통값을 사용한다. 문서와 design-tokens.css를 함께 유지하며 완료 전에 `npm run check:design`을 실행한다(lint에도 포함). 기존 미정리 목록을 늘려 검사를 통과시키지 않는다. `npm run audit:design`의 전체 준수 결과와 새 위반 검사 결과를 구분하고, 실제 화면의 역할·배치·가독성은 별도로 확인한다.
