import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { groupProducts } from "@/lib/product-normalization";
import { prisma } from "@/lib/prisma";
import { searchVendors } from "@/lib/vendor-search";
import { VENDORS } from "@/lib/types";

const searchSchema = z.object({
  query: z.string().trim().min(2),
  lat: z.coerce.number().finite(),
  lon: z.coerce.number().finite(),
  pincode: z.string().regex(/^\d{6}$/),
  vendors: z.array(z.enum(VENDORS)).min(1),
  zeptoProductUrl: z.string().optional().nullable(),
  exactProductUrls: z.record(z.enum(VENDORS), z.string().trim()).optional(),
  flipkartHyperlocalOnly: z.boolean().optional(),
});

function exactProductIdFromUrl(vendor: string, value?: string | null) {
  if (!value) return undefined;
  if (vendor === "ZEPTO") return value.match(/(?:pvid|prid)\/([0-9a-f-]{36})/i)?.[1] || value.match(/^[0-9a-f-]{36}$/i)?.[0];
  if (vendor === "BLINKIT") return value.match(/\/prid\/([^/?#]+)/i)?.[1] || value.match(/[?&]product_id=([^&#]+)/i)?.[1] || value.match(/^\d+$/)?.[0];
  if (vendor === "SWIGGY") return value.match(/\/instamart\/item\/([^/?#]+)/i)?.[1] || value.match(/[?&]itemId=([^&#]+)/i)?.[1] || value.match(/^[A-Z0-9]{6,}$/i)?.[0];
  if (vendor === "FLIPKART") return value.match(/[?&]pid=([^&#]+)/i)?.[1] || value.match(/^[A-Z0-9]{6,}$/i)?.[0];
  return undefined;
}

function exactProductIdsFromUrls(urls?: Partial<Record<(typeof VENDORS)[number], string>>) {
  const entries = Object.entries(urls || {})
    .map(([vendor, value]) => [vendor, exactProductIdFromUrl(vendor, value)] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[1]));
  return Object.fromEntries(entries);
}

export async function POST(request: Request) {
  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search input." }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const exactProductUrls = {
    ...parsed.data.exactProductUrls,
    ...(parsed.data.zeptoProductUrl ? { ZEPTO: parsed.data.zeptoProductUrl } : {}),
  };
  const results = await searchVendors({
    ...parsed.data,
    exactProductUrls,
    exactProductIds: exactProductIdsFromUrls(exactProductUrls),
    zeptoProductId: exactProductIdFromUrl("ZEPTO", parsed.data.zeptoProductUrl),
    flipkartHyperlocalOnly: parsed.data.flipkartHyperlocalOnly,
  });
  const groups = groupProducts(results.products);
  const status = results.errors.length === 0 ? "SUCCESS" : results.products.length ? "PARTIAL" : "FAILED";

  if (process.env.PERSIST_SEARCH_SNAPSHOTS !== "1") {
    return NextResponse.json({
      groups,
      vendorResults: results.vendorResults,
      errors: results.errors,
    });
  }

  const searchRun = await prisma.searchRun.create({
    data: {
      userId: session?.user?.id,
      query: parsed.data.query,
      lat: parsed.data.lat,
      lon: parsed.data.lon,
      pincode: parsed.data.pincode,
      vendors: parsed.data.vendors,
      status,
      errors: results.errors.length ? results.errors : undefined,
    },
  });

  const groupIdByKey = new Map<string, string>();
  const snapshotIdsByGroup = new Map<string, string[]>();
  const snapshotRows = groups.flatMap((group) => {
    const productGroupId = randomUUID();
    groupIdByKey.set(group.id, productGroupId);
    const snapshotIds = group.products.map(() => randomUUID());
    snapshotIdsByGroup.set(group.id, snapshotIds);

    return group.products.map((product, index) => ({
      id: snapshotIds[index],
      searchRunId: searchRun.id,
      groupId: productGroupId,
      vendor: product.vendor,
      vendorProductId: product.id,
      name: product.name,
      brand: product.brand || null,
      quantity: product.quantity || null,
      imageUrl: product.images[0] || null,
      mrp: product.mrp,
      offerPrice: product.offerPrice,
      available: product.available,
      deeplink: product.deeplink,
      rating: product.rating,
      ratingCount: product.ratingCount,
      inventory: product.inventory,
      sla: product.sla,
      raw: product.raw as Prisma.InputJsonValue,
    }));
  });

  await prisma.$transaction([
    prisma.productGroup.createMany({
      data: groups.map((group) => ({
        id: groupIdByKey.get(group.id)!,
        searchRunId: searchRun.id,
        canonicalName: group.canonicalName,
        brand: group.brand || null,
        quantity: group.quantity || null,
        normalizedKey: group.normalizedKey,
        confidence: group.confidence,
        lowestPrice: group.lowestPrice,
        vendorSpread: group.vendorSpread,
        snapshotIds: snapshotIdsByGroup.get(group.id) || [],
      })),
    }),
    ...(snapshotRows.length ? [prisma.productSnapshot.createMany({ data: snapshotRows })] : []),
  ]);

  return NextResponse.json({
    searchRunId: searchRun.id,
    groups,
    vendorResults: results.vendorResults,
    errors: results.errors,
  });
}
