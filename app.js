const STORAGE_KEY = "dailyMaintenance.phase1b";
const PUSH_WEEKLY_TOTAL = 450;
const PUSH_WEEKS = 8;
const PARKRUN_GOAL = 35;

const todayKey = () => new Date().toISOString().slice(0,10);
const parseDate = key => new Date(key + "T00:00:00");
const dateToKey = date => date.toISOString().slice(0,10);
const niceDate = date => new Intl.DateTimeFormat("en-AU",{weekday:"long",day:"numeric",month:"long"}).format(date);

function tomorrowKey(){
  const d=new Date();
  d.setDate(d.getDate()+1);
  return dateToKey(d);
}

function defaultState(){
  return {
    view:"today",
    settings:{pushStartDate:tomorrowKey(),parkRunStartingTotal:0},
    pushups:{challenge:null},
    commitments:{}
  };
}

let state=loadState();

function loadState(){
  const saved=localStorage.getItem(STORAGE_KEY);
  if(!saved) return defaultState();
  try { return {...defaultState(),...JSON.parse(saved)}; }
  catch { return defaultState(); }
}

function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}

function getMonday(date=new Date()){
  const d=new Date(date);
  const day=d.getDay();
  const diff=(day+6)%7;
  d.setDate(d.getDate()-diff);
  d.setHours(0,0,0,0);
  return d;
}

function weekBounds(){
  const start=getMonday();
  const end=new Date(start);
  end.setDate(end.getDate()+6);
  return {startKey:dateToKey(start),endKey:dateToKey(end)};
}

function shuffle(a){
  const arr=[...a];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function hasObviousPattern(nums){
  const asc=nums.every((n,i)=>i===0||n>=nums[i-1]);
  const desc=nums.every((n,i)=>i===0||n<=nums[i-1]);
  const rep=nums.some((n,i)=>i>0&&n===nums[i-1]);
  return asc||desc||rep;
}

function makeCuratedPushupWeek(){
  for(let attempt=0;attempt<500;attempt++){
    const easy=50+Math.floor(Math.random()*11);
    const big=92+Math.floor(Math.random()*9);
    let remaining=PUSH_WEEKLY_TOTAL-easy-big;
    const mids=[];
    for(let i=0;i<3;i++){
      const minRemaining=(3-i)*62;
      const maxForThis=Math.min(88,remaining-minRemaining);
      const minForThis=Math.max(62,remaining-(3-i)*88);
      const value=minForThis+Math.floor(Math.random()*(maxForThis-minForThis+1));
      mids.push(value);
      remaining-=value;
    }
    mids.push(remaining);
    const nums=shuffle([easy,big,...mids]);
    if(nums.reduce((a,b)=>a+b,0)===PUSH_WEEKLY_TOTAL && nums.every(n=>n>=50&&n<=100) && !hasObviousPattern(nums)) return nums;
  }
  return shuffle([55,96,72,84,63,80]);
}

function generatePushupChallenge(startDate){
  const days={};
  let current=parseDate(startDate);
  for(let week=1;week<=PUSH_WEEKS;week++){
    const targets=makeCuratedPushupWeek();
    for(let day=0;day<7;day++){
      const key=dateToKey(current);
      days[key]={week,target:day===6?0:targets[day],rest:day===6,reps:[]};
      current.setDate(current.getDate()+1);
    }
  }
  return {startDate,weeks:PUSH_WEEKS,weeklyTotal:PUSH_WEEKLY_TOTAL,days};
}

function ensurePushupChallenge(){
  if(!state.pushups.challenge){
    state.pushups.challenge=generatePushupChallenge(state.settings.pushStartDate||tomorrowKey());
    saveState();
  }
}

function getPushDay(){
  ensurePushupChallenge();
  return state.pushups.challenge.days[todayKey()]||null;
}

function getCompletedPushups(day){
  return day ? day.reps.reduce((sum,rep)=>sum+rep.amount,0) : 0;
}

function addPushups(amount){
  const day=getPushDay();
  if(!day||day.rest) return;
  day.reps.push({amount,time:new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})});
  saveState();
  render();
}

function addCustomPushups(){
  const input=document.getElementById("customPushups");
  const amount=parseInt(input.value,10);
  if(!Number.isFinite(amount)||amount<=0) return;
  addPushups(amount);
  input.value="";
}

function undoPushups(){
  const day=getPushDay();
  if(!day) return;
  day.reps.pop();
  saveState();
  render();
}

function resetPushups(){
  const day=getPushDay();
  if(!day||!confirm("Reset today’s push-ups?")) return;
  day.reps=[];
  saveState();
  render();
}

function commitmentKey(type,dateKey=todayKey()){return `${type}:${dateKey}`;}
function isDone(type,dateKey=todayKey()){return !!state.commitments[commitmentKey(type,dateKey)];}

function toggleCommitment(type){
  const key=commitmentKey(type);
  if(state.commitments[key]) delete state.commitments[key];
  else state.commitments[key]={done:true,recordedAt:new Date().toISOString()};
  saveState();
  render();
}

function countCommitments(type,startKey,endKey){
  return Object.keys(state.commitments).filter(key=>{
    if(!key.startsWith(type+":")) return false;
    const date=key.split(":")[1];
    return date>=startKey && date<=endKey;
  }).length;
}

function countThisWeek(type){
  const {startKey,endKey}=weekBounds();
  return countCommitments(type,startKey,endKey);
}

function countParkRunsThisYear(){
  const y=new Date().getFullYear();
  const logged=Object.keys(state.commitments).filter(key=>key.startsWith("parkrun:")&&key.includes(`:${y}-`)).length;
  return (parseInt(state.settings.parkRunStartingTotal,10)||0)+logged;
}

function getPushupTotal(){
  ensurePushupChallenge();
  return Object.values(state.pushups.challenge.days).reduce((sum,day)=>sum+getCompletedPushups(day),0);
}

function getPushupWeekTotal(){
  const day=getPushDay();
  if(!day) return 0;
  return Object.values(state.pushups.challenge.days).filter(d=>d.week===day.week).reduce((sum,d)=>sum+getCompletedPushups(d),0);
}

function commitmentItemsForToday(){
  const dow=new Date().getDay();
  const items=[
    {type:"dry",title:"Dry Day",detail:`${countThisWeek("dry")} recorded this week.`},
    {type:"social",title:"Social-media-free day",detail:`${countThisWeek("social")} recorded this week.`}
  ];

  if(dow===2||dow===4){
    items.splice(1,0,{type:"fasting",title:"Fast",detail:`${countThisWeek("fasting")} of 2 recorded this week.`});
  }

  if(dow===6){
    items.unshift({type:"parkrun",title:"ParkRun",detail:`${countParkRunsThisYear()} of ${PARKRUN_GOAL} runs recorded this year.`});
  }

  return items;
}

function setView(view){
  state.view=view;
  saveState();
  render();
}

function saveSettings(){
  state.settings.pushStartDate=document.getElementById("pushStartDate").value||tomorrowKey();
  state.settings.parkRunStartingTotal=parseInt(document.getElementById("parkRunStartingTotal").value,10)||0;
  saveState();
  render();
}

function regeneratePushupChallenge(){
  if(!confirm("Regenerate the push-up plan? Existing push-up records will be cleared.")) return;
  state.pushups.challenge=generatePushupChallenge(state.settings.pushStartDate||tomorrowKey());
  saveState();
  render();
}

function resetAll(){
  if(!confirm("Reset all app data? This cannot be undone.")) return;
  state=defaultState();
  saveState();
  render();
}

function show(id,v){document.getElementById(id).classList.toggle("hide",!v);}

function renderTabs(){
  ["today","review","settings"].forEach(view=>{
    document.getElementById("tab"+view[0].toUpperCase()+view.slice(1)).classList.toggle("active",state.view===view);
  });
  show("todayView",state.view==="today");
  show("reviewView",state.view==="review");
  show("settingsView",state.view==="settings");
}

function renderSegments(percent){
  const fills=document.querySelectorAll("#pushSegments .segfill");
  fills.forEach((fill,index)=>{
    const start=index*25;
    const local=Math.max(0,Math.min(25,percent-start));
    fill.style.width=(local/25*100)+"%";
  });
}

function renderPushups(){
  const day=getPushDay();
  const active=document.getElementById("pushActive");
  const rest=document.getElementById("pushRest");
  active.classList.add("hide");
  rest.classList.add("hide");

  if(!day){
    rest.classList.remove("hide");
    document.getElementById("pushLabel").textContent="Today's Brief";
    return;
  }

  document.getElementById("pushLabel").textContent=`Today's Brief · Week ${day.week} of ${PUSH_WEEKS}`;

  if(day.rest){
    rest.classList.remove("hide");
    return;
  }

  active.classList.remove("hide");
  const completed=getCompletedPushups(day);
  const remaining=Math.max(0,day.target-completed);
  const percent=Math.min(100,(completed/day.target)*100);

  document.getElementById("pushTarget").textContent=day.target;
  document.getElementById("pushDone").textContent=completed;
  document.getElementById("pushRemaining").textContent=remaining;
  renderSegments(percent);
  document.getElementById("pushRecorded").classList.toggle("hide",completed<day.target);

  const h=document.getElementById("pushHistory");
  h.innerHTML="";
  if(day.reps.length===0){
    h.innerHTML='<div class="entry"><span>No sets recorded yet</span><span>—</span></div>';
  } else {
    [...day.reps].reverse().forEach(rep=>{
      const row=document.createElement("div");
      row.className="entry";
      row.innerHTML=`<span>${rep.time}</span><span>+${rep.amount}</span>`;
      h.appendChild(row);
    });
  }
}

function renderCommitments(){
  const list=document.getElementById("commitmentsList");
  list.innerHTML="";
  commitmentItemsForToday().forEach(item=>{
    const done=isDone(item.type);
    const row=document.createElement("div");
    row.className="commitment";
    row.innerHTML=`<div><h3>${item.title}</h3><p>${done?"Recorded.":item.detail}</p></div><button class="tick ${done?"done":""}" onclick="toggleCommitment('${item.type}')">${done?"✓":""}</button>`;
    list.appendChild(row);
  });
}

function renderReview(){
  const pr=countParkRunsThisYear();
  document.getElementById("weekPushTotal").textContent=getPushupWeekTotal();
  document.getElementById("allPushTotal").textContent=getPushupTotal();
  document.getElementById("parkRunTotal").textContent=pr;
  document.getElementById("parkRunRemain").textContent=Math.max(0,PARKRUN_GOAL-pr);
  document.getElementById("dryWeek").textContent=countThisWeek("dry");
  document.getElementById("fastWeek").textContent=countThisWeek("fasting");
  document.getElementById("socialWeek").textContent=countThisWeek("social");
  document.getElementById("commitmentWeek").textContent=countThisWeek("dry")+countThisWeek("fasting")+countThisWeek("social")+countThisWeek("parkrun");
}

function renderSettings(){
  document.getElementById("pushStartDate").value=state.settings.pushStartDate||tomorrowKey();
  document.getElementById("parkRunStartingTotal").value=state.settings.parkRunStartingTotal||0;
}

function render(){
  ensurePushupChallenge();
  document.getElementById("dateText").textContent=niceDate(new Date());
  renderTabs();
  renderPushups();
  renderCommitments();
  renderReview();
  renderSettings();
}

document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("customPushups").addEventListener("keydown",e=>{
    if(e.key==="Enter") addCustomPushups();
  });
  render();
});
