import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForUpdate(): Promise<boolean> {
  try {
    const update = await check();
    if (update) {
      console.log(`업데이트 발견: v${update.version}`);
      const confirmed = window.confirm(
        `새 버전 (v${update.version})이 있습니다. 업데이트하시겠습니까?`
      );
      if (confirmed) {
        await update.downloadAndInstall();
        await relaunch();
      }
      return true;
    }
    console.log("최신 버전입니다.");
    return false;
  } catch (e) {
    console.error("업데이트 확인 실패:", e);
    return false;
  }
}
