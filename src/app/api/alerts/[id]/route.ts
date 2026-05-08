import { AlertRuleType, Vendor } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { VENDORS } from "@/lib/types";

const updateSchema = z.object({
  active: z.boolean().optional(),
  ruleType: z.enum(["PRICE_BELOW", "DROP_PERCENT", "LOWEST_BELOW", "BACK_IN_STOCK"]).optional(),
  targetPrice: z.coerce.number().positive().optional().nullable(),
  dropPercent: z.coerce.number().positive().max(95).optional().nullable(),
  vendors: z.array(z.enum(VENDORS)).min(1).optional(),
  ntfyUrl: z.string().url().optional().nullable(),
  browserPush: z.boolean().optional(),
  intervalMinutes: z.coerce.number().int().min(10).max(1440).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid alert update.");

  const alert = await prisma.alert.update({
    where: { id, userId: auth.userId! },
    data: {
      ...parsed.data,
      ruleType: parsed.data.ruleType as AlertRuleType | undefined,
      vendors: parsed.data.vendors as Vendor[] | undefined,
      nextCheckAt: parsed.data.intervalMinutes ? new Date(Date.now() + parsed.data.intervalMinutes * 60_000) : undefined,
    },
  });
  return NextResponse.json({ alert });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  await prisma.alert.delete({ where: { id, userId: auth.userId! } });
  return NextResponse.json({ ok: true });
}
