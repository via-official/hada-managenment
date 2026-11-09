// _shared/classReportCacheTarget.ts
//
// sync-class-report-cache가 처리하는 실제 리포트 재가결산 로직을 별도 파일로 분리했다
// (2026-09-18, 큐 기반 순차 처리 도입, Phase 2). 원래 index.ts 안에 있던 코드를 그대로 옮긴 것이다.

import { getPage, queryAllPages, updatePageProperties } from "./notionClient.ts"
import { syncReportCacheForRegistration } from "./reportCacheBuilder.ts"
import { enqueueSync } from "./syncQueue.ts"
import { markRunning, markDone, markError, type StatusSpec } from "./statusTracking.ts"
import { DS_REGISTRATION, PROP_LAST_ERROR } from "./constants.ts"
// (2026-09-21, 이식성 리팩토링) 등록(학원) DB ID를 여기서도 하드코딩하지 않고 constants.ts에서
// 가져온다 (다른 여러 파일과 동일한 값).

// (2026-09-22, 처리 상태 관리 리팩토링 Phase 3) "학생 페이지 동기화중" 체크박스 -> "학생 페이지
// 동기화 상태"(select) + "학생 페이지 동기화 처리 시작 시각"(date). index.ts(락 확인+시작)와 이
// 파일(완료/오류 반영, 큐 워커에서 직접 호출) 양쪽에서 써서 export한다. 마스터플랜:
// https://app.notion.com/p/903c90386c1d473494c5df6306c53517
export const CLASS_REPORT_SYNC_STATUS_SPEC: StatusSpec = {
	statusProp: "학생 페이지 동기화 상태",
	errorProp: PROP_LAST_ERROR,
	startedAtProp: "학생 페이지 동기화 처리 시작 시각",
}

// (v2.8.0 항목 37) 큐 "학생 1건" target. 예전에는 반 1건 안에서 학생 전원을 계산한 뒤 끝에 한꺼번에 저장해서,
// 기록이 많은 반은 함수가 도중에 끊기면 한 명도 저장되지 않고 재시도도 똑같이 끊겼다(원본 중2·고2 영어, 11/3).
export const TARGET_REGISTRATION_REPORT_CACHE = "registration-report-cache"

export type RegistrationReportCachePayload = { classId: string; regId: string; last?: boolean }

// 테스트에서 Notion·큐 호출을 바꿔 끼울 수 있게 한다.
export const classReportCacheDeps = {
	getPage,
	queryAllPages,
	update: updatePageProperties,
	enqueue: enqueueSync,
	sync: syncReportCacheForRegistration,
	markRunning: (id: string) => markRunning(id, CLASS_REPORT_SYNC_STATUS_SPEC),
	markDone: (id: string) => markDone(id, CLASS_REPORT_SYNC_STATUS_SPEC),
	markError: (id: string, message: string) => markError(id, CLASS_REPORT_SYNC_STATUS_SPEC, message),
}

// 이 클래스에 속하고 리포트 토큰이 발급된(=학보 리포트 링크가 생성된) 등록만 대상으로 한다.
// 학생마다 큐 1건을 넣는다. 반 상태는 마지막 학생에서 정한다.
export async function processClass(classId: string): Promise<number> {
	const deps = classReportCacheDeps
	const registrations = (await deps.queryAllPages(DS_REGISTRATION, {
		and: [
			{ property: "클래스", relation: { contains: classId } },
			{ property: "토큰", rich_text: { is_not_empty: true } },
		],
	})).filter((r: any) => !r?.in_trash && !r?.archived)
	for (let i = 0; i < registrations.length; i++) {
		const item: RegistrationReportCachePayload = { classId, regId: String(registrations[i].id), ...(i === registrations.length - 1 ? { last: true } : {}) }
		await deps.enqueue(TARGET_REGISTRATION_REPORT_CACHE, item)
	}
	return registrations.length
}

// process-sync-queue 워커가 target: "sync-class-report-cache" 작업을 처리할 때 호출하는 진입점.
// (2026-09-22, Phase 6) index.ts(webhookIngest.ts의 runLockedQueueWebhookForPage)는 이제 접수
// 시점에 markQueued만 호출한다 -- 실제로 이 항목을 집어서 처리를 시작하는 지금 이 시점에
// markRunning을 호출해야 "🔄 작업중"이 실제 동시 처리 중인 항목 수(process-sync-queue의 동시
// 처리 한도)만큼만 보인다.
export async function processSyncClassReportCacheQueueItem(payload: { classId: string }): Promise<void> {
	const deps = classReportCacheDeps
	try {
		await deps.markRunning(payload.classId)
		const count = await processClass(payload.classId)
		console.log("sync-class-report-cache (queue) 학생별로 나눔:", payload.classId, `${count}건`)
		if (count === 0) await deps.markDone(payload.classId)
	} catch (err) {
		console.error("sync-class-report-cache (queue) failed:", (err as Error).message, "\nstack:", (err as Error).stack)
		await deps.markError(payload.classId, (err as Error).message)
		throw err
	}
}

// 큐 "학생 1건". 저장은 학생마다 하므로 한 명이 실패해도 앞선 학생은 남고, 큐는 그 학생만 다시 시도한다.
export async function processRegistrationReportCacheQueueItem(payload: RegistrationReportCachePayload, cachedGetPage: (id: string) => Promise<any>): Promise<void> {
	const deps = classReportCacheDeps
	const p = payload
	try {
		await deps.sync(p.regId, cachedGetPage)
		if (p.last) await finishClass(p.classId)
	} catch (err) {
		// 반 상태는 마지막 학생에서 정한다. 여기서는 오류 문장만 남기고(⚠️로 바꾸지 않아 다시 누르기를 막아 둠), 큐가 다시 시도한다.
		const message = `학생 페이지 동기화 실패(다시 누르면 다시 계산합니다): ${(err as Error).message}`
		await deps.update(p.classId, { [PROP_LAST_ERROR]: { rich_text: [{ text: { content: message.slice(0, 1900) } }] } }).catch(() => {})
		if (p.last) await deps.markError(p.classId, message).catch(() => {})
		throw err
	}
}

// 마지막 학생 뒤: 중간 실패가 '마지막 오류'에 남아 있으면 ⚠️ 오류, 아니면 ✅ 완료.
async function finishClass(classId: string): Promise<void> {
	const deps = classReportCacheDeps
	const cls: any = await deps.getPage(classId)
	const error = (cls?.properties?.[PROP_LAST_ERROR]?.rich_text ?? []).map((t: any) => t?.plain_text ?? "").join("").trim()
	if (error) await deps.markError(classId, error)
	else await deps.markDone(classId)
}
