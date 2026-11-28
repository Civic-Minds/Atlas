/**
 * CIV-2217: the archive day store (shared/liveArchiveDay.ts) over S3 (R2): v2 snapshots from the recorder's bucket, v1
 * from the agency's own archive bucket. Read only.
 */
import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { LIVE_V2_BUCKET, type ArchiveDayStore } from '../shared/liveArchiveDay';

/** Every key under a prefix. */
export async function listAllKeys(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

const missing = (e: unknown) => { const n = (e as { name?: string; Code?: string }).name ?? (e as { Code?: string }).Code; return n === 'NoSuchKey' || n === 'NotFound'; };

export function s3ArchiveDayStore(client: S3Client, v1Bucket: string): ArchiveDayStore {
  return {
    async getV2(key) {
      try { return await (await client.send(new GetObjectCommand({ Bucket: LIVE_V2_BUCKET, Key: key }))).Body!.transformToByteArray(); }
      catch (e) { if (missing(e)) return null; throw e; }
    },
    listV1: prefix => listAllKeys(client, v1Bucket, prefix),
    getV1: async key => (await client.send(new GetObjectCommand({ Bucket: v1Bucket, Key: key }))).Body!.transformToString(),
    // #1815: an hour's pack, from the recorder's bucket.
    async getPack(key) {
      try { return await (await client.send(new GetObjectCommand({ Bucket: LIVE_V2_BUCKET, Key: key }))).Body!.transformToByteArray(); }
      catch (e) { if (missing(e)) return null; throw e; }
    },
  };
}
