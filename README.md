# 한국 로보택시 대시보드

한국 자율주행택시(로보택시) 산업 현황을 한눈에 보여주는 실시간 대시보드.

**Live:** [korea-robotaxi-dashboard.vercel.app](https://korea-robotaxi-dashboard.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)
![Deploy](https://img.shields.io/badge/Vercel-deployed-brightgreen?logo=vercel)
![Data](https://img.shields.io/badge/data-auto--updated-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 주요 기능

| 페이지 | 설명 |
|--------|------|
| **홈** (`/`) | KPI 카드 (운행 기업, 구역, 면적, SAE 레벨) + 뉴스피드 (태그 필터) + 기업 현황 |
| **지도** (`/map`) | Leaflet 기반 시범운행지구 인터랙티브 지도 |
| **타임라인** (`/timeline`) | 2020~2027 정책/서비스 주요 이벤트 연표 |
| **글로벌 비교** (`/compare`) | 차량 규모, 운영 도시, Waymo CPUC 운행량, 준비도 레이더, 마일스톤 |
| **기업 상세** (`/company/[id]`) | 9개 기업별 상세 페이지 (투자, 차량, 구역, 관련 뉴스, JSON-LD) |

## 데이터

| 파일 | 내용 | 건수 |
|------|------|------|
| `data/companies.json` | 국내 자율주행 기업 | 9개 |
| `data/zones.json` | 시범운행지구 | 29곳 |
| `data/news.json` | 크롤링 뉴스 기사 | 580+ |
| `data/timeline.json` | 정책/서비스 이벤트 | 12건 |

### 자동 뉴스 크롤러

`robotaxi_crawler.py`가 GitHub Actions로 **6시간마다** 자동 실행됩니다.

- Google News RSS + Naver News RSS 이중 소스
- 12개 기본 쿼리 + 기업별 동적 쿼리 (총 ~30개)
- 헤드라인/매체명 자동 분리, meta description 기반 요약 추출
- bigram Jaccard 유사도 기반 중복 기사 제거
- 자동 태그 분류 (정책, 기업, 서비스, 사고, 해외, 일반)

## 기술 스택

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **차트:** Recharts (BarChart, RadarChart)
- **지도:** Leaflet + react-leaflet
- **크롤러:** Python 3.10 (stdlib only, 외부 패키지 없음)
- **배포:** Vercel (정적 프리렌더)
- **CI/CD:** GitHub Actions (뉴스 크롤링 6h 주기)
- **SEO:** robots.txt, sitemap.xml, Open Graph, Twitter Card, JSON-LD 구조화 데이터

## 로컬 실행

```bash
# 대시보드
cd dashboard-next
npm install
npm run dev          # http://localhost:3000

# 크롤러 (수동 실행)
pip install -r requirements.txt   # 선택: validate_data에 필요
python robotaxi_crawler.py
```

## 프로젝트 구조

```
korea-robotaxi-dashboard/
├── dashboard-next/          # Next.js 대시보드
│   └── src/
│       ├── app/             # App Router 페이지
│       │   ├── page.tsx           # 홈 (KPI + 뉴스 + 기업)
│       │   ├── map/               # 시범운행지구 지도
│       │   ├── timeline/          # 정책 타임라인
│       │   ├── compare/           # 글로벌 비교
│       │   ├── company/[id]/      # 기업 상세 (SSG)
│       │   ├── robots.ts          # robots.txt
│       │   └── sitemap.ts         # sitemap.xml
│       ├── components/      # 공통 컴포넌트
│       └── types/           # TypeScript 타입 정의
├── data/                    # JSON 데이터 (크롤러가 자동 갱신)
│   ├── companies.json
│   ├── zones.json
│   ├── news.json
│   └── timeline.json
├── robotaxi_crawler.py      # 뉴스 크롤러
├── validate_data.py         # 데이터 검증 스크립트
├── tests/                   # 크롤러 테스트
└── .github/workflows/       # GitHub Actions
    └── crawl.yml            # 6시간 주기 크롤링
```

## 수집 기업

| # | 기업 | 상태 | 주요 구역 |
|---|------|------|-----------|
| 1 | SWM (서울자율차) | 시범운행 | 강남, 여의도 |
| 2 | 카카오모빌리티 | 시범운행 | 세종 |
| 3 | 42dot (포티투닷) | 시범운행 | 청계천, 상암 |
| 4 | 포니링크 (Pony.ai) | 준비 중 | - |
| 5 | 오토노머스에이투지 | 시범운행 | 세종, 판교 |
| 6 | 모셔널 (현대차그룹) | 시험운행 | 서울 |
| 7 | 라이드플럭스 | 시범운행 | 대구, 세종, 제주 |
| 8 | SUM (에스유엠) | 시범운행 | 수성 |
| 9 | 쏘카 (SOCAR) | 시범운행 | 제주 |

## 글로벌 비교 데이터 출처

- [robotaxitracker.com](https://robotaxitracker.com) — Waymo/Tesla/Zoox 실시간 차량 추적
- California Public Utilities Commission (CPUC) — Waymo 분기별 운행 공시
- NHTSA Standing General Order 2021-01 — ADS 사고 리포트
- 각 사 IR/공시 자료

## License

MIT
