-- CreateEnum
CREATE TYPE "Vendor" AS ENUM ('ZEPTO', 'BLINKIT', 'FLIPKART', 'SWIGGY');

-- CreateEnum
CREATE TYPE "SearchStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertScope" AS ENUM ('GROUP', 'LISTING');

-- CreateEnum
CREATE TYPE "AlertRuleType" AS ENUM ('PRICE_BELOW', 'DROP_PERCENT', 'LOWEST_BELOW');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "pincode" TEXT NOT NULL,
    "vendors" "Vendor"[],
    "status" "SearchStatus" NOT NULL,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSnapshot" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "groupId" TEXT,
    "vendor" "Vendor" NOT NULL,
    "vendorProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" TEXT,
    "imageUrl" TEXT,
    "mrp" DECIMAL(10,2),
    "offerPrice" DECIMAL(10,2),
    "available" BOOLEAN NOT NULL,
    "deeplink" TEXT,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "inventory" INTEGER,
    "sla" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lowestPrice" DECIMAL(10,2),
    "vendorSpread" DECIMAL(10,2),
    "snapshotIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scope" "AlertScope" NOT NULL,
    "ruleType" "AlertRuleType" NOT NULL,
    "targetPrice" DECIMAL(10,2),
    "dropPercent" DOUBLE PRECISION,
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "pincode" TEXT NOT NULL,
    "vendors" "Vendor"[],
    "groupKey" TEXT,
    "vendorProductIds" JSONB,
    "productName" TEXT NOT NULL,
    "quantity" TEXT,
    "brand" TEXT,
    "ntfyUrl" TEXT,
    "browserPush" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "lastCheckedAt" TIMESTAMP(3),
    "lastMatchedPrice" DECIMAL(10,2),
    "baselinePrice" DECIMAL(10,2),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchedPrice" DECIMAL(10,2) NOT NULL,
    "previousPrice" DECIMAL(10,2),
    "vendor" "Vendor",
    "message" TEXT NOT NULL,
    "ntfyStatus" "DeliveryStatus",
    "pushStatus" "DeliveryStatus",
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ProductSnapshot_vendor_vendorProductId_idx" ON "ProductSnapshot"("vendor", "vendorProductId");

-- CreateIndex
CREATE INDEX "ProductSnapshot_searchRunId_idx" ON "ProductSnapshot"("searchRunId");

-- CreateIndex
CREATE INDEX "Alert_active_nextCheckAt_idx" ON "Alert"("active", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSnapshot" ADD CONSTRAINT "ProductSnapshot_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSnapshot" ADD CONSTRAINT "ProductSnapshot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
