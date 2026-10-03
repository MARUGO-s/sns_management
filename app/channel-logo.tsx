import { appPath } from "./lib/public-path";

export const channelLogos = {
  instagram: { label: "Instagram", src: "/logos/instagram.png" },
  tiktok: { label: "TikTok", src: "/logos/tiktok.avif" },
  x: { label: "X", src: "/logos/x.jpg" },
  threads: { label: "Threads", src: "/logos/threads.avif" },
} as const;

export type ChannelId = keyof typeof channelLogos;

export function ChannelLogo({
  channel,
  small = false,
}: {
  channel: ChannelId;
  small?: boolean;
}) {
  return (
    <span
      className={`network-badge channel-logo${small ? " channel-logo--small" : ""}`}
      aria-hidden="true"
    >
      {/* Original user-supplied files, served directly on static GitHub Pages. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={appPath(channelLogos[channel].src)}
        alt=""
        width={small ? 24 : 34}
        height={small ? 24 : 34}
      />
    </span>
  );
}

export function ChannelLabel({ channel }: { channel: string }) {
  if (!Object.hasOwn(channelLogos, channel)) return channel;
  const id = channel as ChannelId;
  return (
    <>
      <ChannelLogo channel={id} small />
      {channelLogos[id].label}
    </>
  );
}
