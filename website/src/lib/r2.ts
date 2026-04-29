import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!
const PUBLIC_URL = process.env.R2_PUBLIC_URL!

// Upload a file buffer to R2
export async function uploadToR2(
  path: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: path,
    Body: body,
    ContentType: contentType,
  }))
  return `${PUBLIC_URL}/${path}`
}

// Delete a file from R2
export async function deleteFromR2(path: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: path,
  }))
}

// Get a signed URL for private files (reports, COGs)
export async function getSignedR2Url(path: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: path }),
    { expiresIn }
  )
}

// Build public URL from path (for photos, previews)
export function r2PublicUrl(path: string): string {
  return `${PUBLIC_URL}/${path}`
}

// Path helpers — keep storage organized
export const r2Paths = {
  photo: (userId: string, filename: string) =>
    `photos/${userId}/${Date.now()}-${filename}`,
  report: (projectId: string, filename: string) =>
    `reports/${projectId}/${filename}`,
  mapExport: (projectId: string, type: string) =>
    `map-exports/${projectId}/${type}-${Date.now()}.png`,
  dailyLayer: (layer: string, date: string) =>
    `daily/${layer}/${date}.png`,
}
