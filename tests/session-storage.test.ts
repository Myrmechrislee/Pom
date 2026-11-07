import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { deleteStoredSession, saveStoredSession } from "../lib/session-storage";
import type { FocusSession } from "../lib/types";

const uri = process.env.POM_TEST_MONGODB_URI;
test(
  "MongoDB atomically advances sessions and preserves corrections, user isolation, and deletion tombstones",
  { skip: !uri },
  async () => {
    const client = await new MongoClient(uri!, { serverSelectionTimeoutMS: 3000 }).connect();
    const database = client.db(`pom_session_test_${crypto.randomUUID().replaceAll("-", "")}`);
    const collection = database.collection("sessions");
    const userId = "test-user";
    const session: FocusSession = {
      id: crypto.randomUUID(),
      startedAt: "2026-11-07T08:00:00.000Z",
      endedAt: "2026-11-07T08:01:00.000Z",
      seconds: 60,
      completed: false,
      status: "active",
      taskId: "$literal-task-id",
    };
    const save = (value: FocusSession, edit = false, owner = userId) =>
      saveStoredSession(collection, value, owner, edit);
    try {
      const inserted = await save(session);
      assert.equal(inserted?.seconds, 60);
      assert.equal(inserted?.taskId, "$literal-task-id");
      await Promise.all([
        save({ ...session, seconds: 120 }),
        save({ ...session, seconds: 90 }),
        save(session),
      ]);
      assert.equal((await collection.findOne({ userId }))?.seconds, 120);
      assert.equal(await collection.countDocuments({ userId }), 1);
      const final = { ...session, seconds: 180, status: "finished" as const, completed: true };
      await save(final);
      await save({ ...session, seconds: 240 });
      assert.equal((await collection.findOne({ userId }))?.seconds, 180);
      const { taskId: _taskId, ...withoutTask } = final;
      await save({ ...withoutTask, seconds: 30, completed: false }, true);
      assert.equal((await collection.findOne({ userId }))?.taskId, undefined);
      await save(final);
      await save({ ...session, seconds: 600 });
      assert.equal((await collection.findOne({ userId }))?.seconds, 30);
      await save(session, false, "other-user");
      assert.equal((await collection.findOne({ userId: "other-user" }))?.seconds, 60);
      assert.equal((await collection.findOne({ userId }))?.seconds, 30);
      await deleteStoredSession(collection, session.id, userId);
      await save(session);
      await save(final, true);
      assert.equal(await collection.countDocuments({ userId, deletedAt: { $exists: false } }), 0);
      // A deletion queued before the first successful heartbeat also prevents revival.
      const deleted = { ...session, id: crypto.randomUUID() };
      await deleteStoredSession(collection, deleted.id, userId);
      await save(deleted);
      assert.equal(await collection.countDocuments({ userId, deletedAt: { $exists: false } }), 0);
      // Previously stored sessions without a status are already final.
      const legacy = { ...session, id: crypto.randomUUID() };
      const { status: _status, ...legacyValue } = legacy;
      await collection.insertOne({
        ...legacyValue,
        userId,
        _id: `${userId}:${legacy.id}` as never,
      });
      assert.equal((await save({ ...legacy, seconds: 120 }))?.seconds, 60);
      const concurrent = { ...session, id: crypto.randomUUID() };
      await Promise.all([60, 90, 120].map((seconds) => save({ ...concurrent, seconds })));
      assert.equal(await collection.countDocuments({ id: concurrent.id, userId }), 1);
      assert.equal((await collection.findOne({ id: concurrent.id, userId }))?.seconds, 120);
      const raced = { ...session, id: crypto.randomUUID() };
      await Promise.all([save(raced), deleteStoredSession(collection, raced.id, userId)]);
      assert.equal(
        await collection.countDocuments({ id: raced.id, userId, deletedAt: { $exists: false } }),
        0,
      );
    } finally {
      await database.dropDatabase();
      await client.close();
    }
  },
);
