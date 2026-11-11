// _shared/webhookRoutes.ts
//
// (v2.8.0, 261111) 웹훅 길잡이(notion-router)의 연결표. Notion 버튼·자동화가 모두 같은 주소(notion-router)로
// 보내면, 길잡이가 "어떤 동작인지"를 알아내 기존 함수 주소로 그대로 넘긴다. 길잡이는 나눠 주기만 한다:
// Notion을 읽지 않고, 기존 함수의 잠금·상태·큐 처리를 건드리지 않는다.
//
// 동작 이름은 관리자 설정 웹훅 체크리스트(admin_settings.js CHECKLIST)의 항목 ID와 같다. 두 목록이 어긋나지 않게
// webhookRoutes_test.ts가 CHECKLIST의 ID·함수·경로와 이 표를 비교한다.
//
// 동작을 알아내는 곳(둘 다 있으면 합친다):
//   1. 헤더 x-hada-action: "reg-link-regenerate" 처럼 항목 ID 하나(쉼표로 여러 개도 됨). 버튼 웹훅과 값 편집 자동화가 쓴다.
//   2. 본문의 수식 속성 `웹훅 정보`: {"wait":["reg-textbook-queue", ...]} — DB마다 하나, 지금 ⚪ 대기인 상태의 항목 ID 목록.
//      DB마다 자동화 하나(트리거: 상태 칸들 중 하나라도 ⚪ 대기)가 같은 주소로 보낼 때 쓴다.

export type WebhookRoute = {
  id: string
  db: string
  name: string
  kind: "button" | "automation"
  fn: string
  path: string
}

export const WEBHOOK_INFO_PROP = "웹훅 정보"
export const ACTION_HEADER = "x-hada-action"

// admin_settings.js CHECKLIST에서 그대로 옮긴 표(순서·ID·함수·경로 같음).
export const WEBHOOK_ROUTES: WebhookRoute[] = [
  { id: "reg-link-regenerate", db: "등록(학원)", name: "링크 재발급", kind: "button", fn: "toggle-report-link", path: "?action=regenerate" },
  { id: "reg-link-disable", db: "등록(학원)", name: "[웹훅] 링크 비활성화", kind: "automation", fn: "toggle-report-link", path: "?action=disable" },
  { id: "reg-link-enable", db: "등록(학원)", name: "[웹훅] 링크 활성화", kind: "automation", fn: "toggle-report-link", path: "?action=enable" },
  { id: "reg-report-sync", db: "등록(학원)", name: "학생 페이지 동기화", kind: "button", fn: "sync-report-cache", path: "" },
  { id: "reg-textbook-queue", db: "등록(학원)", name: "[웹훅] 교재 생성", kind: "automation", fn: "sync-registration-textbook", path: "/queue" },
  { id: "reg-end-cleanup", db: "등록(학원)", name: "종료 처리", kind: "button", fn: "sync-registration-textbook", path: "/cleanup-on-end" },
  { id: "reg-registration-notice", db: "등록(학원)", name: "등록 안내", kind: "button", fn: "send-lesson-notice", path: "/registration" },
  { id: "reg-class-change-notice", db: "등록(학원)", name: "클래스 변경 안내", kind: "button", fn: "send-lesson-notice", path: "/class-change" },
  { id: "reg-timetable-notice", db: "등록(학원)", name: "[웹훅] 시간표 안내", kind: "automation", fn: "send-lesson-notice", path: "/timetable" },
  { id: "class-report-sync", db: "클래스(학원)", name: "학생 페이지 동기화", kind: "button", fn: "sync-class-report-cache", path: "" },
  { id: "class-report-create", db: "클래스(학원)", name: "보고서 생성", kind: "button", fn: "create-class-reports", path: "" },
  { id: "class-tuition-create", db: "클래스(학원)", name: "월 수강료 생성", kind: "button", fn: "send-monthly-notice", path: "/create" },
  { id: "class-letter-create", db: "클래스(학원)", name: "가정통신문 생성", kind: "button", fn: "send-monthly-notice", path: "/create-letter" },
  { id: "menu-bulk-classes", db: "메뉴(학원)", name: "다음주 수업 일괄 생성", kind: "button", fn: "generate-classes", path: "?mode=bulk" },
  { id: "session-record", db: "수업(학원)", name: "학습기록 생성", kind: "button", fn: "create-learning-record", path: "" },
  { id: "session-routine-checks", db: "수업(학원)", name: "루틴 체크 생성", kind: "button", fn: "create-class-reports", path: "/routine-checks" },
  { id: "session-attendance-queue", db: "수업(학원)", name: "[웹훅] 출석 조정", kind: "automation", fn: "fix-attendance", path: "/queue" },
  { id: "session-date-move", db: "수업(학원)", name: "[웹훅] 수업 날짜 이동", kind: "automation", fn: "fix-attendance", path: "/session-date" },
  { id: "session-delete", db: "수업(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "attendance-report-queue", db: "출석(학원)", name: "[웹훅] 보고서 전송", kind: "automation", fn: "send-daily-report", path: "/queue" },
  { id: "attendance-lesson-notice-queue", db: "출석(학원)", name: "[웹훅] 수업 안내", kind: "automation", fn: "send-lesson-notice", path: "/queue" },
  { id: "attendance-delete", db: "출석(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "record-assignment", db: "학습기록(학원)", name: "학습활동 생성", kind: "button", fn: "create-assignment", path: "/queue" },
  { id: "record-units", db: "학습기록(학원)", name: "단원 입력", kind: "button", fn: "fill-record-units", path: "" },
  { id: "record-delete", db: "학습기록(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "assignment-delete", db: "학습활동(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "progress-completion", db: "진도교재(학원)", name: "수료", kind: "button", fn: "create-class-reports", path: "/completion" },
  { id: "report-send", db: "보고서(학원)", name: "[웹훅] 보고서 전송", kind: "automation", fn: "send-report", path: "/queue" },
  { id: "letter-notice", db: "가정통신문(학원)", name: "[웹훅] 안내문 전송", kind: "automation", fn: "send-monthly-notice", path: "/queue" },
  { id: "tuition-notice", db: "수강료(학원)", name: "[웹훅] 안내문 전송", kind: "automation", fn: "send-tuition-notice", path: "/queue" },
  { id: "cart-notice", db: "교재비(학원)", name: "[웹훅] 안내문 전송", kind: "automation", fn: "send-textbook-notice", path: "/queue" },
  { id: "cart-progress-book", db: "교재비(학원)", name: "진도교재 담기", kind: "button", fn: "sync-textbook-distribution", path: "/from-cart/queue" },
  { id: "cart-delete", db: "교재비(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "distribution-delete", db: "교재배부(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "payment-delete", db: "교재결제(학원)", name: "[웹훅] 삭제", kind: "automation", fn: "cascade-delete", path: "" },
  { id: "student-inquiry-auto", db: "학생(학원)", name: "[웹훅] 접수안내 전송", kind: "automation", fn: "send-inquiry-receipt", path: "" },
  { id: "student-inquiry", db: "학생(학원)", name: "접수안내 전송", kind: "button", fn: "send-inquiry-receipt", path: "/resend" },
  { id: "school-calendar", db: "학교(학원)", name: "학사일정 가져오기", kind: "button", fn: "sync-school-calendar", path: "" },
  { id: "dashboard-link", db: "대시보드(학원)", name: "[웹훅] 대시보드 연결 · 날짜 편집", kind: "automation", fn: "sync-dashboard-link", path: "" },
  { id: "dashboard-link-new", db: "대시보드(학원)", name: "[웹훅] 대시보드 연결 · 페이지 추가", kind: "automation", fn: "sync-dashboard-link", path: "" },
  { id: "book-report-sync", db: "라이브러리(학원)", name: "[웹훅] 리포트 반영 · 속성 편집", kind: "automation", fn: "sync-report-cache", path: "" },
  { id: "book-report-sync-new", db: "라이브러리(학원)", name: "[웹훅] 리포트 반영 · 페이지 추가", kind: "automation", fn: "sync-report-cache", path: "" },
  { id: "schedule-report-sync", db: "일정(학원)", name: "[웹훅] 리포트 반영 · 속성 편집", kind: "automation", fn: "sync-report-cache", path: "" },
  { id: "schedule-report-sync-new", db: "일정(학원)", name: "[웹훅] 리포트 반영 · 페이지 추가", kind: "automation", fn: "sync-report-cache", path: "" },
  { id: "schedule-event-notice", db: "일정(학원)", name: "일정 안내 전송", kind: "button", fn: "send-schedule-notice", path: "/event" },
]

const BY_ID = new Map(WEBHOOK_ROUTES.map((r) => [r.id, r]))

export function routeById(id: string): WebhookRoute | undefined {
  return BY_ID.get(id)
}

// 수식 속성 값(문자열)을 꺼낸다. Notion 자동화 본문 `data.properties[이름].formula.string` 모양.
function formulaString(body: any, prop: string): string {
  const p = body?.data?.properties?.[prop] ?? body?.properties?.[prop]
  const f = p?.formula
  if (f && typeof f.string === "string") return f.string
  if (typeof p === "string") return p
  return ""
}

// 요청에서 동작 ID 목록을 뽑는다. 모르는 ID는 unknown으로 따로 돌려준다(기록만 하고 무시).
export function resolveActions(headers: Headers, body: unknown): { ids: string[]; unknown: string[] } {
  const raw: string[] = []
  const h = headers.get(ACTION_HEADER)
  if (h) raw.push(...h.split(",").map((s) => s.trim()).filter(Boolean))
  const info = formulaString(body, WEBHOOK_INFO_PROP)
  if (info) {
    try {
      const parsed = JSON.parse(info)
      const wait = parsed?.wait
      if (Array.isArray(wait)) raw.push(...wait.map((x: unknown) => String(x).trim()).filter(Boolean))
      else if (typeof wait === "string" && wait.trim()) raw.push(...wait.split(",").map((s) => s.trim()).filter(Boolean))
    } catch {
      raw.push(...info.split(",").map((s) => s.trim()).filter(Boolean))
    }
  }
  const ids: string[] = [], unknown: string[] = []
  for (const id of raw) {
    if (BY_ID.has(id)) { if (!ids.includes(id)) ids.push(id) }
    else if (!unknown.includes(id)) unknown.push(id)
  }
  return { ids, unknown }
}

// 기존 함수 주소(경로·쿼리 포함). base는 SB_URL.
export function targetUrl(base: string, route: WebhookRoute): string {
  return `${base.replace(/\/$/, "")}/functions/v1/${route.fn}${route.path}`
}
