// All network calls are mocked. No live Notion/Supabase writes or secret values are used.
for (const [key, value] of Object.entries({ NOTION_TOKEN: "test-only", ADMIN_SECRET: "test-only", SB_URL: "https://mock.supabase", SB_SERVICE_ROLE_KEY: "test-only", DATA_SOURCE_REGISTRATION_ID: "registrations", DATA_SOURCE_ATTENDANCE_ID: "attendance", DATA_SOURCE_LEARNING_RECORD_ID: "records", DATA_SOURCE_STUDY_ACTIVITY_ID: "activities", DATA_SOURCE_PROGRESS_BOOK_ID: "books" })) Deno.env.set(key, value)
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
const m = await import("./classReportCacheTarget.ts")
const { classReportCacheDeps: deps } = m
const original = { ...deps }
const noCache = (_id: string) => Promise.resolve(null)

function mock(o: { regs?: any[]; lastError?: string; failSync?: string[] } = {}) {
	Object.assign(deps, original)
	const calls = { enqueued: [] as any[], synced: [] as string[], updates: [] as any[], status: [] as string[] }
	deps.queryAllPages = (() => Promise.resolve(o.regs ?? [])) as any
	deps.enqueue = ((target: string, payload: any) => { calls.enqueued.push({ target, payload }); return Promise.resolve() }) as any
	deps.sync = ((id: string) => {
		if (o.failSync?.includes(id)) return Promise.reject(new Error("끊김"))
		calls.synced.push(id)
		return Promise.resolve(null)
	}) as any
	deps.update = ((id: string, props: any) => { calls.updates.push({ id, props }); return Promise.resolve({}) }) as any
	deps.getPage = (() => Promise.resolve({ properties: { "마지막 오류": { rich_text: o.lastError ? [{ plain_text: o.lastError }] : [] } } })) as any
	deps.markRunning = ((id: string) => { calls.status.push(`running:${id}`); return Promise.resolve() }) as any
	deps.markDone = ((id: string) => { calls.status.push(`done:${id}`); return Promise.resolve() }) as any
	deps.markError = ((id: string) => { calls.status.push(`error:${id}`); return Promise.resolve() }) as any
	return calls
}

Deno.test("v2.8.0 반 동기화: 반 1건은 계산하지 않고 학생마다 큐 1건, 마지막에만 last", async () => {
	const calls = mock({ regs: [{ id: "r1" }, { id: "gone", in_trash: true }, { id: "r2" }] })
	await m.processSyncClassReportCacheQueueItem({ classId: "cls" })
	eq(calls.enqueued, [
		{ target: "registration-report-cache", payload: { classId: "cls", regId: "r1" } },
		{ target: "registration-report-cache", payload: { classId: "cls", regId: "r2", last: true } },
	])
	eq(calls.synced, [])
	// 반 상태는 마지막 학생이 정하므로 여기서는 작업중까지만.
	eq(calls.status, ["running:cls"])
})

Deno.test("v2.8.0 반 동기화: 토큰 있는 학생이 없으면 바로 완료", async () => {
	const calls = mock({ regs: [] })
	await m.processSyncClassReportCacheQueueItem({ classId: "cls" })
	eq(calls.enqueued, [])
	eq(calls.status, ["running:cls", "done:cls"])
})

Deno.test("v2.8.0 반 동기화: 학생 1건은 그 학생만 계산, 마지막 학생에서 반 완료", async () => {
	const calls = mock()
	await m.processRegistrationReportCacheQueueItem({ classId: "cls", regId: "r1" }, noCache)
	eq(calls.synced, ["r1"])
	eq(calls.status, [])
	await m.processRegistrationReportCacheQueueItem({ classId: "cls", regId: "r2", last: true }, noCache)
	eq(calls.synced, ["r1", "r2"])
	eq(calls.status, ["done:cls"])
})

Deno.test("v2.8.0 반 동기화: 중간 학생이 실패하면 오류 문장을 남기고 큐가 다시 시도, 마지막 학생에서 ⚠️", async () => {
	const calls = mock({ failSync: ["r1"] })
	let thrown = ""
	await m.processRegistrationReportCacheQueueItem({ classId: "cls", regId: "r1" }, noCache).catch((e: Error) => { thrown = e.message })
	eq(thrown, "끊김")
	eq(calls.updates.length, 1)
	eq(calls.updates[0].props["마지막 오류"].rich_text[0].text.content, "학생 페이지 동기화 실패(다시 누르면 다시 계산합니다): 끊김")
	eq(calls.status, [])
	const calls2 = mock({ lastError: "앞 학생 실패" })
	await m.processRegistrationReportCacheQueueItem({ classId: "cls", regId: "r2", last: true }, noCache)
	eq(calls2.synced, ["r2"])
	eq(calls2.status, ["error:cls"])
})

Deno.test("v2.8.0 반 동기화: 마지막 학생이 실패해도 반 상태가 작업중에 남지 않는다", async () => {
	const calls = mock({ failSync: ["r2"] })
	await m.processRegistrationReportCacheQueueItem({ classId: "cls", regId: "r2", last: true }, noCache).catch(() => {})
	eq(calls.status, ["error:cls"])
})
