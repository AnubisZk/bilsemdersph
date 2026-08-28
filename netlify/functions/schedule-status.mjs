import { getStore } from "@netlify/blobs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export default async (request) => {
  const jobId = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "Geçersiz iş kimliği." }, 400);
  const store = getStore("dersplan-schedule-jobs");
  const job = await store.get(jobId, { type: "json" });
  if (!job || job.status === "processing") return json({ status: "processing" }, 202);
  await store.delete(jobId);
  if (job.status === "error") return json({ error: job.error || "AI programı oluşturulamadı." }, 502);
  return json(job.result);
};
