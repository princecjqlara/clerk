// Vercel Edge Function — returns latest app version info
// Update VERSION and DOWNLOAD_URL each time you publish a new APK

const VERSION_CODE = 2;
const VERSION_NAME = "1.1.0";
const DOWNLOAD_URL = "https://github.com/princecjqlara/clerk/releases/latest/download/ai-receptionist.apk";
const RELEASE_NOTES = "Fixed: AI voice now plays to caller (not just local device). Improved call audio routing.";

export default function handler(req, res) {
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  res.json({
    versionCode: VERSION_CODE,
    versionName: VERSION_NAME,
    downloadUrl: DOWNLOAD_URL,
    releaseNotes: RELEASE_NOTES,
    forceUpdate: false,
  });
}
