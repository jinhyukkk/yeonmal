# 연말정산 계산기 (배포용)

개인용 버전(`D:\Personal\연말정산`)을 복사해 서버 없이 동작하도록 바꾼 정적 사이트입니다.

| 항목 | 개인용 | 배포용 |
|---|---|---|
| 실행 | FastAPI 서버 (`server.py`) | 정적 파일만 (`public/`) |
| 기록 저장 | 서버 `data/records.json` | 방문자 브라우저 localStorage (`yearEndTax.records.v1`) |
| 외부 요청 | Google Fonts | 없음 (시스템 글꼴) |
| 안내 | — | 하단 면책·개인정보 안내 |
| 테스트 금액 | 실제 홈택스 PDF 값 | 가상 금액 (손 검산) |

## 로컬 확인

```powershell
python -m http.server 8770 --directory public
```

브라우저에서 http://localhost:8770 접속.

## 테스트

```powershell
node --test tests/
```

## 배포

Cloudflare Workers(정적 자산)로 배포합니다. `wrangler.jsonc`가 `public/` 폴더만 서비스하도록 지정하므로 `tests/`는 배포되지 않습니다.

- GitHub `main`에 push하면 Cloudflare가 자동 배포 (Workers & Pages → Git 연결)
- 연결 설정: Path `/`(저장소 루트), Build command 비움, Deploy command `npx wrangler deploy`
- 로컬에서 설정 확인: `npx wrangler deploy --dry-run`

## 개인용 → 배포용 반영 절차

계산 로직(`tax_logic.js` 등)을 개인용에서 고쳤다면 아래만 다시 복사합니다.

- 그대로 복사: `tax_logic.js`, `script.js`, `sources.js`, `paste.js`, `paste_parser.js`
- 바뀐 부분만 직접 옮김: `manage.js`(저장 방식이 다름), `index.html`(면책 안내·외부 글꼴 제거), `style.css`(끝의 `.site-footer` 규칙)
- 절대 복사하지 말 것: `data/`, `server.py`, 실제 금액이 든 테스트

복사 후 본인 이름·실제 총급여 같은 값으로 `public/`, `tests/`를 검색해 개인 정보가 섞이지 않았는지 확인합니다.

## 광고·공개 전 확인할 것

- 광고 스크립트를 넣으면 페이지 내용(입력값)을 읽을 수 있으므로 개인정보 처리방침에 명시
- 공제 추천 기능이 세무 상담에 해당하는지, 광고 플랫폼의 금융·세금 콘텐츠 정책
- 매년 12~1월 세법 개정 반영 (`tax_logic.js` 상단 상수, 연도 분기)
