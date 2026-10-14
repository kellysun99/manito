import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
const client = configured
  ? createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!client) throw new Error("SETUP_ERROR");
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const messages: Record<string, string> = {
  INVALID_LOGIN: "이름 또는 사번을 확인해 주세요.",
  AUTH_REQUIRED: "다시 로그인해 주세요.",
  FORBIDDEN: "접근 권한이 없어요.",
  NOT_PARTICIPANT: "이벤트 참가 계정만 입력할 수 있어요.",
  TARGET_TAKEN:
    "이미 등록된 대상이에요. 이름을 확인하거나 관리자에게 알려주세요.",
  TARGET_REQUIRED: "챙길 마니또를 먼저 저장해 주세요.",
  MISSING_TARGETS: "아직 활동 대상을 등록하지 않은 참가자가 있어요.",
  PHASE_CLOSED: "다음 단계가 시작되어 저장할 수 없어요.",
  VALIDATION_ERROR: "입력 내용과 글자 수를 확인해 주세요.",
  SETUP_ERROR: "DB와 환경 설정을 확인해 주세요.",
};
