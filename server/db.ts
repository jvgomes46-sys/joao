import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, projects, InsertProject, geoEngineData, InsertGeoEngineData } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Projects queries
export async function getProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get projects: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(projects.updatedAt);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get projects:", error);
    throw error;
  }
}

export async function getProjectById(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get project: database not available");
    return undefined;
  }

  try {
    const result = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get project:", error);
    throw error;
  }
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create project: database not available");
    return undefined;
  }

  try {
    const [result] = await db.insert(projects).values(data);
    const insertId = (result as { insertId: number }).insertId;
    const [created] = await db.select().from(projects).where(eq(projects.id, insertId)).limit(1);
    return created;
  } catch (error) {
    console.error("[Database] Failed to create project:", error);
    throw error;
  }
}

export async function updateProject(projectId: number, userId: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update project: database not available");
    return undefined;
  }

  try {
    const result = await db
      .update(projects)
      .set(data)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update project:", error);
    throw error;
  }
}

export async function deleteProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete project: database not available");
    return undefined;
  }

  try {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete project:", error);
    throw error;
  }
}

// GeoEngine data queries — um registro por projeto, sobrescrito a cada recálculo
export async function getGeoEngineDataByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get geo engine data: database not available");
    return undefined;
  }

  const result = await db.select().from(geoEngineData).where(eq(geoEngineData.projectId, projectId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertGeoEngineData(projectId: number, data: Omit<InsertGeoEngineData, "projectId" | "id">) {
  const db = await getDb();
  if (!db) {
    throw new Error("[Database] Cannot persist GeoEngine result: database not available");
  }

  const existing = await getGeoEngineDataByProjectId(projectId);

  if (existing) {
    await db.update(geoEngineData).set(data).where(eq(geoEngineData.projectId, projectId));
  } else {
    await db.insert(geoEngineData).values({ ...data, projectId });
  }

  return getGeoEngineDataByProjectId(projectId);
}

// TODO: add feature queries here as your schema grows.
