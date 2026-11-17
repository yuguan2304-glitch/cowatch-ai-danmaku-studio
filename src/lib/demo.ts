import type { Danmaku } from "./types";
import { uid } from "./id";

const TEXTS = [
  "前排！", "来了来了", "这个画面好好看", "哈哈哈哈哈哈", "弹幕护体", "有没有人和我一样", "画质好清楚",
  "这里截图当壁纸", "awsl", "前方高能", "名场面预定", "好家伙", "这配色绝了", "我又来了", "打卡",
  "镜头好稳", "笑死", "这里可以", "太可爱了吧", "构图满分", "冲冲冲", "已三连", "正片开始",
];
const VIEWERS = ["演示·粉丝", "演示·乐子人", "演示·磕学家"];
const COLORS = ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFD302", "#89D5FF", "#FF8FC8"];

/** Clearly-labeled sample danmaku for trying the player. NOT AI analysis. */
export function makeDemoDanmaku(duration: number, perMinute: number): Danmaku[] {
  const total = Math.max(5, Math.round((duration / 60) * perMinute));
  const out: Danmaku[] = [];
  for (let i = 0; i < total; i++) {
    const time = Math.round(((i + Math.random()) / total) * Math.max(1, duration - 1) * 100) / 100;
    out.push({
      id: uid("demo"),
      time,
      text: TEXTS[Math.floor(Math.random() * TEXTS.length)],
      viewer: VIEWERS[i % VIEWERS.length],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      demo: true,
    });
  }
  return out;
}
