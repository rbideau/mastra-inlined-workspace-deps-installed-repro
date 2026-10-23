// The package's other entry point, which the app never imports.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function upload(bucket, key, body) {
  await new S3Client({}).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}
