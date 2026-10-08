export type EmbeddedGame = {
  id: string;
  title: string;
  description: string;
  /** The page the provider serves for embedding — it must allow being framed by other sites. */
  src: string;
  /** Shape of the game's own canvas: decides how the frame is sized on a phone. */
  orientation: "portrait" | "landscape";
  /** Shown under the frame: who hosts the game. */
  provider: string;
  /** Query parameter some providers want the embedding page's address in. */
  referrerParam?: string;
};

/**
 * Games are embedded from other sites, never built here. Add one = one entry.
 * Check the address in a real browser first: many game pages refuse to be framed.
 */
export const GAMES: EmbeddedGame[] = [
  {
    id: "flappy-bird",
    title: "Flappy Bird",
    description: "Chạm để chim bay qua các ống nước.",
    src: "https://flappybird.ee/play/",
    orientation: "portrait",
    provider: "flappybird.ee",
  },
  {
    id: "gold-miner",
    title: "Đào vàng",
    description: "Thả móc đúng lúc để kéo vàng lên.",
    src: "https://www.crazygames.com/embed/gold-miner",
    orientation: "landscape",
    provider: "CrazyGames",
  },
  {
    id: "chicken-shooter",
    title: "Bắn gà",
    description: "Ngắm và bắn gà trong trang trại. Chơi dễ nhất bằng chuột.",
    src: "https://html5.gamedistribution.com/4ab37ff00af34c52945957fc08fd41af/",
    orientation: "landscape",
    provider: "GameDistribution",
    referrerParam: "gd_sdk_referrer_url",
  },
];
