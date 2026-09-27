"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IngestionError, ingest } from "@/ingestion/ingest";

// React resets the form after an action; `clientLabel` is echoed back so it survives an error.
export type UploadState = { error?: string; clientLabel?: string };

export async function uploadAnalysis(_prev: UploadState, form: FormData): Promise<UploadState> {
  const clientLabel = String(form.get("clientLabel") ?? "");
  const pdf = form.get("pdf");
  if (!(pdf instanceof File)) return { error: "Selecione o PDF do CNIS.", clientLabel };
  let id: number;
  try {
    ({ id } = await ingest(clientLabel, new Uint8Array(await pdf.arrayBuffer())));
  } catch (e) {
    if (e instanceof IngestionError) return { error: e.message, clientLabel };
    throw e;
  }
  revalidatePath("/");
  redirect(`/analises/${id}`);
}
