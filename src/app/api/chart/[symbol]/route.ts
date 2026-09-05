import { fetchChart } from '@/features/market/server/chart';
import { marketResponseError } from '@/features/market/server/http';
import { MarketError,validDate,validSymbol } from '@/features/market/server/provider';
import { NextRequest,NextResponse } from 'next/server';
export async function GET(request:NextRequest,{params}:{params:Promise<{symbol:string}>}) {
 try {const {symbol}=await params;const query=request.nextUrl.searchParams;const start=query.get('start'),end=query.get('end'),range=query.get('range')??'6mo';
  if(!validSymbol(symbol)||!['5d','1mo','3mo','6mo','1y','5y'].includes(range)||(start&&!validDate(start))||(end&&!validDate(end))||(start&&end&&start>end)) throw new MarketError('유효한 종목과 조회 기간이 필요합니다.',400);
  const series=await fetchChart(symbol,range,start,end,request.signal);
  return NextResponse.json(query.get('detailed')==='true'?series:series.points,{headers:{'Cache-Control':'no-store'}});
 } catch(error) {return marketResponseError(error);}
}
