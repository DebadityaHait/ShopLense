import { AlertRuleType, AlertScope, Vendor } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { VENDORS } from "@/lib/types";

const alertSchema = z.object({
  scope: z.enum(["GROUP", "LISTING"]),
  ruleType: z.enum(["PRICE_BELOW", "DROP_PERCENT", "LOWEST_BELOW", "BACK_IN_STOCK"]),
  targetPrice: z.coerce.number().positive().optional().nullable(),
  dropPercent: z.coerce.number().positive().max(95).optional().nullable(),
  query: z.string().min(2),
  lat: z.coerce.number().finite(),
  lon: z.coerce.number().finite(),
  pincode: z.string().regex(/^\d{6}$/),
  vendors: z.array(z.enum(VENDORS)).min(1),
  flipkartHyperlocalOnly: z.boolean().default(false),
  groupKey: z.string().optional().nullable(),
  vendorProductIds: z.record(z.string()).optional().nullable(),
  productName: z.string().min(1),
  quantity: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  ntfyUrl: z.string().url().optional().nullable(),
  browserPush: z.boolean().default(false),
  intervalMinutes: z.coerce.number().int().min(10).max(1440).default(30),
  baselinePrice: z.coerce.number().positive().optional().nullable(),
});

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const alerts = await prisma.alert.findMany({
    where: { userId: auth.userId! },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    include: { events: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
  return NextResponse.json({ alerts });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const parsed = alertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid alert input.");

  if (parsed.data.ruleType === "BACK_IN_STOCK") {
    parsed.data.targetPrice = null;
    parsed.data.dropPercent = null;
  } else if (parsed.data.ruleType === "DROP_PERCENT" && !parsed.data.dropPercent) {
    return jsonError("Drop percent alerts need a drop percentage.");
  }
  if (parsed.data.ruleType !== "DROP_PERCENT" && parsed.data.ruleType !== "BACK_IN_STOCK" && !parsed.data.targetPrice) {
    return jsonError("Price threshold alerts need a target price.");
  }

  const alert = await prisma.alert.create({
    data: {
      userId: auth.userId!,
      scope: parsed.data.scope as AlertScope,
      ruleType: parsed.data.ruleType as AlertRuleType,
      targetPrice: parsed.data.targetPrice,
      dropPercent: parsed.data.dropPercent,
      query: parsed.data.query,
      lat: parsed.data.lat,
      lon: parsed.data.lon,
      pincode: parsed.data.pincode,
      vendors: parsed.data.vendors as Vendor[],
      flipkartHyperlocalOnly: parsed.data.flipkartHyperlocalOnly,
      groupKey: parsed.data.groupKey,
      vendorProductIds: parsed.data.vendorProductIds || undefined,
      productName: parsed.data.productName,
      quantity: parsed.data.quantity,
      brand: parsed.data.brand,
      ntfyUrl: parsed.data.ntfyUrl,
      browserPush: parsed.data.browserPush,
      intervalMinutes: parsed.data.intervalMinutes,
      baselinePrice: parsed.data.baselinePrice,
      nextCheckAt: new Date(Date.now() + parsed.data.intervalMinutes * 60_000),
    },
  });
  return NextResponse.json({ alert }, { status: 201 });
}
