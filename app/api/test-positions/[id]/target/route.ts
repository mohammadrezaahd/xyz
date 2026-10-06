import { NextResponse } from "next/server";
import { updateTestPositionTarget } from "@/lib/test-position/service";
import type { TestPositionDocument } from "@/lib/test-position/types";

export const dynamic="force-dynamic";

function serialize(position:TestPositionDocument|null){
  if(!position) return null;
  return {...position,_id:position._id?.toHexString(),opportunityId:position.opportunityId?.toHexString()??null,opportunitySnapshot:position.opportunitySnapshot?{...position.opportunitySnapshot,opportunityId:position.opportunitySnapshot.opportunityId.toHexString()}:null};
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const body=(await request.json()) as {targetPrice?:unknown};
    const targetPrice=Number(body.targetPrice);
    if(!Number.isFinite(targetPrice)||targetPrice<=0) return NextResponse.json({error:"targetPrice must be positive and finite"},{status:400});
    const position=await updateTestPositionTarget(id,targetPrice);
    return NextResponse.json({position:serialize(position)});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to update target"},{status:400});
  }
}
