const $=s=>document.querySelector(s);
const els={
 body:$('#taskBody'),mobile:$('#mobileList'),empty:$('#emptyState'),count:$('#resultCount'),
 search:$('#searchInput'),direction:$('#directionFilter'),status:$('#statusFilter'),priority:$('#priorityFilter'),view:$('#viewFilter'),sort:$('#sortFilter'),
 modal:$('#modalBackdrop'),form:$('#taskForm'),id:$('#taskId'),title:$('#fTitle'),dir:$('#fDirection'),category:$('#fCategory'),counterpart:$('#fCounterpart'),departmentRole:$('#fDepartmentRole'),contact:$('#fContact'),due:$('#fDueDate'),
 fstatus:$('#fStatus'),fpriority:$('#fPriority'),progress:$('#fProgress'),progressValue:$('#progressValue'),content:$('#fContent'),checklist:$('#fChecklist'),documents:$('#fDocuments'),notes:$('#fNotes'),
 checklistModal:$('#checklistBackdrop'),checklistContent:$('#checklistContent'),importModal:$('#importBackdrop'),importContent:$('#importPreviewContent'),
 file:$('#fileInput'),restoreFile:$('#restoreFileInput'),tests:$('#testResults')
};
let tasks=[];
let currentChecklistTaskId=null;
let pendingImport=[];
let metricMode='';
const pad=n=>String(n).padStart(2,'0');
const localDate=(offset=0)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const sampleTasks=()=>[
 {id:uid(),title:'월간 주요업무 실적보고',direction:'인수',dueDate:localDate(2),status:'진행중',priority:'높음',progress:60,content:'부서별 주요업무 추진실적을 취합하고 보고자료를 작성합니다.',checklist:'부서별 자료 요청\n미제출 부서 재요청\n수합자료 검토\n최종 보고자료 작성',notes:'전월 보고자료 형식 참고',createdAt:Date.now(),updatedAt:Date.now()},
 {id:uid(),title:'정기 인사자료 업데이트',direction:'인수',dueDate:localDate(8),status:'예정',priority:'보통',progress:20,content:'인사 변동사항을 확인하여 관리자료를 최신화합니다.',notes:'변동자 명단 재확인',createdAt:Date.now(),updatedAt:Date.now()},
 {id:uid(),title:'행사 운영 매뉴얼 인계',direction:'인계',dueDate:localDate(5),status:'진행중',priority:'보통',progress:75,content:'행사 사전 준비부터 현장 운영까지 필요한 체크사항을 정리해 인계합니다.',checklist:'행사계획 확인\n참석자 명단 점검\n현장 준비사항 인계\n결과보고 위치 안내',notes:'체크리스트 포함',createdAt:Date.now(),updatedAt:Date.now()},
 {id:uid(),title:'문서 보관함 정리',direction:'인계',dueDate:localDate(-1),status:'완료',priority:'낮음',progress:100,content:'공유폴더와 종이문서 보관 위치를 정리하여 인계합니다.',notes:'완료 문서 목록 첨부',createdAt:Date.now(),updatedAt:Date.now()}
];
function uid(){return (crypto.randomUUID?crypto.randomUUID():'t-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
function parseChecklistText(v){return String(v||'').split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean)}
function reconcileChecklist(text,existing=[]){const old=new Map((Array.isArray(existing)?existing:[]).map(x=>[String(x.text||'').trim(),!!x.done]));return parseChecklistText(text).map(x=>({text:x,done:old.get(x)||false}))}
function purgeExpiredTrash(){const now=Date.now();tasks=tasks.filter(t=>!t.deletedAt||(now-Number(t.deletedAt))<TRASH_RETENTION_MS)}
function load(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error('invalid');tasks=parsed.map(t=>normalizeTask(t,false));purgeExpiredTrash();save();}else{tasks=sampleTasks().map(t=>normalizeTask(t,false));save();}const ui=JSON.parse(localStorage.getItem(UI_KEY)||'{}');if(ui.view&&els.view)els.view.value=ui.view;if(ui.sort&&els.sort)els.sort.value=ui.sort;}catch{tasks=sampleTasks().map(t=>normalizeTask(t,false));save();}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(tasks));localStorage.setItem(UI_KEY,JSON.stringify({view:els.view?.value||'active',sort:els.sort?.value||'due'}));}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function daysUntil(dateStr){const today=new Date();today.setHours(0,0,0,0);const d=new Date(dateStr+'T00:00:00');return Math.round((d-today)/86400000)}
function isSoon(t){const d=daysUntil(t.dueDate);return !t.deletedAt&&!t.archivedAt&&t.status!=='완료'&&d>=0&&d<=3}
function dueLabel(t){const d=daysUntil(t.dueDate);if(t.status==='완료')return '';if(d<0)return `기한 ${Math.abs(d)}일 지남`;if(d===0)return '오늘 마감';if(d<=3)return `${d}일 남음`;return ''}
function normalizeTask(t,touch=true){
 const progress=Math.max(0,Math.min(100,Number(t.progress)||0));const status=['예정','진행중','완료'].includes(t.status)?t.status:'예정';const checklist=String(t.checklist||'');
 return {id:t.id||uid(),title:String(t.title||'').trim(),direction:['인수','인계'].includes(t.direction)?t.direction:'인수',category:String(t.category||'').trim(),counterpart:String(t.counterpart||'').trim(),departmentRole:String(t.departmentRole||'').trim(),contact:String(t.contact||'').trim(),dueDate:String(t.dueDate||localDate()),status,priority:['높음','보통','낮음'].includes(t.priority)?t.priority:'보통',progress:status==='완료'?100:progress,previousProgress:Number.isFinite(Number(t.previousProgress))?Number(t.previousProgress):progress,content:String(t.content||''),checklist,checklistItems:reconcileChecklist(checklist,t.checklistItems),documents:String(t.documents||''),notes:String(t.notes||''),archivedAt:t.archivedAt||null,deletedAt:t.deletedAt||null,createdAt:t.createdAt||Date.now(),updatedAt:touch?Date.now():(t.updatedAt||Date.now())};
}
function activeTasks(){return tasks.filter(t=>!t.deletedAt&&!t.archivedAt)}
function checklistStats(t){const items=Array.isArray(t.checklistItems)?t.checklistItems:[];const done=items.filter(x=>x.done).length;return {done,total:items.length,pct:items.length?Math.round(done/items.length*100):0}}
function priorityRank(p){return p==='높음'?0:p==='보통'?1:2}
function sortTasks(list){const mode=els.sort?.value||'due';return list.sort((a,b)=>{if(mode==='updated')return Number(b.updatedAt)-Number(a.updatedAt);if(mode==='priority')return priorityRank(a.priority)-priorityRank(b.priority)||a.dueDate.localeCompare(b.dueDate);if(mode==='progress')return b.progress-a.progress||a.dueDate.localeCompare(b.dueDate);if(mode==='title')return a.title.localeCompare(b.title,'ko');const ac=a.status==='완료'?1:0,bc=b.status==='완료'?1:0;return ac-bc||a.dueDate.localeCompare(b.dueDate)||Number(b.updatedAt)-Number(a.updatedAt)})}
function filtered(){const q=els.search.value.trim().toLowerCase(),view=els.view?.value||'active';let list=tasks.filter(t=>view==='trash'?!!t.deletedAt:view==='archive'?!t.deletedAt&&!!t.archivedAt:!t.deletedAt&&!t.archivedAt);list=list.filter(t=>(!q||[t.title,t.content,t.notes,t.counterpart,t.category].some(v=>String(v||'').toLowerCase().includes(q)))&&(!els.direction.value||t.direction===els.direction.value)&&(!els.status.value||t.status===els.status.value)&&(!els.priority.value||t.priority===els.priority.value));if(metricMode==='soon')list=list.filter(isSoon);else if(metricMode==='important')list=list.filter(t=>t.priority==='높음');return sortTasks(list)}
function statusOptions(t){return ['예정','진행중','완료'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}
function actionButtons(t,view){if(view==='trash')return `<button class="btn small" data-restore-trash="${t.id}">복원</button><button class="btn danger small" data-purge="${t.id}">완전삭제</button>`;if(view==='archive')return `<button class="btn small" data-restore-archive="${t.id}">보관 해제</button><button class="btn small" data-edit="${t.id}">수정</button><button class="btn danger small" data-delete="${t.id}">삭제</button>`;return `${t.checklistItems?.length?`<button class="btn small" data-checklist="${t.id}">체크 ${checklistStats(t).done}/${checklistStats(t).total}</button>`:''}<button class="btn small" data-edit="${t.id}">수정</button>${t.status==='완료'?`<button class="btn small" data-archive="${t.id}">보관</button>`:''}<button class="btn danger small" data-delete="${t.id}">삭제</button>`}
