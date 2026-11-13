import { nstToday, parseNrbResponse, validateForexDate } from './types';
const SUCCESS_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800';
export async function handleForexRequest(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  let date: string;
  try { const query = new URL(request.url).searchParams; if (query.getAll('date').length !== 1) throw new Error('Provide exactly one date parameter.'); date = validateForexDate(query.get('date')); if (date > nstToday()) throw new Error('Future settlement dates are not supported.'); }
  catch (error) { return Response.json({error: error instanceof Error ? error.message : 'Invalid date.'},{status:400,headers:{'Cache-Control':'no-store'}}); }
  const params = new URLSearchParams({page:'1',per_page:'1',from:date,to:date});
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(),8000);
  try {
    const response = await fetcher(`https://www.nrb.org.np/api/forex/v1/rates?${params}`,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('NRB is unavailable.');
    const body: unknown = await response.json(); const publication = parseNrbResponse(body,date);
    // Do not cache a pre-publication empty response for a full day.
    const cache = Object.keys(publication.rates).length ? SUCCESS_CACHE : 'no-store';
    return Response.json(publication,{headers:{'Cache-Control':cache}});
  } catch { return Response.json({error:'NRB rates are temporarily unavailable. Try again or use a saved rate.'},{status:controller.signal.aborted ? 504 : 502,headers:{'Cache-Control':'no-store'}}); }
  finally { clearTimeout(timeout); }
}
