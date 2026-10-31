import ziwei from '../ziwei-interpret.cjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST 요청만 가능해요.'});
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body)}catch{return res.status(400).json({ok:false,error:'입력 내용을 확인해 주세요.'})}}
  try{
    const result=await ziwei.interpret(body||{});
    return res.status(result.status||200).json(result);
  }catch{
    return res.status(500).json({ok:false,error:'풀이를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'});
  }
}
