import { db, requireUser, ApiError } from "@/lib/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser(),
      { id } = await params;
    const database = await db();
    const versionId = new URL(request.url).searchParams.get("version");
    const background = await database
      .collection("backgrounds")
      .findOne(
        { _id: `${userId}:${id}` as never, userId },
        { projection: versionId ? { id: 1, versions: 1 } : { data: 1 } },
      );
    if (!background) return new Response("Not found", { status: 404 });
    if (
      versionId &&
      !background.versions?.some((version: { id: string }) => version.id === versionId)
    )
      return new Response("Not found", { status: 404 });
    const image = versionId
      ? await database.collection("backgroundVersions").findOne({
          _id: `${userId}:${id}:${versionId}` as never,
          userId,
          backgroundId: id,
        })
      : background;
    if (!image?.data) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(image.data.buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Couldn’t load this background." },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
