import { formatClock as fmt, dateKey, getStudySkyLevel } from './core/date-time.js';
import { storage } from './data/storage.js';
import { getRemainingSeconds } from './core/timer.js';
import { normalizeTimerSettings, validateBackupPayload, CURRENT_BACKUP_VERSION } from './data/schema.js';
import { createStudyStatsStore } from './data/stats-store.js';
import { inspectRecoverySnapshots } from './data/recovery.js';
import { mountHourglass } from './features/hourglass.js';
import { createTimerController } from './features/timer-controller.js';
import { mountStudyRoom } from './features/study-room.js';
import { createStudyViews } from './views/study-views.js';
import { createAmbientSoundController } from './features/ambient-sound.js';
import { createNotificationController } from './features/notification-controller.js';
const $=id=>document.getElementById(id);
const studyViews=createStudyViews();
let durations={focus:25,short:5,long:15},mode='focus',remaining=1500,total=1500,running=false,deadline=0,completed=0,minutes=0,finished=false,history={},records=[],dailyGoal=60,weeklyGoal=300,statsStore=null,calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),audioContext=null,audioSource=null,audioGain=null,currentSound='off',appReady=false,timerController=null;
const labels={focus:'集中する時間',short:'短い休憩',long:'長い休憩'},hints={focus:'ひとつのことに集中しよう。',short:'少し頭を休めよう。',long:'ゆっくり休んで次のセットに備えよう。'},circ=2*Math.PI*88;
function cycle(){return Math.max(2,Math.min(8,+$('cycleDuration').value||4))}
function syncStatsState(state){completed=state.completed;minutes=state.minutes;history=state.history;records=state.records;dailyGoal=state.dailyGoal;weeklyGoal=state.weeklyGoal}
function updateStudySky(){
 const todayMinutes=Math.max(0,Number(history[dateKey(new Date())]||0));
 const level=getStudySkyLevel(todayMinutes);
 const view=$('studyRoomView');
 if(!view)return;
 view.classList.remove('sky-level-0','sky-level-1','sky-level-2','sky-level-3','sky-level-4');
 view.classList.add('sky-level-'+level);
 const labels=['今夜の星空','星屑が少し増えた','天の川が姿を見せた','流れ星が通り始めた','流星群の夜'];
 const label=$('skyProgressLabel');if(label)label.textContent=labels[level];
}
function updateChart(){updateStudySky();studyViews.renderWeekly({history})}
function update(){
 $('clock').textContent=fmt(remaining);$('modeLabel').textContent=labels[mode];$('hint').textContent=hints[mode];
 $('status').textContent=running?'● FOCUSING':finished?'● COMPLETED':'● READY';
 const ratio=total?remaining/total:0;$('timerPanel').classList.toggle('timer-near-end',ratio<=.15);$('timerPanel').classList.toggle('timer-midpoint',ratio<=.5&&ratio>.15);
 $('start').textContent=running?'Ⅱ 一時停止':'▶ スタート';
 $('progress').style.strokeDasharray=circ;$('progress').style.strokeDashoffset=circ*(1-remaining/total);
 $('sessions').textContent=completed;$('minutes').textContent=minutes;studyViews.renderAchievements(minutes);$('round').textContent=(completed%cycle()+1)+'/'+cycle();
 $('setLabel').textContent=(completed%cycle())+' / '+cycle()+' セッション';
 [...$('dots').children].forEach((d,i)=>d.classList.toggle('done',i<completed%cycle()));
 document.title=fmt(remaining)+' | FOCUS';
 document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
}
let notificationsEnabled=false;
const notificationController=createNotificationController({
 root:document,
 storage,
 getNotificationApi:()=>window.Notification,
 onMessage:message=>{$('toast').textContent=message},
 onStateChange:enabled=>{notificationsEnabled=enabled}
});
function notify(title){notificationController.notify(title)}
function playCompletionSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=audioContext||new C();audioContext=c;c.resume().then(()=>{[660,880].forEach((hz,i)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*.16;o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.42);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.45)})}).catch(()=>{})}catch(e){}}
$('start').onclick=()=>{if(running){timerController.pause();return}if(finished){$('toast').textContent='次のモードを選んでスタートしよう。';return}timerController.start()};
function setLargeMode(enabled){document.body.classList.toggle('timer-large-mode',enabled);$('largeToggle').setAttribute('aria-pressed',String(enabled));$('largeToggle').textContent=enabled?'⤢ 通常表示':'⛶ 大画面';}
$('largeToggle').onclick=()=>setLargeMode(!document.body.classList.contains('timer-large-mode'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('timer-large-mode'))setLargeMode(false)});
$('reset').onclick=()=>{if(running&&!confirm('進行中のタイマーをリセットする？'))return;timerController.reset();$('toast').textContent='タイマーをリセットしたよ。'};
$('skip').onclick=()=>{if(running&&!confirm('タイマーを停止して次の時間に切り替える？'))return;timerController.skip();$('toast').textContent='次の時間に切り替えたよ。'};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(running&&!confirm('タイマーを停止してモードを切り替える？'))return;timerController.setMode(b.dataset.mode)});
$('apply').onclick=()=>{if((running||remaining!==total)&&!confirm('タイマーの設定を変更すると、現在のセッションは最初からになるよ。変更してもいい？'))return;let vals={focus:+$('focusDuration').value,short:+$('shortDuration').value,long:+$('longDuration').value,cycle:+$('cycleDuration').value};if(vals.focus<1||vals.focus>120||vals.short<1||vals.short>60||vals.long<1||vals.long>90||vals.cycle<2||vals.cycle>8||Object.values(vals).some(v=>!Number.isInteger(v))){$('toast').textContent='設定値を範囲内の整数で入力してね。';return}timerController.setDurations({focus:vals.focus,short:vals.short,long:vals.long});storage.setJSON('focus-timer-settings',vals);$('toast').textContent='タイマー設定を保存したよ。'};

document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(b.dataset.page==='settingsPage'){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==b.dataset.page);return}setStudyRoomMode(b.dataset.page==='studyRoomPage');document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==b.dataset.page);document.querySelectorAll('[data-page]').forEach(t=>t.classList.toggle('active',t===b));if(b.dataset.page==='overviewPage')renderAllRecords();if(b.dataset.page==='calendarPage')renderCalendar();if(b.dataset.page==='analyticsPage')renderAnalytics();if(b.dataset.page==='studyRoomPage'){studyRoom.update();studyRoom.loadWeather()}});
const hourglass = mountHourglass({ getRemainingSeconds });
const studyRoom = mountStudyRoom({ updateSky: updateStudySky });
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(running)timerController.tick();hourglass.tick();studyRoom.onVisible()}});
function setStudyRoomMode(enabled){
 document.body.classList.toggle('study-room-fullscreen',enabled);
 if(enabled&&screen.orientation&&typeof screen.orientation.lock==='function'){screen.orientation.lock('landscape').catch(()=>{})}
 if(!enabled&&screen.orientation&&typeof screen.orientation.unlock==='function'){try{screen.orientation.unlock()}catch(e){}}
}
$('roomExit').addEventListener('click',()=>setStudyRoomMode(false));
const savedQuietText=storage.getText('focus-room-quiet-text')==='true';$('studyRoomView').classList.toggle('room-quiet-text',savedQuietText);$('roomTextToggle').setAttribute('aria-pressed',String(savedQuietText));$('roomTextToggle').addEventListener('click',()=>{const view=$('studyRoomView'),hidden=view.classList.toggle('room-quiet-text'),button=$('roomTextToggle');storage.setText('focus-room-quiet-text',String(hidden));button.setAttribute('aria-pressed',String(hidden));button.setAttribute('aria-label',hidden?'文字情報を表示する':'文字情報を隠す');button.title=hidden?'文字情報を表示する':'文字情報を隠す'});

window.addEventListener('pagehide',()=>timerController.persistCurrent());
const themes={
 green:{bg:'#101915',panel:'#19251f',deep:'#111b16',line:'#304138',text:'#edf4ef',muted:'#9eafa4',accent:'#8ec5a3',accent2:'#294b38',tab:'rgba(16,25,21,.96)'},
 blue:{bg:'#101923',panel:'#192838',deep:'#111d29',line:'#30475a',text:'#edf4fb',muted:'#9eafc1',accent:'#8ab9e8',accent2:'#244765',tab:'rgba(16,25,35,.96)'},
 purple:{bg:'#191522',panel:'#251e32',deep:'#1b1726',line:'#443653',text:'#f2edf9',muted:'#b2a5c3',accent:'#b8a0e8',accent2:'#443663',tab:'rgba(25,21,34,.96)'},
 amber:{bg:'#1b1710',panel:'#2a2318',deep:'#201a11',line:'#51432c',text:'#f8f0e2',muted:'#bcae94',accent:'#e7b96f',accent2:'#574323',tab:'rgba(27,23,16,.96)'},
 rose:{bg:'#1b1317',panel:'#2a1d23',deep:'#21171c',line:'#50333d',text:'#f8edf0',muted:'#bea5ad',accent:'#e6a0ad',accent2:'#59323d',tab:'rgba(27,19,23,.96)'}
};
function setTheme(name,save=true){
 const t=themes[name]||themes.green,root=document.documentElement;
 for(const [key,value] of Object.entries({bg:t.bg,panel:t.panel,'surface-deep':t.deep,line:t.line,text:t.text,muted:t.muted,accent:t.accent,accent2:t.accent2,'tab-bg':t.tab}))root.style.setProperty('--'+key,value);
 document.querySelectorAll('[data-theme]').forEach(b=>{const active=b.dataset.theme===name;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
 document.querySelector('meta[name="theme-color"]').setAttribute('content',t.bg);
 if(save)storage.setJSON('focus-appearance',{theme:name,mark:storage.getText('focus-mark')||'dot'})
}
function setMark(name,save=true){const marks={dot:'●',star:'✦',leaf:'❧'};$('brandMark').textContent=marks[name]||marks.dot;document.querySelectorAll('[data-mark]').forEach(b=>{const active=b.dataset.mark===name;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});if(save)storage.setText('focus-mark',name)}
document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.theme));
document.querySelectorAll('[data-mark]').forEach(b=>b.onclick=()=>setMark(b.dataset.mark));
try{const ts=normalizeTimerSettings(storage.getJSON('focus-timer-settings',null));if(ts){durations={focus:ts.focus,short:ts.short,long:ts.long};$('focusDuration').value=ts.focus;$('shortDuration').value=ts.short;$('longDuration').value=ts.long;$('cycleDuration').value=ts.cycle;storage.setJSON('focus-timer-settings',ts)}}catch(e){}
function syncTimerState(state){durations=state.durations;mode=state.mode;remaining=state.remaining;total=state.total;running=state.running;deadline=state.deadline;finished=state.finished;update()}
timerController=createTimerController({durations,getCycleLength:cycle,getCompletedSessions:()=>completed,store:storage,onChange:syncTimerState,onFocusComplete(){const record={id:String(Date.now())+'-'+Math.random().toString(36).slice(2,7),timestamp:Date.now(),date:dateKey(new Date()),minutes:durations.focus,note:''};statsStore.addSession(record);updateChart();notify('集中セッション完了！休憩を始めよう。');playCompletionSound();if(appReady){$('reflection').value='';$('reflectionPrompt').textContent='今のセッションで気づいたことを残してみよう。';renderAllRecords();$('reflectionPanel').open=true;$('reflectionPanel').scrollIntoView({behavior:'smooth',block:'nearest'})}},onBreakComplete(){notify('休憩終了！お疲れさま。');playCompletionSound()}});
({durations,mode,remaining,total,running,deadline,finished}=timerController.getState());
try{const ap=storage.getJSON('focus-appearance',null);if(ap&&ap.theme)setTheme(ap.theme,false);setMark(storage.getText('focus-mark')||'dot',false)}catch(e){}

statsStore=createStudyStatsStore({storage,onChange:syncStatsState});
const statsLoad=statsStore.load();if(statsLoad.message)$('toast').textContent=statsLoad.message;
timerController.restore();

$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;
$('saveGoals').onclick=()=>{const d=Number($('dailyGoal').value),w=Number($('weeklyGoal').value);if(!Number.isInteger(d)||!Number.isInteger(w)||d<0||w<0||d>1440||w>10080){$('toast').textContent='目標は範囲内の整数で入力してね。';return}statsStore.setGoals(d,w);renderGoals();$('toast').textContent='目標を保存したよ。'};
function renderGoals(){studyViews.renderGoals({history,dailyGoal,weeklyGoal})}
function renderCalendar(){studyViews.renderCalendar({history,cursor:calendarCursor})}
$('monthPrev').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()};
$('monthNext').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()};
function renderHistory(){studyViews.renderHistory({records,query:$('historySearch')?.value||'',reflectionOnly:$('reflectionOnly')?.checked||false})}
$('historyList').onclick=e=>{const del=e.target.closest('[data-record-delete]'),edit=e.target.closest('[data-record-edit]');if(del){const id=del.dataset.recordDelete,r=records.find(x=>x.id===id);if(!r||!confirm('この学習記録を削除する？'))return;statsStore.deleteRecord(id);renderAllRecords()}else if(edit){const r=records.find(x=>x.id===edit.dataset.recordEdit);if(!r)return;const n=Number(prompt('このセッションの集中時間（分）',String(r.minutes)));if(!Number.isInteger(n)||n<1||n>120)return;statsStore.updateRecord(r.id,{minutes:n});renderAllRecords()}};
let analyticsRange='day';
function renderAnalytics(){studyViews.renderAnalytics({history,range:analyticsRange})}
document.querySelectorAll('[data-analytics-range]').forEach(b=>b.addEventListener('click',()=>{analyticsRange=b.dataset.analyticsRange;renderAnalytics()}));
$('historySearch').addEventListener('input',renderHistory);$('reflectionOnly').addEventListener('change',renderHistory);
function renderAllRecords(){update();updateChart();renderGoals();renderCalendar();renderHistory();renderAnalytics()}
function saveReflection(){const r=[...records].sort((a,b)=>b.timestamp-a.timestamp)[0];if(!r){$('toast').textContent='先に集中セッションを完了してね。';return}statsStore.updateRecord(r.id,{note:$('reflection').value.trim()});renderHistory();$('toast').textContent='振り返りを保存したよ。'}
$('saveReflection').onclick=saveReflection;

$('clear').onclick=()=>{if(!confirm('今日の詳細な学習記録を消去する？累計の集中時間と達成状況は残るよ。'))return;timerController.reset();statsStore.clearDayRecords(dateKey(new Date()));$('toast').textContent='今日の詳細な記録を消去したよ。累計時間は保持されているよ。';renderAllRecords();};


const ambientSound = createAmbientSoundController({
 root: document,
 getAudioContextConstructor: () => window.AudioContext || window.webkitAudioContext,
 getVolume: () => Number($('soundVolume').value) / 100,
 getExistingAudioContext: () => audioContext,
 onContextCreated: context => { audioContext = context; },
 onUnsupported: () => { $('toast').textContent='このブラウザでは環境音を再生できないようだよ。'; }
});
document.querySelectorAll('[data-sound]').forEach(b=>b.onclick=()=>ambientSound.toggle(b.dataset.sound));
document.querySelectorAll('[data-sound-preset]').forEach(b=>b.onclick=()=>ambientSound.setPreset(b.dataset.soundPreset));
$('soundVolume').oninput=()=>ambientSound.setVolume(Number($('soundVolume').value)/100);
function buildBackupPayload(){return {app:'FOCUS',version:CURRENT_BACKUP_VERSION,exportedAt:new Date().toISOString(),stats:statsStore.exportStats(),timerSettings:normalizeTimerSettings(storage.getJSON('focus-timer-settings',null)),appearance:storage.getJSON('focus-appearance',null),mark:storage.getText('focus-mark')||'dot',notificationsEnabled,quietText:storage.getText('focus-room-quiet-text')==='true'}}
function downloadBackup(payload,filename){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('exportData').onclick=()=>{downloadBackup(buildBackupPayload(),'focus-backup-'+dateKey(new Date())+'.json');$('toast').textContent='バックアップを書き出したよ。'};
function renderRecovery(){
 const root=$('recoveryList');if(!root)return;
 root.replaceChildren();
 const items=inspectRecoverySnapshots(storage).filter(item=>item.available);
 if(!items.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='復旧用データは見つかっていないよ。';root.appendChild(empty);return}
 for(const item of items){
  const row=document.createElement('div');row.className='recovery-item';
  const title=document.createElement('strong');title.textContent=item.label;
  const status=document.createElement('p');status.className='muted';status.textContent=item.status;
  const actions=document.createElement('div');actions.className='recovery-actions';
  const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='元データを書き出す';download.dataset.recoveryDownload=item.key;
  actions.appendChild(download);
  if(item.restorable){const restore=document.createElement('button');restore.type='button';restore.className='secondary';restore.textContent='学習記録を復元';restore.dataset.recoveryRestore=item.key;actions.appendChild(restore)}
  row.append(title,status,actions);root.appendChild(row);
 }
}
function downloadRecoverySnapshot(key){
 const item=inspectRecoverySnapshots(storage).find(entry=>entry.key===key&&entry.available);
 if(!item)return;
 let extension='json';try{JSON.parse(item.rawText)}catch{extension='txt'}
 const blob=new Blob([item.rawText],{type:extension==='json'?'application/json':'text/plain'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='focus-recovery-'+key+'.'+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function restoreRecoverySnapshot(key){
 const item=inspectRecoverySnapshots(storage).find(entry=>entry.key===key&&entry.available&&entry.restorable);
 if(!item){$('toast').textContent='このデータは自動復元できないため、元データを書き出して保管してね。';return}
 if(!confirm('このバックアップの学習記録と目標で、現在の記録を置き換える？\n復元直前のデータも端末内に保護するよ。'))return;
 const currentRaw=storage.getText('focus-stats',null);
 if(currentRaw!==null&&!storage.setText('focus-pre-recovery-raw-stats',currentRaw)){
  $('toast').textContent='復元直前のデータを保護できなかったため、復元を中止したよ。';return;
 }
 const stats=item.stats;
 const result=statsStore.replaceStats(stats);
 if(!result.ok){$('toast').textContent='復元データの保存に失敗したよ。復元直前のデータは保護してあるので、空き容量などを確認してね。';return;}
 $('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords();renderRecovery();
 $('toast').textContent='学習記録を復元したよ。復元直前のデータも端末内に保護してあるよ。';
}
$('recoveryList').onclick=e=>{
 const download=e.target.closest('[data-recovery-download]');
 if(download){downloadRecoverySnapshot(download.dataset.recoveryDownload);return}
 const restore=e.target.closest('[data-recovery-restore]');
 if(restore)restoreRecoverySnapshot(restore.dataset.recoveryRestore);
};

$('importData').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text()),checked=validateBackupPayload(parsed);if(!checked.valid){$('toast').textContent=checked.reason;return}if(!confirm('現在の学習記録をバックアップの内容で置き換える？\n読み込み前の状態も端末内に退避するよ。'))return;const snapshot=buildBackupPayload(),obj=checked.data,s=obj.stats;const transaction=statsStore.replaceStats(s,{backupKey:'focus-preimport-backup',backupPayload:snapshot});if(!transaction.ok){$('toast').textContent=transaction.stage==='backup'?'端末内バックアップを作成できなかったため、読み込みを中止したよ。':'学習記録の保存に失敗したよ。読み込み前のデータは保護してあるので、再読み込みして状態を確認してね。';return}if(obj.timerSettings)storage.setJSON('focus-timer-settings',obj.timerSettings);if(obj.appearance&&obj.appearance.theme){setTheme(obj.appearance.theme);setMark(obj.mark)}else if(obj.mark)setMark(obj.mark);if(typeof obj.notificationsEnabled==='boolean'){notificationController.setEnabled(obj.notificationsEnabled)}if(typeof obj.quietText==='boolean'){storage.setText('focus-room-quiet-text',String(obj.quietText));$('studyRoomView').classList.toggle('room-quiet-text',obj.quietText);$('roomTextToggle').setAttribute('aria-pressed',String(obj.quietText))}$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords();renderRecovery();$('toast').textContent='バックアップを読み込んだよ。読み込み前のデータは端末内に退避してあるよ。ページを再読み込みすると設定も反映されるよ。'}catch(err){$('toast').textContent='ファイルを読み込めなかったよ。JSONの形式を確認してね。'}finally{e.target.value=''}};

if('serviceWorker'in navigator){let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;window.location.reload();}});window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>{}));}
$('calendarPage').appendChild($('calendarPanel'));$('analyticsPage').appendChild($('analyticsPanel'));
update();updateChart();appReady=true;renderRecovery();
