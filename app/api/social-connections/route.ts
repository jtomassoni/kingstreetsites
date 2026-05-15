import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import {
  connectionsFromProviders,
  REQUIRED_SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/social-connections";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `select a.provider, u."emailVerified" as connected_at
       from account a
       join users u on u.id = a."userId"
       where u.email = $1`,
      [email]
    );

    const metadata = Object.fromEntries(
      rows.map((row: { provider: string; connected_at: string | null }) => [
        row.provider,
        { connected_at: row.connected_at, updated_at: row.connected_at },
      ])
    );

    return NextResponse.json({
      connections: connectionsFromProviders(rows.map((row: { provider: string }) => row.provider), metadata),
    });
  } finally {
    await pool.end();
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const platform = body.platform as SocialPlatform;
  const connected = Boolean(body.connected);

  if (!REQUIRED_SOCIAL_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const userRes = await pool.query(`select id from users where email = $1 limit 1`, [email]);
    const userId = userRes.rows[0]?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!connected) {
      await pool.query(
        `delete from account where "userId" = $1 and provider = $2`,
        [userId, platform]
      );
    }

    const { rows } = await pool.query(
      `select provider from account where "userId" = $1`,
      [userId]
    );
    return NextResponse.json({
      ok: true,
      connections: connectionsFromProviders(rows.map((row: { provider: string }) => row.provider)),
    });
  } finally {
    await pool.end();
  }
}
