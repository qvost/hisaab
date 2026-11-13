import { handleForexRequest } from '@/lib/forex/proxy';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> { return handleForexRequest(request); }
