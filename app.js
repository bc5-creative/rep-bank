const STORAGE_KEY = "dailyMaintenance.phase1b";
const PUSH_CHALLENGE_DAYS = 28;
const PUSH_ACTIVE_DAYS = 24;
const PUSH_DEFAULT_TOTAL = 1200;
const PUSH_MIN_DAILY = 40;
const PUSH_MAX_DAILY = 120;
const PARKRUN_GOAL = 35;

let recordAmount = 20;
let discSide = "front";

const pad2 = value => String(value).padStart(2, "0");

function dateToKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayKey() {
  return dateToKey(new Date());
}

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysKey(key, days) {
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return dateToKey(date);
}

function niceDate(date) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function defaultState() {
  return {
    view: "today",
    settings: {
      pushStartDate: todayKey(),
      pushChallengeTotal: PUSH_DEFAULT_TOTAL,
      parkRunStartingTotal: 0
    },
    pushups: { challenge: null },
    commitments: {}
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const defaults = defaultState();

  if (!saved) return defaults;

  try {
    const parsed = JSON.parse(saved);
    const loaded = {
      ...defaults,
      ...parsed,
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
      pushups: { ...defaults.pushups, ...(parsed.pushups || {}) },
      commitments: parsed.commitments || {}
    };

    if (migrateState(loaded)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    }

    return loaded;
  } catch {
    return defaults;
  }
}

function migrateState(loaded) {
  let changed = false;

  if (!loaded.pushups || typeof loaded.pushups !== "object") {
    loaded.pushups = { challenge: null };
    changed = true;
  }

  if (!loaded.settings.pushChallengeTotal) {
    loaded.settings.pushChallengeTotal = PUSH_DEFAULT_TOTAL;
    changed = true;
  }

  const challenge = loaded.pushups.challenge;
  if (!challenge || !challenge.days || !challenge.startDate) return changed;

  Object.values(challenge.days).forEach(day => {
    if (!Array.isArray(day.reps)) {
      day.reps = [];
      changed = true;
    }
  });

  const legacyStartKey = addDaysKey(challenge.startDate, -1);
  if (!challenge.days[challenge.startDate] && challenge.days[legacyStartKey]) {
    const shiftedDays = {};

    Object.entries(challenge.days).forEach(([key, day]) => {
      shiftedDays[addDaysKey(key, 1)] = day;
    });

    challenge.days = shiftedDays;
    changed = true;
  }

  return changed;
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getMonday(date = new Date()) {
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = (day + 6) % 7;
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekBounds() {
  const start = getMonday();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { startKey: dateToKey(start), endKey: dateToKey(end) };
}

function shuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hasObviousPattern(numbers) {
  return (
    numbers.every((value, index) => index === 0 || value >= numbers[index - 1]) ||
    numbers.every((value, index) => index === 0 || value <= numbers[index - 1]) ||
    numbers.some((value, index) => index > 0 && value === numbers[index - 1])
  );
}

function clampChallengeTotal(total) {
  const min = PUSH_ACTIVE_DAYS * PUSH_MIN_DAILY;
  const max = PUSH_ACTIVE_DAYS * PUSH_MAX_DAILY;
  return Math.max(min, Math.min(max, total || PUSH_DEFAULT_TOTAL));
}

function makeChallengeTargets(totalTarget) {
  const total = clampChallengeTotal(totalTarget);

  for (let attempt = 0; attempt < 500; attempt++) {
    let remaining = total;
    const targets = [];

    for (let index = 0; index < PUSH_ACTIVE_DAYS; index++) {
      const daysLeft = PUSH_ACTIVE_DAYS - index - 1;
      const min = Math.max(PUSH_MIN_DAILY, remaining - PUSH_MAX_DAILY * daysLeft);
      const max = Math.min(PUSH_MAX_DAILY, remaining - PUSH_MIN_DAILY * daysLeft);
      const value = min + Math.floor(Math.random() * (max - min + 1));
      targets.push(value);
      remaining -= value;
    }

    const shuffled = shuffle(targets);
    if (
      shuffled.reduce((sum, value) => sum + value, 0) === total &&
      shuffled.every(value => value >= PUSH_MIN_DAILY && value <= PUSH_MAX_DAILY) &&
      !hasObviousPattern(shuffled)
    ) {
      return shuffled;
    }
  }

  const targets = Array(PUSH_ACTIVE_DAYS).fill(PUSH_MIN_DAILY);
  let extra = total - PUSH_ACTIVE_DAYS * PUSH_MIN_DAILY;

  while (extra > 0) {
    const available = targets
      .map((value, index) => ({ value, index }))
      .filter(item => item.value < PUSH_MAX_DAILY);
    const picked = available[Math.floor(Math.random() * available.length)];
    const add = Math.min(extra, PUSH_MAX_DAILY - targets[picked.index], 1 + Math.floor(Math.random() * 8));
    targets[picked.index] += add;
    extra -= add;
  }

  return shuffle(targets);
}

function generatePushupChallenge(startDate, totalTarget = PUSH_DEFAULT_TOTAL) {
  const days = {};
  const current = parseDate(startDate);
  const total = clampChallengeTotal(totalTarget);
  const targets = makeChallengeTargets(total);
  let activeIndex = 0;

  for (let dayIndex = 0; dayIndex < PUSH_CHALLENGE_DAYS; dayIndex++) {
    const key = dateToKey(current);
    const rest = dayIndex % 7 === 6;
    days[key] = {
      week: Math.floor(dayIndex / 7) + 1,
      day: dayIndex + 1,
      target: rest ? 0 : targets[activeIndex],
      rest,
      reps: []
    };
    if (!rest) activeIndex += 1;
    current.setDate(current.getDate() + 1);
  }

  return {
    startDate,
    daysCount: PUSH_CHALLENGE_DAYS,
    activeDays: PUSH_ACTIVE_DAYS,
    totalTarget: total,
    minDaily: PUSH_MIN_DAILY,
    maxDaily: PUSH_MAX_DAILY,
    days
  };
}

function ensurePushupChallenge() {
  if (!state.pushups.challenge) {
    state.pushups.challenge = generatePushupChallenge(
      state.settings.pushStartDate || todayKey(),
      state.settings.pushChallengeTotal || PUSH_DEFAULT_TOTAL
    );
    saveState();
  }
}

function getPushDay() {
  ensurePushupChallenge();
  return state.pushups.challenge.days[todayKey()] || null;
}

function getCompletedPushups(day) {
  return day ? day.reps.reduce((sum, rep) => sum + rep.amount, 0) : 0;
}

function openRecordSheet() {
  document.getElementById("recordSheet").classList.remove("hide");
  renderRecordAmount();
}

function closeRecordSheet() {
  document.getElementById("recordSheet").classList.add("hide");
}

function renderRecordAmount() {
  document.getElementById("recordAmount").textContent = recordAmount;
}

function setRecordAmount(amount) {
  recordAmount = Math.max(1, amount);
  renderRecordAmount();
}

function adjustRecord(change) {
  recordAmount = Math.max(1, recordAmount + change);
  renderRecordAmount();
}

function recordPushups() {
  const day = getPushDay();
  if (!day || day.rest) return;

  day.reps.push({
    amount: recordAmount,
    time: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
  });

  saveState();
  closeRecordSheet();
  render();
}

function toggleDisc() {
  discSide = discSide === "front" ? "back" : "front";
  renderDiscSide();
}

function renderDiscSide() {
  document.getElementById("discFront").classList.toggle("hide", discSide !== "front");
  document.getElementById("discBack").classList.toggle("hide", discSide !== "back");
}

function commitmentKey(type, date = todayKey()) {
  return `${type}:${date}`;
}

function isDone(type, date = todayKey()) {
  return !!state.commitments[commitmentKey(type, date)];
}

function toggleCommitment(type) {
  const key = commitmentKey(type);
  if (state.commitments[key]) {
    delete state.commitments[key];
  } else {
    state.commitments[key] = { done: true, recordedAt: new Date().toISOString() };
  }
  saveState();
  render();
}

function countCommitments(type, startKey, endKey) {
  return Object.keys(state.commitments).filter(key => {
    const date = key.split(":")[1];
    return key.startsWith(`${type}:`) && date >= startKey && date <= endKey;
  }).length;
}

function countThisWeek(type) {
  const { startKey, endKey } = weekBounds();
  return countCommitments(type, startKey, endKey);
}

function countParkRunsThisYear() {
  const year = new Date().getFullYear();
  const logged = Object.keys(state.commitments).filter(key => {
    return key.startsWith("parkrun:") && key.includes(`:${year}-`);
  }).length;
  return (parseInt(state.settings.parkRunStartingTotal, 10) || 0) + logged;
}

function getPushupTotal() {
  ensurePushupChallenge();
  return Object.values(state.pushups.challenge.days).reduce((sum, day) => {
    return sum + getCompletedPushups(day);
  }, 0);
}

function getPushupTargetTotal() {
  ensurePushupChallenge();
  if (state.pushups.challenge.totalTarget) {
    return state.pushups.challenge.totalTarget;
  }
  return Object.values(state.pushups.challenge.days).reduce((sum, day) => sum + (day.target || 0), 0);
}

function getChallengeRemaining() {
  return Math.max(0, getPushupTargetTotal() - getPushupTotal());
}

function getPushupWeekTotal() {
  const day = getPushDay();
  if (!day) return 0;

  return Object.values(state.pushups.challenge.days)
    .filter(candidate => candidate.week === day.week)
    .reduce((sum, candidate) => sum + getCompletedPushups(candidate), 0);
}

function commitmentItemsForToday() {
  const dayOfWeek = new Date().getDay();
  const items = [
    { type: "fasting", title: "Fast", detail: `${countThisWeek("fasting")} recorded this week.` },
    { type: "dry", title: "Dry Day", detail: `${countThisWeek("dry")} recorded this week.` },
    { type: "dessert", title: "Dessert-free day", detail: `${countThisWeek("dessert")} recorded this week.` },
    { type: "social", title: "Social-media-free day", detail: `${countThisWeek("social")} recorded this week.` }
  ];

  if (dayOfWeek === 6) {
    items.unshift({
      type: "parkrun",
      title: "ParkRun",
      detail: `${countParkRunsThisYear()} of ${PARKRUN_GOAL} runs recorded this year.`
    });
  }

  return items;
}

function setView(view) {
  state.view = view;
  saveState();
  render();
}

function saveSettings() {
  const nextStartDate = document.getElementById("pushStartDate").value || todayKey();
  const nextTotal = clampChallengeTotal(parseInt(document.getElementById("pushChallengeTotal").value, 10));
  const nextParkRuns = parseInt(document.getElementById("parkRunStartingTotal").value, 10) || 0;
  const challenge = state.pushups.challenge;
  const challengeSettingsChanged =
    challenge &&
    (challenge.startDate !== nextStartDate ||
      challenge.totalTarget !== nextTotal ||
      challenge.daysCount !== PUSH_CHALLENGE_DAYS);

  state.settings.parkRunStartingTotal = nextParkRuns;

  if (challengeSettingsChanged) {
    if (!confirm("Changing the challenge start date or total will generate a new push-up plan. Existing push-up records in the current plan will be cleared. Continue?")) {
      document.getElementById("pushStartDate").value = state.settings.pushStartDate || todayKey();
      document.getElementById("pushChallengeTotal").value =
        state.settings.pushChallengeTotal || getPushupTargetTotal();
      saveState();
      render();
      return;
    }

    state.settings.pushStartDate = nextStartDate;
    state.settings.pushChallengeTotal = nextTotal;
    state.pushups.challenge = generatePushupChallenge(nextStartDate, nextTotal);
    saveState();
    render();
    return;
  }

  state.settings.pushStartDate = nextStartDate;
  state.settings.pushChallengeTotal = nextTotal;
  saveState();
  render();
}

function regeneratePushupChallenge() {
  if (confirm("Regenerate the push-up plan? Existing push-up records will be cleared.")) {
    state.pushups.challenge = generatePushupChallenge(
      state.settings.pushStartDate || todayKey(),
      state.settings.pushChallengeTotal || PUSH_DEFAULT_TOTAL
    );
    saveState();
    render();
  }
}

function resetAll() {
  if (confirm("Reset all app data? This cannot be undone.")) {
    state = defaultState();
    saveState();
    render();
  }
}

function show(id, visible) {
  document.getElementById(id).classList.toggle("hide", !visible);
}

function renderNav() {
  ["today", "review", "settings"].forEach(view => {
    const id = `nav${view[0].toUpperCase()}${view.slice(1)}`;
    document.getElementById(id).classList.toggle("active", state.view === view);
  });

  show("todayView", state.view === "today");
  show("reviewView", state.view === "review");
  show("settingsView", state.view === "settings");
}

function renderSegments(percent) {
  document.querySelectorAll("#pushSegments .segfill").forEach((fill, index) => {
    const start = 25 * index;
    const local = Math.max(0, Math.min(25, percent - start));
    fill.style.width = `${(local / 25) * 100}%`;
  });
}

function renderEmptyPushups() {
  document.getElementById("briefLabel").textContent = "Today’s brief";
  document.getElementById("pushTarget").textContent = "-";
  document.getElementById("pushDone").textContent = "0";
  document.getElementById("pushRemaining").textContent = getChallengeRemaining();
  document.getElementById("pushRecorded").classList.add("hide");
  renderSegments(0);

  document.getElementById("pushHistory").innerHTML =
    '<div class="entry"><span>No target scheduled today</span><span>-</span></div>';
  document.getElementById("discBackList").innerHTML = "<div>-</div>";
  document.getElementById("discBackTotal").textContent = "0";
}

function renderPushups() {
  const day = getPushDay();
  if (!day) {
    renderEmptyPushups();
    return;
  }

  document.getElementById("briefLabel").textContent = day.rest
    ? "Administrative leave"
    : `Today’s brief · Week ${day.week}`;

  if (day.rest) {
    document.getElementById("pushTarget").textContent = "0";
    document.getElementById("pushDone").textContent = "0";
    document.getElementById("pushRemaining").textContent = getChallengeRemaining();
    document.getElementById("pushRecorded").classList.add("hide");
    renderSegments(0);
    return;
  }

  const completed = getCompletedPushups(day);
  const remaining = Math.max(0, day.target - completed);
  const percent = Math.min(100, (completed / day.target) * 100);

  document.getElementById("pushTarget").textContent = remaining;
  document.getElementById("pushDone").textContent = completed;
  document.getElementById("pushRemaining").textContent = getChallengeRemaining();
  renderSegments(percent);
  document.getElementById("pushRecorded").classList.toggle("hide", completed < day.target);

  const history = document.getElementById("pushHistory");
  history.innerHTML = "";

  if (day.reps.length === 0) {
    history.innerHTML = '<div class="entry"><span>No sets recorded yet</span><span>-</span></div>';
  } else {
    [...day.reps].reverse().forEach(rep => {
      const row = document.createElement("div");
      row.className = "entry";
      row.innerHTML = `<span>${rep.time}</span><span>+${rep.amount}</span>`;
      history.appendChild(row);
    });
  }

  const back = document.getElementById("discBackList");
  back.innerHTML = "";

  if (day.reps.length === 0) {
    back.innerHTML = "<div>-</div>";
  } else {
    day.reps.forEach(rep => {
      const div = document.createElement("div");
      div.textContent = rep.amount;
      back.appendChild(div);
    });
  }

  document.getElementById("discBackTotal").textContent = completed;
}

function renderCommitments() {
  const list = document.getElementById("commitmentsList");
  list.innerHTML = "";

  commitmentItemsForToday().forEach(item => {
    const done = isDone(item.type);
    const row = document.createElement("div");
    row.className = "commitment";
    row.innerHTML = `<div><h3>${item.title}</h3><p>${done ? "Recorded." : item.detail}</p></div><button class="tick ${done ? "done" : ""}" onclick="toggleCommitment('${item.type}')">${done ? "✓" : ""}</button>`;
    list.appendChild(row);
  });
}

function renderReview() {
  const parkRuns = countParkRunsThisYear();
  document.getElementById("weekPushTotal").textContent = getPushupWeekTotal();
  document.getElementById("allPushTotal").textContent = getPushupTotal();
  document.getElementById("parkRunTotal").textContent = parkRuns;
  document.getElementById("parkRunRemain").textContent = Math.max(0, PARKRUN_GOAL - parkRuns);
  document.getElementById("dryWeek").textContent = countThisWeek("dry");
  document.getElementById("dessertWeek").textContent = countThisWeek("dessert");
  document.getElementById("fastWeek").textContent = countThisWeek("fasting");
  document.getElementById("socialWeek").textContent = countThisWeek("social");
}

function renderSettings() {
  document.getElementById("pushStartDate").value = state.settings.pushStartDate || todayKey();
  document.getElementById("pushChallengeTotal").value =
    state.settings.pushChallengeTotal || getPushupTargetTotal();
  document.getElementById("parkRunStartingTotal").value = state.settings.parkRunStartingTotal || 0;
}

function render() {
  ensurePushupChallenge();
  document.getElementById("dateText").textContent = niceDate(new Date());
  renderNav();
  renderPushups();
  renderDiscSide();
  renderCommitments();
  renderReview();
  renderSettings();
}

document.addEventListener("DOMContentLoaded", render);
