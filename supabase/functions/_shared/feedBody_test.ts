// (v2.8.0 가정통신문) 본문 변환: 콜아웃·중첩 블록의 하위 내용이 사라지지 않는다.
import { blocksToFeedBody, feedBodyDeps } from "./feedBody.ts"

const rt = (text: string) => [{ plain_text: text, annotations: {} }]
const para = (id: string, text: string, has_children = false) => ({ id, type: "paragraph", has_children, paragraph: { rich_text: rt(text) } })
const callout = (id: string, text: string) => ({ id, type: "callout", has_children: true, callout: { rich_text: rt(text), icon: { type: "emoji", emoji: "📌" } } })

function children(map: Record<string, any[]>) {
	feedBodyDeps.getBlockChildren = (id: string) => Promise.resolve(map[id] ?? []) as any
}
const shape = (items: any[]): unknown[] => items.map((i) => i.children ? [i.style, i.text, shape(i.children)] : [i.style, i.text])
function eq(a: unknown, b: unknown) {
	if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`다름\n 실제: ${JSON.stringify(a)}\n 기대: ${JSON.stringify(b)}`)
}

Deno.test("v2.8.0 본문: 콜아웃의 둘째 줄부터(하위 블록)와 글이 하위에만 있는 콜아웃을 싣는다", async () => {
	children({ c1: [para("p1", "둘째 줄")], c2: [para("p2", "하위 글")] })
	eq(shape(await blocksToFeedBody([callout("c1", "첫 줄"), callout("c2", "")]) as any[]), [
		["callout", "첫 줄", [["paragraph", "둘째 줄"]]],
		["callout", "", [["paragraph", "하위 글"]]],
	])
})

Deno.test("v2.8.0 본문: 중첩 글·단은 이어 붙이고, 깊이 3단계를 넘으면 더 읽지 않는다", async () => {
	children({
		col: [{ id: "c", type: "column", has_children: true, column: {} }],
		c: [para("in", "단 안 글")],
		a: [para("b", "2", true)],
		b: [para("d", "3", true)],
		d: [para("e", "4", true)],
		e: [para("f", "5")],
	})
	eq(shape(await blocksToFeedBody([{ id: "col", type: "column_list", has_children: true, column_list: {} }, para("a", "1", true)]) as any[]), [
		["paragraph", "단 안 글"],
		["paragraph", "1"],
		["paragraph", "2"],
		["paragraph", "3"],
		["paragraph", "4"],
	])
})

Deno.test("v2.8.0 본문: 하위 조회가 실패해도 부모 글은 남는다", async () => {
	feedBodyDeps.getBlockChildren = () => Promise.reject(new Error("notion down")) as any
	eq(shape(await blocksToFeedBody([callout("c1", "첫 줄")]) as any[]), [["callout", "첫 줄"]])
})
