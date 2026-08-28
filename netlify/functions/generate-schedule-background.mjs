import { getStore } from "@netlify/blobs";
import generateSchedule from "./generate-schedule.mjs";

const validJobId = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ""));

export default async (request) => {
  const rawBody = await request.text();
  let jobId = "";
  try {
    jobId = JSON.parse(rawBody).jobId;
  } catch {}
  if (!validJobId(jobId)) return;

  const store = getStore("dersplan-schedule-jobs");
  try {
    await store.setJSON(jobId, { status: "processing" });
    const response = await generateSchedule(new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    }));
    const result = await response.json();
    await store.setJSON(jobId, response.ok ? { status: "complete", result } : { status: "error", error: result.error || "AI programı oluşturulamadı." });
  } catch (error) {
    await store.setJSON(jobId, { status: "error", error: error instanceof Error ? error.message : "AI programı oluşturulamadı." });
  }
};
