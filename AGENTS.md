<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 작업·응답 원칙

- **대화와 문서는 요점만 쓴다.** 결과·핵심 이유·다음 행동을 먼저 제시하고 반복 설명, 대화 경위, 장황한 배경은 생략한다.
- 조사·개발·테스트·초안·정리 등 직접 할 수 있는 일은 수행한다. 사용자에게는 본인 인증·개인적 사실 확인·최종 결정 등 대체 불가능한 행동만 요청한다.
- 실행 계획은 **기한·만들 기능/결과물·완료 기준·담당·필요한 결정**으로 제시한다. 개발 우선순위나 범위의 결정이 필요하면 준비된 작업 지시를 보여주고 해당 결정만 요청한다. 이미 승인된 작업은 다시 묻지 않는다.
- 공개 정보로 확인할 일반 수요·경쟁 서비스 조사는 직접 한다. 사용자의 조사·인터뷰나 외부 게시를 개발 착수 조건으로 만들지 않는다. 실제 제품의 이용·재방문 검증은 출시 후 실제 자료로 한다.
- 요약해도 확정 결정, 데이터·계산 의미, 실행 명령, 미해결 문제, 검증 범위는 지우거나 바꾸지 않는다.
- 다른 작업자의 변경을 보존하고 요청과 무관한 코드·설정을 수정하지 않는다. 커밋·푸시·배포는 해당 사용자 지시를 따른다.
- 사용하지 않는 개발 도구의 전용 지침·설정 파일을 추가하지 않는다.

## 문서 관리 기준

| 내용 | 기준 파일 |
| --- | --- |
| 사업 목표·수익모델·실행 기한·실적 | 로컬 전용 BUSINESS_MODEL.md |
| 기능·저장·계산 의미 | [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) |
| 구현·검증·배포 상태·남은 문제 | [PROJECT_STATUS.md](./PROJECT_STATUS.md) |
| 배포·환경 설정 절차 | [CLOUDFLARE.md](./CLOUDFLARE.md) |
| 승인 브랜드·로고 자산 | [BRAND.md](./BRAND.md) |
| 소개·시작·문서 안내 | [README.md](./README.md) |
| 코드 지도·파일 책임·확장/검증 경로 | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| 작업·문서 작성 규칙 | 이 AGENTS.md |

1. 시작할 때 README의 문서 안내·PROJECT_STATUS의 환경별 진행 상태/현재 제약/다음 작업을 읽는다. 코드 작업은 DEVELOPMENT의 작업별 시작점에서 관련 파일과 테스트를 선택하고 해당 PRODUCT_SPEC 절을 읽는다. 과거 검증 전체·무관한 기능·생성물은 관련 있을 때만 확장해서 읽는다. 수정 직전에 다시 확인해 동시 작업 변경을 보존한다.
2. 최신 사용자 지시를 우선한다. 결정·제안·검증 사실·미확인을 구분하고, 명세와 코드의 불일치는 PROJECT_STATUS에 적는다.
3. **기존 항목을 수정·통합한다.** 계획 전체, 날짜별 복제본, 대화록을 누적하지 않는다. 상세는 한 파일에만 두고 다른 문서에서는 링크한다.
4. 현재 결정·상태·다음 행동에 필요한 내용만 남긴다. 지난 작업 과정·중복 검증은 요약하고 재현 자료는 기존 코드·manifest·Git 이력을 참조한다. 확정 실적·미달 판정은 보존한다.
5. 검증은 날짜·환경·대상 버전/범위·결과·남은 한계를 짧게 적는다. 과거 검증을 현재 재검증으로, 로컬 성공을 공개 배포 성공으로 표현하지 않는다.
6. 수정 후 링크·앵커·파일 경로·명령과 중복·모순을 확인한다. 문서 목록이 바뀌면 README도 갱신한다. 버전·설정 값은 package.json·package-lock.json·wrangler.jsonc가 기준이다.
7. BUSINESS_MODEL.md는 공개 저장소에 넣지 않는다. 있으면 제품 방향과 다음 검토일을 확인하고 지난 검토를 보완한다. 없으면 공개 문서를 사용하며 개인 사업 계획을 추정·재생성하지 않는다.

## 코드 변경 안내

파일 책임·공개 사용 창구·코드 추가 절차는 [DEVELOPMENT.md](./DEVELOPMENT.md)를 따른다. 페이지/Provider는 조립, 훅은 구독/수명, 계산은 순수 모듈, 저장은 저장소에 둔다. 기존 모듈을 수정하고 별도 저장 경로·폴링·중복 구현을 덧붙이지 않는다. 경로·책임·공개 창구를 바꾸면 코드 지도도 같은 변경에서 갱신한다.
