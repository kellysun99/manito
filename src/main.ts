import "./styles.css";
import { configured, rpc, messages } from "./api";
import type { Screen, User, Result } from "./types";
const root = document.querySelector<HTMLDivElement>("#app")!;
const TOKEN = "manito-session-v1";
let token = localStorage.getItem(TOKEN) || "",
  data: Screen | null = null,
  dashboard = false,
  tab = "guess",
  filter = "",
  search = "",
  busy = false,
  fetching = false,
  alive = 0;
let adminSearch = "",
  adminFilter = "all";
let draftTarget = "",
  draftActivity = "",
  draftGuess = "",
  draftReason = "",
  dirty = false,
  editingTarget = false;
const labels = {
  ACTIVITY: "활동 기록",
  GUESS: "예상하기",
  REVEALED: "결과 공개",
};
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function append(parent: HTMLElement, ...children: (HTMLElement | null)[]) {
  children.forEach((c) => c && parent.append(c));
  return parent;
}
function btn(text: string, fn: () => unknown, secondary = false) {
  const b = el("button", text, secondary ? "secondary" : "");
  b.type = "button";
  b.disabled = busy;
  b.onclick = () => void fn();
  return b;
}
function notice(message: string, error = false) {
  let n = document.querySelector<HTMLElement>("#notice");
  if (!n) {
    n = el("div");
    n.id = "notice";
    n.setAttribute("role", "status");
    root.prepend(n);
  }
  n.textContent = message;
  n.className = error ? "notice error" : "notice";
}
function resetDraft() {
  const e = data?.myEntry;
  draftTarget = e?.targetId || "";
  draftActivity = e?.activityText || "";
  draftGuess = e?.guessedGiverId || "";
  draftReason = e?.guessReason || "";
  dirty = false;
  editingTarget = !e?.targetId;
}
function name(id: string | null) {
  return data?.candidates.find((u) => u.id === id)?.name || "미등록";
}
function date(s: string | null | undefined) {
  return s
    ? new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "아직 저장하지 않았어요";
}
function pair(title: string, value: string | null) {
  return append(
    el("div", "", "pair"),
    el("span", title),
    el("p", value || "미제출"),
  );
}
function heading(kicker: string, title: string, desc: string) {
  return append(
    el("div", "", "heading"),
    el("span", kicker, "eyebrow"),
    el("h1", title),
    el("p", desc),
  );
}
function base() {
  root.replaceChildren();
  const header = append(
    el("header"),
    el("a", "Manito", "brand"),
  );
  if (token) header.append(btn("로그아웃", logout, true));
  root.append(header);
  const main = el("main");
  root.append(main);
  return main;
}
async function refresh(force = false) {
  if (!token) return;
  if (fetching) {
    if (!force) return;
    while (fetching) await new Promise((r) => setTimeout(r, 50));
    if (!token) return;
  }
  fetching = true;
  const generation = alive;
  try {
    const next = await rpc<Screen>("get_screen", { p_token: token });
    if (generation !== alive) return;
    const changed = data?.phase !== next.phase;
    const wasDirty = dirty;
    data = next;
    if (changed) {
      resetDraft();
      dashboard = false;
    }
    if (
      force ||
      changed ||
      (!dirty &&
        !document.querySelector("input:focus,textarea:focus,select:focus"))
    ) {
      render();
    }
    if (changed && wasDirty)
      notice("다음 단계가 시작됐어요. 저장하지 않은 입력은 제출되지 않았어요.");
  } catch (e) {
    handle(e);
  } finally {
    fetching = false;
  }
}
function handle(e: unknown) {
  const code = e instanceof Error ? e.message : "";
  if (code === "AUTH_REQUIRED") {
    token = "";
    localStorage.removeItem(TOKEN);
    data = null;
    alive++;
    render();
  }
  notice(messages[code] || "연결을 확인하고 다시 시도해 주세요.", true);
}
async function action(
  fn: string,
  args: Record<string, unknown>,
  success: string,
) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await rpc(fn, { p_token: token, ...args });
    dirty = false;
    await refresh(true);
    resetDraft();
    render();
    notice(success);
  } catch (e) {
    handle(e);
    if (e instanceof Error && e.message === "PHASE_CLOSED") await refresh(true);
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
async function logout() {
  const old = token;
  token = "";
  alive++;
  localStorage.removeItem(TOKEN);
  data = null;
  dirty = false;
  dashboard = false;
  render();
  try {
    await rpc("logout", { p_token: old });
  } catch {
    notice(
      "이 기기에서는 로그아웃했어요. 서버 연결 실패로 기존 세션 정리는 완료하지 못했어요.",
      true,
    );
  }
}
function select(label: string, value: string, change: (id: string) => void) {
  const wrap = el("label", label);
  const s = el("select");
  s.required = true;
  const placeholder = el("option", "이름을 선택해 주세요");
  placeholder.value = "";
  s.append(placeholder);
  for (const u of data!.candidates.filter((x) => x.id !== data!.me.id)) {
    const o = el("option", u.name);
    o.value = u.id;
    s.append(o);
  }
  s.value = value;
  s.onchange = () => {
    change(s.value);
    dirty = true;
  };
  wrap.append(s);
  return wrap;
}
function textarea(
  label: string,
  value: string,
  max: number,
  change: (s: string) => void,
) {
  const l = el("label", label),
    t = el("textarea"),
    count = el("small", `${value.length}/${max}`);
  t.value = value;
  t.maxLength = max;
  t.required = true;
  t.rows = 5;
  t.oninput = () => {
    change(t.value);
    dirty = true;
    count.textContent = `${t.value.length}/${max}`;
  };
  append(l, t, count);
  return l;
}
function form(fn: () => void, ...children: HTMLElement[]) {
  const f = el("form");
  append(f, ...children);
  const b = el("button", "저장하기");
  b.type = "submit";
  b.disabled = busy;
  f.append(b);
  f.onsubmit = (e) => {
    e.preventDefault();
    fn();
  };
  return f;
}
function renderLogin(main: HTMLElement) {
  append(
    main,
    heading(
      "TEAM 활동",
      "2026 webOS플랫폼Engineering팀 추계야유회",
      "이름과 사번으로 우리 팀 마니또에 참여하세요.",
    ),
  );
  const card = el("section", "", "card");
  const f = el("form"),
    n = el("input"),
    p = el("input");
  n.required = true;
  n.autocomplete = "username";
  n.placeholder = "이름";
  p.required = true;
  p.type = "password";
  p.autocomplete = "current-password";
  p.placeholder = "사번";
  const nl = el("label", "이름"),
    pl = el("label", "사번");
  nl.append(n);
  pl.append(p);
  const b = el("button", "로그인");
  append(f, nl, pl, b);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    b.disabled = true;
    try {
      const r = await rpc<{ token: string; me: User }>("login", {
        p_name: n.value.trim(),
        p_employee_no: p.value,
      });
      p.value = "";
      token = r.token;
      localStorage.setItem(TOKEN, token);
      await refresh(true);
      resetDraft();
      render();
    } catch (err) {
      handle(err);
    } finally {
      busy = false;
      document.querySelectorAll("button").forEach((x) => (x.disabled = false));
    }
  };
  append(
    card,
    el("h2", "반가워요 👋"),
    f,
    el("p", "사번은 로그인 확인에만 사용해요.", "muted"),
  );
  main.append(card);
}
function renderActivity(main: HTMLElement) {
  append(
    main,
    heading(
      "01 · ACTIVITY",
      "당신의 마니또를 챙겨주세요",
      "",
    ),
  );
  const c = el("section", "", "card");
  c.append(el("h2", "내가 챙길 마니또는 누구인가요?"));
  if (editingTarget) {
    c.append(
      form(
        () =>
          void action(
            "save_target",
            { p_target_id: draftTarget },
            "챙길 마니또를 저장했어요.",
          ),
        select("팀원 이름", draftTarget, (v) => (draftTarget = v)),
      ),
    );
  } else {
    append(
      c,
      el("p", name(data!.myEntry?.targetId || null), "chosen"),
      btn(
        "챙길 마니또 수정",
        () => {
          editingTarget = true;
          render();
        },
        true,
      ),
      btn(
        "대상 등록 취소",
        () => {
          if (confirm("대상 등록을 취소할까요? 활동 내용은 유지됩니다."))
            void action("clear_target", {}, "대상 등록을 취소했어요.");
        },
        true,
      ),
    );
  }
  c.append(el("small", date(data!.myEntry?.targetUpdatedAt)));
  main.append(c);
  const a = el("section", "", "card");
  append(a, el("h2", "마니또 활동을 진행해주세요!"));
  if (data!.myEntry?.targetId) {
    a.append(
      form(
        () =>
          void action(
            "save_activity",
            { p_activity_text: draftActivity },
            "활동을 저장했어요.",
          ),
        textarea(
          "마니또에게 무엇을 해주었나요?",
          draftActivity,
          2000,
          (v) => (draftActivity = v),
        ),
      ),
    );
    a.append(el("small", date(data!.myEntry.activityUpdatedAt)));
  } else a.append(el("p", "챙길 마니또를 저장하면 활동을 기록할 수 있어요."));
  append(
    a,
    el(
      "p",
      "예상 단계 시작 전까지 대상과 활동을 수정할 수 있어요. 관리자는 저장한 내용을 볼 수 있고, 답 공개 후 팀원과 함께 봅니다.",
      "muted",
    ),
  );
  main.append(a);
}
function renderGuess(main: HTMLElement) {
  append(
    main,
    heading(
      "02 · GUESS",
      "당신을 챙겨준 사람은?",
      "작은 힌트를 떠올리며 마니또를 예상해 보세요.",
    ),
  );
  const c = el("section", "", "card");
  c.append(
    form(
      () =>
        void action(
          "save_guess",
          { p_guessed_giver_id: draftGuess, p_reason: draftReason },
          "예상을 제출했어요.",
        ),
      select(
        "내 마니또가 누구일 것 같나요?",
        draftGuess,
        (v) => (draftGuess = v),
      ),
      textarea("이유는?", draftReason, 1000, (v) => (draftReason = v)),
    ),
  );
  append(
    c,
    el("small", date(data!.myEntry?.guessUpdatedAt)),
    el(
      "p",
      "답 공개 전까지 수정 후 다시 제출할 수 있어요. 예상과 이유는 공개 후 팀원에게 보여요.",
      "muted",
    ),
  );
  main.append(c);
  const a = el("details", "", "card");
  append(
    a,
    el("summary", "내가 기록한 마니또 활동"),
    pair("챙긴 사람", name(data!.myEntry?.targetId || null)),
    pair("활동 내용", data!.myEntry?.activityText || null),
  );
  main.append(a);
}
const verdictLabel = {
  CORRECT: "맞혔어요!",
  INCORRECT: "아쉽지만 다른 분이었어요",
  NOT_SUBMITTED: "예상을 제출하지 않았어요",
};
function renderResult(main: HTMLElement) {
  const r = data!.results?.find((x) => x.userId === data!.me.id);
  if (!r) return;
  append(
    main,
    heading(
      "03 · REVEAL",
      "마니또를 공개합니다",
      "당신을 챙겨준 팀원에게 고마움을 전해보세요.",
    ),
  );
  const c = el("section", "", "card result");
  append(
    c,
    el("span", "나의 마니또는", "eyebrow"),
    el("h2", r.actualGiverName || "정보 확인 필요", "reveal-name"),
    el("p", verdictLabel[r.verdict], "badge " + r.verdict),
    pair("내가 예상한 사람", r.guessedGiverName),
    pair("예상한 이유", r.guessReason),
    pair("나에게 해준 일", r.receivedActivity),
    btn("대시보드 가기", () => {
      dashboard = true;
      render();
    }),
  );
  main.append(c);
}
function stats(main: HTMLElement) {
  const s = data!.summary;
  if (!s) return;
  const items =
    data!.phase === "REVEALED"
      ? [
          ["참가", s.total],
          ["예상 제출", s.guesses],
          ["정답", s.correct],
          ["오답", s.incorrect],
          ["미제출", s.missing],
          ["정답률", s.accuracy === null ? "—" : s.accuracy + "%"],
        ]
      : [
          ["대상 등록", `${s.targets}/${s.total}`],
          ["활동 기록", `${s.activities}/${s.total}`],
          ["예상 제출", `${s.guesses}/${s.total}`],
        ];
  const grid = el("div", "", "stats");
  for (const [label, value] of items)
    grid.append(
      append(
        el("div", "", "stat"),
        el("span", String(label)),
        el("strong", String(value)),
      ),
    );
  main.append(grid);
}
function resultCard(r: Result) {
  const c = el("article", "", "card");
  if (tab === "activity") {
    append(
      c,
      el("h2", `${r.name} → ${r.targetName || "미등록"}`),
      pair("마니또에게 해준 일", r.activityText),
    );
  } else
    append(
      c,
      el("h2", `${r.name}의 예상`),
      el(
        "p",
        `${r.guessedGiverName || "미제출"}${r.guessedGiverName ? "님을 예상했어요" : ""}`,
      ),
      pair("이유", r.guessReason),
      pair("실제 마니또", r.actualGiverName),
      el("span", verdictLabel[r.verdict], "badge " + r.verdict),
    );
  return c;
}
function renderDashboard(main: HTMLElement) {
  main.classList.add("wide");
  append(
    main,
    heading(
      "",
      "우리 팀의 마니또 이야기",
      "누가 누구를 챙겼을까요? 함께 살펴보세요.",
    ),
  );
  stats(main);
  const nav = el("nav", "", "tabs");
  append(
    nav,
    btn(
      "예상 결과",
      () => {
        tab = "guess";
        render();
      },
      tab !== "guess",
    ),
    btn(
      "마니또 활동",
      () => {
        tab = "activity";
        render();
      },
      tab !== "activity",
    ),
  );
  if (data!.me.isParticipant)
    nav.append(
      btn(
        "내 결과",
        () => {
          dashboard = false;
          render();
        },
        true,
      ),
    );
  if (data!.me.isAdmin)
    nav.append(
      btn(
        "관리자 현황",
        () => {
          dashboard = false;
          render();
        },
        true,
      ),
    );
  main.append(nav);
  const controls = el("div", "", "controls"),
    input = el("input");
  input.placeholder = "이름 검색";
  input.setAttribute("aria-label", "이름 검색");
  input.value = search;
  const list = el("div", "", "grid");
  const draw = () => {
    list.replaceChildren();
    const rows = (data!.results || []).filter(
      (r) =>
        `${r.name} ${r.targetName || ""} ${r.actualGiverName || ""} ${r.guessedGiverName || ""}`.includes(
          search,
        ) &&
        (tab === "activity" || !filter || r.verdict === filter),
    );
    rows.forEach((r) => list.append(resultCard(r)));
    if (!rows.length) list.append(el("p", "일치하는 결과가 없어요."));
  };
  input.oninput = () => {
    search = input.value;
    draw();
  };
  controls.append(input);
  if (tab === "guess") {
    const s = el("select");
    s.setAttribute("aria-label", "결과 필터");
    for (const [v, l] of [
      ["", "전체"],
      ["CORRECT", "정답"],
      ["INCORRECT", "오답"],
      ["NOT_SUBMITTED", "미제출"],
    ]) {
      const o = el("option", l);
      o.value = v;
      s.append(o);
    }
    s.value = filter;
    s.onchange = () => {
      filter = s.value;
      draw();
    };
    controls.append(s);
  }
  append(main, controls, list);
  draw();
}
function renderAdmin(main: HTMLElement) {
  main.classList.add("wide");
  append(
    main,
    heading(
      "HOST DESK",
      "오늘의 마니또 운영",
      "저장한 기록과 참여 현황을 한눈에 확인하세요.",
    ),
  );
  stats(main);
  const top = el("section", "", "card");
  top.append(el("h2", `현재 단계 · ${labels[data!.phase]}`));
  if (data!.phase !== "REVEALED") {
    const current = data!.phase;
    const missing = (data!.adminData || []).filter(
      (u) => u.isParticipant && !u.entry?.targetId,
    );
    if (current === "ACTIVITY" && missing.length)
      top.append(
        el(
          "p",
          `대상 미등록: ${missing.map((x) => x.name).join(", ")}`,
          "error",
        ),
      );
    top.append(
      btn(
        current === "ACTIVITY"
          ? "활동 마감 · 예상 시작"
          : "예상 마감 · 답 공개",
        () => {
          if (
            confirm(
              current === "ACTIVITY"
                ? "활동 입력을 닫고 예상 입력을 바로 시작할까요? 되돌릴 수 없어요."
                : `예상 미제출 ${data!.summary?.missing || 0}명입니다. 입력을 닫고 모두에게 답을 공개할까요? 되돌릴 수 없어요.`,
            )
          )
            void action(
              "advance_phase",
              { p_expected_phase: current },
              "다음 단계로 전환했어요.",
            );
        },
      ),
    );
  } else
    top.append(
      btn("전체 대시보드", () => {
        dashboard = true;
        render();
      }),
    );
  main.append(top);
  const controls = el("div", "", "controls"),
    input = el("input"),
    selectFilter = el("select");
  input.placeholder = "이름 검색";
  input.setAttribute("aria-label", "참가자 검색");
  for (const [v, l] of [
    ["all", "전체 명단"],
    ["participants", "참가자"],
    ["target", "대상 미등록"],
    ["activity", "활동 미제출"],
    ["guess", "예상 미제출"],
  ]) {
    const o = el("option", l);
    o.value = v;
    selectFilter.append(o);
  }
  input.value = adminSearch;
  selectFilter.value = adminFilter;
  const list = el("div", "", "grid");
  const draw = () => {
    adminSearch = input.value;
    adminFilter = selectFilter.value;
    list.replaceChildren();
    const f = selectFilter.value;
    for (const u of data!.adminData || []) {
      if (!u.name.includes(input.value)) continue;
      if (
        f !== "all" &&
        (!u.isParticipant ||
          (f === "target" && u.entry?.targetId) ||
          (f === "activity" && u.entry?.activityText && u.entry.targetId) ||
          (f === "guess" && u.entry?.guessedGiverId))
      )
        continue;
      const e = u.entry,
        c = el("details", "", "card");
      append(
        c,
        el(
          "summary",
          `${u.name} · ${u.isAdmin ? "관리자" : u.isParticipant ? "참가자" : "비참가"} · 대상 ${e?.targetId ? "등록" : "—"} / 활동 ${e?.activityText && e.targetId ? "저장" : "—"} / 예상 ${e?.guessedGiverId ? "제출" : "—"}`,
        ),
      );
      if (u.isParticipant)
        append(
          c,
          pair("챙길 사람", e?.targetId ? name(e.targetId) : null),
          pair("활동 내용", e?.activityText || null),
          pair(
            "예상한 사람",
            e?.guessedGiverId ? name(e.guessedGiverId) : null,
          ),
          pair("예상 이유", e?.guessReason || null),
          pair("대상 저장", date(e?.targetUpdatedAt)),
          pair("활동 저장", date(e?.activityUpdatedAt)),
          pair("예상 제출", date(e?.guessUpdatedAt)),
        );
      list.append(c);
    }
  };
  input.oninput = draw;
  selectFilter.onchange = draw;
  append(controls, input, selectFilter);
  append(main, controls, list);
  draw();
}
function render() {
  const openDetails = [
    ...document.querySelectorAll("details[open] summary"),
  ].map((x) => x.textContent);
  const main = base();
  if (!configured) {
    append(
      main,
      heading(
        "SETUP",
        "연결 설정이 필요해요",
        ".env.local 또는 GitHub production 환경의 Supabase URL과 publishable key를 설정해 주세요.",
      ),
    );
    return;
  }
  if (!token) {
    renderLogin(main);
    return;
  }
  if (!data) {
    main.append(el("p", "불러오는 중이에요…"));
    main.append(btn("다시 시도", () => refresh(true)));
    return;
  }
//   const steps = el(
//     "div",
//     `활동 기록  →  예상하기  →  결과 공개`,
//     "steps",
//   );
//   main.append(steps);
  if (dashboard && data.phase === "REVEALED") renderDashboard(main);
  else if (data.me.isAdmin) renderAdmin(main);
  else if (!data.me.isParticipant) {
    if (data.phase === "REVEALED") renderDashboard(main);
    else
      append(
        main,
        heading(
          "함께하는 우리 팀",
          "이벤트가 진행 중이에요",
          "마니또 공개 후 팀 전체 이야기를 볼 수 있어요.",
        ),
      );
  } else if (data.phase === "ACTIVITY") renderActivity(main);
  else if (data.phase === "GUESS") renderGuess(main);
  else renderResult(main);
  document.querySelectorAll("details").forEach((d) => {
    if (openDetails.includes(d.querySelector("summary")?.textContent || ""))
      d.open = true;
  });
}
render();
if (token) void refresh(true);
setInterval(() => {
  if (!document.hidden && token && data?.phase !== "REVEALED") void refresh();
}, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
window.addEventListener("online", () => void refresh());
