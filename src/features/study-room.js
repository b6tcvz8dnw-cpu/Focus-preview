// Study Room scene state, weather integration, and time/season presentation.
export function mountStudyRoom({ root = document, updateSky = () => {} } = {}) {
  const $ = id => root.getElementById(id);
  const seasons = [
    {id:'spring',name:'春',months:[2,3,4],message:'花の気配が、窓の向こうに少しずつ増えていく。'},
    {id:'summer',name:'夏',months:[5,6,7],message:'光の強い午後も、ここには静かな風が通っている。'},
    {id:'autumn',name:'秋',months:[8,9,10],message:'色づく景色を眺めながら、時間が過ぎるのを待とう。'},
    {id:'winter',name:'冬',months:[11,0,1],message:'冷たい空の下、部屋の中には穏やかな静けさがある。'}
  ];
  const times = [
    {id:'late',name:'深夜',from:0,to:5,sunX:'50%',sunY:'24%',message:'世界が静まり返るころ。ここでは何も急がなくていい。'},
    {id:'dawn',name:'明け方',from:5,to:7,sunX:'24%',sunY:'58%',message:'夜がほどけて、朝がゆっくり近づいてくる。'},
    {id:'morning',name:'朝',from:7,to:11,sunX:'28%',sunY:'16%',message:'新しい光が窓辺に届く。今日はまだ、始まったばかり。'},
    {id:'day',name:'昼',from:11,to:16,sunX:'68%',sunY:'10%',message:'明るい空の下、ただひと息つく時間。'},
    {id:'evening',name:'夕方',from:16,to:19,sunX:'76%',sunY:'54%',message:'空の色が変わっていくのを、ゆっくり眺めよう。'},
    {id:'night',name:'夜',from:19,to:24,sunX:'70%',sunY:'18%',message:'遠くの明かりを眺めながら、静かな夜を過ごそう。'}
  ];
  let roomWeather=null,roomWeatherLoading=false,roomWeatherAttempted=false,roomWeatherFetchedAt=0,destroyed=false,weatherRequest=null,weatherTimeout=null;
  const weatherLabels=code=>{
    if(code===0)return ['晴れ','☀'];if(code===1)return ['おおむね晴れ','🌤'];if(code===2)return ['晴れ時々くもり','⛅'];if(code===3)return ['くもり','☁'];
    if(code===45||code===48)return ['霧','🌫'];if([51,53,55,56,57].includes(code))return ['霧雨','🌦'];
    if([61,63,65,66,67,80,81,82].includes(code))return ['雨','🌧'];if([71,73,75,77,85,86].includes(code))return ['雪','❄'];
    if([95,96,99].includes(code))return ['雷雨','⛈'];return ['天気','☁'];
  };
  function showWeather(value){$('studyRoomWeather').textContent=value;}
  function applyWeather(){
    if(!roomWeather)return;
    const w=roomWeather,[label,icon]=weatherLabels(w.weather_code),view=$('studyRoomView');
    view.classList.remove('weather-clear','weather-cloudy','weather-fog','weather-rain','weather-snow','weather-storm','weather-night');
    let cls='weather-cloudy';
    if(w.weather_code===0||w.weather_code===1)cls='weather-clear';
    else if(w.weather_code===45||w.weather_code===48)cls='weather-fog';
    else if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(w.weather_code))cls='weather-rain';
    else if([71,73,75,77,85,86].includes(w.weather_code))cls='weather-snow';
    else if([95,96,99].includes(w.weather_code))cls='weather-storm';
    if(w.is_day===0)view.classList.add('weather-night');view.classList.add(cls);
    const high=Number.isFinite(w.high)&&Number.isFinite(w.low)?' · '+Math.round(w.low)+'〜'+Math.round(w.high)+'°':'';
    showWeather(icon+' '+label+' · '+Math.round(w.temperature_2m)+'°C'+high+' · 風 '+Math.round(w.wind_speed_10m)+'km/h');
    if(w.is_day===1&&w.sunrise&&w.sunset){
      const now=new Date(),parts=x=>{const m=x.match(/T(\d{2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;};
      const rise=parts(w.sunrise),set=parts(w.sunset),minutes=now.getHours()*60+now.getMinutes();
      if(rise!==null&&set!==null&&set>rise){const p=Math.max(0,Math.min(1,(minutes-rise)/(set-rise)));view.style.setProperty('--sun-x',(8+p*80)+'%');view.style.setProperty('--sun-y',(60-Math.sin(p*Math.PI)*48)+'%');}
    }
  }
  async function loadWeather(force=false){
    if(roomWeatherLoading||(!force&&roomWeatherAttempted&&Date.now()-roomWeatherFetchedAt<30*60*1000))return;
    roomWeatherAttempted=true;roomWeatherLoading=true;showWeather('名古屋の天気を確認中…');
    weatherRequest=typeof AbortController==='function'?new AbortController():null;
    if(weatherRequest)weatherTimeout=window.setTimeout(()=>weatherRequest?.abort(),10000);
    try{
      const url='https://api.open-meteo.com/v1/forecast?latitude=35.1815&longitude=136.9066&current=temperature_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=1';
      const response=await fetch(url,{cache:'no-store',...(weatherRequest?{signal:weatherRequest.signal}:{})});if(!response.ok)throw new Error('weather');
      const data=await response.json();if(!data.current)throw new Error('weather');
      roomWeather={...data.current,sunrise:data.daily?.sunrise?.[0],sunset:data.daily?.sunset?.[0],high:data.daily?.temperature_2m_max?.[0],low:data.daily?.temperature_2m_min?.[0]};
      roomWeatherFetchedAt=Date.now();if(!destroyed)applyWeather();
    }catch(error){if(!destroyed){showWeather('名古屋の天気を取得できません · タップで再試行');roomWeatherAttempted=false;}}
    finally{if(weatherTimeout!==null)window.clearTimeout(weatherTimeout);weatherTimeout=null;weatherRequest=null;roomWeatherLoading=false;}
  }
  function update(){
    const now=new Date(),month=now.getMonth(),hour=now.getHours();
    const season=seasons.find(s=>s.months.includes(month))||seasons[0];
    const time=times.find(t=>hour>=t.from&&hour<t.to)||times[0];
    const view=$('studyRoomView');
    for(const name of [...view.classList])if(name.startsWith('season-')||name.startsWith('time-'))view.classList.remove(name);
    view.classList.add('season-'+season.id,'time-'+time.id);
    updateSky();
    view.style.setProperty('--sun-x',time.sunX);view.style.setProperty('--sun-y',time.sunY);
    $('studyRoomClock').textContent=now.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false});
    $('studyRoomDate').textContent=now.toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'});
    $('studyRoomSeason').textContent=season.name+' · '+time.name;
    $('studyRoomMessage').textContent=season.message+' '+time.message;
    if(roomWeather)applyWeather();
  }
  const handleWeatherClick=()=>{roomWeatherAttempted=false;loadWeather(true);};
  $('studyRoomWeather').addEventListener('click',handleWeatherClick);
  update();
  const interval=window.setInterval(update,60000);
  return {update,updateSky,loadWeather,onVisible(){if(destroyed)return;update();if(root.body?.classList.contains('study-room-fullscreen'))loadWeather();},destroy(){destroyed=true;window.clearInterval(interval);if(weatherTimeout!==null)window.clearTimeout(weatherTimeout);weatherRequest?.abort();$('studyRoomWeather').removeEventListener('click',handleWeatherClick);}};
}
