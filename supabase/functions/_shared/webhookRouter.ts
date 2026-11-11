// _shared/webhookRouter.ts
//
// (v2.8.0, 261111) 웹훅 길잡이 본체. 학원의 모든 Notion 버튼·자동화가 같은 주소(notion-router)·같은 키로 보내면,
// 동작을 알아내(webhookRoutes.ts) 기존 함수 주소로 본문을 그대로 넘긴다.
//
// 원칙(설계: 길잡이 = 디스펜서)
// - Notion을 부르지 않는다. 받은 본문을 손대지 않고 넘긴다(기존 함수가 지금처럼 pageId·수식 속성을 읽는다).
// - 기존 함수의 잠금·상태·큐는 그대로다(이미 처리 중이면 그 함수가 already_processing으로 건너뜀).
// - 넘기기가 실패(네트워크·5xx)하면 502로 답해 Notion이 다시 보내게 한다. 모르는 동작은 기록만 하고 무시한다.
// - 기존 함수별 주소는 계속 살아 있다. 길잡이를 끄면 자동화 주소만 예전 주소로 되돌리면 된다.

import { authorizeKey, securityEnabled } from "./adminSecurity.ts"
import { getCurrentAdminKey, resolveAdminKeyFromRequest } from "./adminShared.ts"
import { resolveActions, routeById, targetUrl, ACTION_HEADER } from "./webhookRoutes.ts"

export type RouterDeps = {
  fetch: typeof fetch
  baseUrl: () => string
  currentKey: () => Promise<string>
  authorize: (req: Request, provided: string, legacy: string) => Promise<boolean>
  log: (msg: string, data?: unknown) => void
}

export const defaultRouterDeps: RouterDeps = {
  fetch: (...a) => fetch(...a),
  baseUrl: () => Deno.env.get("SB_URL") ?? "",
  currentKey: () => (securityEnabled() ? Promise.resolve("") : getCurrentAdminKey()),
  authorize: authorizeKey,
  log: (msg, data) => console.log(`[notion-router] ${msg}`, data === undefined ? "" : JSON.stringify(data).slice(0, 2000)),
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

export async function handleRouter(req: Request, deps: RouterDeps = defaultRouterDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST 요청만 받습니다." }, 405)
  const raw = await req.text()
  let body: any = {}
  try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }

  const provided = resolveAdminKeyFromRequest(req, body) ?? ""
  if (!provided || !await deps.authorize(req, provided, await deps.currentKey())) {
    return json({ error: "unauthorized" }, 401)
  }

  // 버튼은 헤더를 못 보낼 때가 있어 주소 끝 ?a=동작ID 도 받는다.
  const headers = new Headers(req.headers)
  const q = new URL(req.url).searchParams.get("a")
  if (q) headers.set(ACTION_HEADER, [headers.get(ACTION_HEADER), q].filter(Boolean).join(","))
  const { ids, unknown } = resolveActions(headers, body)
  const pageId = body?.data?.id ?? null
  if (unknown.length) deps.log("모르는 동작(무시)", { unknown, pageId })
  if (!ids.length) {
    deps.log("동작 없음", { pageId, source: body?.source ?? null })
    return json({ ok: false, error: "동작을 찾지 못했습니다(x-hada-action 헤더·?a=·웹훅 정보 수식)", unknown }, 400)
  }

  const base = deps.baseUrl()
  if (!base) return json({ ok: false, error: "SB_URL이 설정되지 않았습니다." }, 503)
  const results = await Promise.all(ids.map(async (id) => {
    const route = routeById(id)!
    try {
      const res = await deps.fetch(targetUrl(base, route), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": provided },
        body: raw || "{}",
        signal: AbortSignal.timeout(25000),
      })
      return { id, fn: route.fn + route.path, status: res.status }
    } catch (err) {
      return { id, fn: route.fn + route.path, status: 0, error: (err as Error).message }
    }
  }))
  deps.log("넘김", { pageId, results, unknown })
  const failed = results.filter((r) => r.status === 0 || r.status >= 500)
  return json({ ok: failed.length === 0, pageId, results, unknown }, failed.length ? 502 : 202)
}
