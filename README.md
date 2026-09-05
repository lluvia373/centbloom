# Centifolio

나의 투자를, 나답게. 주식에 대해 편하게 이야기하는 커뮤니티와 포트폴리오·관심종목을 연결하는 앱을 목표로 합니다. 현재 구현은 개인 투자 워크스페이스 단계입니다.

## 문서 안내

| 확인할 내용 | 기준 파일 |
| --- | --- |
| 확정 로고·원본과 확대본·웹 자산 위치 | [BRAND.md](./BRAND.md) |
| 화면 동작·데이터 저장·성과 계산의 의미 | [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) |
| 현재 구현·검증 결과·배포 진행·다음 작업 | [PROJECT_STATUS.md](./PROJECT_STATUS.md) |
| Cloudflare 빌드·환경 설정·배포 절차 | [CLOUDFLARE.md](./CLOUDFLARE.md) |
| 모든 문서의 수정 절차·작업자 지침 | [AGENTS.md](./AGENTS.md) |

처음에는 이 문서와 PROJECT_STATUS를 읽고 필요한 기준 문서로 이동합니다. 문서는 해당 항목을 수정해 최신 상태를 유지하며, 전체 내용을 반복 추가하지 않습니다.

`BUSINESS_MODEL.md`는 별도로 관리하는 로컬 사업 검토 문서이며 공개 저장소에 포함하지 않습니다. 해당 파일이 있는 작업 환경에서는 제품 범위 변경과 정기 사업 검토 시 함께 참고합니다. 새로 복제한 저장소에서는 이 문서의 프로젝트 소개와 공개 기능 명세를 기준으로 시작할 수 있습니다.

## 로컬 실행

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

http://127.0.0.1:3000 에서 열 수 있습니다. Next.js App Router, React, TypeScript, Tailwind CSS를 사용합니다. 의존성과 실행 명령은 [package.json](./package.json), 설치 버전은 [package-lock.json](./package-lock.json)을 기준으로 합니다.

## 로그인과 배포 설정

계정 연결 없이 로컬 저장 모드로 시작할 수 있습니다. Google 로그인을 연결할 때는 [.env.example](./.env.example)과 [CLOUDFLARE.md의 환경·로그인 설정](./CLOUDFLARE.md#supabase-연결)을 따릅니다. 설정에는 공개 URL과 publishable key를 사용하며 비밀 키를 문서나 저장소에 기록하지 않습니다.

Cloudflare용 빌드·미리보기·배포는 [CLOUDFLARE.md](./CLOUDFLARE.md)를 참고하세요. 실제 배포 여부와 확인한 주소는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)에서 관리합니다.

## 검증

```sh
npm run lint
npm run build
```

검증 결과는 날짜와 환경을 구분해 [PROJECT_STATUS.md](./PROJECT_STATUS.md)에 기록합니다. 기능·계산 기준은 [PRODUCT_SPEC.md](./PRODUCT_SPEC.md)를 참고하세요.
