# Centifolio 로고 자산

최종 수정: 2026-09-05

사용자가 확정한 로고는 **금색 장미 문양 자체**입니다. 검정 배경은 로고의 일부나 사이트 전체의 고정 색상이 아닙니다. 밝은 화면에서도 사용할 수 있으며, 장미의 형태·기울기·금색 인상을 유지하는 배경 변경은 가능합니다. 장미 자체를 다른 형태로 다시 해석하거나 회전·색상 변경·잘라내는 작업은 사용자 협의 후 진행합니다.

## 원본과 배포용 파일

| 용도 | 파일 | 해상도 |
| --- | --- | --- |
| 최종 첨부 원본 보관 | [centifolio-logo-gold-on-black.original.png](./brand/centifolio/logo/centifolio-logo-gold-on-black.original.png) | 1254 × 1254 |
| 원본의 큰 크기 출력용 파생본 | [centifolio-logo-gold-on-black.4096.png](./brand/centifolio/logo/centifolio-logo-gold-on-black.4096.png) | 4096 × 4096 |
| 배경 픽셀 수정 전 편집본 보관 | [centifolio-logo-gold-on-white.pre-pixel-edit.png](./brand/centifolio/logo/centifolio-logo-gold-on-white.pre-pixel-edit.png) | 1254 × 1254 |
| 순수 흰색 배경 편집본 | [centifolio-logo-gold-on-white.png](./brand/centifolio/logo/centifolio-logo-gold-on-white.png) | 1254 × 1254 |
| 흰 배경 확대본 | [centifolio-logo-gold-on-white.4096.png](./brand/centifolio/logo/centifolio-logo-gold-on-white.4096.png) | 4096 × 4096 |
| 현재 로컬 웹 로고 | [centifolio-logo-gold-on-white.webp](./public/brand/centifolio-logo-gold-on-white.webp) | 640 × 640 |
| 이전 검정 배경 웹 자산 보관 | [centifolio-logo-gold-on-black.webp](./public/brand/centifolio-logo-gold-on-black.webp) | 640 × 640 |
| 웹 앱 아이콘 | [icon.png](./src/app/icon.png) | 96 × 96 |
| Apple 홈 화면 아이콘 | [apple-icon.png](./src/app/apple-icon.png) | 180 × 180 |
| 브라우저 탭 아이콘 | [favicon.ico](./src/app/favicon.ico) | 64 × 64 |

원본은 첨부 PNG를 **바이트 단위로 그대로 복사**한 파일입니다. 원본 SHA-256은 `8c2c5ff68b6cce02452e42344db69adfe525f536c97b64e831b8314ed4d331c3`입니다.

처음 만든 흰 배경 편집본은 내장 이미지 생성 도구로 배경을 교체하고 금색 인상을 원본과 맞춘 **편집 파생본**이며, 원본과 픽셀 단위로 동일한 복사본은 아닙니다. 그 파일은 수정 전 보관본으로 그대로 남겼습니다. 투명 배경 추출 결과는 가장자리 색 번짐 또는 실제 알파가 없는 체크무늬 때문에 채택하지 않았습니다.

현재 편집본은 사용자의 **“배경 픽셀만 직접 수정해”** 요청에 따라, 수정 전 보관본에서 밝고 중립적인 배경 픽셀만 RGB `(255,255,255)`로 바꿨습니다. 배경 선택 기준은 RGB 최솟값 245 이상·최댓값과 최솟값의 차이 6 이하입니다. 배경 마스크 1,275,151픽셀은 모두 순수 흰색이며, 마스크 밖 297,365픽셀은 RGB 값이 하나도 바뀌지 않았습니다. 금색 픽셀 294,705개도 전부 보존됐습니다. 크기·기울기·형태를 다시 생성하거나 회전·잘라내지 않았으며 현재 웹·아이콘은 이 편집본 전체의 크기만 변환합니다. 실제 알파가 있는 투명 파일은 아닙니다.

4096px 파일은 각각의 입력 이미지를 Lanczos3 방식으로 확대해 무손실 PNG로 저장한 **파생본**입니다. 원본보다 새로운 세부 묘사가 생긴 고해상도 원화나 벡터 파일은 아닙니다.

파일별 크기·해시·변환 방법은 [manifest.json](./brand/centifolio/logo/manifest.json), 배경 편집 프롬프트와 도구는 [background-edit.json](./brand/centifolio/logo/background-edit.json), 픽셀 보존 검사는 [background-pixel-validation.json](./brand/centifolio/logo/background-pixel-validation.json)에 기록합니다. [normalize-white-background.mjs](./brand/centifolio/logo/normalize-white-background.mjs)는 수정 전 보관본에서 동일한 배경 편집을 재현합니다. [export-assets.mjs](./brand/centifolio/logo/export-assets.mjs)는 보관 원본과 편집본의 해시를 확인한 뒤 같은 크기별 파일을 다시 만듭니다. 저장소 루트에서 각각 `node brand/centifolio/logo/normalize-white-background.mjs`, `node brand/centifolio/logo/export-assets.mjs`로 실행합니다.

이전 장미 시안은 비교 이력을 위해 보존하되 최종 로고로 사용하지 않습니다. 공개 프로젝트 소개는 [README.md](./README.md), 실제 화면 적용과 배포 검증은 [PROJECT_STATUS.md](./PROJECT_STATUS.md)를 참고합니다. 사업 검토 상세는 로컬 전용 `BUSINESS_MODEL.md`에서 관리합니다.
