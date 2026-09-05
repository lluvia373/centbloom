<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 문서 관리 기준

문서 안내 목록은 [README.md](./README.md), 모든 문서의 공통 수정 규칙은 이 절에서 관리한다.

### 정보별 기준 파일

- 사업·제품 방향·수익모델·사업 가설: 로컬 전용 `BUSINESS_MODEL.md`가 있는 환경에서는 해당 파일을 기준으로 한다. 공개 저장소에는 포함하지 않으며, 파일이 없는 새 복제본에서는 [README.md](./README.md)의 프로젝트 소개와 공개 기능 명세를 참고한다.
- 기능 동작·저장 의미·계산 기준: [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).
- 구현 완료·검증 결과·제약·배포 진행·다음 작업: [PROJECT_STATUS.md](./PROJECT_STATUS.md).
- Cloudflare 빌드·환경 설정·배포 절차: [CLOUDFLARE.md](./CLOUDFLARE.md).
- 프로젝트 소개·로컬 시작·문서 탐색: [README.md](./README.md).
- 작업 지침은 이 파일 한 곳에서 관리한다. 사용하지 않는 개발 도구의 전용 지침·설정 파일을 사용자 요청 없이 추가하지 않는다.
- 버전·실행 명령·배포 설정의 값: package.json, package-lock.json, wrangler.jsonc 등 실제 설정 파일. 문서에 같은 값을 반복 고정하지 않는다.

### 읽기와 수정 절차

1. 시작할 때 README의 문서 목록과 PROJECT_STATUS를 읽고, 수행할 작업에 해당하는 기준 파일을 확인한다. 제품 범위를 바꾸는 작업은 로컬 `BUSINESS_MODEL.md`가 있으면 함께 읽는다. 파일이 없다는 이유로 비공개 계획을 추정하거나 공개 저장소에 새로 만들지 않는다.
2. 최신 사용자 지시가 문서보다 우선한다. 확정 결정·검증된 사실·가설을 구분하며, 새 사용자 결정은 관련 기준 항목에 바로 반영한다.
3. 기존 문장·표·목록을 직접 수정·통합한다. 계획 전체의 반복 붙여넣기, 날짜별 복제본, 대화록 누적은 하지 않는다. 최종 수정일을 갱신하고 대체된 문구를 정리한다. 과거 내용은 Git 이력으로 확인한다.
4. 같은 사실의 상세 설명은 기준 파일 한 곳에 둔다. 다른 문서는 짧은 설명과 링크로 참조한다. 문서를 추가·이동하면 README 목록과 관련 링크를 함께 수정한다.
5. 기능 명세와 실제 코드가 다르면 불일치를 PROJECT_STATUS에 기록하고 확인한다. 구현된 상태를 근거로 사용자 결정을 폐기하지 않으며, 계획만 있는 기능을 구현 완료로 쓰지 않는다.
6. 검증 기록은 날짜·환경·대상 버전 또는 변경 범위·결과·제약을 구분한다. 과거 실행 결과를 현재 코드나 배포에서 재검증한 것처럼 표현하지 않는다. 로컬 빌드 성공과 실제 공개 배포 성공도 구분한다.
7. 수정 전 파일을 다시 읽어 다른 작업자의 변경을 보존한다. 문서 작업으로 무관한 코드·배포 설정을 변경하지 않는다. 수정 후 중복·모순·상대 링크·명령 및 경로의 존재 여부를 확인한다.
8. 사용자에게 변경점과 기준 파일 위치를 간결하게 알린다. 커밋·푸시·배포는 별도 작업 지시를 따른다.
9. 프로젝트 작업을 시작할 때 로컬 `BUSINESS_MODEL.md`가 있으면 다음 정기 검토일을 확인한다. 기한이 지났으면 현재 사용자 작업을 방해하지 않는 범위에서 누락된 사업 검토를 함께 진행하고, 실적 자료가 없으면 미측정과 필요한 자료를 명시한다. 목표 일정·월별 지표·정기 검토 방식은 해당 로컬 파일 한 곳에서 관리하며 자동화 누락을 달성으로 간주하지 않는다. 파일이 없는 공개 저장소 복제본에서는 이 확인을 생략한다.
