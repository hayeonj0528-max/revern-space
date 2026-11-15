# REVERN SPACE 배포 가이드

확정된 공개 도메인은 아직 없습니다. 아래는 **현재 코드 구조**에 맞춘 배포 방법입니다. 예시 URL은 플레이스홀더이므로 실제 주소를 받은 뒤 바꿔 넣으세요.

## 아키텍처 요약

| 구성 | 역할 |
| --- | --- |
| Vite 빌드 (`dist/`) | React + R3F 클라이언트 정적 파일 |
| Node 서버 (`server/index.ts`) | `dist` 정적 제공 + WebSocket `/ws` + `/api/health` |
| 메모리 방 | 동시 접속·자리 점유·이동 검증 (프로세스 재시작 시 초기화) |

**실시간 WebSocket 서버가 필요합니다.** 정적 호스팅만으로는 멀티플레이어가 동작하지 않습니다.

권장: **Render(또는 동등한 Node 호스트) 한 곳**에서 `npm start`로 클라이언트+서버를 함께 제공.

선택: 클라이언트를 Vercel에, 실시간 서버만 Render에 분리. 이 경우 빌드 시 `VITE_WS_URL`과 서버의 `ALLOWED_ORIGINS`가 필요합니다.

현재 앱은 **외부 API 키를 요구하지 않습니다.** `.env`에 비밀 키를 넣지 마세요. `VITE_*` 값은 클라이언트 번들에 포함됩니다.

---

## 로컬 프로덕션 확인

```sh
npm ci
npm run build
npm start
```

- 앱: `http://localhost:2567/`
- 헬스: `http://localhost:2567/api/health`
- WebSocket: 같은 호스트의 `/ws`

---

## 권장: Render (단일 서비스)

Web Service 하나로 정적 파일과 WebSocket을 함께 제공합니다.

| 설정 | 값 |
| --- | --- |
| Runtime | Node |
| Root Directory | `.` (저장소 루트) |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Instance | **1** (메모리 방이므로 복제하지 마세요) |

### 환경 변수 (Render)

| 변수 | 예시 / 설명 |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | Render가 주입하는 포트를 그대로 사용 (보통 설정 불필요) |
| `ALLOWED_ORIGINS` | 비워 두면 **같은 Host** Origin만 허용. 분리 배포 시에만 클라이언트 HTTPS 출처를 콤마로 나열 |
| `MAX_CLIENTS` | `12` (기본) |
| `RECONNECT_GRACE_MS` | `15000` (기본) |
| `VITE_WS_URL` | **비움** — 같은 출처 `/ws` 사용 |

Node 버전: `.nvmrc` / `engines` 기준 **22+** (로컬 검증은 24).

배포 후 브라우저에서 두 창으로 입장·이동이 보이는지, `/api/health`가 `ok: true`인지 확인하세요.

---

## 선택: Vercel (정적) + Render (실시간)

Vercel은 WebSocket 상시 서버에 적합하지 않습니다. 정적 프론트만 Vercel에 올릴 때:

### Vercel

| 설정 | 값 |
| --- | --- |
| Root Directory | `.` |
| Framework Preset | Vite (또는 Other) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

### Vercel 환경 변수 (Build)

| 변수 | 설명 |
| --- | --- |
| `VITE_WS_URL` | Render 서버의 `wss://<render-host>/ws` (실제 호스트로 교체) |

### Render (실시간 전용)

| 설정 | 값 |
| --- | --- |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| `ALLOWED_ORIGINS` | Vercel 사이트 출처, 예: `https://<vercel-project>.vercel.app` (실제 주소로 교체) |

`npm start`는 여전히 `dist`를 서빙하지만, 이 분리 구성에서는 브라우저는 Vercel의 정적 URL을 쓰고 WebSocket만 Render로 연결합니다.

---

## GitHub에 올리지 말아야 할 것

이미 `.gitignore`에 포함:

- `node_modules/`
- `dist/`
- `.env`, `.env.*` (`.env.example`만 커밋)
- `test-results/`, `playwright-report/`

확인:

```sh
# 비밀 파일이 추적되지 않는지
git check-ignore -v .env node_modules dist

# 스테이징 전에 개인 송금 QR 공개 여부 검토
# public/shop/kakao-remit-qr.png — 개인 카카오페이 QR이면 공개 저장소 전에 제거하거나 비공개 저장소를 사용하세요.
```

`.env.example`만 참고용으로 커밋합니다. API 키 필드는 없습니다.

---

## 운영 전 체크

- [ ] HTTPS 페이지에서 WSS 연결
- [ ] 서로 다른 브라우저 두 개로 동기화
- [ ] 모바일 Safari/Chrome 터치·오디오
- [ ] 인스턴스 1개 유지 (수평 확장 시 방이 갈라짐)
- [ ] 개인 송금 QR·저작권 음원 라이선스 확인 (`ASSET_SOURCES.md`, `public/audio/music/ATTRIBUTION.md`)
