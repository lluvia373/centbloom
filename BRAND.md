# Centifolio 로고 자산

최종 수정: 2026-09-06

**승인 로고는 금색 장미 자체다.** 형태·기울기·금색을 보존한다. 검정 배경은 고정 요소가 아니며 배경 변경은 가능하다. 장미 재해석·회전·색상 변경·잘라내기는 사용자 협의 대상이다.

## 원본과 배포용 파일

| 용도 | 파일 | 크기 |
| --- | --- | --- |
| 첨부 원본 | [검정 원본](./brand/centifolio/logo/centifolio-logo-gold-on-black.original.png) | 1254px |
| 검정 확대본 | [4096 PNG](./brand/centifolio/logo/centifolio-logo-gold-on-black.4096.png) | 4096px |
| 픽셀 수정 전 흰 편집본 | [보관본](./brand/centifolio/logo/centifolio-logo-gold-on-white.pre-pixel-edit.png) | 1254px |
| 순백색 편집본 | [흰 PNG](./brand/centifolio/logo/centifolio-logo-gold-on-white.png) | 1254px |
| 투명 파생본 | [투명 PNG](./brand/centifolio/logo/centifolio-logo-gold-transparent.png) | 1254px |
| 흰 확대본 | [4096 PNG](./brand/centifolio/logo/centifolio-logo-gold-on-white.4096.png) | 4096px |
| 웹 로고 | [흰 WebP](./public/brand/centifolio-logo-gold-on-white.webp) | 640px |
| 이전 웹 자산 | [검정 WebP](./public/brand/centifolio-logo-gold-on-black.webp) | 640px |
| 웹 앱 아이콘 | [icon.png](./src/app/icon.png) | 96px |
| Apple 아이콘 | [apple-icon.png](./src/app/apple-icon.png) | 180px |
| 탭 아이콘 | [favicon.ico](./src/app/favicon.ico) | 64px |

모두 정사각형이다. 웹 로고·Apple 아이콘은 흰 배경, 웹 앱·탭 아이콘은 투명 배경을 사용한다.

## 종목 마크

기업 식별용 마크는 Centifolio 장미와 별도다. 기업 공식 사이트·Yahoo Finance에서 받은 원본 15개를 [public/companies](./public/companies)에 보관한다. URL·수집일·원본 해시는 [sources.json](./public/companies/sources.json), 종목 연결과 허용 공급원은 [company-logos.ts](./src/lib/company-logos.ts)가 기준이다. 제공되지 않는 종목은 티커로 표시한다.

## 보존·재생성 기준

- 첨부 원본은 바이트 그대로 보관한다. 해시·크기·변환 기준은 [manifest.json](./brand/centifolio/logo/manifest.json).
- 최초 흰 편집본은 이미지 생성 도구의 파생본이며 검정 원본과 픽셀 단위로 동일하지 않다. [편집 근거](./brand/centifolio/logo/background-edit.json).
- 사용자 승인으로 밝고 중립적인 배경만 순백색으로 수정했다. 투명본은 같은 마스크의 알파만 0으로 만들며 RGB·장미 불투명도는 보존한다.
- PNG·ICO는 Lanczos3 축소 후 알파 4/255 이하만 제거한다. 4096px 파일은 확대 파생본이며 새 고해상도 원화·벡터가 아니다.
- 마스크·픽셀 보존 수치는 [검증 자료](./brand/centifolio/logo/background-pixel-validation.json)를 따른다. 이전 시안은 최종 로고로 쓰지 않는다.

저장소 루트에서 실행한다.

```sh
node brand/centifolio/logo/normalize-white-background.mjs
node brand/centifolio/logo/export-assets.mjs
```

[배경 정규화](./brand/centifolio/logo/normalize-white-background.mjs)는 수정 전 보관본에서 재현하고, [자산 생성](./brand/centifolio/logo/export-assets.mjs)은 입력 해시 확인 후 크기별 파일을 만든다. 실제 적용·배포 검증은 [PROJECT_STATUS.md](./PROJECT_STATUS.md).
