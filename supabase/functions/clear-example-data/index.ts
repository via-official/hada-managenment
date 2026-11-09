// POST /functions/v1/clear-example-data
// (v2.8.0) 관리자 설정 화면의 "예시 데이터 비우기"(새 학원 최초 설치 때 한 번). 관리자 로그인 세션만 받는다.
//   action "state": 진행·잠김 상태만(가벼움, 대시보드용)
//   action "status": 워크스페이스 이름, 비울 DB별 건수, 진행·잠김 상태
//   action "start" + workspace + dbs(고른 DB 이름): 워크스페이스 이름이 맞으면 큐에 넣고 바로 답한다(실제 삭제는 process-sync-queue)
//   action "stop": 진행 중이면 멈춘다(처리 중인 묶음까지만 지운다)
// 지울 DB 목록과 잠금 규칙은 _shared/exampleClear.ts.
import { CORS_HEADERS, requireAdminKey } from "../_shared/adminShared.ts"
import { canStart, ClearError, KEEP_DBS, readFlag, start, status, stop } from "../_shared/exampleClear.ts"

const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "POST만 받습니다." }, 405)
  const authError = await requireAdminKey(req)
  if (authError) return authError
  const body = await req.json().catch(() => ({}))
  try {
    if (body.action === "state") {
      const { value, updatedAt } = await readFlag()
      return json({ flag: value, updatedAt, canStart: canStart(value, updatedAt), keep: KEEP_DBS })
    }
    if (body.action === "status") return json(await status())
    if (body.action === "start") return json(await start(String(body.workspace ?? ""), body.dbs))
    if (body.action === "stop") return json({ flag: await stop() })
    return json({ error: "알 수 없는 요청입니다." }, 400)
  } catch (err) {
    if (err instanceof ClearError) return json({ error: err.message }, err.status)
    console.error("[clear-example-data]", (err as Error)?.message)
    return json({ error: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500)
  }
})
