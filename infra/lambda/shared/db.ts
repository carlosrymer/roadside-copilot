import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

/** Write a record under a claim. `sk` distinguishes the claim snapshot from events. */
export async function putRecord(claimId: string, sk: string, data: Record<string, unknown>): Promise<void> {
  if (!TABLE) throw new Error('TABLE_NAME is not set');
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { claimId, sk, at: new Date().toISOString(), ...data },
    }),
  );
}

/** Read all records for a claim (the snapshot plus any events/notifications). */
export async function getClaimRecords(claimId: string): Promise<Record<string, unknown>[]> {
  if (!TABLE) throw new Error('TABLE_NAME is not set');
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'claimId = :c',
      ExpressionAttributeValues: { ':c': claimId },
    }),
  );
  return (res.Items ?? []) as Record<string, unknown>[];
}
