import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const guestEmail = process.env.SHOPLENSE_GUEST_EMAIL || "guest@shoplense.local";
const guestPassword = process.env.SHOPLENSE_GUEST_PASSWORD || "shoplense-guest-access";

export async function POST() {
  const passwordHash = await bcrypt.hash(guestPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: guestEmail },
    update: { passwordHash },
    create: { email: guestEmail, passwordHash },
  });
  return NextResponse.json({ id: user.id, email: user.email, password: guestPassword });
}
