import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/api-helpers";
import { computeBillItemsTotal, normalizeScannedItem } from "@/lib/bill-helpers";
import type { ScannedBillItem, ScannedBillPayload } from "@/types/domain";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
];

function badRequest(reason: string) {
  console.error("[POST /api/ai/scan-bill] 400:", reason);
  return jsonError(reason, 400);
}

function resolveAllowedMime(file: File): string | null {
  const rawType = (file.type || "").trim().toLowerCase();
  if (ALLOWED_MIME_TYPES.has(rawType)) {
    return rawType === "image/jpg" ? "image/jpeg" : rawType;
  }
  if (!rawType || rawType === "application/octet-stream") {
    const name = (file.name || "").toLowerCase();
    const dotIdx = name.lastIndexOf(".");
    if (dotIdx >= 0) {
      const ext = name.slice(dotIdx);
      if (EXTENSION_TO_MIME[ext]) {
        return EXTENSION_TO_MIME[ext];
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  const { error } = await requireApiSession();
  if (error) {
    console.error("[POST /api/ai/scan-bill] 401: Authentication required.");
    return error;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return badRequest(
      "GEMINI_API_KEY is not set in .env.local. Add your Gemini API key and restart the server.",
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseErr) {
      return badRequest(
        `Invalid multipart FormData upload: ${
          parseErr instanceof Error ? parseErr.message : "could not parse body"
        }`,
      );
    }

    const uploaded = formData.get("file") ?? formData.get("image");
    if (!(uploaded instanceof File)) {
      return badRequest(
        'Missing uploaded bill file in FormData (expected field "file" or "image").',
      );
    }

    const mimeType = resolveAllowedMime(uploaded);
    if (!mimeType) {
      return badRequest(
        `Unsupported file format "${uploaded.type || uploaded.name || "unknown"}". Allowed formats: JPG, PNG, WebP, or PDF.`,
      );
    }

    if (uploaded.size === 0 || uploaded.size > MAX_BYTES) {
      return badRequest(
        `Invalid file size (${uploaded.size} bytes). Bill file must be between 1 byte and 10 MB.`,
      );
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer());
    const base64Data = buffer.toString("base64");

    const prompt = [
      "You are an expert back-office accounting OCR extractor for an electronics, mobile, and home appliances distributor.",
      "Inspect the attached supplier bill / purchase invoice document and extract all purchased stock line items into structured JSON.",
      "Rules:",
      "- supplierName: supplier/vendor name if visible, else empty string.",
      "- billDate: YYYY-MM-DD if visible (or exact date text), else empty string.",
      "- items: array of every purchased product line with itemName, skuOrModel (model/code if visible, else short generated code), category (e.g. Washing Machines, Fans & Air Cooling, Smartphones, Electronics, etc.), quantity (positive integer), unitCost (numeric unit price), and lineTotal (quantity * unitCost).",
      "- billTotal: total invoice/bill amount as a number.",
      "- Do not invent extra items that are not on the bill.",
    ].join("\n");

    const requestBody = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            supplierName: { type: "STRING" },
            billDate: { type: "STRING" },
            billTotal: { type: "NUMBER" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  itemName: { type: "STRING" },
                  skuOrModel: { type: "STRING" },
                  category: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitCost: { type: "NUMBER" },
                  lineTotal: { type: "NUMBER" },
                },
                required: [
                  "itemName",
                  "skuOrModel",
                  "category",
                  "quantity",
                  "unitCost",
                  "lineTotal",
                ],
              },
            },
          },
          required: ["items", "billTotal"],
        },
      },
    });

    type GeminiApiResponse = {
      error?: { message?: string; status?: string };
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    let activeModel = GEMINI_MODELS[0];
    let geminiData: GeminiApiResponse | null = null;
    let lastStatus = 502;

    for (const model of GEMINI_MODELS) {
      activeModel = model;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey,
      )}`;
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      lastStatus = geminiRes.status;
      geminiData = (await geminiRes.json()) as GeminiApiResponse;

      if (geminiRes.ok) {
        break;
      }

      const errMsg =
        geminiData?.error?.message || `Gemini API returned status ${geminiRes.status}.`;
      console.error(`[POST /api/ai/scan-bill] ${model} (${geminiRes.status}):`, errMsg);

      if (geminiRes.status !== 404 && geminiRes.status !== 503 && geminiRes.status !== 429) {
        return jsonError(`Gemini API error: ${errMsg}`, geminiRes.status === 400 ? 400 : 502);
      }
    }

    if (!geminiData || lastStatus >= 400) {
      const errMsg =
        geminiData?.error?.message || `Gemini API returned status ${lastStatus}.`;
      return jsonError(`Gemini API error: ${errMsg}`, lastStatus === 400 ? 400 : 502);
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      console.error("[POST /api/ai/scan-bill] Empty Gemini response");
      return jsonError("Gemini returned an empty extraction response.", 502);
    }

    const parsed = JSON.parse(rawText) as {
      supplierName?: string;
      billDate?: string;
      billTotal?: number;
      items?: Array<Partial<ScannedBillItem>>;
    };

    const items = (Array.isArray(parsed.items) ? parsed.items : []).map((row, idx) =>
      normalizeScannedItem(row, idx),
    );

    const payload: ScannedBillPayload = {
      supplierName: (parsed.supplierName || "").trim(),
      billDate: (parsed.billDate || "").trim(),
      items,
      billTotal:
        typeof parsed.billTotal === "number" &&
        Number.isFinite(parsed.billTotal) &&
        parsed.billTotal > 0 &&
        items.length === 0
          ? parsed.billTotal
          : computeBillItemsTotal(items),
    };

    return NextResponse.json({
      model: activeModel,
      extracted: payload,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to scan bill file.";
    console.error("[POST /api/ai/scan-bill] 500:", msg);
    return jsonError(msg, 500);
  }
}

