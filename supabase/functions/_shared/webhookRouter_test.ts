// 웹훅 길잡이 시험: 연결표가 관리자 설정 체크리스트와 같은지, 동작 ID를 제대로 뽑는지, 기존 함수로 그대로 넘기는지.
import { WEBHOOK_ROUTES, resolveActions, routeById, targetUrl } from "./webhookRoutes.ts"
import { handleRouter, type RouterDeps } from "./webhookRouter.ts"

function assert(cond: unknown, msg = "assertion failed"): asserts cond { if (!cond) throw new Error(msg) }
const eq = (a: unknown, b: unknown, msg?: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg ?? ""} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)

Deno.test("연결표 = 관리자 설정 웹훅 체크리스트(ID·함수·경로·순서)", async () => {
  const js = await Deno.readTextFile(new URL("../../../admin_settings.js", import.meta.url))
  const block = js.slice(js.indexOf("const CHECKLIST=["), js.indexOf("function route("))
  const items = [...block.matchAll(/\['([a-z0-9-]+)','[^']*',(BUTTON|AUTO),route\('([a-z-]+)'\)(,(\{[^\n]*?)\])?/g)].map((m) => {
    const path = /path:'([^']*)'/.exec(m[5] ?? "")
    return [m[1], m[3], path ? path[1] : ""]
  })
  eq(WEBHOOK_ROUTES.map((r) => [r.id, r.fn, r.path]), items, "routes")
  assert(new Set(WEBHOOK_ROUTES.map((r) => r.id)).size === WEBHOOK_ROUTES.length, "ids unique")
})

Deno.test("동작 ID: 헤더·수식(wait 배열·문자열)·중복·모르는 ID", () => {
  const h = new Headers({ "x-hada-action": "reg-link-regenerate, nope" })
  const body = { data: { id: "p1", properties: { "웹훅 정보": { type: "formula", formula: { type: "string", string: '{"db":"REG","wait":["reg-textbook-queue","reg-link-regenerate","x"]}' } } } } }
  const r = resolveActions(h, body)
  eq(r.ids, ["reg-link-regenerate", "reg-textbook-queue"])
  eq(r.unknown, ["nope", "x"])
  eq(resolveActions(new Headers(), { data: { properties: { "웹훅 정보": { formula: { string: '{"wait":"session-delete, session-attendance-queue"}' } } } } }).ids, ["session-delete", "session-attendance-queue"])
  eq(resolveActions(new Headers(), { data: { properties: { "웹훅 정보": { formula: { string: '{"wait":[]}' } } } } }).ids, [])
  eq(resolveActions(new Headers(), {}).ids, [])
})

Deno.test("주소: 경로·쿼리 붙이기", () => {
  eq(targetUrl("https://x.supabase.co/", routeById("reg-link-regenerate")!), "https://x.supabase.co/functions/v1/toggle-report-link?action=regenerate")
  eq(targetUrl("https://x.supabase.co", routeById("cart-progress-book")!), "https://x.supabase.co/functions/v1/sync-textbook-distribution/from-cart/queue")
})

function deps(over: Partial<RouterDeps> & { calls?: any[]; status?: number | ((url: string) => number) } = {}): RouterDeps {
  const calls = over.calls ?? []
  return {
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers, body: init.body })
      const st = typeof over.status === "function" ? over.status(url) : (over.status ?? 202)
      if (st === 0) throw new Error("network")
      return new Response("{}", { status: st })
    }) as unknown as typeof fetch,
    baseUrl: () => "https://x.supabase.co",
    currentKey: async () => "k",
    authorize: over.authorize ?? (async (_r, p, l) => p === l),
    log: () => {},
  }
}
const req = (body: unknown, headers: Record<string, string> = {}, q = "") =>
  new Request("https://x.supabase.co/functions/v1/notion-router" + q, { method: "POST", headers: { "content-type": "application/json", "x-admin-key": "k", ...headers }, body: JSON.stringify(body) })

Deno.test("키가 틀리면 401, 아무것도 넘기지 않음", async () => {
  const calls: any[] = []
  const res = await handleRouter(req({}, { "x-admin-key": "bad", "x-hada-action": "reg-report-sync" }), deps({ calls }))
  eq(res.status, 401); eq(calls.length, 0)
})

Deno.test("본문 adminKey도 키로 받음(버튼이 헤더를 못 보낼 때)", async () => {
  const calls: any[] = []
  const r = new Request("https://x.supabase.co/functions/v1/notion-router?a=reg-report-sync", { method: "POST", body: JSON.stringify({ adminKey: "k", data: { id: "p" } }) })
  const res = await handleRouter(r, deps({ calls }))
  eq(res.status, 202); eq(calls.length, 1)
  assert((calls[0].headers as Record<string, string>)["x-admin-key"] === "k")
})

Deno.test("수식 wait 두 개 → 두 함수로 본문 그대로 넘김", async () => {
  const calls: any[] = []
  const body = { source: { type: "automation" }, data: { id: "pg", properties: { "웹훅 정보": { formula: { string: '{"db":"SES","wait":["session-attendance-queue","session-delete"]}' } } } } }
  const res = await handleRouter(req(body), deps({ calls }))
  eq(res.status, 202)
  eq(calls.map((c) => c.url).sort(), ["https://x.supabase.co/functions/v1/cascade-delete", "https://x.supabase.co/functions/v1/fix-attendance/queue"])
  assert(calls.every((c) => c.body === JSON.stringify(body)), "body forwarded unchanged")
  const j = await res.json(); eq(j.pageId, "pg")
})

Deno.test("?a= 주소 꼬리와 헤더를 합침", async () => {
  const calls: any[] = []
  const res = await handleRouter(req({ data: { id: "p" } }, { "x-hada-action": "reg-link-disable" }, "?a=reg-report-sync"), deps({ calls }))
  eq(res.status, 202); eq(calls.length, 2)
})

Deno.test("동작이 없으면 400", async () => {
  const res = await handleRouter(req({ data: { id: "p" } }), deps())
  eq(res.status, 400)
})

Deno.test("넘기기 실패(5xx·네트워크)면 502 — Notion이 다시 보냄. 4xx는 함수가 판단한 것이라 202", async () => {
  eq((await handleRouter(req({}, { "x-hada-action": "reg-report-sync" }), deps({ status: 500 }))).status, 502)
  eq((await handleRouter(req({}, { "x-hada-action": "reg-report-sync" }), deps({ status: 0 }))).status, 502)
  eq((await handleRouter(req({}, { "x-hada-action": "reg-report-sync" }), deps({ status: 400 }))).status, 202)
  const mixed = await handleRouter(req({}, { "x-hada-action": "reg-report-sync,reg-link-regenerate" }), deps({ status: (u) => u.includes("toggle") ? 503 : 202 }))
  eq(mixed.status, 502)
})

Deno.test("GET은 405", async () => {
  eq((await handleRouter(new Request("https://x/functions/v1/notion-router"), deps())).status, 405)
})
