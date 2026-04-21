import { NextResponse } from "next/server";

import { sendAutoReply, sendLeadNotification } from "@/lib/email";
import { createLead } from "@/lib/leads";
import { contactSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = contactSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }

    await sendLeadNotification(parsed.data);
    await sendAutoReply(parsed.data);
    await createLead(parsed.data, "Free Site Audit");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to submit form right now." }, { status: 500 });
  }
}
