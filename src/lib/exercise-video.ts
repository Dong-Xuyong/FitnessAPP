export function getYouTubeEmbedUrl(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/") || url.pathname.startsWith("/live/")) {
        videoId = url.pathname.split("/").filter(Boolean)[1] || "";
      } else if (url.pathname === "/watch" || url.pathname.startsWith("/watch")) {
        videoId = url.searchParams.get("v") || "";
      } else if (url.pathname.startsWith("/v/")) {
        videoId = url.pathname.split("/").filter(Boolean)[1] || "";
      }
    }

    videoId = videoId.split("?")[0]?.split("&")[0] || "";

    return /^[a-zA-Z0-9_-]{6,}$/.test(videoId)
      ? `https://www.youtube.com/embed/${videoId}`
      : null;
  } catch {
    return null;
  }
}
