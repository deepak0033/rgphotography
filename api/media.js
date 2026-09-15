export default async function handler(req, res) {
  try {
    const {
      GITHUB_TOKEN,
      GITHUB_OWNER,
      GITHUB_REPO,
      GITHUB_BRANCH
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(500).json({
        ok: false,
        error: "GitHub environment variables are not configured."
      });
    }

    const branch = GITHUB_BRANCH || "main";

    const allowedPrefixes = [
      "assets/images/baby/",
      "assets/images/maternity/",
      "assets/images/pre-wedding/",
      "assets/images/post-wedding/",
      "assets/images/weddings/",
      "assets/images/main-1.jpg",
      "assets/images/main-2.jpg",
      "assets/images/main-3.jpg",
      "assets/videos/"
    ];

    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".mp4",
      ".webm"
    ];

    function isAllowedPath(filePath) {
      if (typeof filePath !== "string") return false;

      const prefixOK = allowedPrefixes.some(prefix =>
        filePath.startsWith(prefix)
      );

      const extensionOK = allowedExtensions.some(ext =>
        filePath.toLowerCase().endsWith(ext)
      );

      return prefixOK && extensionOK;
    }

    function githubHeaders() {
      return {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json"
      };
    }

    async function getFile(path) {
      const url =
        `https://api.github.com/repos/` +
        `${encodeURIComponent(GITHUB_OWNER)}/` +
        `${encodeURIComponent(GITHUB_REPO)}/contents/` +
        `${path.split("/").map(encodeURIComponent).join("/")}` +
        `?ref=${encodeURIComponent(branch)}`;

      const response = await fetch(url, {
        headers: githubHeaders()
      });

      if (!response.ok) {
        const text = await response.text();

        throw new Error(
          `GitHub GET failed (${response.status}): ${text}`
        );
      }

      return response.json();
    }

    async function putFile(path, contentBase64, message, sha) {
      const url =
        `https://api.github.com/repos/` +
        `${encodeURIComponent(GITHUB_OWNER)}/` +
        `${encodeURIComponent(GITHUB_REPO)}/contents/` +
        `${path.split("/").map(encodeURIComponent).join("/")}`;

      const payload = {
        message,
        content: contentBase64,
        branch,
        sha
      };

      const response = await fetch(url, {
        method: "PUT",
        headers: githubHeaders(),
        body: JSON.stringify(payload)
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        throw new Error(
          `GitHub PUT failed (${response.status}): ` +
          (data.message || text)
        );
      }

      return data;
    }

    async function deleteFile(path, message, sha) {
      const url =
        `https://api.github.com/repos/` +
        `${encodeURIComponent(GITHUB_OWNER)}/` +
        `${encodeURIComponent(GITHUB_REPO)}/contents/` +
        `${path.split("/").map(encodeURIComponent).join("/")}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: githubHeaders(),
        body: JSON.stringify({
          message,
          branch,
          sha
        })
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        throw new Error(
          `GitHub DELETE failed (${response.status}): ` +
          (data.message || text)
        );
      }

      return data;
    }

    /* =========================
       GET
       Check whether API works
    ========================= */

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        connected: true,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        branch
      });
    }

    /* =========================
       POST
       Replace / Remove media
    ========================= */

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({
        ok: false,
        error: "Method not allowed."
      });
    }

    const body = req.body || {};

    const action = body.action;
    const path = body.path;

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "Missing action."
      });
    }

    if (!path || !isAllowedPath(path)) {
      return res.status(400).json({
        ok: false,
        error: "File path is not allowed.",
        path
      });
    }

    /* =========================
       REPLACE / UPLOAD
    ========================= */

    if (action === "replace" || action === "upload") {
      const content = body.content;

      if (!content) {
        return res.status(400).json({
          ok: false,
          error: "Missing Base64 file content."
        });
      }

      let current;

      try {
        current = await getFile(path);
      } catch (error) {
        if (action === "replace") {
          throw error;
        }

        current = null;
      }

      const result = await putFile(
        path,
        content,
        body.message ||
          `Admin: ${action} ${path}`,
        current?.sha
      );

      return res.status(200).json({
        ok: true,
        action,
        path,
        commit: result.commit?.sha || null,
        content: result.content?.path || path
      });
    }

    /* =========================
       REMOVE
    ========================= */

    if (action === "remove") {
      const current = await getFile(path);

      const result = await deleteFile(
        path,
        body.message ||
          `Admin: remove ${path}`,
        current.sha
      );

      return res.status(200).json({
        ok: true,
        action: "remove",
        path,
        commit: result.commit?.sha || null
      });
    }

    return res.status(400).json({
      ok: false,
      error: `Unknown action: ${action}`
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Server error."
    });
  }
}
