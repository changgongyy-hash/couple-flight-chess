/**
 * 情侣飞行棋 · 同机双人
 * Pass-and-play · per-player theme packs · custom cards · local only
 * Win: first to cell 36 (index 35); overshoot / forward2 finish allowed
 */
(function () {
  "use strict";

  const TOTAL_CELLS = 36;
  const MAX_SKIPS = 3;
  const STORAGE_KEY = "couple-flight-chess-v2";
  const CUSTOM_KEY = "couple-flight-chess-custom-v1";

  const PACKS = {
    1: {
      key: "light",
      name: "甜蜜日常",
      short: "甜蜜",
      sub: "接吻、按摩、对视、轻触。不含明确性器官刺激。",
    },
    2: {
      key: "medium",
      name: "暧昧升温",
      short: "暧昧",
      sub: "爱抚、边缘控制、口交暗示与轻道具；仍可降级。",
    },
    3: {
      key: "heavy",
      name: "干柴烈火",
      short: "干柴",
      sub: "口交、插入、体位、玩具；仍受暂停约束，可降级。",
    },
  };

  const PATH_ORDER = buildSnakePath(6);

  const SPECIALS = {
    4: { kind: "move", label: "进2", effect: "forward2" },
    9: { kind: "move", label: "休息", effect: "rest" },
    13: { kind: "move", label: "退2", effect: "back2" },
    17: { kind: "move", label: "再掷", effect: "reroll" },
    22: { kind: "move", label: "进2", effect: "forward2" },
    27: { kind: "move", label: "休息", effect: "rest" },
    31: { kind: "move", label: "退2", effect: "back2" },
  };

  const state = {
    tasks: { light: [], medium: [], heavy: [], finale: [] },
    packs: [2, 2],
    disabledTags: new Set(),
    names: ["我", "TA"],
    positions: [0, 0],
    skips: [MAX_SKIPS, MAX_SKIPS],
    turn: 0,
    paused: false,
    rolling: false,
    currentCard: null,
    cardDowngraded: false,
    timerId: null,
    timerRemain: 0,
    timerTotal: 0,
    decks: [[], []],
    deckIdx: [0, 0],
    customCards: [],
    winner: null,
    finaleCard: null,
    pendingExtraTurn: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function buildSnakePath(n) {
    const pathToVisual = [];
    let path = 0;
    for (let row = 0; row < n; row++) {
      if (row % 2 === 0) {
        for (let col = 0; col < n; col++) {
          pathToVisual[path++] = row * n + col;
        }
      } else {
        for (let col = n - 1; col >= 0; col--) {
          pathToVisual[path++] = row * n + col;
        }
      }
    }
    return pathToVisual;
  }

  function packMeta(level) {
    return PACKS[level] || PACKS[1];
  }

  function packShort(level) {
    return packMeta(level).short;
  }

  function packName(level) {
    return packMeta(level).name;
  }

  function showScreen(id) {
    $$(".screen").forEach((el) => el.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
  }

  function toast(msg) {
    const t = $("#move-toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1600);
  }

  function curName() {
    return state.names[state.turn] || (state.turn === 0 ? "我" : "TA");
  }

  function otherName() {
    const o = 1 - state.turn;
    return state.names[o] || (o === 0 ? "我" : "TA");
  }

  function whoLabel(who) {
    if (who === "self") return curName() + " 做";
    if (who === "partner") return otherName() + " 做给 " + curName();
    if (who === "both") return "一起";
    return "执行";
  }

  function whoTitle(who) {
    if (who === "self") return "你做（落子方）";
    if (who === "partner") return "TA 做（对方执行）";
    if (who === "both") return "一起";
    return "任务";
  }

  function loadCustomCards() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) {
        state.customCards = [];
        return;
      }
      const data = JSON.parse(raw);
      state.customCards = Array.isArray(data) ? data.filter(isValidCustom) : [];
    } catch (_) {
      state.customCards = [];
    }
  }

  function saveCustomCards() {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.customCards));
    } catch (_) {}
  }

  function isValidCustom(c) {
    return (
      c &&
      typeof c.text === "string" &&
      c.text.trim().length > 0 &&
      [1, 2, 3].includes(Number(c.level)) &&
      ["self", "partner", "both"].includes(c.who || "both")
    );
  }

  function renderCustomList() {
    const list = $("#custom-list");
    if (!list) return;
    list.innerHTML = "";
    if (!state.customCards.length) {
      const empty = document.createElement("li");
      empty.className = "custom-empty";
      empty.textContent = "还没有自定义牌";
      list.appendChild(empty);
      return;
    }
    state.customCards.forEach((card) => {
      const li = document.createElement("li");
      li.className = "custom-item";
      const meta = document.createElement("div");
      meta.className = "custom-item-meta";
      const badge = document.createElement("span");
      badge.className =
        "badge " +
        (card.level === 1
          ? "badge-level1"
          : card.level === 2
            ? "badge-level2"
            : "badge-level3");
      badge.textContent = packShort(card.level);
      meta.appendChild(badge);
      const who = document.createElement("span");
      who.className = "custom-who";
      who.textContent =
        card.who === "self"
          ? "落子方"
          : card.who === "partner"
            ? "对方做"
            : "一起";
      meta.appendChild(who);
      const text = document.createElement("p");
      text.className = "custom-item-text";
      text.textContent = card.text;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "custom-del";
      del.setAttribute("aria-label", "删除");
      del.textContent = "删除";
      del.addEventListener("click", () => {
        state.customCards = state.customCards.filter((c) => c.id !== card.id);
        saveCustomCards();
        renderCustomList();
        toast("已删除自定义牌");
      });
      li.appendChild(meta);
      li.appendChild(text);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function addCustomCard() {
    const textEl = $("#custom-text");
    const levelEl = $("#custom-level");
    const whoEl = $("#custom-who");
    const text = (textEl.value || "").trim();
    if (!text) {
      toast("请先写任务文案");
      return;
    }
    const level = Number(levelEl.value) || 2;
    const who = whoEl.value || "both";
    const card = {
      id: "C" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      level: level,
      type: "自定义",
      who: who,
      duration_sec: 0,
      tags: [],
      text: text.slice(0, 280),
      fallback: null,
      custom: true,
    };
    state.customCards.push(card);
    saveCustomCards();
    textEl.value = "";
    renderCustomList();
    toast("已添加 · " + packShort(level));
  }

  function exportCustomCards() {
    const blob = new Blob([JSON.stringify(state.customCards, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "couple-flight-custom-cards.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("已导出 JSON");
  }

  function importCustomCards(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data.cards)
            ? data.cards
            : null;
        if (!arr) throw new Error("bad format");
        let added = 0;
        arr.forEach((raw) => {
          if (!isValidCustom(raw)) return;
          const card = {
            id:
              raw.id && String(raw.id).startsWith("C")
                ? raw.id
                : "C" +
                  Date.now().toString(36) +
                  Math.random().toString(36).slice(2, 6),
            level: Number(raw.level),
            type: raw.type || "自定义",
            who: raw.who || "both",
            duration_sec: Number(raw.duration_sec) || 0,
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            text: String(raw.text).trim().slice(0, 280),
            fallback: raw.fallback || null,
            custom: true,
          };
          if (state.customCards.some((c) => c.id === card.id || c.text === card.text)) {
            return;
          }
          state.customCards.push(card);
          added++;
        });
        saveCustomCards();
        renderCustomList();
        toast(added ? "已导入 " + added + " 张" : "没有新牌可导入");
      } catch (_) {
        toast("导入失败：JSON 格式不对");
      }
    };
    reader.readAsText(file);
  }

  async function loadTasks() {
    if (window.SOLO_TASKS && window.SOLO_TASKS.light) {
      state.tasks.light = window.SOLO_TASKS.light || [];
      state.tasks.medium = window.SOLO_TASKS.medium || [];
      state.tasks.heavy = window.SOLO_TASKS.heavy || [];
      state.tasks.finale = window.SOLO_TASKS.finale || [];
      return;
    }
    try {
      const res = await fetch("tasks.json");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      state.tasks.light = data.light || [];
      state.tasks.medium = data.medium || [];
      state.tasks.heavy = data.heavy || [];
      state.tasks.finale = data.finale || [];
    } catch (e) {
      console.warn("tasks load failed", e);
      state.tasks.light = [
        {
          id: "F01",
          level: 1,
          type: "亲密",
          who: "both",
          duration_sec: 30,
          tags: [],
          text: "牵手三十秒。任务未加载时的备用牌。",
          fallback: null,
        },
      ];
      state.tasks.medium = state.tasks.light;
      state.tasks.heavy = [];
      state.tasks.finale = [];
    }
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function passesDisabledTags(c) {
    if (!c.tags || !c.tags.length) return true;
    return !c.tags.some((t) => state.disabledTags.has(t));
  }

  function poolForPack(packLevel) {
    let pool = state.tasks.light.slice();
    if (packLevel >= 2) pool = pool.concat(state.tasks.medium);
    if (packLevel >= 3) pool = pool.concat(state.tasks.heavy || []);

    const customs = state.customCards.filter(
      (c) => Number(c.level) <= packLevel && passesDisabledTags(c)
    );
    pool = pool.concat(customs);

    pool = pool.filter((c) => {
      if ((c.level || 1) > packLevel) return false;
      return passesDisabledTags(c);
    });

    if (pool.length < 5) {
      pool = state.tasks.light.filter(passesDisabledTags);
    }
    if (pool.length === 0) pool = state.tasks.light.slice();
    return pool;
  }

  function buildDecks() {
    state.decks = [
      shuffle(poolForPack(state.packs[0])),
      shuffle(poolForPack(state.packs[1])),
    ];
    state.deckIdx = [0, 0];
  }

  function drawCard() {
    const p = state.turn;
    if (!state.decks[p] || !state.decks[p].length) {
      state.decks[p] = shuffle(poolForPack(state.packs[p]));
      state.deckIdx[p] = 0;
    }
    if (state.deckIdx[p] >= state.decks[p].length) {
      state.decks[p] = shuffle(state.decks[p]);
      state.deckIdx[p] = 0;
    }
    let card = state.decks[p][state.deckIdx[p]++];
    if (
      state.currentCard &&
      card.id === state.currentCard.id &&
      state.decks[p].length > 1
    ) {
      card = state.decks[p][state.deckIdx[p] % state.decks[p].length];
      state.deckIdx[p]++;
    }
    return Object.assign({ who: "both" }, card);
  }

  function pickFinale() {
    const maxLevel = state.packs[state.winner] || 1;
    let pool = (state.tasks.finale || []).filter((c) => c.level <= maxLevel);
    if (!pool.length) {
      pool = [
        {
          id: "FX",
          level: 1,
          type: "终局",
          who: "partner",
          duration_sec: 60,
          tags: [],
          text:
            "赢家 " +
            state.names[state.winner] +
            " 指定：让对方为你做一件开局尺度内的亲密小事，六十秒内完成。",
          fallback: null,
        },
      ];
    }
    return Object.assign({}, pool[Math.floor(Math.random() * pool.length)]);
  }

  function renderBoard() {
    const board = $("#board");
    board.innerHTML = "";
    const visualCells = new Array(TOTAL_CELLS);
    const posA = state.positions[0];
    const posB = state.positions[1];

    for (let pathIdx = 0; pathIdx < TOTAL_CELLS; pathIdx++) {
      const visualIdx = PATH_ORDER[pathIdx];
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.path = String(pathIdx);

      let label = "";
      if (pathIdx === 0) {
        cell.classList.add("start");
        label = "起";
      } else if (pathIdx === TOTAL_CELLS - 1) {
        cell.classList.add("end");
        label = "终";
      } else if (SPECIALS[pathIdx]) {
        cell.classList.add("move");
        label = SPECIALS[pathIdx].label;
      } else {
        cell.classList.add("task");
        label = String(pathIdx);
      }

      const lab = document.createElement("span");
      lab.className = "label";
      lab.textContent = label;
      cell.appendChild(lab);

      const onA = pathIdx === posA;
      const onB = pathIdx === posB;
      if (onA || onB) {
        cell.classList.add("current");
        const wrap = document.createElement("span");
        wrap.className = "token-wrap";
        if (onA) {
          const t = document.createElement("span");
          t.className = "token token-a";
          t.title = state.names[0];
          wrap.appendChild(t);
        }
        if (onB) {
          const t = document.createElement("span");
          t.className = "token token-b";
          t.title = state.names[1];
          wrap.appendChild(t);
        }
        cell.appendChild(wrap);
      }

      visualCells[visualIdx] = cell;
    }

    visualCells.forEach((c) => board.appendChild(c));
    $("#pos-a").textContent = String(posA);
    $("#pos-b").textContent = String(posB);
    $("#skip-label").textContent = String(state.skips[state.turn]);
    $("#level-pill").textContent = packShort(state.packs[state.turn]);
    updateTurnUI();
  }

  function stepsToFinish(playerIdx) {
    return TOTAL_CELLS - 1 - state.positions[playerIdx];
  }

  function updateTurnUI() {
    const name = curName();
    $("#turn-pill").innerHTML = "轮到 <strong>" + escapeHtml(name) + "</strong>";
    const need = stepsToFinish(state.turn);
    let hint =
      "轮到 " +
      name +
      " · " +
      packName(state.packs[state.turn]) +
      " · 先到终点获胜";
    if (need > 0 && need <= 6) {
      hint = "轮到 " + name + " · 还差 " + need + " 格冲线";
    }
    $("#dice-hint").textContent = hint;
    $("#chip-a").classList.toggle("active-turn", state.turn === 0);
    $("#chip-b").classList.toggle("active-turn", state.turn === 1);
    $("#chip-name-a").textContent = state.names[0];
    $("#chip-name-b").textContent = state.names[1];
    $("#level-pill").textContent = packShort(state.packs[state.turn]);
    $("#skip-label").textContent = String(state.skips[state.turn]);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function saveProgress() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          positions: state.positions,
          skips: state.skips,
          turn: state.turn,
          packs: state.packs,
          names: state.names,
          disabledTags: Array.from(state.disabledTags),
        })
      );
    } catch (_) {}
  }

  function clearProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function rollDice() {
    return 1 + Math.floor(Math.random() * 6);
  }

  function setDiceEnabled(on) {
    $("#btn-dice").disabled = !on || state.paused;
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function onDiceClick() {
    if (state.rolling || state.paused) return;
    state.rolling = true;
    setDiceEnabled(false);
    const btn = $("#btn-dice");
    btn.classList.add("rolling");

    let display = 0;
    const anim = setInterval(() => {
      display = rollDice();
      btn.textContent = String(display);
    }, 60);

    await wait(500);
    clearInterval(anim);
    const result = rollDice();
    btn.textContent = String(result);
    btn.classList.remove("rolling");
    $("#dice-hint").textContent = curName() + " 掷出 " + result + " 点";

    await wait(280);
    await moveBy(result);
    state.rolling = false;
  }

  async function moveBy(steps) {
    const p = state.turn;
    let target = Math.min(
      TOTAL_CELLS - 1,
      Math.max(0, state.positions[p] + steps)
    );
    const dir = target >= state.positions[p] ? 1 : -1;
    while (state.positions[p] !== target) {
      state.positions[p] += dir;
      renderBoard();
      await wait(120);
    }
    saveProgress();

    if (state.positions[p] >= TOTAL_CELLS - 1) {
      finishGame(p);
      return;
    }

    await resolveLanding();
  }

  async function resolveLanding() {
    const pos = state.positions[state.turn];
    if (pos <= 0) {
      $("#btn-dice").textContent = "掷";
      endTurnOrKeep(false);
      return;
    }
    if (pos >= TOTAL_CELLS - 1) {
      finishGame(state.turn);
      return;
    }
    const special = SPECIALS[pos];
    if (special) {
      await handleSpecial(special);
      return;
    }
    openTask(drawCard());
  }

  async function handleSpecial(special) {
    toast(special.label);
    await wait(700);
    switch (special.effect) {
      case "forward2":
        await moveBy(2);
        break;
      case "back2":
        await moveBy(-2);
        break;
      case "rest":
        toast(curName() + " 休息，换人");
        endTurnOrKeep(true);
        break;
      case "reroll":
        toast(curName() + " 再掷一次！");
        state.pendingExtraTurn = true;
        $("#btn-dice").textContent = "掷";
        $("#dice-hint").textContent = curName() + " 额外再掷";
        setDiceEnabled(true);
        break;
      default:
        endTurnOrKeep(true);
    }
  }

  function endTurnOrKeep(switchTurn) {
    $("#btn-dice").textContent = "掷";
    if (state.pendingExtraTurn) {
      state.pendingExtraTurn = false;
      updateTurnUI();
      setDiceEnabled(true);
      return;
    }
    if (switchTurn) {
      state.turn = 1 - state.turn;
    }
    updateTurnUI();
    setDiceEnabled(true);
    saveProgress();
  }

  function openTask(card) {
    state.currentCard = card;
    state.cardDowngraded = false;
    stopTimer();

    const badges = $("#task-badges");
    badges.innerHTML = "";
    const levelBadge = document.createElement("span");
    const lv = card.level || 1;
    levelBadge.className =
      "badge " +
      (lv === 1 ? "badge-level1" : lv === 2 ? "badge-level2" : "badge-level3");
    levelBadge.textContent = packShort(lv);
    badges.appendChild(levelBadge);

    const typeBadge = document.createElement("span");
    typeBadge.className = "badge badge-type";
    typeBadge.textContent = card.type || "任务";
    badges.appendChild(typeBadge);

    const whoBadge = document.createElement("span");
    whoBadge.className = "badge badge-who";
    whoBadge.textContent = whoLabel(card.who || "both");
    badges.appendChild(whoBadge);

    (card.tags || []).forEach((t) => {
      const b = document.createElement("span");
      b.className = "badge badge-tag";
      b.textContent = t;
      badges.appendChild(b);
    });

    $("#who-line").textContent = whoTitle(card.who || "both");
    $("#task-title").textContent = card.type || "任务";
    $("#task-text").textContent = card.text;

    const hasTimer = card.duration_sec && card.duration_sec > 0;
    const timerBlock = $("#timer-block");
    if (hasTimer) {
      timerBlock.style.display = "block";
      state.timerTotal = card.duration_sec;
      state.timerRemain = card.duration_sec;
      $("#timer-fill").style.width = "100%";
      $("#timer-label").textContent =
        formatTime(card.duration_sec) + " · 点开始计时";
      $("#btn-timer-start").style.display = "";
      $("#btn-timer-start").disabled = false;
      $("#btn-timer-start").textContent = "开始计时";
    } else {
      timerBlock.style.display = "none";
    }

    const canDowngrade =
      (card.level === 2 || card.level === 3) && !!card.fallback;
    $("#btn-downgrade").disabled = !canDowngrade;
    const skipsLeft = state.skips[state.turn];
    $("#btn-skip").disabled = skipsLeft <= 0;
    if (skipsLeft > 0) {
      $("#btn-skip").textContent = "跳过（剩" + skipsLeft + "）";
    } else if (canDowngrade) {
      $("#btn-skip").textContent = "跳过用完 · 请完成或降级";
    } else {
      $("#btn-skip").textContent = "跳过用完 · 只能完成";
    }

    $("#task-overlay").classList.add("open");
    setDiceEnabled(false);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? m + ":" + String(s).padStart(2, "0") : s + "秒";
  }

  function startTimer() {
    if (state.timerId) return;
    if (state.paused) return;
    let remain = state.timerRemain;
    const total = state.timerTotal || remain;
    $("#btn-timer-start").disabled = true;
    $("#btn-timer-start").textContent = "计时中…";

    state.timerId = setInterval(() => {
      if (state.paused) return;
      remain -= 1;
      state.timerRemain = remain;
      const pct = Math.max(0, (remain / total) * 100);
      $("#timer-fill").style.width = pct + "%";
      $("#timer-label").textContent =
        remain > 0 ? "剩余 " + formatTime(remain) : "时间到";
      if (remain <= 0) {
        stopTimer();
        toast("时间到");
        $("#btn-timer-start").textContent = "已完成计时";
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function closeTaskAndSwitch() {
    stopTimer();
    $("#task-overlay").classList.remove("open");
    state.currentCard = null;
    state.cardDowngraded = false;
    endTurnOrKeep(true);
  }

  function onDone() {
    closeTaskAndSwitch();
  }

  function onSkip() {
    if (state.skips[state.turn] <= 0) {
      const canDown =
        state.currentCard &&
        (state.currentCard.level === 2 || state.currentCard.level === 3) &&
        state.currentCard.fallback;
      toast(canDown ? "跳过用完，请完成或降级" : "跳过用完，只能完成");
      return;
    }
    state.skips[state.turn] -= 1;
    $("#skip-label").textContent = String(state.skips[state.turn]);
    toast("已跳过 · " + curName() + " 剩 " + state.skips[state.turn]);
    closeTaskAndSwitch();
  }

  function onDowngrade() {
    const card = state.currentCard;
    if (!card || !card.fallback) return;
    if (state.cardDowngraded) return;
    state.cardDowngraded = true;
    $("#task-text").textContent = card.fallback;
    const badges = $("#task-badges");
    const lb = badges.querySelector(
      ".badge-level1, .badge-level2, .badge-level3"
    );
    if (lb) {
      if (card.level === 3) {
        lb.className = "badge badge-level2";
        lb.textContent = packShort(2) + "·降";
        toast("已降级为暧昧文案");
      } else {
        lb.className = "badge badge-level1";
        lb.textContent = packShort(1) + "·降";
        toast("已降级为甜蜜文案");
      }
    } else {
      toast("已降级");
    }
    $("#btn-downgrade").disabled = true;
  }

  function openPause() {
    state.paused = true;
    $("#pause-overlay").classList.add("open");
    $("#paused-banner").classList.add("show");
    setDiceEnabled(false);
  }

  function closePause() {
    state.paused = false;
    $("#pause-overlay").classList.remove("open");
    $("#paused-banner").classList.remove("show");
    const onEnd = $("#screen-end").classList.contains("active");
    if (!onEnd && !$("#task-overlay").classList.contains("open")) {
      setDiceEnabled(true);
    }
  }

  function finishGame(winnerIdx) {
    state.winner = winnerIdx;
    clearProgress();
    stopTimer();
    state.paused = false;
    $("#task-overlay").classList.remove("open");
    $("#pause-overlay").classList.remove("open");
    $("#paused-banner").classList.remove("show");
    setDiceEnabled(false);

    const loserIdx = 1 - winnerIdx;
    const wName = state.names[winnerIdx];
    const lName = state.names[loserIdx];
    $("#end-title").textContent = wName + " 获胜";
    $("#end-sub").textContent =
      "冲线有效。败方 " + lName + " 须按终局卡执行者标识配合完成。";
    $("#end-winner-name").textContent = wName;
    $("#end-loser-name").textContent = lName;
    $("#end-scoreline").style.display = "none";
    $("#end-scoreline").textContent = "";
    $("#end-result").style.display = "grid";

    const finale = pickFinale();
    state.finaleCard = finale;
    $("#finale-card").style.display = "block";
    $("#finale-text").textContent =
      "【" +
      whoLabelForWinner(finale.who, winnerIdx) +
      "】" +
      finale.text;
    $("#end-actions").style.display = "none";
    showScreen("screen-end");
  }

  function whoLabelForWinner(who, winnerIdx) {
    const w = state.names[winnerIdx];
    const l = state.names[1 - winnerIdx];
    if (who === "self") return w + " 做";
    if (who === "partner") return l + " 做给 " + w;
    if (who === "both") return "一起";
    return "执行";
  }

  function onFinaleDone() {
    const w = state.names[state.winner];
    const l = state.names[1 - state.winner];
    $("#finale-card").style.display = "none";
    $("#end-actions").style.display = "";
    $("#end-scoreline").style.display = "block";
    $("#end-scoreline").textContent = "本局：" + w + " 胜 · " + l + " 负";
    $("#end-sub").textContent =
      "终局已完成。进度仅存在本机。再来一局会重新开盘。";
  }

  function openFinalePause() {
    state.paused = true;
    $("#pause-overlay").classList.add("open");
  }

  function readPackFromUI(playerIdx) {
    const id = playerIdx === 0 ? "#pack-choices-a" : "#pack-choices-b";
    const selected = $(id + " .pack-card.selected") || $(id + " .choice.selected");
    return selected ? Number(selected.dataset.level) : 2;
  }

  function readSkipBudget() {
    const el = $("#skip-count");
    const n = el ? parseInt(el.textContent, 10) : MAX_SKIPS;
    if (Number.isNaN(n)) return MAX_SKIPS;
    return Math.max(0, Math.min(9, n));
  }

  function setSkipBudget(n) {
    const clamped = Math.max(0, Math.min(9, n));
    const el = $("#skip-count");
    if (el) el.textContent = String(clamped);
    return clamped;
  }

  function syncPackLabels() {
    const a = ($("#name-a") && $("#name-a").value.trim()) || "我";
    const b = ($("#name-b") && $("#name-b").value.trim()) || "TA";
    const la = $("#pack-label-a");
    const lb = $("#pack-label-b");
    if (la) la.textContent = a.slice(0, 12);
    if (lb) lb.textContent = b.slice(0, 12);
  }

  function startGame() {
    state.positions = [0, 0];
    const budget = readSkipBudget();
    state.skips = [budget, budget];
    state.turn = 0;
    state.paused = false;
    state.rolling = false;
    state.currentCard = null;
    state.winner = null;
    state.finaleCard = null;
    state.pendingExtraTurn = false;
    buildDecks();
    renderBoard();
    $("#btn-dice").textContent = "掷";
    $("#finale-card").style.display = "none";
    $("#end-actions").style.display = "none";
    $("#end-scoreline").style.display = "none";
    $("#end-scoreline").textContent = "";
    $("#end-result").style.display = "grid";
    $("#pause-overlay").classList.remove("open");
    $("#paused-banner").classList.remove("show");
    showScreen("screen-game");
    setDiceEnabled(true);
    saveProgress();
  }

  function bindPackChoices(containerSel, playerIdx) {
    const cards = $$(containerSel + " .pack-card");
    const targets = cards.length ? cards : $$(containerSel + " .choice");
    targets.forEach((btn) => {
      btn.addEventListener("click", () => {
        targets.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.packs[playerIdx] = Number(btn.dataset.level);
      });
    });
  }

  function bindUI() {
    const ageCheck = $("#age-check");
    const btnAge = $("#btn-age");
    ageCheck.addEventListener("change", () => {
      btnAge.disabled = !ageCheck.checked;
    });
    btnAge.addEventListener("click", () => showScreen("screen-setup"));

    bindPackChoices("#pack-choices-a", 0);
    bindPackChoices("#pack-choices-b", 1);

    ["#name-a", "#name-b"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener("input", syncPackLabels);
    });
    syncPackLabels();

    const skipMinus = $("#skip-minus");
    const skipPlus = $("#skip-plus");
    if (skipMinus) {
      skipMinus.addEventListener("click", () =>
        setSkipBudget(readSkipBudget() - 1)
      );
    }
    if (skipPlus) {
      skipPlus.addEventListener("click", () =>
        setSkipBudget(readSkipBudget() + 1)
      );
    }

    const rulesOpen = $("#btn-rules-sheet");
    const rulesClose = $("#btn-rules-close");
    const rulesOverlay = $("#rules-overlay");
    if (rulesOpen && rulesOverlay) {
      rulesOpen.addEventListener("click", () =>
        rulesOverlay.classList.add("open")
      );
    }
    if (rulesClose && rulesOverlay) {
      rulesClose.addEventListener("click", () =>
        rulesOverlay.classList.remove("open")
      );
    }
    if (rulesOverlay) {
      rulesOverlay.addEventListener("click", (e) => {
        if (e.target === rulesOverlay) rulesOverlay.classList.remove("open");
      });
    }

    $("#btn-custom-add").addEventListener("click", addCustomCard);
    $("#btn-custom-export").addEventListener("click", exportCustomCards);
    $("#btn-custom-import").addEventListener("click", () => {
      $("#custom-import-file").click();
    });
    $("#custom-import-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      importCustomCards(file);
      e.target.value = "";
    });

    $("#btn-start").addEventListener("click", () => {
      const a = ($("#name-a").value || "").trim() || "我";
      const b = ($("#name-b").value || "").trim() || "TA";
      state.names = [a.slice(0, 12), b.slice(0, 12)];
      state.disabledTags = new Set();
      $$("[data-disable-tag]").forEach((input) => {
        if (input.checked) state.disabledTags.add(input.dataset.disableTag);
      });
      state.packs = [readPackFromUI(0), readPackFromUI(1)];
      startGame();
    });

    $("#btn-back-age").addEventListener("click", () =>
      showScreen("screen-age")
    );
    $("#btn-dice").addEventListener("click", onDiceClick);
    $("#btn-done").addEventListener("click", onDone);
    $("#btn-skip").addEventListener("click", onSkip);
    $("#btn-downgrade").addEventListener("click", onDowngrade);
    $("#btn-timer-start").addEventListener("click", startTimer);
    $("#btn-pause").addEventListener("click", openPause);
    $("#btn-task-pause").addEventListener("click", openPause);
    $("#btn-resume").addEventListener("click", closePause);
    $("#btn-quit").addEventListener("click", () => {
      closePause();
      stopTimer();
      $("#task-overlay").classList.remove("open");
      clearProgress();
      showScreen("screen-setup");
    });
    $("#btn-again").addEventListener("click", () => startGame());
    $("#btn-setup-again").addEventListener("click", () => {
      clearProgress();
      showScreen("screen-setup");
    });
    $("#btn-finale-done").addEventListener("click", onFinaleDone);
    const finalePause = $("#btn-finale-pause");
    if (finalePause) {
      finalePause.addEventListener("click", openFinalePause);
    }
  }

  async function init() {
    loadCustomCards();
    bindUI();
    renderCustomList();
    await loadTasks();
    state.positions = [0, 0];
    renderBoard();
  }

  init();
})();
