import {
  buildDailyPerformance,
  type BuildPerformanceInput,
} from "@/lib/performance";
self.onmessage = ({ data }: MessageEvent<BuildPerformanceInput>) => {
  try {
    self.postMessage({ points: buildDailyPerformance(data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "성과 계산 실패",
    });
  }
};
