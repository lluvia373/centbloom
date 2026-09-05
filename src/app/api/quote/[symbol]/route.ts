import { marketResponseError } from '@/features/market/server/http';
import { MarketError,validSymbol } from '@/features/market/server/provider';
import { fetchQuote } from '@/features/market/server/quote';
import { NextRequest,NextResponse } from 'next/server';
export async function GET(request:NextRequest,{params}:{params:Promise<{symbol:string}>}) {
  try {const {symbol}=await params;if(!validSymbol(symbol)) throw new MarketError('유효한 종목 코드가 필요합니다.',400);
    return NextResponse.json(await fetchQuote(symbol,request.signal),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return marketResponseError(error);}
}
