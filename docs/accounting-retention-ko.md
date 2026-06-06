# KaspaFlow 회계/보관 운영 기준

이 문서는 KaspaFlow 파일럿과 베타 운영에서 매출과 환불 기록을 나중에 재구성하기
위한 내부 기준이다. 세무, 회계, 결제 처리, 가상자산 관련 법률 자문을 대체하지
않는다.

## 보관 목표

각 판매 건은 다음 자료로 재구성할 수 있어야 한다.

- KaspaFlow payment ID
- 고객 결제 tx hash
- 매장 수신 Kaspa 주소
- 주문 fiat 금액과 통화
- 적용 KAS 환율과 quote timestamp
- 요청 KAS 금액과 실제 수신 KAS 금액
- 결제 상태
- 매출 CSV row
- 매장 지갑 입금 내역
- 환불이 있으면 환불 tx hash와 사유

## 일일 마감 절차

1. `상태 확인` 또는 `전체 동기화`를 실행한다.
2. `만료 정리`를 실행한다.
3. `확인 필요 결제` 큐가 비었는지 확인한다.
4. `일일 리포트`를 전송한다.
5. `/api/sales.csv`를 내려받아 날짜별 폴더에 저장한다.
6. 매장 지갑의 당일 KAS 입금 내역을 내려받거나 캡처한다.
7. `npm run backup:data`로 운영 데이터를 백업한다.
8. `openPayments`, `attentionPayments`, `refunds`가 남아 있으면 인계 메모를 남긴다.

## 파일명 기준

권장 파일명:

- `YYYY-MM-DD_sales_kaspaflow.csv`
- `YYYY-MM-DD_wallet_deposits.csv`
- `YYYY-MM-DD_daily_report.json`
- `YYYY-MM-DD_refunds.csv`
- `YYYY-MM-DD_kaspaflow-data.tgz`

## 대조 기준

매출 CSV와 지갑 내역을 다음 기준으로 대조한다.

- `confirmed`, `overpaid`만 실제 매출 합계에 포함한다.
- `simulated=true`는 실제 매출에서 제외한다.
- `expired`는 매출 합계에서 제외한다.
- `underpaid`는 매장 정책에 따라 추가 송금 또는 환불 처리가 끝나기 전까지 보류한다.
- `overpaid`는 주문 금액은 매출로 보고, 초과분은 환불 또는 별도 처리 여부를 기록한다.
- 환불은 원 결제 ID와 환불 tx hash가 함께 있어야 한다.

## 최소 보관 기간

파일럿 기본값:

- 매출 CSV: 최소 5년 또는 현지 세무 기준 중 더 긴 기간
- 지갑 입금/출금 내역: 최소 5년 또는 현지 세무 기준 중 더 긴 기간
- KaspaFlow 데이터 백업: 파일럿 기간 전체와 종료 후 최소 1년
- 감사 로그: 파일럿 기간 전체와 종료 후 최소 1년

정식 운영 전에는 현지 세무사 또는 법무 검토를 통해 기간을 확정한다.

## 환불 기록

환불 건마다 다음 항목을 보관한다.

- 원 payment ID
- 원 결제 tx hash
- 환불 customer address
- 환불 KAS 금액
- 환불 tx hash
- 환불 사유
- 승인자
- 환불 검증 상태

환불은 KaspaFlow가 송금하지 않는다. 매장 지갑에서 직접 송금하고, KaspaFlow에는
검증 가능한 기록만 남긴다.

## 접근 권한

- 관리자 토큰은 매장 책임자와 지정 직원만 사용한다.
- CSV, 백업 파일, 지갑 내역은 고객에게 공유하지 않는다.
- 백업 위치는 운영자만 접근 가능한 저장소를 사용한다.
- Discord/Telegram 알림에 개인정보나 민감한 지갑 관리 정보가 들어가지 않게 한다.

## 베타 전환 전 확인

- 이 문서의 보관 절차를 실제 영업일 1회 이상 리허설했다.
- CSV와 매장 지갑 입금 내역이 payment ID 기준으로 대조됐다.
- 환불 기록 샘플이 원 결제와 연결된다.
- 백업 파일에서 `npm run restore:data` 리허설이 성공했다.
- 현지 세무/회계/법무 검토가 완료됐다.
