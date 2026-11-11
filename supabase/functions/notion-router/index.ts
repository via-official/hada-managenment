// notion-router — 웹훅 길잡이 (v2.8.0, 261111)
//
// 학원의 모든 Notion 버튼·자동화가 이 주소 하나·같은 키(x-admin-key)로 보낸다. 동작 ID(헤더 x-hada-action, 주소 ?a=,
// 또는 본문 수식 `웹훅 정보`의 wait 목록)를 보고 기존 함수 주소로 본문을 그대로 넘긴다. 자세한 규칙은
// _shared/webhookRouter.ts, 연결표는 _shared/webhookRoutes.ts(= 관리자 설정 웹훅 체크리스트 항목 ID).
import { handleRouter } from "../_shared/webhookRouter.ts"

Deno.serve((req: Request) => handleRouter(req))
