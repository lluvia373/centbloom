# Centifolio 구글 검색 유입 계획

확인: 2026-09-06 · 조사와 실행 제안. 구현·공개 배포는 별도 승인 범위를 따른다.

**우선순위: 공개 글을 검색 가능하게 만들기 → 구체적인 투자 질문 해결 → 유용한 토론 축적 → 검색 유입의 참여·재방문 검증.** 홈페이지 한 장의 순위보다 실제 답이 있는 여러 페이지를 진입점으로 만든다. Google은 자동 1위 방법을 제공하지 않으며 변경 효과는 수주~수개월 뒤 나타날 수도 있다. [Google SEO 가이드](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

## 현재 확인된 장애

로컬 HEAD `735cc42`와 아래 공개 URL의 비로그인 HTTP 응답을 확인했다. 공개 배포 버전 자체를 이번에 재검증한 것은 아니다.

| 확인 대상 | 결과·의미 |
| --- | --- |
| [루트 레이아웃](./src/app/layout.tsx)·[로그인 제한](./src/components/AuthGate.tsx) | 인증 설정 시 모든 화면이 AuthGate 안에 있다. 비로그인 공개 콘텐츠 경로를 분리해야 한다 |
| [커뮤니티 경로](./src/app/community/page.tsx) | 현재 /journal로 이동한다. 검색 진입점이 될 공개 게시글 상세가 없다 |
| [공개 홈](https://centifolio.stock-web-demo.workers.dev/) | HTTP 200이지만 초기 HTML에 로그인 상태 확인 화면. 실제 Google 렌더링 결과는 미검증 |
| 제목·대표 URL | 공통 제목/설명만 확인했고 개별 페이지 메타데이터·canonical 구현은 찾지 못했다. 공개 홈 HTML에도 canonical 없음 |
| [사이트맵](https://centifolio.stock-web-demo.workers.dev/sitemap.xml) | HTTP 404. 로컬 sitemap 파일도 없음. 사이트맵 부재 자체가 색인 불가를 뜻하지는 않음 |
| [robots.txt](https://centifolio.stock-web-demo.workers.dev/robots.txt) | HTTP 200. 응답은 content signals 설명 주석이며 User-agent/Disallow/Sitemap 규칙 없음. Googlebot의 실제 접근은 Search Console에서 확인 필요 |
| 성과 | Search Console 소유권/색인 상태·실제 Google 순위·검색량·클릭·실사용 성능 미확인 |

**핵심 진단:** 공개 콘텐츠 부족과 로그인 제한부터 해결해야 한다. 제목에 검색어를 더 넣는 것으로 이 문제를 해결할 수는 없다. [Google의 JavaScript 수집·렌더링 안내](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

## 출시 전에 준비할 검색 구조

아래는 구현 제안과 완료 기준이다. 현재 개발에 전달하거나 착수한 목록이 아니다.

| 우선순위 | 할 일 | 완료 기준 |
| --- | --- | --- |
| P0 | 공개 열람 분리 | 홈·공개 글·종목별 토론은 비로그인 열람. 개인 포트폴리오·설정·노트는 인증과 서버 권한 유지 |
| P0 | 본문을 읽을 수 있는 HTML | 공개 글의 제목·작성자·본문·공개 댓글·링크가 서버 응답/렌더링에 존재. 로딩 화면이나 차트 이미지만 남지 않음 |
| P0 | 글마다 고정 주소 | 글 상세 고유 URL, 영구 삭제는 404/410, 이동은 적절한 리디렉션. 없는 글을 200 로그인 화면으로 반환하지 않음 |
| P0 | 페이지별 제목·설명 | 글 주제를 설명하는 title·주제목·요약. 종목명과 티커는 관련 있을 때 자연스럽게 사용. 모든 글에 같은 홍보 제목을 붙이지 않음 |
| P0 | 수집 가능한 내부 링크 | 홈→주제/종목→글→관련 글을 실제 href 링크로 연결. 무한 스크롤에도 다음 목록의 고유 URL·링크 제공 |
| P0 | 대표 주소·중복 처리 | 정식 도메인 기준 canonical·사이트맵·내부 링크 일치. 기존 공개 페이지는 대응하는 새 페이지로 영구 이동하되 기존 브라우저 자료 보존을 먼저 해결 |
| P0 | 사이트맵·검색 제외 구분 | 공개·정상·대표 URL만 sitemap에 포함. 로그인/설정/개인 자료는 검색 대상 제외. noindex를 읽혀야 하는 URL을 robots.txt로 동시에 막지 않음; 검색 제외는 개인정보 접근 제어의 대체 수단이 아님 |
| P0 | Search Console 연결 | 정식 도메인 소유권 확인·사이트맵 제출·대표 페이지 URL 검사. Google 렌더링·선택한 canonical·색인 장애 확인. 등록/제출을 색인 완료나 상위 노출로 기록하지 않음 |
| P1 | 운영 중 수집 유지 | 5xx·잘못된 404·깨진 링크·봇 차단 점검. 태그/정렬/검색 조합이 무한 URL을 만들지 않도록 제한하고 필요한 주제 페이지를 선별 |

근거: [수집 가능한 링크](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), [페이지 나눔](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading), [대표 URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [주소 이전](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes), [검색 제외와 링크 속성](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links), [필터 URL 관리](https://developers.google.com/crawling/docs/faceted-navigation)

## 어떤 내용으로 검색에 들어갈 것인가

**제안:** 초기에는 미국주식 수익률·거래 기록·종목별 실제 질문에 집중한다. 아래 검색어는 조사·실험 후보이며 검색량이나 낮은 경쟁이 검증됐다는 뜻이 아니다. 같은 질문의 표현만 바꾼 별도 페이지를 대량 생성하지 않는다.

| 공략할 질문 예시 | 제공할 독자적 답·기능 | 커뮤니티 연결 |
| --- | --- | --- |
| 미국주식 달러 수익률과 원화 수익률이 다른 이유 | 주가·환율 변화가 다른 계산 예시와 적용 범위 | 계산이 달랐던 상황 질문 |
| 미국주식 환율 포함 수익률 계산 | 계산식·입력값·수수료 포함 여부를 밝힌 공개 도구 | 결과에 대한 질문으로 연결. 실제 금액 자동 공개 금지 |
| 분할 매수 평균 단가 계산 | 여러 차수 입력·수수료 처리·계산 과정 표시 | 매수 기록 방법 토론 |
| 분할 매수 후 일부 매도 기록 방법 | 어떤 거래를 어떻게 기록했는지 재현 가능한 예시 | 기록 방식별 차이 질문 |
| 증권사 수익률과 직접 계산한 수익률 차이 | 기간·환율·수수료·현금 유입 등 비교할 조건 | 사용자가 자신의 조건을 선택해 질문 |
| 여러 증권사 주식 수동 관리 | 제품의 실제 화면과 지원/미지원 범위 | 사용자 개선 요청·경험 공유 |
| 해외주식 매매일지 작성 예시 | 이유·기대·결과를 구분한 샘플, 내려받을 수 있는 양식 후보 | 실제 사용자 기록·회고 |
| 관심종목을 고른 이유 기록하기 | 종목별 확인 항목·후속 점검 예시 | 해당 종목 토론 |
| 특정 종목 실적에서 확인할 지표 | 기업 IR 원문·기준일·수치와 해석을 구분한 해설 | 서로 다른 관점의 공개 답글 |
| 환율 변화가 포트폴리오에 준 영향 | 재현 가능한 가상 사례와 계산 한계 | 사용자가 겪은 현상과 비교 |

검색 표본에는 이미 [평균 매입단가 계산기](https://www.myutper.com/calc/finpro-avg-price) 같은 독립 도구가 존재했다. 단순 계산기 복제로 차별화된다고 가정하지 않는다. 이 표본은 실제 Google 순위나 검색량 측정이 아니다.

각 페이지는 **핵심 답 → 근거·계산/사례 → 적용 조건·한계 → 관련 토론**으로 구성한다. 운영자 글은 운영자 작성으로 표시하고 가상의 투자 경력·사용자 후기·수익 인증을 만들지 않는다. 주식처럼 재정에 영향을 주는 내용은 원자료·작성자·실제 수정일·오류 정정 경로로 신뢰를 쌓는다. 단순 면책 문구나 E-E-A-T 점수를 붙이는 것으로 대체하지 않는다. [유용하고 신뢰할 수 있는 콘텐츠](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

## 노출·클릭·참여를 늘릴 추가 방법

| 방법 | 센티폴리오 적용·판단 기준 |
| --- | --- |
| 종목·주제별 모음 | 실제 관련 글과 답이 모인 주제부터 페이지화. 빈 게시판·티커만 바뀐 설명을 수천 개 만들지 않음 |
| 내부 링크·오래된 글 개선 | 새로운 답글·실제 변경·새 근거를 기존 글에 반영하고 연결. 같은 의도의 운영자 안내가 중복되면 통합 검토 |
| 포럼 구조화 데이터 | 실제 이용자 글에 DiscussionForumPosting·Comment, 공개 작성자 페이지에 ProfilePage 검토. 운영자/대리 작성 안내 글은 Article 등 적합한 유형 사용. 화면에 없는 답글·작성자·통계는 표시하지 않음 |
| 모바일·속도·광고 배치 | 핵심 본문을 빨리 표시하고 이미지 크기·광고 공간을 예약. 실사용 LCP 2.5초 이하·INP 200ms 이하·CLS 0.1 이하 목표. Lighthouse 점수만으로 순위 상승이나 실사용 통과를 단정하지 않음 |
| 인용받을 자료·자연스러운 외부 링크 | 계산 도구·검증 가능한 비교표·직접 조사한 자료를 제공. 관련 작성자에게 소개할 초안과 허용된 공유 경로 준비. 메시지/게시 실행은 승인 범위 준수 |
| 이용자 게시물 관리 | 신고·도배/링크 스팸 처리. 이용자 링크는 ugc, 광고·제휴 링크는 sponsored로 관계 표시 |
| 이미지·영상 검색 | 읽을 수 있는 본문과 함께 원본 설명 그림·실제 사용 영상·적절한 대체 텍스트 제공. 검색어를 넣기 위한 장식 이미지 양산은 제외 |
| AI Overviews·AI Mode | 기존 SEO와 독자적인 근거/사례를 우선. Search Console에서 생성형 검색 포함 설정 확인. llms.txt나 전용 AI 키워드 파일을 순위 상승 기능으로 만들지 않음 |
| Discover | 콘텐츠와 관련된 가로 1,200px 이상 대표 이미지·큰 이미지 미리보기·과장 없는 제목 검토. 변동성이 커 보조 유입으로 평가 |
| 검색 방문자의 참여 | 먼저 답을 읽고 필요한 때 질문/댓글·관심종목으로 이동. 검색 클릭 후 즉시 가입 강요를 줄이고 실제 작성·재방문을 측정. 체류시간을 인위적으로 늘리는 조작은 하지 않음 |

근거: [포럼 데이터와 운영자 글 구분](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum), [작성자 프로필](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals), [외부 링크 표시](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links), [Google 생성형 검색 안내](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [Discover](https://developers.google.com/search/docs/appearance/google-discover). 구조화 데이터는 검색 기능의 대상이 되도록 돕지만 노출을 보장하지 않는다.

## 비용·위험 대비 제외할 방법

- **순위용 백링크 구매·자동 댓글·복사 콘텐츠·숨긴 키워드·Google에만 다른 내용 제공:** 검색 스팸 정책에 걸릴 수 있어 제외한다. AI는 조사·초안·검증 보조로 쓰고 독자적 가치 없는 대량 글 생성에 쓰지 않는다. [스팸 정책](https://developers.google.com/search/docs/essentials/spam-policies)
- **비싼 .com이나 키워드 도메인 구매만으로 상위 노출:** 근거로 삼지 않는다. 국가 도메인 신호와 전체 순위는 다르다. meta keywords·고정 글자 수·키워드 반복 횟수에도 작업을 쓰지 않는다. [Google이 우선하지 말라는 항목](https://developers.google.com/search/docs/fundamentals/seo-starter-guide#things-we-believe-you-shouldnt-focus-on)
- **광고비로 자연검색 순위 구매:** Google Ads의 유료 광고 노출과 자연검색은 별개다. AdSense 부착도 검색 콘텐츠를 대신하지 않는다. [Google 검색 작동 방식](https://developers.google.com/search/docs/fundamentals/how-search-works)
- **폐지된 FAQ 검색 꾸미기:** FAQ 리치 결과는 2026-05-07부터 종료됐고 06-15에 문서가 제거됐다. 일반적인 질문·답변 본문은 유용할 수 있지만 폐지된 노출 기능 구현에 시간을 쓰지 않는다. [공식 변경 기록](https://developers.google.com/search/updates#june-2026)
- **llms.txt·가짜 외부 언급·AI용 문장 재작성 패키지:** Google 검색에 필요 없는 작업을 상위 노출 필수품으로 구매하지 않는다. [생성형 검색 오해](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide#mythbusting)
- 초기에는 Search Console·PageSpeed Insights와 제품 이용 분석으로 판단한다. 유료 SEO 도구·대행 결제는 실제 필요한 데이터와 효과를 확인한 뒤 별도 결정한다.

## 실행과 검토

날짜는 실행 목표이며 순위·색인·트래픽 보장일이 아니다. 출시 일정은 기존 사업 계획을 따르고 아래 항목 때문에 현재 개발 작업에 임의 지시하지 않는다.

| 시점 | Codex가 준비·검토할 결과 | 완료 기준 |
| --- | --- | --- |
| 다음 검토까지 | P0의 구현 범위·완료 기준과 첫 안내 글 10개의 검색 의도 정리 | 기존 커뮤니티 작업과 겹치는 부분 통합, 새 개발 범위만 결정 대상으로 제시 |
| 공개 베타 준비 시 | P0 검색 구조·콘텐츠·Search Console 설정 | 대표 페이지를 비로그인으로 읽고 URL 검사 가능, 사이트맵 정상. 검색 구조 추가 범위는 착수 결정 후 구현 |
| 공개 후 첫 7일 | 색인 허용·수집/서버 오류·Google 선택 canonical | 장애를 먼저 수정. 색인되지 않았다고 같은 URL을 반복 제출하거나 글을 양산하지 않음 |
| 공개 후 28일 | 페이지/검색어별 노출·클릭·CTR·평균 게재순위, 검색 방문자의 참여 | 노출 없음→수집/색인/내용 확인; 노출 있으나 클릭 적음→의도·제목·검색 결과 비교; 방문 후 참여 낮음→본문·다음 행동 개선 |
| 이후 매주·4주 비교 | 기존 페이지 수정 3개 이내, 효과 있는 주제 확대 | 브랜드 검색과 비브랜드 검색 구분. 적은 표본의 CTR·평균 순위 변동으로 성공/실패를 단정하지 않음 |

검색에서 **보임/클릭됨**은 [Search Console](https://support.google.com/webmasters/answer/7576553?hl=en), 사이트에서 **읽음/작성/재방문**은 [이슈 #11](https://github.com/lluvia373/centifolio/issues/11)로 측정한다. 검색어별 방문자를 개인 단위로 식별할 수 있다고 가정하지 않는다. 실제 자료가 없으면 미측정으로 남긴다.

이 문서는 SEO 전략·조사 근거·우선순위의 기준이며, 관리·수정은 [AGENTS.md의 문서 관리 기준](./AGENTS.md#문서-관리-기준)을 따른다. 개별 실행은 기준 문서를 링크한 GitHub 이슈로 관리하고, 구현·검증 결과는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)에 기록한다.
