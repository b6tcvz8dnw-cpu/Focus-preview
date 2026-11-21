import { formatClock as fmt, dateKey, getStudySkyLevel } from './core/date-time.js';
import { storage } from './data/storage.js';
import { getRemainingSeconds } from './core/timer.js';
import { normalizeTimerSettings, validateBackupPayload, CURRENT_BACKUP_VERSION } from './data/schema.js';
import { createStudyStatsStore } from './data/stats-store.js';
import { mountHourglass } from './features/hourglass.js';
import { createTimerController } from './features/timer-controller.js';
import { mountStudyRoom } from './features/study-room.js';
import { createStudyViews } from './views/study-views.js';
import { createAmbientSoundController } from './features/ambient-sound.js';
import { createNotificationController } from './features/notification-controller.js';
import { createAppearanceController } from './features/appearance-controller.js';
import { createRecoveryController } from './features/recovery-controller.js';
import { createBackupImportController } from './features/backup-import-controller.js';
const $=id=>document.getElementById(id);
const studyViews=createStudyViews();
let durations={focus:25,short:5,long:15},mode='focus',remaining=1500,total=1500,running=false,deadline=0,completed=0,minutes=0,finished=false,history={},records=[],dailyGoal=60,weeklyGoal=300,statsStore=null,calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),audioContext=null,appReady=false,timerController=null;
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
$('apply').onclick=()=>{if((running||remaining!==total)&&!confirm('タイマーの設定を変更すると、現在のセッションは最初からになるよ。変更してもいい？'))return;let vals={focus:+$('focusDuration').value,short:+$('shortDuration').value,long:+$('longDuration').value,cycle:+$('cycleDuration').value};if(vals.focus<1||vals.focus>120||vals.short<1||vals.short>60||vals.long<1||vals.long>90||vals.cycle<2||vals.cycle>8||Object.values(vals).some(v=>!Number.isInteger(v))){$('toast').textContent='設定値を範囲内の整数で入力してね。';return}if(!storage.setJSON('focus-timer-settings',vals)){$('toast').textContent='タイマー設定を保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。';return}timerController.setDurations({focus:vals.focus,short:vals.short,long:vals.long});$('toast').textContent='タイマー設定を保存したよ。'};

document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(b.dataset.page==='settingsPage'){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==b.dataset.page);document.querySelectorAll('.tab[data-page]').forEach(t=>t.removeAttribute('aria-current'));return}setStudyRoomMode(b.dataset.page==='studyRoomPage');document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==b.dataset.page);document.querySelectorAll('.tab[data-page]').forEach(t=>{const active=t===b;t.classList.toggle('active',active);if(active)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current')});if(b.dataset.page==='overviewPage')renderAllRecords();if(b.dataset.page==='calendarPage')renderCalendar();if(b.dataset.page==='analyticsPage')renderAnalytics();if(b.dataset.page==='studyRoomPage'){studyRoom.update();studyRoom.loadWeather()}});
const hourglass = mountHourglass({ getRemainingSeconds });
const studyRoom = mountStudyRoom({ updateSky: updateStudySky });
function refreshAfterReturn(){if(running)timerController.tick();hourglass.tick();studyRoom.onVisible()}
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('app-document-hidden',document.hidden);if(!document.hidden)refreshAfterReturn()});
// iOS Safari may restore a page from the back-forward cache without a full reload.
window.addEventListener('pageshow',event=>{if(event.persisted)refreshAfterReturn()});
function setStudyRoomMode(enabled){
 document.body.classList.toggle('study-room-fullscreen',enabled);
 if(enabled&&screen.orientation&&typeof screen.orientation.lock==='function'){screen.orientation.lock('landscape').catch(()=>{})}
 if(!enabled&&screen.orientation&&typeof screen.orientation.unlock==='function'){try{screen.orientation.unlock()}catch(e){}}
}
$('roomExit').addEventListener('click',()=>setStudyRoomMode(false));
const savedQuietText=storage.getText('focus-room-quiet-text')==='true';$('studyRoomView').classList.toggle('room-quiet-text',savedQuietText);$('roomTextToggle').setAttribute('aria-pressed',String(savedQuietText));$('roomTextToggle').addEventListener('click',()=>{const view=$('studyRoomView'),hidden=!view.classList.contains('room-quiet-text'),button=$('roomTextToggle');if(!storage.setText('focus-room-quiet-text',String(hidden))){$('toast').textContent='表示設定を保存できなかったよ。';return}view.classList.toggle('room-quiet-text',hidden);button.setAttribute('aria-pressed',String(hidden));button.setAttribute('aria-label',hidden?'文字情報を表示する':'文字情報を隠す');button.title=hidden?'文字情報を表示する':'文字情報を隠す'});

window.addEventListener('pagehide',()=>timerController.persistCurrent());
const appearanceController=createAppearanceController({root:document,storage,onMessage:message=>{$('toast').textContent=message}});
appearanceController.initialize();
try{const ts=normalizeTimerSettings(storage.getJSON('focus-timer-settings',null));if(ts){durations={focus:ts.focus,short:ts.short,long:ts.long};$('focusDuration').value=ts.focus;$('shortDuration').value=ts.short;$('longDuration').value=ts.long;$('cycleDuration').value=ts.cycle;storage.setJSON('focus-timer-settings',ts)}}catch(e){}
function syncTimerState(state){durations=state.durations;mode=state.mode;remaining=state.remaining;total=state.total;running=state.running;deadline=state.deadline;finished=state.finished;update()}
timerController=createTimerController({durations,getCycleLength:cycle,getCompletedSessions:()=>completed,store:storage,onChange:syncTimerState,onFocusComplete(){const record={id:String(Date.now())+'-'+Math.random().toString(36).slice(2,7),timestamp:Date.now(),date:dateKey(new Date()),minutes:durations.focus,note:''};const saved=statsStore.addSession(record);if(saved)updateChart();notify('集中セッション完了！休憩を始めよう。');if(!saved)$('toast').textContent='集中記録を保存できなかったよ。端末の空き容量を確認してね。';playCompletionSound();if(appReady){$('reflection').value='';$('reflectionPrompt').textContent='今のセッションで気づいたことを残してみよう。';renderAllRecords();$('reflectionPanel').open=true;$('reflectionPanel').scrollIntoView({behavior:'smooth',block:'nearest'})}},onBreakComplete(){notify('休憩終了！お疲れさま。');playCompletionSound()}});
({durations,mode,remaining,total,running,deadline,finished}=timerController.getState());


statsStore=createStudyStatsStore({storage,onChange:syncStatsState});
const recoveryController=createRecoveryController({
 root:$('recoveryList'),storage,statsStore,
 onMessage:message=>{$('toast').textContent=message},
 onRestored:()=>{$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords()},
 confirmAction:message=>confirm(message),
 documentRef:document,URLApi:URL,BlobCtor:Blob
});
const statsLoad=statsStore.load();if(statsLoad.message)$('toast').textContent=statsLoad.message;
timerController.restore();

$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;
$('saveGoals').onclick=()=>{const d=Number($('dailyGoal').value),w=Number($('weeklyGoal').value);if(!Number.isInteger(d)||!Number.isInteger(w)||d<0||w<0||d>1440||w>10080){$('toast').textContent='目標は範囲内の整数で入力してね。';return}if(!statsStore.setGoals(d,w)){$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;$('toast').textContent='目標を保存できなかったよ。端末の空き容量を確認してね。';return}renderGoals();$('toast').textContent='目標を保存したよ。'};
function renderGoals(){studyViews.renderGoals({history,dailyGoal,weeklyGoal})}
function renderCalendar(){studyViews.renderCalendar({history,cursor:calendarCursor})}
$('monthPrev').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()};
$('monthNext').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()};
function renderHistory(){studyViews.renderHistory({records,query:$('historySearch')?.value||'',reflectionOnly:$('reflectionOnly')?.checked||false})}
$('historyList').onclick=e=>{const del=e.target.closest('[data-record-delete]'),edit=e.target.closest('[data-record-edit]');if(del){const id=del.dataset.recordDelete,r=records.find(x=>x.id===id);if(!r||!confirm('この学習記録を削除する？'))return;if(!statsStore.deleteRecord(id)){$('toast').textContent='学習記録を削除できなかったよ。';return}renderAllRecords()}else if(edit){const r=records.find(x=>x.id===edit.dataset.recordEdit);if(!r)return;const n=Number(prompt('このセッションの集中時間（分）',String(r.minutes)));if(!Number.isInteger(n)||n<1||n>120)return;if(!statsStore.updateRecord(r.id,{minutes:n})){$('toast').textContent='学習記録を更新できなかったよ。';return}renderAllRecords()}};
let analyticsRange='day';
function renderAnalytics(){studyViews.renderAnalytics({history,range:analyticsRange})}
document.querySelectorAll('[data-analytics-range]').forEach(b=>b.addEventListener('click',()=>{analyticsRange=b.dataset.analyticsRange;document.querySelectorAll('[data-analytics-range]').forEach(t=>{const active=t===b;t.classList.toggle('selected',active);t.setAttribute('aria-pressed',String(active))});renderAnalytics()}));
$('historySearch').addEventListener('input',renderHistory);$('reflectionOnly').addEventListener('change',renderHistory);
function renderAllRecords(){update();updateChart();renderGoals();renderCalendar();renderHistory();renderAnalytics()}
function saveReflection(){const r=[...records].sort((a,b)=>b.timestamp-a.timestamp)[0];if(!r){$('toast').textContent='先に集中セッションを完了してね。';return}if(!statsStore.updateRecord(r.id,{note:$('reflection').value.trim()})){$('toast').textContent='振り返りを保存できなかったよ。';return}renderHistory();$('toast').textContent='振り返りを保存したよ。'}
$('saveReflection').onclick=saveReflection;

$('clear').onclick=()=>{if(!confirm('今日の詳細な学習記録を消去する？累計の集中時間と達成状況は残るよ。'))return;if(!statsStore.clearDayRecords(dateKey(new Date()))) {$('toast').textContent='今日の記録を消去できなかったよ。';return}timerController.reset();$('toast').textContent='今日の詳細な記録を消去したよ。累計時間は保持されているよ。';renderAllRecords();};


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
const importController=createBackupImportController({
 input:$('importData'),storage,statsStore,validate:validateBackupPayload,
 buildCurrentBackup:()=>buildBackupPayload(),
 captureSettings:()=>Object.fromEntries(['focus-timer-settings','focus-appearance','focus-mark','focus-notifications','focus-room-quiet-text'].map(key=>[key,storage.getText(key,null)])),
 confirmAction:message=>confirm(message),
 applySettings:obj=>{
  const writes=[];
  if(obj.timerSettings)writes.push(storage.setJSON('focus-timer-settings',obj.timerSettings));
  if(obj.appearance&&obj.appearance.theme)writes.push(storage.setJSON('focus-appearance',{theme:obj.appearance.theme}));
  if(obj.mark)writes.push(storage.setText('focus-mark',obj.mark));
  if(typeof obj.notificationsEnabled==='boolean')writes.push(storage.setText('focus-notifications',String(obj.notificationsEnabled)));
  if(typeof obj.quietText==='boolean')writes.push(storage.setText('focus-room-quiet-text',String(obj.quietText)));
  if(writes.some(ok=>!ok))return false;
  if(obj.appearance&&obj.appearance.theme)appearanceController.setTheme(obj.appearance.theme,{persist:false});
  if(obj.mark)appearanceController.setMark(obj.mark,{persist:false});
  if(typeof obj.notificationsEnabled==='boolean')notificationController.setEnabled(obj.notificationsEnabled,{persist:false});
  if(typeof obj.quietText==='boolean'){$('studyRoomView').classList.toggle('room-quiet-text',obj.quietText);$('roomTextToggle').setAttribute('aria-pressed',String(obj.quietText))}
  return true;
 },
 rollbackSettings:previous=>{
  let ok=true;
  for(const [key,value] of Object.entries(previous)){
   const saved=value===null?storage.removeText(key):storage.setText(key,value);
   if(!saved)ok=false;
  }
  let appearance=null;
  try{appearance=previous['focus-appearance']===null?null:JSON.parse(previous['focus-appearance'])}catch{}
  appearanceController.setTheme(appearance?.theme||'green',{persist:false});
  appearanceController.setMark(previous['focus-mark']||'dot',{persist:false});
  notificationController.setEnabled(previous['focus-notifications']==='true',{persist:false});
  const quiet=previous['focus-room-quiet-text']==='true';
  $('studyRoomView').classList.toggle('room-quiet-text',quiet);
  $('roomTextToggle').setAttribute('aria-pressed',String(quiet));
  return ok;
 },
 onRefresh:()=>{$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords();recoveryController.render()},
 onMessage:message=>{$('toast').textContent=message}
});

if('serviceWorker'in navigator){let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;window.location.reload();}});window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>{}));}
$('calendarPage').appendChild($('calendarPanel'));$('analyticsPage').appendChild($('analyticsPanel'));
update();updateChart();appReady=true;recoveryController.render();
