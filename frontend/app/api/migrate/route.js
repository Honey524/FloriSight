import { Pool } from "pg";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for Supabase
  });

  try {
    const sqlPath = path.join(process.cwd(), "..", "florisight_backup.sql");
    const sql = await fs.readFile(sqlPath, "utf-8");
    
    await pool.query(sql);
    
    return NextResponse.json({ success: true, message: "Database migrated successfully!" });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
