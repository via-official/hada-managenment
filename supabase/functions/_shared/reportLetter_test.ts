// (v2.8.0) 학부모 리포트 가정통신문: 반마다 보낸 달 목록과 그 반의 본문.
import { buildLetterList, buildLetterView, reportLetterDeps } from "./reportLetter.ts"

function eq(a: unknown, b: unknown) {
	if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`다름\n 실제: ${JSON.stringify(a)}\n 기대: ${JSON.stringify(b)}`)
}
const rel = (...ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })), has_more: false })
const letter = (id: string, reg: string, month: string, box?: string) => ({
	id,
	properties: { "기간": { date: { start: `${month}-01` } }, "등록": rel(reg), "알림톡 발송함": rel(...(box ? [box] : [])) },
})

function mock(rows: Record<string, any[]>, opts: { memos?: Record<string, string>; bodies?: Record<string, unknown[]>; lines?: any[] } = {}) {
	const filters: any[] = []
	const eventRegs: string[][] = []
	Object.assign(reportLetterDeps, {
		dataSourceId: () => Promise.resolve("ds"),
		queryAllPages: (_ds: string, filter: any) => {
			filters.push(filter)
			return Promise.resolve(rows[filter.and[0].relation.contains] ?? [])
		},
		events: (_s: string, _m: string, regs: any[]) => {
			eventRegs.push(regs.map((r) => r.id))
			return Promise.resolve(opts.lines ?? [])
		},
		getPage: (id: string) => Promise.resolve({ id, properties: { "가정통신문 전달사항": { rich_text: opts.memos?.[id] ? [{ plain_text: opts.memos[id] }] : [] } } }),
		body: (id: string) => Promise.resolve(opts.bodies?.[id] ?? []),
	})
	return { filters, eventRegs }
}

const twoClasses = {
	r1: [letter("a", "r1", "2026-12", "box1"), letter("old", "r1", "2026-10", "box9"), { ...letter("x", "r1", "2026-09"), in_trash: true }],
	r2: [letter("c", "r2", "2026-12", "box2")],
}

Deno.test("v2.8.0 가정통신문 목록: 반(등록)마다 보낸 달만, 최근 달부터", async () => {
	const { filters } = mock(twoClasses)
	eq(await buildLetterList(["r1", "r2"]), [
		{ month: "2026-12", registrationId: "r1" },
		{ month: "2026-10", registrationId: "r1" },
		{ month: "2026-12", registrationId: "r2" },
	])
	eq(filters[0].and[1], { property: "안내문 전송 상태", select: { equals: "✅ 완료" } })
})

Deno.test("v2.8.0 가정통신문 목록: 등록이 없으면 조회하지 않고, 조회 실패해도 동기화를 막지 않는다", async () => {
	const { filters } = mock({})
	eq(await buildLetterList([]), [])
	eq(filters.length, 0)
	reportLetterDeps.queryAllPages = () => Promise.reject(new Error("notion down"))
	eq(await buildLetterList(["r1"]), [])
})

Deno.test("v2.8.0 가정통신문 본문: 연 반의 일정·전달사항·반 본문·학생별 본문만 보이고, 파일 blockId는 뺀다", async () => {
	const { eventRegs } = mock(twoClasses, {
		memos: { box1: "수학 보강을 엽니다.", box2: "영어 안내" },
		bodies: {
			box1: [{ type: "paragraph", text: "수학 안내" }, { type: "pdf", blockId: "blk", url: "https://f/a.pdf", name: "a.pdf" }],
			box2: [{ type: "paragraph", text: "영어 안내" }],
			a: [{ type: "paragraph", text: "서아 수학 안내" }],
			c: [{ type: "paragraph", text: "서아 영어 안내" }],
		},
		lines: [
			{ id: "1", day: "2026-12-24", line: "12/24(목) 방학", sec: "휴원" },
			{ id: "2", day: "2026-12-19", line: "12/19(토) 특강", sec: "학원" },
			{ id: "3", day: "2026-12-05", line: "12/5(토) 설명회", sec: "학원" },
		],
	})
	const v = await buildLetterView("r1", "s1", "2026-12")
	eq(v?.label, "12월")
	eq(eventRegs, [["r1"]])
	eq(v?.schedule, { rest: ["12.24(목)  방학"], academy: ["12.05(토)  설명회", "12.19(토)  특강"], school: [] })
	eq(v?.note, "수학 보강을 엽니다.")
	eq(v?.classBody, [{ type: "paragraph", text: "수학 안내" }, { type: "pdf", url: "https://f/a.pdf", name: "a.pdf" }])
	eq(v?.studentBody, [{ type: "paragraph", text: "서아 수학 안내" }])
})

Deno.test("v2.8.0 가정통신문 본문: 두 반에 같은 내용을 적어도 합치지 않고, 빈 반은 비어 있다", async () => {
	mock(twoClasses, { bodies: { box1: [{ type: "paragraph", text: "공용" }] } })
	eq((await buildLetterView("r1", "s1", "2026-12"))?.classBody, [{ type: "paragraph", text: "공용" }])
	eq((await buildLetterView("r2", "s1", "2026-12"))?.classBody, [])
})

Deno.test("v2.8.0 가정통신문 본문: 보낸 장이 없는 달은 null, 발송함이 없어도 열린다", async () => {
	mock({ r1: [letter("a", "r1", "2026-12")] })
	eq(await buildLetterView("r1", "s1", "2026-11"), null)
	const v = await buildLetterView("r1", "s1", "2026-12")
	eq(v?.note, "")
	eq(v?.classBody, [])
})
