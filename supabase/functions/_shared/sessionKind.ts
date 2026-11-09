// (v2.8.0 구역, 10/30 사용자) 수업의 종류. 수업 DB 선택 속성 `수업 구분`(정규·보강·휴강)을 본다.
// 값이 비어 있으면 정규로 본다. 예전 `보강` 체크박스는 수업 DB에서 없어졌다(학습기록의 `보강` 체크박스는 그대로).
export const SESSION_KIND_PROP = "수업 구분"
export const SESSION_KIND_REGULAR = "정규"
export const SESSION_KIND_MAKEUP = "보강"

export type SessionKind = "보강" | "휴강" | ""

export function sessionKind(session: any): SessionKind {
	const sel = String(session?.properties?.[SESSION_KIND_PROP]?.select?.name ?? "").trim()
	return sel === "보강" || sel === "휴강" ? sel : ""
}

export const isMakeupSession = (session: any) => sessionKind(session) === "보강"
