import { ObjectId, type Collection } from "mongodb";
import { getMongoDb } from "./mongodb";
export type AutomationJob = "OPPORTUNITY_CRON" | "SIGNALS_CRON";
export type AutomationRun = { _id?: ObjectId; job: AutomationJob; startedAt: Date; finishedAt: Date | null; status: "RUNNING" | "SUCCESS" | "FAILED"; generatedCount: number; monitoredCount: number; error: string | null };
async function collection(): Promise<Collection<AutomationRun>> { return (await getMongoDb()).collection<AutomationRun>("automationRuns"); }
export async function beginAutomationRun(job: AutomationJob, startedAt = new Date()): Promise<ObjectId> { const result = await (await collection()).insertOne({ job, startedAt, finishedAt: null, status: "RUNNING", generatedCount: 0, monitoredCount: 0, error: null }); return result.insertedId; }
export async function finishAutomationRun(id: ObjectId, result: { status: "SUCCESS" | "FAILED"; generatedCount?: number; monitoredCount?: number; error?: string | null; finishedAt?: Date }): Promise<void> { await (await collection()).updateOne({ _id: id }, { $set: { status: result.status, generatedCount: result.generatedCount ?? 0, monitoredCount: result.monitoredCount ?? 0, error: result.error ?? null, finishedAt: result.finishedAt ?? new Date() } }); }
export async function latestAutomationRun(job: AutomationJob): Promise<AutomationRun | null> { return (await collection()).findOne({ job }, { sort: { startedAt: -1 } }); }
