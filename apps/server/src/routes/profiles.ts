import { Hono } from "hono";
import { z } from "zod";
import {
  ProfileDataSchema,
  ProfileInputSchema,
  cloneProfileData,
  newId,
  type Profile,
  type ProfileSummary,
} from "@rb/shared";
import { db } from "../db.ts";

interface ProfileRow {
  id: string;
  name: string;
  language: string;
  data: string;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    language: row.language as Profile["language"],
    data: ProfileDataSchema.parse(JSON.parse(row.data)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getProfile(id: string): Profile | null {
  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined;
  return row ? fromRow(row) : null;
}

function insertProfile(input: z.infer<typeof ProfileInputSchema>): Profile {
  const now = new Date().toISOString();
  const id = newId();
  db.prepare("INSERT INTO profiles (id, name, language, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    input.name,
    input.language,
    JSON.stringify(input.data),
    now,
    now,
  );
  return getProfile(id)!;
}

export const profileRoutes = new Hono()
  .get("/", (c) => {
    const rows = db.prepare("SELECT * FROM profiles ORDER BY updated_at DESC").all() as unknown as ProfileRow[];
    const summaries: ProfileSummary[] = rows.map((row) => {
      const p = fromRow(row);
      return {
        id: p.id,
        name: p.name,
        language: p.language,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        fullName: p.data.basics.fullName,
        sectionCount: p.data.sections.length,
      };
    });
    return c.json(summaries);
  })
  .post("/", async (c) => {
    const input = ProfileInputSchema.parse(await c.req.json());
    return c.json(insertProfile(input), 201);
  })
  .get("/:id", (c) => {
    const p = getProfile(c.req.param("id"));
    return p ? c.json(p) : c.json({ error: "Profile not found" }, 404);
  })
  .put("/:id", async (c) => {
    const input = ProfileInputSchema.parse(await c.req.json());
    const res = db
      .prepare("UPDATE profiles SET name = ?, language = ?, data = ?, updated_at = ? WHERE id = ?")
      .run(input.name, input.language, JSON.stringify(input.data), new Date().toISOString(), c.req.param("id"));
    if (res.changes === 0) return c.json({ error: "Profile not found" }, 404);
    return c.json(getProfile(c.req.param("id")));
  })
  .post("/:id/duplicate", async (c) => {
    const source = getProfile(c.req.param("id"));
    if (!source) return c.json({ error: "Profile not found" }, 404);
    const { name } = z.object({ name: z.string().trim().min(1).optional() }).parse(await c.req.json().catch(() => ({})));
    const copy = insertProfile({ name: name ?? `${source.name} (copy)`, language: source.language, data: cloneProfileData(source.data) });
    return c.json(copy, 201);
  })
  .delete("/:id", (c) => {
    db.prepare("DELETE FROM profiles WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });
