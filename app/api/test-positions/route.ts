import { NextResponse } from "next/server";
import { startTestPosition } from "@/lib/test-position/service";
import { listTestPositions } from "@/lib/test-position/repository";
import type { TestPositionDocument } from "@/lib/test-position/types";

export const dynamic="force-dynamic";

function serialize(position:TestPositionDocument){
  return {
    ...position,
    _id:position._id?.toHexString(),
    opportunityId:position.opportunityId?.toHexString()??null,
    opportunitySnapshot:position.opportunitySnapshot?{
      ...position.opportunitySnapshot,
      opportunityId:position.opportunitySnapshot.opportunityId.toHexString(),
    }:null,
  };
}

export async function GET(){
  try{
    const positions=await listTestPositions(100);
    return NextResponse.json({
      open:positions.filter(p=>p.status==="OPEN").map(serialize),
      history:positions.filter(p=>p.status!=="OPEN").map(serialize),
      all:positions.map(serialize),
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to load test positions"},{status:503});
  }
}

export async function POST(request:Request){
  try{
    const body=(await request.json()) as {opportunityId?:unknown;initialCapital?:unknown;leverage?:unknown;targetPrice?:unknown};
    const targetPrice=Number(body.targetPrice);
    const initialCapital=body.initialCapital===undefined?undefined:Number(body.initialCapital);
    const leverage=body.leverage===undefined?undefined:Number(body.leverage);
    const opportunityId=body.opportunityId===undefined||body.opportunityId===null||body.opportunityId===""?null:String(body.opportunityId);
    if(!Number.isFinite(targetPrice)||targetPrice<=0) return NextResponse.json({error:"targetPrice must be positive and finite"},{status:400});
    if(initialCapital!==undefined&&(!Number.isFinite(initialCapital)||initialCapital<=0)) return NextResponse.json({error:"initialCapital must be positive and finite"},{status:400});
    const position=await startTestPosition({opportunityId,initialCapital,leverage,targetPrice});
    return NextResponse.json({position:serialize(position)},{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to start test position"},{status:400});
  }
}
