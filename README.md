# 우리 팀 마니또

Vite + TypeScript 정적 웹, Supabase PostgreSQL의 자체 로그인 RPC를 사용합니다.

## 로컬 실행

Node 24 LTS를 사용합니다. `.env.example`을 `.env.local`로 복사하고 프로젝트 URL과 publishable key를 넣습니다.

```text
npm ci
npm run dev
npm test
npm run build
```

환경 변수가 없으면 설정 안내 화면이 나옵니다. 로컬 화면: http://127.0.0.1:5173/manito/

## DB 설치

Supabase SQL Editor에서 [setup.sql](supabase/setup.sql)을 실행합니다. 현재 파일은 운영자가 요청한 새 설치용 초기화 스크립트입니다. 기존 마니또 테이블 4개와 관련 함수를 정리하고 다시 생성하므로 사용자·활동·예상·세션 데이터가 삭제됩니다. 명단 등록 이후에는 재실행하지 마세요. 실패하면 트랜잭션 전체가 롤백됩니다.

`must be able to SET ROLE "manito_executor"` 오류가 나왔다면 수정된 setup.sql 전체를 다시 복사해 실행합니다. 설치 스크립트가 postgres에 함수 소유권 변경용 역할 멤버십을 부여합니다. anon이나 authenticated에 이 역할을 부여하지 않습니다. 이전 쿼리의 트랜잭션이 중단된 채 남아 있다면 먼저 `ROLLBACK;`을 실행합니다. 설치 완료 후에는 전체 스크립트를 다시 실행하지 않습니다.

pgcrypto는 `extensions` 스키마에 있어야 합니다. 기존 확장 위치는 다음 조회로 확인합니다.

```sql
select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
```

위치가 다르면 무작정 설치하지 말고 SQL의 `extensions` 참조를 실제 위치에 맞춥니다. Data API에 `public`은 노출하되 `manito_private`는 노출하지 않습니다. 서비스의 공개 publishable key는 이 앱 RPC만 호출하며 사용자 테이블은 직접 읽지 못합니다.

원격 DB 설치·실제 RLS/RPC 동작은 현재 세션의 MCP 도구 부재로 아직 검증되지 않았습니다. 운영 전에 아래 DB 테스트를 실행하고 Supabase advisors 결과를 확인하세요.

## 명단 등록

Table Editor의 `manito_users`에 다음 열만 입력합니다. 한 명씩 추가하거나 CSV를 가져올 수 있습니다.

| name | employee_no | is_admin | is_participant |
| --- | --- | --- | --- |
| 운영자 예시 | 001234 | true | false |
| 참가자 예시 | 001235 | false | true |
| 비참가 예시 | 001236 | false | false |

실제 이름·사번으로 총 29명(관리자 1, 참가 팀원 24, 비참가 팀원 4)을 등록합니다. 사번은 문자열로 입력해 앞자리 0을 유지하세요. `employee_no`에 입력한 사번이 그대로 남아 Table Editor에서 확인·수정할 수 있습니다. 앱 응답에는 사번을 포함하지 않습니다. Auth 계정은 만들지 않습니다. 행사 도중 명단과 참가 여부는 변경하지 마세요.

이전 설치에서 사번이 자동으로 비워졌다면 setup.sql을 재실행하지 마세요. SQL Editor에서 [use_plain_employee_numbers.sql](supabase/use_plain_employee_numbers.sql)만 한 번 실행한 뒤 `manito_users.employee_no`에 사번을 다시 입력합니다. 기존 해시로 원문을 복구할 수는 없습니다. 사용자 ID·활동·예상은 유지됩니다. 기존 `credential_hash` 열은 미사용이며 입력할 필요 없습니다. 수정 후 해당 열에는 사번을 넣지 말고 employee_no에만 입력합니다.

## 검증

`supabase/tests.sql`은 가상 계정 기반이며 BEGIN/ROLLBACK으로 테스트 변경을 되돌립니다. 운영 기록이 없는 테스트 DB에서 실행하세요. 동시 요청/모바일/배포 검증은 TASKS.md 체크리스트를 따릅니다. 테스트 세션으로 실제 운영 이벤트를 공개하지 마세요.

## GitHub Pages

저장소 Settings → Pages → Source를 **GitHub Actions**로 지정합니다. `production` Environment의 URL/key를 workflow의 빌드 단계에서 읽습니다(Variables와 Secrets 둘 다 지원). 코드와 lockfile을 main에 반영하면 검사·빌드·배포됩니다. 예상 URL은 https://kellysun99.github.io/manito/ 입니다. 실제 배포 여부는 Actions 성공 결과로 확인합니다.

## 행사 진행

1. 프로젝트가 활성인지 확인하고 링크를 안내합니다.
2. 참가자가 대상과 활동을 저장합니다. 예상 시작 전까지 대상과 내용을 수정할 수 있습니다.
3. 잘못 입력한 대상끼리 교환해야 하면 당사자가 등록 취소 후 다시 등록합니다. 활동 내용은 유지됩니다.
4. 관리자 ‘활동 마감 · 예상 시작’. 현재 참가자로 등록된 사람 모두의 대상 등록이 필요하며 활동 본문 미제출은 허용합니다. 전체 계정 수와 참가 인원에 고정 숫자 제한은 없습니다.
5. 예상 제출과 이유를 받고 ‘예상 마감 · 답 공개’. 예상 미제출자가 있어도 공개할 수 있습니다.
6. 참가자는 개인 결과와 대시보드를 확인합니다.

공개를 되돌리는 앱 기능은 없습니다. 보관 기한과 자동 삭제도 없습니다. 행사 종료 후 원하는 시점에 운영자가 SQL Editor에서 세션, 기록, 설정, 사용자 순서로 직접 정리할 수 있습니다. 세션을 지우면 기존 로그인 토큰은 무효화됩니다. 필요한 기록은 먼저 보존하세요.

## 구성 문서

REQUIREMENTS.md: 기능 요구사항 · DESIGN.md: 구조 · TASKS.md: 구현/검증 진행 상황.


## 참가 인원 변경

전체 계정 수와 참가 인원은 고정하지 않습니다. `is_participant=true`인 현재 명단으로 대상·활동·예상 집계의 분모를 계산합니다. 기존 DB에 고정 인원 검사 함수가 설치돼 있다면 `supabase/fix_activity_close.sql`만 다시 실행하세요. 명단과 기록은 삭제하지 않습니다. 명단을 바꿨다면 기존 대상 관계도 유효한 참가자를 가리키는지 확인하세요.
