import { MongoServerError, type Collection } from "mongodb";
import type { FocusSession } from "./types";
import { sessionWritePipeline } from "./sessions";

async function upsert<T>(write: (insert: boolean) => Promise<T>): Promise<T> {
  try {
    return await write(true);
  } catch (error) {
    // Two tabs may create the first checkpoint at once. The winner has already
    // inserted the record; retry the same atomic update without another insert.
    if (error instanceof MongoServerError && error.code === 11000) return write(false);
    throw error;
  }
}

export function saveStoredSession(
  collection: Collection,
  session: FocusSession,
  userId: string,
  edit = false,
) {
  return upsert((insert) =>
    collection.findOneAndUpdate(
      { _id: `${userId}:${session.id}` as never, userId },
      sessionWritePipeline(session, userId, edit),
      { upsert: insert, returnDocument: "after", projection: { _id: 0, userId: 0 } },
    ),
  );
}

export function deleteStoredSession(collection: Collection, id: string, userId: string) {
  return upsert((insert) =>
    collection.updateOne(
      { _id: `${userId}:${id}` as never, userId },
      { $set: { id, userId, deletedAt: new Date().toISOString(), status: "finished" } },
      { upsert: insert },
    ),
  );
}
