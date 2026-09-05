import { marketResponseError } from '@/features/market/server/http';
import { MarketError } from '@/features/market/server/provider';
import { fetchSearch } from '@/features/market/server/search';
import { MARKETS,type MarketFilter } from '@/lib/markets';
import { NextRequest,NextResponse } from 'next/server';
export async function GET(request:NextRequest) {
 try {const query=request.nextUrl.searchParams.get('q')?.trim()??'';const market=request.nextUrl.searchParams.get('market')??'all';
  if(query.length>120||!MARKETS.some(item=>item.id===market)) throw new MarketError('검색 조건을 확인해 주세요.',400);
  return NextResponse.json(query?await fetchSearch(query,market as MarketFilter,request.signal):[],{headers:{'Cache-Control':'no-store'}});
 } catch(error) {return marketResponseError(error);}
}
