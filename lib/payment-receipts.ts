import { put } from "@vercel/blob";

export type PaymentReceipt = {
  url: string;
  filename: string;
  content_type: string;
  size_bytes: number;
};

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MAX_COUNT = 5;

export const RECEIPT_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export function isReceiptContentType(type: string): boolean {
  return RECEIPT_ALLOWED_TYPES.has(type.toLowerCase());
}

export function validateReceiptFiles(files: File[]): string | null {
  if (files.length > RECEIPT_MAX_COUNT) {
    return `Up to ${RECEIPT_MAX_COUNT} receipt files per payment.`;
  }
  for (const file of files) {
    if (!isReceiptContentType(file.type)) {
      return `"${file.name}" is not a supported type (use JPG, PNG, WebP, HEIC, or PDF).`;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      return `"${file.name}" exceeds ${RECEIPT_MAX_BYTES / (1024 * 1024)} MB.`;
    }
  }
  return null;
}

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return base.slice(0, 120) || "receipt";
}

export async function uploadPaymentReceipts(
  paymentId: string,
  files: File[]
): Promise<PaymentReceipt[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Receipt uploads are not configured (missing BLOB_READ_WRITE_TOKEN).");
  }

  const receipts: PaymentReceipt[] = [];
  for (const file of files) {
    const blob = await put(
      `payment-receipts/${paymentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`,
      file,
      {
        access: "public",
        contentType: file.type || undefined,
      }
    );
    receipts.push({
      url: blob.url,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    });
  }
  return receipts;
}

export function parseStoredReceipts(value: unknown): PaymentReceipt[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is PaymentReceipt =>
      !!item &&
      typeof item === "object" &&
      typeof (item as PaymentReceipt).url === "string" &&
      typeof (item as PaymentReceipt).filename === "string"
  );
}
