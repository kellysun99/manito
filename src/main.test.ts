// @vitest-environment jsdom
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import type { Screen } from "./types";
const fake = vi.hoisted(() => ({
  screen: null as Screen | null,
  calls: [] as string[],
}));
vi.mock("./api", () => ({
  configured: true,
  messages: {},
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    fake.calls.push(name);
    if (name === "login") return { token: "test-token", me: fake.screen!.me };
    if (name === "get_screen") return structuredClone(fake.screen);
    if (name === "save_target")
      fake.screen!.myEntry!.targetId = String(args.p_target_id);
    if (name === "save_activity")
      fake.screen!.myEntry!.activityText = String(args.p_activity_text);
    if (name === "save_guess") {
      fake.screen!.myEntry!.guessedGiverId = String(args.p_guessed_giver_id);
      fake.screen!.myEntry!.guessReason = String(args.p_reason);
    }
    return {};
  }),
}));
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((x) => x.textContent === text)!;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  fake.calls = [];
  fake.screen = {
    phase: "ACTIVITY",
    updatedAt: "2026-10-15T00:00:00Z",
    me: { id: "a", name: "민수", isAdmin: false, isParticipant: true },
    myEntry: {
      userId: "a",
      targetId: "b",
      activityText: "물 가져다주기",
      guessedGiverId: null,
      guessReason: null,
      targetUpdatedAt: null,
      activityUpdatedAt: null,
      guessUpdatedAt: null,
    },
    candidates: [
      { id: "b", name: "지영", isAdmin: false, isParticipant: true },
      { id: "c", name: "준호", isAdmin: false, isParticipant: true },
    ],
    adminData: null,
    results: null,
    summary: null,
  };
});
afterEach(() => {
  vi.restoreAllMocks();
});
async function start() {
  localStorage.setItem("manito-session-v1", "test-token");
  await import("./main");
  await tick();
}
test("저장된 활동 대상을 수정할 수 있고 기존 본문은 유지된다", async () => {
  await start();
  expect(button("챙길 마니또 수정")).toBeTruthy();
  button("챙길 마니또 수정").click();
  const select = document.querySelector("select")!;
  select.value = "c";
  select.dispatchEvent(new Event("change"));
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await tick();
  expect(fake.calls).toContain("save_target");
  expect(fake.screen!.myEntry!.activityText).toBe("물 가져다주기");
  expect(document.body.textContent).toContain("준호");
});
test("로그인 직후 새 화면의 버튼도 활성화된다", async () => {
  await import("./main");
  const inputs = document.querySelectorAll("input");
  inputs[0].value = "민수";
  inputs[1].value = "001234";
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await tick();
  expect(localStorage.getItem("manito-session-v1")).toBe("test-token");
  expect(button("챙길 마니또 수정").disabled).toBe(false);
});
test("예상 단계는 활동을 읽기 전용으로 보여준다", async () => {
  fake.screen!.phase = "GUESS";
  await start();
  expect(button("챙길 마니또 수정")).toBeUndefined();
  expect(document.body.textContent).toContain("내 마니또가 누구일 것 같나요?");
  expect(document.body.textContent).toContain("물 가져다주기");
});
test("공개 결과는 정답 여부와 대시보드에 사용자 텍스트를 안전하게 표시한다", async () => {
  fake.screen!.phase = "REVEALED";
  fake.screen!.results = [
    {
      userId: "a",
      name: "민수",
      actualGiverId: "c",
      actualGiverName: "준호",
      guessedGiverName: "준호",
      guessReason: "<img src=x onerror=alert(1)>",
      verdict: "CORRECT",
      receivedActivity: "커피",
      targetName: "지영",
      activityText: "물",
    },
  ];
  await start();
  expect(document.body.textContent).toContain("맞혔어요!");
  expect(document.querySelector("img")).toBeNull();
  button("대시보드 가기").click();
  expect(document.body.textContent).toContain("우리 팀의 마니또 이야기");
});

test('관리자 제출 현황은 현재 참가 인원으로 분모를 계산한다',async()=>{fake.screen!.me.isAdmin=true;fake.screen!.me.isParticipant=false;fake.screen!.adminData=[];fake.screen!.summary={total:3,targets:2,activities:1,guesses:0,correct:0,incorrect:0,missing:3,accuracy:null};await start();expect(document.body.textContent).toContain('2/3');expect(document.body.textContent).toContain('1/3');expect(document.body.textContent).not.toContain('/24');});
