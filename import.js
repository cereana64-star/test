function cleanHeader(v){return String(v??'').replace(/\s+/g,' ').trim()}
function headerIndex(header,names){for(const name of names){const i=header.indexOf(name);if(i>=0)return i}return -1}
function valueAt(row,idx){return idx>=0?String(row[idx]??'').trim():''}
function normalizePriorityValue(v){
 const x=String(v||'').replace(/\s+/g,'');
 if(['높음','매우높음','긴급/중요','긴급','중요'].includes(x))return '높음';
 if(['낮음','낮음/일반'].includes(x))return '낮음';
 return '보통';
}
function normalizeStatusValue(v){
 const x=String(v||'').replace(/\s+/g,'');
 if(x==='완료')return '완료';
 if(['진행중','긴급','지연'].includes(x))return '진행중';
 return '예정';
}
function splitDetailNotes(v){
 const s=String(v||''),marker='[참고사항]',i=s.indexOf(marker);
 return i<0?{content:s,notes:''}:{content:s.slice(0,i).trim(),notes:s.slice(i+marker.length).trim()};
}
function findHeaderRow(rows){
 for(let r=0;r<Math.min(rows.length,8);r++){const h=(rows[r]||[]).map(cleanHeader);if(h.includes('업무명')&&(h.includes('구분')||h.includes('인수/인계')))return r}
 return -1;
}
function rowsToTasks(rows){
 if(!rows.length)throw new Error('엑셀에 데이터가 없습니다.');
 const headerRow=findHeaderRow(rows);if(headerRow<0)throw new Error('헤더 행을 찾을 수 없습니다. “구분”과 “업무명” 열이 있는 양식을 사용해 주세요.');
 const header=(rows[headerRow]||[]).map(cleanHeader);
 const col={
  direction:headerIndex(header,['구분','인수/인계']),title:headerIndex(header,['업무명']),category:headerIndex(header,['카테고리','업무분류']),
  counterpart:headerIndex(header,['인수인계 대상자']),departmentRole:headerIndex(header,['소속 부서/직급','담당부서']),contact:headerIndex(header,['연락처/이메일']),
  due:headerIndex(header,['마감기한','처리기한','마감일']),status:headerIndex(header,['진행상태']),priority:headerIndex(header,['우선순위','중요도']),
  progress:headerIndex(header,['완료율']),content:headerIndex(header,['업무 상세 내용 및 주의사항','업무내용']),notes:headerIndex(header,['참고사항','비고','인계메모']),
  checklist:headerIndex(header,['세부 체크리스트 항목 (쉼표 또는 줄바꿈 구분)','세부 체크리스트','체크리스트']),documents:headerIndex(header,['관련 문서/드라이브 링크','관련문서·파일']),
  handoverFrom:headerIndex(header,['인계자']),handoverTo:headerIndex(header,['인수자']),owner:headerIndex(header,['담당자']),
  start:headerIndex(header,['시작일']),related:headerIndex(header,['관련기관·대상']),followup:headerIndex(header,['후속조치']),caution:headerIndex(header,['주의사항'])
 };
 const required=[];if(col.direction<0)required.push('구분');if(col.title<0)required.push('업무명');if(col.due<0)required.push('마감기한/처리기한/마감일');if(required.length)throw new Error(`필수 열이 없습니다: ${required.join(', ')}`);
 const out=[],errors=[];
 for(let r=headerRow+1;r<rows.length;r++){
  const row=rows[r];if(!row||row.every(v=>String(v??'').trim()===''))continue;
  const title=valueAt(row,col.title),direction=valueAt(row,col.direction),due=excelDateToIso(valueAt(row,col.due)),rawStatus=valueAt(row,col.status),rawPriority=valueAt(row,col.priority);
  const rowErr=[];if(!title)rowErr.push('업무명');if(!['인수','인계'].includes(direction))rowErr.push('구분(인수 또는 인계)');if(!/^\d{4}-\d{2}-\d{2}$/.test(due))rowErr.push('마감기한(YYYY-MM-DD)');
  if(rowErr.length){errors.push(`${r+1}행: ${rowErr.join(', ')}`);continue}
  const detail=splitDetailNotes(valueAt(row,col.content));let notes=[detail.notes,valueAt(row,col.notes)].filter(Boolean);
  const sourceStatus=rawStatus&&!['예정','진행중','완료','대기','인수/인계 대기'].includes(rawStatus)?rawStatus:'';
  if(sourceStatus)notes.push(`원본 진행상태: ${sourceStatus}`);
  const start=valueAt(row,col.start),related=valueAt(row,col.related),followup=valueAt(row,col.followup),caution=valueAt(row,col.caution),handoverFrom=valueAt(row,col.handoverFrom),handoverTo=valueAt(row,col.handoverTo),owner=valueAt(row,col.owner);
  if(start)notes.push(`시작일: ${excelDateToIso(start)}`);if(related)notes.push(`관련기관·대상: ${related}`);if(followup)notes.push(`후속조치: ${followup}`);if(caution)notes.push(`주의사항: ${caution}`);
  if(handoverFrom)notes.push(`인계자: ${handoverFrom}`);if(handoverTo)notes.push(`인수자: ${handoverTo}`);if(owner)notes.push(`담당자: ${owner}`);
  let counterpart=valueAt(row,col.counterpart);
  if(!counterpart)counterpart=direction==='인계'?valueAt(row,col.handoverTo):valueAt(row,col.handoverFrom);
  const rawProgress=valueAt(row,col.progress);let progress=rawProgress===''?NaN:Number(rawProgress.replace('%',''));const status=normalizeStatusValue(rawStatus);
  if(!Number.isFinite(progress)||progress<0||progress>100)progress=status==='완료'?100:status==='진행중'?50:0;
  let priority=normalizePriorityValue(rawPriority);if(rawStatus==='긴급')priority='높음';
  out.push(normalizeTask({title,direction,category:valueAt(row,col.category),counterpart,departmentRole:valueAt(row,col.departmentRole),contact:valueAt(row,col.contact),dueDate:due,status,priority,progress,content:detail.content,checklist:valueAt(row,col.checklist),documents:valueAt(row,col.documents),notes:notes.join('\n')}));
 }
 if(errors.length)throw new Error(`업로드할 수 없는 값이 있습니다.\n${errors.slice(0,6).join('\n')}${errors.length>6?`\n외 ${errors.length-6}건`:''}`);
 if(!out.length)throw new Error('업로드할 업무 데이터가 없습니다.');
 return out;
}
async function uploadFile(file){if(!file)return;if(!/\.xlsx$/i.test(file.name)){toast('엑셀 .xlsx 파일만 업로드할 수 있습니다.','error',5000);els.file.value='';return}try{const rows=await parseXlsx(await file.arrayBuffer()),imported=rowsToTasks(rows);showImportPreview(imported)}catch(err){toast('엑셀 업로드 실패: '+err.message,'error',7000);els.file.value=''}}
