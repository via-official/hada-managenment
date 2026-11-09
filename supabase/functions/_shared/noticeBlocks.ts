// (v2.8.0 알림톡 통일안) 템플릿의 "상황 블록 변수"를 만든다. 늘 들어가는 줄을 바탕에 두고, 있을 때만 붙는 줄·구역
// (📅 기존 결석·🔁 보강 일시, 📝 전달사항, 일정 구역 등)은 여기서 붙인다. 🔁는 "다시 하는 수업"(보강) 날짜에만 쓴다(10/31 사용자). 한 줄 항목은 "이모지 라벨  값"(두 칸).
// 변수 값은 그 알림톡을 보내는 페이지의 "변수이름(알림톡)" 수식 속성을 먼저 쓰고(alimtalkVar), 없거나 비면 옛 이름,
// 그것도 없으면 서버 계산값. 날짜·시각이 든 블록은 수식을 읽지 않는다(Notion API가 수식의 날짜를 UTC로 계산한다).
import { getFormulaText } from "./alimtalkShared.ts"
import type { AlimtalkConfigCategory } from "./adminShared.ts"

export const NO_NOTE = "없음"

// 템플릿 변수 하나의 값: "이름(알림톡)" → 옛 이름(있으면) → 계산값.
// 앞 공백은 남긴다: 목록 블록 첫 줄 "  • …"·반 하나 "  수학반"의 두 칸이 값의 맨 앞이다(10/29 실발송에서 첫 줄 들여쓰기가 빠짐).
const keepLead = (v: string) => (v.trim() ? v.replace(/\s+$/, "") : "")
// (11/2) 출석 페이지의 학생 이름·반·출결. 예전 `학생이름(보고서)`·`클래스(보고서)`·`출석상태(보고서)` 수식 대신
// `(알림톡)` 수식과 `출석 상태` 선택값을 읽는다(예전 수식은 지울 예정). 이름이 비면 출석 제목의 첫 낱말(학생 이름).
export function attendanceBasics(page: any): { studentName: string; className: string; status: string } {
	const title = (Object.values(page?.properties ?? {}) as any[]).find((p) => p?.type === "title")
	const titleText = (title?.title ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("").trim()
	return {
		studentName: getFormulaText(page, "학생이름(알림톡)").trim() || titleText.split(" ")[0] || "",
		className: getFormulaText(page, "클래스(알림톡)").trim(),
		status: String(page?.properties?.["출석 상태"]?.select?.name ?? "").trim(),
	}
}

export function alimtalkVar(page: any, name: string, fallback: string, legacy?: string): string {
	const own = keepLead(getFormulaText(page, `${name}(알림톡)`))
	if (own) return own
	const old = legacy ? keepLead(getFormulaText(page, legacy)) : ""
	return old || fallback
}

const line = (emoji: string, label: string, value: string) => `${emoji} ${label}  ${value}`

// "26.10.12(월) 18:00" → "26.10.12(월)"
export const dateOnly = (text: string) => text.replace(/ \d{2}:\d{2}$/, "")

// 가정통신문 #{클래스목록}: 반 하나면 "  중2 B"(템플릿 "🏛 클래스" 바로 뒤에 붙음), 둘 이상이면 줄바꿈 + "· 반" 목록.
// (10/29 사용자) 알림톡 목록 줄은 모두 두 칸 들여 "  • 내용"(일일 보고서 학습내용·Notion 텍스트 목록과 같은 모양).
export const BULLET = "  • "

// 일일 보고서 #{등원정보}: [📅 기존 결석한 날] + 수업일(보강이면 🔁, 아니면 📅) + ✅ 출결상태.
// (10/29 사용자) 출석 상태 "보강"은 "출석(보강)"으로 쓴다("출결 보강"은 뜻이 바로 안 읽힌다).
export function arrivalBlock(o: { classDate: string; status: string; makeupOf?: string }): string {
	return [
		...(o.makeupOf ? [line("📅", "기존", `${o.makeupOf} 결석`)] : []),
		line(o.makeupOf ? "🔁" : "📅", "수업일", o.classDate),
		// 출석 상태 앞의 색 이모지("🟢 출석")는 뺀다. 줄 머리가 이미 ✅다.
		line("✅", "출결", attendanceLabel(o.status)),
	].join("\n")
}

// (11/2 시험 발송) 출석 `출석상태(보고서)` 수식은 옛 템플릿용이라 둘째 줄에 "📝 과제상태: …"가 붙는다. 첫 줄(출결)만 쓴다.
function attendanceLabel(status: string): string {
	const s = status.trim().split("\n")[0].trim().replace(/^[^\p{L}\p{N}\s]+\s*/u, "")
	return s === "보강" ? "출석(보강)" : s || "-"
}

// (v2.8.0 구역, 10/30 사용자) 일일 학습·활동 보고서의 구역 변수. 값은 출석 `학습준비(알림톡)`·`학습기록(알림톡)`·
// `학습결과(알림톡)` 수식을 그대로 따른다. 서버는 모양을 만들지 않고, 수식이 비었을 때만 기본 문구를 넣는다(솔라피는 빈 변수를 못 보냄).
export const DAILY_SECTION_DEFAULTS = {
	prep: "확인한 과제·루틴이 없습니다.",
	result: "오늘은 평가와 새 과제가 없습니다.",
}
export function dailySectionVars(page: any, status: string): Record<string, string> {
	return {
		"#{학습준비}": alimtalkVar(page, "학습준비", DAILY_SECTION_DEFAULTS.prep),
		"#{학습기록}": alimtalkVar(page, "학습기록", studyContentOrDefault("", status)),
		"#{학습결과}": alimtalkVar(page, "학습결과", DAILY_SECTION_DEFAULTS.result),
	}
}

// 일일 보고서 본문은 1,000자까지다(넘으면 솔라피가 거절). 새 구역 템플릿의 고정 글자([기본 정보]·라벨·구역 머리)는 80자 안팎.
// 넘으면 4단계 세부 줄(`  • …`)을 학습기록 → 학습준비 → 학습결과 순으로 빼고, 학습기록 끝에 리포트 안내 한 줄을 붙인다.
export const DAILY_BODY_LIMIT = 1000
const DAILY_FIXED_CHARS = 80
const DAILY_LENGTH_KEYS = ["#{학생이름}", "#{클래스}", "#{등원정보}", "#{학습준비}", "#{학습기록}", "#{학습결과}"]
export const DAILY_TRIM_NOTE = "자세한 내용은 아래 버튼에서 확인해 주세요."
// 카카오는 이모지를 2자로 셀 수 있어 더 엄격한 UTF-16 길이로 센다.
const chars = (s: string) => s.length
export function fitDailyLength(vars: Record<string, string>): Record<string, string> {
	const total = (v: Record<string, string>) => DAILY_FIXED_CHARS + DAILY_LENGTH_KEYS.reduce((n, k) => n + chars(v[k] ?? ""), 0)
	if (!("#{학습기록}" in vars) || total(vars) <= DAILY_BODY_LIMIT) return vars
	const out = { ...vars }
	const dropDetails = (s: string) => s.split("\n").filter((l) => !/^\s+•/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim()
	for (const key of ["#{학습기록}", "#{학습준비}", "#{학습결과}"]) {
		out[key] = dropDetails(out[key] ?? "")
		if (key === "#{학습기록}") out[key] = `${out[key]}\n${DAILY_TRIM_NOTE}`.trim()
		if (total(out) <= DAILY_BODY_LIMIT) return out
	}
	// 그래도 넘으면 학습결과 뒤를 자른다(선생님 한마디가 아주 긴 경우).
	const over = total(out) - DAILY_BODY_LIMIT
	const r = [...out["#{학습결과}"]]
	out["#{학습결과}"] = r.slice(0, Math.max(1, r.length - over - 1)).join("") + "…"
	return out
}

// (v2.8.0 구역, 10/30 사용자) 주간·월간 학습·활동 보고서의 구역 변수. 보고서 DB `학습기록(알림톡)`·`학습요약(알림톡)` 수식을
// 따르고, 비었을 때만 기본 문구를 넣는다.
export const REPORT_SECTION_DEFAULTS = {
	record: "이 기간 학습 기록이 없습니다.",
	summary: "이 기간 출석 기록이 없습니다.",
	completion: "이 과정을 모두 마쳤습니다.",
}
// 수료 보고서 제목 "학생 수료 보고서 교재"에서 교재 부분(수식이 비었을 때만 씀).
const bookFromTitle = (page: any) => {
	const t = (page?.properties?.["보고서"]?.title ?? []).map((x: any) => x?.plain_text ?? x?.text?.content ?? "").join("")
	const i = t.indexOf("수료 보고서")
	return i >= 0 ? t.slice(i + "수료 보고서".length).trim() : ""
}
export function reportSectionVars(page: any): Record<string, string> {
	return {
		"#{학습기록}": alimtalkVar(page, "학습기록", REPORT_SECTION_DEFAULTS.record),
		"#{학습요약}": alimtalkVar(page, "학습요약", REPORT_SECTION_DEFAULTS.summary),
		// (v2.8.0 수료) 교재·프로그램 수료 보고서의 구역 변수: [수료 과정](교재·기간·출석)과 셋째 구역(과제·평가·한마디).
		"#{수료과정}": alimtalkVar(page, "수료과정", `📚 교재  ${bookFromTitle(page) || "-"}`),
		"#{수료요약}": alimtalkVar(page, "수료요약", REPORT_SECTION_DEFAULTS.completion),
	}
}

// 클래스 `알림톡 구분`이 예체능인지. 클래스를 못 읽으면 교과로 본다.
export async function isArtsClass(classId: string | null | undefined, getPage: (id: string) => Promise<any>): Promise<boolean> {
	if (!classId) return false
	const cls = await getPage(classId).catch(() => null)
	return cls?.properties?.["알림톡 구분"]?.select?.name === "예체능"
}

// 주간·월간 보고서의 설정 행과 넘어갈 순서. 예체능 반이면 "주간 활동 보고서" → "주간 보고서" → "보고서".
// 수료 보고서는 "교재 수료 보고서"/"프로그램 수료 보고서" 행만 쓴다(넘어갈 옛 행이 없고, Secrets 기본 템플릿으로 보내면 안 됨: noEnvTemplate).
export async function reportConfigChain(reportType: "주간 보고서" | "월간 보고서" | "수료 보고서", registrationId: string, getPage: (id: string) => Promise<any>): Promise<{ category: AlimtalkConfigCategory; fallback: AlimtalkConfigCategory[]; noEnvTemplate?: boolean }> {
	const reg = await getPage(registrationId).catch(() => null)
	const classId = (reg?.properties?.["클래스"]?.relation ?? [])[0]?.id
	const arts = await isArtsClass(classId, getPage)
	if (reportType === "수료 보고서") return { category: arts ? "프로그램 수료 보고서" : "교재 수료 보고서", fallback: [], noEnvTemplate: true }
	if (arts) {
		return { category: reportType === "주간 보고서" ? "주간 활동 보고서" : "월간 활동 보고서", fallback: [reportType, "보고서"] }
	}
	return { category: reportType, fallback: ["보고서"] }
}

// 출석의 클래스(등록 → 클래스 롤업)에서 일일 보고서 설정 행을 고른다. 클래스 `알림톡 구분`이 예체능이면 "일일 활동 보고서".
// 클래스를 못 읽으면 교과(일일 보고서)로 보낸다.
export async function dailyConfigCategory(page: any, getPage: (id: string) => Promise<any>): Promise<"일일 보고서" | "일일 활동 보고서"> {
	const arr = page?.properties?.["클래스"]?.rollup?.array ?? []
	const classId = arr.flatMap((x: any) => (x?.relation ?? []).map((r: any) => r?.id)).find(Boolean)
	return (await isArtsClass(classId, getPage)) ? "일일 활동 보고서" : "일일 보고서"
}

// 일일 보고서 #{학습내용}: 그날 기록이 하나도 없을 때(결석 등) 대신 넣는 한 줄.
export function studyContentOrDefault(content: string, status: string): string {
	const t = content.trim()
	if (t) return t
	return status.includes("결석") ? "결석으로 이날 학습 기록이 없습니다." : "이날 학습 기록이 없습니다."
}

// (v2.8.0 구역, 10/30 사용자) 교재비 청구 안내 [교재 내역] #{교재목록}: 교재마다 "📚 교재  15,000원" 한 줄 + "🧾 합계  31,000원".
// 교재비 `교재목록(알림톡)` 수식이 비었을 때만 미납교재 수식에서 만든다(변수 값이 공백으로 시작하지 않게 목록 점 없이).
export function textbookListBlock(unpaid: string): string {
	const items: string[] = []
	let total = ""
	for (const raw of unpaid.split("\n")) {
		const l = raw.trim()
		if (!l) continue
		const sum = l.match(/^📚\s*청구 금액\s*:\s*(.+)$/u)
		if (sum) { total = sum[1].trim(); continue }
		const item = l.match(/^📘\s*(.+?)\s*:\s*(.+)$/u)
		items.push(item ? `📚 ${item[1]}  ${item[2].trim()}` : l)
	}
	if (!items.length) items.push("📚 교재  없음")
	return items.join("\n") + (total ? `\n🧾 합계  ${total}` : "")
}

// (10/29 다시 신청한 본문) 상담 신청 접수 안내 #{접수정보}: 머리줄 "📋 접수 내용" + "  • 학생  이름"(항상)
// + 적은 경우만 학교·학년 줄. 본문에서 이 아래에 "  • 연락처  #{학부모연락처}"가 이어진다.
export function inquiryInfoBlock(o: { studentName: string; school?: string; grade?: string }): string {
	const keep = (v?: string) => { const t = String(v ?? "").trim(); return t && t !== "미입력" ? t : "" }
	return [
		"📋 접수 내용",
		`${BULLET}학생  ${o.studentName}`,
		...(keep(o.school) ? [`${BULLET}학교  ${keep(o.school)}`] : []),
		...(keep(o.grade) ? [`${BULLET}학년  ${keep(o.grade)}`] : []),
	].join("\n")
}
