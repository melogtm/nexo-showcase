"use server";

import { revalidatePath } from "next/cache";
import { IngestionError, ingest } from "@/ingestion/ingest";

export type UploadState = { error?: string };

export async function uploadAnalysis(_prev: UploadState, form: FormData): Promise<UploadState> {
  const pdf = form.get("pdf");
  if (!(pdf instanceof File)) return { error: "Selecione o PDF do CNIS." };
  try {
    await ingest(String(form.get("clientLabel") ?? ""), new Uint8Array(await pdf.arrayBuffer()));
  } catch (e) {
    if (e instanceof IngestionError) return { error: e.message };
    throw e;
  }
  revalidatePath("/");
  return {};
}
