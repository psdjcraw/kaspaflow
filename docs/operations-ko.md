# KaspaFlow 운영 런북

이 문서는 KaspaFlow를 실제 매장 파일럿에 올리기 전, 운영 중, 장애 발생 시
확인해야 할 절차를 정리한다. KaspaFlow는 비수탁형 서비스이며, 가맹점 지갑으로
Kaspa를 직접 받는다. 서버는 개인키를 저장하거나 송금하지 않는다.

## 1. 운영 원칙

- 실제 결제는 `KASPA_WATCHER_MODE=kaspa-rest`와 `KASPA_NETWORK=mainnet`으로 운영한다.
- 실결제 환경에서는 `KASPAFLOW_ENABLE_SIMULATION=false`를 유지한다.
- 외부에 노출되는 배포에는 반드시 `KASPAFLOW_ADMIN_TOKEN`을 설정한다.
- 결제 수신 주소는 매장 소유의 Kaspa 지갑 주소만 사용한다.
- 환불은 매장 지갑에서 직접 송금하고, KaspaFlow에는 환불 트랜잭션 해시를 기록한다.
- 파일 기반 저장소는 파일럿용이다. 다매장 베타 전에는 데이터베이스로 이전한다.

## 2. 필수 환경변수

```bash
NODE_ENV=production
QUOTE_FIAT=KRW
KAS_PRICE_SOURCE=auto
KASPAFLOW_DATA_DIR=/app/data
KASPAFLOW_BACKUP_DIR=/app/backups
KASPAFLOW_STORAGE_PROVIDER=file
KASPA_WATCHER_MODE=kaspa-rest
KASPAFLOW_BACKGROUND_SYNC_ENABLED=true
KASPAFLOW_BACKGROUND_SYNC_INTERVAL_MS=15000
KASPA_NETWORK=mainnet
KASPA_REST_API_URL=
KASPAFLOW_ENABLE_SIMULATION=false
KASPAFLOW_ADMIN_TOKEN=<strong-random-token>
KASPAFLOW_NOTIFY_WEBHOOK_URL=
KASPAFLOW_NOTIFY_WEBHOOK_FORMAT=json
KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID=
```

권장값:

- `KAS_PRICE_SOURCE=auto`: KRW는 Coinone, 그 외 통화는 CoinGecko 우선.
- `KASPAFLOW_BACKUP_DIR`: `npm run backup:data` 백업 저장 위치.
- `KASPA_REST_API_URL=`: 비워두면 네트워크 기본값을 사용한다.
- `KASPAFLOW_BACKGROUND_SYNC_INTERVAL_MS=15000`: 15초마다 열린 결제를 동기화한다.
- `KASPAFLOW_NOTIFY_WEBHOOK_URL`: 알림 수신 서버가 있을 때만 설정한다.
- `KASPAFLOW_NOTIFY_WEBHOOK_FORMAT`: `json`, `discord`, `telegram` 중 하나.
- `KASPAFLOW_NOTIFY_TELEGRAM_CHAT_ID`: Telegram Bot API webhook을 쓸 때 설정한다.

## 3. 배포 절차

로컬 또는 일반 서버:

```bash
npm ci
npm run build
npm run start
```

Docker Compose:

```bash
export KASPAFLOW_ADMIN_TOKEN=<strong-random-token>
docker compose config
docker compose up --build -d
```

배포 직후 확인:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/kaspa/probe
curl -X POST 'http://localhost:3000/api/payments/sync?silent=1' \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
```

정상 기준:

- `/api/health`의 `ok`가 `true`.
- `kaspaNetwork`가 운영 목적과 일치한다. 실결제는 `mainnet`.
- `watcherMode`가 `kaspa-rest`.
- `backgroundSync.enabled`가 `true`.
- `backgroundSync.lastError`가 `null`.
- `adminAuthRequired`가 production에서 `true`, `adminAuthEnabled`가 외부 배포에서 `true`.
- `simulationEnabled`가 실결제에서 `false`.
- `simulationBlockedInProduction`이 `true`라면 env에 시뮬레이션이 켜졌지만 production에서 차단된 상태이므로 배포 env를 정리한다.
- `quote.source`가 정상 운영 중 `coinone` 또는 `coingecko`.

## 4. 매장 단말 세팅

1. 매장 단말에서 KaspaFlow URL을 연다.
2. Chrome, Edge, Safari에서 홈 화면 추가 또는 앱 설치를 진행한다.
3. 관리자 패널에 `KASPAFLOW_ADMIN_TOKEN` 값을 입력한다.
4. 매장명, 활성 매장, 수신 Kaspa 주소를 확인한다.
5. 소액 결제를 생성해 QR과 직접 주소가 지갑에서 올바르게 열리는지 확인한다.
6. 오프라인 상태에서 설치 앱을 열어 `/offline.html` fallback이 표시되는지 확인한다.

## 5. 실결제 파일럿 체크리스트

1. 아주 작은 KRW 금액으로 결제 요청을 만든다.
2. 외부 Kaspa 지갑에서 표시된 주소로 정확한 KAS 금액을 보낸다.
3. 결제 상태가 `waiting`에서 `seen` 또는 `confirmed`로 바뀌는지 확인한다.
4. 금액이 다르면 `underpaid` 또는 `overpaid` 상태가 되는지 확인한다.
5. `/api/health`에서 background sync 오류가 없는지 다시 확인한다.
6. `/api/sales.csv`를 내려받아 결제 기록이 1회만 들어갔는지 확인한다.
7. 시뮬레이션 결제가 실제 매출 합계에서 분리되는지 확인한다.

## 6. 일상 운영 점검

매일 시작 전:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/errors \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
```

영업 종료 후:

```bash
curl http://localhost:3000/api/analytics \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
curl -o kaspaflow-sales.csv http://localhost:3000/api/sales.csv \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
curl -X POST http://localhost:3000/api/reports/daily \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
```

확인할 항목:

- 열린 결제가 오래 `waiting`, `seen`, `underpaid`에 머물러 있지 않은지 확인한다.
- `/api/errors`에 `failed`, `rejected`, `invalid` 이벤트가 없는지 확인한다.
- 일일 리포트의 `openPayments`, `attentionPayments`, `refunds` 항목을 확인한다.
- 매장 지갑 입금 내역과 KaspaFlow 판매 로그가 맞는지 대조한다.
- `KASPAFLOW_DATA_DIR`를 백업한다.
- webhook을 설정한 경우 일일 리포트 알림이 도착했는지 확인한다.

## 7. 데이터와 백업

`KASPAFLOW_DATA_DIR`에는 운영 데이터가 저장된다.

- `payments.json`
- `audit-events.json`
- 매장 설정 파일
- 지갑 주소록 파일
- 결제 만료 관련 파일

업데이트, 서버 이전, 컨테이너 재생성 전에는 이 디렉터리를 백업한다. Docker
Compose 운영 시 기본 볼륨은 `kaspaflow-data`다. 기본 백업 위치는
`./backups`이며 `KASPAFLOW_BACKUP_DIR`로 바꿀 수 있다.

권장 명령:

```bash
npm run backup:data
```

복구 리허설 또는 복구:

```bash
npm run restore:data -- backups/<backup-file>.tgz
```

대상 `KASPAFLOW_DATA_DIR`가 비어 있지 않으면 기본적으로 중단된다. 실제 복구가
필요할 때만 `--force`를 붙인다. 이 경우 기존 데이터 디렉터리는
`.pre-restore-*` 이름으로 먼저 보존된다.

## 8. 장애 대응

결제 상태가 갱신되지 않을 때:

```bash
curl http://localhost:3000/api/kaspa/probe
curl -X POST 'http://localhost:3000/api/payments/sync?silent=1' \
  -H "x-kaspaflow-admin-token: $KASPAFLOW_ADMIN_TOKEN"
```

- Kaspa REST API가 불안정하면 잠시 후 다시 동기화한다.
- 특정 결제만 이상하면 결제 상세 페이지와 매장 지갑 입금 내역을 함께 확인한다.
- `underpaid` 또는 `overpaid`는 고객 송금액과 요청액이 다른 상태다. 매장 정책에 따라 추가 송금 또는 환불로 처리한다.

관리자 요청이 실패할 때:

- `KASPAFLOW_ADMIN_TOKEN` 환경변수와 브라우저 관리자 패널의 토큰 입력값을 비교한다.
- API 호출에는 `x-kaspaflow-admin-token` 헤더 또는 `Authorization: Bearer <token>`을 사용한다.

가격 조회가 이상할 때:

- `/api/health`의 `quote.source`, `rateKrwPerKas`, `quotedAt`을 확인한다.
- 일시적 외부 API 장애 시 `KAS_PRICE_SOURCE=mock`은 개발용으로만 사용한다.
- 실결제에서 mock 가격을 사용하지 않는다.

## 9. 환불 운영

1. 고객 환불 주소와 환불 사유를 기록한다.
2. 매장 지갑에서 직접 환불 금액을 송금한다.
3. 송금 후 트랜잭션 해시를 KaspaFlow 결제 패널에 입력한다.
4. KaspaFlow가 트랜잭션 출력과 금액을 검증한 결과를 확인한다.
5. 환불 기록은 결제 레코드와 감사 로그에 남는다.

## 10. 테스트넷 리허설

실결제 전에 `docs/testnet-dry-run.md`를 따라 testnet-10으로 리허설한다.

```bash
KASPA_NETWORK=testnet-10
KASPA_WATCHER_MODE=kaspa-rest
KASPAFLOW_ENABLE_SIMULATION=false
```

테스트넷 주소는 `kaspatest:`로 시작해야 한다. 메인넷 주소와 테스트넷 주소를
혼용하지 않는다.

## 11. 운영 전 최종 승인 기준

- 관리자 인증이 켜져 있다.
- 시뮬레이션 기능이 꺼져 있다.
- 매장 수신 주소가 실제 매장 지갑 주소다.
- 소액 실결제 상태 전환이 확인됐다.
- 매출 CSV와 지갑 입금 내역이 일치한다.
- 데이터 디렉터리 백업 절차가 준비됐다.
- 세무, 환불, 회계, 결제 처리 관련 현지 규정 검토가 완료됐다.

다매장 베타로 넘어가기 전에는 `docs/beta-readiness.md`의 gate를 모두 통과해야
한다.
