# Centbloom 로고 자산

최종 수정: 2026-09-08

서비스명은 **Centbloom**, 한글 표기는 **센트블룸**, 코드·저장소·Worker 식별자는 `centbloom`이다(2026-09-08 사용자 확정). 독립 회사명은 정하지 않았으며 `centbloom.com`은 아직 구매·연결하지 않았다. 현재 공개 주소는 CLOUDFLARE와 PROJECT_STATUS를 따른다.

**승인 로고는 금색 장미 자체다.** 형태·기울기·금색을 보존한다. 검정 배경은 고정 요소가 아니며 배경 변경은 가능하다. 장미 재해석·회전·색상 변경·잘라내기는 사용자 협의 대상이다.

화면의 글꼴·색상·간격·이미지 배치는 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)에서 관리한다. 이 문서는 승인 자산과 재생성만 담당한다.

## 원본과 배포용 파일

| 용도 | 파일 | 크기 |
| --- | --- | --- |
| 첨부 원본 | [검정 원본](./brand/centbloom/logo/centbloom-logo-gold-on-black.original.png) | 1254px |
| 검정 확대본 | [4096 PNG](./brand/centbloom/logo/centbloom-logo-gold-on-black.4096.png) | 4096px |
| 픽셀 수정 전 흰 편집본 | [보관본](./brand/centbloom/logo/centbloom-logo-gold-on-white.pre-pixel-edit.png) | 1254px |
| 순백색 편집본 | [흰 PNG](./brand/centbloom/logo/centbloom-logo-gold-on-white.png) | 1254px |
| 투명 파생본 | [투명 PNG](./brand/centbloom/logo/centbloom-logo-gold-transparent.png) | 1254px |
| 흰 확대본 | [4096 PNG](./brand/centbloom/logo/centbloom-logo-gold-on-white.4096.png) | 4096px |
| 웹 로고 | [투명 WebP](./public/brand/centbloom-logo-gold-transparent.webp) | 640px |
| 흰 배경 표시용 자산 | [흰 WebP](./public/brand/centbloom-logo-gold-on-white.webp) | 640px |
| 이전 웹 자산 | [검정 WebP](./public/brand/centbloom-logo-gold-on-black.webp) | 640px |
| 웹 앱 아이콘 | [icon.png](./src/app/icon.png) | 96px |
| Apple 아이콘 | [apple-icon.png](./src/app/apple-icon.png) | 180px |
| 탭 아이콘 | [favicon.ico](./src/app/favicon.ico) | 64px |

모두 정사각형이다. 웹 로고·웹 앱·탭 아이콘은 투명 배경을 사용한다. 2026-09-08 사용자 요청으로 웹 로고에도 기존 투명 파생본을 적용해 주변 배경이 그대로 보이도록 했다. Apple 홈 화면 아이콘은 별도 흰 배경 표시용 자산을 유지한다.

## 종목 마크

기업 식별용 마크는 Centbloom 장미와 별도다. 기업 공식 사이트·Yahoo Finance에서 받은 원본 15개를 [public/companies](./public/companies)에 보관한다. URL·수집일·원본 해시는 [sources.json](./public/companies/sources.json), 종목 연결과 허용 공급원은 [company-logos.ts](./src/lib/company-logos.ts)가 기준이다. 등록 원본 → 허용된 Yahoo 이미지 → Elbstream의 전체 종목 코드 조회 순으로 사용하며, 각 이미지 로딩 실패 시 다음 공급원으로 넘어간다. 거래소 접미사와 주식 클래스는 유지한다. 모든 공급원에서 누락되면 공통 기업 아이콘을 표시한다. 로고·대체 아이콘 모두 흰 프레임과 동일 크기를 사용한다.

[Elbstream Logo API](https://elbstream.com/logos)는 로고가 표시되는 페이지에 12pt 이상 출처 링크를 요구하므로 공통 레이아웃 하단에 16px 링크를 둔다. 이미지는 공급자에서 직접 지연 로딩하며 별도 시세 요청·서버 프록시·이미지 자체 보관을 추가하지 않는다. 로컬 15개 원본은 기존 출처를 유지한다. 전체 종목 지원이나 식별 정확도를 보장하지 않으며, 오표시 확인 시 검증된 원본 매핑을 우선 추가한다. [API 계약](https://api.elbstream.com/openapi.json).

## 보존·재생성 기준

- 첨부 원본은 바이트 그대로 보관한다. 해시·크기·변환 기준은 [manifest.json](./brand/centbloom/logo/manifest.json).
- 최초 흰 편집본은 이미지 생성 도구의 파생본이며 검정 원본과 픽셀 단위로 동일하지 않다. [편집 근거](./brand/centbloom/logo/background-edit.json).
- 사용자 승인으로 밝고 중립적인 배경만 순백색으로 수정했다. 투명본은 같은 마스크의 알파만 0으로 만들며 RGB·장미 불투명도는 보존한다.
- 투명 WebP·PNG·ICO는 Lanczos3 축소 후 알파 4/255 이하만 제거한다. 4096px 파일은 확대 파생본이며 새 고해상도 원화·벡터가 아니다.
- 마스크·픽셀 보존 수치는 [검증 자료](./brand/centbloom/logo/background-pixel-validation.json)를 따른다. 이전 시안은 최종 로고로 쓰지 않는다.

저장소 루트에서 실행한다.

```sh
node brand/centbloom/logo/normalize-white-background.mjs
node brand/centbloom/logo/export-assets.mjs
```

[배경 정규화](./brand/centbloom/logo/normalize-white-background.mjs)는 수정 전 보관본에서 재현하고, [자산 생성](./brand/centbloom/logo/export-assets.mjs)은 입력 해시 확인 후 크기별 파일을 만든다. 실제 적용·배포 검증은 [PROJECT_STATUS.md](./PROJECT_STATUS.md).
